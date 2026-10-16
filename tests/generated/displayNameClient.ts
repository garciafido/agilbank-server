// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
//
// El nombre visible tal como lo arma el cliente: para cada entidad, la misma
// expresión que <entidad>DisplayId en <Entidad>CommonStore.ts del cliente, con
// sus funciones de fechas (en la zona del proyecto, como un navegador en esa
// zona) y su símbolo de vacío. Lo usa displayName.test.ts. El día de calendario
// (graphqlToCalendarDate) usa los ayudantes del server, que siguen las mismas reglas
// que los del cliente (common/calendarDate.ts).

import {
  diaDeCalendario,
  formatearDia,
} from "../../src/common/utils/calendarDate";

export type ClientLanguage = "es";

/** Lo que las expresiones del cliente le piden al LangStore. */
export type ClientLangStore = {
  language: ClientLanguage;
  emptyStringSymbol: string;
  fieldByLang(baseFieldName: string): string;
};

export const clientLangStore = (language: ClientLanguage): ClientLangStore => ({
  language,
  emptyStringSymbol: "∅",
  fieldByLang: (baseFieldName: string) => `${baseFieldName}_${language}`,
});

/** La zona en que el cliente formatea las fechas: la del proyecto; sin zona, la del proceso. */
export const clientZone: { timeZone?: string } = {
  timeZone: "America/Argentina/Buenos_Aires",
};

/** Corre `fn` con el cliente en la zona del proceso (la de <entidad>DisplayId, el texto). */
export function inProcessZone<T>(fn: () => T): T {
  const saved = clientZone.timeZone;
  clientZone.timeZone = undefined;
  try {
    return fn();
  } finally {
    clientZone.timeZone = saved;
  }
}

export const graphqlToDateTime = (dateTime: string | Date) => {
  return new Date(dateTime).toLocaleDateString("es-AR", {
    ...(clientZone.timeZone ? { timeZone: clientZone.timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
};

export const graphqlToDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString("es-AR", {
    ...(clientZone.timeZone ? { timeZone: clientZone.timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

/**
 * Un día de calendario (un campo date, "AAAA-MM-DD") como DD/MM/AAAA, sin pasar por
 * la zona del navegador (common/calendarDate.ts). Un Date o un ISO con hora de un dato
 * viejo dan su día UTC. Sin valor, "..." (el nombre visible no la llama con un vacío:
 * pone el símbolo de vacío, como el server). Es el nombre visible de un date: el
 * server lo arma igual (graphqlToDate de su conversions.ts).
 */
export const graphqlToCalendarDate = (
  date: string | Date | null | undefined
) => {
  const day = diaDeCalendario(date);
  return day === null ? "..." : formatearDia(day, "es-AR");
};

export function abStatementDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.originalName ?? _langStore.emptyStringSymbol);
}

export function abConceptCorrectionDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.bankText ?? _langStore.emptyStringSymbol);
}

export function abReconciliationDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.requestKey ?? _langStore.emptyStringSymbol);
}

export function abPaymentBatchDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.originalName ?? _langStore.emptyStringSymbol);
}

export function userDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(
    (source.email ?? _langStore.emptyStringSymbol) +
      " " +
      (source.name ?? _langStore.emptyStringSymbol)
  );
}

export function roleDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.name ?? _langStore.emptyStringSymbol);
}

export function permissionDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.name ?? _langStore.emptyStringSymbol);
}

export function tenantDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.name ?? _langStore.emptyStringSymbol);
}

export function workerEventDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(
    (source.queueName ?? _langStore.emptyStringSymbol) +
      "-" +
      (source.jobType ?? _langStore.emptyStringSymbol) +
      "-" +
      `${graphqlToDateTime(source.enqueuedAt)}`
  );
}

export function integrationClientDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.name ?? _langStore.emptyStringSymbol);
}

export function idempotencyRecordDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(
    (source.client ?? _langStore.emptyStringSymbol) +
      ":" +
      (source.key ?? _langStore.emptyStringSymbol)
  );
}

export function userNotificationDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.title ?? _langStore.emptyStringSymbol);
}

export function userNotificationPreferenceDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.notificationType ?? _langStore.emptyStringSymbol);
}

export function emailVerificationDisplayId(
  source: any,
  _langStore: ClientLangStore
): string {
  return String(source.email ?? _langStore.emptyStringSymbol);
}
