/**
 * La rama Date (día de calendario) de los filtros de la búsqueda por IA: días, meses
 * y años sin hora ni el desfase fijo de 3 horas que usa un DateTime. Se corre con TZ
 * en las seis zonas.
 */
import { convertCalendarDateFilter, dateFilterWhere, periodOf, putDateFilter } from "../calendarDateFilter";

const iso = (day: string) => `${day}T00:00:00.000Z`;

describe("periodOf", () => {
  it.each([
    ["2025", "2025-01-01", "2026-01-01"],
    ["2025-06", "2025-06-01", "2025-07-01"],
    ["2025/6", "2025-06-01", "2025-07-01"],
    ["2025-12", "2025-12-01", "2026-01-01"],
    ["2024-02-29", "2024-02-29", "2024-03-01"],
    ["2024/2/29", "2024-02-29", "2024-03-01"],
    [" 2025-12-31 ", "2025-12-31", "2026-01-01"],
  ])("%p → [%s, %s)", (value, gte, lt) => {
    expect(periodOf(value)).toEqual({ gte, lt });
  });
  it.each([["2024-02-30"], ["2025-13"], ["ayer"], [""], ["12/03/1985"]])("%p → null", (value) => {
    expect(periodOf(value)).toBeNull();
  });
});

describe("convertCalendarDateFilter", () => {
  it.each([
    ["equals", "2024-02-29", { gte: iso("2024-02-29"), lt: iso("2024-03-01") }],
    ["contains", "2024", { gte: iso("2024-01-01"), lt: iso("2025-01-01") }],
    ["startsWith", "2024-06", { gte: iso("2024-06-01"), lt: iso("2024-07-01") }],
    ["gte", "2024", { gte: iso("2024-01-01") }],
    ["gt", "2024", { gte: iso("2025-01-01") }],
    ["lt", "2024-06", { lt: iso("2024-06-01") }],
    ["lte", "2024-06", { lt: iso("2024-07-01") }],
    ["in", ["2024-02-29", "2024-03-01"], { in: [iso("2024-02-29"), iso("2024-03-01")] }],
    ["in", "2024-02-29, 2024-03-01", { in: [iso("2024-02-29"), iso("2024-03-01")] }],
    ["notIn", ["2024/02/29"], { notIn: [iso("2024-02-29")] }],
  ])("%s %p", (operator, value, condition) => {
    expect(convertCalendarDateFilter(operator, value)).toEqual({ converted: true, condition });
  });

  it.each([
    ["notEquals", "2024-02-29", { gte: iso("2024-02-29"), lt: iso("2024-03-01") }],
    ["notContains", "2024", { gte: iso("2024-01-01"), lt: iso("2025-01-01") }],
    ["endsWith", "2024-06", { gte: iso("2024-06-01"), lt: iso("2024-07-01") }],
  ])("%s %p: afuera del período (outside, para el where)", (operator, value, outside) => {
    expect(convertCalendarDateFilter(operator, value)).toEqual({ converted: true, outside });
  });

  it("isNull e isNotNull no se convierten, ni dan error", () => {
    expect(convertCalendarDateFilter("isNull", true)).toEqual({ converted: false });
    expect(convertCalendarDateFilter("isNotNull", true)).toEqual({ converted: false });
  });

  it.each([
    ["equals", "2024-02-30"],
    ["gte", "ayer"],
    ["in", ["2024-02-29", "2024-02-30"]],
  ])("%s %p: error, que dice el formato", (operator, value) => {
    const result = convertCalendarDateFilter(operator, value);
    expect(result.converted).toBe(false);
    expect((result as { error?: string }).error).toContain("Use YYYY, YYYY-MM, o YYYY-MM-DD.");
  });

  it("ningún resultado lleva el desfase de 3 horas", () => {
    const all = ["equals", "contains", "gte", "gt", "lt", "lte", "notEquals"].map((op) => convertCalendarDateFilter(op, "2024-06"));
    expect(JSON.stringify(all)).not.toContain("T03:");
  });
});

describe("dónde va en el where un filtro de fecha convertido", () => {
  const RANGO = { gte: iso("1985-01-01"), lt: iso("1986-01-01") };

  it("dateFilterWhere: la condición en el filtro del campo; afuera del período, como NOT del rango (no un not adentro del campo)", () => {
    expect(dateFilterWhere("nacimiento", { converted: true, condition: { gte: RANGO.gte } })).toEqual({ nacimiento: { gte: RANGO.gte } });
    expect(dateFilterWhere("nacimiento", { converted: true, outside: RANGO })).toEqual({ NOT: { nacimiento: RANGO } });
  });

  it("putDateFilter: la condición pisa el campo como antes; afuera del período se suma al AND, sin pisar otro NOT ni otro AND", () => {
    const where: Record<string, unknown> = { NOT: { otro: { equals: 1 } }, AND: [{ x: 1 }] };
    putDateFilter(where, "nacimiento", { converted: true, condition: { lt: RANGO.lt } });
    putDateFilter(where, "nacimiento2", { converted: true, outside: RANGO });
    expect(where).toEqual({
      NOT: { otro: { equals: 1 } },
      AND: [{ x: 1 }, { NOT: { nacimiento2: RANGO } }],
      nacimiento: { lt: RANGO.lt },
    });
    const solo: Record<string, unknown> = { AND: { y: 2 } };
    putDateFilter(solo, "d", { converted: true, outside: RANGO });
    expect(solo).toEqual({ AND: [{ y: 2 }, { NOT: { d: RANGO } }] });
  });
});
