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

export function getWelcomeEmailTemplate(
  params: EmailTemplateParams
): EmailContent {
  const language = params.language || "es";
  const t = translationsMap[language].welcome;
  const appName =
    params.appName ||
    process.env.APP_NAME ||
    process.env.PROJECT_NAME ||
    "Application";
  const appUrl =
    params.appUrl || process.env.APP_URL || "http://localhost:3000";
  const activateLink = `${appUrl}/reset-password?token=${params.token}`;

  const htmlContent = `
    <h2 style="color: #333; margin-bottom: 20px;">${t.greeting}${
    params.userName ? " " + params.userName : ""
  }!</h2>
    <p style="margin-bottom: 20px;">${t.message}</p>

    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <a href="${activateLink}"
         style="display: inline-block; background-color: #28a745; color: white; padding: 14px 28px;
                text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        ${t.activateButtonLabel}
      </a>
    </div>

    <p style="margin: 20px 0; color: #666; font-size: 14px;">
      ${t.linkExpiryMessage}
    </p>

    <p style="margin: 20px 0; color: #666; font-size: 12px;">
      ${t.alternativeLink}:<br>
      <a href="${activateLink}" style="color: #007bff; word-break: break-all;">${activateLink}</a>
    </p>

    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0;">
      <p style="margin: 0; color: #856404;">
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

${t.activateButtonLabel}: ${activateLink}

${t.linkExpiryMessage}

${t.alternativeLink}:
${activateLink}

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
