import { EmailVerificationTemplateParams, EmailContent } from "./types";
import { getBaseTemplate } from "./baseTemplate";
import { translations as esTranslations } from "./translations/es";
import { translations as enTranslations } from "./translations/en";
import { translations as ptTranslations } from "./translations/pt";
import {
  dataValidationCopy,
  DataValidationCopy,
} from "../emailVerification/dataValidationCopy";

const translationsMap = {
  es: esTranslations,
  en: enTranslations,
  pt: ptTranslations,
};

/**
 * Un texto plano dentro del HTML del mail. El nombre de la empresa puede salir
 * del asiento del proyecto (senderDisplayName: por ejemplo, el seudónimo de una
 * editorial que edita cualquier usuario de la empresa), y el del contacto, de su
 * registro: sin escapar, un nombre con "<a href=…>" metería un link en un mail
 * que sale con la firma del sitio.
 */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * Cambia {tenantName} y {appName} por sus valores en una sola pasada y todas las
 * veces que aparecen: lo que trae un valor (un nombre de empresa con "{appName}")
 * no se vuelve a reemplazar. Reemplazo con función: un "$&" no se expande.
 */
const fillMarkers = (
  text: string,
  values: Record<"tenantName" | "appName", string>
): string =>
  text.replace(
    /\{(tenantName|appName)\}/g,
    (_marker: string, key: "tenantName" | "appName") => values[key]
  );

export function getEmailVerificationTemplate(
  params: EmailVerificationTemplateParams
): EmailContent {
  const language = params.language || "es";
  const t = translationsMap[language].emailVerification;
  const dv = params.hasDataValidation ? t.dataValidation : undefined;
  // El texto propio del proyecto para el mail de validación de datos (asiento
  // src/common/emailVerification/dataValidationCopy.ts); sin él, el del generador.
  const copy: DataValidationCopy = dv ? dataValidationCopy(language) : {};
  // Un mensaje del asiento vacío o con solo espacios cuenta como que no hay.
  const projectMessage = (copy.message ?? "").trim();
  const tenantName = params.tenantName || "";
  const appName = params.appName || "Application";
  const verificationUrl = params.verificationUrl;

  // El saludo lleva el nombre del contacto si la solicitud lo trae ("Hola Ana");
  // si no, el saludo solo. Tal cual en el texto plano, escapado en el HTML.
  const recipientName = (params.recipientName ?? "").trim();
  const greeting = recipientName
    ? t.greeting + " " + recipientName
    : t.greeting;
  const greetingHtml = recipientName
    ? t.greeting + " " + escapeHtml(recipientName)
    : t.greeting;

  // El nombre va tal cual en el texto plano y en el asunto, y escapado en el HTML.
  const tenantNameHtml = escapeHtml(tenantName);
  // El logo y la dirección del sitio se usan solo si son textos: Tenant.logo_data
  // es Json? y guarda el FileData del archivo ({ name, mimetype, size, url }), no
  // una URL, y la ruta lo pasa tal cual. Si no es un texto, va el encabezado con
  // el nombre, como sin logo. Van en atributos (src, href), y la dirección también
  // como texto del link: escapados, una comilla no cierra el atributo.
  const tenantLogo =
    typeof params.tenantLogo === "string" ? params.tenantLogo : "";
  const tenantPublicUrl =
    typeof params.tenantPublicUrl === "string" ? params.tenantPublicUrl : "";
  const tenantLogoHtml = escapeHtml(tenantLogo);
  const tenantPublicUrlHtml = escapeHtml(tenantPublicUrl);
  const subject = dv?.subject || t.subject;
  const messageTemplate = (dv && projectMessage) || dv?.message || t.message;
  const message = fillMarkers(messageTemplate, { tenantName, appName });
  // El mensaje también es texto plano (el del asiento lo escribe el proyecto): en
  // el HTML se escapa entero y después los marcadores se cambian por sus valores
  // ya escapados. Las llaves no se escapan: {tenantName} y {appName} sobreviven.
  const messageHtml = fillMarkers(escapeHtml(messageTemplate), {
    tenantName: tenantNameHtml,
    appName: escapeHtml(appName),
  });
  const instruction = dv?.instruction || t.instruction;
  const buttonLabel = dv?.verifyButtonLabel || t.verifyButtonLabel;

  const htmlContent = `
    ${
      tenantLogo
        ? `<div style="text-align: center; margin-bottom: 20px;">
           <img src="${tenantLogoHtml}" alt="${tenantNameHtml}" style="max-height: 60px; max-width: 200px;">
         </div>`
        : tenantName
        ? `<div style="text-align: center; margin-bottom: 20px; font-size: 20px; font-weight: bold; color: #333;">${tenantNameHtml}</div>`
        : ""
    }

    <h2 style="color: #333; margin-bottom: 20px;">${greetingHtml}</h2>
    <p style="margin-bottom: 20px;">${messageHtml}</p>
    <p style="margin-bottom: 20px;">${instruction}</p>

    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <a href="${verificationUrl}"
         style="display: inline-block; background-color: #28a745; color: white; padding: 14px 28px;
                text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        ${buttonLabel}
      </a>
    </div>

    <p style="margin: 20px 0; color: #666; font-size: 14px;">
      ${t.linkExpiryMessage}
    </p>

    <p style="margin: 20px 0; color: #666; font-size: 12px;">
      ${t.alternativeLink}:<br>
      <a href="${verificationUrl}" style="color: #007bff; word-break: break-all;">${verificationUrl}</a>
    </p>

    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0;">
      <p style="margin: 0; color: #856404;">
        ${t.ignoreWarning}
      </p>
    </div>

    ${
      tenantPublicUrl
        ? `<p style="margin: 20px 0; color: #666; font-size: 12px; text-align: center;">
           <a href="${tenantPublicUrlHtml}" style="color: #007bff;">${
            tenantNameHtml || tenantPublicUrlHtml
          }</a>
         </p>`
        : ""
    }

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
      ${t.footer}
    </p>
  `;

  const textContent = `
${greeting}

${message}

${instruction}

${buttonLabel}: ${verificationUrl}

${t.linkExpiryMessage}

${t.alternativeLink}:
${verificationUrl}

${t.ignoreWarning}

---
${t.footer}
  `.trim();

  // El asunto del mail de validación de datos va sin el prefijo "[…]"; el de la
  // verificación simple de un email lo conserva.
  return {
    subject: dv ? subject : `[${tenantName || appName}] ${subject}`,
    text: textContent,
    html: getBaseTemplate(htmlContent, language),
  };
}
