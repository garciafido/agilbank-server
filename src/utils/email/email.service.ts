import { EmailOptions, EmailProvider } from "./email-provider.interface";
import { SMTPProvider } from "./providers/smtp.provider";
import { SendGridProvider } from "./providers/sendgrid.provider";
import { logger } from "../logger";
// De un error, su tipo, su código y dónde falló: nunca el destinatario.
import { errorKind } from "../errorKind";
import { getWelcomeEmailTemplate } from "../../common/emailTemplates/welcomeEmail";
import { EmailLanguage } from "../../common/emailTemplates/types";
import * as fs from "fs";
import * as path from "path";

export class EmailService {
  private provider: EmailProvider;
  private fallbackFile: string = "created_users.txt";

  constructor() {
    this.provider = this.createProvider();
  }

  private createProvider(): EmailProvider {
    const providerType = process.env.EMAIL_PROVIDER || "smtp";

    logger.info({ provider: providerType }, "Initializing email provider");

    switch (providerType.toLowerCase()) {
      case "sendgrid":
        return new SendGridProvider();
      case "smtp":
      default:
        return new SMTPProvider();
    }
  }

  async send(options: EmailOptions): Promise<void> {
    try {
      await this.provider.send(options);
    } catch (error) {
      logger.error(
        errorKind(error),
        "Email sending failed, saving to fallback file"
      );

      // Save to fallback file when email fails
      this.saveToFallbackFile(options);

      // Re-throw if in production and email is critical
      if (
        process.env.NODE_ENV === "production" &&
        process.env.EMAIL_REQUIRED === "true"
      ) {
        throw error;
      }
    }
  }

  async verify(): Promise<boolean> {
    try {
      if (this.provider.verify) {
        return await this.provider.verify();
      }
      return true;
    } catch (error) {
      logger.error({ error }, "Email provider verification failed");
      return false;
    }
  }

  private saveToFallbackFile(options: EmailOptions): void {
    try {
      const timestamp = new Date().toISOString();
      const entry = {
        timestamp,
        to: options.to,
        subject: options.subject,
        provider: process.env.EMAIL_PROVIDER || "smtp",
        error: "Email delivery failed - saved to file",
      };

      const line = JSON.stringify(entry) + "\n";
      fs.appendFileSync(this.fallbackFile, line);

      logger.info(
        { file: this.fallbackFile },
        "Email details saved to fallback file"
      );
    } catch (error) {
      logger.error({ error }, "Failed to save email to fallback file");
    }
  }

  // Helper method for sending welcome emails with activation token
  async sendWelcomeEmail(
    to: string,
    data: {
      name: string;
      token: string;
      language?: EmailLanguage;
    }
  ): Promise<void> {
    const emailContent = getWelcomeEmailTemplate({
      email: to,
      token: data.token,
      userName: data.name,
      language: data.language || "es",
    });

    await this.send({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }
}

// Singleton instance
let emailService: EmailService;

export function getEmailService(): EmailService {
  if (!emailService) {
    emailService = new EmailService();
  }
  return emailService;
}
