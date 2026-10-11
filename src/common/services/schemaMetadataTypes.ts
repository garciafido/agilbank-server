/**
 * @file schemaMetadataTypes.ts
 * @description Type definitions for schema metadata used by SecurePrismaOps.
 * These types are shared between the generated metadata and SchemaMetadataStore.
 *
 * This file is a static file (copied directly to generated projects).
 */

import { Prisma } from "../../prisma/generated-client/client";

/**
 * Metadata about a field in a model.
 * Simplified version that doesn't depend on DMMF types.
 */
export interface FieldMetadata {
  name: string;
  type: string;
  kind: "scalar" | "object" | "enum" | "unsupported";
  isList: boolean;
  isRequired: boolean;
  isId: boolean;
  hasDefaultValue: boolean;
  relationName?: string | null;
  relationFromFields?: string[];
  relationToFields?: string[];
}

/**
 * Metadata about a relation in a model.
 */
export interface RelationMetadata {
  fieldName: string;
  relatedModelName: Prisma.ModelName;
  isList: boolean;
  relationName?: string | null;
  relationFromFields?: string[];
  relationToFields?: string[];
}

/**
 * Metadata about a model, including security-relevant attributes.
 */
export interface ModelMetadata {
  modelName: Prisma.ModelName;
  dbName?: string | null;
  tenantIdField?: string;
  hybridTenantFlagField?: string;
  userScopedForRoles?: string[];
  ownerScoped?: boolean;
  /** Privilegio administrativo de lectura cross-tenant por rol (sin isSystemMode):
   *  "always" cruza siempre para esos roles; "onRequest" solo con allTenants explícito. */
  crossTenantForRoles?: { roles: string[]; mode: "always" | "onRequest" };
  /** Columnas Prisma que materializan un campo `.secret`: la columna plana, o la
   *  terna `_encrypted`/`_iv`/`_tag` si además es `.encrypted` (una entrada por
   *  idioma si es multilang). Ausente si el modelo no tiene ningún `.secret`. */
  secretFieldNames?: string[];
  /** Columnas JSON que rematerializan el record entero de otro modelo — el `data` del
   *  historial generado por `.history`. Adentro de ese JSON puede haber un `.secret` del
   *  modelo de origen, y no se puede redactar por columna: o viaja el blob o no viaja. */
  opaqueRecordFields?: string[];
  relations: Map<string, RelationMetadata>;
  fields: Map<string, FieldMetadata>;
}

/**
 * Map of model names to their metadata.
 */
export type SchemaMetadataMap = Map<Prisma.ModelName, ModelMetadata>;
