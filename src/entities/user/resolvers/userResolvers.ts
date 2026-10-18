/* eslint-disable @typescript-eslint/no-unused-vars */
import { APP_SECRET, createSystemContext } from "../../../service-context";
import { LoginThrottleService } from "../../../services/auth/LoginThrottleService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  UserResolvers,
  MutationUserCreateArgs,
  MutationUserUpdateArgs,
  MutationUserDeleteArgs,
  QueryUserOneArgs,
  QueryUserListWithOffsetArgs,
  QueryUserListWithCursorArgs,
} from "../../../graphql/types";
import { RefreshTokenService } from "../../../services/RefreshTokenService";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import { TwoFaService } from "../../../services/auth/TwoFaService";
import { UserCreateService } from "../services/userCreateService";
import { UserDeleteService } from "../services/userDeleteService";
import { UserListWithCursorService } from "../services/userListWithCursorService";
import { UserListWithOffsetService } from "../services/userListWithOffsetService";
import { UserOneService } from "../services/userOneService";
import { UserUpdateService } from "../services/userUpdateService";
import { enqueuePasswordResetEmail } from "../../../workers/queues/emailQueue";
import {
  generateResetToken,
  hashToken,
  getTokenExpiration,
} from "../../../common/utils/passwordUtils";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import { sign } from "jsonwebtoken";
import { userDisplayId, userDisplayIdFragments } from "./displayId";
import { DoesNotExistError } from "../../../common/errors";
import { MustBeLoggedInError } from "../../../common/errors";
import { UnauthorizedError } from "../../../common/errors";
import { compare, hash } from "bcrypt";
import { randomUUID } from "crypto";

const userFileDataFragments: Prisma.UserSelect = {
  avatar_data: true,
};

export const userResolvers: {
  Query: Pick<
    QueryResolvers,
    "userOne" | "userListWithOffset" | "userListWithCursor"
  >;
  Mutation: Pick<MutationResolvers, "userCreate" | "userUpdate" | "userDelete">;
  User: UserResolvers;
} = {
  Query: {
    userOne: async (
      _parent: any,
      args: QueryUserOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(UserOneService);
      // Prepare selection set from GraphQL query info
      const select = {
        ...userDisplayIdFragments,
        ...userFileDataFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    userListWithOffset: async (
      _parent: any,
      args: QueryUserListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        UserListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.UserWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.UserOrderByWithRelationInput[];
      const select = {
        ...userDisplayIdFragments,
        ...userFileDataFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.listWithOffset({
        // Assuming method takes an options object
        where,
        orderBy,
        skip: args.offset, // Map GQL 'offset' to Prisma 'skip'
        take: args.take,
        select,
      });
    },
    userListWithCursor: async (
      _parent: any,
      args: QueryUserListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        UserListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.UserWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.UserOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...userDisplayIdFragments,
        ...userFileDataFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.listWithCursor({
        // Assuming method takes an options object
        where,
        orderBy,
        cursorKey: args.cursorKey ? { id: args.cursorKey } : undefined, // Assuming cursor is on 'id' field
        take: args.take,
        select,
      });
    },
    me: async (_parent, _args, context, _info): Promise<any> => {
      if (context.currentUser === null) {
        throw new MustBeLoggedInError();
      }
      return context.currentUser;
    },
    mySessions: async (_parent, _args, context, _info): Promise<any> => {
      if (context.currentUser === null) {
        throw new MustBeLoggedInError();
      }

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      const sessions = await tokenService.getUserSessions(
        context.currentUser.id
      );

      return sessions.map((session) => ({
        id: session.id,
        browserName: session.browserName,
        browserVersion: session.browserVersion,
        osName: session.osName,
        deviceType: session.deviceType,
        ipAddress: session.ipAddress,
        lastUsedAt: session.lastUsedAt,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      }));
    },
    myTrustedDevices: async (_parent, _args, context, _info): Promise<any> => {
      if (context.currentUser === null) {
        throw new MustBeLoggedInError();
      }
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      return twoFaService.listDevices(context.currentUser.id);
    },
  },

  // Resolvers specific to the User type
  User: {
    displayId: (parent) => `${parent?.email} ${parent?.name}`,
    tenantDisplayName: (
      parent,
      _args,
      context: MyApolloContext,
      _info
    ): Promise<any> => {
      if (!parent.tenant_ || !parent.tenant_.name) {
        return null;
      }
      if (
        !context.permissions().has("tenant_retrieve") &&
        !context.permissions().has("tenant_retrieve_name_only")
      ) {
        return null;
      }
      return parent.tenant_.name;
    },
    company: (parent) => {
      if (!parent.tenant_) return null;
      return {
        id: parent.tenant_.id,
        name: parent.tenant_.name,
        logo: parent.tenant_.logo,
        logo_data: parent.tenant_.logo_data,
        extra: null,
      };
    },
  },
  Mutation: {
    userCreate: async (
      _parent: any,
      args: MutationUserCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(UserCreateService);
      const select = {
        ...userDisplayIdFragments,
        ...userFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.createUser(args, select);
    },

    userUpdate: async (
      _parent: any,
      args: MutationUserUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(UserUpdateService);
      const select = {
        ...userDisplayIdFragments,
        ...userFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.updateUser(args, select);
    },

    userDelete: async (
      _parent: any,
      args: MutationUserDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(UserDeleteService);
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...userDisplayIdFragments,
        ...userFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteUser(args, select); // Assuming method deleteUser
    },
    login: async (_parent, args, context, _info): Promise<any> => {
      if (!args.email.includes("@")) {
        throw new Error("Invalid email");
      }

      // Get IP for throttling
      const clientIp =
        context.req.ip || context.req.connection?.remoteAddress || "unknown";

      // Apply progressive throttling based on failed attempts
      const throttleService = context.container.resolve<LoginThrottleService>(
        "LoginThrottleService"
      );
      await throttleService.throttleIfNeeded(clientIp, args.email);

      const queryArgs: any = {
        where: { email: args.email },
      };
      const systemContext = await createSystemContext(context.req);
      const user = await systemContext.prisma.user.findUnique(queryArgs);
      if (!user) {
        // Record failed attempt before throwing
        await throttleService.recordFailedAttempt(clientIp, args.email);
        throw new Error("Invalid email or password");
      }
      if (!user.active) {
        // Record failed attempt before throwing
        await throttleService.recordFailedAttempt(clientIp, args.email);
        throw new Error("Inactive user");
      }
      const passwordValid = await compare(args.password, user.password);
      if (!passwordValid) {
        // Record failed attempt before throwing
        await throttleService.recordFailedAttempt(clientIp, args.email);
        throw new Error("Invalid email or password");
      }

      // Successful login - clear throttle state
      await throttleService.clearThrottle(clientIp, args.email);

      // Check if user has 2FA enabled
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      if (user.twoFaseAuth) {
        // Trusted-device bypass: if a valid device cookie is present for this user,
        // skip the 2FA prompt entirely. Cookie expires after DEVICE_TRUST_DAYS.
        const deviceToken = TwoFaService.readCookie(
          context.req.headers.cookie,
          TwoFaService.DEVICE_COOKIE_NAME
        );
        const trusted =
          user.twoFaVerifiedAt &&
          (await twoFaService.isTrustedDevice(deviceToken, user.id));
        if (!trusted) {
          // El tipo del token temporal sigue al estado del 2FA: el de configurar no
          // verifica y el de verificar no configura (con él no se rota el secreto).
          const tempToken = twoFaService.createTempToken(
            user.id,
            user.twoFaVerifiedAt ? "verify" : "setup"
          );
          if (!user.twoFaVerifiedAt) {
            return {
              twoFaRequired: true,
              twoFaAction: "setup",
              tempToken,
              accessToken: null,
              refreshToken: null,
              accessExpiresIn: null,
              refreshExpiresIn: null,
            };
          }
          return {
            twoFaRequired: true,
            twoFaAction: "verify",
            tempToken,
            accessToken: null,
            refreshToken: null,
            accessExpiresIn: null,
            refreshExpiresIn: null,
          };
        }
        // Fall through: trusted device, issue tokens directly.
      }

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      const deviceInfo = {
        ipAddress: clientIp,
      };

      const tokenPair = await tokenService.createTokenPair(user.id, deviceInfo);

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessExpiresIn: tokenPair.accessExpiresIn,
        refreshExpiresIn: tokenPair.refreshExpiresIn,
        twoFaRequired: false,
        twoFaAction: null,
        tempToken: null,
      };
    },
    refreshToken: async (_parent, args, context, _info): Promise<any> => {
      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );

      const deviceInfo = {
        ipAddress: context.req.ip || context.req.connection?.remoteAddress,
      };

      try {
        const tokenPair = await tokenService.refreshTokenPair(
          args.refreshToken,
          deviceInfo
        );

        return {
          accessToken: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          accessExpiresIn: tokenPair.accessExpiresIn,
          refreshExpiresIn: tokenPair.refreshExpiresIn,
        };
      } catch (error: any) {
        if (error.name === "TokenReuseDetectedError") {
          throw new UnauthorizedError(
            "Security alert: Token reuse detected. All sessions have been terminated."
          );
        }
        if (error.name === "TokenExpiredError") {
          throw new UnauthorizedError(
            "Refresh token has expired. Please login again."
          );
        }
        if (error.name === "TokenRevokedError") {
          throw new UnauthorizedError(
            "Token has been revoked. Please login again."
          );
        }
        throw new UnauthorizedError("Invalid refresh token");
      }
    },
    logout: async (_parent, _args, context, _info): Promise<boolean> => {
      if (!context.currentUser) {
        return true;
      }

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      await tokenService.revokeUserTokens(
        context.currentUser.id,
        "user_logout"
      );

      return true;
    },
    revokeAllTokens: async (
      _parent,
      _args,
      context,
      _info
    ): Promise<boolean> => {
      if (!context.currentUser) {
        throw new MustBeLoggedInError();
      }

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      await tokenService.revokeUserTokens(
        context.currentUser.id,
        "user_action_revoke_all"
      );

      return true;
    },
    revokeTrustedDevice: async (
      _parent,
      args,
      context,
      _info
    ): Promise<boolean> => {
      if (!context.currentUser) {
        throw new MustBeLoggedInError();
      }
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      await twoFaService.revokeDevice(args.id, context.currentUser.id);
      return true;
    },
    revokeAllTrustedDevices: async (
      _parent,
      _args,
      context,
      _info
    ): Promise<boolean> => {
      if (!context.currentUser) {
        throw new MustBeLoggedInError();
      }
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      await twoFaService.revokeAllForUser(context.currentUser.id);
      return true;
    },
    userChangePassword: async (_parent, args, context, _info): Promise<any> => {
      if (context.currentUser !== null && context.currentUser.active) {
        const user = await context.prisma.user.findUnique({
          where: { id: context.currentUser.id },
        });
        if (user !== null) {
          const passwordValid = await compare(args.oldPassword, user.password);
          if (passwordValid) {
            const hashedNewPassword = await hash(args.newPassword, 10);
            return context.prisma.user.update({
              data: {
                version_: randomUUID(),
                password: hashedNewPassword,
              },
              where: { id: context.currentUser.id },
            });
          } else {
            throw new Error("Invalid old password");
          }
        } else {
          throw new DoesNotExistError("User");
        }
      } else {
        throw new UnauthorizedError();
      }
    },
    userResetPassword: async (_parent, args, context, info): Promise<any> => {
      if (
        context.currentUser === null ||
        !context.currentUser.active ||
        !context.permissions().has("user_update")
      ) {
        throw new UnauthorizedError();
      }

      // El alcance se pide EXPLÍCITO, y ésa es toda la corrección.
      //
      // Antes esto leía y escribía con el cliente crudo por email, y el email
      // es unique GLOBAL incluso con multiTenancy: cualquier rol con
      // user_update alcanzaba userOps de las demás empresas. Le sobreescribía
      // el token de recuperación a un usuario ajeno, le disparaba el mail, y
      // devolvía su fila sin pasar por la poda del select.
      //
      // Ahora pasa por SecurePrismaOps: quien tenga el privilegio declarado
      // (crossTenantForRoles) llega a todo el sistema —el administrador del
      // sistema tiene que poder resetear cualquier password—, y quien no,
      // solo a su empresa. El privilegio se ve en esta línea y sale de la
      // metadata del modelo, no de un nombre de rol escrito acá.
      const store = context.container.resolve<SchemaMetadataStore>(
        "SchemaMetadataStore"
      );
      const userOps = new SecurePrismaOps(
        context,
        context.prisma,
        store,
        "User",
        {}
      );
      const db = userOps.canForAllTenants() ? userOps.forAllTenants() : userOps;

      // findFirst y no findUnique: el email es único globalmente, así que un
      // findUnique buscaría la fila ANTES de que el filtro de empresa la
      // acote. Acá la condición de empresa entra en el where.
      const user = await db.findFirst({
        where: { email: args.email },
        select: { id: true, email: true, active: true },
      });

      // El MISMO error si el email no existe y si existe en otra empresa. La
      // diferencia era un oráculo de enumeración sobre TODO el sistema: un
      // administrador de una empresa podía averiguar qué direcciones tienen
      // cuenta en las demás, de a una.
      if (!user) {
        throw new DoesNotExistError("User");
      }

      const token = generateResetToken();
      const tokenHash = hashToken(token);
      const expiresAt = getTokenExpiration(1); // 1 hora

      // Por id, y el id salió de la lectura ya acotada. `version_` no se pasa:
      // lo estampa la inyección de auditoría de SecurePrismaOps.
      const updated = await db.update({
        where: { id: user.id },
        data: {
          passwordResetToken: tokenHash,
          passwordResetExpiresAt: expiresAt,
        },
        select: infoToSelect(info),
      });
      if (user.active) {
        await enqueuePasswordResetEmail(user.id, user.email, token);
      }
      return updated;
    },
    setupTwoFa: async (_parent, args, context, _info): Promise<any> => {
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      const { userId } = twoFaService.verifyTempToken(args.tempToken, "setup");
      return twoFaService.generateSetup(userId);
    },
    confirmTwoFaSetup: async (_parent, args, context, _info): Promise<any> => {
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      const { userId } = twoFaService.verifyTempToken(args.tempToken, "setup");

      const valid = await twoFaService.verifyCode(userId, args.code);
      if (!valid) {
        throw new Error("Invalid 2FA code");
      }

      await twoFaService.confirmSetup(userId);

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      const clientIp =
        context.req.ip || context.req.connection?.remoteAddress || "unknown";
      const tokenPair = await tokenService.createTokenPair(userId, {
        ipAddress: clientIp,
      });

      // Recordar dispositivo SOLO si el usuario lo pidió (opt-in). Persiste
      // una fila TrustedDevice (revocable) y entrega un token opaco en la
      // cookie httpOnly. domain configurable para cross-subdomain (prod).
      if (args.rememberDevice) {
        const deviceIp =
          context.req.ip || context.req.connection?.remoteAddress || "unknown";
        const deviceCookieToken = await twoFaService.createDeviceToken(userId, {
          ipAddress: deviceIp,
        });
        context.res.cookie(TwoFaService.DEVICE_COOKIE_NAME, deviceCookieToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          ...(process.env.COOKIE_DOMAIN
            ? { domain: process.env.COOKIE_DOMAIN }
            : {}),
          maxAge: TwoFaService.DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000,
        });
      }

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessExpiresIn: tokenPair.accessExpiresIn,
        refreshExpiresIn: tokenPair.refreshExpiresIn,
      };
    },
    verifyTwoFa: async (_parent, args, context, _info): Promise<any> => {
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      const { userId } = twoFaService.verifyTempToken(args.tempToken, "verify");

      const valid = await twoFaService.verifyCode(userId, args.code);
      if (!valid) {
        throw new Error("Invalid 2FA code");
      }

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      const clientIp =
        context.req.ip || context.req.connection?.remoteAddress || "unknown";
      const tokenPair = await tokenService.createTokenPair(userId, {
        ipAddress: clientIp,
      });

      // Recordar dispositivo SOLO si el usuario lo pidió (opt-in). Persiste
      // una fila TrustedDevice (revocable) y entrega un token opaco en la
      // cookie httpOnly. domain configurable para cross-subdomain (prod).
      if (args.rememberDevice) {
        const deviceIp =
          context.req.ip || context.req.connection?.remoteAddress || "unknown";
        const deviceCookieToken = await twoFaService.createDeviceToken(userId, {
          ipAddress: deviceIp,
        });
        context.res.cookie(TwoFaService.DEVICE_COOKIE_NAME, deviceCookieToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          ...(process.env.COOKIE_DOMAIN
            ? { domain: process.env.COOKIE_DOMAIN }
            : {}),
          maxAge: TwoFaService.DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000,
        });
      }

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessExpiresIn: tokenPair.accessExpiresIn,
        refreshExpiresIn: tokenPair.refreshExpiresIn,
      };
    },
    verifyTwoFaBackupCode: async (
      _parent,
      args,
      context,
      _info
    ): Promise<any> => {
      const twoFaService =
        context.container.resolve<TwoFaService>("TwoFaService");
      const { userId } = twoFaService.verifyTempToken(args.tempToken, "verify");

      const valid = await twoFaService.verifyBackupCode(userId, args.code);
      if (!valid) {
        throw new Error("Invalid backup code");
      }

      const tokenService = context.container.resolve<RefreshTokenService>(
        "RefreshTokenService"
      );
      const clientIp =
        context.req.ip || context.req.connection?.remoteAddress || "unknown";
      const tokenPair = await tokenService.createTokenPair(userId, {
        ipAddress: clientIp,
      });

      // Recordar dispositivo SOLO si el usuario lo pidió (opt-in). Persiste
      // una fila TrustedDevice (revocable) y entrega un token opaco en la
      // cookie httpOnly. domain configurable para cross-subdomain (prod).
      if (args.rememberDevice) {
        const deviceIp =
          context.req.ip || context.req.connection?.remoteAddress || "unknown";
        const deviceCookieToken = await twoFaService.createDeviceToken(userId, {
          ipAddress: deviceIp,
        });
        context.res.cookie(TwoFaService.DEVICE_COOKIE_NAME, deviceCookieToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          ...(process.env.COOKIE_DOMAIN
            ? { domain: process.env.COOKIE_DOMAIN }
            : {}),
          maxAge: TwoFaService.DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000,
        });
      }

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessExpiresIn: tokenPair.accessExpiresIn,
        refreshExpiresIn: tokenPair.refreshExpiresIn,
      };
    },
  },
};
