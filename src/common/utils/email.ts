import nodemailer from "nodemailer";
import { ApiError } from "../errors";
// Lo que va al log de un error, sin su mensaje (que nombra al destinatario).
import { errorKind } from "../../utils/errorKind";

export const validateEmail = (email: string): boolean => {
  // Simplified email regex without control characters
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    email
  );
};

export const emailOrNull = (email: string): string | null => {
  const normalizedEmail = email.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (validateEmail(normalizedEmail)) {
    return normalizedEmail;
  }
  return null;
};

/**
 * Un texto sin direcciones de mail: cada una pasa a ser <destinatario>. Es para el
 * mensaje del error de un envío, al que nodemailer le suma la respuesta del
 * servidor, que nombra al destinatario ("550 5.1.1 <ana@...>: Recipient address
 * rejected"). Queda lo que sirve para diagnosticar (el código, el texto del
 * servidor), y el mensaje llega así a todos lados: el log del worker,
 * WorkerEvent.error, lastEmailError_ del usuario y el aviso en vivo.
 *
 * Primero las que van entre <>, y después las sueltas. En una suelta, el
 * local-part acepta todo lo que acepta validateEmail, también el apóstrofe
 * (o'brien@...), y empieza solo al principio del texto o después de un
 * separador: así cada palabra se recorre una vez, y un mensaje largo sin espacios
 * no tarda segundos.
 */
export const withoutEmailAddresses = (text: string): string =>
  text
    .replace(/<[^\s<>@]+@[^\s<>@]+>/g, "<destinatario>")
    .replace(
      /(?<=^|[\s<>@"(),;:])[^\s<>@"(),;:]+@[^\s<>@"'(),;:]+/g,
      "<destinatario>"
    );

export const sendEmail = async ({
  toEmail,
  text,
  html,
  subject,
}: {
  toEmail: string;
  text: string;
  html: string;
  subject: string;
}) => {
  // Validate required configuration
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) {
    throw new ApiError(
      "Email configuration missing. Required: SMTP_HOST and SMTP_PORT",
      "MAIL_NOT_CONFIGURED"
    );
  }

  // Configure timeouts (in milliseconds) - MUST be outside try block for catch block usage
  const socketTimeout = process.env.SMTP_SOCKET_TIMEOUT
    ? parseInt(process.env.SMTP_SOCKET_TIMEOUT)
    : 120000; // 2 minutes default
  const connectionTimeout = process.env.SMTP_CONNECTION_TIMEOUT
    ? parseInt(process.env.SMTP_CONNECTION_TIMEOUT)
    : 90000; // 1.5 minutes default
  const greetingTimeout = process.env.SMTP_GREETING_TIMEOUT
    ? parseInt(process.env.SMTP_GREETING_TIMEOUT)
    : 30000; // 30 seconds default

  try {
    // Determine if using Gmail based on host
    const isGmail = process.env.SMTP_HOST?.toLowerCase().includes("gmail");

    // Configure TLS based on port
    let tls;
    if (process.env.SMTP_PORT === "587") {
      // Port 587 uses STARTTLS
      tls = {
        rejectUnauthorized: false,
      };
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls,
      // Add timeout configurations
      socketTimeout,
      connectionTimeout,
      greetingTimeout,
      // Gmail specific settings for better reliability
      ...(isGmail && {
        pool: true,
        maxConnections: 1,
        maxMessages: 3,
        rateDelta: 1000,
        rateLimit: 3,
      }),
    });

    let info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: toEmail,
      subject,
      text,
      html,
    });

    return info.messageId;
  } catch (error) {
    // Sin las direcciones de mail: el mensaje de nodemailer trae la respuesta del servidor.
    const message = withoutEmailAddresses(
      error instanceof Error ? error.message : "Email sending failed"
    );

    // Lo que sirve para diagnosticar: el tipo, el código y dónde falló el error, y la
    // configuración. Nunca el destinatario, el asunto ni el mensaje del error (el de
    // un servidor de correo nombra al destinatario): eso queda en el error que se tira.
    console.error("📧 Email sending failed:", {
      ...errorKind(error),
      smtp: {
        host: process.env.SMTP_HOST || "not configured",
        port: process.env.SMTP_PORT || "not configured",
        user: process.env.SMTP_USER ? "***configured***" : "not configured",
        from: process.env.SMTP_FROM || "not configured",
      },
      timeouts: {
        socket: socketTimeout + "ms",
        connection: connectionTimeout + "ms",
        greeting: greetingTimeout + "ms",
      },
    });

    // Provide helpful error message based on error type
    let enhancedMessage = message;
    if (message.includes("timeout") || message.includes("Timeout")) {
      enhancedMessage = `Email timeout: ${message}. Try increasing SMTP_SOCKET_TIMEOUT, SMTP_CONNECTION_TIMEOUT, or SMTP_GREETING_TIMEOUT environment variables.`;
    } else if (message.includes("auth") || message.includes("Authentication")) {
      enhancedMessage = `Email authentication failed: ${message}. Check SMTP_USER and SMTP_PASSWORD.`;
    } else if (
      message.includes("connect") ||
      message.includes("ECONNREFUSED")
    ) {
      enhancedMessage = `Cannot connect to email server: ${message}. Check SMTP_HOST, SMTP_PORT, and firewall settings.`;
    }

    // Del error original, solo su código y el del servidor: no el error entero, que
    // trae el mensaje con el destinatario.
    const original = error as { code?: unknown; responseCode?: unknown } | null;
    throw new ApiError(enhancedMessage, "MAIL_SEND_FAILED", {
      data: { code: original?.code, responseCode: original?.responseCode },
    });
  }
};
