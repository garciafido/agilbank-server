import type { PhaseDefinition, PhaseStatus, BotContext } from './types';

export interface PhaseState {
  phaseId: string;
  status: PhaseStatus;
  startedAt?: Date;
  completedAt?: Date;
  stepsCompleted: number;
  error?: Error;
}

export class PhaseStateMachine {
  private phases: PhaseDefinition[];
  private currentIndex: number = 0;
  private phaseStates: Map<string, PhaseState> = new Map();

  constructor(phases: PhaseDefinition[], private context: BotContext) {
    // Sort phases by order
    this.phases = [...phases].sort((a, b) => a.order - b.order);

    // Initialize phase states
    for (const phase of this.phases) {
      this.phaseStates.set(phase.id, {
        phaseId: phase.id,
        status: 'pending',
        stepsCompleted: 0,
      });
    }
  }

  getCurrentPhase(): PhaseDefinition | null {
    if (this.currentIndex >= this.phases.length) {
      return null;
    }
    return this.phases[this.currentIndex];
  }

  getNextPhase(): PhaseDefinition | null {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.phases.length) {
      return null;
    }
    return this.phases[nextIndex];
  }

  hasNextPhase(): boolean {
    return this.currentIndex < this.phases.length;
  }

  moveToNextPhase(): PhaseDefinition | null {
    this.currentIndex++;
    return this.getCurrentPhase();
  }

  markPhaseStarted(phaseId: string): void {
    const state = this.phaseStates.get(phaseId);
    if (state) {
      state.status = 'running';
      state.startedAt = new Date();
      this.context.state.currentPhase = phaseId;
    }
  }

  markPhaseCompleted(phaseId: string, stepsCompleted: number): void {
    const state = this.phaseStates.get(phaseId);
    if (state) {
      state.status = 'success';
      state.completedAt = new Date();
      state.stepsCompleted = stepsCompleted;
      this.context.state.completedPhases.push(phaseId);
    }
  }

  markPhaseFailed(phaseId: string, error: Error): void {
    const state = this.phaseStates.get(phaseId);
    if (state) {
      state.status = 'failed';
      state.completedAt = new Date();
      state.error = error;
    }
  }

  markPhaseSkipped(phaseId: string): void {
    const state = this.phaseStates.get(phaseId);
    if (state) {
      state.status = 'skipped';
      state.completedAt = new Date();
    }
  }

  getPhaseState(phaseId: string): PhaseState | undefined {
    return this.phaseStates.get(phaseId);
  }

  getAllPhaseStates(): PhaseState[] {
    return Array.from(this.phaseStates.values());
  }

  getCompletedCount(): number {
    return Array.from(this.phaseStates.values()).filter(
      (s) => s.status === 'success'
    ).length;
  }

  getFailedCount(): number {
    return Array.from(this.phaseStates.values()).filter(
      (s) => s.status === 'failed'
    ).length;
  }

  getTotalCount(): number {
    return this.phases.length;
  }

  reset(): void {
    this.currentIndex = 0;
    for (const state of this.phaseStates.values()) {
      state.status = 'pending';
      state.startedAt = undefined;
      state.completedAt = undefined;
      state.stepsCompleted = 0;
      state.error = undefined;
    }
  }
}
