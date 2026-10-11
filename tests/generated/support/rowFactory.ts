/**
 * Filas de prueba para cualquier modelo del proyecto, leyendo prisma/schema.prisma.
 *
 * Lo usan las baterías de borrado de tests/generated/: cada caso necesita una
 * fila que referencie a otra a través de un camino de subentidades, para
 * cualquier entidad del proyecto, y escribirlo a mano por entidad no escala.
 *
 * Escribe con el cliente de Prisma crudo (sin SecurePrismaOps), con los campos
 * escalares de las claves foráneas. Completa lo obligatorio con valores
 * sintéticos y crea, si hace falta, las filas que una relación obligatoria
 * necesita: en la misma empresa si el modelo tiene empresa, globales si no.
 * Los usuarios y las empresas no se inventan: salen del contexto.
 */

import * as fs from "fs";

export interface SchemaRelation {
  name: string | null;
  fields: string[];
  references: string[];
}

export interface SchemaField {
  name: string;
  type: string;
  list: boolean;
  optional: boolean;
  attributes: string;
  relation: SchemaRelation | null;
}

export interface SchemaModel {
  name: string;
  delegate: string;
  fields: SchemaField[];
  hasTenant: boolean;
}

export interface FactoryContext {
  /** Empresa de las filas con empresa; null para crear una fila global. */
  tenant: string | null;
  /** Usuario creador (createdBy_) y destino de las relaciones obligatorias a User. */
  user?: string;
}

/** Lo que la batería necesita de una relación de la tabla generada. */
export interface ChainRelation {
  model: string;
  fk: string;
  path: string[];
  rootEntity: string;
}

export function readSchema(file = "prisma/schema.prisma"): {
  models: Map<string, SchemaModel>;
  enums: Map<string, string[]>;
} {
  const text = fs.readFileSync(file, "utf8");
  const enums = new Map<string, string[]>();
  for (const e of text.matchAll(/^enum (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    enums.set(
      e[1],
      e[2]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//"))
        .map((l) => l.split(/\s+/)[0])
    );
  }
  const models = new Map<string, SchemaModel>();
  for (const m of text.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    const fields: SchemaField[] = [];
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!f) continue;
      const rel = f[5].match(/@relation\(([^)]*)\)/);
      const list = (key: string) =>
        rel
          ? (rel[1].match(new RegExp(key + ":\\s*\\[([^\\]]*)\\]"))?.[1] ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s !== "")
          : [];
      fields.push({
        name: f[1],
        type: f[2],
        list: !!f[3],
        optional: !!f[4],
        attributes: f[5],
        relation: rel
          ? {
              name: rel[1].match(/^\s*(?:name:\s*)?"([^"]+)"/)?.[1] ?? null,
              fields: list("fields"),
              references: list("references"),
            }
          : null,
      });
    }
    models.set(m[1], {
      name: m[1],
      delegate: m[1].charAt(0).toLowerCase() + m[1].slice(1),
      fields,
      hasTenant: fields.some((x) => x.name === "tenant_id_"),
    });
  }
  return { models, enums };
}

export class RowFactory {
  readonly models: Map<string, SchemaModel>;
  private readonly enums: Map<string, string[]>;
  private readonly created: Array<{ delegate: string; id: string }> = [];
  private counter = 0;
  /** Filas sembradas por modelo: los enums rotan por modelo (ver value()). */
  private readonly perModel = new Map<string, number>();

  constructor(
    private readonly prisma: any,
    /** Prefijo de los ids y de los textos: así se reconocen y se borran. */
    readonly prefix: string,
    schemaFile = "prisma/schema.prisma"
  ) {
    const { models, enums } = readSchema(schemaFile);
    this.models = models;
    this.enums = enums;
  }

  model(name: string): SchemaModel {
    const m = this.models.get(name);
    if (!m) throw new Error("rowFactory: no existe el modelo " + name);
    return m;
  }

  /**
   * Un valor sintético para un escalar obligatorio. Los enums rotan con la
   * cantidad de filas de ese modelo (`k`), no con el contador global: hay únicos
   * sobre enums, y con el contador global dos filas del mismo modelo podían
   * caer en el mismo valor según el orden en que corrieran los tests.
   */
  private value(field: SchemaField, n: number, k: number): unknown {
    const values = this.enums.get(field.type);
    if (values) return values[k % values.length];
    switch (field.type) {
      case "String":
        return this.prefix + n;
      case "Int":
      case "BigInt":
        return n;
      case "Float":
      case "Decimal":
        return 1;
      case "Boolean":
        return false;
      case "DateTime":
        return new Date("2026-01-15T00:00:00Z");
      case "Json":
        return {};
      case "Bytes":
        return Buffer.from(this.prefix);
      default:
        throw new Error(
          "rowFactory: no se puede inventar un " +
            field.type +
            " para " +
            field.name
        );
    }
  }

  /** Crea una fila y devuelve su id. `data` va con los campos escalares (claves foráneas incluidas). */
  async create(
    modelName: string,
    ctx: FactoryContext,
    data: Record<string, unknown> = {},
    seen: string[] = []
  ): Promise<string> {
    if (seen.includes(modelName))
      throw new Error(
        "rowFactory: ciclo de relaciones obligatorias " +
          seen.concat(modelName).join(" → ")
      );
    const model = this.model(modelName);
    const n = ++this.counter;
    const k = (this.perModel.get(modelName) ?? 0) + 1;
    this.perModel.set(modelName, k);
    const row: Record<string, unknown> = {
      id: this.prefix + modelName + "_" + n,
      ...data,
    };
    const fkFields = new Set(
      model.fields.flatMap((f) => f.relation?.fields ?? [])
    );

    // Las relaciones, en este orden: las compuestas cuyo id ya viene (sus otras
    // columnas salen de esa fila y las comparten otras relaciones), las de una
    // columna, y las compuestas restantes (toman lo que ya quedó puesto).
    const rank = (f: SchemaField) => {
      const rel = f.relation!;
      if (rel.fields.length === 1) return 1;
      return row[rel.fields[rel.references.indexOf("id")]] !== undefined
        ? 0
        : 2;
    };
    const relations = model.fields
      .filter((f) => f.relation && f.relation.fields.length > 0 && !f.list)
      .sort((a, b) => rank(a) - rank(b));
    for (const f of relations) {
      const rel = f.relation!;
      const idIndex = rel.references.indexOf("id");
      const idField = rel.fields[idIndex];
      const missing = rel.fields.filter((x) => row[x] === undefined);
      if (missing.length === 0) continue;
      const others = rel.fields
        .map((x, i) => [x, rel.references[i]] as const)
        .filter(([x]) => x !== idField);
      if (row[idField] !== undefined) {
        // El id viene dado: las demás columnas de una compuesta salen de esa fila.
        if (others.length === 0) continue;
        const target = await this.prisma[
          this.model(f.type).delegate
        ].findUnique({
          where: { id: row[idField] },
          select: Object.fromEntries(others.map(([, ref]) => [ref, true])),
        });
        for (const [x, ref] of others)
          if (row[x] === undefined) row[x] = target?.[ref];
        continue;
      }
      if (f.optional) continue;
      if (f.type === "User" && ctx.user) {
        row[idField] = ctx.user;
      } else if (f.type === "Tenant" && ctx.tenant) {
        row[idField] = ctx.tenant;
      } else {
        const target = this.model(f.type);
        const shared = Object.fromEntries(
          others
            .filter(([x]) => row[x] !== undefined)
            .map(([x, ref]) => [ref, row[x]])
        );
        row[idField] = await this.create(
          target.name,
          { ...ctx, tenant: target.hasTenant ? ctx.tenant : null },
          shared,
          seen.concat(modelName)
        );
        for (const [x] of others)
          if (row[x] === undefined)
            throw new Error(
              "rowFactory: no se pudo completar " + x + " en " + modelName
            );
      }
    }

    for (const f of model.fields) {
      if (
        f.relation ||
        f.list ||
        f.optional ||
        row[f.name] !== undefined ||
        fkFields.has(f.name)
      )
        continue;
      if (this.models.has(f.type)) continue;
      if (/@default|@id|@updatedAt/.test(f.attributes)) continue;
      row[f.name] = this.value(f, n, k);
    }

    await this.prisma[model.delegate].create({
      data: row,
      select: { id: true },
    });
    this.created.push({ delegate: model.delegate, id: row.id as string });
    return row.id as string;
  }

  /**
   * El campo escalar con el que una fila del modelo hijo apunta a su padre, por
   * la relación `field` del padre (la de la subentidad).
   */
  parentLink(
    parent: string,
    field: string
  ): { child: string; fk: string; many: boolean } {
    const pf = this.model(parent).fields.find((f) => f.name === field);
    if (!pf?.relation)
      throw new Error(
        "rowFactory: " + parent + "." + field + " no es una relación"
      );
    const child = this.model(pf.type);
    const link = child.fields.find(
      (f) =>
        f.relation?.name === pf.relation!.name && f.relation.fields.length > 0
    );
    if (!link)
      throw new Error(
        "rowFactory: sin vínculo de " + child.name + " a " + parent
      );
    return { child: child.name, fk: link.relation!.fields[0], many: pf.list };
  }

  /**
   * Una raíz con el camino de la relación hasta una fila que referencia `targetId`.
   * Devuelve el id de la raíz y el de la fila que referencia.
   */
  async chain(
    relation: ChainRelation,
    targetId: string,
    ctx: FactoryContext,
    root?: string
  ): Promise<{ rootId: string; rowId: string }> {
    if (relation.path.length === 0) {
      if (root)
        throw new Error(
          "rowFactory: la raíz es la fila que referencia; no se puede reusar " +
            root
        );
      const id = await this.create(relation.model, ctx, {
        [relation.fk]: targetId,
      });
      return { rootId: id, rowId: id };
    }
    const rootId = root ?? (await this.create(relation.rootEntity, ctx));
    let parent = relation.rootEntity;
    let parentId = rootId;
    for (let i = 0; i < relation.path.length; i++) {
      const link = this.parentLink(parent, relation.path[i]);
      const last = i === relation.path.length - 1;
      parentId = await this.create(
        link.child,
        ctx,
        last
          ? { [link.fk]: parentId, [relation.fk]: targetId }
          : { [link.fk]: parentId }
      );
      parent = link.child;
    }
    return { rootId, rowId: parentId };
  }

  /**
   * Borra lo que dejó con este prefijo una corrida anterior cortada (un Ctrl-C,
   * un proceso matado, un timeout): las filas con el prefijo y lo que el código
   * bajo prueba creó con sus empresas o sus usuarios (ids sin prefijo). Va
   * primero en el beforeAll: los ids son deterministas (prefijo, modelo y
   * contador), y un resto haría fallar la corrida por unicidad sin decir por qué.
   * Borra en pasadas hasta que una no borra nada (lo que todavía está
   * referenciado cae en la siguiente); si algo queda con el prefijo, falla y lo
   * dice.
   */
  async purge(): Promise<void> {
    // El prefijo, literal. El startsWith de Prisma es un LIKE, donde "_" vale por
    // cualquier carácter ("DBX_" también toma "DBXz…"): sirve para traer
    // candidatos, y de ellos quedan los que empiezan exactamente con el prefijo.
    const own = async (m: SchemaModel): Promise<string[]> => {
      try {
        const rows = await this.prisma[m.delegate].findMany({
          where: { id: { startsWith: this.prefix } },
          select: { id: true },
        });
        return rows
          .map((r: { id: string }) => r.id)
          .filter((id: string) => id.startsWith(this.prefix));
      } catch {
        return []; // un modelo sin id de texto
      }
    };
    const tenants = this.models.has("Tenant")
      ? await own(this.model("Tenant"))
      : [];
    const users = this.models.has("User") ? await own(this.model("User")) : [];
    for (let pass = 0; pass < 10; pass++) {
      let deleted = 0;
      for (const m of this.models.values()) {
        const where: Record<string, unknown>[] = [];
        const ids = await own(m);
        if (ids.length > 0) where.push({ id: { in: ids } });
        if (m.hasTenant && tenants.length > 0)
          where.push({ tenant_id_: { in: tenants } });
        if (
          m.fields.some((x) => x.name === "createdBy_id_") &&
          users.length > 0
        )
          where.push({ createdBy_id_: { in: users } });
        if (where.length === 0) continue;
        try {
          deleted += (
            await this.prisma[m.delegate].deleteMany({ where: { OR: where } })
          ).count;
        } catch {
          // Lo referencia algo todavía: la próxima pasada.
        }
      }
      if (deleted === 0) break;
    }
    const left: string[] = [];
    for (const m of this.models.values()) {
      const n = (await own(m)).length;
      if (n > 0) left.push(m.name + "=" + n);
    }
    if (left.length > 0)
      throw new Error(
        "rowFactory: una corrida anterior dejó filas " +
          this.prefix +
          " que no se pudieron borrar: " +
          left.join(", ")
      );
  }

  /**
   * Borra lo que esta fábrica siembra, y nada más: las filas cuyo id tiene la
   * forma exacta de los suyos (<prefijo><Modelo>_<n>, en la tabla de ese modelo)
   * y los ids que se le den para cada modelo. Sin la expansión de purge() a las
   * empresas y los usuarios: la usan los controles de las baterías, que reclaman
   * un prefijo parecido al de la batería y no se tienen que llevar una fila
   * ajena que solo empiece igual.
   */
  async purgeSeeded(
    extra: (m: SchemaModel) => string[] = () => []
  ): Promise<void> {
    const seeded = async (m: SchemaModel): Promise<string[]> => {
      const head = this.prefix + m.name + "_";
      try {
        // El startsWith de Prisma es un LIKE: solo trae candidatos.
        const shaped = (
          await this.prisma[m.delegate].findMany({
            where: { id: { startsWith: head } },
            select: { id: true },
          })
        )
          .map((r: { id: string }) => r.id)
          .filter(
            (id: string) =>
              id.startsWith(head) && /^[0-9]+$/.test(id.slice(head.length))
          );
        const wanted = extra(m);
        const given =
          wanted.length > 0
            ? (
                await this.prisma[m.delegate].findMany({
                  where: { id: { in: wanted } },
                  select: { id: true },
                })
              ).map((r: { id: string }) => r.id)
            : [];
        return [...shaped, ...given];
      } catch {
        return []; // un modelo sin id de texto
      }
    };
    for (let pass = 0; pass < 10; pass++) {
      let deleted = 0;
      for (const m of this.models.values()) {
        const ids = await seeded(m);
        if (ids.length === 0) continue;
        try {
          deleted += (
            await this.prisma[m.delegate].deleteMany({
              where: { id: { in: ids } },
            })
          ).count;
        } catch {
          // Lo referencia algo todavía: la próxima pasada.
        }
      }
      if (deleted === 0) break;
    }
    const left: string[] = [];
    for (const m of this.models.values()) {
      const n = (await seeded(m)).length;
      if (n > 0) left.push(m.name + "=" + n);
    }
    if (left.length > 0)
      throw new Error(
        "rowFactory: una corrida anterior dejó filas sembradas con " +
          this.prefix +
          " que no se pudieron borrar: " +
          left.join(", ")
      );
  }

  /**
   * Borra lo creado, del último al primero, en varias pasadas (las cascadas se
   * llevan parte). Lo que el código bajo prueba creó por su cuenta con las
   * empresas o los usuarios de prueba (un evento de la cola de archivos, por
   * ejemplo) se borra antes, por esas columnas.
   */
  async cleanup(): Promise<void> {
    const mine = (delegate: string) =>
      this.created.filter((c) => c.delegate === delegate).map((c) => c.id);
    const tenants = mine("tenant");
    const users = mine("user");
    for (
      let pass = 0;
      pass < 4 && (tenants.length > 0 || users.length > 0);
      pass++
    ) {
      for (const m of this.models.values()) {
        const where: Record<string, unknown>[] = [];
        if (m.hasTenant && tenants.length > 0)
          where.push({ tenant_id_: { in: tenants } });
        if (
          m.fields.some((x) => x.name === "createdBy_id_") &&
          users.length > 0
        )
          where.push({ createdBy_id_: { in: users } });
        if (where.length === 0 || m.name === "User") continue;
        try {
          // Lo creado acá se borra después, en orden: se aparta por id exacto
          // (no por prefijo: el startsWith de Prisma es un LIKE).
          await this.prisma[m.delegate].deleteMany({
            where: {
              OR: where,
              NOT: { id: { in: this.created.map((c) => c.id) } },
            },
          });
        } catch {
          // Lo referencia algo todavía: la próxima pasada.
        }
      }
    }
    for (let pass = 0; pass < 4 && this.created.length > 0; pass++) {
      for (let i = this.created.length - 1; i >= 0; i--) {
        const { delegate, id } = this.created[i];
        try {
          await this.prisma[delegate].deleteMany({ where: { id } });
          this.created.splice(i, 1);
        } catch {
          // Alguien la referencia todavía: la próxima pasada.
        }
      }
    }
    if (this.created.length > 0) {
      throw new Error(
        "rowFactory: quedaron filas sin borrar: " +
          this.created.map((c) => c.delegate + ":" + c.id).join(", ")
      );
    }
  }
}
