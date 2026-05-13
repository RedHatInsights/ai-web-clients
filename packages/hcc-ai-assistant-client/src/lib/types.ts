import {
  IBaseClientConfig,
  IFetchFunction,
  AIClientError,
} from '@redhat-cloud-services/ai-client-common';

export interface HCCAIAssistantClientConfig extends IBaseClientConfig {
  baseUrl: string;
  fetchFunction?: IFetchFunction;
  provider?: string;
  model?: string;
  generateTopicSummary?: boolean;
}

export interface HCCAIAssistantRequest {
  query: string;
  provider?: string;
  model?: string;
  generate_topic_summary?: boolean;
  conversation_id?: string;
}

export interface HCCAIAssistantAPIResponse {
  conversation_id: string;
  response: string;
  rag_chunks: unknown[];
  referenced_documents: unknown[];
  truncated: boolean;
  input_tokens: number;
  output_tokens: number;
  available_quotas: Record<string, unknown>;
  tool_calls: unknown[];
  tool_results: unknown[];
}

export interface HCCAIAssistantConversationDetails {
  conversation_id: string;
  created_at: string | null;
  last_message_at: string | null;
  message_count: number | null;
  last_used_model: string | null;
  last_used_provider: string | null;
  topic_summary: string | null;
}

export interface HCCAIAssistantConversationsListResponse {
  conversations: HCCAIAssistantConversationDetails[];
}

export interface HCCAIAssistantMessage {
  content: string;
  type: 'user' | 'assistant' | 'system' | 'developer';
  referenced_documents?:
    | { doc_url?: string; doc_title?: string; source?: string }[]
    | null;
}

export interface HCCAIAssistantConversationTurn {
  messages: HCCAIAssistantMessage[];
  provider: string;
  model: string;
  started_at: string;
  completed_at: string;
}

export interface HCCAIAssistantConversationResponse {
  conversation_id: string;
  chat_history: HCCAIAssistantConversationTurn[];
}

export interface HCCAIAssistantAdditionalProperties
  extends Record<string, unknown> {
  referencedDocuments?: unknown[];
  truncated?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export class HCCAIAssistantUnauthorizedError extends AIClientError {
  constructor(message: string, details?: unknown) {
    super(401, 'Unauthorized', message, details);
    this.name = 'HCCAIAssistantUnauthorizedError';
  }
}

export class HCCAIAssistantValidationError extends AIClientError {
  constructor(message: string, validationDetails?: unknown) {
    super(422, 'Validation Error', message, validationDetails);
    this.name = 'HCCAIAssistantValidationError';
  }
}

export class HCCAIAssistantQuotaExceededError extends AIClientError {
  constructor(message: string, details?: unknown) {
    super(429, 'Quota Exceeded', message, details);
    this.name = 'HCCAIAssistantQuotaExceededError';
  }
}

export class HCCAIAssistantServerError extends AIClientError {
  constructor(status: number, message: string, serverDetails?: unknown) {
    super(status, 'Server Error', message, serverDetails);
    this.name = 'HCCAIAssistantServerError';
  }
}

export function extractErrorMessage(
  errorBody: unknown,
  fallback: string
): string {
  if (typeof errorBody !== 'object' || errorBody === null) {
    return fallback;
  }

  const body = errorBody as Record<string, unknown>;
  const detail = body['detail'];

  // Lightspeed Stack format: { detail: { response: "...", cause: "..." } }
  if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
    const detailObj = detail as Record<string, unknown>;
    if (typeof detailObj['response'] === 'string') {
      return detailObj['response'];
    }
  }

  // FastAPI validation format: { detail: [{ msg: "..." }] }
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = (detail[0] as Record<string, unknown>)?.['msg'];
    if (typeof msg === 'string') {
      return msg;
    }
  }

  if (typeof body['message'] === 'string') {
    return body['message'];
  }

  if (typeof body['error'] === 'string') {
    return body['error'];
  }

  return fallback;
}
