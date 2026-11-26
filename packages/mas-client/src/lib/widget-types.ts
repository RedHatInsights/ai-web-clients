/**
 * Wire types for the MAS widget/interaction protocol.
 *
 * These events arrive on the existing `GET /session.subscribe` NDJSON stream
 * alongside the text/progress events handled by `DefaultStreamingHandler`,
 * and are also returned by `GET /session.interactions` for state restoration
 * after a reconnect or page refresh.
 *
 * This package only consumes the protocol — it never renders a widget.
 * Rendering is the UI layer's job (e.g. `@redhat-cloud-services/mas-widget-registry`
 * in a React host). `WidgetEnvelope` below is shaped to match that package's
 * `WidgetEnvelope` contract exactly, so a consumer can pass it straight
 * through without remapping fields.
 */

/** Widget data embedded in every widget-related event. */
export interface WidgetEnvelope {
  type: 'widget';
  /** Stable identifier for this widget instance within one invocation. */
  widgetId: string;
  /** Widget name resolved against the host's widget registry (e.g. 'alert', 'multiple-choice'). */
  widget: string;
  schemaVersion: string;
  /**
   * Monotonically increasing per (invocation_id, widgetId). An incoming
   * revision that is equal to or lower than the stored one must be ignored —
   * this is how snapshot replays and live-stream duplicates are deduplicated.
   */
  revision: number;
  /**
   * The widget's configuration. Named `input` on the wire (matching the
   * catalog's input/output terminology). May contain function-call
   * placeholders for fields the UI host must resolve before rendering —
   * this package does not interpret `input`, it only transports it.
   */
  input: Record<string, unknown>;
}

/** Display-only widget — does not pause the agent or require user input. */
export interface WidgetUpsertedEvent {
  type: 'widget.upserted';
  event_id: string;
  execution_id: string;
  invocation_id: string;
  node_uid: string;
  payload: WidgetEnvelope;
  interaction: null;
}

export type InteractionStatus =
  | 'pending'
  | 'answered'
  | 'expired'
  | 'cancelled';

/**
 * Identifies one pending interaction between this client and the backend.
 * The widget's own rendering layer only renders and validates; it does not
 * define or own these identifiers.
 */
export interface InteractionIdentity {
  sessionId: string;
  executionId: string;
  interactionId: string;
  revision: number;
}

/** A validated answer to a pending interaction, ready to send to the backend. */
export interface InteractionReply extends InteractionIdentity {
  answer: Record<string, unknown>;
}

export interface InteractionRequest {
  key: string;
  prompt: string;
  answer_schema: Record<string, unknown>;
  timeout_seconds: number | null;
}

export interface InteractionState {
  interaction_id: string;
  revision: number;
  status: InteractionStatus;
  request: InteractionRequest;
  expires_at: string | null;
  answer: unknown;
}

/** Input widget — the requesting agent is paused awaiting an answer. */
export interface InteractionRequestedEvent {
  type: 'interaction.requested';
  event_id: string;
  execution_id: string;
  invocation_id: string;
  node_uid: string;
  payload: WidgetEnvelope | null;
  interaction: InteractionState;
}

/** Full-replacement status update for a previously requested interaction. */
export interface InteractionUpdatedEvent {
  type: 'interaction.updated';
  event_id: string;
  execution_id: string;
  invocation_id: string;
  node_uid: string;
  payload: WidgetEnvelope | null;
  interaction: InteractionState;
}

/** All event types returned by GET /session.interactions and on the stream. */
export type SessionInteractionEvent =
  | WidgetUpsertedEvent
  | InteractionRequestedEvent
  | InteractionUpdatedEvent;

export interface ReplyToInteractionResponse {
  interaction_id: string;
  status: InteractionStatus;
  revision: number;
}

// ─── Type guards ────────────────────────────────────────────────────────────

export function isWidgetUpsertedEvent(
  event: unknown
): event is WidgetUpsertedEvent {
  return (event as Record<string, unknown>)?.['type'] === 'widget.upserted';
}

export function isInteractionRequestedEvent(
  event: unknown
): event is InteractionRequestedEvent {
  return (
    (event as Record<string, unknown>)?.['type'] === 'interaction.requested'
  );
}

export function isInteractionUpdatedEvent(
  event: unknown
): event is InteractionUpdatedEvent {
  return (event as Record<string, unknown>)?.['type'] === 'interaction.updated';
}

/** True for any of the three widget/interaction stream packet types. */
export function isWidgetStreamEvent(
  event: unknown
): event is SessionInteractionEvent {
  const type = (event as Record<string, unknown>)?.['type'];
  return (
    type === 'widget.upserted' ||
    type === 'interaction.requested' ||
    type === 'interaction.updated'
  );
}
