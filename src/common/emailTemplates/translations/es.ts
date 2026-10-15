import { EmailTranslations } from "../types";

export const translations: EmailTranslations = {
  welcome: {
    subject: "Activación de tu cuenta",
    greeting: "Hola",
    message:
      "Te damos la bienvenida. Tu cuenta fue creada exitosamente. Para comenzar, tienes que crear tu contraseña.",
    activateButtonLabel: "Crear Contraseña",
    linkExpiryMessage:
      'Este enlace expira en 1 hora. Si expira, puedes solicitar uno nuevo desde "¿Olvidaste tu contraseña?" en la página de inicio de sesión.',
    alternativeLink:
      "Si el botón no funciona, se puede copiar y pegar este enlace en el navegador",
    securityWarning: "Si este correo llegó por error, se puede ignorar.",
    footer: "Mensaje automático. Este correo no recibe respuestas.",
  },
  passwordReset: {
    subject: "Restablecer Contraseña",
    greeting: "Hola",
    message: "Recibimos una solicitud para restablecer tu contraseña.",
    resetButtonLabel: "Restablecer Contraseña",
    linkExpiryMessage: "Este enlace expira en 1 hora.",
    alternativeLink:
      "Si el botón no funciona, se puede copiar y pegar este enlace en el navegador",
    securityWarning:
      "Si el cambio no fue solicitado, este correo se puede ignorar.",
    footer: "Mensaje automático. Este correo no recibe respuestas.",
  },
  emailVerification: {
    subject: "Verificación de email",
    greeting: "Hola",
    message: "{tenantName} registró tu dirección de email en {appName}.",
    instruction:
      "Para verificar que esta dirección es tuya, haz clic en el siguiente botón:",
    verifyButtonLabel: "Verificar mi email",
    linkExpiryMessage: "Este enlace expira en 72 horas.",
    alternativeLink:
      "Si el botón no funciona, se puede copiar y pegar este enlace en el navegador",
    ignoreWarning:
      "Si esta solicitud llegó por error, este correo se puede ignorar sin riesgo.",
    footer: "Mensaje automático. Este correo no recibe respuestas.",
    dataValidation: {
      subject: "Verificación de tu email y revisión de tus datos",
      message: "{tenantName} requiere que cargues y/o verifiques tus datos.",
      instruction:
        "Haz clic en el siguiente botón para verificar tu email y revisar tus datos. Vas a poder corregir cualquier información incorrecta.",
      verifyButtonLabel: "Verificar y revisar mis datos",
    },
  },
  alert: {
    ctaLabel: "Ver detalle",
    footer: "Mensaje automático. Este correo no recibe respuestas.",
  },
};
