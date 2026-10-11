import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated-client/client";
import { seedUsers } from "./users";
import { seedPermissions } from "./permissions";
import { seedRoles } from "./roles";
import { seedCustomRoles } from "./customRoles";

import { systemContext } from "./utils";

interface SeedOptions {
  only?: string[];
  exclude?: string[];
  verbose?: boolean;
  dryRun?: boolean;
  multiTenancy?: boolean;
}

interface SeedModule {
  name: string;
  description: string;
  category: "system" | "demo" | "custom";
  dependencies?: string[];
  seed: (prisma: PrismaClient) => Promise<void>;
  alwaysRun?: boolean;
}

export class SeedManager {
  private prisma: PrismaClient;
  private options: SeedOptions;
  private modules: Map<string, SeedModule> = new Map();
  private executed: Set<string> = new Set();
  private stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  constructor(prisma: PrismaClient, options: SeedOptions = {}) {
    this.prisma = prisma;
    this.options = {
      only: options.only || [],
      exclude: options.exclude || [],
      verbose: options.verbose ?? true,
      dryRun: options.dryRun ?? false,
      multiTenancy: true,
    };

    this.registerModules();
  }

  private registerModules(): void {
    // System modules - always run in order
    this.register({
      name: "users",
      description: "System users (SYSTEM, SYSADMIN)",
      category: "system",
      seed: seedUsers,
      alwaysRun: true,
    });

    this.register({
      name: "permissions",
      description: "CRUD permissions for all entities",
      category: "system",
      dependencies: ["users"],
      seed: seedPermissions,
    });

    this.register({
      name: "roles",
      description: "System roles (Admin, User, etc.)",
      category: "system",
      dependencies: ["users", "permissions"],
      seed: seedRoles,
    });

    this.register({
      name: "customRoles",
      description: "Custom roles defined in haiku config",
      category: "system",
      dependencies: ["users", "permissions"],
      seed: seedCustomRoles,
    });

    // Custom modules
    this.register({
      name: "countriesAndStates",
      description: "Countries and Provinces/States with multilang support",
      category: "custom",
      dependencies: ["users"],
      seed: async (prisma) => {
        const { seedCountriesAndStates } = await import("./countriesStates");
        return seedCountriesAndStates(prisma);
      },
    });

    // Demo modules - only in development/staging
    if (process.env.NODE_ENV !== "production") {
      // Register demo/test data modules here
      // this.register({ name: 'demoData', ... });
    }
  }

  private register(module: SeedModule): void {
    this.modules.set(module.name, module);
  }

  private log(
    level: "info" | "success" | "warning" | "error",
    message: string
  ): void {
    if (!this.options.verbose && level === "info") return;

    const colors = {
      info: "\x1b[36m", // Cyan
      success: "\x1b[32m", // Green
      warning: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
    };

    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
    };

    const color = colors[level];
    const reset = "\x1b[0m";
    const icon = icons[level];

    console.log(`${color}${icon} ${message}${reset}`);
  }

  private shouldRun(moduleName: string): boolean {
    // Check if module is excluded
    if (this.options.exclude?.includes(moduleName)) {
      return false;
    }

    // If 'only' is specified, only run those modules
    if (this.options.only?.length > 0) {
      return this.options.only.includes(moduleName);
    }

    // Otherwise run all modules
    return true;
  }

  private async runModule(moduleName: string): Promise<void> {
    if (this.executed.has(moduleName)) {
      return;
    }

    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }

    // Run dependencies first
    if (module.dependencies) {
      for (const dep of module.dependencies) {
        await this.runModule(dep);
      }
    }

    // Check if should run
    if (!module.alwaysRun && !this.shouldRun(moduleName)) {
      this.log("info", `Skipping ${moduleName}`);
      this.stats.skipped++;
      return;
    }

    this.log("info", `Running ${module.description}...`);

    if (this.options.dryRun) {
      this.log("warning", `[DRY RUN] Would seed ${moduleName}`);
    } else {
      try {
        await module.seed(this.prisma);
        this.log("success", `Completed ${moduleName}`);
        this.executed.add(moduleName);
      } catch (error) {
        this.stats.errors++;
        this.log("error", `Failed ${moduleName}: ${error}`);
        throw error;
      }
    }
  }

  private async ensureTenant(): Promise<void> {
    const tenantId = process.env.SYSTEM_OWNER || "AGILMIND";
    this.log("info", `Ensuring tenant exists: ${tenantId}`);

    try {
      await this.prisma.tenant.upsert({
        where: { id: tenantId },
        create: {
          id: tenantId,
          name: tenantId,
          createdAt_: new Date(),
          version_: "0",
        },
        update: {},
      });
      this.log("success", `Tenant ${tenantId} ready`);
    } catch (error) {
      this.log("error", `Failed to ensure tenant: ${error}`);
      throw error;
    }
  }

  public async seed(): Promise<void> {
    const startTime = Date.now();

    this.log("info", "🌱 Starting seed process...");
    this.log("info", `Environment: ${process.env.NODE_ENV || "development"}`);

    if (this.options.dryRun) {
      this.log("warning", "🔍 DRY RUN MODE - No changes will be made");
    }

    // For multiTenancy, ensure Tenant exists first
    if (this.options.multiTenancy) {
      await this.ensureTenant();
    }

    try {
      // Run system modules first (in dependency order)
      const systemModules = Array.from(this.modules.values())
        .filter((m) => m.category === "system")
        .map((m) => m.name);

      for (const moduleName of systemModules) {
        await this.runModule(moduleName);
      }

      // Run demo modules SOLO si se piden explícitamente (SEED_ONLY / la opción
      // "demo" del deploy). Nunca en un run completo ("All seeds"), en ningún
      // entorno: los datos sintéticos/de prueba son opt-in.
      if (this.options.only?.length > 0) {
        const demoModules = Array.from(this.modules.values())
          .filter((m) => m.category === "demo")
          .map((m) => m.name);

        for (const moduleName of demoModules) {
          await this.runModule(moduleName);
        }
      }

      // Run custom modules
      const customModules = Array.from(this.modules.values())
        .filter((m) => m.category === "custom")
        .map((m) => m.name);

      for (const moduleName of customModules) {
        await this.runModule(moduleName);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      this.log("success", "✨ Seeding completed successfully!");
      this.log("info", `Duration: ${duration}s`);
      this.log(
        "info",
        `Stats: Created: ${this.stats.created}, Updated: ${this.stats.updated}, Skipped: ${this.stats.skipped}, Errors: ${this.stats.errors}`
      );
    } catch (error) {
      this.log("error", `Seeding failed: ${error}`);
      throw error;
    }
  }

  public async seedSpecific(modules: string[]): Promise<void> {
    this.options.only = modules;
    await this.seed();
  }

  public getModulesList(): Array<{
    name: string;
    description: string;
    category: string;
    dependencies?: string[];
  }> {
    return Array.from(this.modules.values()).map((m) => ({
      name: m.name,
      description: m.description,
      category: m.category,
      dependencies: m.dependencies,
    }));
  }

  public listModules(): void {
    console.log("\n📦 Available seed modules:\n");

    const categories = ["system", "demo", "custom"];

    for (const category of categories) {
      const modules = Array.from(this.modules.values()).filter(
        (m) => m.category === (category as any)
      );

      if (modules.length > 0) {
        console.log(`\n  ${category.toUpperCase()}:`);
        for (const module of modules) {
          const deps = module.dependencies?.length
            ? ` (deps: ${module.dependencies.join(", ")})`
            : "";
          console.log(`    • ${module.name}: ${module.description}${deps}`);
        }
      }
    }

    console.log("\n📖 Usage:\n");
    console.log("  Run all seeds:");
    console.log("    npm run db:seed\n");
    console.log("  Run specific seed(s):");
    console.log("    SEED_ONLY=workflows npm run db:seed");
    console.log("    SEED_ONLY=users,roles npm run db:seed\n");
    console.log("  Dry run (lists what would run, writes nothing):");
    console.log("    SEED_DRY_RUN=true npm run db:seed\n");
  }
}

// Export seed registry for use in deployment scripts
export const SEED_REGISTRY = [
  {
    name: "users",
    description: "System users (SYSTEM, SYSADMIN)",
    category: "system",
  },
  {
    name: "permissions",
    description: "CRUD permissions for all entities",
    category: "system",
  },
  {
    name: "roles",
    description: "System roles (Admin, User, etc.)",
    category: "system",
  },
  {
    name: "customRoles",
    description: "Custom roles defined in haiku config",
    category: "system",
  },
  {
    name: "synthetic",
    description: "Synthetic test data (non-production)",
    category: "demo",
  },
];

// Export for use in seed scripts
export async function runSeedManager(options: SeedOptions = {}): Promise<void> {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Las env vars se leen ANTES de construir el manager: el constructor COPIA
    // las options, así que mutarlas después no llega a nadie (SEED_ONLY quedaba
    // inerte y corría todo).
    if (process.env.SEED_ONLY) {
      options.only = process.env.SEED_ONLY.split(",");
    }

    // El ensayo tiene que ser alcanzable desde el entorno: la ayuda lo ofrece y
    // `dryRun` ya saltea el seed de cada módulo, pero sin esto la variable no
    // llegaba y el seed corría completo creyendo el operador que no escribía.
    if (process.env.SEED_DRY_RUN === "true") {
      options.dryRun = true;
    }

    const manager = new SeedManager(prisma, options);

    if (process.env.SEED_LIST_JSON) {
      console.log(JSON.stringify(manager.getModulesList()));
      return;
    }

    if (process.env.SEED_LIST) {
      manager.listModules();
      return;
    }

    await manager.seed();
  } finally {
    await prisma.$disconnect();
  }
}
