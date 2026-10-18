import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { IBotNotificationService, NotificationSummary } from '../core/types';

export class BotNotificationService implements IBotNotificationService {
  constructor(
    private prisma: PrismaClient,
    private tenantId: string,
    private logger: Logger
  ) {}

  async notifyCompletion(
    botRunId: string,
    status: 'success' | 'failed' | 'requires_intervention',
    summary: NotificationSummary
  ): Promise<void> {
    this.logger.info({ botRunId, status, summary }, 'Sending bot completion notification');

    try {
      // Get SysAdmin users for the tenant
      const sysAdmins = await this.getSysAdminUsers();

      if (sysAdmins.length === 0) {
        this.logger.warn('No SysAdmin users found to notify');
        return;
      }

      // Create notification email for each SysAdmin
      for (const admin of sysAdmins) {
        await this.sendNotificationEmail(admin.email, status, summary);
      }

      this.logger.info(
        { recipientCount: sysAdmins.length },
        'Bot completion notifications sent'
      );
    } catch (error) {
      this.logger.error({ error, botRunId }, 'Failed to send bot completion notification');
      // Don't throw - notification failure shouldn't fail the bot
    }
  }

  private async getSysAdminUsers(): Promise<Array<{ id: string; email: string; name?: string }>> {
    // Find users with SysAdmin role in this tenant
    const users = await this.prisma.user.findMany({
      where: {
        tenant_id_: this.tenantId,
        active: true,
        role: { id: "SysAdmin" },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return users;
  }

  private async sendNotificationEmail(
    recipientEmail: string,
    status: 'success' | 'failed' | 'requires_intervention',
    summary: NotificationSummary
  ): Promise<void> {
    const subject = this.buildEmailSubject(status, summary);
    const body = this.buildEmailBody(status, summary);

    // Queue email notification via worker
    // This uses the existing email notification system
    await this.prisma.workerEvent.create({
      data: {
        queueName: 'email_notifications',
        jobType: 'bot_completion',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: {
          to: recipientEmail,
          subject,
          body,
          template: 'bot_completion',
          templateData: {
            status,
            ...summary,
          },
        },
        tenant_: { connect: { id: this.tenantId } },
        createdBy_: { connect: { id: this.tenantId } }, // System user
      },
    });
  }

  private buildEmailSubject(
    status: 'success' | 'failed' | 'requires_intervention',
    summary: NotificationSummary
  ): string {
    const statusEmoji = {
      success: '✅',
      failed: '❌',
      requires_intervention: '⚠️',
    };

    const statusText = {
      success: 'completado exitosamente',
      failed: 'falló',
      requires_intervention: 'requiere intervención',
    };

    return `${statusEmoji[status]} Bot ${summary.botType} ${statusText[status]}`;
  }

  private buildEmailBody(
    status: 'success' | 'failed' | 'requires_intervention',
    summary: NotificationSummary
  ): string {
    const durationMinutes = Math.round(summary.duration / 60000);

    let body = `
Bot: ${summary.botType}
Run #: ${summary.runNumber || 'N/A'}
Estado: ${status}
Duración: ${durationMinutes} minutos
Fases completadas: ${summary.completedPhases}/${summary.totalPhases}
    `.trim();

    if (summary.errorMessage) {
      body += `\n\nError:\n${summary.errorMessage}`;
    }

    if (summary.botRunUrl) {
      body += `\n\nVer detalles: ${summary.botRunUrl}`;
    }

    return body;
  }
}
