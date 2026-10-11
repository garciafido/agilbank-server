export type EmailLanguage = "es" | "en" | "pt";

export interface EmailTemplateParams {
  email: string;
  token?: string; // For password reset and welcome emails
  userName?: string;
  appName?: string;
  appUrl?: string;
  language?: EmailLanguage;
}

export interface EmailVerificationTemplateParams {
  email: string;
  verificationUrl: string;
  tenantName?: string;
  tenantLogo?: string;
  tenantPublicUrl?: string;
  appName?: string;
  language?: EmailLanguage;
  hasDataValidation?: boolean;
  // El nombre del contacto para el saludo ("Hola Ana"); sin él, el saludo solo.
  recipientName?: string;
}

export interface AlertEmailTemplateParams {
  title: string;
  body?: string;
  subject?: string;
  actionUrl?: string;
  appName?: string;
  appUrl?: string;
  language?: EmailLanguage;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailVerificationTranslations {
  subject: string;
  greeting: string;
  message: string;
  instruction: string;
  verifyButtonLabel: string;
  linkExpiryMessage: string;
  alternativeLink: string;
  ignoreWarning: string;
  footer: string;
  dataValidation?: {
    subject: string;
    message: string;
    instruction: string;
    verifyButtonLabel: string;
  };
}

export interface EmailTranslations {
  welcome: {
    subject: string;
    greeting: string;
    message: string;
    activateButtonLabel: string;
    linkExpiryMessage: string;
    alternativeLink: string;
    securityWarning: string;
    footer: string;
  };
  passwordReset: {
    subject: string;
    greeting: string;
    message: string;
    resetButtonLabel: string;
    linkExpiryMessage: string;
    alternativeLink: string;
    securityWarning: string;
    footer: string;
  };
  emailVerification: EmailVerificationTranslations;
  alert: {
    ctaLabel: string;
    footer: string;
  };
}
