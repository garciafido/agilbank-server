/**
 * El nombre con que se presenta la empresa ante un contacto en la validación de
 * datos: el encabezado y el mensaje del mail que le pide cargar y/o verificar
 * sus datos ("{nombre} requiere que cargues y/o verifiques tus datos.") y el
 * título del formulario público donde lo hace. La verificación simple de un
 * email (sin datos) usa siempre el nombre de la empresa, no este.
 *
 * Es un asiento del proyecto: el generador lo emite con el nombre de la empresa
 * (tenant.name) y el proyecto lo puede reemplazar en develop, por ejemplo por el
 * de una editorial propia. Mientras el generador no cambie este archivo, la
 * regeneración no pisa la versión del proyecto. Si lo cambia, git mezcla solo lo
 * que no se pisa con lo del proyecto y da conflicto donde los dos
 * cambiaron las mismas líneas o líneas pegadas: después de regenerar hay que
 * revisar este archivo, y tsc avisa si la firma dejó de calzar.
 *
 * Contrato:
 * - Devuelve texto plano. El mail lo escapa para HTML y el formulario lo muestra
 *   como texto: no hace falta (ni hay que) escaparlo acá.
 * - Si devuelve "" o solo espacios, la ruta usa el nombre de la empresa.
 * - `prisma` es el cliente sin filtros de empresa (basePrisma), no una
 *   transacción: toda consulta de la implementación del proyecto tiene que
 *   filtrar por `tenantId`, que es el de la verificación firmada.
 */
import type { PrismaClient } from "../../prisma/generated-client/client";

export async function senderDisplayName(
  tenantId: string,
  prisma: PrismaClient
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? "";
}
