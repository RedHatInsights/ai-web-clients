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

// ====================
// JSON Streaming Event Types
// ====================

/**
 * Base streaming event structure for JSON responses
 * Based on actual server event analysis
 */
export interface BaseStreamingEvent {
  event: string;
  data?: any;
  [key: string]: any; // Allow additional fields
}

/**
 * Start event data structure
 */
export interface StartEventData {
  conversation_id: string;
}

/**
 * Token event data structure
 */
export interface TokenEventData {
  id: number;
  token: string;
}

/**
 * End event data structure
 */
export interface EndEventData {
  referenced_documents: ReferencedDocument[];
  truncated: boolean;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Specific streaming events with typed data
 */
export interface StartEvent {
  event: 'start';
  data: StartEventData;
}

export interface TokenEvent {
  event: 'token';
  data: TokenEventData;
}

export interface EndEvent {
  event: 'end';
  data: EndEventData;
  available_quotas: Record<string, unknown>;
}

export interface AssistantAnswerEvent {
  event: 'assistant_answer';
  answer: string;
  conversation_id: string;
  user: string;
}

export interface ToolCallEvent {
  event: 'tool_call';
  tool_name: string;
  arguments: Record<string, unknown>;
  tool_id: string;
}

export interface ToolResultEvent {
  event: 'tool_result';
  tool_id: string;
  status: string;
  output_snippet: string;
}

export interface UserQuestionEvent {
  event: 'user_question';
  question: string;
  user: string;
  conversation_id: string;
}

export interface ErrorEvent {
  event: 'error';
  data: {
    status_code: number;
    response: string;
    cause: string;
  };
}

/**
 * Union type for all streaming events
 */
export type StreamingEvent =
  | StartEvent
  | TokenEvent
  | EndEvent
  | AssistantAnswerEvent
  | ToolCallEvent
  | ToolResultEvent
  | UserQuestionEvent
  | ErrorEvent;

/**
 * Type guards for streaming events
 */
export function isTokenEvent(event: BaseStreamingEvent): event is TokenEvent {
  return event.event === 'token';
}

export function isStartEvent(event: BaseStreamingEvent): event is StartEvent {
  return event.event === 'start';
}

export function isEndEvent(event: BaseStreamingEvent): event is EndEvent {
  return event.event === 'end';
}

export function isAssistantAnswerEvent(
  event: BaseStreamingEvent
): event is AssistantAnswerEvent {
  return event.event === 'assistant_answer';
}

export function isErrorEvent(event: BaseStreamingEvent): event is ErrorEvent {
  return event.event === 'error';
}
