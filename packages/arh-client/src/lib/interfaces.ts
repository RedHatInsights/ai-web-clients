import { MessageChunkResponse } from './types';
import { 
  IBaseClientConfig,
  IRequestOptions
} from '@redhat-cloud-services/ai-client-common';

/**
 * Configuration options for the IFD client
 * Extends the base client config with ARH-specific streaming handler
 */
export interface IFDClientConfig extends IBaseClientConfig<MessageChunkResponse> {
  // Inherits baseUrl, fetchFunction, and defaultStreamingHandler from IBaseClientConfig
}

/**
 * Standard request options for IFD API calls
 */
export interface RequestOptions extends IRequestOptions {
  // Standard request options with optional timeout, headers, etc.
} 