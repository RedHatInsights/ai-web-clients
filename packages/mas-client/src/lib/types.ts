// --- Session Creation ---

export interface CreateSessionRequest {
  blueprintId: string;
  metadata?: Record<string, unknown>;
  hitlEnabled?: boolean;
}

// --- Message Submission ---

export interface SubmitSessionRequest {
  sessionId: string;
  inputs: { user_prompt: string; [key: string]: unknown };
  scope?: 'public' | 'private';
}

export interface SubmitSessionResponse {
  sessionId: string;
  workflowId?: string;
}

// --- Chat Messages ---

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  tool_call_id?: string;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string | null;
  additional_kwargs?: Record<string, unknown> | null;
  sender_id?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionChatResponse {
  messages: ChatMessage[];
  output: string;
  status: SessionStatus;
  status_message?: string | null;
}

// --- Session List ---

export type SessionStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'LOCKED'
  | 'IN_USE';

export interface SessionListItem {
  session_id: string;
  metadata: Record<string, unknown>;
  started_at: string;
  last_active_at?: string;
  blueprint_id: string;
  blueprint_exists: boolean;
}

// --- Stream Status ---

export interface StreamStatusResponse {
  session_id: string;
  event_count: number;
  last_event_id?: string;
  is_active: boolean;
}

// --- Cancel ---

export interface CancelSessionResponse {
  sessionId: string;
  status: 'CANCELLED';
}

// --- Health ---

export interface HealthCheckResponse {
  status: string;
  message: string;
}

// --- Errors ---

export class MASApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MASApiError';
  }
}

export class MASValidationError extends MASApiError {
  constructor(message: string, data?: unknown) {
    super(422, 'Validation Error', message, data);
    this.name = 'MASValidationError';
  }
}

// --- Additional Attributes for state manager ---

export type MASAdditionalAttributes = {
  output?: string;
  status?: SessionStatus;
  status_message?: string | null;
};
