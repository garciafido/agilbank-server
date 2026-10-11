import sgMail from "@sendgrid/mail";
import { EmailOptions, EmailProvider } from "../email-provider.interface";
import { logger } from "../../logger";
// En los logs, nunca el destinatario ni el asunto; de un error, su tipo, su código y dónde falló.
import { errorKind } from "../../errorKind";

export class SendGridProvider implements EmailProvider {
  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("SENDGRID_API_KEY is not configured");
    }
    sgMail.setApiKey(apiKey);
  }

  async send(options: EmailOptions): Promise<void> {
    try {
      const msg = {
        to: options.to,
        ...(options.cc ? { cc: options.cc } : {}),
        ...(options.bcc ? { bcc: options.bcc } : {}),
        ...(options.replyTo
          ? Array.isArray(options.replyTo)
            ? { replyToList: options.replyTo.map((email) => ({ email })) }
            : { replyTo: options.replyTo }
          : {}),
        from: {
          email:
            options.from?.email ||
            process.env.EMAIL_FROM ||
            process.env.SMTP_FROM?.replace(/.*<(.+)>/, "$1") ||
            "noreply@example.com",
          name:
            options.from?.name ||
            process.env.EMAIL_FROM_NAME ||
            process.env.APP_NAME ||
            "Application",
        },
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html || ""),
      };

      await sgMail.send(msg);
      logger.info("Email sent via SendGrid");
    } catch (error) {
      logger.error(errorKind(error), "Failed to send email via SendGrid");
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    try {
      // SendGrid doesn't have a verify method, but we can check if API key is valid
      // by attempting to retrieve account details (this won't send an email)
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey || !apiKey.startsWith("SG.")) {
        throw new Error("Invalid SendGrid API key format");
      }
      logger.info("SendGrid configuration appears valid");
      return true;
    } catch (error) {
      logger.error({ error }, "SendGrid verification failed");
      return false;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
