import type { SimulationContext, GateConfig, SimulationMode, SimulationFault, GateResolution } from './types';
import { SimulationSuspend } from './types';
import { RecoverableBotError } from '../../bots/core/types';

interface BuildSimulationArgs {
  sessionId: string;
  tenantId: string;
  mode: SimulationMode;
  scenario: Record<string, GateConfig>;
  resolvedGates: Record<string, GateResolution>;
  prisma: any; // basePrisma (no DI en el worker)
  workerEventId?: string;
  /** Emite el evento SSE de "esperando" (lo provee el processor). */
  onWaiting?: (gate: string, label?: string) => Promise<void>;
}

/**
 * Construye el SimulationContext que se thread-ea al StageContext/BotContext.
 * Implementa el gate suspend/resume (Enfoque 1): en modo manual sin resolver,
 * persiste 'waiting' y lanza SimulationSuspend (el processor libera el worker);
 * `simulationControl` re-encola para reanudar con el gate ya resuelto.
 *
 * Faults: 'recoverable' → el worker reintenta (RecoverableBotError recoverable).
 * 'intervention' → terminal (RecoverableBotError no-recoverable → DLQ). El estado
 * BotRun 'requires_intervention' real lo setea el código de phase del proyecto vía
 * ctx.simulation (phase-level); ambos casos habilitan el retry manual.
 */
export function buildSimulationContext(a: BuildSimulationArgs): SimulationContext {
  const failFor = (key: string, kind: SimulationFault): never => {
    throw new RecoverableBotError(
      `Simulated ${kind} failure at gate "${key}"`,
      'simulation',
      kind === 'recoverable',
    );
  };

  const ctx: SimulationContext = {
    active: true,
    sessionId: a.sessionId,
    tenantId: a.tenantId,
    mode: a.mode,
    scenario: a.scenario ?? {},
    resolvedGates: a.resolvedGates ?? {},

    maybeFail(key) {
      const r = ctx.resolvedGates[key];
      if (r === 'recoverable' || r === 'intervention') failFor(key, r);
      const sc = ctx.scenario[key];
      if (sc?.fail) failFor(key, sc.fail);
    },

    async gate(key, opts) {
      const r = ctx.resolvedGates[key];
      if (r === 'advance' || r === 'succeed') return;
      if (r === 'recoverable' || r === 'intervention') failFor(key, r);

      if (ctx.mode === 'auto') {
        const sc = ctx.scenario[key];
        if (sc?.fail) failFor(key, sc.fail);
        return; // auto-advance
      }

      // manual: persistir waiting + SSE + suspender (libera el worker)
      const sess = await a.prisma.simulationSession.update({
        where: { id: a.sessionId },
        data: { status: 'waiting', currentGate: key },
      });
      if (a.workerEventId) {
        // Ligar el WorkerEvent suspendido a la sesión vía correlationId para que
        // `simulationControl` lo encuentre y reanude. En el modelo entity-anchored
        // el WorkerEvent del bot NO comparte el correlationId de la sesión, así que
        // lo estampamos al suspender (en sim el correlationId agrupa el run).
        await a.prisma.workerEvent.update({
          where: { id: a.workerEventId },
          data: { status: 'waiting', correlationId: sess.correlationId },
        });
      }
      if (a.onWaiting) await a.onWaiting(key, opts?.label);
      throw new SimulationSuspend(a.sessionId, key);
    },
  };

  return ctx;
}
