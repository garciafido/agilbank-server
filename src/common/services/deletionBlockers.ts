/**
 * Por qué no se puede borrar un registro.
 *
 * La tabla generada (deletionBlockers.generated.ts) dice, para cada entidad,
 * qué relaciones la referencian con RESTRICT o NO ACTION en la base. Se agrupan
 * por tipo y entidad raíz (un motivo por raíz), y se cuentan las RAÍCES
 * distintas que usan el registro por alguna de esas relaciones —el registro que
 * el usuario conoce: un autor, una obra—, no las filas: un autor que tiene la
 * editorial dos veces, o el país como país y como nacionalidad, cuenta una.
 *
 * Tres cuentas, y solo la primera da nombres:
 * - visibles: por SecurePrismaOps con el contexto real del usuario (empresa,
 *   permiso de lectura sobre la raíz, alcance por dueño o por usuario,
 *   registros híbridos, roles entre empresas). Un nombre aparece solo si el
 *   usuario ya podía ver ese registro en la app.
 * - de la empresa del usuario: sin SecurePrismaOps, solo con el filtro de empresa.
 * - total: sin SecurePrismaOps, sin filtros. Mayor que cero: no se puede borrar.
 *
 * Pedir los motivos exige lo mismo que borrar: que la entidad se borre por su
 * mutación (DELETION_QUERYABLE), permiso de borrado sobre la entidad (y el de
 * lectura, si el borrado lee el registro antes de borrarlo) y que el registro
 * sea visible para el usuario. Si no, "no encontrado", igual para un id ajeno
 * que para uno que no existe.
 *
 * El server manda datos, no texto: el cliente escribe el mensaje en cada idioma.
 */

import { container } from "tsyringe";
import type { PrismaClient } from "../../prisma/generated-client/client";
import type { ServiceContext } from "../../service-context";
import { NotFoundError, ValidationError } from "../errors";
import { SchemaMetadataStore } from "./schemaMetadata";
import { SecurePrismaOps } from "./securePrismaOps";
import {
  DELETION_BLOCKERS,
  DELETION_BLOCKER_ROOTS,
  DELETION_QUERYABLE,
  DELETION_REQUIRES_RETRIEVE,
  type DeletionBlockerName,
  type DeletionBlockerRelation,
} from "./deletionBlockers.generated";

export const DELETION_BLOCKERS_MAX_NAMES = 5;

export type DeletionBlockerItem = { id: string; name: DeletionBlockerName };

export type DeletionBlockerReason = {
  kind: "reference" | "audit";
  /** La entidad del registro que el usuario conoce (la raíz del camino). */
  rootEntity: string;
  /** "Modelo.campo" de cada relación por la que esta raíz usa el registro, en el orden de la tabla. */
  relations: string[];
  /** Null: el usuario no puede leer la raíz, la relación es desconocida (red de seguridad) o es modo sistema (nada se filtra, no hay "lo que el usuario ve"). */
  visible: { count: number; items: DeletionBlockerItem[] } | null;
  /** Raíces de la empresa del usuario que no tiene a la vista. Null: no se contó (modo sistema incluido). */
  hiddenInTenant: number | null;
  /** Raíces de otras empresas (solo en catálogos globales). Null: no se contó (modo sistema incluido). */
  otherTenants: number | null;
};

export type DeletionBlockers = {
  entity: string;
  id: string;
  blocked: boolean;
  reasons: DeletionBlockerReason[];
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

let ownStore: SchemaMetadataStore | undefined;

/**
 * La metadata que SecurePrismaOps necesita, en este orden:
 * 1. la que pasa quien llama (un servicio, un pipeline o el worker de PGMQ arman
 *    la suya y no la registran en el contenedor);
 * 2. la del contenedor, si está registrada (la del server): se llama a su
 *    build() si todavía no lo está (el server la construye al arrancar con
 *    initializeSchemaMetadata), y se usa esa instancia;
 * 3. una propia de este módulo, construida una sola vez por proceso.
 */
const metadataStore = (store?: SchemaMetadataStore): SchemaMetadataStore => {
  if (store) return store;
  if (container.isRegistered("SchemaMetadataStore", true)) {
    const shared = container.resolve<SchemaMetadataStore>("SchemaMetadataStore");
    if (!shared.isReady()) shared.build();
    return shared;
  }
  if (!ownStore) {
    ownStore = new SchemaMetadataStore();
    ownStore.build();
  }
  return ownStore;
};

const secureOps = (context: ServiceContext, prisma: PrismaClient, model: string, store: SchemaMetadataStore) =>
  new SecurePrismaOps(context, prisma, store, model as any, {});

/**
 * El filtro de Prisma sobre la raíz: las raíces que, bajando por el camino,
 * tienen una fila que referencia `id` por esta relación. Por ejemplo, las obras
 * que usan una editorial:
 * `{ authors: { some: { publishers: { some: { AND: [{ publisher_id: id }] } } } } }`.
 *
 * La condición va dentro de un AND: SecurePrismaOps agrega sus filtros (empresa,
 * creador) como claves del where en cada nivel, y una relación de auditoría
 * filtra justamente por tenant_id_ o createdBy_id_: sin el AND, la clave del
 * usuario pisaría la de la relación, y se contarían (y nombrarían) otras filas.
 */
export function rootFilter(relation: DeletionBlockerRelation, id: string): Record<string, unknown> {
  let where: Record<string, unknown> = { AND: [{ [relation.fk]: id }] };
  for (let i = relation.path.length - 1; i >= 0; i--) {
    where = { [relation.path[i]]: relation.pathMany[i] ? { some: where } : { is: where } };
  }
  return where;
}

/**
 * Las relaciones de la tabla agrupadas por tipo y raíz, en el orden de la tabla:
 * una raíz que usa el registro por dos relaciones es un solo motivo.
 */
export function groupByRoot(relations: DeletionBlockerRelation[]): DeletionBlockerRelation[][] {
  const groups = new Map<string, DeletionBlockerRelation[]>();
  for (const relation of relations) {
    const key = `${relation.kind}:${relation.rootEntity}`;
    groups.set(key, [...(groups.get(key) ?? []), relation]);
  }
  return Array.from(groups.values());
}

/** Las raíces que usan `id` por alguna de las relaciones del grupo (OR de sus filtros). */
export function groupFilter(group: DeletionBlockerRelation[], id: string): Record<string, unknown> {
  return group.length === 1 ? rootFilter(group[0], id) : { OR: group.map((relation) => rootFilter(relation, id)) };
}

/**
 * El mismo error para un id que no existe, uno ajeno y uno sin permiso, en la
 * consulta y en el borrado: no es un oráculo. Sin el modelo ni el id, ni en el
 * mensaje ni en un meta: el cliente muestra su texto genérico de "no encontrado".
 */
const notFound = () => new NotFoundError("Not found or not accessible.");

/**
 * Solo entidades de la tabla: el nombre no elige cualquier modelo, ni una clave
 * heredada como "constructor". Antes de cualquier consulta.
 */
function assertKnownEntity(entity: string): void {
  if (!Object.prototype.hasOwnProperty.call(DELETION_BLOCKERS, entity)) {
    throw new ValidationError("UNKNOWN_ENTITY", { code: "UNKNOWN_ENTITY", field: "entity" });
  }
}

/**
 * La constancia de que findDeletable verificó un registro: solo vale para su
 * entidad, su id, su contexto y su transacción (assertNotInUse). Es opaca: lo que
 * la respalda queda en este módulo, así que no se puede fabricar ni copiar. Solo
 * se registra si se pidió dentro de una transacción: sin ella no vencería
 * mientras viva el contexto, aunque el registro dejara de verse.
 */
declare const deletableProof: unique symbol;
export type DeletableProof = { readonly [deletableProof]: true };

const proofs = new WeakMap<object, { entity: string; id: string; context: ServiceContext; prisma: PrismaClient }>();

/**
 * El registro que se va a borrar, si quien llama puede borrarlo: la entidad está
 * en la tabla, tiene el permiso de borrado (y el de lectura, si el borrado lee
 * el registro antes de borrarlo) y el registro se ve con el filtro que aplica el
 * borrado. Si no, "no encontrado": el mismo error para un id que no existe, uno
 * ajeno, uno que no es texto y uno sin permiso.
 *
 * La usan la consulta, cada servicio de borrado y assertNotInUse (cuando no
 * recibe una prueba válida). El servicio la llama antes de los validadores del
 * proyecto: un validador que buscara el registro sin el filtro de empresa
 * respondería distinto para uno ajeno que para uno que no existe. `select`: lo
 * que el servicio necesita leer del registro (sus archivos, por ejemplo), en la
 * misma búsqueda. Devuelve el registro y una prueba de la verificación, para
 * assertNotInUse en la misma transacción (pedida sin `tx`, o con el cliente del
 * contexto como `tx`, la prueba no saltea nada).
 */
export async function findDeletable(
  entity: string,
  id: string,
  context: ServiceContext,
  tx?: PrismaClient,
  store?: SchemaMetadataStore,
  select: Record<string, boolean> = { id: true }
): Promise<{ record: Record<string, any>; proof: DeletableProof }> {
  assertKnownEntity(entity);
  // Un id que no es un texto (un objeto de filtro, por ejemplo) se trata como uno
  // inexistente: el mismo error, sin consultar.
  if (typeof id !== "string" || id === "") throw notFound();
  const prisma = tx ?? context.prisma;
  const metadata = metadataStore(store);

  // Lo mismo que exige borrar: el permiso de borrado; el de lectura donde el
  // servicio de borrado lee el registro antes de borrarlo (sus archivos: lo
  // exige antes, con su UnauthorizedError de siempre, así que en el borrado
  // nunca se llega acá sin él); y que el registro sea visible con el filtro que
  // aplica el borrado (SecurePrismaOps.delete no pide permiso de lectura).
  if (!context.isSystemMode) {
    const permissions = context.permissions();
    if (!permissions.has(`${lower(entity)}_delete`)) throw notFound();
    if (DELETION_REQUIRES_RETRIEVE.includes(entity) && !permissions.has(`${lower(entity)}_retrieve`)) {
      throw notFound();
    }
  }
  const record = await (prisma as any)[lower(entity)].findFirst({
    where: secureOps(context, prisma, entity, metadata).getSecureWhere({ id }),
    select,
  });
  if (!record) throw notFound();
  const proof = Object.freeze({}) as unknown as DeletableProof;
  if (tx && tx !== context.prisma) proofs.set(proof, { entity, id, context, prisma: tx });
  return { record, proof };
}

/** Si `proof` salió de findDeletable para esta entidad, este id, este contexto y esta transacción. */
function proves(proof: unknown, entity: string, id: string, context: ServiceContext, prisma: PrismaClient): boolean {
  const bound = typeof proof === "object" && proof !== null ? proofs.get(proof) : undefined;
  return !!bound && bound.entity === entity && bound.id === id && bound.context === context && bound.prisma === prisma;
}

export async function findDeletionBlockers(
  entity: string,
  id: string,
  context: ServiceContext,
  tx?: PrismaClient,
  store?: SchemaMetadataStore
): Promise<DeletionBlockers> {
  // Solo las entidades que se borran por su mutación: por las demás el permiso de
  // borrado no habilita ningún borrado desde el cliente, y responder sería un
  // oráculo. Para ellas, lo mismo que un id inexistente, sin consultar.
  assertKnownEntity(entity);
  if (!DELETION_QUERYABLE.includes(entity)) throw notFound();
  // La entidad, el id, los permisos y que el registro se vea: como el borrado.
  await findDeletable(entity, id, context, tx, store);
  return countBlockers(entity, id, context, tx ?? context.prisma, metadataStore(store));
}

/** Los motivos, sin verificar el registro: quien llama ya lo hizo (findDeletable). */
async function countBlockers(
  entity: string,
  id: string,
  context: ServiceContext,
  prisma: PrismaClient,
  metadata: SchemaMetadataStore
): Promise<DeletionBlockers> {
  const tenantId: string | undefined = (context.currentUser as { tenant_id_?: string } | null)?.tenant_id_ ?? undefined;
  const reasons: DeletionBlockerReason[] = [];
  for (const group of groupByRoot(DELETION_BLOCKERS[entity])) {
    const reason = await countReason(group, id, context, prisma, tenantId, metadata);
    if (reason) reasons.push(reason);
  }
  return { entity, id, blocked: reasons.length > 0, reasons };
}

async function countReason(
  group: DeletionBlockerRelation[],
  id: string,
  context: ServiceContext,
  prisma: PrismaClient,
  tenantId: string | undefined,
  metadata: SchemaMetadataStore
): Promise<DeletionBlockerReason | null> {
  // Todas las relaciones del grupo comparten tipo y raíz (groupByRoot).
  const [relation] = group;
  const root = relation.rootEntity;
  const where = groupFilter(group, id);
  const rootDelegate = (prisma as any)[lower(root)];

  // Total, sin SecurePrismaOps (sin filtros). Cero: esta relación no frena el borrado.
  const total: number = await rootDelegate.count({ where });
  if (total === 0) return null;

  // En modo sistema nada se filtra: no hay "lo que el usuario puede ver". La raíz
  // frena (el total decide), pero sin nombres ni cantidades: la misma forma que la
  // red de seguridad, para que ningún dato de otra empresa salga en un error.
  if (context.isSystemMode) {
    return {
      kind: relation.kind,
      rootEntity: root,
      relations: group.map((r) => `${r.model}.${r.field}`),
      visible: null,
      hiddenInTenant: null,
      otherTenants: null,
    };
  }

  const meta = metadata.get(root as any);
  const tenantField = meta?.tenantIdField ?? "tenant_id_";
  const inOwnTenant = (w: Record<string, unknown>) => ({ AND: [w, { [tenantField]: tenantId }] });
  const scoped = !relation.rootGlobal && !!tenantId;

  // De la empresa del usuario, sin SecurePrismaOps (solo el filtro de empresa).
  const inTenant: number = scoped ? await rootDelegate.count({ where: inOwnTenant(where) }) : total;

  const reason: DeletionBlockerReason = {
    kind: relation.kind,
    rootEntity: root,
    relations: group.map((r) => `${r.model}.${r.field}`),
    visible: null,
    hiddenInTenant: inTenant,
    otherTenants: total - inTenant,
  };

  // Sin permiso de lectura sobre la raíz: solo cantidades.
  if (!context.permissions().has(`${lower(root)}_retrieve`)) return reason;

  const rootOps = secureOps(context, prisma, root, metadata);
  const visibleCount: number = await rootOps.count({ where });
  // Solo un híbrido o un rol entre empresas ve raíces de otras empresas.
  const crosses = scoped && !!(meta?.hybridTenantFlagField || meta?.crossTenantForRoles);
  const visibleInTenant: number = crosses ? await rootOps.count({ where: inOwnTenant(where) }) : visibleCount;

  let items: DeletionBlockerItem[] = [];
  const display = relation.kind === "reference" && visibleCount > 0 ? DELETION_BLOCKER_ROOTS[root]?.display : null;
  if (display) {
    const { select, name } = await display();
    const rows: Array<{ id: string }> = await rootOps.findMany({
      where,
      select: { ...select, id: true },
      orderBy: DELETION_BLOCKER_ROOTS[root].orderBy,
      take: DELETION_BLOCKERS_MAX_NAMES,
    } as any);
    items = rows.map((row) => ({ id: row.id, name: name(row as never) }));
  }

  reason.visible = { count: visibleCount, items };
  reason.hiddenInTenant = Math.max(0, inTenant - visibleInTenant);
  reason.otherTenants = Math.max(0, total - inTenant - (visibleCount - visibleInTenant));
  return reason;
}

/** Resumen en castellano para el log del server: entidades y cantidades, sin nombres. */
export function deletionBlockersSummary(blockers: DeletionBlockers): string {
  const parts = blockers.reasons.map((r) => {
    const counts =
      r.hiddenInTenant === null
        ? "sin cantidades"
        : `${r.visible?.count ?? 0} a la vista, ${r.hiddenInTenant} sin acceso en la empresa, ${r.otherTenants} de otras empresas`;
    return `${r.relations.join(" + ")} (raíz ${r.rootEntity}): ${counts}`;
  });
  return `No se puede borrar ${blockers.entity} ${blockers.id}: ${parts.join("; ")}`;
}

export type AssertNotInUseOptions = {
  /**
   * La prueba que devolvió findDeletable. Si es de esta entidad, este id, este
   * contexto y esta transacción, los permisos y que el registro se ve ya están
   * verificados, y no se busca otra vez (el servicio de borrado). Cualquier otra
   * cosa, o ninguna: la verificación completa.
   */
  proof?: DeletableProof;
};

/**
 * Lanza ENTITY_IN_USE si algo impide borrar el registro. La usan los servicios de
 * borrado, dentro de su transacción y después de los validadores del proyecto,
 * para toda entidad de la tabla (también las que la consulta no atiende: los
 * remove anidados de un formulario, los pipelines).
 */
export async function assertNotInUse(
  entity: string,
  id: string,
  context: ServiceContext,
  tx?: PrismaClient,
  store?: SchemaMetadataStore,
  options: AssertNotInUseOptions = {}
): Promise<void> {
  const prisma = tx ?? context.prisma;
  if (!proves(options.proof, entity, id, context, prisma)) {
    await findDeletable(entity, id, context, tx, store);
  }
  const blockers = await countBlockers(entity, id, context, prisma, metadataStore(store));
  if (!blockers.blocked) return;
  console.warn(`[deletionBlockers] ${deletionBlockersSummary(blockers)}`);
  throw new ValidationError("ENTITY_IN_USE", {
    code: "ENTITY_IN_USE",
    detailType: "deletion-blockers",
    blockers,
  });
}
