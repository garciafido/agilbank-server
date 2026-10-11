import { PrismaClient } from "../../../prisma/generated-client/client";
import { ServiceContext } from "../../../service-context";
import { getStorageProvider } from "../../../common/storage";
import { injectable, inject } from "tsyringe";
import * as path from "path";

@injectable()
export class UserFileDownloadService {
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
    // Permitir acceso a archivos propios sin permiso user_retrieve
    const isOwnFile = id === this.context.currentUser.id;
    if (!isOwnFile && !this.context.permissions().has("user_retrieve")) {
      return null;
    }

    const data_field = `${fieldName}_server_data`;

    // Usar prisma directamente para evitar el check de permisos de SecurePrismaOps
    // ya que el check de permisos se hizo arriba
    const user = await this.prisma.user.findUnique({
      where: { id: id },
      select: { [data_field]: true, id: true },
    });

    if (user !== null && data_field in user) {
      const file_data: any = user[data_field as keyof typeof user];
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
