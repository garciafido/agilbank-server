import { PrismaClient } from "../../../prisma/generated-client/client";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { ServiceContext } from "../../../service-context";
import { getStorageProvider } from "../../../common/storage";
import { injectable, inject } from "tsyringe";
import { AbStatementOneService } from "./abStatementOneService";
import * as path from "path";

@injectable()
export class AbStatementFileDownloadService {
  private oneService: AbStatementOneService;

  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient,
    @inject("SchemaMetadataStore") private schemaMetaStore: SchemaMetadataStore
  ) {
    this.oneService = new AbStatementOneService(
      this.context,
      this.prisma,
      this.schemaMetaStore
    );
  }

  async downloadFile(
    fieldName: string,
    id: string,
    fileName: string
  ): Promise<string | null> {
    if (
      !this.context.currentUser ||
      !this.context.currentUser.active ||
      !this.context.permissions().has("abStatement_retrieve")
    ) {
      return null;
    }

    const data_field = `${fieldName}_server_data`;

    const abStatement = await this.oneService.getOne(
      { id: id },
      { [data_field]: true, id: true }
    );

    if (abStatement !== null && data_field in abStatement) {
      const file_data: any =
        abStatement[data_field as keyof typeof abStatement];
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
