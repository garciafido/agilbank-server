import { container, singleton, Lifecycle } from "tsyringe";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { requestPoolConfig } from "../prisma/poolOptions";
import { PrismaClient } from "../prisma/generated-client/client";
import { SchemaMetadataStore } from "../common/services/schemaMetadata";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { LoginThrottleService } from "../services/auth/LoginThrottleService";
import { TwoFaService } from "../services/auth/TwoFaService";
import { WorkerEventRetryService } from "../services/WorkerEventRetryService";
import { SimulationService } from "../services/SimulationService";

import { AbConceptCorrectionCreateService } from "../entities/abConceptCorrection/services/abConceptCorrectionCreateService";
import { UserCreateService } from "../entities/user/services/userCreateService";
import { RoleCreateService } from "../entities/role/services/roleCreateService";
import { PermissionCreateService } from "../entities/permission/services/permissionCreateService";
import { TenantCreateService } from "../entities/tenant/services/tenantCreateService";
import { IntegrationClientCreateService } from "../entities/integrationClient/services/integrationClientCreateService";
import { UserNotificationPreferenceCreateService } from "../entities/userNotificationPreference/services/userNotificationPreferenceCreateService";
import { EmailVerificationCreateService } from "../entities/emailVerification/services/emailVerificationCreateService";

import { AbStatementFileDownloadService } from "../entities/abStatement/services/AbStatementFileDownloadService";
import { UserFileDownloadService } from "../entities/user/services/UserFileDownloadService";
import { TenantFileDownloadService } from "../entities/tenant/services/TenantFileDownloadService";
import { FileDownloadRouter } from "../common/services/FileDownloadRouter";

// --- Registrar Dependencias Singleton ---

// 1. PrismaClient: Queremos una única instancia para toda la app.
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool(requestPoolConfig(connectionString));
const adapter = new PrismaPg(pool);
container.register<PrismaClient>("PrismaClient", {
  useValue: new PrismaClient({ adapter }),
});

// 2. SchemaMetadataStore
container.register<SchemaMetadataStore>(
  "SchemaMetadataStore",
  { useClass: SchemaMetadataStore },
  { lifecycle: Lifecycle.Singleton }
);

// 3. RefreshTokenService
container.register(
  "RefreshTokenService",
  { useClass: RefreshTokenService },
  { lifecycle: Lifecycle.ResolutionScoped }
);

// 4. LoginThrottleService - Progressive throttling for failed login attempts
container.register(
  "LoginThrottleService",
  { useClass: LoginThrottleService },
  { lifecycle: Lifecycle.Singleton }
);

// 5. TwoFaService - TOTP two-factor authentication
container.register(
  "TwoFaService",
  { useClass: TwoFaService },
  { lifecycle: Lifecycle.ResolutionScoped }
);

// 6. WorkerEventRetryService - reintento manual genérico de pipeline jobs
container.register(
  "WorkerEventRetryService",
  { useClass: WorkerEventRetryService },
  { lifecycle: Lifecycle.ResolutionScoped }
);

// 7. SimulationService - control de simulaciones (gates resume/abort)
container.register(
  "SimulationService",
  { useClass: SimulationService },
  { lifecycle: Lifecycle.ResolutionScoped }
);

// --- Registrar Servicios y Otros ---
container.register(
  "AbConceptCorrectionCreateService",
  { useClass: AbConceptCorrectionCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "UserCreateService",
  { useClass: UserCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "RoleCreateService",
  { useClass: RoleCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "PermissionCreateService",
  { useClass: PermissionCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "TenantCreateService",
  { useClass: TenantCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "IntegrationClientCreateService",
  { useClass: IntegrationClientCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "UserNotificationPreferenceCreateService",
  { useClass: UserNotificationPreferenceCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "EmailVerificationCreateService",
  { useClass: EmailVerificationCreateService },
  { lifecycle: Lifecycle.ResolutionScoped }
);

container.register(
  "AbStatementFileDownloadService",
  { useClass: AbStatementFileDownloadService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "UserFileDownloadService",
  { useClass: UserFileDownloadService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "TenantFileDownloadService",
  { useClass: TenantFileDownloadService },
  { lifecycle: Lifecycle.ResolutionScoped }
);
container.register(
  "FileDownloadRouter",
  { useClass: FileDownloadRouter },
  { lifecycle: Lifecycle.ResolutionScoped }
);

// --- Exportar el Contenedor (Opcional pero útil) ---
// Puedes exportar el contenedor principal si necesitas resolver dependencias manualmente
// en algún punto del arranque, aunque el objetivo es usar inyección automática.
// export default container;

console.log(">>> [DI] dependencyContainer.ts - FIN");
