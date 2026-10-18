-- Rol único por usuario: User.roles (m2m _User_roles) → User.role (FK role__id)
-- GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
-- El rol de cada usuario pasa de la tabla intermedia _User_roles ("A" = rol, "B" = usuario,
-- como en la migración inicial) a la columna "user"."role__id"; quien no tenía rol queda en
-- NULL. Si algún usuario tiene más de un rol, aborta sin cambiar nada: la migración nunca
-- elige cuál conservar, y es un solo bloque DO, que Postgres corre entero. Sin _User_roles
-- (un proyecto nuevo, cuya migración inicial ya trae la columna, o una base ya migrada) no
-- hace nada. El índice y la clave foránea llevan los nombres y las acciones que Prisma
-- genera para el ref opcional User.role: el migrate diff posterior da vacío. El ciclo de
-- haiku la copia una sola vez al historial de migraciones como <hora>_rol_unico_por_usuario,
-- y prisma migrate deploy la corre en producción. Antes del deploy, la consulta del mensaje
-- de abajo tiene que dar vacío.
DO $$
DECLARE
  con_mas_de_un_rol bigint;
BEGIN
  IF to_regclass('"_User_roles"') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO con_mas_de_un_rol
    FROM (SELECT "B" FROM "_User_roles" GROUP BY "B" HAVING count(*) > 1) AS varios;
  IF con_mas_de_un_rol > 0 THEN
    RAISE EXCEPTION 'rol único por usuario: usuarios con más de un rol: %. La migración no elige cuál conservar: dejá uno solo a cada uno y volvé a correrla. Para verlos: SELECT "B", count(*) FROM "_User_roles" GROUP BY "B" HAVING count(*) > 1', con_mas_de_un_rol;
  END IF;

  ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role__id" TEXT;
  UPDATE "user" u SET "role__id" = ur."A" FROM "_User_roles" ur WHERE ur."B" = u.id;

  CREATE INDEX IF NOT EXISTS "user_role__id_idx" ON "user"("role__id");
  ALTER TABLE "user" ADD CONSTRAINT "user_role__id_fkey" FOREIGN KEY ("role__id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

  DROP TABLE "_User_roles";
END $$;
