import type { MyApolloContext } from "../../server";
import { PrismaClient } from "../../prisma/generated-client/client";
import { SchemaMetadataStore } from "../../common/services/schemaMetadata";
import type { ISatelliteRegistry } from "../../satellite/types";
import type { SimulationContext } from "../../workers/simulation/types";
export type { SimulationContext };

/**
 * Configuración de proxy pasada desde el DSL (.proxy() en task)
 */
export interface ProxyConfig {
  useProxy: boolean;
  requireProxy: boolean;
  proxyOptions?: {
    countryCode?: string;
  };
}

/**
 * Configuración de región pasada desde el DSL (.region() en task)
 * A diferencia de proxy, region detecta ubicación actual y solo usa proxy si es necesario
 */
export interface RegionConfig {
  countryCode: string; // Código ISO del país requerido (ej: "ar", "us")
}

export interface StageContext extends MyApolloContext {
  txPrisma: PrismaClient;
  schemaMetaStore: SchemaMetadataStore;
  satelliteRegistry?: ISatelliteRegistry; // Para stages que usan bots con proxy/region
  proxyConfig?: ProxyConfig; // Configuración de proxy del DSL
  regionConfig?: RegionConfig; // Configuración de región del DSL
  simulation?: SimulationContext; // Presente en runs simulados (el proyecto branchea)
}

export interface StageReturn {
  [key: string]: any;
}
