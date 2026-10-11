import { EmailTranslations } from "../types";

export const translations: EmailTranslations = {
  welcome: {
    subject: "Activar su cuenta",
    greeting: "Bienvenido",
    message:
      "Su cuenta ha sido creada exitosamente. Para comenzar, debe crear su contraseña.",
    activateButtonLabel: "Crear Contraseña",
    linkExpiryMessage:
      'Este enlace expira en 1 hora. Si expira, puede solicitar uno nuevo desde "¿Olvidó su contraseña?" en la página de inicio de sesión.',
    alternativeLink:
      "Si el botón no funciona, copie y pegue este enlace en su navegador",
    securityWarning: "Si no esperaba este correo, puede ignorarlo.",
    footer: "Este es un mensaje automático. No responda a este correo.",
  },
  passwordReset: {
    subject: "Restablecer Contraseña",
    greeting: "Hola",
    message: "Recibimos una solicitud para restablecer su contraseña.",
    resetButtonLabel: "Restablecer Contraseña",
    linkExpiryMessage: "Este enlace expira en 1 hora.",
    alternativeLink:
      "Si el botón no funciona, copie y pegue este enlace en su navegador",
    securityWarning: "Si no solicitó este cambio, ignore este correo.",
    footer: "Este es un mensaje automático. No responda a este correo.",
  },
  emailVerification: {
    subject: "Verificación de correo electrónico",
    greeting: "Hola",
    message: "{tenantName} ha registrado tu dirección de email en {appName}.",
    instruction:
      "Para verificar que este correo te pertenece, haz clic en el siguiente botón:",
    verifyButtonLabel: "Verificar mi email",
    linkExpiryMessage: "Este enlace expira en 72 horas.",
    alternativeLink:
      "Si el botón no funciona, copie y pegue este enlace en su navegador",
    ignoreWarning:
      "Si no reconoces esta solicitud, puedes ignorar este correo de forma segura.",
    footer: "Este es un mensaje automático. No responda a este correo.",
    dataValidation: {
      subject: "Verifica tu email y revisa tus datos",
      message: "{tenantName} requiere que cargues y/o verifiques tus datos.",
      instruction:
        "Haz clic en el siguiente botón para verificar tu email y revisar tus datos. Podrás corregir cualquier información incorrecta.",
      verifyButtonLabel: "Verificar y revisar mis datos",
    },
  },
  alert: {
    ctaLabel: "Ver detalle",
    footer: "Este es un mensaje automático. No responda a este correo.",
  },
};
