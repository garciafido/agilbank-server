import { unlinkSync } from "fs";
import { join } from "path";

export default async function globalTeardown() {
  try {
    // Eliminar la base de datos de test
    const dbPath = join(process.cwd(), "prisma-test", "test.db");
    unlinkSync(dbPath);
  } catch (error: any) {
    // Ignorar error si el archivo no existe
    if (error.code !== "ENOENT") {
      console.error("Error during test teardown:", error);
      throw error;
    }
  }
}
