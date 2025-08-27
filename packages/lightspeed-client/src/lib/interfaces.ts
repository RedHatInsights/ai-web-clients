import { LightSpeedCoreAdditionalProperties } from './types';
import {
  IBaseClientConfig,
  IRequestOptions,
  ISendMessageOptions,
} from '@redhat-cloud-services/ai-client-common';

/**
 * Configuration options for the Lightspeed client
 * Clean interface without streaming handler coupling
 */
export interface LightspeedClientConfig extends IBaseClientConfig {
  // Inherits baseUrl and fetchFunction from IBaseClientConfig
}

/**
 * Standard request options for Lightspeed API calls
 */
export interface RequestOptions extends IRequestOptions {
  // Standard request options with optional timeout, headers, etc.
}

/**
 * Extended send message options for Lightspeed client
 * Adds media type selection for dual streaming support
 */
export interface LightspeedSendMessageOptions
  extends ISendMessageOptions<LightSpeedCoreAdditionalProperties> {
  /**
   * Media type for the response
   * - 'text/plain': Simple text streaming (current default)
   * - 'application/json': JSON Server-Sent Events with comprehensive event types
   */
  mediaType?: 'text/plain' | 'application/json';
}
