// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
// Los tests propios del proyecto van en tests/custom/, que el generador nunca toca.
//
// El nombre visible del server (src/entities/<entidad>/resolvers/displayId.ts)
// es el mismo que muestra el cliente (displayNameClient.ts: la misma expresión
// que <Entidad>CommonStore.ts del cliente). No toca la base.

import { Decimal } from "@prisma/client/runtime/client";
import * as displayNameClient from "./displayNameClient";
import * as abStatementDisplayIdModule from "../../src/entities/abStatement/resolvers/displayId";
import * as abConceptCorrectionDisplayIdModule from "../../src/entities/abConceptCorrection/resolvers/displayId";
import * as userDisplayIdModule from "../../src/entities/user/resolvers/displayId";
import * as roleDisplayIdModule from "../../src/entities/role/resolvers/displayId";
import * as permissionDisplayIdModule from "../../src/entities/permission/resolvers/displayId";
import * as tenantDisplayIdModule from "../../src/entities/tenant/resolvers/displayId";
import * as workerEventDisplayIdModule from "../../src/entities/workerEvent/resolvers/displayId";
import * as integrationClientDisplayIdModule from "../../src/entities/integrationClient/resolvers/displayId";
import * as idempotencyRecordDisplayIdModule from "../../src/entities/idempotencyRecord/resolvers/displayId";
import * as userNotificationDisplayIdModule from "../../src/entities/userNotification/resolvers/displayId";
import * as userNotificationPreferenceDisplayIdModule from "../../src/entities/userNotificationPreference/resolvers/displayId";
import * as emailVerificationDisplayIdModule from "../../src/entities/emailVerification/resolvers/displayId";

type Language = displayNameClient.ClientLanguage;
const LANGUAGES: Language[] = ["es"];
const EMPTY = "∅";

type Column = {
  type: string;
  nullable: boolean;
  json?: Record<string, unknown>;
};
type Relation = { entity: string; multi: boolean; nullable: boolean };

/** Las columnas y referencias de cada entidad según el DSL. */
const MODEL: Record<
  string,
  { columns: Record<string, Column>; relations: Record<string, Relation> }
> = {
  AbStatement: {
    columns: {
      id: { type: "Id", nullable: false },
      file: { type: "File", nullable: false },
      originalName: { type: "String", nullable: false },
      contentHash: { type: "String", nullable: true },
      status: { type: "__Enum", nullable: false },
      verdict: { type: "String", nullable: true },
      bankCode: { type: "String", nullable: true },
      cbu: { type: "String", nullable: true },
      periodFrom: { type: "Date", nullable: true },
      periodTo: { type: "Date", nullable: true },
      openingBalance: { type: "Decimal", nullable: true },
      closingBalance: { type: "Decimal", nullable: true },
      lineCount: { type: "Int", nullable: true },
      declaredAccount: { type: "Json", nullable: true },
      reading: { type: "Json", nullable: true },
      error: { type: "String", nullable: true },
      processedAt: { type: "DateTime", nullable: true },
    },
    relations: {},
  },
  AbConceptCorrection: {
    columns: {
      id: { type: "Id", nullable: false },
      bankCode: { type: "String", nullable: true },
      operationCode: { type: "String", nullable: true },
      bankText: { type: "String", nullable: false },
      canonicalType: { type: "String", nullable: false },
      rate: { type: "Decimal", nullable: true },
      review: { type: "__Enum", nullable: false },
      reviewedAt: { type: "DateTime", nullable: true },
    },
    relations: {},
  },
  User: {
    columns: {
      id: { type: "Id", nullable: false },
      tenantDisplayName: { type: "String", nullable: true },
      email: { type: "String", nullable: false },
      name: { type: "String", nullable: false },
      active: { type: "Boolean", nullable: false },
      language: { type: "__Enum", nullable: false },
      avatar: { type: "File", nullable: true },
      cellphone: { type: "String", nullable: true },
      twoFaseAuth: { type: "Boolean", nullable: true },
      twoFaSecret: { type: "String", nullable: true },
      twoFaBackupCodes: { type: "String", nullable: true },
      twoFaVerifiedAt: { type: "DateTime", nullable: true },
      passwordResetToken: { type: "String", nullable: true },
      passwordResetExpiresAt: { type: "DateTime", nullable: true },
      profile: { type: "Json", nullable: true },
    },
    relations: {
      targetTenant: { entity: "Tenant", multi: false, nullable: true },
      roles: { entity: "Role", multi: true, nullable: true },
    },
  },
  Role: {
    columns: {
      id: { type: "Id", nullable: false },
      name: { type: "String", nullable: false },
      isForAllTenants: { type: "Boolean", nullable: false },
    },
    relations: {
      permissions: { entity: "Permission", multi: true, nullable: true },
    },
  },
  Permission: {
    columns: {
      id: { type: "Id", nullable: false },
      name: { type: "String", nullable: false },
    },
    relations: {},
  },
  Tenant: {
    columns: {
      id: { type: "Id", nullable: false },
      name: { type: "String", nullable: false },
      taxId: { type: "String", nullable: true },
      status: { type: "__Enum", nullable: false },
      ivaCondition: { type: "__Enum", nullable: false },
      grossReceiptsJurisdiction: { type: "String", nullable: true },
      withholdingAgent: { type: "Boolean", nullable: false },
      imputationMinConfidence: { type: "Int", nullable: true },
      logo: { type: "File", nullable: true },
    },
    relations: {},
  },
  WorkerEvent: {
    columns: {
      id: { type: "Id", nullable: false },
      queueName: { type: "String", nullable: false },
      jobType: { type: "String", nullable: false },
      status: { type: "String", nullable: false },
      enqueuedAt: { type: "DateTime", nullable: false },
      startedAt: { type: "DateTime", nullable: true },
      completedAt: { type: "DateTime", nullable: true },
      payload: { type: "Json", nullable: false },
      result: { type: "Json", nullable: true },
      error: { type: "Json", nullable: true },
      retryCount: { type: "Int", nullable: false },
      manualRetryCount: { type: "Int", nullable: false },
      nextRetryAt: { type: "DateTime", nullable: true },
      duration: { type: "Int", nullable: true },
      correlationId: { type: "String", nullable: true },
    },
    relations: {
      triggerUserId: { entity: "User", multi: false, nullable: false },
    },
  },
  IntegrationClient: {
    columns: {
      id: { type: "Id", nullable: false },
      name: { type: "String", nullable: false },
      tokenHash: { type: "String", nullable: false },
      scopes: { type: "String", nullable: false },
      status: { type: "__Enum", nullable: false },
      expiresAt: { type: "DateTime", nullable: true },
    },
    relations: {
      serviceUser: { entity: "User", multi: false, nullable: false },
    },
  },
  IdempotencyRecord: {
    columns: {
      id: { type: "Id", nullable: false },
      client: { type: "String", nullable: false },
      key: { type: "String", nullable: false },
      bodyHash: { type: "String", nullable: false },
      status: { type: "__Enum", nullable: false },
      result: { type: "Json", nullable: true },
      failureReason: { type: "String", nullable: true },
      completedAt: { type: "DateTime", nullable: true },
    },
    relations: {},
  },
  UserNotification: {
    columns: {
      id: { type: "Id", nullable: false },
      type: { type: "__Enum", nullable: false },
      priority: { type: "__Enum", nullable: true },
      title: { type: "String", nullable: false },
      body: { type: "String", nullable: true },
      objectType: { type: "String", nullable: true },
      objectId: { type: "String", nullable: true },
      actionUrl: { type: "String", nullable: true },
      readAt: { type: "DateTime", nullable: true },
      notificationCreatedAt: { type: "DateTime", nullable: true },
      archivedAt: { type: "DateTime", nullable: true },
      metadata: { type: "Json", nullable: true },
    },
    relations: { actorUser: { entity: "User", multi: false, nullable: true } },
  },
  UserNotificationPreference: {
    columns: {
      id: { type: "Id", nullable: false },
      notificationType: { type: "__Enum", nullable: false },
      inAppEnabled: { type: "Boolean", nullable: false },
      emailEnabled: { type: "Boolean", nullable: false },
      emailFrequency: { type: "__Enum", nullable: false },
    },
    relations: {},
  },
  EmailVerification: {
    columns: {
      id: { type: "Id", nullable: false },
      email: { type: "String", nullable: false },
      status: { type: "__Enum", nullable: false },
      expiresAt: { type: "DateTime", nullable: false },
      sentAt: { type: "DateTime", nullable: true },
      verifiedAt: { type: "DateTime", nullable: true },
      sentCount: { type: "Int", nullable: false },
      lastSentAt: { type: "DateTime", nullable: true },
      sourceEntity: { type: "String", nullable: true },
      sourceRecordId: { type: "String", nullable: true },
      validationChanges: { type: "Json", nullable: true },
      validationSubmittedAt: { type: "DateTime", nullable: true },
    },
    relations: {
      requestedBy: { entity: "User", multi: false, nullable: false },
    },
  },
};

type Server = {
  entity: string;
  fragments: object;
  name: (instance: any) => string | Record<Language, string>;
  text: (instance: any) => string;
  byLanguage: boolean;
  hops: number;
};
type Compared = Server & {
  client: (source: any, langStore: displayNameClient.ClientLangStore) => string;
};

/** Las entidades cuyo nombre se compara con el del cliente. */
const COMPARED: Compared[] = [
  {
    entity: "AbStatement",
    fragments: abStatementDisplayIdModule.abStatementDisplayIdFragments,
    name: abStatementDisplayIdModule.abStatementDisplayName,
    text: abStatementDisplayIdModule.abStatementDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.abStatementDisplayId,
  },
  {
    entity: "AbConceptCorrection",
    fragments:
      abConceptCorrectionDisplayIdModule.abConceptCorrectionDisplayIdFragments,
    name: abConceptCorrectionDisplayIdModule.abConceptCorrectionDisplayName,
    text: abConceptCorrectionDisplayIdModule.abConceptCorrectionDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.abConceptCorrectionDisplayId,
  },
  {
    entity: "User",
    fragments: userDisplayIdModule.userDisplayIdFragments,
    name: userDisplayIdModule.userDisplayName,
    text: userDisplayIdModule.userDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.userDisplayId,
  },
  {
    entity: "Role",
    fragments: roleDisplayIdModule.roleDisplayIdFragments,
    name: roleDisplayIdModule.roleDisplayName,
    text: roleDisplayIdModule.roleDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.roleDisplayId,
  },
  {
    entity: "Permission",
    fragments: permissionDisplayIdModule.permissionDisplayIdFragments,
    name: permissionDisplayIdModule.permissionDisplayName,
    text: permissionDisplayIdModule.permissionDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.permissionDisplayId,
  },
  {
    entity: "Tenant",
    fragments: tenantDisplayIdModule.tenantDisplayIdFragments,
    name: tenantDisplayIdModule.tenantDisplayName,
    text: tenantDisplayIdModule.tenantDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.tenantDisplayId,
  },
  {
    entity: "WorkerEvent",
    fragments: workerEventDisplayIdModule.workerEventDisplayIdFragments,
    name: workerEventDisplayIdModule.workerEventDisplayName,
    text: workerEventDisplayIdModule.workerEventDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.workerEventDisplayId,
  },
  {
    entity: "IntegrationClient",
    fragments:
      integrationClientDisplayIdModule.integrationClientDisplayIdFragments,
    name: integrationClientDisplayIdModule.integrationClientDisplayName,
    text: integrationClientDisplayIdModule.integrationClientDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.integrationClientDisplayId,
  },
  {
    entity: "IdempotencyRecord",
    fragments:
      idempotencyRecordDisplayIdModule.idempotencyRecordDisplayIdFragments,
    name: idempotencyRecordDisplayIdModule.idempotencyRecordDisplayName,
    text: idempotencyRecordDisplayIdModule.idempotencyRecordDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.idempotencyRecordDisplayId,
  },
  {
    entity: "UserNotification",
    fragments:
      userNotificationDisplayIdModule.userNotificationDisplayIdFragments,
    name: userNotificationDisplayIdModule.userNotificationDisplayName,
    text: userNotificationDisplayIdModule.userNotificationDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.userNotificationDisplayId,
  },
  {
    entity: "UserNotificationPreference",
    fragments:
      userNotificationPreferenceDisplayIdModule.userNotificationPreferenceDisplayIdFragments,
    name: userNotificationPreferenceDisplayIdModule.userNotificationPreferenceDisplayName,
    text: userNotificationPreferenceDisplayIdModule.userNotificationPreferenceDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.userNotificationPreferenceDisplayId,
  },
  {
    entity: "EmailVerification",
    fragments:
      emailVerificationDisplayIdModule.emailVerificationDisplayIdFragments,
    name: emailVerificationDisplayIdModule.emailVerificationDisplayName,
    text: emailVerificationDisplayIdModule.emailVerificationDisplayId,
    byLanguage: false,
    hops: 0,
    client: displayNameClient.emailVerificationDisplayId,
  },
];

/** Las que no se pueden comparar, y por qué: se verifican solo del lado del server. */
const SERVER_ONLY: Array<Server & { why: string }> = [];

const ALL: Server[] = [...COMPARED, ...SERVER_ONLY];

/** Las que muestran un instante: su texto (<entidad>DisplayId) sale en la zona del proceso, su nombre en la del proyecto. */
const ZONE_DEPENDENT: string[] = ["WorkerEvent"];

type Variant = "lleno" | "vacío" | "en blanco";
const VARIANTS: Variant[] = ["lleno", "vacío", "en blanco"];

function sample(
  entity: string,
  key: string,
  column: Column,
  variant: Variant
): unknown {
  // Un día vacío da el símbolo de vacío en el cliente y en el server, como los demás
  // tipos. Un instante vacío no: el cliente muestra 31/12/1969 (graphqlToDateTime(null))
  // y el server el símbolo, así que los dateTime quedan siempre con valor.
  const instant = column.type === "DateTime";
  if (variant === "vacío" && column.nullable && !instant) return null;
  switch (column.type) {
    case "Int":
      return 7;
    case "Decimal":
      return new Decimal("12.5");
    case "Boolean":
      return true;
    case "Date":
      // Lo que da Prisma de una columna date: la medianoche UTC del día.
      return new Date("2026-03-15T00:00:00.000Z");
    case "DateTime":
      return new Date("2026-03-15T14:30:00.000Z");
    case "Json":
      return column.json ?? {};
    case "String":
      return variant === "en blanco" ? "  " : `${entity}.${key}`;
    default:
      return `${entity}.${key}`;
  }
}

/** Un registro con todas sus columnas, y sus referencias hasta `hops` relaciones de distancia. */
function full(
  entity: string,
  hops: number,
  variant: Variant
): Record<string, unknown> {
  const { columns, relations } = MODEL[entity];
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns))
    out[key] = sample(entity, key, column, variant);
  if (hops === 0) return out;
  for (const [key, relation] of Object.entries(relations)) {
    if (relation.multi) {
      out[key] =
        variant === "vacío"
          ? []
          : [
              full(relation.entity, hops - 1, variant),
              full(relation.entity, hops - 1, variant),
            ];
    } else {
      out[key] =
        variant === "vacío" && relation.nullable
          ? null
          : full(relation.entity, hops - 1, variant);
    }
  }
  return out;
}

/** Lo que Prisma devuelve de ese registro con ese select. */
function pick(entity: string, row: any, select: object): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map((item) => pick(entity, item, select));
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    const relation = MODEL[entity].relations[key];
    if (!(key in MODEL[entity].columns) && !relation) {
      throw new Error(
        `${entity}.${key}: los fragments piden algo que la entidad no tiene`
      );
    }
    out[key] =
      spec === true || !relation
        ? row[key]
        : pick(relation.entity, row[key], (spec as { select: object }).select);
  }
  return out;
}

/** El mismo registro como lo recibe el cliente por GraphQL: fechas ISO, decimales como texto. */
const wire = (row: object) => JSON.parse(JSON.stringify(row));

/** El texto con JSON embebido en un idioma, como langStore.displayIdByLang del cliente. */
function byLang(text: string, lang: Language): string {
  if (!text.includes('{{"')) return text;
  return text.replace(
    /{{(.+?)}}/g,
    (match) => JSON.parse(`{${match.slice(2, -2)}}`)[lang]
  );
}

const inLanguage = (name: string | Record<Language, string>, lang: Language) =>
  typeof name === "string" ? name : name[lang];

describe("el nombre visible del server es el que muestra el cliente", () => {
  it.each(COMPARED.map((s) => [s.entity, s] as const))("%s", (_entity, s) => {
    for (const variant of VARIANTS) {
      const row = full(s.entity, s.hops, variant);
      const name = s.name(pick(s.entity, row, s.fragments));
      for (const lang of LANGUAGES) {
        const shown = s.client(
          wire(row),
          displayNameClient.clientLangStore(lang)
        );
        expect({
          entity: s.entity,
          variant,
          lang,
          name: inLanguage(name, lang),
        }).toEqual({ entity: s.entity, variant, lang, name: shown });
      }
    }
  });
});

describe("con todo cargado, el nombre y el texto no tienen huecos", () => {
  it.each(ALL.map((s) => [s.entity, s] as const))("%s", (_entity, s) => {
    const instance = pick(
      s.entity,
      full(s.entity, s.hops, "lleno"),
      s.fragments
    );
    const name = s.name(instance);
    const shown = [
      ...LANGUAGES.map((lang) => inLanguage(name, lang)),
      s.text(instance),
    ];
    for (const hole of [EMPTY, "undefined", "[object Object]"]) {
      expect({
        entity: s.entity,
        hole,
        has: shown.some((t) => t.includes(hole)),
      }).toEqual({ entity: s.entity, hole, has: false });
    }
  });
});

describe("<entidad>DisplayName: un texto, o uno por idioma si la regla usa un multilingüe", () => {
  it.each(ALL.map((s) => [s.entity, s] as const))("%s", (_entity, s) => {
    const name = s.name(
      pick(s.entity, full(s.entity, s.hops, "lleno"), s.fragments)
    );
    if (s.byLanguage) {
      expect(typeof name).toBe("object");
      expect(Object.keys(name).sort()).toEqual([...LANGUAGES].sort());
    } else {
      expect(typeof name).toBe("string");
    }
  });
});

// <entidad>DisplayId es lo que usan los resolvers de proyecciones (un campo
// String de GraphQL) y el código del proyecto que guarda nombres en campos de texto.
describe("<entidad>DisplayId sigue siendo texto", () => {
  it.each(ALL.map((s) => [s.entity, s] as const))("%s", (_entity, s) => {
    for (const variant of VARIANTS) {
      const row = full(s.entity, s.hops, variant);
      const instance = pick(s.entity, row, s.fragments);
      const text = s.text(instance);
      expect(typeof text).toBe("string");
      if (!s.byLanguage) {
        if (!ZONE_DEPENDENT.includes(s.entity)) {
          expect({ entity: s.entity, variant, text }).toEqual({
            entity: s.entity,
            variant,
            text: s.name(instance),
          });
        } else if ("client" in s) {
          // Con fechas, el texto sale en la zona del proceso y el nombre en la del
          // proyecto: el texto se compara con el cliente en la zona del proceso.
          const shown = displayNameClient.inProcessZone(() =>
            (s as Compared).client(
              wire(row),
              displayNameClient.clientLangStore(LANGUAGES[0])
            )
          );
          expect({ entity: s.entity, variant, text }).toEqual({
            entity: s.entity,
            variant,
            text: shown,
          });
        }
      }
    }
    // Con todo cargado, el JSON embebido se lee en cada idioma como el nombre.
    if (s.byLanguage) {
      const instance = pick(
        s.entity,
        full(s.entity, s.hops, "lleno"),
        s.fragments
      );
      const name = s.name(instance);
      for (const lang of LANGUAGES) {
        expect({
          entity: s.entity,
          lang,
          text: byLang(s.text(instance), lang),
        }).toEqual({ entity: s.entity, lang, text: inLanguage(name, lang) });
      }
    }
  });

  // Las que ya se mostraban bien (campos, varios campos, alternativa,
  // displayId:Entidad, data_): su texto es el de antes, que era el del cliente.
  const UNCHANGED = [
    "AbStatement",
    "AbConceptCorrection",
    "User",
    "Role",
    "Permission",
    "Tenant",
    "WorkerEvent",
    "IntegrationClient",
    "IdempotencyRecord",
    "UserNotification",
    "UserNotificationPreference",
    "EmailVerification",
  ];
  it.each(
    COMPARED.filter((s) => UNCHANGED.includes(s.entity)).map(
      (s) => [s.entity, s] as const
    )
  )("%s: lo que ya andaba da el mismo texto que antes", (_entity, s) => {
    for (const variant of VARIANTS) {
      const row = full(s.entity, s.hops, variant);
      expect({
        entity: s.entity,
        variant,
        text: s.text(pick(s.entity, row, s.fragments)),
      }).toEqual({
        entity: s.entity,
        variant,
        // El texto sale en la zona del proceso: se compara con el cliente en esa zona.
        text: displayNameClient.inProcessZone(() =>
          s.client(wire(row), displayNameClient.clientLangStore(LANGUAGES[0]))
        ),
      });
    }
  });
});
