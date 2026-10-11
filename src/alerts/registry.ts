/**
 * AlertRegistry — registro de tipos de alerta (evaluadores de código).
 *
 * El proyecto registra sus evaluadores en alerts/registerAlerts.ts (stub editable).
 * El motor (engine.ts) resuelve el evaluador por id; el query availableAlertTypes
 * expone el catálogo al form del admin. Singleton, espejo de dashboard/widgets/registry.ts.
 */

import { AlertEvaluatorDefinition } from "./types";

class AlertRegistry {
  private evaluators = new Map<string, AlertEvaluatorDefinition>();

  register(def: AlertEvaluatorDefinition): void {
    if (!def.id) {
      throw new Error("AlertRegistry.register: 'id' is required");
    }
    if (typeof def.evaluate !== "function") {
      throw new Error(`AlertRegistry.register: alert "${def.id}" must provide an evaluate() function`);
    }
    if (this.evaluators.has(def.id)) {
      console.warn(`Alert type "${def.id}" already registered, overwriting...`);
    }
    this.evaluators.set(def.id, {
      ...def,
      cadence: def.cadence ?? "daily",
      params: def.params ?? [],
    });
  }

  get(id: string): AlertEvaluatorDefinition | undefined {
    return this.evaluators.get(id);
  }

  has(id: string): boolean {
    return this.evaluators.has(id);
  }

  list(): AlertEvaluatorDefinition[] {
    return Array.from(this.evaluators.values());
  }

  ids(): string[] {
    return Array.from(this.evaluators.keys());
  }
}

export const alertRegistry = new AlertRegistry();
