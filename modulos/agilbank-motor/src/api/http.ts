/** Una base con forma de Prisma: el motor nunca importa el cliente del producto. */
export type Db = { [model: string]: any };

export interface ApiRequest {
  headers: Record<string, unknown>;
  body: unknown;
  params: Record<string, string | undefined>;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ClientSystem {
  id: string;
  name: string;
  tenantId: string | null;
  serviceUserId: string | null;
}

export type AuthResult =
  | { ok: true; client: ClientSystem }
  | { ok: false; reason: "no-scope" | "unauthorized"; message: string };

export type Authorize = (token: string | undefined, scope: string) => Promise<AuthResult>;

export interface Caller {
  client: ClientSystem;
  tenantId: string;
  serviceUserId: string | null;
}

export const reply = (status: number, body: unknown): ApiResponse => ({ status, body });

export const fail = (status: number, codigo: string, error: string, extra: Record<string, unknown> = {}): ApiResponse =>
  reply(status, { codigo, error, ...extra });

export const INTERNAL_ERROR: ApiResponse = fail(500, "ERROR_INTERNO", "No se pudo completar el pedido.");

export const bearerToken = (headers: Record<string, unknown>): string | undefined => {
  const auth = headers.authorization;
  if (typeof auth !== "string") return undefined;
  const [scheme, value] = auth.split(" ");
  return scheme?.toLowerCase() === "bearer" ? value : undefined;
};

/**
 * La credencial, su ámbito y su empresa. La empresa sale siempre de la credencial: sin ella se corta,
 * porque un filtro por empresa en `undefined` no filtra.
 */
export const authorizeCaller = async (
  authorize: Authorize,
  headers: Record<string, unknown>,
  scope: string,
  needsServiceUser: boolean,
): Promise<{ ok: true; caller: Caller } | { ok: false; response: ApiResponse }> => {
  const auth = await authorize(bearerToken(headers), scope);
  if (!auth.ok) {
    return {
      ok: false,
      response: auth.reason === "no-scope" ? fail(403, "AMBITO_INSUFICIENTE", auth.message) : fail(401, "NO_AUTORIZADO", auth.message),
    };
  }
  const { client } = auth;
  if (!client.tenantId) {
    return { ok: false, response: fail(403, "SIN_EMPRESA", "La integración no está asociada a una empresa.") };
  }
  if (needsServiceUser && !client.serviceUserId) {
    return { ok: false, response: fail(403, "SIN_USUARIO_DE_SERVICIO", "La integración no tiene un usuario de servicio.") };
  }
  return { ok: true, caller: { client, tenantId: client.tenantId, serviceUserId: client.serviceUserId } };
};
