import { Resolvers } from "../../graphql/types";
import { GraphQLUpload } from "graphql-upload-minimal";
import { finished } from "stream/promises";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { uploadTempDir, tempExtension } from "../constants";

export const fileUploadResolvers: Resolvers = {
  // This maps the `Upload` scalar to the implementation provided
  // by the `graphql-upload` package.
  Upload: GraphQLUpload,

  Mutation: {
    singleUpload: async (_parent, args, _context, _info) => {
      const { createReadStream, filename, mimetype, encoding } =
        await args.file;
      const stream = createReadStream();
      const systemFilename = randomUUID();

      if (!fs.existsSync(uploadTempDir)) {
        fs.mkdirSync(uploadTempDir, { recursive: true });
      }
      const pathName = path.join(
        uploadTempDir,
        `${systemFilename}.${tempExtension}`
      );
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

    deleteUploadedFile: async (_parent, args, _context, _info) => {
      const pathName = path.join(
        uploadTempDir,
        `${args.ticket}.${tempExtension}`
      );
      await fs.promises.unlink(pathName);
      return args.ticket;
    },
  },
};
