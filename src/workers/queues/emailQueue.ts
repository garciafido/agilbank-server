import { randomUUID } from 'crypto';
import { pgmq } from '../../utils/pgmq';
import { logger } from '../../utils/logger';
// En los logs, el trabajo y quién lo pidió, nunca el mail del destinatario (un dato
// personal); de un error, su tipo, su código y dónde falló (utils/errorKind).
import { errorKind } from '../../utils/errorKind';
import { basePrisma } from '../../prisma/client';

export interface WelcomeEmailPayload {
  type: 'welcome';
  userId: string;
  email: string;
  token: string;
  tenantId?: string;
  workerEventId?: string;
  _retryAttempt?: number;
}

export interface PasswordResetEmailPayload {
  type: 'passwordReset';
  userId: string;
  email: string;
  token: string;
  workerEventId?: string;
  _retryAttempt?: number;
}

export interface EmailVerificationPayload {
  type: 'emailVerification';
  verificationId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantLogo?: string;
  tenantPublicUrl?: string;
  verificationUrl: string;
  requestedByUserId: string;
  language: string;
  hasDataValidation?: boolean;
  /** El nombre del contacto para el saludo ("Hola Ana"); sin él, el saludo solo. */
  recipientName?: string;
  workerEventId?: string;
  _retryAttempt?: number;
}

export interface AlertEmailPayload {
  type: 'alert';
  email: string;
  userId: string;
  subject: string;
  title: string;
  body?: string;
  actionUrl?: string;
  tenantId?: string;
  workerEventId?: string;
  _retryAttempt?: number;
}

export type EmailPayload = WelcomeEmailPayload | PasswordResetEmailPayload | EmailVerificationPayload | AlertEmailPayload;

const QUEUE_NAME = 'email_notifications';

/**
 * Enqueue a welcome email for a new user with activation token
 */
export async function enqueueWelcomeEmail(
  userId: string,
  email: string,
  token: string,
  tenantId?: string
): Promise<void> {
  try {
    const workerEvent = await basePrisma.workerEvent.create({
      data: {
        queueName: QUEUE_NAME,
        jobType: 'welcome',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: { userId, email, type: 'welcome' },
        retryCount: 0,
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: userId } },
        triggerUserId: { connect: { id: userId } },
        ...(tenantId && { tenant_: { connect: { id: tenantId } } }),
      },
    });

    const payload: WelcomeEmailPayload = {
      type: 'welcome',
      userId,
      email,
      token,
      tenantId,
      workerEventId: workerEvent.id,
      _retryAttempt: 1,
    };

    await pgmq.send(QUEUE_NAME, payload);
    logger.info({ userId, type: 'welcome', workerEventId: workerEvent.id }, 'Welcome email enqueued');
  } catch (error) {
    logger.error({ userId, ...errorKind(error) }, 'Failed to enqueue welcome email');
    throw error;
  }
}

/**
 * Enqueue a password reset email with token link
 */
export async function enqueuePasswordResetEmail(
  userId: string,
  email: string,
  token: string
): Promise<void> {
  try {
    const user = await basePrisma.user.findUnique({
      where: { id: userId },
      select: { tenant_id_: true }
    });

    const workerEvent = await basePrisma.workerEvent.create({
      data: {
        queueName: QUEUE_NAME,
        jobType: 'passwordReset',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: { userId, email, type: 'passwordReset' },
        retryCount: 0,
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: userId } },
        triggerUserId: { connect: { id: userId } },
        ...(user?.tenant_id_ && { tenant_: { connect: { id: user.tenant_id_ } } }),
      },
    });

    const payload: PasswordResetEmailPayload = {
      type: 'passwordReset',
      userId,
      email,
      token,
      workerEventId: workerEvent.id,
      _retryAttempt: 1,
    };

    await pgmq.send(QUEUE_NAME, payload);
    logger.info({ userId, type: 'passwordReset', workerEventId: workerEvent.id }, 'Password reset email enqueued');
  } catch (error) {
    logger.error({ userId, ...errorKind(error) }, 'Failed to enqueue password reset email');
    throw error;
  }
}

/**
 * Enqueue an email verification email for external contacts
 */
export async function enqueueVerificationEmail(
  params: Omit<EmailVerificationPayload, 'type' | 'workerEventId' | '_retryAttempt'>
): Promise<void> {
  try {
    const workerEvent = await basePrisma.workerEvent.create({
      data: {
        queueName: QUEUE_NAME,
        jobType: 'emailVerification',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: { email: params.email, type: 'emailVerification', verificationId: params.verificationId },
        retryCount: 0,
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: params.requestedByUserId } },
        triggerUserId: { connect: { id: params.requestedByUserId } },
        ...(params.tenantId && { tenant_: { connect: { id: params.tenantId } } }),
      },
    });

    const payload: EmailVerificationPayload = {
      type: 'emailVerification',
      ...params,
      workerEventId: workerEvent.id,
      _retryAttempt: 1,
    };

    await pgmq.send(QUEUE_NAME, payload);
    logger.info({ verificationId: params.verificationId, type: 'emailVerification', workerEventId: workerEvent.id }, 'Verification email enqueued');
  } catch (error) {
    logger.error({ verificationId: params.verificationId, ...errorKind(error) }, 'Failed to enqueue verification email');
    throw error;
  }
}

/**
 * Enqueue a generic alert/notification email. Creates the WorkerEvent AND pushes to
 * pgmq (el canal que realmente entrega). Lo usa el stack de notificaciones/alertas.
 */
export async function enqueueAlertEmail(
  params: Omit<AlertEmailPayload, 'type' | 'workerEventId' | '_retryAttempt'>
): Promise<void> {
  try {
    const workerEvent = await basePrisma.workerEvent.create({
      data: {
        queueName: QUEUE_NAME,
        jobType: 'alert',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: { email: params.email, type: 'alert', subject: params.subject },
        retryCount: 0,
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: params.userId } },
        triggerUserId: { connect: { id: params.userId } },
        ...(params.tenantId && { tenant_: { connect: { id: params.tenantId } } }),
      },
    });

    const payload: AlertEmailPayload = {
      type: 'alert',
      ...params,
      workerEventId: workerEvent.id,
      _retryAttempt: 1,
    };

    await pgmq.send(QUEUE_NAME, payload);
    logger.info({ userId: params.userId, type: 'alert', workerEventId: workerEvent.id }, 'Alert email enqueued');
  } catch (error) {
    logger.error({ userId: params.userId, ...errorKind(error) }, 'Failed to enqueue alert email');
    throw error;
  }
}
