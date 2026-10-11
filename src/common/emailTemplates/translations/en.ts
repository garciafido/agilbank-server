import { EmailTranslations } from "../types";

export const translations: EmailTranslations = {
  welcome: {
    subject: "Activate your account",
    greeting: "Welcome",
    message:
      "Your account has been created successfully. To get started, you need to create your password.",
    activateButtonLabel: "Create Password",
    linkExpiryMessage:
      'This link expires in 1 hour. If it expires, you can request a new one from "Forgot your password?" on the login page.',
    alternativeLink:
      "If the button doesn't work, copy and paste this link into your browser",
    securityWarning: "If you were not expecting this email, you can ignore it.",
    footer: "This is an automated message. Do not reply to this email.",
  },
  passwordReset: {
    subject: "Reset Password",
    greeting: "Hello",
    message: "We received a request to reset your password.",
    resetButtonLabel: "Reset Password",
    linkExpiryMessage: "This link expires in 1 hour.",
    alternativeLink:
      "If the button doesn't work, copy and paste this link into your browser",
    securityWarning:
      "If you did not request this change, please ignore this email.",
    footer: "This is an automated message. Do not reply to this email.",
  },
  emailVerification: {
    subject: "Email verification",
    greeting: "Hello",
    message: "{tenantName} has registered your email address in {appName}.",
    instruction:
      "To verify that this email belongs to you, click the button below:",
    verifyButtonLabel: "Verify my email",
    linkExpiryMessage: "This link expires in 72 hours.",
    alternativeLink:
      "If the button doesn't work, copy and paste this link into your browser",
    ignoreWarning:
      "If you don't recognize this request, you can safely ignore this email.",
    footer: "This is an automated message. Do not reply to this email.",
    dataValidation: {
      subject: "Verify your email and review your data",
      message: "{tenantName} requires you to enter and/or verify your data.",
      instruction:
        "Click the button below to verify your email and review your data. You can correct any inaccurate information.",
      verifyButtonLabel: "Verify and review my data",
    },
  },
  alert: {
    ctaLabel: "View detail",
    footer: "This is an automated message. Do not reply to this email.",
  },
};
