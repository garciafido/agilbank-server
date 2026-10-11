/**
 * Orchestrator Module
 *
 * Exports the main AI Search service and conversation management.
 */

// Main service
export {
  AiSearchService,
  createAiSearchService,
  AiSearchServiceConfig,
  ToolCallEvent,
} from './aiSearchService';

// Conversation management
export {
  generateConversationId,
  getOrCreateConversation,
  addMessage,
  getHistory,
  clearConversation,
  setContext,
  getContext,
  cleanupExpiredConversations,
  startCleanupInterval,
  exportQueryState,
  importQueryState,
} from './conversationService';

// Re-export types needed by resolver
export type { QueryState, SearchContext, SchemaMetadata } from '../types';
