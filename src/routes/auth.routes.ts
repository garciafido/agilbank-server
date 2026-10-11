import { Router } from 'express';
import { hash } from 'bcrypt';
import { basePrisma } from '../prisma/client';
import { enqueuePasswordResetEmail } from '../workers/queues/emailQueue';
import { logger } from '../utils/logger';
import {
  generateResetToken,
  hashToken,
  getTokenExpiration,
  validatePasswordStrength,
  PASSWORD_MIN_LENGTH
} from '../common/utils/passwordUtils';

const router = Router();

/**
 * POST /api/auth/forgot-password
 * Public endpoint - no authentication required
 * Generates a reset token and sends email with link
 */
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Always return success message (don't reveal if email exists)
    const successResponse = {
      success: true,
      message: 'If the email exists, you will receive instructions.'
    };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.json(successResponse);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await basePrisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, active: true }
    });

    // Don't reveal if email exists
    if (!user || !user.active) {
      return res.json(successResponse);
    }

    // Generate token (plain) and hash for storage
    const token = generateResetToken();
    const tokenHash = hashToken(token);
    const expiresAt = getTokenExpiration(1); // 1 hour

    // Save hash to database
    await basePrisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: expiresAt
      }
    });

    // Enqueue email with plain token (not the hash)
    await enqueuePasswordResetEmail(user.id, user.email, token);

    logger.info({ userId: user.id, email: user.email }, 'Password reset requested');

    return res.json(successResponse);
  } catch (error) {
    logger.error({ error }, 'Error in forgot-password');
    // Still return success to not reveal information
    return res.json({
      success: true,
      message: 'If the email exists, you will receive instructions.'
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Public endpoint - validates token and sets new password
 */
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'invalid_token'
      });
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'password_required'
      });
    }

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'weak_password',
        details: validation.errors,
        requirements: {
          minLength: PASSWORD_MIN_LENGTH,
          requiresUppercase: true,
          requiresLowercase: true,
          requiresNumber: true
        }
      });
    }

    // Hash the token to compare with stored hash
    const tokenHash = hashToken(token);

    // Find user with valid token
    const user = await basePrisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
        active: true
      },
      select: { id: true, email: true }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'invalid_or_expired_token'
      });
    }

    // Hash new password and update user
    const hashedPassword = await hash(newPassword, 10);

    await basePrisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null
      }
    });

    logger.info({ userId: user.id, email: user.email }, 'Password reset completed');

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in reset-password');
    return res.status(500).json({
      success: false,
      error: 'internal_error'
    });
  }
});

export default router;
