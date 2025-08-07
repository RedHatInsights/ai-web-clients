// Main exports for the Ansible Lightspeed API Client
export { AnsibleLightspeedClient, AnsibleLightspeedError } from './client';

// Types and interfaces
export * from './types';
export * from './interfaces';
export * from './streaming-types';

// Default streaming handler
export {
  DefaultStreamingHandler,
  processStreamWithHandler,
} from './default-streaming-handler';

// Version
export const VERSION = '0.1.0';