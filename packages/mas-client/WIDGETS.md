# Widget / HITL interaction support in `mas-client`

This document covers the MAS **widgets** feature: how the backend pushes
rich, interactive UI elements (and the human-in-the-loop interactions some of
them require) over the existing session stream, and what `mas-client`
specifically does — and does not do — to support it.

It mirrors the protocol design used in `uie-mas-ui`, adapted to this package's
role as the transport/infra layer shared across chat clients, not a single
React app.

## Where this fits

`mas-client` is a thin, framework-agnostic client for the MAS session API. It
has no opinion about UI frameworks and never renders anything. Its job for
widgets is the same as for everything else it does: talk to the backend,
parse the wire protocol, keep track of state, and expose that state to
whatever is consuming the client (a state manager, a React hook, another
client package) so *that* layer can decide what to render.

```
Backend (MAS)  →  mas-client (this package)  →  host app (e.g. a chat UI)
                     - parses widget/interaction            - owns rendering
                       stream packets                        (e.g. via
                     - tracks revisions, dedupes             @redhat-cloud-services/
                       replays                                mas-widget-registry)
                     - exposes fetch/reply APIs             - decides when to
                     - surfaces "a widget arrived"             call replyToInteraction
                       via additionalAttributes
```

Concretely: `astro-virtual-assistant-frontend` (or any other host) will
consume `mas-client` (directly or through `ai-client-state`), watch for
`widgets` / `hasPendingInteraction` on stream chunks, and hand the resulting
`WidgetEnvelope` to its own widget renderer. That renderer is out of scope
for this package by design.

## The protocol, in brief

Three packet types can arrive on the existing `GET /session.subscribe`
NDJSON stream, interleaved with the regular `llm_token` / `tool_calling` /
`complete` events `DefaultStreamingHandler` already understood:

| `type` | Meaning |
|---|---|
| `widget.upserted` | Display-only widget. Does not pause the agent or require an answer. |
| `interaction.requested` | The agent is paused, waiting for a human answer to a widget. |
| `interaction.updated` | Full-replacement status update for a previously requested interaction (e.g. `pending` → `answered`/`expired`/`cancelled`). |

All three carry a `WidgetEnvelope` under `payload` — `{ type: 'widget',
widgetId, widget, schemaVersion, revision, input }` — shaped to match
`@redhat-cloud-services/mas-widget-registry`'s own `WidgetEnvelope` contract
exactly, so a host can pass it straight into that package's renderer without
remapping fields. `interaction.*` events additionally carry an
`InteractionState` describing the pending/resolved HITL request.

The same three event shapes are also returned by `GET
/session.interactions`, used to restore widget state after a reconnect, page
refresh, or once a session reaches a terminal status — the live stream and
this restore path feed the same store.

Revisions matter: each widget's **display** content and its **interaction**
state are versioned independently (a widget can stay at display revision 1
while its interaction goes `pending` → `answered`). An incoming revision
that is equal to or lower than the one already stored must be ignored — this
is how snapshot replays and live-stream duplicates get deduplicated.

### Answering an interaction

Once a host's widget renderer validates the user's answer, it hands back a
ready `InteractionReply`:

```
{ sessionId, executionId, interactionId, revision, answer }
```

`mas-client` does not validate `answer` against the widget's schema — that
validation belongs to the widget renderer, which owns the per-widget
contracts. `mas-client`'s job is just to ship the reply:

```
POST /session.interaction.reply  →  replyToInteraction(reply)
```

## What was added to this codebase

| File | What it adds |
|---|---|
| `src/lib/widget-types.ts` | The wire types: `WidgetEnvelope`, `WidgetUpsertedEvent`, `InteractionState`/`InteractionRequest`, `InteractionIdentity`/`InteractionReply`, `InteractionRequestedEvent`/`InteractionUpdatedEvent`, `SessionInteractionEvent` (the union), `ReplyToInteractionResponse`, and type guards (`isWidgetUpsertedEvent`, `isInteractionRequestedEvent`, `isInteractionUpdatedEvent`, `isWidgetStreamEvent`). |
| `src/lib/widget-store.ts` | A pure, framework-agnostic `Map`-based store that applies stream/restore events, deduplicates by revision (display and interaction tracked independently), and extracts widget instances — optionally scoped to one `executionId` so widgets from one conversation turn don't leak onto another. No React, no rendering — importable by any host. |
| `src/lib/types.ts` | `MASAdditionalAttributes` gained two fields: `widgets?: StoredWidgetInstance[]` and `hasPendingInteraction?: boolean`. |
| `src/lib/client.ts` | Two new `MASClient` methods: `getSessionInteractions(sessionId, executionId?)` (`GET /api/sessions/session.interactions`) and `replyToInteraction(reply)` (`POST /api/sessions/session.interaction.reply`). |
| `src/lib/default-streaming-handler.ts` | The NDJSON loop now recognizes widget/interaction packets separately from the existing `StreamEventType` union, applies them to a per-turn `WidgetStore`, and merges `widgets` / `hasPendingInteraction` into **every** emitted chunk's `additionalAttributes` (same pattern already used for `activeAgents`). The text stream is never paused for a widget/interaction event — the agent may keep emitting tokens until the backend itself decides to pause. |
| `src/lib/index.ts` | Exports the two new modules. |

Nothing about `sendMessage`'s public signature changed — widgets are purely
additive data riding on the existing `additionalAttributes` channel that
`ai-client-state` already forwards to subscribers.

## Using it

### Watching for widgets during a live turn

```typescript
import { MASClient } from '@redhat-cloud-services/mas-client';

const client = new MASClient({ baseUrl, blueprintId });

await client.sendMessage(conversationId, 'Which product are you using?', {
  stream: true,
  handleChunk: (chunk) => {
    if (chunk.additionalAttributes.widgets?.length) {
      // A widget/interaction packet arrived — render is expected.
      renderWidgets(chunk.additionalAttributes.widgets);
    }
    if (chunk.additionalAttributes.hasPendingInteraction) {
      // The agent is paused awaiting a reply — e.g. disable the composer.
    }
  },
});
```

`widgets` is only present once at least one widget/interaction packet has
arrived on that turn — an ordinary text-only turn never gets the field at
all, so existing consumers that ignore `additionalAttributes.widgets` see no
change in behavior.

### Replying to a pending interaction

```typescript
await client.replyToInteraction({
  sessionId: conversationId,
  executionId: widget.executionId,
  interactionId: widget.interaction!.interactionId,
  revision: widget.interaction!.revision,
  answer: { selected: 'OpenShift Container Platform' },
});
```

Replies are idempotent while the execution still accepts them — retrying
with the exact same body on a network error/5xx is safe. A `409` means the
answer was invalid, the request is stale/resolved, or the execution ended;
refetch saved state with `getSessionInteractions` rather than retrying
blindly.

### Restoring widget state after a reconnect

```typescript
import {
  createWidgetStore,
  applySessionInteractionEvents,
  extractWidgetInstances,
} from '@redhat-cloud-services/mas-client';

const store = createWidgetStore();
const events = await client.getSessionInteractions(sessionId, executionId);
applySessionInteractionEvents(store, events);
const widgets = extractWidgetInstances(store, executionId);
```

A host that needs widget state across more than one `sendMessage` call (e.g.
restoring a whole session's worth of turns) owns its own long-lived
`WidgetStore` and feeds it from both `getSessionInteractions` and the
`widgets` it reads off stream chunks — `DefaultStreamingHandler`'s internal
store is scoped to a single turn, the same way `activeAgents` already is.

## What is intentionally *not* here

- **No rendering.** No `WidgetRenderer`, no React, no widget catalog. That is
  `@redhat-cloud-services/mas-widget-registry`'s job in a UI host.
- **No function-call resolution.** Some widgets' `input` fields can be a
  `{ function, args }` placeholder the backend wants resolved client-side
  before rendering (see `uie-mas-ui`'s `widget-function-calls.ts`). Detecting
  and resolving those placeholders is a UI-host concern — `mas-client`
  transports `input` opaquely and never interprets it.
- **No answer-schema validation.** The widget renderer validates the user's
  answer against the widget's own `outputSchema` before ever calling back;
  `mas-client` ships whatever `InteractionReply` it's given.

## Tests

See `src/lib/widget-store.spec.ts` for the store's dedup/revision behavior,
and the `sendMessage (streaming) — widgets` and `getSessionInteractions` /
`replyToInteraction` blocks in `src/lib/mas-client.spec.ts` for the client
and streaming-handler integration.
