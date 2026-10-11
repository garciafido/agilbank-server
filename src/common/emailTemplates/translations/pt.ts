import { EmailTranslations } from "../types";

export const translations: EmailTranslations = {
  welcome: {
    subject: "Ativar sua conta",
    greeting: "Bem-vindo",
    message:
      "Sua conta foi criada com sucesso. Para começar, você precisa criar sua senha.",
    activateButtonLabel: "Criar Senha",
    linkExpiryMessage:
      'Este link expira em 1 hora. Se expirar, você pode solicitar um novo em "Esqueceu sua senha?" na página de login.',
    alternativeLink:
      "Se o botão não funcionar, copie e cole este link no seu navegador",
    securityWarning: "Se você não esperava este e-mail, pode ignorá-lo.",
    footer: "Esta é uma mensagem automática. Não responda a este e-mail.",
  },
  passwordReset: {
    subject: "Redefinir Senha",
    greeting: "Olá",
    message: "Recebemos uma solicitação para redefinir sua senha.",
    resetButtonLabel: "Redefinir Senha",
    linkExpiryMessage: "Este link expira em 1 hora.",
    alternativeLink:
      "Se o botão não funcionar, copie e cole este link no seu navegador",
    securityWarning:
      "Se você não solicitou esta alteração, ignore este e-mail.",
    footer: "Esta é uma mensagem automática. Não responda a este e-mail.",
  },
  emailVerification: {
    subject: "Verificação de e-mail",
    greeting: "Olá",
    message: "{tenantName} registrou seu endereço de e-mail em {appName}.",
    instruction:
      "Para verificar que este e-mail pertence a você, clique no botão abaixo:",
    verifyButtonLabel: "Verificar meu e-mail",
    linkExpiryMessage: "Este link expira em 72 horas.",
    alternativeLink:
      "Se o botão não funcionar, copie e cole este link no seu navegador",
    ignoreWarning:
      "Se você não reconhece esta solicitação, pode ignorar este e-mail com segurança.",
    footer: "Esta é uma mensagem automática. Não responda a este e-mail.",
    dataValidation: {
      subject: "Verifique seu e-mail e revise seus dados",
      message:
        "{tenantName} requer que você cadastre e/ou verifique seus dados.",
      instruction:
        "Clique no botão abaixo para verificar seu e-mail e revisar seus dados. Você poderá corrigir qualquer informação incorreta.",
      verifyButtonLabel: "Verificar e revisar meus dados",
    },
  },
  alert: {
    ctaLabel: "Ver detalhe",
    footer: "Esta é uma mensagem automática. Não responda a este e-mail.",
  },
};
