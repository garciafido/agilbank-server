// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * El nombre con que se presenta la empresa en la verificación de email y en la
 * validación de datos de un contacto.
 *
 * En la validación de datos el nombre sale del asiento del proyecto
 * (src/common/emailVerification/senderDisplayName.ts), que el proyecto puede
 * llenar con datos que edita cualquier usuario de la empresa (el seudónimo de
 * una editorial, por ejemplo). Es texto plano, y el mail sale con la firma del
 * sitio a un contacto de afuera: un nombre con "<a href=…>" sin escapar metería
 * un link en ese mail. Por eso:
 *
 * 1. En el HTML del mail el nombre va escapado: el alt del logo, el encabezado,
 *    el mensaje y el texto del link al sitio. El logo y la dirección del sitio
 *    también, en sus atributos. En el texto plano y en el asunto va tal cual, y
 *    un "$&" no se expande. Un logo que no es un texto (Tenant.logo_data guarda
 *    el FileData del archivo) no rompe el mail: va el encabezado con el nombre.
 * 2. Si el asiento no da un nombre (vacío o solo espacios), el mail y el
 *    formulario público usan el de la empresa. La verificación simple de un
 *    email usa siempre el de la empresa.
 * 3. El saludo lleva el nombre del contacto ("Hola Ana"): el campo que declara
 *    .contactName en la configuración de la entidad, leído del registro que
 *    quedó guardado en la verificación y de la empresa de la sesión; escapado en
 *    el HTML. Sin nombre, o si leerlo falla, el saludo solo. El processor de la
 *    cola lo pasa del payload a la plantilla.
 * 4. El mensaje del mail de validación de datos puede venir de otro asiento del
 *    proyecto (src/common/emailVerification/dataValidationCopy.ts); vacío o con
 *    solo espacios, va el del generador. Es texto plano: en el HTML se escapa
 *    entero. {tenantName} y {appName} se cambian en una sola pasada, todas las
 *    veces que aparecen, por sus valores (escapados en el HTML): lo que traen
 *    esos valores no se vuelve a reemplazar.
 *
 * 5. La verificación con el link espera el evento en vivo con plazo: con un
 *    Redis que no contesta, responde igual.
 *
 * No usa base: la base, la cola de mails, el envío del mail, Redis, la sesión y
 * el asiento van simulados.
 */

import { container } from "tsyringe";
import { getEmailVerificationTemplate } from "../../src/common/emailTemplates/emailVerificationEmail";
import { generateVerificationSignature } from "../../src/common/utils/emailVerification";
import { processEmailNotification } from "../../src/workers/processors/emailProcessor";
import { logger } from "../../src/utils/logger";
import { withDeadline } from "../../src/utils/withDeadline";

const mockSender = jest.fn();
const mockEnqueue = jest.fn();
const mockVerificationFindUnique = jest.fn();
const mockContactFindFirst = jest.fn();
const mockSupplierFindFirst = jest.fn();
const mockCopy = jest.fn();
// Lo que la base guarda en la verificación además de lo que se le manda (por
// defecto, nada): así un test fija lo que quedó guardado.
const mockSaved = jest.fn();
const mockSendEmail = jest.fn();
const mockPublish = jest.fn();
const TENANT = { id: "t1", name: "EMPRESA", logo_data: null, publicUrl: null };

jest.mock("../../src/common/emailVerification/senderDisplayName", () => ({
  senderDisplayName: (...args: unknown[]) => mockSender(...args),
}));
jest.mock("../../src/common/emailVerification/dataValidationCopy", () => ({
  dataValidationCopy: (...args: unknown[]) => mockCopy(...args) ?? {},
}));
// La ruta avisa a los administradores con SSEManager: simulado, sin base ni el
// latido que dejaría a jest esperando.
jest.mock("../../src/services/sse/SSEManager", () => ({
  sseManager: {
    createAndSendNotificationToMultiple: async () => ({
      count: 0,
      notificationIds: [],
    }),
  },
}));
jest.mock("../../src/common/utils/email", () => ({
  ...jest.requireActual("../../src/common/utils/email"),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
jest.mock("../../src/prisma/client", () => ({
  basePrisma: {
    tenant: {
      findUnique: async () => ({
        id: "t1",
        name: "EMPRESA",
        logo_data: null,
        publicUrl: null,
      }),
    },
    emailVerification: {
      findUnique: (...args: unknown[]) => mockVerificationFindUnique(...args),
      update: async () => ({}),
    },
    contact: {
      findFirst: (...args: unknown[]) => mockContactFindFirst(...args),
    },
    supplier: {
      findFirst: (...args: unknown[]) => mockSupplierFindFirst(...args),
    },
  },
}));
jest.mock("../../src/services/redis/redisClient", () => ({
  redis: { publish: (...args: unknown[]) => mockPublish(...args) },
}));
jest.mock("../../src/workers/queues/emailQueue", () => ({
  enqueueVerificationEmail: (...args: unknown[]) => mockEnqueue(...args),
}));
jest.mock("../../src/service-context", () => ({
  createContext: async () => ({
    currentUser: { id: "u1", tenant_id_: "t1" },
    permissions: () => new Set(["contact_update", "supplier_update"]),
    prisma: {},
  }),
}));
jest.mock("../../src/common/services/securePrismaOps", () => ({
  SecurePrismaOps: class {
    async findFirst() {
      return null;
    }
    async create({ data }: { data: Record<string, unknown> }) {
      return { id: "v1", ...data, ...(mockSaved() ?? {}) };
    }
    async update({ data }: { data: Record<string, unknown> }) {
      return { id: "v1", ...data, ...(mockSaved() ?? {}) };
    }
  },
}));
jest.mock("../../src/common/externalValidation/registry", () => ({
  externalValidationRegistry: {
    Contact: {
      prismaModel: "contact",
      selectFields: {},
      fields: [],
      contactNameField: "firstName",
    },
    // Sin .contactName, como toda entidad del DSL que no lo declara.
    Supplier: { prismaModel: "supplier", selectFields: {}, fields: [] },
  },
}));

const NAME =
  'ALFA <a href="https://evil.example">Verificar acá</a> & "B" $& fin';
const ESCAPED =
  "ALFA &lt;a href=&quot;https://evil.example&quot;&gt;Verificar acá&lt;/a&gt; &amp; &quot;B&quot; $&amp; fin";

// Lo que guarda Tenant.logo_data (Json?): el FileData que escribe
// fileClientDataSetter, no una URL. La ruta de envío lo pasa tal cual en tenantLogo.
const LOGO_FILE_DATA = {
  name: "logo.png",
  mimetype: "image/png",
  size: 1234,
  url: "Tenant.logo",
};

const params = (
  hasDataValidation: boolean,
  extra: Record<string, unknown> = {}
) => ({
  email: "contacto@example.com",
  tenantName: NAME,
  appName: "App",
  verificationUrl: "https://example.com/verify?vid=1&sig=2",
  language: "es" as const,
  hasDataValidation,
  ...extra,
});

describe("el mail: el nombre escapado en el HTML y tal cual en el texto y el asunto", () => {
  it("validación de datos: el encabezado y el mensaje", () => {
    const mail = getEmailVerificationTemplate(params(true));
    expect(mail.html).not.toContain('<a href="https://evil.example">');
    expect(mail.html).toContain(`>${ESCAPED}</div>`);
    expect(mail.html).toContain(
      `<p style="margin-bottom: 20px;">${ESCAPED} requiere que cargues y/o verifiques tus datos.</p>`
    );
    expect(mail.text).toContain(
      `${NAME} requiere que cargues y/o verifiques tus datos.`
    );
    expect(mail.html + mail.text).not.toContain("{tenantName}");
    expect(mail.subject).toBe(
      "Verificación de tu email y revisión de tus datos"
    );
  });

  it("con logo y sitio: el alt y el texto del link", () => {
    const mail = getEmailVerificationTemplate(
      params(true, {
        tenantLogo: "https://example.com/logo.png",
        tenantPublicUrl: "https://example.com",
      })
    );
    expect(mail.html).toContain(`alt="${ESCAPED}"`);
    expect(mail.html).toContain(
      `<a href="https://example.com" style="color: #007bff;">${ESCAPED}</a>`
    );
    expect(mail.html).not.toContain('<a href="https://evil.example">');
  });

  it("el logo y la dirección del sitio van escapados en sus atributos, y la dirección también como texto del link", () => {
    const mail = getEmailVerificationTemplate(
      params(true, {
        tenantName: "",
        tenantLogo: 'https://example.com/logo.png" onerror="alert(1)<',
        tenantPublicUrl: 'https://example.com/?a=1&b="2"<x>',
      })
    );
    expect(mail.html).toContain(
      '<img src="https://example.com/logo.png&quot; onerror=&quot;alert(1)&lt;" alt=""'
    );
    const site = "https://example.com/?a=1&amp;b=&quot;2&quot;&lt;x&gt;";
    expect(mail.html).toContain(
      '<a href="' + site + '" style="color: #007bff;">' + site + "</a>"
    );
    expect(mail.html).not.toContain('onerror="');
    expect(mail.html).not.toContain("<x>");
  });

  it("un logo o un sitio que no son textos (el FileData de logo_data) no rompen el mail: sin <img> ni link, el encabezado con el nombre", () => {
    const mail = getEmailVerificationTemplate(
      params(true, {
        tenantLogo: LOGO_FILE_DATA,
        tenantPublicUrl: { url: "Tenant.site" },
      })
    );
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("[object Object]");
    expect(mail.html).not.toContain(
      'style="color: #007bff;">' + ESCAPED + "</a>"
    );
    expect(mail.html).toContain(`>${ESCAPED}</div>`);
  });

  it("lo que trae el nombre de la empresa no se vuelve a reemplazar: un {appName} en el nombre queda tal cual", () => {
    const mail = getEmailVerificationTemplate(
      params(false, { tenantName: "Ediciones {appName} & cía" })
    );
    expect(mail.text).toContain(
      "Ediciones {appName} & cía registró tu dirección de email en App."
    );
    expect(mail.html).toContain(
      "Ediciones {appName} &amp; cía registró tu dirección de email en App."
    );
  });

  it("verificación simple: el asunto con el nombre tal cual y el mensaje escapado en el HTML", () => {
    const mail = getEmailVerificationTemplate(params(false));
    expect(mail.subject).toBe(`[${NAME}] Verificación de email`);
    expect(mail.html).toContain(
      `${ESCAPED} registró tu dirección de email en App.`
    );
    expect(mail.text).toContain(
      `${NAME} registró tu dirección de email en App.`
    );
    expect(mail.html).not.toContain('<a href="https://evil.example">');
  });
});

describe("el saludo con el nombre del contacto", () => {
  const firstLine = (text: string) => text.split(String.fromCharCode(10))[0];

  it.each([
    ["es", "Hola"],
    ["en", "Hello"],
    ["pt", "Olá"],
  ] as const)(
    "%s: el saludo lleva el nombre, escapado en el HTML y tal cual en el texto",
    (language, greeting) => {
      const mail = getEmailVerificationTemplate(
        params(true, { language, recipientName: NAME })
      );
      expect(mail.html).toContain(
        '<h2 style="color: #333; margin-bottom: 20px;">' +
          greeting +
          " " +
          ESCAPED +
          "</h2>"
      );
      expect(firstLine(mail.text)).toBe(greeting + " " + NAME);
    }
  );

  it.each([[undefined], [""], ["   "]])(
    "sin nombre (%j), el saludo solo",
    (recipientName) => {
      const mail = getEmailVerificationTemplate(
        params(true, { recipientName })
      );
      expect(mail.html).toContain(
        '<h2 style="color: #333; margin-bottom: 20px;">Hola</h2>'
      );
      expect(firstLine(mail.text)).toBe("Hola");
    }
  );

  it("el nombre va recortado", () => {
    const mail = getEmailVerificationTemplate(
      params(true, { recipientName: "  Ana  " })
    );
    expect(mail.html).toContain(
      '<h2 style="color: #333; margin-bottom: 20px;">Hola Ana</h2>'
    );
    expect(firstLine(mail.text)).toBe("Hola Ana");
  });
});

describe("el mensaje del mail de validación de datos, del asiento del proyecto", () => {
  it("si el asiento da un mensaje, va ese, con el nombre de la empresa", () => {
    mockCopy.mockReturnValueOnce({
      message: "{tenantName} pide una foto de tu DNI.",
    });
    const mail = getEmailVerificationTemplate(params(true));
    expect(mail.text).toContain(NAME + " pide una foto de tu DNI.");
    expect(mail.html).toContain(ESCAPED + " pide una foto de tu DNI.");
    expect(mail.text).not.toContain("requiere que cargues");
    expect(mockCopy).toHaveBeenCalledWith("es");
  });

  it("el mensaje del asiento es texto plano: escapado entero en el HTML, tal cual en el texto", () => {
    mockCopy.mockReturnValueOnce({ message: "Hola <b>{tenantName}</b> & cía" });
    const mail = getEmailVerificationTemplate(
      params(true, { tenantName: "Ediciones <Sur>" })
    );
    expect(mail.html).toContain(
      '<p style="margin-bottom: 20px;">Hola &lt;b&gt;Ediciones &lt;Sur&gt;&lt;/b&gt; &amp; cía</p>'
    );
    expect(mail.html).not.toContain("<b>");
    expect(mail.text.split(String.fromCharCode(10))).toContain(
      "Hola <b>Ediciones <Sur></b> & cía"
    );
  });

  it("{tenantName} se cambia todas las veces que aparece, en el HTML y en el texto", () => {
    mockCopy.mockReturnValueOnce({
      message: "{tenantName} pide tu DNI; {tenantName} lo guarda.",
    });
    const mail = getEmailVerificationTemplate(params(true));
    expect(mail.text).toContain(NAME + " pide tu DNI; " + NAME + " lo guarda.");
    expect(mail.html).toContain(
      ESCAPED + " pide tu DNI; " + ESCAPED + " lo guarda."
    );
    expect(mail.html + mail.text).not.toContain("{tenantName}");
  });

  it.each([[{}], [{ message: "" }], [{ message: "   " }]])(
    "sin mensaje del asiento (%j), el del generador",
    (copy) => {
      mockCopy.mockReturnValueOnce(copy);
      expect(getEmailVerificationTemplate(params(true)).text).toContain(
        NAME + " requiere que cargues y/o verifiques tus datos."
      );
    }
  );

  it("la verificación simple no le pregunta al asiento", () => {
    getEmailVerificationTemplate(params(false));
    expect(mockCopy).not.toHaveBeenCalled();
  });
});

describe("las rutas: el nombre del asiento en la validación de datos, con respaldo al de la empresa", () => {
  let router: any;

  beforeAll(() => {
    container.register("SchemaMetadataStore", { useValue: {} });
    router = require("../../src/routes/emailVerification.routes").default;
  });

  beforeEach(() => {
    // mockReset también descarta los valores "Once" que un test dejó sin usar.
    mockSender.mockReset();
    mockSender.mockResolvedValue("EDITORIAL DEL PROYECTO");
    mockEnqueue.mockReset();
    mockVerificationFindUnique.mockReset();
    mockContactFindFirst.mockReset();
    mockSupplierFindFirst.mockReset();
    mockSaved.mockReset();
    mockPublish.mockReset();
    mockPublish.mockResolvedValue(1);
  });

  const call = async (
    method: "get" | "post",
    path: string,
    req: Record<string, unknown>
  ) => {
    const layer = router.stack.find(
      (l: any) => l.route?.path === path && l.route.methods[method]
    );
    if (!layer) {
      throw new Error(
        `emailVerification.routes no tiene la ruta ${method.toUpperCase()} ${path}: este test la llama.`
      );
    }
    let body: any;
    const res = {
      status() {
        return res;
      },
      json(value: unknown) {
        body = value;
        return res;
      },
    };
    await layer.route.stack[0].handle(
      { headers: {}, query: {}, body: {}, ...req },
      res,
      () => undefined
    );
    return body;
  };

  const sendDataValidation = () =>
    call("post", "/email-verification/send", {
      body: {
        email: "contacto@example.com",
        sourceEntity: "Contact",
        sourceRecordId: "c1",
      },
    });

  /** Un registro de verificación firmado, de validación de datos (o simple). */
  const signed = (dataValidation: boolean, status = "verified") => {
    const record = {
      id: "v1",
      email: "contacto@example.com",
      tenant_id_: "t1",
      tenant_: TENANT,
      status,
      expiresAt: new Date(Date.now() + 3600_000),
      sourceEntity: dataValidation ? "Contact" : null,
      sourceRecordId: dataValidation ? "c1" : null,
    };
    mockVerificationFindUnique.mockResolvedValue(record);
    return {
      vid: "v1",
      sig: generateVerificationSignature("v1", record.email, "t1"),
    };
  };

  it("con nombre, el del asiento: en el mail y en el formulario público", async () => {
    expect(await sendDataValidation()).toEqual({
      success: true,
      status: "sent",
    });
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      tenantName: "EDITORIAL DEL PROYECTO",
      hasDataValidation: true,
    });
    const info = await call("get", "/public/verify-email/info", {
      query: signed(true),
    });
    expect(info.tenantInfo.tenantName).toBe("EDITORIAL DEL PROYECTO");
  });

  it.each([[""], ["   "]])(
    "si el asiento devuelve %j, el de la empresa",
    async (blank) => {
      mockSender.mockResolvedValue(blank);
      expect(await sendDataValidation()).toEqual({
        success: true,
        status: "sent",
      });
      expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
        tenantName: "EMPRESA",
        hasDataValidation: true,
      });
      const info = await call("get", "/public/verify-email/info", {
        query: signed(true),
      });
      expect(info.tenantInfo.tenantName).toBe("EMPRESA");
      expect(mockSender).toHaveBeenCalledTimes(2);
    }
  );

  it("la verificación simple: el de la empresa, sin preguntarle al asiento", async () => {
    expect(
      await call("post", "/email-verification/send", {
        body: { email: "contacto@example.com", sourceEntity: "Contact" },
      })
    ).toEqual({ success: true, status: "sent" });
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      tenantName: "EMPRESA",
      hasDataValidation: false,
    });
    const verified = await call("post", "/public/verify-email", {
      body: signed(false, "pending"),
    });
    expect([verified.message, verified.tenantName]).toEqual([
      "verified",
      "EMPRESA",
    ]);
    expect(mockSender).not.toHaveBeenCalled();
  });

  it("el nombre del contacto sale del registro al que apunta la solicitud, de su empresa, y va recortado", async () => {
    mockContactFindFirst.mockResolvedValue({ firstName: "  Ana  " });
    expect(await sendDataValidation()).toEqual({
      success: true,
      status: "sent",
    });
    expect(mockEnqueue.mock.calls[0][0].recipientName).toBe("Ana");
    expect(mockContactFindFirst).toHaveBeenCalledWith({
      where: { id: "c1", tenant_id_: "t1" },
      select: { firstName: true },
    });
  });

  it.each([[null], [{ firstName: null }], [{ firstName: "   " }]])(
    "sin nombre (%j), el mail va sin recipientName",
    async (row) => {
      mockContactFindFirst.mockResolvedValue(row);
      await sendDataValidation();
      expect(mockEnqueue.mock.calls[0][0]).not.toHaveProperty("recipientName");
    }
  );

  it("la verificación simple no busca el nombre", async () => {
    await call("post", "/email-verification/send", {
      body: { email: "contacto@example.com", sourceEntity: "Contact" },
    });
    expect(mockContactFindFirst).not.toHaveBeenCalled();
    expect(mockEnqueue.mock.calls[0][0]).not.toHaveProperty("recipientName");
  });

  it("un reenvío simple sobre una verificación que fue de validación de datos tampoco busca el nombre", async () => {
    // El envío simple no toca sourceEntity ni sourceRecordId: la verificación
    // guardada sigue con los de la validación de antes.
    mockSaved.mockReturnValueOnce({
      sourceEntity: "Contact",
      sourceRecordId: "c1",
    });
    await call("post", "/email-verification/send", {
      body: { email: "contacto@example.com", sourceEntity: "Contact" },
    });
    expect(mockContactFindFirst).not.toHaveBeenCalled();
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      hasDataValidation: false,
    });
    expect(mockEnqueue.mock.calls[0][0]).not.toHaveProperty("recipientName");
  });

  it("el nombre se busca con lo que quedó guardado en la verificación y con la empresa de la sesión, no con lo que trae el cuerpo", async () => {
    // Lo que cuenta es lo guardado ("c1"), no el cuerpo, que trae otra empresa y
    // un sourceRecordId que no es un texto.
    mockSaved.mockReturnValueOnce({
      sourceEntity: "Contact",
      sourceRecordId: "c1",
    });
    mockContactFindFirst.mockResolvedValue({ firstName: "Ana" });
    expect(
      await call("post", "/email-verification/send", {
        body: {
          email: "contacto@example.com",
          sourceEntity: "Contact",
          sourceRecordId: { not: "" },
          tenantId: "t2",
          tenant_id_: "t2",
        },
      })
    ).toEqual({ success: true, status: "sent" });
    expect(mockContactFindFirst).toHaveBeenCalledWith({
      where: { id: "c1", tenant_id_: "t1" },
      select: { firstName: true },
    });
    expect(mockEnqueue.mock.calls[0][0].recipientName).toBe("Ana");
  });

  it("una entidad sin .contactName no busca el nombre y el mail va sin recipientName", async () => {
    expect(
      await call("post", "/email-verification/send", {
        body: {
          email: "contacto@example.com",
          sourceEntity: "Supplier",
          sourceRecordId: "s1",
        },
      })
    ).toEqual({ success: true, status: "sent" });
    expect(mockSupplierFindFirst).not.toHaveBeenCalled();
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      hasDataValidation: true,
    });
    expect(mockEnqueue.mock.calls[0][0]).not.toHaveProperty("recipientName");
  });

  it("si leer el nombre falla, el mail sale igual, sin nombre, y el aviso no lleva el nombre ni el id", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      mockContactFindFirst.mockRejectedValue(
        new Error(
          'Invalid contact.findFirst() invocation: { where: { id: "c1" } }'
        )
      );
      expect(await sendDataValidation()).toEqual({
        success: true,
        status: "sent",
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue.mock.calls[0][0]).not.toHaveProperty("recipientName");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("c1");
    } finally {
      warn.mockRestore();
    }
  });

  it("si leer el registro para la página falla, la página sigue en modo mail y el log no lleva contenido, solo el tipo y dónde falló", async () => {
    const error = jest
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    try {
      mockContactFindFirst.mockRejectedValueOnce(
        new Error(
          'Invalid contact.findFirst() invocation: { where: { email: "contacto@example.com" } }'
        )
      );
      const info = await call("get", "/public/verify-email/info", {
        query: signed(true, "pending"),
      });
      expect(info).toMatchObject({ success: true, mode: "emailOnly" });
      expect(error).toHaveBeenCalledWith(
        {
          entity: "Contact",
          errorType: "Error",
          errorAt: expect.arrayContaining([expect.stringMatching(/^at /)]),
        },
        "Error fetching entity for external validation"
      );
      expect(JSON.stringify(error.mock.calls)).not.toContain(
        "contacto@example.com"
      );
    } finally {
      error.mockRestore();
    }
  });

  it("la verificación con el link: si el asiento tira al armar la respuesta, ya guardada, sale igual con el nombre de la empresa", async () => {
    const error = jest
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    try {
      mockSender.mockRejectedValue(
        new Error("no se pudo leer el seudónimo para contacto@example.com")
      );
      // Recién verificada (después del update) y ya verificada de antes.
      expect(
        await call("post", "/public/verify-email", {
          body: signed(true, "pending"),
        })
      ).toMatchObject({
        success: true,
        message: "verified",
        tenantName: "EMPRESA",
      });
      expect(
        await call("post", "/public/verify-email", {
          body: signed(true, "verified"),
        })
      ).toMatchObject({
        success: true,
        message: "already_verified",
        tenantName: "EMPRESA",
      });
      expect(error).toHaveBeenCalledWith(
        {
          entity: "Contact",
          errorType: "Error",
          errorAt: expect.arrayContaining([expect.stringMatching(/^at /)]),
        },
        "Public verification: senderDisplayName failed after the commit; showing the tenant name"
      );
      expect(JSON.stringify(error.mock.calls)).not.toContain(
        "contacto@example.com"
      );
    } finally {
      error.mockRestore();
    }
  });

  it("la verificación con el link: con un Redis que no contesta, responde igual, dentro del plazo, y el log lo dice", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      mockPublish.mockImplementation(() => new Promise(() => undefined));
      // Sin plazo en la ruta, la verificación quedaría esperando a Redis: la prueba
      // le da 3 s. (Con un withDeadline roto, cae por el plazo de jest.)
      const body = await withDeadline(
        call("post", "/public/verify-email", {
          body: signed(false, "pending"),
        }),
        3000,
        "la verificación, esperando a Redis"
      );
      expect(body).toMatchObject({
        success: true,
        message: "verified",
        tenantName: "EMPRESA",
      });
      expect(mockPublish).toHaveBeenCalledTimes(1);
      // Venció el plazo: no es una falla, el evento sale cuando Redis conteste.
      expect(warn).toHaveBeenCalledWith(
        { verificationId: "v1", timeoutMs: expect.any(Number) },
        "SSE for email verification still pending after the deadline; it goes out when Redis answers"
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("el log de la ruta no lleva el mail del contacto: el envío, la información de la página, la verificación simple y sus errores", async () => {
    const [info, warn, error] = (["info", "warn", "error"] as const).map(
      (level) => jest.spyOn(logger, level).mockImplementation(() => undefined)
    );
    const logged = () =>
      JSON.stringify([info.mock.calls, warn.mock.calls, error.mock.calls]);
    // El mensaje de un error puede traer el mail: el de Prisma copia la consulta con sus valores.
    const failure = () =>
      new Error(
        'Invalid emailVerification.findUnique() invocation: { email: "contacto@example.com" }'
      );
    const failed = { success: false, error: "internal_error" };
    // Dónde falló un error: sus líneas "at" (nunca su mensaje).
    const AT = expect.arrayContaining([expect.stringMatching(/^at /)]);
    try {
      expect(await sendDataValidation()).toEqual({
        success: true,
        status: "sent",
      });
      await call("post", "/email-verification/send", {
        body: { email: "contacto@example.com", sourceEntity: "Contact" },
      });
      await call("get", "/public/verify-email/info", { query: signed(true) });
      expect(
        (
          await call("post", "/public/verify-email", {
            body: signed(false, "pending"),
          })
        ).message
      ).toBe("verified");
      expect(info).toHaveBeenCalledWith(
        { tenantId: "t1", verificationId: "v1", hasDataValidation: true },
        "Email verification sent"
      );
      expect(info).toHaveBeenCalledWith(
        { verificationId: "v1" },
        "Email verified"
      );

      mockEnqueue.mockRejectedValueOnce(failure());
      expect(await sendDataValidation()).toEqual(failed);
      const credentials = signed(false, "pending");
      mockVerificationFindUnique.mockRejectedValueOnce(failure());
      expect(
        await call("get", "/public/verify-email/info", { query: credentials })
      ).toEqual(failed);
      mockVerificationFindUnique.mockRejectedValueOnce(failure());
      expect(
        await call("post", "/public/verify-email", { body: credentials })
      ).toEqual(failed);
      expect(error).toHaveBeenCalledWith(
        { errorType: "Error", errorAt: AT },
        "Error in email-verification/send"
      );
      expect(error).toHaveBeenCalledWith(
        { errorType: "Error", errorAt: AT },
        "Error in public/verify-email/info"
      );
      expect(error).toHaveBeenCalledWith(
        { errorType: "Error", errorAt: AT },
        "Error in public/verify-email"
      );

      expect(logged()).not.toContain("contacto@example.com");
    } finally {
      for (const spy of [info, warn, error]) spy.mockRestore();
    }
  });
});

describe("el processor de la cola: el nombre del payload llega al saludo del mail enviado", () => {
  const queued = (recipientName?: string) => ({
    type: "emailVerification" as const,
    verificationId: "v1",
    email: "contacto@example.com",
    tenantId: "t1",
    tenantName: "EMPRESA",
    verificationUrl: "https://example.com/verify?vid=1&sig=2",
    requestedByUserId: "u1",
    language: "es",
    hasDataValidation: true,
    ...(recipientName === undefined ? {} : { recipientName }),
  });
  const processorContext = {
    prisma: { emailVerification: { update: async () => ({}) } },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  } as any;
  const firstLine = (text: string) => text.split(String.fromCharCode(10))[0];

  it("un payload con recipientName: el mail enviado saluda con el nombre, escapado en el HTML", async () => {
    await processEmailNotification(queued("Ana <b>"), processorContext);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.toEmail).toBe("contacto@example.com");
    expect(sent.html).toContain(
      '<h2 style="color: #333; margin-bottom: 20px;">Hola Ana &lt;b&gt;</h2>'
    );
    expect(firstLine(sent.text)).toBe("Hola Ana <b>");
  });

  it("un payload con el logo como lo guarda logo_data (un FileData, no un texto) igual manda el mail", async () => {
    await processEmailNotification(
      { ...queued("Ana"), tenantLogo: LOGO_FILE_DATA } as any,
      processorContext
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.html).not.toContain("<img");
    expect(sent.html).toContain(
      '<h2 style="color: #333; margin-bottom: 20px;">Hola Ana</h2>'
    );
  });

  it("un payload encolado antes del cambio, sin la clave: el saludo solo", async () => {
    await processEmailNotification(queued(), processorContext);
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.html).toContain(
      '<h2 style="color: #333; margin-bottom: 20px;">Hola</h2>'
    );
    expect(firstLine(sent.text)).toBe("Hola");
  });
});
