/**
 * Streaming event types from the Ansible Lightspeed API
 */
export type StreamingEventType = 'start' | 'token' | 'turn_complete' | 'end';

/**
 * Base streaming event structure
 */
export interface BaseStreamingEvent {
  event: StreamingEventType;
  data: Record<string, unknown>;
}

/**
 * Start event data
 */
export interface StartEventData {
  conversation_id: string;
}

/**
 * Token event data
 */
export interface TokenEventData {
  id: number;
  role: string;
  token: string;
}

/**
 * Turn complete event data
 */
export interface TurnCompleteEventData {
  id: number;
  token: string;
}

export type ReferencedDocument = {
  doc_title: string;
  doc_url: string;
};

/**
 * End event data
 */
export interface EndEventData {
  referenced_documents: ReferencedDocument[];
  truncated: unknown;
  input_tokens: number;
  output_tokens: number;
  available_quotas?: Record<string, unknown>;
}

/**
 * Streaming events with typed data
 */
export interface StartEvent {
  event: 'start';
  data: StartEventData;
}

export interface TokenEvent {
  event: 'token';
  data: TokenEventData;
}

export interface TurnCompleteEvent {
  event: 'turn_complete';
  data: TurnCompleteEventData;
}

export interface EndEvent {
  event: 'end';
  data: EndEventData;
}

export type MessageEvent = {
  event: 'message';
  data: TokenEventData & EndEventData;
};

/**
 * Union type for all streaming events
 */
export type StreamingEvent =
  | StartEvent
  | TokenEvent
  | TurnCompleteEvent
  | EndEvent
  | MessageEvent;

/**
 * Type guard for TokenEvent
 */
export function isTokenEvent(event: StreamingEvent): event is TokenEvent {
  return event.event === 'token';
}

export function isEndEvent(event: StreamingEvent): event is EndEvent {
  return event.event === 'end';
}

/**
 * Handler function for processing streaming events
 */
export type StreamingEventHandler = (event: StreamingEvent) => void;

/**
 * Options for processing streams
 */
export interface StreamProcessingOptions {
  onEvent?: StreamingEventHandler;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}
