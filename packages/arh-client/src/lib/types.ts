// Core API Types generated from OpenAPI spec v0.4.9

export type Rating = 'positive' | 'negative';

export interface AnswerSource {
  link?: string | null;
  title?: string | null;
  score?: number | null;
  snippet?: string | null;
}

export interface ConversationHistoryMessage {
  message_id: string;
  input: string;
  answer: string;
  received_at: string;
  sources: AnswerSource[];
  tool_call_metadata?: ToolCallMetadata | null;
  output_guard_result?: OutputGuardResult | null;
}

export interface ConversationHistoryResponse {
  conversation_id: string;
  messages: ConversationHistoryMessage[];
}

export interface ConversationQuotaStatus {
  limit: number;
  used: number;
}

export interface MessageQuotaStatus {
  limit: number;
  used: number;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HealthCheck {
  status: string;
}

export interface MessageChunkResponse {
  conversation_id: string;
  message_id: string;
  answer: string;
  received_at: string;
  sources: AnswerSource[];
  tool_call_metadata?: ToolCallMetadata | null;
  output_guard_result?: OutputGuardResult | null;
}

export interface MessageFeedbackRequest {
  rating: Rating;
  predefined_response?: string;
  freeform?: string;
}

export interface MessageFeedbackResponse {
  message_id: string;
  input: string;
  answer: string;
  rating: Rating;
  received_at: string;
}

export interface MessageRequest {
  input: string;
  received_at?: string;
  stream?: boolean;
}

export interface NewConversationResponse {
  conversation_id: string;
  quota: ConversationQuotaStatus | null;
}

export interface OutputGuardResult {
  context_relevance?: number | null;
  answer_relevance?: number | null;
}

export interface QuotaStatusResponse {
  enabled: boolean;
  quota: ConversationQuotaStatus | MessageQuotaStatus | null;
}

export interface StatusChecks {
  ifd_services: Record<string, unknown>;
}

export interface ToolCallMetadata {
  tool_call?: boolean;
  tool_name?: string | null;
  tool_arguments?: Record<string, unknown> | null;
}

export interface UserHistoryItem {
  conversation_id: string;
  title: string;
  created_at: string;
  is_latest: boolean;
}

export type UserHistoryResponse = UserHistoryItem[];

export interface UserRequest {
  terms_acknowledged_at?: string | null;
  is_dark_theme?: boolean | null;
}

export interface UserResponse {
  user_id: string;
  terms_acknowledged_at: string | null;
  is_dark_theme: boolean;
}

// Error types
export class IFDApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'IFDApiError';
  }
}

export class IFDValidationError extends IFDApiError {
  constructor(public validationErrors: ValidationError[]) {
    super(
      422,
      'Validation Error',
      'Request validation failed',
      validationErrors
    );
    this.name = 'IFDValidationError';
  }
}

export type IFDAdditionalAttributes = {
  sources?: AnswerSource[];
  tool_call_metadata?: ToolCallMetadata | null | undefined;
  output_guard_result?: OutputGuardResult | null | undefined;
  quota?: MessageQuotaStatus;
};
