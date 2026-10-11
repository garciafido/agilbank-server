// Pipeline Service Registry for Worker
//
// IMPORTANT: This file must NOT import anything that executes code on load.
// - NO readFileSync (GraphQL typeDefs are in index.ts, not here)
// - NO side effects at module load time
// - Only static imports of service classes
//
// Server imports from: ./index (has typeDefs, resolvers)
// Worker imports from: ./registry (services only)

// Temporary stub for EditionGenerateFinalPipelineService
class EditionGenerateFinalPipelineService {
  constructor(_prisma: any, _schemaMetaStore: any) {}
  async execute(args: any, context: any): Promise<any> {
    console.warn("EditionGenerateFinalPipelineService is not implemented yet");
    return {
      result: "OK",
      message: "EditionGenerateFinal pipeline not implemented",
    };
  }
  async executeConvertAndReplace(input: any, context: any): Promise<any> {
    console.warn(
      "EditionGenerateFinalPipelineService.executeConvertAndReplace is not implemented yet"
    );
    return { convertedCount: 0 };
  }
}

/**
 * Static registry mapping pipeline names to their service classes.
 * Used by pipelineProcessor.ts in the worker to avoid dynamic imports
 * that esbuild cannot resolve.
 */
export const pipelineServiceRegistry: Record<string, any> = {
  EditionGenerateFinal: EditionGenerateFinalPipelineService,
};

/**
 * Static registry mapping pipeline names to their retry policy (opt-in .retryPolicy).
 * Metadata-only (no imports). Consumed by WorkerEventRetryService to validate/dispatch
 * manual retries. Pipelines without a retry policy are absent → not retryable.
 */
export const retryPolicyRegistry: Record<string, any> = {};
