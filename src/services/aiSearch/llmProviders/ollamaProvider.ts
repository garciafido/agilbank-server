/**
 * Ollama LLM Provider
 *
 * Implements ILlmProvider for local Ollama models.
 * Supports: qwen3, llama3.1, mistral, codellama, and any Ollama-compatible model
 *
 * Ollama runs locally and doesn't require an API key.
 * Recommended: qwen3:8b for best function calling support (Apache 2.0 license)
 */

import { generateText, streamText, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  ILlmProvider,
  CompletionOptions,
  LlmProviderError,
} from './types';
import {
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  SearchToolDefinition,
} from '../types';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434/v1';

export class OllamaProvider implements ILlmProvider {
  readonly providerCode = 'ollama';
  private client: ReturnType<typeof createOpenAI>;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private baseUrl: string;

  constructor(config: LlmProviderConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_OLLAMA_URL;

    // Ollama uses OpenAI-compatible API
    this.client = createOpenAI({
      apiKey: 'ollama', // Ollama doesn't require API key but SDK needs something
      baseURL: this.baseUrl,
    });

    this.model = config.model || 'qwen3:8b';
    this.defaultMaxTokens = config.maxTokens || 4096;
    this.defaultTemperature = config.temperature ?? 0.7;
  }

  isConfigured(): boolean {
    return !!this.baseUrl;
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

      if (message.includes('econnrefused') || message.includes('connection refused')) {
        throw new LlmProviderError(
          `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
          'ollama',
          undefined,
          true
        );
      }

      if (message.includes('model') && message.includes('not found')) {
        throw new LlmProviderError(
          `Model "${this.model}" not found. Run: ollama pull ${this.model}`,
          'ollama',
          404,
          false
        );
      }

      throw new LlmProviderError(error.message, 'ollama', undefined, true);
    }

    throw new LlmProviderError('Unknown error', 'ollama');
  }
}
