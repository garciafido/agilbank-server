/**
 * @file schemaMetadata.ts
 * @description SchemaMetadataStore - provides schema metadata for SecurePrismaOps.
 * Uses pre-generated metadata from Haiku instead of parsing DMMF at runtime.
 */

import { Prisma } from "../../prisma/generated-client/client";
import { container } from "tsyringe";

// Re-export types from schemaMetadataTypes for backwards compatibility
export type {
  FieldMetadata,
  RelationMetadata,
  ModelMetadata,
  SchemaMetadataMap,
} from "./schemaMetadataTypes";

import type { ModelMetadata, SchemaMetadataMap } from "./schemaMetadataTypes";

// Import pre-generated metadata
import { generatedSchemaMetadata } from "./schemaMetadata.generated";

// --- Singleton Store ---
export class SchemaMetadataStore {
  private metadata: SchemaMetadataMap = new Map();
  private isBuilt = false;

  /**
   * Loads pre-generated schema metadata.
   * No longer parses DMMF - metadata is generated at Haiku build time.
   */
  build(): void {
    if (this.isBuilt) {
      console.warn("Schema metadata build() called more than once.");
      return;
    }
    console.log("Loading pre-generated schema metadata...");

    try {
      // Use pre-generated metadata from Haiku
      this.metadata = generatedSchemaMetadata;
      this.isBuilt = true;
      console.log(`Schema metadata loaded for ${this.metadata.size} models.`);
    } catch (error) {
      console.error("!!! FAILED TO LOAD SCHEMA METADATA !!!");
      console.error(error);
      this.isBuilt = false;
    }
  }

  /** Si la metadata ya fue construida (build() se llamó con éxito). */
  isReady(): boolean {
    return this.isBuilt;
  }

  // --- Access Methods ---
  get(modelName: Prisma.ModelName): ModelMetadata | undefined {
    if (!this.isBuilt) {
      console.error(
        `Schema metadata accessed for ${modelName} before build() was called!`
      );
      throw new Error(`Schema metadata for ${modelName} not available.`);
    }
    return this.metadata.get(modelName);
  }

  getAll(): SchemaMetadataMap {
    if (!this.isBuilt) {
      console.error("Schema metadata accessed before build() was called!");
      throw new Error("Schema metadata not available yet.");
    }
    return this.metadata;
  }
}

/**
 * Initialize schema metadata. Call once at server startup.
 */
export function initializeSchemaMetadata(): void {
  try {
    console.log("Initializing schema metadata (via DI container)...");
    const storeInstance = container.resolve<SchemaMetadataStore>(
      "SchemaMetadataStore"
    );
    storeInstance.build();
  } catch (error) {
    console.error("Error during initializeSchemaMetadata:", error);
  }
}
