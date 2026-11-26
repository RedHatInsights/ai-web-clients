/**
 * Pure utility functions for the widget store Map.
 *
 * The store deduplicates widget instances by composite key
 * (execution_id + invocation_id + widgetId). Display content (`envelope`) and
 * HITL interaction state (`interaction`) are versioned independently — each
 * is deduplicated against its own revision counter, since the backend
 * documents them as independent (a widget's display revision can stay at 1
 * while its interaction goes pending -> answered).
 *
 * No framework dependency here — this is transport-layer bookkeeping, not a
 * UI concern. A host application (e.g. a React chat client) owns turning
 * `StoredWidgetInstance.envelope` into an actual rendered widget.
 */

import type {
  InteractionRequestedEvent,
  InteractionState,
  InteractionUpdatedEvent,
  SessionInteractionEvent,
  WidgetEnvelope,
  WidgetUpsertedEvent,
} from './widget-types';

export interface StoredInteractionState {
  interactionId: string;
  revision: number;
  status: InteractionState['status'];
  request: InteractionState['request'];
  expiresAt: string | null;
  answer: unknown;
}

export interface StoredWidgetInstance {
  key: string;
  executionId: string;
  invocationId: string;
  widgetId: string;
  /** Display content revision (`envelope.revision`). */
  revision: number;
  /** Shape a UI host can pass directly to a widget renderer. */
  envelope: WidgetEnvelope;
  /** Present only when this widget instance is (or was) a HITL interaction. */
  interaction?: StoredInteractionState;
}

export type WidgetStore = Map<string, StoredWidgetInstance>;

export function createWidgetStore(): WidgetStore {
  return new Map();
}

function makeStoreKey(
  executionId: string,
  invocationId: string,
  widgetId: string
): string {
  return `${executionId}::${invocationId}::${widgetId}`;
}

function toStoredEnvelope(payload: WidgetEnvelope): WidgetEnvelope {
  return {
    type: 'widget',
    widgetId: payload.widgetId,
    widget: payload.widget,
    schemaVersion: payload.schemaVersion,
    revision: payload.revision,
    // Defensive fallback: an untrusted stream payload with a missing/
    // malformed `input` must degrade to "no fields", never to `undefined` —
    // downstream consumers (e.g. a widget renderer) assume an object and
    // must not crash over a bad payload.
    input:
      payload.input && typeof payload.input === 'object' ? payload.input : {},
  };
}

function toStoredInteractionState(
  interaction: InteractionState
): StoredInteractionState {
  return {
    interactionId: interaction.interaction_id,
    revision: interaction.revision,
    status: interaction.status,
    request: interaction.request,
    expiresAt: interaction.expires_at,
    answer: interaction.answer,
  };
}

/**
 * Upserts one widget instance's display content and/or interaction state.
 * This is the single write path every event type funnels through — a plain
 * `widget.upserted` only ever carries `payload`; `interaction.requested` /
 * `interaction.updated` carry both. Each facet is revision-checked on its
 * own, so an interaction status change doesn't require a new display
 * revision (and vice versa).
 *
 * Returns true if the store changed.
 */
function upsertStoreEntry(
  store: WidgetStore,
  params: {
    executionId: string;
    invocationId: string;
    payload: WidgetEnvelope | null;
    interaction?: InteractionState;
  }
): boolean {
  const { executionId, invocationId, payload, interaction } = params;
  if (!payload) return false; // nothing to key a store entry on (no widgetId)

  const key = makeStoreKey(executionId, invocationId, payload.widgetId);
  let existing = store.get(key);
  let changed = false;

  if (!existing) {
    existing = {
      key,
      executionId,
      invocationId,
      widgetId: payload.widgetId,
      revision: payload.revision,
      envelope: toStoredEnvelope(payload),
    };
    store.set(key, existing);
    changed = true;
  } else if (payload.revision > existing.revision) {
    existing.revision = payload.revision;
    existing.envelope = toStoredEnvelope(payload);
    changed = true;
  }

  if (
    interaction &&
    (!existing.interaction ||
      interaction.revision > existing.interaction.revision)
  ) {
    existing.interaction = toStoredInteractionState(interaction);
    changed = true;
  }

  return changed;
}

/** Applies a single `widget.upserted` event to the store. */
export function applyWidgetUpserted(
  store: WidgetStore,
  event: WidgetUpsertedEvent
): boolean {
  return upsertStoreEntry(store, {
    executionId: event.execution_id,
    invocationId: event.invocation_id,
    payload: event.payload,
  });
}

/**
 * Applies an `interaction.requested` / `interaction.updated` event.
 *
 * If `payload` is null the backend wants a generic prompt/answer-schema form
 * rendered instead of a named widget — this store leaves that a no-op, same
 * as a plain display widget with no payload: there is nothing to key a store
 * entry on.
 */
export function applyInteractionEvent(
  store: WidgetStore,
  event: InteractionRequestedEvent | InteractionUpdatedEvent
): boolean {
  return upsertStoreEntry(store, {
    executionId: event.execution_id,
    invocationId: event.invocation_id,
    payload: event.payload,
    interaction: event.interaction,
  });
}

/** Applies a single stream/restore event, routing by its `type`. */
export function applySessionInteractionEvent(
  store: WidgetStore,
  event: SessionInteractionEvent
): boolean {
  return event.type === 'widget.upserted'
    ? applyWidgetUpserted(store, event)
    : applyInteractionEvent(store, event);
}

/**
 * Applies a batch of session interaction events — from GET /session.interactions
 * or buffered stream events. Returns true if any entry changed.
 */
export function applySessionInteractionEvents(
  store: WidgetStore,
  events: SessionInteractionEvent[]
): boolean {
  let changed = false;
  for (const event of events) {
    if (applySessionInteractionEvent(store, event)) changed = true;
  }
  return changed;
}

/**
 * Returns widget instances from the store, optionally scoped to one
 * execution.
 *
 * Omit `executionId` only when the store is known to hold a single
 * execution's worth of widgets (e.g. a store scoped to one `sendMessage`
 * call). For a store spanning several executions, pass `executionId` so
 * widgets from one turn don't leak onto another — per the backend's
 * turn-mapping contract (a message's `execution_id` == event's
 * `execution_id` means "same conversation turn").
 */
export function extractWidgetInstances(
  store: WidgetStore,
  executionId?: string
): StoredWidgetInstance[] {
  const all = Array.from(store.values());
  return executionId
    ? all.filter((instance) => instance.executionId === executionId)
    : all;
}

/**
 * Extracts the unique execution IDs present across a set of persisted
 * messages carrying an `execution_id` in their metadata. Messages without one
 * are skipped — per the backend contract their widget association is
 * unknown and must not be guessed (e.g. by assigning them the session's
 * latest execution ID).
 */
export function extractMessageExecutionIds(
  messages: Array<{ metadata?: Record<string, unknown> }>
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const executionId = message.metadata?.['execution_id'];
    if (typeof executionId === 'string' && executionId) ids.add(executionId);
  }
  return Array.from(ids);
}
