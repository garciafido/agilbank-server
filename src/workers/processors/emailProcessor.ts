import { basePrisma } from '../../prisma/client';
import { sendEmail } from '../../common/utils';
import { getWelcomeEmailTemplate, getPasswordResetEmailTemplate, getEmailVerificationTemplate, getAlertEmailTemplate, EmailLanguage } from '../../common/emailTemplates';
import { EmailPayload } from '../queues/emailQueue';
import { redis } from '../../services/redis/redisClient';
// En los logs, el trabajo (y la verificación o el usuario), nunca el mail del
// destinatario; de un error, su tipo, su código y dónde falló: su mensaje puede
// nombrar al destinatario (el de un servidor de correo) o copiar lo guardado (Prisma).
import { errorKind } from '../../utils/errorKind';
import type { Logger } from 'pino';

interface ProcessorContext {
  prisma: typeof basePrisma;
  logger: Logger;
}

export async function processEmailNotification(
  payload: EmailPayload,
  context: ProcessorContext
): Promise<void> {
  const { prisma, logger } = context;
  const startTime = Date.now();
  const now = new Date();

  const userId = payload.type === 'emailVerification' ? payload.requestedByUserId : payload.userId;

  // La verificación, si es un mail de verificación.
  const verificationId = payload.type === 'emailVerification' ? payload.verificationId : undefined;

  logger.info({
    type: payload.type,
    userId,
    verificationId,
    workerEventId: payload.workerEventId,
    attempt: payload._retryAttempt || 1
  }, 'Processing email notification');

  if (payload.workerEventId) {
    try {
      await prisma.workerEvent.update({
        where: { id: payload.workerEventId },
        data: {
          status: 'processing',
          startedAt: now,
          retryCount: payload._retryAttempt || 1,
        },
      });
    } catch (error) {
      logger.warn({ workerEventId: payload.workerEventId, ...errorKind(error) }, 'Failed to update WorkerEvent to processing');
    }
  }

  try {
    let emailContent: { subject: string; text: string; html: string };

    // Get user's preferred language or use default
    // TODO: In the future, fetch user's preferred language from DB
    const userLanguage = (process.env.DEFAULT_LANGUAGE as EmailLanguage) || 'es';

    // Get user name from DB if available (not needed for verification emails)
    let userName: string | undefined;
    if (payload.type !== 'emailVerification') {
      try {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { name: true }
        });
        userName = user?.name || undefined;
      } catch (error) {
        logger.warn({ userId: payload.userId }, 'Could not fetch user name for email');
      }
    }

    switch (payload.type) {
      case 'welcome':
        emailContent = getWelcomeEmailTemplate({
          email: payload.email,
          token: payload.token,
          userName,
          appName: process.env.APP_NAME,
          appUrl: process.env.APP_URL,
          language: userLanguage
        });
        break;

      case 'passwordReset':
        emailContent = getPasswordResetEmailTemplate({
          email: payload.email,
          token: payload.token,
          userName,
          appName: process.env.APP_NAME,
          appUrl: process.env.APP_URL,
          language: userLanguage
        });
        break;

      case 'emailVerification':
        emailContent = getEmailVerificationTemplate({
          email: payload.email,
          verificationUrl: payload.verificationUrl,
          tenantName: payload.tenantName,
          tenantLogo: payload.tenantLogo,
          tenantPublicUrl: payload.tenantPublicUrl,
          appName: process.env.APP_NAME,
          language: (payload.language as EmailLanguage) || userLanguage,
          hasDataValidation: payload.hasDataValidation,
          recipientName: payload.recipientName,
        });
        break;

      case 'alert':
        emailContent = getAlertEmailTemplate({
          title: payload.title,
          subject: payload.subject,
          body: payload.body,
          actionUrl: payload.actionUrl,
          appName: process.env.APP_NAME,
          appUrl: process.env.APP_URL,
          language: userLanguage,
        });
        break;

      default:
        throw new Error(`Unknown email type: ${(payload as any).type}`);
    }

    // Send the email
    await sendEmail({
      toEmail: payload.email,
      ...emailContent
    });

    // Update records based on email type
    if (payload.type === 'emailVerification') {
      // EmailVerification: update sentAt on the verification record
      try {
        await prisma.emailVerification.update({
          where: { id: payload.verificationId },
          data: { sentAt: now, lastUpdatedAt_: now },
        });
      } catch (updateError) {
        logger.warn({ verificationId: payload.verificationId, ...errorKind(updateError) }, 'Failed to update EmailVerification sentAt');
      }
    } else if (payload.type === 'welcome' || payload.type === 'passwordReset') {
      // User-based emails: update user record
      const updateData: any = {
        lastEmailError_: null,
      };

      if (payload.type === 'welcome') {
        updateData.welcomeEmailsentAt = now;
      } else if (payload.type === 'passwordReset') {
        updateData.passwordResetEmailsentAt = now;
      }

      await prisma.user.update({
        where: { id: payload.userId },
        data: updateData,
      });
    }

    if (payload.workerEventId) {
      const duration = Date.now() - startTime;
      try {
        await prisma.workerEvent.update({
          where: { id: payload.workerEventId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            duration,
            result: { emailSent: true, emailType: payload.type },
          },
        });
      } catch (error) {
        logger.warn({ workerEventId: payload.workerEventId, ...errorKind(error) }, 'Failed to update WorkerEvent to completed');
      }
    }

    logger.info({
      type: payload.type,
      userId,
      verificationId,
      workerEventId: payload.workerEventId,
      duration: Date.now() - startTime
    }, 'Email sent successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error({
      type: payload.type,
      userId,
      verificationId,
      workerEventId: payload.workerEventId,
      ...errorKind(error),
      duration
    }, 'Failed to send email');

    if (payload.workerEventId) {
      try {
        await prisma.workerEvent.update({
          where: { id: payload.workerEventId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            duration,
            error: {
              message: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
            },
          },
        });
      } catch (updateError) {
        logger.warn({ workerEventId: payload.workerEventId, ...errorKind(updateError) }, 'Failed to update WorkerEvent to failed');
      }
    }

    // SSE failure notification for email verification
    if (payload.type === 'emailVerification') {
      try {
        await redis.publish('sse:events', JSON.stringify({
          type: 'emailVerification.failed',
          tenantId: payload.tenantId,
          userId: payload.requestedByUserId,
          payload: {
            email: payload.email,
            error: errorMessage,
            verificationId: payload.verificationId,
          },
        }));
      } catch (sseError) {
        logger.warn({ verificationId, ...errorKind(sseError) }, 'Failed to publish SSE for email verification failure');
      }
    }

    // Update user record with error (only for user-based emails)
    if (payload.type === 'welcome' || payload.type === 'passwordReset') {
      try {
        await prisma.user.update({
          where: { id: payload.userId },
          data: {
            lastEmailError_: `[${new Date().toISOString()}] ${payload.type}: ${errorMessage}`.slice(0, 255),
          },
        });
      } catch (updateError) {
        logger.error({
          userId: payload.userId,
          ...errorKind(updateError),
        }, 'Failed to update user with email error');
      }
    }

    throw error;
  }
}
