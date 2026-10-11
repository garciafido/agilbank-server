import { PrismaClient } from "../../../prisma/generated-client/client";
import { ServiceContext } from "../../../service-context";
import { getStorageProvider } from "../../../common/storage";
import { injectable, inject } from "tsyringe";
import * as path from "path";

@injectable()
export class TenantFileDownloadService {
  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient
  ) {}

  async downloadFile(
    fieldName: string,
    id: string,
    fileName: string
  ): Promise<string | null> {
    if (!this.context.currentUser || !this.context.currentUser.active) {
      return null;
    }
    // Permitir acceso a archivos del propio tenant sin permiso tenant_retrieve
    const userTenantId =
      (this.context.currentUser as any).tenant_?.id ||
      (this.context.currentUser as any).tenant_id_;
    const isOwnTenant = id === userTenantId;
    if (!isOwnTenant && !this.context.permissions().has("tenant_retrieve")) {
      return null;
    }

    const data_field = `${fieldName}_server_data`;

    // Usar prisma directamente para evitar el check de permisos de SecurePrismaOps
    // ya que el check de permisos se hizo arriba
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: id },
      select: { [data_field]: true, id: true },
    });

    if (tenant !== null && data_field in tenant) {
      const file_data: any = tenant[data_field as keyof typeof tenant];
      const storage = getStorageProvider();
      const key = path.join(
        file_data.baseName,
        file_data.uuid,
        file_data.filename
      );
      return await storage.download(key);
    }

    return null;
  }
}
