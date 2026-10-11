// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * El envío de mails no deja en los logs el mail del destinatario, que es un dato
 * personal, ni el mensaje de un error, que puede traerlo: el de un servidor de
 * correo nombra al destinatario, y el de Prisma copia lo guardado. Cubre:
 *  - encolar (src/workers/queues/emailQueue);
 *  - el worker que procesa la cola (src/workers/processors/emailProcessor);
 *  - el envío por SMTP (src/common/utils/email);
 *  - el servicio de mails y sus providers, SMTP y SendGrid (src/utils/email).
 * Cada log lleva el trabajo, la verificación o el usuario. Un error queda con su
 * tipo, su código (un texto, o el status HTTP de SendGrid) y dónde falló (sus
 * líneas "at", src/utils/errorKind).
 *
 * El error que tira el envío por SMTP (sendEmail) no lleva direcciones de mail:
 * nodemailer le suma al mensaje la respuesta del servidor ("550 … <mail>"), y ese
 * mensaje llega al log «Job failed» del worker genérico (por serializeError),
 * a WorkerEvent.error, a lastEmailError_ del usuario y al aviso en vivo. Las
 * tapa withoutEmailAddresses: la dirección entera, con todo lo que validateEmail
 * acepta, y sin tocar un host; en un tiempo lineal, aunque el mensaje sea largo.
 *
 * No usa base ni manda mails: la base, la cola, Redis, nodemailer y SendGrid van
 * simulados.
 */

import { logger, serializeError } from "../../src/utils/logger";
import { sendEmail, withoutEmailAddresses } from "../../src/common/utils/email";
import {
  enqueueAlertEmail,
  enqueuePasswordResetEmail,
  enqueueVerificationEmail,
  enqueueWelcomeEmail,
} from "../../src/workers/queues/emailQueue";
import { processEmailNotification } from "../../src/workers/processors/emailProcessor";
import { SMTPProvider } from "../../src/utils/email/providers/smtp.provider";
import { SendGridProvider } from "../../src/utils/email/providers/sendgrid.provider";
import { EmailService } from "../../src/utils/email/email.service";

// El módulo mismo (no una copia de import *): el servicio lo usa por sus propiedades.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");

const MAIL = "destinatario@example.com";
const mockWorkerEventCreate = jest.fn();
const mockPgmqSend = jest.fn();
const mockSendMail = jest.fn();
const mockSendgridSend = jest.fn();

jest.mock("../../src/prisma/client", () => ({
  basePrisma: {
    workerEvent: {
      create: (...args: unknown[]) => mockWorkerEventCreate(...args),
    },
    // El blanqueo de clave busca la empresa del usuario.
    user: { findUnique: async () => ({ tenant_id_: "t1" }) },
  },
}));
jest.mock("../../src/utils/pgmq", () => ({
  pgmq: { send: (...args: unknown[]) => mockPgmqSend(...args) },
}));
const mockPublish = jest.fn();
jest.mock("../../src/services/redis/redisClient", () => ({
  redis: { publish: (...args: unknown[]) => mockPublish(...args) },
}));
jest.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: (...args: unknown[]) => mockSendMail(...args),
    verify: async () => true,
  }),
}));
jest.mock("@sendgrid/mail", () => ({
  setApiKey: () => undefined,
  send: (...args: unknown[]) => mockSendgridSend(...args),
}));

// Un error como el de un servidor de correo: su mensaje nombra al destinatario.
const rejected = () =>
  Object.assign(new Error(`550 5.1.1 <${MAIL}>: Recipient address rejected`), {
    code: "EENVELOPE",
  });
// Dónde falló un error: sus líneas "at".
const AT = expect.arrayContaining([expect.stringMatching(/^at /)]);

const ENV = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SENDGRID_API_KEY",
  "EMAIL_PROVIDER",
  "NODE_ENV",
  "EMAIL_REQUIRED",
] as const;
const envBefore: Record<string, string | undefined> = {};
const spies: jest.SpyInstance[] = [];
/** Lo que llegó a cualquier log en el caso: el logger del proyecto, la consola y el del worker. */
let lines: unknown[][] = [];
const workerLogger = {
  info: (...args: unknown[]) => lines.push(args),
  warn: (...args: unknown[]) => lines.push(args),
  error: (...args: unknown[]) => lines.push(args),
  debug: (...args: unknown[]) => lines.push(args),
};
const logged = () => JSON.stringify(lines);
/** Las llamadas a un log con ese mensaje (el segundo argumento). */
const callsWith = (message: string) =>
  lines.filter((args) => args[1] === message || args[0] === message);

beforeAll(() => {
  for (const name of ENV) envBefore[name] = process.env[name];
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SENDGRID_API_KEY = "SG.prueba";
  process.env.EMAIL_PROVIDER = "smtp";
  delete process.env.EMAIL_REQUIRED;
});

afterAll(() => {
  for (const name of ENV) {
    if (envBefore[name] === undefined) delete process.env[name];
    else process.env[name] = envBefore[name];
  }
});

beforeEach(() => {
  lines = [];
  for (const level of ["info", "warn", "error", "debug"] as const) {
    spies.push(
      jest
        .spyOn(logger, level)
        .mockImplementation(((...args: unknown[]) => lines.push(args)) as any)
    );
  }
  spies.push(
    jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => lines.push(args))
  );
  // El servicio guarda en un archivo lo que no pudo mandar: acá no se escribe nada.
  spies.push(
    jest.spyOn(fs, "appendFileSync").mockImplementation(() => undefined)
  );
  mockWorkerEventCreate.mockReset();
  mockWorkerEventCreate.mockResolvedValue({ id: "w1" });
  mockPgmqSend.mockReset();
  mockPgmqSend.mockResolvedValue(1);
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: "m1" });
  mockSendgridSend.mockReset();
  mockSendgridSend.mockResolvedValue([{ statusCode: 202 }]);
  mockPublish.mockReset();
  mockPublish.mockResolvedValue(1);
});

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

const verification = {
  verificationId: "v1",
  email: MAIL,
  tenantId: "t1",
  tenantName: "EMPRESA",
  verificationUrl: "https://example.com/verify?vid=v1&sig=s",
  requestedByUserId: "u1",
  language: "es",
};

describe("encolar", () => {
  it("los cuatro tipos dejan en el log el trabajo y quién lo pidió, sin el mail", async () => {
    await enqueueWelcomeEmail("u1", MAIL, "token");
    await enqueuePasswordResetEmail("u1", MAIL, "token");
    await enqueueVerificationEmail(verification);
    await enqueueAlertEmail({
      email: MAIL,
      userId: "u1",
      subject: "Aviso",
      title: "Aviso",
    });
    expect(callsWith("Welcome email enqueued")).toEqual([
      [
        { userId: "u1", type: "welcome", workerEventId: "w1" },
        "Welcome email enqueued",
      ],
    ]);
    expect(callsWith("Verification email enqueued")).toEqual([
      [
        {
          verificationId: "v1",
          type: "emailVerification",
          workerEventId: "w1",
        },
        "Verification email enqueued",
      ],
    ]);
    expect(callsWith("Alert email enqueued")).toEqual([
      [
        { userId: "u1", type: "alert", workerEventId: "w1" },
        "Alert email enqueued",
      ],
    ]);
    expect(lines).toHaveLength(4);
    expect(logged()).not.toContain(MAIL);
  });

  it("si encolar falla: el tipo, el código y dónde falló, sin el mail", async () => {
    mockPgmqSend.mockRejectedValue(rejected());
    await expect(enqueueWelcomeEmail("u1", MAIL, "token")).rejects.toThrow();
    await expect(
      enqueuePasswordResetEmail("u1", MAIL, "token")
    ).rejects.toThrow();
    await expect(enqueueVerificationEmail(verification)).rejects.toThrow();
    await expect(
      enqueueAlertEmail({
        email: MAIL,
        userId: "u1",
        subject: "Aviso",
        title: "Aviso",
      })
    ).rejects.toThrow();
    expect(callsWith("Failed to enqueue verification email")).toEqual([
      [
        {
          verificationId: "v1",
          errorType: "Error",
          errorCode: "EENVELOPE",
          errorAt: AT,
        },
        "Failed to enqueue verification email",
      ],
    ]);
    for (const message of [
      "Failed to enqueue welcome email",
      "Failed to enqueue password reset email",
      "Failed to enqueue alert email",
    ]) {
      expect(callsWith(message)).toEqual([
        [
          {
            userId: "u1",
            errorType: "Error",
            errorCode: "EENVELOPE",
            errorAt: AT,
          },
          message,
        ],
      ]);
    }
    expect(logged()).not.toContain(MAIL);
  });
});

describe("el error que tira el envío por SMTP (sendEmail)", () => {
  // Como lo arma nodemailer: su mensaje más la respuesta del servidor, que nombra al destinatario.
  const smtpRejected = () =>
    Object.assign(
      new Error(
        `Can't send mail - all recipients were rejected: 550 5.1.1 <${MAIL}>: Recipient address rejected`
      ),
      {
        code: "EENVELOPE",
        responseCode: 550,
      }
    );

  it("no lleva el mail y conserva el 550 y el texto del servidor; lo que recibiría el log «Job failed» del worker, tampoco", async () => {
    mockSendMail.mockRejectedValue(smtpRejected());
    const error = await sendEmail({
      toEmail: MAIL,
      subject: "Hola",
      text: "Hola",
      html: "<p>Hola</p>",
    }).then(
      () => {
        throw new Error("no falló");
      },
      (e) => e
    );
    expect(error.message).toContain(
      "550 5.1.1 <destinatario>: Recipient address rejected"
    );
    expect(error.message).not.toContain(MAIL);
    // Del error original, solo su código y el del servidor.
    expect(error.extensions.data).toEqual({
      code: "EENVELOPE",
      responseCode: 550,
    });
    // El worker genérico loguea «Job failed» con err: error, que pasa por serializeError.
    const serialized = JSON.stringify(serializeError(error));
    expect(serialized).toContain("550");
    expect(serialized).not.toContain(MAIL);
  });

  it("tampoco lo lleva lo que guarda el worker de la cola: WorkerEvent.error, lastEmailError_ y el aviso en vivo", async () => {
    mockSendMail.mockRejectedValue(smtpRejected());
    const workerEventUpdate = jest.fn(async () => ({}));
    const userUpdate = jest.fn(async () => ({}));
    const prisma = {
      workerEvent: { update: workerEventUpdate },
      emailVerification: { update: async () => ({}) },
      user: { findUnique: async () => ({ name: "Ana" }), update: userUpdate },
    };
    const context = { prisma, logger: workerLogger } as any;
    for (const payload of [
      {
        type: "emailVerification" as const,
        ...verification,
        workerEventId: "w1",
      },
      {
        type: "welcome" as const,
        userId: "u1",
        email: MAIL,
        token: "t",
        workerEventId: "w2",
      },
    ]) {
      await expect(
        processEmailNotification(payload as any, context)
      ).rejects.toThrow(/550/);
    }
    const failed = workerEventUpdate.mock.calls
      .map((c: any[]) => c[0].data)
      .filter((data: any) => data.status === "failed");
    expect(failed).toHaveLength(2);
    for (const data of failed) {
      expect(data.error.message).toContain("550");
      expect(JSON.stringify(data.error)).not.toContain(MAIL);
    }
    const lastEmailError = userUpdate.mock.calls
      .map((c: any[]) => c[0].data.lastEmailError_)
      .filter(Boolean);
    expect(lastEmailError).toHaveLength(1);
    expect(lastEmailError[0]).toContain("550");
    expect(lastEmailError[0]).not.toContain(MAIL);
    // El aviso en vivo de la verificación que falló: su error, sin el mail.
    const events = mockPublish.mock.calls.map((c: unknown[]) =>
      JSON.parse(c[1] as string)
    );
    const failure = events.find(
      (e: any) => e.type === "emailVerification.failed"
    );
    expect(failure.payload.error).toContain("550");
    expect(failure.payload.error).not.toContain(MAIL);
  });
});

describe("las direcciones en el mensaje de un error (withoutEmailAddresses)", () => {
  it.each([
    // Un apóstrofe en el local-part, que validateEmail acepta: la dirección entera.
    ["un apóstrofe, suelta", "o'brien@example.com", "<destinatario>"],
    [
      "un apóstrofe, entre comillas (el Invalid recipient de nodemailer)",
      'Invalid recipient "d\'angelo@x.org"',
      'Invalid recipient "<destinatario>"',
    ],
    [
      "todo lo que validateEmail acepta en el local-part",
      "x!#$%&'*+/=?^_`{|}~-y@e.com",
      "<destinatario>",
    ],
    [
      "un subdominio y un +",
      "550 5.1.1 <ana.perez+tag@mail.sub.example.co.uk>: Recipient address rejected",
      "550 5.1.1 <destinatario>: Recipient address rejected",
    ],
    [
      "un subdominio y un +, suelta",
      "Mailbox ana.perez+tag@mail.sub.example.co.uk unavailable",
      "Mailbox <destinatario> unavailable",
    ],
    [
      "mayúsculas",
      "550 5.1.1 <Ana.Perez@EXAMPLE.COM>: User unknown",
      "550 5.1.1 <destinatario>: User unknown",
    ],
    [
      "varias, y un apóstrofe que no es de una dirección",
      "Can't send mail - all recipients were rejected: 550 <a@b.com>, <c@d.org>",
      "Can't send mail - all recipients were rejected: 550 <destinatario>, <destinatario>",
    ],
    [
      "entre comillas dobles",
      'Recipient "ana@example.com" rejected',
      'Recipient "<destinatario>" rejected',
    ],
    // Entre comillas simples la de adelante se va con la dirección: un local-part puede empezar con un apóstrofe.
    [
      "entre comillas simples",
      "550 5.1.1 'ana@example.com' bad",
      "550 5.1.1 <destinatario>' bad",
    ],
  ])("tapa la dirección entera: %s", (_case, text, expected) => {
    expect(withoutEmailAddresses(text)).toBe(expected);
  });

  it.each([
    ["getaddrinfo ENOTFOUND smtp.example.com"],
    ["connect ECONNREFUSED 127.0.0.1:587"],
    ["Connection to smtp.example.com:587 failed"],
    [
      "Invalid login: 535-5.7.8 Username and Password not accepted. For more information go to https://support.google.com/mail/?p=BadCredentials",
    ],
    ["pre @ post, @home, trailing@"],
  ])("no toca un host ni una @ suelta: %s", (text) => {
    expect(withoutEmailAddresses(text)).toBe(text);
  });

  it("un mensaje de 100 000 caracteres sin espacios tarda menos de 100 ms", () => {
    const text = "a".repeat(100_000);
    const start = process.hrtime.bigint();
    const result = withoutEmailAddresses(text);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(result).toBe(text);
    // Una dirección empieza solo al principio o después de un separador, así que cada
    // palabra se recorre una vez: ~1 ms. Si se probara arrancar en cada letra, ~9 s.
    expect(ms).toBeLessThan(100);
  });
});

describe("el worker de la cola", () => {
  const prisma = {
    workerEvent: { update: async () => ({}) },
    emailVerification: { update: async () => ({}) },
    user: {
      findUnique: async () => ({ name: "Ana" }),
      update: async () => ({}),
    },
  };
  const context = { prisma, logger: workerLogger } as any;
  const queued = {
    type: "emailVerification" as const,
    ...verification,
    workerEventId: "w1",
    _retryAttempt: 1,
  };

  it("procesa y manda: el log lleva el trabajo y la verificación, sin el mail", async () => {
    await processEmailNotification(queued, context);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(MAIL);
    expect(callsWith("Email sent successfully")).toEqual([
      [
        {
          type: "emailVerification",
          userId: "u1",
          verificationId: "v1",
          workerEventId: "w1",
          duration: expect.any(Number),
        },
        "Email sent successfully",
      ],
    ]);
    expect(logged()).not.toContain(MAIL);
  });

  it.each([
    ["una verificación", queued],
    [
      "un mail de bienvenida",
      {
        type: "welcome" as const,
        userId: "u1",
        email: MAIL,
        token: "t",
        workerEventId: "w1",
      },
    ],
  ])(
    "si el envío falla (%s): el error con su tipo, su código y dónde falló, sin el mail ni su mensaje",
    async (_what, payload) => {
      mockSendMail.mockRejectedValue(rejected());
      await expect(
        processEmailNotification(payload as any, context)
      ).rejects.toThrow();
      const [failed] = callsWith("Failed to send email");
      expect(failed[0]).toMatchObject({
        type: payload.type,
        workerEventId: "w1",
        errorType: expect.any(String),
        errorAt: AT,
      });
      // El envío por SMTP también lo deja en la consola: sin el destinatario, el asunto ni el mensaje.
      const [smtp] = callsWith("📧 Email sending failed:");
      expect(smtp[1]).toMatchObject({
        errorType: "Error",
        errorCode: "EENVELOPE",
        errorAt: AT,
      });
      expect(smtp[1]).not.toHaveProperty("to");
      expect(smtp[1]).not.toHaveProperty("subject");
      expect(logged()).not.toContain(MAIL);
      expect(logged()).not.toContain("Recipient address rejected");
    }
  );
});

describe("el servicio de mails y sus providers", () => {
  const options = { to: MAIL, subject: "Hola Ana", html: "<p>Hola</p>" };

  it("SMTP y SendGrid, cuando mandan: sin el destinatario ni el asunto", async () => {
    await new SMTPProvider().send(options);
    await new SendGridProvider().send(options);
    expect(callsWith("Email sent via SMTP")).toEqual([
      [{ messageId: "m1" }, "Email sent via SMTP"],
    ]);
    expect(callsWith("Email sent via SendGrid")).toEqual([
      ["Email sent via SendGrid"],
    ]);
    expect(logged()).not.toContain(MAIL);
    expect(logged()).not.toContain("Hola Ana");
  });

  it("SMTP, SendGrid y el servicio, cuando fallan: el tipo, el código y dónde falló, sin el destinatario", async () => {
    mockSendMail.mockRejectedValue(rejected());
    mockSendgridSend.mockRejectedValue(rejected());
    await expect(new SMTPProvider().send(options)).rejects.toThrow();
    await expect(new SendGridProvider().send(options)).rejects.toThrow();
    await new EmailService().send(options);
    const failure = { errorType: "Error", errorCode: "EENVELOPE", errorAt: AT };
    expect(callsWith("Failed to send email via SMTP")).toEqual([
      [failure, "Failed to send email via SMTP"],
      [failure, "Failed to send email via SMTP"],
    ]);
    expect(callsWith("Failed to send email via SendGrid")).toEqual([
      [failure, "Failed to send email via SendGrid"],
    ]);
    expect(callsWith("Email sending failed, saving to fallback file")).toEqual([
      [failure, "Email sending failed, saving to fallback file"],
    ]);
    expect(logged()).not.toContain(MAIL);
  });

  it("un error de SendGrid deja su status HTTP como código (un número)", async () => {
    mockSendgridSend.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { code: 401 })
    );
    await expect(new SendGridProvider().send(options)).rejects.toThrow();
    expect(callsWith("Failed to send email via SendGrid")).toEqual([
      [
        { errorType: "Error", errorCode: 401, errorAt: AT },
        "Failed to send email via SendGrid",
      ],
    ]);
  });
});
