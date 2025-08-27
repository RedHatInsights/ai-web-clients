import { IBaseClientConfig } from '@redhat-cloud-services/ai-client-common';
import { ReferencedDocument } from './streaming-types';

/**
 * Additional attributes specific to Ansible Lightspeed responses
 */
export type AnsibleLightspeedMessageAttributes = {
  /**
   * Provider used for the response (if available)
   */
  provider?: string;

  /**
   * Model used for the response (if available)
   */
  model?: string;

  /**
   * Input token count for the query
   */
  input_tokens?: number;

  /**
   * Output token count for the response
   */
  output_tokens?: number;

  /**
   * Referenced documents for the response
   */
  referenced_documents?: ReferencedDocument[];

  /**
   * Whether the response was truncated
   */
  truncated?: unknown;

  /**
   * Available quotas after this request
   */
  available_quotas?: Record<string, unknown>;
};

/**
 * Configuration options for the Ansible Lightspeed client
 */
export interface AnsibleLightspeedConfig extends IBaseClientConfig {
  /**
   * Base URL for the Ansible Lightspeed API
   */
  baseUrl: string;

  /**
   * Custom fetch function for making HTTP requests
   * Use arrow function to avoid context issues: (input, init) => fetch(input, init)
   */
  fetchFunction: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
}

/**
 * Attachment that can be sent as part of query
 */
export interface Attachment {
  attachment_type: string;
  content_type: string;
  content: string;
}

/**
 * Request model for query endpoint
 */
export interface QueryRequest {
  query: string;
  conversation_id?: string;
  provider?: string;
  model?: string;
  system_prompt?: string;
  attachments?: Attachment[];
  no_tools?: boolean;
  media_type?: string;
}

/**
 * Response model for query endpoint
 */
export interface QueryResponse {
  conversation_id?: string;
  response: string;
}

/**
 * Feedback categories for AI responses
 */
export type FeedbackCategory =
  | 'incorrect'
  | 'not_relevant'
  | 'incomplete'
  | 'outdated_information'
  | 'unsafe'
  | 'other';

/**
 * Request model for feedback endpoint
 */
export interface FeedbackRequest {
  conversation_id: string;
  user_question: string;
  llm_response: string;
  sentiment?: number;
  user_feedback?: string;
  categories?: FeedbackCategory[];
}

/**
 * Response model for feedback endpoint
 */
export interface FeedbackResponse {
  response: string;
}

/**
 * Response model for feedback status endpoint
 */
export interface StatusResponse {
  functionality: string;
  status: Record<string, unknown>;
}

/**
 * Response model for conversation endpoint
 */
export interface ConversationResponse {
  conversation_id: string;
  chat_history: Record<string, unknown>[];
}

/**
 * Response model for conversation deletion
 */
export interface ConversationDeleteResponse {
  conversation_id: string;
  success: boolean;
  response: string;
}

/**
 * Response model for models endpoint
 */
export interface ModelsResponse {
  models: Record<string, unknown>[];
}

/**
 * Response model for info endpoint
 */
export interface InfoResponse {
  name: string;
  version: string;
}

/**
 * Response model for config endpoint
 */
export interface Configuration {
  name: string;
  service: Record<string, unknown>;
  llama_stack: Record<string, unknown>;
  user_data_collection: Record<string, unknown>;
  mcp_servers?: Record<string, unknown>[];
  authentication?: Record<string, unknown>;
  customization?: Record<string, unknown>;
  inference?: Record<string, unknown>;
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  provider_id: string;
  status: string;
  message?: string;
}

/**
 * Response model for readiness endpoint
 */
export interface ReadinessResponse {
  ready: boolean;
  reason: string;
  providers: ProviderHealthStatus[];
}

/**
 * Response model for liveness endpoint
 */
export interface LivenessResponse {
  alive: boolean;
}

/**
 * Response model for authorization endpoint
 */
export interface AuthorizedResponse {
  user_id: string;
  username: string;
}

/**
 * Error response models
 */
export interface UnauthorizedResponse {
  detail: string;
}

export interface ForbiddenResponse {
  detail: string;
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}
