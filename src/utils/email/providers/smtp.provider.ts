import * as nodemailer from "nodemailer";
import { EmailOptions, EmailProvider } from "../email-provider.interface";
import { logger } from "../../logger";
// En los logs, nunca el destinatario; de un error, su tipo, su código y dónde falló.
import { errorKind } from "../../errorKind";

export class SMTPProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // Extended timeouts for slow connections
      connectionTimeout: parseInt(
        process.env.SMTP_CONNECTION_TIMEOUT || "60000"
      ),
      greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT || "30000"),
      socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT || "300000"),
    };

    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  async send(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: options.from
          ? `${options.from.name} <${options.from.email}>`
          : process.env.SMTP_FROM,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc.join(", ")
            : options.cc
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc.join(", ")
            : options.bcc
          : undefined,
        replyTo: options.replyTo
          ? Array.isArray(options.replyTo)
            ? options.replyTo.join(", ")
            : options.replyTo
          : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ messageId: info.messageId }, "Email sent via SMTP");
    } catch (error) {
      logger.error(errorKind(error), "Failed to send email via SMTP");
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info("SMTP connection verified");
      return true;
    } catch (error) {
      logger.error({ error }, "SMTP connection verification failed");
      return false;
    }
  }
}
