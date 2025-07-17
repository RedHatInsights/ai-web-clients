import { MessageChunkResponse } from './types';
import { 
  IBaseClientConfig,
  IRequestOptions
} from '@redhat-cloud-services/ai-client-common';

/**
 * Configuration options for the Lightspeed client
 * Extends the base client config with Lightspeed-specific streaming handler
 */
export interface LightspeedClientConfig extends IBaseClientConfig<MessageChunkResponse> {
  // Inherits baseUrl, fetchFunction, and defaultStreamingHandler from IBaseClientConfig
}

/**
 * Standard request options for Lightspeed API calls
 */
export interface RequestOptions extends IRequestOptions {
  // Standard request options with optional timeout, headers, etc.
} 