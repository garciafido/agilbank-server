import "reflect-metadata";
import * as readline from "readline";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated-client/client";
import { SeedManager } from "./seedManager";

interface MenuOption {
  label: string;
  value: string;
  description?: string;
  action: () => Promise<void>;
}

class SeedCLI {
  private rl: readline.Interface;
  private prisma: PrismaClient;
  private manager: SeedManager;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const connectionString = process.env.DATABASE_URL!;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
    this.manager = new SeedManager(this.prisma, { verbose: true });
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  private clearScreen(): void {
    console.clear();
  }

  private printHeader(): void {
    console.log("\x1b[36m╔════════════════════════════════════════╗\x1b[0m");
    console.log("\x1b[36m║        🌱 Seed Manager CLI 🌱          ║\x1b[0m");
    console.log("\x1b[36m╚════════════════════════════════════════╝\x1b[0m");
    console.log(
      `\nEnvironment: \x1b[33m${process.env.NODE_ENV || "development"}\x1b[0m\n`
    );
  }

  private async showMainMenu(): Promise<void> {
    this.clearScreen();
    this.printHeader();

    const options: MenuOption[] = [
      {
        label: "1",
        value: "all",
        description: "Run all seeds (smart mode)",
        action: () => this.runAllSeeds(),
      },
      {
        label: "2",
        value: "select",
        description: "Select specific modules to seed",
        action: () => this.selectModules(),
      },
      {
        label: "3",
        value: "system",
        description: "Run system seeds only (users, permissions, roles)",
        action: () => this.runSystemSeeds(),
      },
      {
        label: "4",
        value: "permissions",
        description: "Update permissions only",
        action: () => this.runSpecificSeed(["permissions"]),
      },
      {
        label: "5",
        value: "roles",
        description: "Update roles only",
        action: () => this.runSpecificSeed(["roles"]),
      },
      {
        label: "6",
        value: "dry",
        description: "Dry run (preview changes)",
        action: () => this.runDryRun(),
      },
      {
        label: "7",
        value: "list",
        description: "List all available modules",
        action: () => this.listModules(),
      },
      {
        label: "q",
        value: "quit",
        description: "Exit",
        action: () => this.quit(),
      },
    ];

    console.log("Select an option:\n");
    for (const option of options) {
      const label = option.label.padEnd(3);
      console.log(`  \x1b[32m${label}\x1b[0m ${option.description}`);
    }

    const choice = await this.prompt("\nYour choice: ");
    const selected = options.find(
      (o) => o.label.toLowerCase() === choice.toLowerCase()
    );

    if (selected) {
      await selected.action();
    } else {
      console.log("\x1b[31m\nInvalid option. Please try again.\x1b[0m");
      await this.prompt("\nPress Enter to continue...");
      await this.showMainMenu();
    }
  }

  private async runAllSeeds(): Promise<void> {
    console.log("\n\x1b[36m🌱 Running all seeds...\x1b[0m\n");

    try {
      const manager = new SeedManager(this.prisma, { verbose: true });
      await manager.seed();

      console.log("\n\x1b[32m✅ All seeds completed successfully!\x1b[0m");
    } catch (error) {
      console.error("\n\x1b[31m❌ Seeding failed:\x1b[0m", error);
    }

    await this.prompt("\nPress Enter to return to menu...");
    await this.showMainMenu();
  }

  private async selectModules(): Promise<void> {
    console.log("\n\x1b[36m📦 Select modules to seed:\x1b[0m\n");

    const allModules = this.manager.getModulesList();
    const categories = ["system", "demo", "custom"];
    const numberedModules: Array<{ num: number; name: string }> = [];

    let num = 1;
    for (const category of categories) {
      const categoryModules = allModules.filter((m) => m.category === category);
      if (categoryModules.length > 0) {
        console.log(`  \x1b[33m${category.toUpperCase()}:\x1b[0m`);
        for (const mod of categoryModules) {
          const deps = mod.dependencies?.length
            ? ` \x1b[90m(deps: ${mod.dependencies.join(", ")})\x1b[0m`
            : "";
          console.log(
            `    \x1b[32m${String(num).padStart(2)}\x1b[0m  ${mod.name}: ${
              mod.description
            }${deps}`
          );
          numberedModules.push({ num, name: mod.name });
          num++;
        }
        console.log("");
      }
    }

    console.log(
      "  \x1b[90mEnter numbers (e.g., 1,3,5) or names (e.g., users,roles)\x1b[0m"
    );
    console.log("  \x1b[90mPress Enter without input to cancel\x1b[0m\n");

    const input = await this.prompt("Your selection: ");

    if (!input.trim()) {
      console.log("\x1b[33m\nCancelled.\x1b[0m");
      await this.prompt("\nPress Enter to return to menu...");
      await this.showMainMenu();
      return;
    }

    // Parse input - can be numbers or names
    const parts = input
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);
    const selectedModules: string[] = [];

    for (const part of parts) {
      const asNumber = parseInt(part, 10);
      if (!isNaN(asNumber)) {
        // It's a number
        const found = numberedModules.find((m) => m.num === asNumber);
        if (found) {
          selectedModules.push(found.name);
        } else {
          console.log(`\x1b[31mInvalid number: ${asNumber}\x1b[0m`);
        }
      } else {
        // It's a name
        const found = allModules.find(
          (m) => m.name.toLowerCase() === part.toLowerCase()
        );
        if (found) {
          selectedModules.push(found.name);
        } else {
          console.log(`\x1b[31mUnknown module: ${part}\x1b[0m`);
        }
      }
    }

    if (selectedModules.length === 0) {
      console.log("\x1b[31m\nNo valid modules selected.\x1b[0m");
      await this.prompt("\nPress Enter to return to menu...");
      await this.showMainMenu();
      return;
    }

    await this.runSpecificSeed(selectedModules);
  }

  private async runSystemSeeds(): Promise<void> {
    console.log("\n\x1b[36m📦 Running system seeds...\x1b[0m\n");
    await this.runSpecificSeed([
      "users",
      "permissions",
      "roles",
      "customRoles",
    ]);
  }

  private async runSpecificSeed(modules: string[]): Promise<void> {
    console.log(
      `\n\x1b[36m🌱 Running seeds: ${modules.join(", ")}...\x1b[0m\n`
    );

    try {
      const manager = new SeedManager(this.prisma, {
        verbose: true,
        only: modules,
      });
      await manager.seed();

      console.log("\n\x1b[32m✅ Seeds completed successfully!\x1b[0m");
    } catch (error) {
      console.error("\n\x1b[31m❌ Seeding failed:\x1b[0m", error);
    }

    await this.prompt("\nPress Enter to return to menu...");
    await this.showMainMenu();
  }

  private async runDryRun(): Promise<void> {
    console.log(
      "\n\x1b[36m🔍 Running dry run (no changes will be made)...\x1b[0m\n"
    );

    try {
      const manager = new SeedManager(this.prisma, {
        verbose: true,
        dryRun: true,
      });
      await manager.seed();

      console.log("\n\x1b[32m✅ Dry run completed!\x1b[0m");
    } catch (error) {
      console.error("\n\x1b[31m❌ Dry run failed:\x1b[0m", error);
    }

    await this.prompt("\nPress Enter to return to menu...");
    await this.showMainMenu();
  }

  private async listModules(): Promise<void> {
    console.log("\n\x1b[36m📋 Available seed modules:\x1b[0m");

    this.manager.listModules();

    await this.prompt("\nPress Enter to return to menu...");
    await this.showMainMenu();
  }

  private async quit(): Promise<void> {
    console.log("\n\x1b[32m👋 Goodbye!\x1b[0m\n");
    this.rl.close();
    await this.prisma.$disconnect();
    process.exit(0);
  }

  public async start(): Promise<void> {
    console.log("\x1b[36m");
    console.log(
      "  ____                _ __  __                                   "
    );
    console.log(
      " / ___|  ___  ___  __| |  \\/  | __ _ _ __   __ _  __ _  ___ _ __ "
    );
    console.log(
      " \\___ \\/ _ \\/ _ \\/ _` | |\\/| |/ _` | '_ \\ / _` |/ _` |/ _ \\ '__|"
    );
    console.log(
      "  ___) |  __/  __/ (_| | |  | | (_| | | | | (_| | (_| |  __/ |   "
    );
    console.log(
      " |____/ \\___|\\___|\\__,_|_|  |_|\\__,_|_| |_|\\__,_|\\__, |\\___|_|   "
    );
    console.log(
      "                                                    |___/         "
    );
    console.log("\x1b[0m");

    await this.prompt("\nPress Enter to start...");
    await this.showMainMenu();
  }
}

// Run CLI if executed directly
if (require.main === module) {
  const cli = new SeedCLI();
  cli.start().catch(console.error);
}

export default SeedCLI;
