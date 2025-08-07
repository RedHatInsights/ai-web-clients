import {
  AnsibleLightspeedConfig,
  QueryRequest,
  QueryResponse,
  FeedbackRequest,
  FeedbackResponse,
  StatusResponse,
  ConversationResponse,
  ConversationDeleteResponse,
  ModelsResponse,
  InfoResponse,
  Configuration,
  ReadinessResponse,
  LivenessResponse,
  AuthorizedResponse,
} from './types';
import {
  IAIClient,
  IMessageResponse,
  IConversationHistoryResponse,
  IConversation,
  ISendMessageOptions,
  IRequestOptions,
  IStreamingHandler,
} from '@redhat-cloud-services/ai-client-common';

/**
 * Interface for the Ansible Lightspeed API client
 */
export interface IAnsibleLightspeedClient extends IAIClient {
  /**
   * Get the current configuration
   */
  getConfig(): AnsibleLightspeedConfig;

  /**
   * Submit a query to the API
   */
  query(request: QueryRequest): Promise<QueryResponse>;

  /**
   * Submit a streaming query to the API
   */
  streamingQuery(request: QueryRequest): Promise<ReadableStream<Uint8Array>>;

  /**
   * Submit feedback
   */
  submitFeedback(request: FeedbackRequest): Promise<FeedbackResponse>;

  /**
   * Get feedback status
   */
  getFeedbackStatus(): Promise<StatusResponse>;

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Promise<ConversationResponse>;

  /**
   * Delete a conversation by ID
   */
  deleteConversation(conversationId: string): Promise<ConversationDeleteResponse>;

  /**
   * Get available models
   */
  getModels(): Promise<ModelsResponse>;

  /**
   * Get service information
   */
  getInfo(): Promise<InfoResponse>;

  /**
   * Get service configuration
   */
  getConfiguration(): Promise<Configuration>;

  /**
   * Check service readiness
   */
  getReadiness(): Promise<ReadinessResponse>;

  /**
   * Check service liveness
   */
  getLiveness(): Promise<LivenessResponse>;

  /**
   * Check authorization status
   */
  checkAuthorization(): Promise<AuthorizedResponse>;

  /**
   * Get metrics (returns plain text)
   */
  getMetrics(): Promise<string>;
}