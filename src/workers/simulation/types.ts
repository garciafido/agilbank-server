export type SimulationMode = 'auto' | 'manual';
export type SimulationFault = 'recoverable' | 'intervention';

/** Configuración por gate dentro del `scenario` de una SimulationSession. */
export interface GateConfig {
  autoAdvanceMs?: number;
  fail?: SimulationFault;
}

export type GateResolution = 'advance' | 'succeed' | SimulationFault;

/**
 * Contexto de simulación thread-eado al StageContext/BotContext reales.
 * Inerte: solo está presente cuando el run es simulado (payload.__simulation).
 * El framework real corre y trackea; el proyecto branchea en sus boundaries:
 *   if (ctx.simulation?.active) return fake; else realIO
 */
export interface SimulationContext {
  active: boolean;
  sessionId: string;
  tenantId: string;
  mode: SimulationMode;
  scenario: Record<string, GateConfig>;
  resolvedGates: Record<string, GateResolution>;
  /** Punto de control declarado. En manual sin resolver → suspende (SimulationSuspend). */
  gate(key: string, opts?: { label?: string }): Promise<void>;
  /** Aplica un fallo programado para `key` sin suspender (para usar inline en un branch). */
  maybeFail(key: string): void;
}

/**
 * Señal de suspensión en un gate manual. NO es un error de negocio:
 * el pipelineProcessor la captura y deja el WorkerEvent en 'waiting' sin reintentar.
 */
export class SimulationSuspend extends Error {
  constructor(public readonly sessionId: string, public readonly gate: string) {
    super(`Simulation suspended at gate: ${gate}`);
    this.name = 'SimulationSuspend';
  }
}
