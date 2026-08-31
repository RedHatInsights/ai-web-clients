import {
  IBaseClientConfig,
  IRequestOptions,
} from '@redhat-cloud-services/ai-client-common';

/**
 * Configuration options for the MAS client
 */
export interface MASClientConfig extends IBaseClientConfig {
  /**
   * The blueprint ID to use when creating new sessions.
   * This is the workflow/graph ID that defines the agent behavior.
   */
  blueprintId: string;

  /**
   * Optional metadata to attach to new sessions
   */
  metadata?: Record<string, unknown>;

  /**
   * Whether to enable Human-in-the-Loop approval gates
   */
  hitlEnabled?: boolean;
}

/**
 * Standard request options for MAS API calls
 */
export interface RequestOptions extends IRequestOptions {
  // Standard request options with optional timeout, headers, etc.
}
