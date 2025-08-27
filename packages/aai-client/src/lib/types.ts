// Core AAI types to prevent circular imports

// AAI-specific additional attributes based on SSE events
export type AAIAdditionalAttributes = {
  start_event?: {
    conversation_id?: string;
  };
  token_event?: {
    id?: number;
    role?: 'inference' | 'tool_execution';
    token?: string;
  };
  tool_call_event?: {
    id?: number;
    role?: 'inference' | 'tool_execution';
    token?: string;
  };
  tool_call_events?: Array<Record<string, unknown>>;
  turn_complete_event?: {
    id?: number;
    token?: string;
  };
  end_event?: {
    referenced_documents?: Array<{
      doc_url: string;
      doc_title: string;
    }>;
    input_tokens?: number;
    output_tokens?: number;
    available_quotas?: Record<string, unknown>;
  };
  referenced_documents?: Array<{
    doc_url: string;
    doc_title: string;
  }>;
  input_tokens?: number;
  output_tokens?: number;
  available_quotas?: Record<string, unknown>;
  // Allow for additional dynamic attributes
  [key: string]: unknown;
};

// AAI-specific request body interface - extensible with known required fields
export interface AAIRequestBody extends Record<string, unknown> {
  media_type?: string;
  model: string;
  provider: string;
  query: string;
  conversation_id?: string; // Optional in the request body - will be set by the client
}

// Server-Sent Events types for AAI streaming
export interface AAISSEEvent {
  event: 'start' | 'token' | 'tool_call' | 'turn_complete' | 'end' | 'error';
  data: Record<string, unknown>;
}