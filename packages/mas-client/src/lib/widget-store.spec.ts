import {
  applyInteractionEvent,
  applySessionInteractionEvents,
  applyWidgetUpserted,
  createWidgetStore,
  extractMessageExecutionIds,
  extractWidgetInstances,
} from './widget-store';
import type {
  InteractionRequestedEvent,
  InteractionUpdatedEvent,
  WidgetUpsertedEvent,
} from './widget-types';

const widgetUpserted = (
  overrides: Partial<WidgetUpsertedEvent> = {}
): WidgetUpsertedEvent => ({
  type: 'widget.upserted',
  event_id: 'evt-1',
  execution_id: 'exec-1',
  invocation_id: 'inv-1',
  node_uid: 'node-1',
  payload: {
    type: 'widget',
    widgetId: 'w1',
    widget: 'alert',
    schemaVersion: '1',
    revision: 1,
    input: { message: 'hi' },
  },
  interaction: null,
  ...overrides,
});

const interactionRequested = (
  overrides: Partial<InteractionRequestedEvent> = {}
): InteractionRequestedEvent => ({
  type: 'interaction.requested',
  event_id: 'evt-2',
  execution_id: 'exec-1',
  invocation_id: 'inv-1',
  node_uid: 'node-1',
  payload: {
    type: 'widget',
    widgetId: 'w2',
    widget: 'multiple-choice',
    schemaVersion: '1',
    revision: 1,
    input: { title: 'Pick one' },
  },
  interaction: {
    interaction_id: 'int-1',
    revision: 1,
    status: 'pending',
    request: {
      key: 'choice',
      prompt: 'Pick one',
      answer_schema: {},
      timeout_seconds: null,
    },
    expires_at: null,
    answer: null,
  },
  ...overrides,
});

describe('widget-store', () => {
  describe('applyWidgetUpserted', () => {
    it('inserts a new widget instance and reports a change', () => {
      const store = createWidgetStore();
      const changed = applyWidgetUpserted(store, widgetUpserted());

      expect(changed).toBe(true);
      expect(store.size).toBe(1);
      const instance = extractWidgetInstances(store)[0];
      expect(instance.widgetId).toBe('w1');
      expect(instance.envelope.input).toEqual({ message: 'hi' });
    });

    it('ignores a duplicate/stale revision', () => {
      const store = createWidgetStore();
      applyWidgetUpserted(store, widgetUpserted());

      const changed = applyWidgetUpserted(
        store,
        widgetUpserted({
          payload: {
            type: 'widget',
            widgetId: 'w1',
            widget: 'alert',
            schemaVersion: '1',
            revision: 1,
            input: { message: 'stale replay' },
          },
        })
      );

      expect(changed).toBe(false);
      expect(extractWidgetInstances(store)[0].envelope.input).toEqual({
        message: 'hi',
      });
    });

    it('applies a higher revision as an update', () => {
      const store = createWidgetStore();
      applyWidgetUpserted(store, widgetUpserted());

      const changed = applyWidgetUpserted(
        store,
        widgetUpserted({
          payload: {
            type: 'widget',
            widgetId: 'w1',
            widget: 'alert',
            schemaVersion: '1',
            revision: 2,
            input: { message: 'updated' },
          },
        })
      );

      expect(changed).toBe(true);
      expect(extractWidgetInstances(store)[0].revision).toBe(2);
      expect(extractWidgetInstances(store)[0].envelope.input).toEqual({
        message: 'updated',
      });
    });

    it('defaults a malformed input to an empty object rather than crashing', () => {
      const store = createWidgetStore();
      applyWidgetUpserted(
        store,
        widgetUpserted({
          payload: {
            type: 'widget',
            widgetId: 'w1',
            widget: 'alert',
            schemaVersion: '1',
            revision: 1,
            input: null as unknown as Record<string, unknown>,
          },
        })
      );

      expect(extractWidgetInstances(store)[0].envelope.input).toEqual({});
    });
  });

  describe('applyInteractionEvent', () => {
    it('tracks interaction state independently of the display revision', () => {
      const store = createWidgetStore();
      applyInteractionEvent(store, interactionRequested());

      const instance = extractWidgetInstances(store)[0];
      expect(instance.interaction).toMatchObject({
        interactionId: 'int-1',
        status: 'pending',
        revision: 1,
      });

      // A status transition (pending -> answered) with the *same* display
      // revision must still be picked up, since each facet is versioned on
      // its own.
      const { type: _type, ...rest } = interactionRequested({
        interaction: {
          interaction_id: 'int-1',
          revision: 2,
          status: 'answered',
          request: {
            key: 'choice',
            prompt: 'Pick one',
            answer_schema: {},
            timeout_seconds: null,
          },
          expires_at: null,
          answer: { selected: 'A' },
        },
      });
      const updatedEvent: InteractionUpdatedEvent = {
        ...rest,
        type: 'interaction.updated',
      };
      const changed = applyInteractionEvent(store, updatedEvent);

      expect(changed).toBe(true);
      const updated = extractWidgetInstances(store)[0];
      expect(updated.interaction).toMatchObject({
        status: 'answered',
        revision: 2,
        answer: { selected: 'A' },
      });
      // Display revision untouched by the interaction-only update.
      expect(updated.revision).toBe(1);
    });

    it('is a no-op when payload is null (widget-less interaction, not yet supported)', () => {
      const store = createWidgetStore();
      const changed = applyInteractionEvent(
        store,
        interactionRequested({ payload: null })
      );

      expect(changed).toBe(false);
      expect(store.size).toBe(0);
    });
  });

  describe('applySessionInteractionEvents', () => {
    it('applies a mixed batch and scopes extraction by executionId', () => {
      const store = createWidgetStore();
      const changed = applySessionInteractionEvents(store, [
        widgetUpserted({ execution_id: 'exec-1' }),
        widgetUpserted({
          execution_id: 'exec-2',
          payload: {
            type: 'widget',
            widgetId: 'w3',
            widget: 'status',
            schemaVersion: '1',
            revision: 1,
            input: {},
          },
        }),
      ]);

      expect(changed).toBe(true);
      expect(extractWidgetInstances(store)).toHaveLength(2);
      expect(extractWidgetInstances(store, 'exec-1')).toHaveLength(1);
      expect(extractWidgetInstances(store, 'exec-2')).toHaveLength(1);
    });
  });

  describe('extractMessageExecutionIds', () => {
    it('collects unique execution ids and skips messages without one', () => {
      const ids = extractMessageExecutionIds([
        { metadata: { execution_id: 'exec-1' } },
        { metadata: { execution_id: 'exec-1' } },
        { metadata: { execution_id: 'exec-2' } },
        { metadata: {} },
        {},
      ]);

      expect(ids.sort()).toEqual(['exec-1', 'exec-2']);
    });
  });
});
