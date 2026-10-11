import { EmailTemplateParams, EmailContent } from "./types";
import { getBaseTemplate } from "./baseTemplate";
import { translations as esTranslations } from "./translations/es";
import { translations as enTranslations } from "./translations/en";
import { translations as ptTranslations } from "./translations/pt";

const translationsMap = {
  es: esTranslations,
  en: enTranslations,
  pt: ptTranslations,
};

export function getPasswordResetEmailTemplate(
  params: EmailTemplateParams
): EmailContent {
  const language = params.language || "es";
  const t = translationsMap[language].passwordReset;
  const appName = params.appName || "Application";
  const appUrl = params.appUrl || "http://localhost:3000";
  const resetLink = `${appUrl}/reset-password?token=${params.token}`;

  const htmlContent = `
    <h2 style="color: #333; margin-bottom: 20px;">${t.greeting}${
    params.userName ? " " + params.userName : ""
  }!</h2>
    <p style="margin-bottom: 20px;">${t.message}</p>

    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <a href="${resetLink}"
         style="display: inline-block; background-color: #007bff; color: white; padding: 14px 28px;
                text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        ${t.resetButtonLabel}
      </a>
    </div>

    <p style="margin: 20px 0; color: #666; font-size: 14px;">
      ${t.linkExpiryMessage}
    </p>

    <p style="margin: 20px 0; color: #666; font-size: 12px;">
      ${t.alternativeLink}:<br>
      <a href="${resetLink}" style="color: #007bff; word-break: break-all;">${resetLink}</a>
    </p>

    <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 12px; margin: 20px 0;">
      <p style="margin: 0; color: #721c24;">
        ⚠️ ${t.securityWarning}
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
      ${t.footer}
    </p>
  `;

  const textContent = `
${t.greeting}${params.userName ? " " + params.userName : ""}!

${t.message}

${t.resetButtonLabel}: ${resetLink}

${t.linkExpiryMessage}

${t.alternativeLink}:
${resetLink}

⚠️ ${t.securityWarning}

---
${t.footer}
  `.trim();

  return {
    subject: `[${appName}] ${t.subject}`,
    text: textContent,
    html: getBaseTemplate(htmlContent, language),
  };
}
