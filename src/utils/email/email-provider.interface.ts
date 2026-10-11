export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  /** Reply-To (admite múltiples direcciones — RFC 5322 address-list). */
  replyTo?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: {
    email: string;
    name?: string;
  };
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<void>;
  verify?(): Promise<boolean>;
}

export interface EmailConfig {
  provider: "smtp" | "sendgrid" | "resend" | "mailgun";
  from: {
    email: string;
    name: string;
  };
}
