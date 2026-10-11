/**
 * Anthropic LLM Provider
 *
 * Implements ILlmProvider using Vercel AI SDK for Claude models. The model comes
 * from config.model; the constructor's fallback and the seed's list of options
 * both name models that Anthropic has retired, so they answer 404.
 *
 * The aiSearch module is out of service pending replacement. Nothing here is
 * being kept current — check the model names against Anthropic's model list
 * before relying on this path.
 */

import { generateText, streamText, jsonSchema } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
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

export class AnthropicProvider implements ILlmProvider {
  readonly providerCode = 'anthropic';
  private client: ReturnType<typeof createAnthropic>;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: LlmProviderConfig) {
    if (!config.apiKey) {
      throw new LlmProviderError('API key is required for Anthropic', 'anthropic');
    }

    this.client = createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    this.model = config.model || 'claude-3-haiku-20240307';
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
      const { systemMessage, otherMessages } = this.extractSystemMessage(messages);

      const result = await generateText({
        model: this.client(this.model),
        system: systemMessage,
        messages: this.convertMessages(otherMessages),
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
      const { systemMessage, otherMessages } = this.extractSystemMessage(messages);
      const aiTools = this.convertTools(tools);

      const result = await generateText({
        model: this.client(this.model),
        system: systemMessage,
        messages: this.convertMessages(otherMessages),
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

  private extractSystemMessage(messages: LlmMessage[]): {
    systemMessage: string | undefined;
    otherMessages: LlmMessage[];
  } {
    const systemMsg = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    return {
      systemMessage: systemMsg?.content,
      otherMessages,
    };
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
        role: msg.role as 'user' | 'assistant',
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
      const { systemMessage, otherMessages } = this.extractSystemMessage(messages);

      const result = streamText({
        model: this.client(this.model),
        system: systemMessage,
        messages: this.convertMessages(otherMessages),
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
        throw new RateLimitError('anthropic');
      }

      if (
        message.includes('invalid api key') ||
        message.includes('401') ||
        message.includes('authentication')
      ) {
        throw new AuthenticationError('anthropic');
      }

      throw new LlmProviderError(error.message, 'anthropic', undefined, true);
    }

    throw new LlmProviderError('Unknown error', 'anthropic');
  }
}
