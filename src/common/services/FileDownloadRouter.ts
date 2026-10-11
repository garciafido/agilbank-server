import { injectable, inject, DependencyContainer } from "tsyringe";
import { ServiceContext } from "../../service-context";
import { AbStatementFileDownloadService } from "../../entities/abStatement/services/AbStatementFileDownloadService";
import { UserFileDownloadService } from "../../entities/user/services/UserFileDownloadService";
import { TenantFileDownloadService } from "../../entities/tenant/services/TenantFileDownloadService";

@injectable()
export class FileDownloadRouter {
  constructor(
    @inject("ServiceContext") private _context: ServiceContext,
    @inject("DependencyContainer") private container: DependencyContainer
  ) {}

  async getFileData(params: {
    field_path: string;
    id: string;
    file_id: string;
  }): Promise<string | null> {
    const { field_path, id, file_id } = params;
    const [entity, field] = field_path.split(".");

    if (entity === "AbStatement") {
      const service = this.container.resolve(AbStatementFileDownloadService);
      return service.downloadFile(field, id, file_id);
    }
    if (entity === "User") {
      const service = this.container.resolve(UserFileDownloadService);
      return service.downloadFile(field, id, file_id);
    }
    if (entity === "Tenant") {
      const service = this.container.resolve(TenantFileDownloadService);
      return service.downloadFile(field, id, file_id);
    }

    return null;
  }
}
