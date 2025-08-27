import {
  IBaseClientConfig,
  IRequestOptions,
} from '@redhat-cloud-services/ai-client-common';

/**
 * Configuration options for the IFD client
 */
export interface IFDClientConfig extends IBaseClientConfig {
  // Inherits baseUrl and fetchFunction from IBaseClientConfig
}

/**
 * Standard request options for IFD API calls
 */
export interface RequestOptions extends IRequestOptions {
  // Standard request options with optional timeout, headers, etc.
}
