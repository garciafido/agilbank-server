import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type {
  ITaskDispatcher,
  CreateSatelliteTaskInput,
  SatelliteTaskInfo,
  SatelliteTaskStatus,
  SatelliteCapabilities,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

export class TaskDispatcher implements ITaskDispatcher {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  async enqueue(
    task: CreateSatelliteTaskInput,
    tenantId: string,
    userId: string
  ): Promise<string> {
    const now = new Date();
    const taskId = uuidv4();

    this.logger.info(
      { taskType: task.taskType, correlationId: task.correlationId, taskId },
      'Enqueueing satellite task'
    );

    await this.prisma.satelliteTask.create({
      data: {
        id: taskId,
        version_: '0',
        createdAt_: now,
        createdBy_: { connect: { id: userId } },
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: userId } },
        tenant_: { connect: { id: tenantId } },
        taskType: task.taskType,
        status: 'queued',
        priority: task.priority ?? 0,
        input: task.input as object,
        correlationId: task.correlationId,
        timeoutMs: task.timeoutMs ?? 60000,
        retryCount: 0,
        maxRetries: task.maxRetries ?? 3,
        queuedAt: now,
        ...(task.targetSatelliteId && {
          parent_SatelliteMachine_tasks: { connect: { id: task.targetSatelliteId } },
        }),
        ...(task.botRunId && {
          botRun: { connect: { id: task.botRunId } },
        }),
      },
    });

    return taskId;
  }

  async getNextTask(
    satelliteId: string,
    capabilities: SatelliteCapabilities,
    allowedTenantIds?: string[]
  ): Promise<SatelliteTaskInfo | null> {
    // Fail-closed tenancy gate. A satellite is shared infrastructure (no tenant of its
    // own), so a task must not be handed to it unless its machine explicitly allow-lists
    // the task's company. Without a declared allow-list the machine serves no company:
    // return before touching the DB. Never degrade to an unfiltered query — that is how
    // a satellite would pull any company's task (bot_execution tasks carry that
    // company's credentials).
    if (!allowedTenantIds || allowedTenantIds.length === 0) {
      return null;
    }

    // Build task type filter based on capabilities
    const allowedTaskTypes: string[] = [];

    if (capabilities.proxy.enabled) {
      allowedTaskTypes.push('proxy_request');
    }
    if (capabilities.bots.enabled) {
      allowedTaskTypes.push('bot_execution');
    }
    if (capabilities.worker.enabled) {
      allowedTaskTypes.push('worker_task');
    }

    if (allowedTaskTypes.length === 0) {
      return null;
    }

    // Find the next available task, prioritizing:
    // 1. Tasks specifically assigned to this satellite
    // 2. Unassigned tasks matching capabilities
    // Order by priority DESC, then queuedAt ASC (oldest first)
    const task = await this.prisma.satelliteTask.findFirst({
      where: {
        status: 'queued',
        taskType: { in: allowedTaskTypes },
        tenant_id_: { in: allowedTenantIds },
        OR: [
          { SatelliteMachine_tasks_id: satelliteId },
          { SatelliteMachine_tasks_id: null },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { queuedAt: 'asc' },
      ],
    });

    if (!task) {
      return null;
    }

    // Validate specific capabilities for bot/worker tasks
    if (task.taskType === 'bot_execution') {
      const input = task.input as { botType?: string };
      if (input.botType && !capabilities.bots.allowedTypes.includes(input.botType)) {
        this.logger.debug(
          { taskId: task.id, botType: input.botType, satelliteId },
          'Satellite not authorized for bot type, skipping task'
        );
        // Could recursively call to get next valid task, but for now return null
        return null;
      }
    }

    if (task.taskType === 'worker_task') {
      const input = task.input as { taskName?: string };
      if (input.taskName && !capabilities.worker.allowedTasks.includes(input.taskName)) {
        this.logger.debug(
          { taskId: task.id, taskName: input.taskName, satelliteId },
          'Satellite not authorized for worker task type, skipping task'
        );
        return null;
      }
    }

    return this.mapToTaskInfo(task);
  }

  async markSent(taskId: string, satelliteId: string): Promise<void> {
    this.logger.debug({ taskId, satelliteId }, 'Marking task as sent');

    await this.prisma.satelliteTask.update({
      where: { id: taskId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        parent_SatelliteMachine_tasks: { connect: { id: satelliteId } },
      },
    });
  }

  async markAcknowledged(taskId: string): Promise<void> {
    this.logger.debug({ taskId }, 'Marking task as acknowledged');

    await this.prisma.satelliteTask.update({
      where: { id: taskId },
      data: {
        status: 'acknowledged',
      },
    });
  }

  async markRunning(taskId: string): Promise<void> {
    this.logger.debug({ taskId }, 'Marking task as running');

    await this.prisma.satelliteTask.update({
      where: { id: taskId },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  async markCompleted(
    taskId: string,
    output: Record<string, unknown>,
    durationMs: number
  ): Promise<void> {
    this.logger.info({ taskId, durationMs }, 'Task completed');

    await this.prisma.satelliteTask.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        duration: durationMs,
        output: output as object,
      },
    });
  }

  async markFailed(
    taskId: string,
    error: Record<string, unknown>,
    durationMs: number
  ): Promise<void> {
    this.logger.warn({ taskId, error, durationMs }, 'Task failed');

    const task = await this.prisma.satelliteTask.findUnique({
      where: { id: taskId },
      select: { retryCount: true, maxRetries: true },
    });

    if (task && task.retryCount < task.maxRetries) {
      // Requeue for retry
      await this.prisma.satelliteTask.update({
        where: { id: taskId },
        data: {
          status: 'queued',
          retryCount: { increment: 1 },
          error: error as object,
          sentAt: null,
          startedAt: null,
          SatelliteMachine_tasks_id: null,
        },
      });
      this.logger.info(
        { taskId, retryCount: task.retryCount + 1, maxRetries: task.maxRetries },
        'Task requeued for retry'
      );
    } else {
      // Max retries reached, mark as failed
      await this.prisma.satelliteTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          duration: durationMs,
          error: error as object,
        },
      });
    }
  }

  async markCancelled(taskId: string, reason: string): Promise<void> {
    this.logger.info({ taskId, reason }, 'Task cancelled');

    await this.prisma.satelliteTask.update({
      where: { id: taskId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        error: { cancelled: true, reason } as object,
      },
    });
  }

  async markTimeout(taskId: string): Promise<void> {
    this.logger.warn({ taskId }, 'Task timed out');

    const task = await this.prisma.satelliteTask.findUnique({
      where: { id: taskId },
      select: { retryCount: true, maxRetries: true, startedAt: true },
    });

    if (task && task.retryCount < task.maxRetries) {
      // Requeue for retry
      await this.prisma.satelliteTask.update({
        where: { id: taskId },
        data: {
          status: 'queued',
          retryCount: { increment: 1 },
          error: { timeout: true } as object,
          sentAt: null,
          startedAt: null,
          SatelliteMachine_tasks_id: null,
        },
      });
      this.logger.info(
        { taskId, retryCount: task.retryCount + 1, maxRetries: task.maxRetries },
        'Timed out task requeued for retry'
      );
    } else {
      const duration = task?.startedAt
        ? new Date().getTime() - task.startedAt.getTime()
        : undefined;

      await this.prisma.satelliteTask.update({
        where: { id: taskId },
        data: {
          status: 'timeout',
          completedAt: new Date(),
          duration,
          error: { timeout: true } as object,
        },
      });
    }
  }

  async cancelTask(taskId: string, reason: string): Promise<boolean> {
    const task = await this.prisma.satelliteTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });

    if (!task) {
      return false;
    }

    // Can only cancel tasks that are not already completed/failed/cancelled
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(task.status)) {
      return false;
    }

    await this.markCancelled(taskId, reason);
    return true;
  }

  async getTaskById(taskId: string): Promise<SatelliteTaskInfo | null> {
    const task = await this.prisma.satelliteTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return null;
    }

    return this.mapToTaskInfo(task);
  }

  async getPendingTasksForSatellite(satelliteId: string): Promise<SatelliteTaskInfo[]> {
    const tasks = await this.prisma.satelliteTask.findMany({
      where: {
        SatelliteMachine_tasks_id: satelliteId,
        status: { in: ['sent', 'acknowledged', 'running'] },
      },
      orderBy: { sentAt: 'asc' },
    });

    return tasks.map((t) => this.mapToTaskInfo(t));
  }

  async reassignOrphanedTasks(disconnectedSatelliteId: string): Promise<number> {
    this.logger.info(
      { satelliteId: disconnectedSatelliteId },
      'Reassigning orphaned tasks from disconnected satellite'
    );

    const result = await this.prisma.satelliteTask.updateMany({
      where: {
        SatelliteMachine_tasks_id: disconnectedSatelliteId,
        status: { in: ['sent', 'acknowledged', 'running'] },
      },
      data: {
        status: 'queued',
        SatelliteMachine_tasks_id: null,
        sentAt: null,
        startedAt: null,
        error: { reassigned: true, reason: 'satellite_disconnected' } as object,
      },
    });

    if (result.count > 0) {
      this.logger.info(
        { satelliteId: disconnectedSatelliteId, reassignedCount: result.count },
        'Orphaned tasks reassigned'
      );
    }

    return result.count;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private mapToTaskInfo(task: {
    id: string;
    taskType: string;
    status: string;
    priority: number;
    input: unknown;
    output: unknown;
    error: unknown;
    correlationId: string;
    timeoutMs: number;
    retryCount: number;
    maxRetries: number;
    queuedAt: Date;
    sentAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    duration: number | null;
    SatelliteMachine_tasks_id: string | null;
    BotRun_id: string | null;
  }): SatelliteTaskInfo {
    return {
      id: task.id,
      taskType: task.taskType as SatelliteTaskInfo['taskType'],
      status: task.status as SatelliteTaskStatus,
      priority: task.priority,
      input: task.input as Record<string, unknown>,
      output: task.output as Record<string, unknown> | undefined,
      error: task.error as Record<string, unknown> | undefined,
      correlationId: task.correlationId,
      timeoutMs: task.timeoutMs,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
      queuedAt: task.queuedAt,
      sentAt: task.sentAt || undefined,
      startedAt: task.startedAt || undefined,
      completedAt: task.completedAt || undefined,
      duration: task.duration || undefined,
      satelliteId: task.SatelliteMachine_tasks_id || undefined,
      botRunId: task.BotRun_id || undefined,
    };
  }
}
