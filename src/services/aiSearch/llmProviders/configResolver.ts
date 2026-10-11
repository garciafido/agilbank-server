/**
 * LLM Config Resolver
 *
 * Resolves LLM configurations for a tenant, ordered by priority.
 * Used internally by the AI Search service - not exposed to clients.
 */

import { PrismaClient } from '../../../prisma/generated-client/client';

/**
 * Resolved LLM configuration ready for use
 */
export interface LlmConfigResolved {
  id: string;
  providerCode: string;
  providerName: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  debugFullMode?: boolean;
}

/**
 * Get LLM configurations for a tenant, ordered by priority.
 * Only returns enabled configs with valid API keys.
 *
 * @param prisma - Prisma client
 * @param tenantId - Tenant ID
 * @returns Array of resolved configs, ordered by priority (lowest first)
 */
export async function resolveLlmConfigs(
  prisma: PrismaClient,
  tenantId: string
): Promise<LlmConfigResolved[]> {
  const configs = await prisma.tenantLlmConfig.findMany({
    where: {
      tenant_id_: tenantId,
      enabled: true,
    },
    include: {
      provider: true,
    },
    orderBy: {
      priority: 'asc',
    },
  });

  // Filter out configs without API keys and map to resolved format
  return configs
    .filter(c => c.apiKey)
    .map(c => ({
      id: c.id,
      providerCode: c.provider.code,
      providerName: c.provider.name,
      model: c.model,
      apiKey: c.apiKey!,
      baseUrl: c.baseUrl || undefined,
      maxTokens: c.maxTokens || undefined,
      temperature: c.temperature ? Number(c.temperature) : undefined,
      debugFullMode: (c as { debugFullMode?: boolean }).debugFullMode || false,
    }));
}

/**
 * Get RAG-specific LLM configuration for a tenant.
 * Returns null if no RAG-specific config is set (use default LLM).
 *
 * @param prisma - Prisma client
 * @param tenantId - Tenant ID
 * @returns Resolved RAG config or null
 */
export async function resolveRagLlmConfig(
  prisma: PrismaClient,
  tenantId: string
): Promise<LlmConfigResolved | null> {
  // Get tenant with RAG LLM fields
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      ragLlmProvider: {
        select: {
          code: true,
          name: true,
          requiresApiKey: true,
        },
      },
      ragLlmModel: true,
    },
  });

  // If no RAG provider configured, return null (use default)
  if (!tenant?.ragLlmProvider || !tenant?.ragLlmModel) {
    return null;
  }

  // Find API key from TenantLlmConfig for this provider
  const providerConfig = await prisma.tenantLlmConfig.findFirst({
    where: {
      tenant_id_: tenantId,
      provider: {
        code: tenant.ragLlmProvider.code,
      },
      enabled: true,
    },
    select: {
      id: true,
      apiKey: true,
      baseUrl: true,
      maxTokens: true,
      temperature: true,
    },
  });

  // If no API key found for the RAG provider, return null
  if (!providerConfig?.apiKey) {
    return null;
  }

  return {
    id: `rag-${providerConfig.id}`,
    providerCode: tenant.ragLlmProvider.code,
    providerName: tenant.ragLlmProvider.name,
    model: tenant.ragLlmModel,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl || undefined,
    maxTokens: providerConfig.maxTokens || undefined,
    temperature: providerConfig.temperature ? Number(providerConfig.temperature) : undefined,
  };
}
