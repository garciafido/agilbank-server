/**
 * BORRADOR — se desarrolla acá para poder correrlo, y después se porta al
 * generador. No commitear este archivo.
 */

import * as fs from "fs";
import { assertSafeTestDatabase } from "../../support/testDatabase";
import { basePrisma } from "../../../src/prisma/client";
import { SecurePrismaOps } from "../../../src/common/services/securePrismaOps";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";

// ─────────────────────────── enumeración del schema ───────────────────────────

interface Campo {
  nombre: string;
  tipo: string;
  lista: boolean;
  opcional: boolean;
  linea: string;
  esRelacion: boolean;
}
interface Modelo {
  nombre: string;
  delegate: string;
  campos: Campo[];
  /** Escalares que son clave foránea de una relación: los escribe el `connect`. */
  fks: Set<string>;
  tieneEmpresa: boolean;
}

const AUDITORIA = new Set([
  "version_",
  "createdAt_",
  "createdBy_",
  "createdBy_id_",
  "lastUpdatedAt_",
  "lastUpdatedBy_",
  "lastUpdatedBy_id_",
  "tenant_",
  "tenant_id_",
]);

function leerSchema(): { modelos: Modelo[]; enums: Map<string, string[]> } {
  const texto = fs.readFileSync("prisma/schema.prisma", "utf8");

  const enums = new Map<string, string[]>();
  const reEnum = /^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let e: RegExpExecArray | null;
  while ((e = reEnum.exec(texto)) !== null) {
    const valores = e[2]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s+/)[0]);
    enums.set(e[1], valores);
  }

  const modelos: Modelo[] = [];
  const reModel = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = reModel.exec(texto)) !== null) {
    const campos: Campo[] = [];
    for (const linea of m[2].split("\n")) {
      const l = linea.trim();
      if (!l || l.startsWith("//") || l.startsWith("@@")) continue;
      const f = l.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!f) continue;
      campos.push({
        nombre: f[1],
        tipo: f[2],
        lista: !!f[3],
        opcional: !!f[4],
        linea: l,
        esRelacion: false,
      });
    }
    // Los FK escalares (`account_id`) NO son campos a sembrar: la relación
    // (`account`) los escribe con `connect`, y pasar los dos a Prisma es
    // "Unknown argument". Salen de las cláusulas `fields: [...]` de cada relación.
    const fks = new Set<string>();
    for (const c of campos) {
      const decl = c.linea.match(/fields:\s*\[([^\]]*)\]/);
      if (decl) for (const f of decl[1].split(",")) fks.add(f.trim());
    }
    modelos.push({
      nombre: m[1],
      delegate: m[1].charAt(0).toLowerCase() + m[1].slice(1),
      campos,
      fks,
      tieneEmpresa: campos.some((c) => c.nombre === "tenant_id_"),
    });
  }

  const nombres = new Set(modelos.map((x) => x.nombre));
  for (const mo of modelos)
    for (const c of mo.campos) c.esRelacion = nombres.has(c.tipo);
  return { modelos, enums };
}

/** Obligatorios propios: sin default, sin @id, no opcionales, no de auditoría. */
function obligatorios(mo: Modelo): Campo[] {
  return mo.campos.filter(
    (c) =>
      !c.opcional &&
      !c.lista &&
      !AUDITORIA.has(c.nombre) &&
      !mo.fks.has(c.nombre) &&
      !/@default/.test(c.linea) &&
      !/@id/.test(c.linea) &&
      !/@updatedAt/.test(c.linea)
  );
}

// ─────────────────────────────── sembrado ───────────────────────────────

const EMPRESAS = ["MATRIZ_A", "MATRIZ_B"] as const;
type Empresa = typeof EMPRESAS[number];

const { modelos, enums } = leerSchema();
const porNombre = new Map(modelos.map((m) => [m.nombre, m]));

/** Un id predecible por (modelo, empresa): las aserciones lo nombran. */
const idDe = (modelo: string, empresa: Empresa) =>
  "MZ_" + modelo + "_" + empresa;

const usuarioDe = (empresa: Empresa) => idDe("User", empresa);

/**
 * Valor sintético para un escalar obligatorio.
 *
 * `mismoEnLasDos` decide si las dos empresas comparten el valor. Compartirlo es lo
 * que hace visible un cruce —si A ve el "5.1.99" de B, se nota—, pero un unique
 * GLOBAL no lo permite: ahí el valor lleva la empresa.
 */
function valorSintetico(
  c: Campo,
  empresa: Empresa,
  mismoEnLasDos: boolean
): unknown {
  const sufijo = mismoEnLasDos ? "" : "_" + empresa;
  if (enums.has(c.tipo)) return enums.get(c.tipo)![0];
  switch (c.tipo) {
    case "String":
      return "MZ" + sufijo;
    case "Int":
      return 7;
    case "Float":
      return 7;
    case "Decimal":
      return 7;
    case "Boolean":
      return false;
    case "DateTime":
      return new Date("2026-01-15T00:00:00Z");
    case "Json":
      return {};
    case "Bytes":
      return Buffer.from("MZ");
    default:
      return null;
  }
}

const auditoria = (empresa: Empresa) => ({
  version_: "0",
  createdAt_: new Date("2026-01-15T00:00:00Z"),
  createdBy_: { connect: { id: usuarioDe(empresa) } },
  tenant_: { connect: { id: empresa } },
});

/** Lo que no se pudo sembrar, y por qué. Se afirma: nada de esto es silencioso. */
const saltados: Array<{ modelo: string; motivo: string }> = [];
const sembrados: Modelo[] = [];

/**
 * El motivo real de un error de Prisma.
 *
 * `err.message.split("\n")[0]` no sirve: el mensaje empieza con un salto de línea y
 * sigue con boilerplate —"Invalid `x.create()` invocation in", la ruta del archivo,
 * el fragmento de código— antes de la explicación. Un reporte de cobertura con los
 * motivos en blanco o repetidos es peor que no tenerlo: parece exhaustivo y no dice
 * nada. Cuando el error trae datos estructurados se usan ésos, que son exactos.
 */
function motivoDe(err: any): string {
  if (err?.code) {
    const meta = err.meta ? " " + JSON.stringify(err.meta) : "";
    return String(err.code) + meta;
  }
  // Sin código es un error de validación, y ahí Prisma pone la explicación en la
  // ÚLTIMA línea ("Argument `x` is missing."): antes va el boilerplate y el volcado
  // del tipo esperado, que puede tener decenas de líneas.
  const lineas = String(err?.message ?? err)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return (lineas[lineas.length - 1] ?? "(sin mensaje)").slice(0, 150);
}

const idGlobalDe = (modelo: string) => "MZ_" + modelo + "_GLOBAL";
const globalesSembrados = new Set<string>();

const tiene = (mo: Modelo, campo: string) =>
  mo.campos.some((c) => c.nombre === campo);

/**
 * Los datos para sembrar una fila. `empresa` null = fila global.
 *
 * Una sola función para los dos casos: tenerlas separadas fue lo que dejó a cuatro
 * modelos globales sin sembrar —la versión global ignoraba las relaciones
 * obligatorias— y sus relaciones inversas son justo el camino que hay que recorrer.
 *
 * Los campos de auditoría se agregan SOLO si el modelo los tiene: no toda tabla del
 * framework los lleva (SystemStatus no tiene version_).
 */
async function datosPara(mo: Modelo, empresa: Empresa | null): Promise<any> {
  const dueño = empresa ?? EMPRESAS[0];
  const data: any = {
    id: empresa ? idDe(mo.nombre, empresa) : idGlobalDe(mo.nombre),
  };
  if (tiene(mo, "version_")) data.version_ = "0";
  if (tiene(mo, "createdAt_"))
    data.createdAt_ = new Date("2026-01-15T00:00:00Z");
  if (tiene(mo, "createdBy_"))
    data.createdBy_ = { connect: { id: usuarioDe(dueño) } };
  if (empresa && tiene(mo, "tenant_"))
    data.tenant_ = { connect: { id: empresa } };

  for (const c of obligatorios(mo)) {
    if (c.esRelacion) {
      const padre = porNombre.get(c.tipo)!;
      if (padre.tieneEmpresa) {
        // Un padre CON empresa: la fila de la empresa dueña. Para una fila global
        // eso la ata a una empresa, y es lo correcto —un token de refresco es de
        // un usuario— pero hay que saberlo: la inversa desde la global va a poder
        // llegar a esa fila.
        data[c.nombre] = {
          connect: {
            id:
              padre.nombre === "User"
                ? usuarioDe(dueño)
                : idDe(padre.nombre, dueño),
          },
        };
      } else {
        await sembrarGlobal(padre);
        data[c.nombre] = { connect: { id: idGlobalDe(padre.nombre) } };
      }
      continue;
    }
    const uniqueGlobal = /@unique/.test(c.linea);
    data[c.nombre] = valorSintetico(
      c,
      dueño,
      !uniqueGlobal && empresa !== null
    );
  }
  return data;
}

/** Los modelos sin empresa se siembran una vez, para poder recorrer sus inversas. */
async function sembrarGlobal(mo: Modelo): Promise<void> {
  if (globalesSembrados.has(mo.nombre)) return;
  globalesSembrados.add(mo.nombre);
  await (basePrisma as any)[mo.delegate].create({
    data: await datosPara(mo, null),
  });
}

async function sembrarModelo(mo: Modelo, empresa: Empresa): Promise<boolean> {
  await (basePrisma as any)[mo.delegate].create({
    data: await datosPara(mo, empresa),
  });
  return true;
}

async function sembrar(): Promise<void> {
  for (const empresa of EMPRESAS) {
    await basePrisma.tenant.create({
      data: {
        id: empresa,
        version_: "0",
        createdAt_: new Date(),
        name: empresa,
        status: "active",
      },
    });
  }
  // El usuario de arranque: la auditoría de todo lo demás lo referencia, y él
  // mismo no puede referenciarse antes de existir.
  for (const empresa of EMPRESAS) {
    await basePrisma.user.create({
      data: {
        id: usuarioDe(empresa),
        version_: "0",
        createdAt_: new Date(),
        email: "mz_" + empresa + "@test.local",
        name: "MZ " + empresa,
        active: true,
        password: "x",
        tenant_: { connect: { id: empresa } },
        // Sin createdBy_: es opcional justamente para que el primer usuario pueda
        // existir. Ponerlo apuntando a sí mismo falla, la fila todavía no está.
      } as any,
    });
  }

  // Todos los globales, no solo los que un hijo necesite: sus relaciones INVERSAS
  // apuntan a datos de empresas, y ése es el camino que hay que poder recorrer.
  for (const mo of modelos.filter(
    (m) => !m.tieneEmpresa && m.nombre !== "Tenant"
  )) {
    try {
      await sembrarGlobal(mo);
    } catch (err: any) {
      saltados.push({ modelo: mo.nombre, motivo: "global: " + motivoDe(err) });
    }
  }

  const conEmpresa = modelos.filter(
    (m) => m.tieneEmpresa && m.nombre !== "User" && m.nombre !== "Tenant"
  );
  // Dos rondas: primero los que solo piden escalares, después los que piden padre.
  const rondas = [
    conEmpresa.filter((m) => !obligatorios(m).some((c) => c.esRelacion)),
    conEmpresa.filter((m) => obligatorios(m).some((c) => c.esRelacion)),
  ];
  for (const ronda of rondas) {
    for (const mo of ronda) {
      try {
        let ok = true;
        for (const empresa of EMPRESAS)
          ok = (await sembrarModelo(mo, empresa)) && ok;
        if (ok) sembrados.push(mo);
        else
          saltados.push({
            modelo: mo.nombre,
            motivo: "obligatorio no sintetizable o padre global",
          });
      } catch (err: any) {
        saltados.push({ modelo: mo.nombre, motivo: motivoDe(err) });
      }
    }
  }
  // User entra a la matriz igual: se sembró a mano arriba.
  sembrados.push(porNombre.get("User")!);
}

/**
 * Borra todo lo sembrado, sin depender del orden de las claves foráneas.
 *
 * Todas las filas llevan el prefijo MZ_, así que el borrado no necesita saber qué
 * se sembró: pasa por todos los modelos hasta que una pasada no borra nada. Un
 * borrado ordenado a mano se rompe con cualquier relación nueva, y como los errores
 * se ignoran, deja restos que hacen fallar la corrida siguiente por unicidad — que
 * es un fallo de sembrado disfrazado de fallo de aislamiento.
 */
async function limpiar(): Promise<void> {
  const conPrefijo = { id: { startsWith: "MZ_" } };
  for (let pasada = 0; pasada < 6; pasada++) {
    let borradas = 0;
    for (const mo of modelos) {
      if (mo.nombre === "Tenant") continue;
      const r = await (basePrisma as any)[mo.delegate]
        .deleteMany({ where: conPrefijo })
        .catch(() => ({ count: 0 }));
      borradas += r?.count ?? 0;
    }
    if (borradas === 0) break;
  }
  await basePrisma.tenant
    .deleteMany({ where: { id: { in: [...EMPRESAS] } } })
    .catch(() => undefined);
  // Si algo quedó, la corrida siguiente falla por unicidad y el motivo se pierde:
  // mejor que se vea acá.
  const restos: string[] = [];
  for (const mo of modelos) {
    const n = await (basePrisma as any)[mo.delegate]
      .count({ where: conPrefijo })
      .catch(() => 0);
    if (n > 0) restos.push(mo.nombre + "=" + n);
  }
  if (restos.length)
    throw new Error("[matriz] quedaron filas sin borrar: " + restos.join(", "));
}

// ─────────────────────────────── la matriz ───────────────────────────────

let store: SchemaMetadataStore;

/**
 * Todos los permisos, a propósito.
 *
 * Lo que se aísla acá es la EMPRESA, no el permiso: rbac tiene su propio test. Con
 * permisos de menos, un modelo pasaría por falta de autorización y no por
 * aislamiento — verde por la razón equivocada.
 */
const todosLosPermisos = () => {
  const p = new Set<string>();
  for (const mo of modelos)
    for (const acc of ["retrieve", "create", "update", "delete"])
      p.add(mo.delegate + "_" + acc);
  return p;
};

const contextoDe = (empresa: Empresa): any => ({
  isSystemMode: false,
  currentUser: {
    id: usuarioDe(empresa),
    tenant_id_: empresa,
    active: true,
    roles: [],
  },
  permissions: todosLosPermisos,
});

const opsDe = (modelo: Modelo, empresa: Empresa): any =>
  new SecurePrismaOps(
    contextoDe(empresa),
    basePrisma as any,
    store,
    modelo.nombre as any,
    {}
  );

/**
 * Cualquier id de la otra empresa que aparezca, a cualquier profundidad.
 *
 * El detector es el id: se sembró como MZ_<Modelo>_<EMPRESA>, así que un id con
 * MATRIZ_B devuelto en una sesión de A es una fuga sin importar por qué camino
 * salió ni cuán anidado esté. Recorre todo el resultado, no solo la raíz.
 */
function idsAjenos(
  valor: unknown,
  ajena: Empresa,
  hallados: string[] = []
): string[] {
  if (typeof valor === "string") {
    if (valor.startsWith("MZ_") && valor.endsWith("_" + ajena))
      hallados.push(valor);
    return hallados;
  }
  if (Array.isArray(valor)) {
    for (const v of valor) idsAjenos(v, ajena, hallados);
    return hallados;
  }
  if (valor && typeof valor === "object") {
    for (const v of Object.values(valor)) idsAjenos(v, ajena, hallados);
  }
  return hallados;
}

const A: Empresa = "MATRIZ_A";
const B: Empresa = "MATRIZ_B";

/** Cuántas relaciones se ejercieron de verdad, y cuántas no. Se reporta. */
let ejercidasTotales = 0;
let salteadasTotales = 0;
const detalleSalteadas: string[] = [];

/**
 * La tabla de casos sale del SCHEMA, no de lo que se logró sembrar.
 *
 * `it.each` se evalúa al recolectar los tests, antes de cualquier beforeAll: una
 * tabla derivada del sembrado estaría vacía y la matriz entera pasaría sin correr
 * nada. Que la tabla sea el schema además es lo correcto — el universo lo define el
 * schema, y que un modelo no se pueda sembrar es un hallazgo, no una exclusión.
 */
const CASOS = modelos
  .filter((m) => m.tieneEmpresa && m.nombre !== "Tenant")
  .map((m) => [m.nombre, m] as const);

/**
 * Para recorrer relaciones, el origen incluye los modelos GLOBALES.
 *
 * Una tabla global no tiene columna de empresa, así que SecurePrismaOps no la
 * filtra —correcto—; pero sus relaciones INVERSAS apuntan a tablas que SÍ tienen
 * empresa, y esas inversas no están en la metadata: no reciben ni poda por permiso
 * ni filtro de empresa. Empezar solo desde modelos con empresa no ve nada, porque
 * ahí la cadena de claves foráneas ya implica la empresa.
 */
const CASOS_CON_RELACIONES = modelos
  .filter((m) => m.nombre !== "Tenant")
  .map((m) => [m.nombre, m, m.campos.filter((c) => c.esRelacion)] as const)
  .filter(([, , rels]) => rels.length > 0);

/** Un modelo sin sembrar haría pasar sus aserciones por vacío. */
const exigirSembrado = (mo: Modelo) => {
  expect(sembrados.map((x) => x.nombre)).toContain(mo.nombre);
};

describe("aislamiento entre empresas, sobre el schema entero", () => {
  beforeAll(async () => {
    assertSafeTestDatabase();
    await limpiar();
    await sembrar();
    store = new SchemaMetadataStore();
    store.build();
  }, 300000);

  afterAll(async () => {
    // eslint-disable-next-line no-console
    console.log(
      "\nrelaciones ejercidas: " +
        ejercidasTotales +
        "\nrelaciones no anidables: " +
        salteadasTotales +
        (detalleSalteadas.length
          ? "\n" + detalleSalteadas.slice(0, 6).join("\n")
          : "")
    );
    await limpiar();
    await basePrisma.$disconnect();
  }, 300000);

  it("sembró las dos empresas en TODOS los modelos con empresa, sin saltar ninguno", () => {
    const conEmpresa = modelos.filter((m) => m.tieneEmpresa).length;
    // eslint-disable-next-line no-console
    if (saltados.length)
      console.log(
        "\nsaltados:\n" +
          saltados.map((x) => "  " + x.modelo + " — " + x.motivo).join("\n")
      );
    expect(sembrados.length).toBe(conEmpresa);
    expect(saltados).toEqual([]);
    expect(conEmpresa).toBeGreaterThan(5);
  });

  // El guard que hace no-vacua toda la matriz: si A no viera lo suyo, cada
  // aserción de fuga pasaría por vacío.
  it.each(CASOS)("%s — A ve su propia fila", async (_nombre, mo) => {
    exigirSembrado(mo);
    const filas = await opsDe(mo, A).findMany({ select: { id: true } });
    expect(filas.map((f: any) => f.id)).toContain(idDe(mo.nombre, A));
  });

  it.each(CASOS)(
    "%s — findMany no trae la fila de la otra empresa",
    async (_nombre, mo) => {
      exigirSembrado(mo);
      const filas = await opsDe(mo, A).findMany({ select: { id: true } });
      expect(idsAjenos(filas, B)).toEqual([]);
    }
  );

  it.each(CASOS)(
    "%s — findFirst y findUnique por el id ajeno no lo alcanzan",
    async (_nombre, mo) => {
      exigirSembrado(mo);
      const db = opsDe(mo, A);
      const ajeno = idDe(mo.nombre, B);
      expect(
        await db.findFirst({ where: { id: ajeno }, select: { id: true } })
      ).toBeNull();
      expect(
        await db.findUnique({ where: { id: ajeno }, select: { id: true } })
      ).toBeNull();
    }
  );

  it.each(CASOS)("%s — count no cuenta la fila ajena", async (_nombre, mo) => {
    exigirSembrado(mo);
    const db = opsDe(mo, A);
    expect(await db.count({ where: { id: idDe(mo.nombre, B) } })).toBe(0);
    // Y la propia sí, para que el cero de arriba no sea por vacío.
    expect(await db.count({ where: { id: idDe(mo.nombre, A) } })).toBe(1);
  });

  it.each(CASOS)(
    "%s — update y delete de la fila ajena fallan",
    async (_nombre, mo) => {
      exigirSembrado(mo);
      const db = opsDe(mo, A);
      const ajeno = idDe(mo.nombre, B);
      await expect(
        db.update({ where: { id: ajeno }, data: {}, select: { id: true } })
      ).rejects.toBeDefined();
      await expect(
        db.delete({ where: { id: ajeno }, select: { id: true } })
      ).rejects.toBeDefined();
      // La fila ajena sigue ahí: el rechazo no fue un borrado silencioso.
      const sigue = await (basePrisma as any)[mo.delegate].findUnique({
        where: { id: ajeno },
        select: { id: true },
      });
      expect(sigue).not.toBeNull();
    }
  );

  // Ésta es la que apunta al hueco conocido: las relaciones INVERSAS están fuera
  // de la metadata por construcción, así que _pruneRecursive las conserva enteras
  // y _aplicarTenantAnidado nunca corre para ellas.
  it.each(CASOS_CON_RELACIONES)(
    "%s — ninguna relación del schema trae filas de la otra empresa",
    async (_nombre, mo, rels) => {
      const db = opsDe(mo, A);
      const fugas: string[] = [];
      const noAnidables: string[] = [];
      let ejercidas = 0;
      for (const rel of rels) {
        let filas: any;
        try {
          filas = await db.findMany({
            select: { id: true, [rel.nombre]: { select: { id: true } } },
          });
        } catch (err: any) {
          // Prisma no acepta anidar así: NO es una fuga, pero tampoco cobertura.
          // Se cuenta y se reporta: un catch que sigue en silencio convierte una
          // matriz de 157 casos en un verde que no probó nada.
          noAnidables.push(rel.nombre + " (" + motivoDe(err) + ")");
          continue;
        }
        ejercidas++;
        for (const ajeno of idsAjenos(filas, B))
          fugas.push(rel.nombre + " → " + ajeno);
      }
      ejercidasTotales += ejercidas;
      salteadasTotales += noAnidables.length;
      if (noAnidables.length)
        detalleSalteadas.push(mo.nombre + ": " + noAnidables.join(", "));
      expect(fugas).toEqual([]);
      // Sin al menos una relación ejercida, este caso no probó nada.
      expect(ejercidas).toBeGreaterThan(0);
    },
    120000
  );
});
