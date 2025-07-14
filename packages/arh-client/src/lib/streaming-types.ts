import { AnswerSource, ToolCallMetadata, OutputGuardResult } from './types';

/**
 * Streaming response format (different from final API response)
 */
export interface StreamingMessageChunk {
  message_id: string;
  answer?: string;
  created_at?: string;
  sources?: AnswerSource[];
  end_of_stream?: boolean;
  status_code?: number;
  detail?: unknown;
  type?: string;
  tool_call_metadata?: ToolCallMetadata | null;
  output_guard_result?: OutputGuardResult | null;
}

/**
 * Extra content metadata for messages
 */
export interface MessageExtraContentMetadata {
  [key: string]: unknown;
}

/**
 * Processed message format for UI
 */
export interface ProcessedMessage {
  id: string;
  role: 'bot' | 'user';
  content: string;
  avatar?: string;
  isLoading: boolean;
  timestamp: string;
  sources?: {
    sources: TransformedSource[];
  };
  quickResponses?: unknown;
  extraContent?: MessageExtraContentMetadata;
}

/**
 * Transformed source format for UI
 */
export interface TransformedSource {
  id: string;
  link?: string | null;
  title?: string | null;
  score?: number | null;
  snippet?: string | null;
}

/**
 * Utility functions for streaming
 */
export const isEmpty = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const isObject = (value: unknown): value is object => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}; 