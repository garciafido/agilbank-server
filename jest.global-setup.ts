import { execSync } from "child_process";
import { unlinkSync } from "fs";
import { join } from "path";

export default async function globalSetup() {
  try {
    // 1. Eliminar la base de datos de test si existe
    const dbPath = join(process.cwd(), "prisma-test", "test.db");
    try {
      unlinkSync(dbPath);
    } catch (error) {
      // Ignorar error si el archivo no existe
    }

    // 2. Generar el cliente Prisma
    execSync(
      "npx prisma generate --schema=./prisma-test/schema.prisma --no-hints"
    );

    // 3. Crear nueva base de datos y aplicar el schema
    // Prisma 7.x: url goes via CLI flag, not in schema file
    execSync(
      'npx prisma db push --schema=./prisma-test/schema.prisma --accept-data-loss --url "file:./prisma-test/test.db"'
    );
  } catch (error) {
    console.error("Error setting up test database:", error);
    throw error;
  }
}
