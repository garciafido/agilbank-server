import { Resolvers, UploadedFile } from "../../graphql/types";
import {
  DoesNotExistError,
  getErrorMessage,
  PrismaError,
  UnknownError,
} from "../errors";
import { Prisma } from "../../prisma/generated-client/client";
import * as _ from "lodash";
import { randomUUID } from "crypto";
import {
  fileServerDataSetter,
  fileClientDataSetter,
  getDatePath,
} from "../utils/fileSetter";
import { moveUploadedFiles } from "../utils/moveUploadedFiles";

export const profileResolvers: Resolvers = {
  Mutation: {
    saveProfile: async (_parent, args, context, _info) => {
      if (context.currentUser && context.currentUser.active) {
        try {
          await context.prisma.$transaction(async (prisma) => {
            const oldUser = await prisma.user.findUnique({
              where: { id: context.currentUser?.id },
              select: { profile: true },
            });
            if (!oldUser) {
              throw new DoesNotExistError();
            }
            let newProfile: any = oldUser.profile
              ? (oldUser.profile as Prisma.JsonObject)
              : {};
            _.set(newProfile, args.key.join("."), args.value);
            await prisma.user.update({
              where: { id: context.currentUser?.id },
              data: { profile: newProfile },
            });
          });
          return true;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            throw new PrismaError(error, undefined, undefined, context);
          } else {
            throw new UnknownError(getErrorMessage(error));
          }
        }
      }
      return false;
    },
    updateMyAvatar: async (_parent, args, context, _info) => {
      if (context.currentUser && context.currentUser.active) {
        try {
          const user = await context.prisma.user.findUnique({
            where: { id: context.currentUser.id },
          });
          if (!user) {
            throw new DoesNotExistError();
          }

          const filesToMove: {
            name: string;
            uploadedFile: UploadedFile;
            uuid: string;
          }[] = [];
          const nowForService = new Date();

          const updatedUser = await context.prisma.user.update({
            where: { id: context.currentUser.id },
            data: {
              version_: randomUUID(),
              avatar_server_data: fileServerDataSetter(
                `User.avatar/${getDatePath(nowForService)}/`,
                args.avatar,
                filesToMove
              ),
              avatar_data: fileClientDataSetter("User.avatar", args.avatar),
              avatar: args.avatar?.filename || null,
            },
          });

          if (filesToMove.length > 0) {
            await moveUploadedFiles(context.currentUser.id, filesToMove);
          }

          return updatedUser;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            throw new PrismaError(error, undefined, undefined, context);
          } else {
            throw new UnknownError(getErrorMessage(error));
          }
        }
      }
      throw new UnknownError("User not authenticated");
    },
    setMyLanguage: async (_parent, args, context, _info) => {
      // Self-service: el usuario logueado actualiza SU PROPIO idioma de interfaz.
      // No requiere permiso de editar User (SysAdmin-only): actúa solo sobre el
      // registro del propio usuario y sobre el campo language exclusivamente.
      if (context.currentUser && context.currentUser.active) {
        try {
          const updatedUser = await context.prisma.user.update({
            where: { id: context.currentUser.id },
            data: {
              version_: randomUUID(),
              language: args.language,
            },
          });
          return updatedUser;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            throw new PrismaError(error, undefined, undefined, context);
          } else {
            throw new UnknownError(getErrorMessage(error));
          }
        }
      }
      throw new UnknownError("User not authenticated");
    },
  },
};
