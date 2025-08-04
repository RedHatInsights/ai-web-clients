import {
  AIClientError,
  AIClientValidationError,
} from '@redhat-cloud-services/ai-client-common';

/**
 * Lightspeed API specific error class
 */
export class LightspeedClientError extends AIClientError {
  constructor(
    status: number,
    statusText: string,
    message: string,
    public readonly response?: Response
  ) {
    super(status, statusText, message, response);
    this.name = 'LightspeedClientError';
  }
}

/**
 * Lightspeed API validation error class
 */
export class LightspeedValidationError extends AIClientValidationError {
  constructor(
    validationErrors: Array<{
      loc: (string | number)[];
      msg: string;
      type: string;
    }>
  ) {
    super(validationErrors);
    this.name = 'LightspeedValidationError';
  }
}

// ====================
// Based on Lightspeed OpenAPI Spec - Exact Match
// ====================

/**
 * Attachment that can be sent as part of a query request
 * Matches OpenAPI spec exactly
 */
export interface Attachment {
  attachment_type: string;
  content_type: string;
  content: string;
}

/**
 * LLM Request payload for Lightspeed API
 * Matches OpenAPI spec exactly
 */
export interface LLMRequest {
  query: string;
  conversation_id?: string | null;
  provider?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  attachments?: Attachment[] | null;
  media_type?: string | null;
}

/**
 * Referenced document in LLM response
 * Matches OpenAPI spec exactly
 */
export interface ReferencedDocument {
  doc_url: string;
  doc_title: string;
}

/**
 * LLM Response from Lightspeed API
 * Matches OpenAPI spec exactly
 */
export interface LLMResponse {
  conversation_id: string;
  response: string;
  referenced_documents: ReferencedDocument[];
  truncated: boolean;
  input_tokens: number;
  output_tokens: number;
  available_quotas: Record<string, number>;
  tool_calls: unknown[];
  tool_results: unknown[];
}

/**
 * Feedback request for user feedback
 * Matches OpenAPI spec exactly
 */
export interface FeedbackRequest {
  conversation_id: string;
  user_question: string;
  llm_response: string;
  sentiment?: number | null;
  user_feedback?: string | null;
}

/**
 * Feedback response
 * Matches OpenAPI spec exactly
 */
export interface FeedbackResponse {
  response: string;
}

/**
 * Status response for feedback functionality
 * Matches OpenAPI spec exactly
 */
export interface StatusResponse {
  functionality: string;
  status: Record<string, unknown>;
}

/**
 * Authorization response
 * Matches OpenAPI spec exactly
 */
export interface AuthorizationResponse {
  user_id: string;
  username: string;
  skip_user_id_check: boolean;
}

/**
 * Readiness response
 * Matches OpenAPI spec exactly
 */
export interface ReadinessResponse {
  ready: boolean;
  reason: string;
}

/**
 * Liveness response
 * Matches OpenAPI spec exactly
 */
export interface LivenessResponse {
  alive: boolean;
}

// ====================
// Error Response Types from OpenAPI Spec
// ====================

/**
 * Unauthorized response (401)
 */
export interface UnauthorizedResponse {
  detail: string;
}

/**
 * Forbidden response (403)
 */
export interface ForbiddenResponse {
  detail: string;
}

/**
 * Prompt too long response (413)
 */
export interface PromptTooLongResponse {
  detail: Record<string, string>;
}

/**
 * Error response (500)
 */
export interface ErrorResponse {
  detail: Record<string, string>;
}

/**
 * Not available response (503)
 */
export interface NotAvailableResponse {
  detail: Record<string, string>;
}

/**
 * HTTP Validation Error (422)
 */
export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}

// ====================
// Client-specific types for common interface compatibility
// ====================

/**
 * Health check response for common interface compatibility
 */
export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  ready: boolean;
  alive: boolean;
  reason: string;
  timestamp: string;
}

/**
 * Message chunk response for streaming
 * Uses 'answer' field to match state manager expectations
 */
export interface MessageChunkResponse {
  answer?: string;
  error?: string;
  finished?: boolean;
  conversation_id?: string;
  messageId?: string;
  [key: string]: unknown;
}

export type LightSpeedCoreAdditionalProperties = {
  referencedDocuments?: ReferencedDocument[];
  truncated?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  availableQuotas?: Record<string, number>;
  toolCalls?: unknown[];
  toolResults?: unknown[];
};
