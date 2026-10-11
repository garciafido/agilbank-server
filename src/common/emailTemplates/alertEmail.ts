import { AlertEmailTemplateParams, EmailContent } from "./types";
import { getBaseTemplate } from "./baseTemplate";
import { translations as esTranslations } from "./translations/es";
import { translations as enTranslations } from "./translations/en";
import { translations as ptTranslations } from "./translations/pt";

const translationsMap = {
  es: esTranslations,
  en: enTranslations,
  pt: ptTranslations,
};

export function getAlertEmailTemplate(
  params: AlertEmailTemplateParams
): EmailContent {
  const language = params.language || "es";
  const t = translationsMap[language].alert;
  const appName = params.appName || "Application";
  const appUrl = params.appUrl || "http://localhost:3000";
  const actionUrl = params.actionUrl
    ? params.actionUrl.startsWith("http")
      ? params.actionUrl
      : `${appUrl}${params.actionUrl}`
    : undefined;
  const bodyHtml = (params.body || "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin: 0 0 12px;">${line}</p>`)
    .join("");

  const htmlContent = `
    <h2 style="color: #333; margin-bottom: 20px;">${params.title}</h2>
    ${bodyHtml}
    ${
      actionUrl
        ? `
    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <a href="${actionUrl}"
         style="display: inline-block; background-color: #007bff; color: white; padding: 14px 28px;
                text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        ${t.ctaLabel}
      </a>
    </div>`
        : ""
    }
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
      ${t.footer}
    </p>
  `;

  const textContent = `
${params.title}

${params.body || ""}${actionUrl ? `\n\n${t.ctaLabel}: ${actionUrl}` : ""}

---
${t.footer}
  `.trim();

  return {
    subject: `[${appName}] ${params.subject || params.title}`,
    text: textContent,
    html: getBaseTemplate(htmlContent, language),
  };
}
