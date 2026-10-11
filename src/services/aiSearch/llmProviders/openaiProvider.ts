/**
 * OpenAI LLM Provider
 *
 * Implements ILlmProvider using Vercel AI SDK for OpenAI models.
 * Supports: gpt-4o, gpt-4o-mini, gpt-4-turbo
 */

import { generateText, streamText, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  ILlmProvider,
  CompletionOptions,
  LlmProviderError,
  RateLimitError,
  AuthenticationError,
  ContextLengthError,
} from './types';
import {
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  SearchToolDefinition,
} from '../types';

/**
 * Normalize Unicode characters for DSML parsing
 * Different models output different Unicode variants that look identical
 * This ensures consistent parsing of DSML syntax
 */
function normalizeDsmlCharacters(content: string): string {
  return content
    // Vertical lines → |
    // U+FF5C ｜ FULLWIDTH VERTICAL LINE
    // U+2758 ❘ LIGHT VERTICAL BAR
    // U+23D0 ⏐ VERTICAL LINE EXTENSION
    // U+239C ⎜ LEFT PARENTHESIS EXTENSION
    // U+23B8 ⎸ LEFT VERTICAL BOX LINE
    // U+23B9 ⎹ RIGHT VERTICAL BOX LINE
    // U+2502 │ BOX DRAWINGS LIGHT VERTICAL
    // U+2503 ┃ BOX DRAWINGS HEAVY VERTICAL
    // U+2551 ║ BOX DRAWINGS DOUBLE VERTICAL
    .replace(/[\uFF5C\u2758\u23D0\u239C\u23B8\u23B9\u2502\u2503\u2551]/g, '|')
    // Curly/smart double quotes → straight double quote "
    // U+201C " LEFT DOUBLE QUOTATION MARK
    // U+201D " RIGHT DOUBLE QUOTATION MARK
    // U+201E „ DOUBLE LOW-9 QUOTATION MARK
    // U+201F ‟ DOUBLE HIGH-REVERSED-9 QUOTATION MARK
    // U+2033 ″ DOUBLE PRIME
    // U+2036 ‶ REVERSED DOUBLE PRIME
    // U+FF02 ＂ FULLWIDTH QUOTATION MARK
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\uFF02]/g, '"')
    // Curly/smart single quotes → straight single quote '
    // U+2018 ' LEFT SINGLE QUOTATION MARK
    // U+2019 ' RIGHT SINGLE QUOTATION MARK
    // U+201A ‚ SINGLE LOW-9 QUOTATION MARK
    // U+201B ‛ SINGLE HIGH-REVERSED-9 QUOTATION MARK
    // U+2032 ′ PRIME
    // U+2035 ‵ REVERSED PRIME
    // U+FF07 ＇ FULLWIDTH APOSTROPHE
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\uFF07]/g, "'")
    // Fullwidth brackets → ASCII
    // U+FF1C ＜ FULLWIDTH LESS-THAN SIGN
    // U+FF1E ＞ FULLWIDTH GREATER-THAN SIGN
    .replace(/\uFF1C/g, '<')
    .replace(/\uFF1E/g, '>')
    // Fullwidth ASCII letters → ASCII letters
    // U+FF21-FF3A (Ａ-Ｚ) → A-Z
    // U+FF41-FF5A (ａ-ｚ) → a-z
    .replace(/[\uFF21-\uFF3A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 0x41))
    .replace(/[\uFF41-\uFF5A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF41 + 0x61))
    // Fullwidth digits → ASCII digits
    // U+FF10-FF19 (０-９) → 0-9
    .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
    // Fullwidth underscore → ASCII underscore
    // U+FF3F ＿ → _
    .replace(/\uFF3F/g, '_');
}

/**
 * Parse DSML tool calls from already-normalized content (DeepSeek fallback)
 * DeepSeek sometimes outputs DSML syntax in content instead of proper tool_calls
 * @param normalizedContent Content already processed by normalizeDsmlCharacters
 */
function parseDsmlToolCalls(normalizedContent: string): Array<{
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}> | null {
  console.log('[DSML Parser] Processing content, length:', normalizedContent.length);
  console.log('[DSML Parser] Content sample:', normalizedContent.substring(0, 300));

  const toolCalls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }> = [];

  // Match invoke blocks - content is already normalized, only need to handle | (pipe)
  // Opening: <|DSML|invoke name="..."> or variations
  // Closing: </|DSML|invoke>
  const invokePattern = /<\|?DSML\|?invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\|?DSML\|?invoke>/gi;
  let invokeMatch;

  while ((invokeMatch = invokePattern.exec(normalizedContent)) !== null) {
    const toolName = invokeMatch[1];
    const invokeContent = invokeMatch[2];
    const args: Record<string, unknown> = {};

    // Match parameter blocks
    // Opening: <|DSML|parameter name="..." string="true|false">
    // Closing: </|DSML|parameter>
    const paramPattern = /<\|?DSML\|?parameter\s+name="([^"]+)"\s+string="(true|false)"[^>]*>([\s\S]*?)<\/\|?DSML\|?parameter>/gi;
    let paramMatch;

    while ((paramMatch = paramPattern.exec(invokeContent)) !== null) {
      const paramName = paramMatch[1];
      const isString = paramMatch[2] === 'true';
      const paramValue = paramMatch[3].trim();

      if (isString) {
        args[paramName] = paramValue;
      } else {
        try {
          args[paramName] = JSON.parse(paramValue);
        } catch {
          args[paramName] = paramValue;
        }
      }
    }

    toolCalls.push({
      id: `dsml_${Date.now()}_${toolCalls.length}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    });
  }

  console.log('[DSML Parser] Parsed tool calls:', toolCalls.length);
  if (toolCalls.length > 0) {
    console.log('[DSML Parser] Tool names:', toolCalls.map(tc => tc.function.name).join(', '));
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

export class OpenAIProvider implements ILlmProvider {
  readonly providerCode: string;
  private client: ReturnType<typeof createOpenAI>;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: LlmProviderConfig) {
    this.providerCode = config.providerCode || 'openai';

    if (!config.apiKey) {
      throw new LlmProviderError('API key is required', this.providerCode);
    }

    this.client = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    this.model = config.model || 'gpt-4o-mini';
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

      // Convert tool calls from SDK format
      let toolCalls = result.toolCalls?.map((tc) => ({
        id: tc.toolCallId,
        type: 'function' as const,
        function: {
          name: tc.toolName,
          arguments: JSON.stringify(tc.args),
        },
      }));

      // DSML fallback: Check for DSML syntax in content
      // Some models (DeepSeek) output DSML with fullwidth Unicode characters
      // CRITICAL: Normalize BEFORE the includes check, otherwise fullwidth letters won't match
      if (result.text) {
        const normalizedText = normalizeDsmlCharacters(result.text);
        if (normalizedText.includes('DSML') || normalizedText.includes('function_calls')) {
          const dsmlToolCalls = parseDsmlToolCalls(normalizedText);
          if (dsmlToolCalls && dsmlToolCalls.length > 0) {
            console.log(`[AI Search] DSML fallback: parsed ${dsmlToolCalls.length} tool call(s) from content`);
            toolCalls = dsmlToolCalls;
          }
        }
      }

      return {
        content: toolCalls && toolCalls.length > 0 ? '' : result.text, // Clear content if we extracted tool calls
        toolCalls,
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
        // Vercel AI SDK expects tool calls as content array with type: 'tool-call'
        const toolCallParts = msg.toolCalls.map((tc) => ({
          type: 'tool-call' as const,
          toolCallId: tc.id,
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        }));

        // If there's text content, prepend it as a text part
        if (msg.content && msg.content.trim().length > 0) {
          return {
            role: 'assistant' as const,
            content: [
              { type: 'text' as const, text: msg.content },
              ...toolCallParts,
            ],
          };
        }

        return {
          role: 'assistant' as const,
          content: toolCallParts,
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
        throw new RateLimitError(this.providerCode);
      }

      if (
        message.includes('invalid api key') ||
        message.includes('401') ||
        message.includes('authentication')
      ) {
        throw new AuthenticationError(this.providerCode);
      }

      // Context length exceeded (DeepSeek, OpenAI, etc.)
      if (
        message.includes('maximum context length') ||
        message.includes('context_length_exceeded') ||
        message.includes('token limit')
      ) {
        throw new ContextLengthError(this.providerCode);
      }

      throw new LlmProviderError(error.message, this.providerCode, undefined, true);
    }

    throw new LlmProviderError('Unknown error', this.providerCode);
  }
}
