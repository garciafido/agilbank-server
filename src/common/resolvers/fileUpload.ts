import { Resolvers } from "../../graphql/types";
import { GraphQLUpload } from "graphql-upload-minimal";
import { finished } from "stream/promises";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { uploadTempDir } from "../constants";
import { UnauthorizedError } from "../errors";
import { tempPathForTicket } from "../utils/tempPath";

export const fileUploadResolvers: Resolvers = {
  // This maps the `Upload` scalar to the implementation provided
  // by the `graphql-upload` package.
  Upload: GraphQLUpload,

  Mutation: {
    singleUpload: async (_parent, args, context, _info) => {
      if (!context.isSystemMode && !context.currentUser)
        throw new UnauthorizedError(
          "Usuario no autenticado para esta operación."
        );
      const { createReadStream, filename, mimetype, encoding } =
        await args.file;
      const stream = createReadStream();
      const systemFilename = randomUUID();

      if (!fs.existsSync(uploadTempDir)) {
        fs.mkdirSync(uploadTempDir, { recursive: true });
      }
      const pathName = tempPathForTicket(systemFilename);
      const out = fs.createWriteStream(pathName);
      stream.pipe(out);
      await finished(out);
      const stats = fs.statSync(pathName);
      return {
        ticket: systemFilename,
        filename,
        mimetype,
        encoding,
        size: stats.size,
      };
    },

    deleteUploadedFile: async (_parent, args, context, _info) => {
      if (!context.isSystemMode && !context.currentUser)
        throw new UnauthorizedError(
          "Usuario no autenticado para esta operación."
        );
      const pathName = tempPathForTicket(args.ticket);
      await fs.promises.unlink(pathName);
      return args.ticket;
    },
  },
};
