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
// Based on Lightspeed OpenAPI Spec v0.2.0 - Updated with Real API Testing
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
 * LLM Request payload for Lightspeed API (Query Request)
 * Updated with new OpenAPI spec v0.2.0 fields
 */
export interface LLMRequest {
  query: string;
  conversation_id?: string | null;
  provider?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  attachments?: Attachment[] | null;
  no_tools?: boolean | null;
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
 * Feedback categories enum from OpenAPI spec
 */
export enum FeedbackCategory {
  INCORRECT = 'incorrect',
  NOT_RELEVANT = 'not_relevant',
  INCOMPLETE = 'incomplete',
  OUTDATED_INFORMATION = 'outdated_information',
  UNSAFE = 'unsafe',
  OTHER = 'other',
}

/**
 * Feedback request for user feedback
 * Updated with categories field from OpenAPI spec v0.2.0
 */
export interface FeedbackRequest {
  conversation_id: string;
  user_question: string;
  llm_response: string;
  sentiment?: number | null;
  user_feedback?: string | null;
  categories?: FeedbackCategory[] | null;
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
  // Conversation metadata fields for conversation history
  conversationId?: string;
  messageCount?: number;
  lastUsedModel?: string;
  lastUsedProvider?: string;
  lastMessageAt?: string;
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
  data: {
    id: number;
    role: string;
    token: unknown;
  };
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

export function isToolCallEvent(
  event: BaseStreamingEvent
): event is ToolCallEvent {
  return event.event === 'tool_call';
}

export function isErrorEvent(event: BaseStreamingEvent): event is ErrorEvent {
  return event.event === 'error';
}

// ====================
// New API Endpoints Types (OpenAPI v0.2.0)
// ====================

/**
 * Service information response (/v1/info)
 */
export interface InfoResponse {
  name: string;
  service_version: string;
  llama_stack_version: string;
}

/**
 * Model information structure
 */
export interface Model {
  identifier: string;
  metadata: Record<string, unknown>;
  api_model_type: string;
  provider_id: string;
  provider_resource_id: string;
  type: string;
  model_type: string;
}

/**
 * Models response (/v1/models)
 */
export interface ModelsResponse {
  models: Model[];
}

/**
 * Service configuration structures
 */
export interface TLSConfiguration {
  tls_certificate_path: string | null;
  tls_key_path: string | null;
  tls_key_password: string | null;
}

export interface CORSConfiguration {
  allow_origins: string[];
  allow_credentials: boolean;
  allow_methods: string[];
  allow_headers: string[];
}

export interface ServiceConfiguration {
  host: string;
  port: number;
  auth_enabled: boolean;
  workers: number;
  color_log: boolean;
  access_log: boolean;
  tls_config: TLSConfiguration;
  cors: CORSConfiguration;
}

export interface LlamaStackConfiguration {
  url: string | null;
  api_key: string | null;
  use_as_library_client: boolean | null;
  library_client_config_path: string | null;
}

export interface UserDataCollection {
  feedback_enabled: boolean;
  feedback_storage: string | null;
  transcripts_enabled: boolean;
  transcripts_storage: string | null;
}

export interface SQLiteDatabaseConfiguration {
  db_path: string;
}

export interface PostgreSQLDatabaseConfiguration {
  host: string;
  port: number;
  db: string;
  user: string;
  password: string;
  namespace: string | null;
  ssl_mode: string;
  gss_encmode: string;
  ca_cert_path: string | null;
}

export interface DatabaseConfiguration {
  sqlite: SQLiteDatabaseConfiguration | null;
  postgres: PostgreSQLDatabaseConfiguration | null;
}

export interface AuthenticationConfiguration {
  module: string;
  skip_tls_verification: boolean;
  k8s_cluster_api: string | null;
  k8s_ca_cert_path: string | null;
  jwk_config: unknown | null;
}

export interface InferenceConfiguration {
  default_model: string | null;
  default_provider: string | null;
}

export interface ModelContextProtocolServer {
  name: string;
  provider_id: string;
  url: string;
}

/**
 * Configuration response (/v1/config)
 */
export interface Configuration {
  name: string;
  service: ServiceConfiguration;
  llama_stack: LlamaStackConfiguration;
  user_data_collection: UserDataCollection;
  database: DatabaseConfiguration;
  mcp_servers: ModelContextProtocolServer[];
  authentication: AuthenticationConfiguration;
  authorization: unknown | null;
  customization: unknown | null;
  inference: InferenceConfiguration;
}

/**
 * Conversation details structure
 */
export interface ConversationDetails {
  conversation_id: string;
  created_at: string | null;
  last_message_at: string | null;
  message_count: number | null;
  last_used_model: string | null;
  last_used_provider: string | null;
}

/**
 * Conversations list response (/v1/conversations)
 */
export interface ConversationsListResponse {
  conversations: ConversationDetails[];
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  content: string;
  type: 'user' | 'assistant';
}

/**
 * Chat turn structure
 */
export interface ChatTurn {
  messages: ChatMessage[];
  started_at: string;
  completed_at: string;
}

/**
 * Conversation response (/v1/conversations/{id})
 */
export interface ConversationResponse {
  conversation_id: string;
  chat_history: ChatTurn[];
}

/**
 * Conversation delete response
 */
export interface ConversationDeleteResponse {
  conversation_id: string;
  success: boolean;
  response: string;
}

/**
 * Feedback status update request
 */
export interface FeedbackStatusUpdateRequest {
  status: boolean;
}

/**
 * Feedback status update response
 */
export interface FeedbackStatusUpdateResponse {
  status: {
    previous_status: boolean;
    updated_status: boolean;
    updated_by: string;
    timestamp: string;
  };
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  provider_id: string;
  status: string;
  message: string | null;
}

/**
 * Updated readiness response with providers array
 */
export interface ReadinessResponse {
  ready: boolean;
  reason: string;
  providers: ProviderHealthStatus[];
}

// ====================
// Temporary Conversation ID Pattern
// ====================

/**
 * Constant for temporary conversation ID used in conversation promotion pattern
 */
export const TEMP_CONVERSATION_ID = '__temp_lightspeed_conversation__';
