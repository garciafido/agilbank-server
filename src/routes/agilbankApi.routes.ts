// La API del contrato con ProntoNet (/api/v1/extractos, /correcciones).
//
// Las rutas, los parsers y los manejadores viven en el módulo (`@agilbank/motor`):
// son contrato, y valen igual en todo producto que exponga esta API. Acá solo se
// le pasan las piezas que el módulo no puede saber de por sí: la base, cómo se
// autoriza, de dónde sale el almacenamiento y cómo se encola la lectura.

import { Router, json } from "express";
import { container } from "tsyringe";

import { agilbankRoutes } from "@agilbank/motor";

import { basePrisma } from "../prisma/client";
import { autorizarSistemaCliente } from "../common/services/integrationScopes";
import { getStorageProvider } from "../common/storage";
import { AbStatementReadPipelineService } from "../pipelines/abStatementRead/abStatementReadService";

export default agilbankRoutes(
  { Router, json },
  {
    db: basePrisma,
    authorizeClient: autorizarSistemaCliente,
    storage: getStorageProvider,
    // El pipeline crea el evento y publica en la cola en la MISMA transacción: así
    // el worker nunca lee un mensaje cuya fila todavía no existe.
    enqueueReading: (statementId, authorId, tenantId) =>
      container.resolve(AbStatementReadPipelineService).execute({ statementId }, {
        isSystemMode: false,
        currentUser: { id: authorId, tenant_id_: tenantId },
        container,
      } as never),
  },
);
