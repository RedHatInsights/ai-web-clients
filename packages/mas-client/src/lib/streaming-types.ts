/**
 * NDJSON stream event types from MAS session.subscribe endpoint
 */
export type StreamEventType =
  | 'heartbeat'
  | 'field_update'
  | 'complete'
  | 'stream_end'
  | 'stream_error'
  | 'approval_required'
  | 'llm_token'
  | 'tool_calling'
  | 'tool_result'
  | 'workplan_snapshot';

export interface StreamEvent {
  type: StreamEventType;
  node?: string;
  display_name?: string;
  chunk?: string;
  field?: string;
  value?: string;
  state?: {
    user_prompt?: string;
    messages?: unknown[];
    output?: string;
  };
  error?: string;
  // Approval fields
  request_id?: string;
  approval_type?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_description?: string;
  reasoning?: string;
}

export const isEmpty = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};
