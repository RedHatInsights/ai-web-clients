import { IBaseClientConfig, IFetchFunction, AIClientError } from '@redhat-cloud-services/ai-client-common';

// OpenAPI Schema Types based on RHEL LightSpeed specification

export interface Attachment {
  contents: string;
  mimetype: string;
}

export interface CLA {
  nevra: string;
  version: string;
}

export interface SystemInfo {
  os: string;
  version: string;
  arch: string;
  id: string;
}

export interface Terminal {
  output: string;
}

export interface Context {
  stdin?: string;
  attachments?: Attachment;
  terminal?: Terminal;
  systeminfo?: SystemInfo;
  cla?: CLA;
}

export interface Query {
  question: string;
  context?: Context;
  skip_rag?: boolean;
}

export interface RAGMetadata {
  skip_rag: boolean;
  sources_consulted: number;
  knowledge_base_version: string;
  confidence_score: number;
}

export interface ContextMetadata {
  has_systeminfo: boolean;
  has_terminal_output: boolean;
  has_attachments: boolean;
  has_stdin: boolean;
  has_cla_info: boolean;
}

export interface RAGSource {
  title: string;
  link: string;
  score: number;
  snippet: string;
}

export interface RAGResponse {
  message_id: string;
  answer: string;
  timestamp: string;
  question: string;
  rag_metadata: RAGMetadata;
  context_metadata: ContextMetadata | null;
  sources: RAGSource[];
}

// RHEL-specific request payload for sendMessage
export interface RHELLightspeedRequestPayload extends Record<string, unknown> {
  context?: Context;
  skip_rag?: boolean;
}

// RHEL-specific additional properties for the IAIClient interface (response data)
export interface RHELLightspeedAdditionalProperties extends Record<string, unknown> {
  rag_metadata?: RAGMetadata;
  context_metadata?: ContextMetadata | null;
  sources?: RAGSource[];
  original_question?: string;
}

// Client configuration interface extending base config
export interface RHELLightspeedClientConfig extends IBaseClientConfig {
  baseUrl: string;
  fetchFunction?: IFetchFunction;
}

// RHEL LightSpeed specific error classes
export class RHELLightspeedValidationError extends AIClientError {
  constructor(message: string, validationDetails?: unknown) {
    super(422, 'Validation Error', message, validationDetails);
    this.name = 'RHELLightspeedValidationError';
  }
}

export class RHELLightspeedServerError extends AIClientError {
  constructor(message: string, serverDetails?: unknown) {
    super(500, 'Server Error', message, serverDetails);
    this.name = 'RHELLightspeedServerError';
  }
}