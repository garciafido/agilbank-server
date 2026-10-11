import type { PoolConfig } from "pg";

/**
 * Opciones del pool de conexiones que SIRVE REQUESTS.
 *
 * Hace falta un techo por query: una consulta hostil que genera un plan carísimo
 * —un filtro con un OR de miles de términos, un `orderBy` sobre una columna sin
 * índice, una relación anidada profunda— ocupa una de las (por default) 10
 * conexiones hasta terminar, y diez de esas en paralelo bloquean el pool entero
 * y tumban la API.
 *
 * `query_timeout` es ese techo del lado de node: rechaza la promesa y libera la
 * conexión del pool aunque el servidor siga trabajando.
 *
 * **`statement_timeout` NO se manda desde acá, a propósito.** `pg` lo envía como
 * parámetro de ARRANQUE de la conexión, y un pooler en modo transacción
 * —PgBouncer— rechaza la conexión entera con `FATAL 08P01: unsupported startup
 * parameter`. No es un capricho suyo: en ese modo la conexión se reparte entre
 * clientes, así que un ajuste de sesión se le aplicaría a las consultas de otro.
 *
 * Tampoco se resuelve con `ignore_startup_parameters` en el pooler: eso no
 * aplica el parámetro, lo DESCARTA en silencio. El arranque deja de fallar y uno
 * se queda creyendo que tiene un límite que no existe — peor que no tenerlo,
 * porque no avisa.
 *
 * El techo del lado del servidor se declara donde sobrevive a cualquier pooler,
 * una sola vez por base:
 *
 *     ALTER ROLE <usuario> SET statement_timeout = '30s';
 *
 * Generoso a propósito para no cortar un reporte legítimo pesado.
 *
 * NO usar en los pools de seed / migración / CLI: esas son operaciones de una
 * sola pasada que pueden durar más que este tope a propósito.
 */
export function requestPoolConfig(
  connectionString: string | undefined
): PoolConfig {
  // El rol de la APLICACIÓN, si el deployment lo declaró.
  //
  // Servir pedidos y migrar son dos cosas distintas y hoy comparten credencial.
  // Mientras la API se conecte con el mismo rol que corre las migraciones no se
  // le puede poner un techo por consulta —se lo pondría también a ellas, y las
  // cortaría a la mitad—, y sobre todo corre con más permisos de los que
  // necesita: puede borrar tablas, leer otras bases y saltear cualquier política
  // a nivel de fila. Prisma no cambia eso: el rol define lo que la conexión
  // PUEDE hacer, sin importar qué biblioteca la use.
  //
  // Ausente ⇒ se usa la de siempre. Un proyecto que no declaró el rol sigue
  // funcionando igual que antes; declararlo es lo que activa la separación.
  //
  //     CREATE ROLE <app> LOGIN PASSWORD '...';
  //     GRANT USAGE ON SCHEMA public TO <app>;
  //     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <app>;
  //     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <app>;
  //     ALTER DEFAULT PRIVILEGES IN SCHEMA public
  //       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <app>;
  //     ALTER DEFAULT PRIVILEGES IN SCHEMA public
  //       GRANT USAGE, SELECT ON SEQUENCES TO <app>;
  //     ALTER ROLE <app> SET statement_timeout = '30s';
  //
  // Los DEFAULT PRIVILEGES no son un detalle: sin ellos, cada tabla que cree una
  // migración futura queda fuera del alcance del rol, y la API empieza a fallar
  // en la entidad nueva y solo en esa.
  const deLaApp = process.env.DATABASE_URL_APP || connectionString;
  const num = (v: string | undefined, def: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    connectionString: deLaApp,
    max: num(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: num(process.env.DB_POOL_IDLE_MS, 10000),
    query_timeout: num(process.env.DB_QUERY_TIMEOUT_MS, 30000),
  };
}
