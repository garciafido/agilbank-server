/**
 * Conversation Service
 *
 * Manages multi-turn conversation state for AI search.
 */

import { ConversationState, ConversationMessage, SearchSource, QueryState } from '../types';

/**
 * In-memory conversation store
 * In production, this should be backed by Redis or database
 */
const conversations = new Map<string, ConversationState>();

/**
 * Maximum messages to keep in conversation history
 */
const MAX_HISTORY_LENGTH = 20;

/**
 * Conversation expiry time (30 minutes)
 */
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

/**
 * Generate a unique conversation ID
 */
export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create a conversation
 */
export function getOrCreateConversation(conversationId?: string): ConversationState {
  if (conversationId && conversations.has(conversationId)) {
    const conv = conversations.get(conversationId)!;
    conv.lastMessageAt = new Date();
    return conv;
  }

  const newId = conversationId || generateConversationId();
  const newConversation: ConversationState = {
    id: newId,
    messages: [],
    startedAt: new Date(),
    lastMessageAt: new Date(),
  };

  conversations.set(newId, newConversation);
  return newConversation;
}

/**
 * Add a message to the conversation
 */
export function addMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: SearchSource[]
): void {
  const conversation = conversations.get(conversationId);
  if (!conversation) return;

  conversation.messages.push({
    role,
    content,
    timestamp: new Date(),
    sources,
  });

  // Trim history if too long
  if (conversation.messages.length > MAX_HISTORY_LENGTH) {
    conversation.messages = conversation.messages.slice(-MAX_HISTORY_LENGTH);
  }

  conversation.lastMessageAt = new Date();
}

/**
 * Get conversation history
 */
export function getHistory(conversationId: string): ConversationMessage[] {
  const conversation = conversations.get(conversationId);
  return conversation?.messages || [];
}

/**
 * Clear a conversation
 */
export function clearConversation(conversationId: string): boolean {
  return conversations.delete(conversationId);
}

/**
 * Set conversation context
 */
export function setContext(
  conversationId: string,
  context: Record<string, unknown>
): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.context = { ...conversation.context, ...context };
  }
}

/**
 * Get conversation context
 */
export function getContext(conversationId: string): Record<string, unknown> | undefined {
  return conversations.get(conversationId)?.context;
}

/**
 * Cleanup expired conversations
 */
export function cleanupExpiredConversations(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, conv] of conversations.entries()) {
    if (now - conv.lastMessageAt.getTime() > CONVERSATION_TTL_MS) {
      conversations.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Start periodic cleanup (call once at startup)
 */
export function startCleanupInterval(intervalMs = 5 * 60 * 1000): NodeJS.Timeout {
  return setInterval(cleanupExpiredConversations, intervalMs);
}

/**
 * Set query state for pagination
 */
export function setQueryState(conversationId: string, queryState: QueryState): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.lastQueryState = queryState;
  }
}

/**
 * Get query state for pagination
 */
export function getQueryState(conversationId: string): QueryState | undefined {
  return conversations.get(conversationId)?.lastQueryState;
}

/**
 * Clear query state (when starting a new query)
 */
export function clearQueryState(conversationId: string): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.lastQueryState = undefined;
  }
}

/**
 * Export query state for persistence
 * Returns a JSON-serializable copy of the query state
 */
export function exportQueryState(conversationId: string): QueryState | null {
  const conversation = conversations.get(conversationId);
  if (!conversation?.lastQueryState) {
    return null;
  }
  // Return a copy to avoid mutation
  return { ...conversation.lastQueryState };
}

/**
 * Import query state from persisted storage
 * Restores pagination state when loading a historical conversation
 */
export function importQueryState(conversationId: string, queryState: QueryState): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.lastQueryState = { ...queryState };
  }
}
