/**
 * Groq LLM Provider
 *
 * Implements ILlmProvider using Vercel AI SDK for Groq models.
 * Supports: llama-3.3-70b-versatile, llama-3.1-8b-instant
 *
 * Groq provides fast inference for open-source models.
 */

import { generateText, streamText, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  ILlmProvider,
  CompletionOptions,
  LlmProviderError,
  RateLimitError,
  AuthenticationError,
} from './types';
import {
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  SearchToolDefinition,
} from '../types';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqProvider implements ILlmProvider {
  readonly providerCode = 'groq';
  private client: ReturnType<typeof createOpenAI>;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: LlmProviderConfig) {
    if (!config.apiKey) {
      throw new LlmProviderError('API key is required for Groq', 'groq');
    }

    // Groq uses OpenAI-compatible API
    this.client = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || GROQ_BASE_URL,
    });

    this.model = config.model || 'llama-3.1-8b-instant';
    this.defaultMaxTokens = config.maxTokens || 4096;
    this.defaultTemperature = config.temperature ?? 0.7;
  }

  isConfigured(): boolean {
    return true;
  }

  async generateCompletion(
    messages: LlmMessage[],
    options?: CompletionOptions
  ): Promise<LlmResponse> {
    try {
      const result = await generateText({
        model: this.client(this.model),
        messages: this.convertMessages(messages),
        maxTokens: options?.maxTokens ?? this.defaultMaxTokens,
        temperature: options?.temperature ?? this.defaultTemperature,
        stopSequences: options?.stopSequences,
        abortSignal: options?.signal,
      });

      return {
        content: result.text,
        usage: result.usage
          ? {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            }
          : undefined,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async generateWithTools(
    messages: LlmMessage[],
    tools: SearchToolDefinition[],
    options?: CompletionOptions
  ): Promise<LlmResponse> {
    try {
      const aiTools = this.convertTools(tools);

      const result = await generateText({
        model: this.client(this.model),
        messages: this.convertMessages(messages),
        tools: aiTools,
        maxTokens: options?.maxTokens ?? this.defaultMaxTokens,
        temperature: options?.temperature ?? this.defaultTemperature,
        toolChoice: this.convertToolChoice(options?.toolChoice),
        abortSignal: options?.signal,
      });

      return {
        content: result.text,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          type: 'function' as const,
          function: {
            name: tc.toolName,
            arguments: JSON.stringify(tc.args),
          },
        })),
        usage: result.usage
          ? {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            }
          : undefined,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private convertMessages(messages: LlmMessage[]) {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        // Vercel AI SDK expects tool results in this format
        return {
          role: 'tool' as const,
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: msg.toolCallId!,
              toolName: msg.toolName!,
              result: JSON.parse(msg.content),
            },
          ],
        };
      }

      if (msg.role === 'assistant' && msg.toolCalls) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          toolCalls: msg.toolCalls.map((tc) => ({
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          })),
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  private convertTools(tools: SearchToolDefinition[]) {
    const result: Record<string, { description: string; parameters: ReturnType<typeof jsonSchema> }> = {};

    for (const tool of tools) {
      result[tool.name] = {
        description: tool.description,
        parameters: jsonSchema(tool.parameters as Parameters<typeof jsonSchema>[0]),
      };
    }

    return result;
  }

  private convertToolChoice(
    choice?: CompletionOptions['toolChoice']
  ): 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string } | undefined {
    if (!choice) return 'auto';
    if (typeof choice === 'string') return choice;
    return { type: 'tool', toolName: choice.name };
  }

  async *streamCompletion(
    messages: LlmMessage[],
    options?: CompletionOptions
  ): AsyncIterable<string> {
    try {
      const result = streamText({
        model: this.client(this.model),
        messages: this.convertMessages(messages),
        maxTokens: options?.maxTokens ?? this.defaultMaxTokens,
        temperature: options?.temperature ?? this.defaultTemperature,
        stopSequences: options?.stopSequences,
        abortSignal: options?.signal,
      });

      for await (const delta of result.textStream) {
        yield delta;
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('rate limit') || message.includes('429')) {
        throw new RateLimitError('groq');
      }

      if (
        message.includes('invalid api key') ||
        message.includes('401') ||
        message.includes('authentication')
      ) {
        throw new AuthenticationError('groq');
      }

      throw new LlmProviderError(error.message, 'groq', undefined, true);
    }

    throw new LlmProviderError('Unknown error', 'groq');
  }
}
