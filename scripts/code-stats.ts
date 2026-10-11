#!/usr/bin/env npx ts-node
/**
 * Code Statistics Generator
 *
 * Analyzes code composition by:
 * - Origin: static-files (framework) vs templates (per-entity) vs manual
 * - Category: services, routes, graphql, workers, satellites, etc.
 *
 * Outputs:
 * - stats.md: Professional markdown for academic papers
 * - stats.json: Structured data for visualizations
 * - Console: Quick summary
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ============================================================================
// Types
// ============================================================================

interface FileStats {
  path: string;
  relativePath: string;
  lines: number;
  origin: "static" | "template" | "manual";
  category: string;
  concern: ArchitecturalConcern;
}

interface CategoryStats {
  name: string;
  concern: ArchitecturalConcern;
  totalLines: number;
  totalFiles: number;
  staticLines: number;
  staticFiles: number;
  templateLines: number;
  templateFiles: number;
  manualLines: number;
  manualFiles: number;
}

interface ConcernStats {
  concern: ArchitecturalConcern;
  totalLines: number;
  totalFiles: number;
  staticLines: number;
  staticFiles: number;
  templateLines: number;
  templateFiles: number;
  manualLines: number;
  manualFiles: number;
}

interface OriginStats {
  staticLines: number;
  staticFiles: number;
  templateLines: number;
  templateFiles: number;
  manualLines: number;
  manualFiles: number;
}

interface BranchStats {
  baseBranch: number;
  developBranch: number;
  manualAdditions: number;
}

interface FullStats {
  projectName: string;
  generatedAt: string;
  projectType: "server" | "client";
  branch: BranchStats;
  origin: OriginStats;
  categories: CategoryStats[];
  concerns: ConcernStats[];
  files: FileStats[];
}

interface CombinedStats {
  server: { lines: number; files: number } | null;
  client: { lines: number; files: number } | null;
  total: { lines: number; files: number };
  generated: { lines: number; percent: number };
  humanWritten: { lines: number; percent: number };
}

interface CostEstimate {
  traditional: {
    teamSize: string;
    timeline: string;
    costPerYear: string;
    totalCost: string;
    productivityLOCPerYear: number;
  };
  haiku: {
    teamSize: string;
    timeline: string;
    costPerYear: string;
    totalCost: string;
    productivityLOCPerYear: number;
  };
  savings: {
    teamReduction: string;
    timelineReduction: string;
    costReduction: string;
    productivityMultiplier: string;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const GENERATOR_PATH =
  process.env.HAIKU_GENERATOR_PATH ||
  path.resolve(__dirname, "../../../../haiku-generator");

const PROJECT_TYPE: "server" | "client" = detectProjectType();

const GENERATOR_STATIC_PATH =
  PROJECT_TYPE === "server"
    ? path.join(GENERATOR_PATH, "haiku/prismaServer/static-files/projectDir")
    : path.join(GENERATOR_PATH, "haiku/mobxWebapp/static-files/projectDir");

const GENERATOR_TEMPLATE_PATH =
  PROJECT_TYPE === "server"
    ? path.join(GENERATOR_PATH, "haiku/prismaServer/projectDir")
    : path.join(GENERATOR_PATH, "haiku/mobxWebapp/projectDir");

// Architectural Concerns (based on academic literature: Layered Architecture + Cross-cutting Concerns)
type ArchitecturalConcern =
  | "Presentation"
  | "Application"
  | "Domain"
  | "Infrastructure"
  | "AI/ML"
  | "Distributed"
  | "Real-time"
  | "Cross-cutting";

interface CategoryConfig {
  category: string;
  concern: ArchitecturalConcern;
}

// Categories for server (with Architectural Concern mapping)
const SERVER_CATEGORIES: Record<string, CategoryConfig> = {
  // AI/ML Layer
  "/services/aiSearch/": { category: "AI Search", concern: "AI/ML" },

  // Real-time Layer
  "/services/sse/": { category: "SSE Server", concern: "Real-time" },

  // Application Layer
  "/services/": { category: "Services", concern: "Application" },
  "/routes/": { category: "REST Routes", concern: "Application" },
  "/graphql/": { category: "GraphQL API", concern: "Application" },
  "/bots/": { category: "Bot Framework", concern: "Application" },

  // Domain Layer
  "/entities/": { category: "Entity Services", concern: "Domain" },

  // Distributed Layer
  "/satellites/": { category: "Satellite Processors", concern: "Distributed" },
  "/satellite/": { category: "Satellite Infrastructure", concern: "Distributed" },
  "/workers/": { category: "Background Workers", concern: "Distributed" },

  // Infrastructure Layer
  "/prisma/": { category: "Database", concern: "Infrastructure" },
  "/config/": { category: "Configuration", concern: "Infrastructure" },
  "/middleware/": { category: "Middleware", concern: "Infrastructure" },

  // Cross-cutting
  "/common/": { category: "Utilities", concern: "Cross-cutting" },
  "/types/": { category: "Type Definitions", concern: "Cross-cutting" },
};

// Categories for client (with Architectural Concern mapping)
const CLIENT_CATEGORIES: Record<string, CategoryConfig> = {
  // Presentation Layer
  "/components/common/": { category: "Common Components", concern: "Presentation" },
  "/components/controls/": { category: "Form Controls", concern: "Presentation" },
  "/components/": { category: "Components", concern: "Presentation" },
  "/pages/": { category: "Pages", concern: "Presentation" },
  "/layout/": { category: "Layout", concern: "Presentation" },
  "/styles/": { category: "Styles", concern: "Presentation" },

  // Application Layer
  "/stores/": { category: "State Management", concern: "Application" },
  "/store/": { category: "State Management", concern: "Application" },
  "/hooks/": { category: "Hooks", concern: "Application" },
  "/services/": { category: "Services", concern: "Application" },
  "/contexts/": { category: "React Contexts", concern: "Application" },
  "/router/": { category: "Routing", concern: "Application" },
  "/pipelines/": { category: "Pipelines", concern: "Application" },
  "/workflows/": { category: "Workflows", concern: "Application" },

  // Domain Layer
  "/entities/": { category: "Entities", concern: "Domain" },
  "/views/": { category: "Entity Views", concern: "Domain" },
  "/dashboard/": { category: "Dashboard", concern: "Domain" },

  // Infrastructure Layer
  "/api/": { category: "API Client", concern: "Infrastructure" },
  "/auth/": { category: "Authentication", concern: "Infrastructure" },
  "/settings/": { category: "Settings", concern: "Infrastructure" },
  "/admin/": { category: "Admin", concern: "Infrastructure" },

  // AI/ML Layer
  "/aiAssistant/": { category: "AI Assistant", concern: "AI/ML" },

  // Cross-cutting
  "/common/": { category: "Common Code", concern: "Cross-cutting" },
  "/utils/": { category: "Utilities", concern: "Cross-cutting" },
  "/types/": { category: "Type Definitions", concern: "Cross-cutting" },
};

const CATEGORIES = PROJECT_TYPE === "server" ? SERVER_CATEGORIES : CLIENT_CATEGORIES;

// Files to exclude from analysis
const EXCLUDE_PATTERNS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "package-lock.json",
  "yarn.lock",
  "/graphql/types.ts", // Auto-generated by codegen
  "/api/graphql.ts", // Auto-generated by codegen
  ".d.ts",
  "/prisma/generated-client/", // Prisma Client (generated)
  "/paljs-generated/", // PalJS (generated)
];

// File extensions to include
const INCLUDE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

// ============================================================================
// Utilities
// ============================================================================

function detectProjectType(): "server" | "client" {
  const packageJson = path.resolve(process.cwd(), "package.json");
  if (fs.existsSync(packageJson)) {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
    if (pkg.name?.includes("client") || pkg.dependencies?.react) {
      return "client";
    }
  }
  return "server";
}

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function shouldIncludeFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  if (!INCLUDE_EXTENSIONS.includes(ext)) return false;

  for (const pattern of EXCLUDE_PATTERNS) {
    if (filePath.includes(pattern)) return false;
  }

  return true;
}

function getRelativePath(filePath: string): string {
  const srcIndex = filePath.indexOf("/src/");
  if (srcIndex !== -1) {
    return filePath.substring(srcIndex);
  }
  return filePath;
}

function getAllFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_PATTERNS.some((p) => fullPath.includes(p))) {
        getAllFiles(fullPath, files);
      }
    } else if (shouldIncludeFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function categorizeFile(relativePath: string): { category: string; concern: ArchitecturalConcern } {
  for (const [pattern, config] of Object.entries(CATEGORIES)) {
    if (relativePath.includes(pattern)) {
      return config;
    }
  }
  return { category: "Other", concern: "Cross-cutting" };
}

// ============================================================================
// Origin Detection
// ============================================================================

let staticFilesCache: Set<string> | null = null;
let templatePatternsCache: string[] | null = null;

function loadStaticFiles(): Set<string> {
  if (staticFilesCache) return staticFilesCache;

  staticFilesCache = new Set<string>();

  if (!fs.existsSync(GENERATOR_STATIC_PATH)) {
    console.warn(`Warning: Generator static path not found: ${GENERATOR_STATIC_PATH}`);
    return staticFilesCache;
  }

  const files = getAllFiles(GENERATOR_STATIC_PATH);
  for (const file of files) {
    const relative = getRelativePath(file);
    staticFilesCache.add(relative);
  }

  return staticFilesCache;
}

function loadTemplatePatterns(): string[] {
  if (templatePatternsCache) return templatePatternsCache;

  templatePatternsCache = [];

  if (!fs.existsSync(GENERATOR_TEMPLATE_PATH)) {
    console.warn(`Warning: Generator template path not found: ${GENERATOR_TEMPLATE_PATH}`);
    return templatePatternsCache;
  }

  const files = getAllFiles(GENERATOR_TEMPLATE_PATH);
  for (const file of files) {
    // Template files have double extensions like .ts.ts
    if (file.match(/\.(ts|tsx|js|jsx|sh|json)\.ts$/)) {
      // Convert template path to output path pattern
      // e.g., /src/entities/${entity.name}/services/ -> /src/entities/*/services/
      let pattern = getRelativePath(file)
        .replace(/\.ts$/, "") // Remove the .ts extension from template
        .replace(/\$\{[^}]+\}/g, "*"); // Replace ${variables} with *

      templatePatternsCache.push(pattern);
    }
  }

  return templatePatternsCache;
}

function matchesTemplatePattern(relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Convert pattern to regex
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, "[^/]+").replace(/\//g, "\\/") + "$"
    );
    if (regex.test(relativePath)) {
      return true;
    }
  }

  // Fallback heuristics for per-entity generated code when `base` branch is unavailable.
  // These cover both server (services, resolvers) and client (components, store, graphql, ...)
  // per-entity directory layouts.
  const entityPatterns = [
    /\/entities\/[^/]+\/services\//,
    /\/entities\/[^/]+\/resolvers\//,
    /\/entities\/[^/]+\/components\//,
    /\/entities\/[^/]+\/store\//,
    /\/entities\/[^/]+\/graphql\//,
    /\/entities\/[^/]+\/schemas\//,
    /\/entities\/[^/]+\/workflows\//,
    /\/entities\/[^/]+\/[^/]+\.tsx?$/, // Top-level files inside an entity dir
    /\/views\/[^/]+\//,
    /\/stores\/[^/]+Store\./,
  ];

  for (const pattern of entityPatterns) {
    if (pattern.test(relativePath)) {
      return true;
    }
  }

  return false;
}

interface BaseFileInfo {
  baseLines: number;
  additions: number; // lines added in current vs base (manual customizations)
  deletions: number; // lines removed in current vs base
}

// Cache: map of /src-relative path → info about how the file differs from `base`.
// `base` represents the pure generator output. For each file we track:
//   - baseLines: total lines in the `base` version (what the generator produced)
//   - additions/deletions: per-file diff between current and `base`
// Per-file origin split:
//   generated_lines_in_file = baseLines - deletions   (lines from base that remain)
//   manual_lines_in_file    = additions               (lines added on top of base)
//   total                   = generated + manual = current lines on disk
let baseBranchFilesCache: Map<string, BaseFileInfo> | null = null;

function loadBaseBranchFiles(): Map<string, BaseFileInfo> {
  if (baseBranchFilesCache) return baseBranchFilesCache;

  baseBranchFilesCache = new Map<string, BaseFileInfo>();

  try {
    // Step 1: enumerate files in base and capture their line counts
    const list = execSync("git ls-tree -r base -- src", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const shaToPath = new Map<string, string>();
    const targetShas: string[] = [];
    for (const line of list.split("\n")) {
      const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/);
      if (!match) continue;
      const [, sha, filePath] = match;
      const relPath = "/" + filePath;
      if (!shouldIncludeFile(relPath)) continue;
      shaToPath.set(sha, relPath);
      targetShas.push(sha);
    }

    if (targetShas.length === 0) return baseBranchFilesCache;

    const input = targetShas.join("\n") + "\n";
    const output = execSync("git cat-file --batch", {
      input,
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let offset = 0;
    while (offset < output.length) {
      const newlineIdx = output.indexOf(0x0a, offset);
      if (newlineIdx === -1) break;
      const header = output.slice(offset, newlineIdx).toString("utf-8");
      const parts = header.split(" ");
      if (parts.length < 3 || parts[1] !== "blob") {
        offset = newlineIdx + 1;
        continue;
      }
      const sha = parts[0];
      const size = parseInt(parts[2], 10);
      const contentStart = newlineIdx + 1;
      const content = output.slice(contentStart, contentStart + size);
      let lines = 1;
      for (let i = 0; i < content.length; i++) {
        if (content[i] === 0x0a) lines++;
      }
      const relPath = shaToPath.get(sha);
      if (relPath !== undefined) {
        baseBranchFilesCache.set(relPath, { baseLines: lines, additions: 0, deletions: 0 });
      }
      offset = contentStart + size + 1;
    }

    // Step 2: enrich with per-file insertions/deletions from base→working-tree.
    // `git diff --numstat base -- src` reports added/removed lines per file.
    // This captures in-place modifications (which a pure line-count comparison misses).
    try {
      const diffOut = execSync("git diff --numstat base -- src", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      for (const line of diffOut.split("\n")) {
        // Format: <added>\t<removed>\t<path>   ('-' for binary)
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const added = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
        const removed = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
        const filePath = parts.slice(2).join("\t");
        const relPath = "/" + filePath;
        if (!shouldIncludeFile(relPath)) continue;
        const existing = baseBranchFilesCache.get(relPath);
        if (existing) {
          existing.additions = added;
          existing.deletions = removed;
        }
        // Files only in current (added) won't be in baseBranchFilesCache —
        // those are detected at classification time as origin="manual".
      }
    } catch {
      // Diff failed (e.g., index lock) — fall back to no additions data
    }
  } catch {
    // base branch missing or git unavailable — fall back to pattern heuristic
  }

  return baseBranchFilesCache;
}

function classifyFileOrigin(relativePath: string): "static" | "template" | "manual" {
  const staticFiles = loadStaticFiles();

  if (staticFiles.has(relativePath)) {
    return "static";
  }

  // Ground-truth: if the file is present in the `base` branch, it came from generation.
  const baseFiles = loadBaseBranchFiles();
  if (baseFiles.size > 0) {
    return baseFiles.has(relativePath) ? "template" : "manual";
  }

  // Fallback when `base` branch isn't available
  const templatePatterns = loadTemplatePatterns();
  if (matchesTemplatePattern(relativePath, templatePatterns)) {
    return "template";
  }

  return "manual";
}

// ============================================================================
// Git Operations
// ============================================================================

function getBranchLines(branch: string): number {
  // Count lines in a branch WITHOUT checking it out (works on dirty trees too).
  // Uses `git ls-tree` to enumerate files and `git cat-file --batch` to stream content.
  try {
    const list = execSync(`git ls-tree -r ${branch} -- src`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const targets: string[] = [];
    for (const line of list.split("\n")) {
      // Format: <mode> <type> <sha>\t<path>
      const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/);
      if (!match) continue;
      const [, sha, filePath] = match;
      if (!shouldIncludeFile("/" + filePath)) continue;
      targets.push(sha);
    }

    if (targets.length === 0) return 0;

    // Batch-fetch blob contents via cat-file --batch
    const input = targets.join("\n") + "\n";
    const output = execSync("git cat-file --batch", {
      input,
      maxBuffer: 1024 * 1024 * 1024, // 1 GB headroom
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Parse the cat-file --batch output stream: for each blob,
    //   "<sha> blob <size>\n<size bytes of content>\n"
    let totalLines = 0;
    let offset = 0;
    while (offset < output.length) {
      const newlineIdx = output.indexOf(0x0a, offset);
      if (newlineIdx === -1) break;
      const header = output.slice(offset, newlineIdx).toString("utf-8");
      const parts = header.split(" ");
      if (parts.length < 3 || parts[1] !== "blob") {
        // Missing/unknown — skip to next newline
        offset = newlineIdx + 1;
        continue;
      }
      const size = parseInt(parts[2], 10);
      const contentStart = newlineIdx + 1;
      const content = output.slice(contentStart, contentStart + size);
      // Count newlines + 1 (matching countLines() which uses split("\n").length)
      let lines = 1;
      for (let i = 0; i < content.length; i++) {
        if (content[i] === 0x0a) lines++;
      }
      totalLines += lines;
      offset = contentStart + size + 1; // skip trailing newline
    }

    return totalLines;
  } catch {
    console.warn(`Warning: Could not analyze branch ${branch}`);
    return 0;
  }
}

// ============================================================================
// Analysis
// ============================================================================

function analyzeProject(): FullStats {
  const srcPath = path.resolve(process.cwd(), "src");
  const files = getAllFiles(srcPath);

  const fileStats: FileStats[] = [];
  const categoryMap = new Map<string, CategoryStats>();
  const concernMap = new Map<ArchitecturalConcern, ConcernStats>();

  // Initialize origin stats
  const originStats: OriginStats = {
    staticLines: 0,
    staticFiles: 0,
    templateLines: 0,
    templateFiles: 0,
    manualLines: 0,
    manualFiles: 0,
  };

  const baseFiles = loadBaseBranchFiles();

  // Per-file origin split using git diff base..HEAD as ground truth:
  //   generated_lines = baseLines - deletions   (lines from base that remain)
  //   manual_lines    = additions               (lines added in current vs base)
  // For files NOT in `base`: 100% manual (origin="manual" by classification).
  for (const file of files) {
    const relativePath = getRelativePath(file);
    const lines = countLines(file);
    const origin = classifyFileOrigin(relativePath);
    const { category, concern } = categorizeFile(relativePath);

    let generatedLines = 0;
    let manualLines = 0;
    if (origin === "manual") {
      manualLines = lines;
    } else {
      const baseInfo = baseFiles.get(relativePath);
      if (baseInfo === undefined) {
        // File not in base — count fully toward its origin bucket (no base to compare against)
        generatedLines = lines;
      } else {
        generatedLines = Math.max(0, baseInfo.baseLines - baseInfo.deletions);
        manualLines = baseInfo.additions;
      }
    }

    const stats: FileStats = {
      path: file,
      relativePath,
      lines,
      origin,
      category,
      concern,
    };

    fileStats.push(stats);

    // Update origin stats
    if (origin === "static") {
      originStats.staticLines += generatedLines;
      originStats.staticFiles++;
    } else if (origin === "template") {
      originStats.templateLines += generatedLines;
      originStats.templateFiles++;
    }
    // Any manual delta goes into the manual bucket regardless of file origin
    if (manualLines > 0) {
      originStats.manualLines += manualLines;
      if (origin === "manual") originStats.manualFiles++;
    }

    // Update category stats
    const categoryKey = `${category}|${concern}`;
    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        name: category,
        concern,
        totalLines: 0,
        totalFiles: 0,
        staticLines: 0,
        staticFiles: 0,
        templateLines: 0,
        templateFiles: 0,
        manualLines: 0,
        manualFiles: 0,
      });
    }

    const catStats = categoryMap.get(categoryKey)!;
    catStats.totalLines += lines;
    catStats.totalFiles++;
    if (origin === "static") {
      catStats.staticLines += generatedLines;
      catStats.staticFiles++;
    } else if (origin === "template") {
      catStats.templateLines += generatedLines;
      catStats.templateFiles++;
    }
    if (manualLines > 0) {
      catStats.manualLines += manualLines;
      if (origin === "manual") catStats.manualFiles++;
    }

    // Update concern stats (for bidimensional matrix)
    if (!concernMap.has(concern)) {
      concernMap.set(concern, {
        concern,
        totalLines: 0,
        totalFiles: 0,
        staticLines: 0,
        staticFiles: 0,
        templateLines: 0,
        templateFiles: 0,
        manualLines: 0,
        manualFiles: 0,
      });
    }

    const concernStats = concernMap.get(concern)!;
    concernStats.totalLines += lines;
    concernStats.totalFiles++;
    if (origin === "static") {
      concernStats.staticLines += generatedLines;
      concernStats.staticFiles++;
    } else if (origin === "template") {
      concernStats.templateLines += generatedLines;
      concernStats.templateFiles++;
    }
    if (manualLines > 0) {
      concernStats.manualLines += manualLines;
      if (origin === "manual") concernStats.manualFiles++;
    }
  }

  // Sort categories by total lines descending
  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => b.totalLines - a.totalLines
  );

  // Sort concerns by a fixed order for consistent output
  const concernOrder: ArchitecturalConcern[] = [
    "Presentation",
    "Application",
    "Domain",
    "Infrastructure",
    "AI/ML",
    "Distributed",
    "Real-time",
    "Cross-cutting",
  ];
  const concerns = concernOrder
    .filter((c) => concernMap.has(c))
    .map((c) => concernMap.get(c)!);

  // Get branch stats
  console.log("Analyzing git branches...");
  const baseBranch = getBranchLines("base");
  const developBranch = getBranchLines("develop");

  // Get project name from package.json
  let projectName = "Unknown Project";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    projectName = pkg.name || projectName;
  } catch {}

  return {
    projectName,
    generatedAt: new Date().toISOString(),
    projectType: PROJECT_TYPE,
    branch: {
      baseBranch,
      developBranch,
      manualAdditions: developBranch - baseBranch,
    },
    origin: originStats,
    categories,
    concerns,
    files: fileStats,
  };
}

// ============================================================================
// Output Generation
// ============================================================================

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((value / total) * 100).toFixed(1) + "%";
}

// ============================================================================
// SVG Pie Chart Generation
// ============================================================================

function generatePieChartSVG(
  data: { name: string; value: number; color: string }[],
  title: string,
  width: number = 500,
  height: number = 400
): string {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return "";

  const centerX = width / 2 - 80;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) - 40;

  let currentAngle = -Math.PI / 2; // Start from top
  const paths: string[] = [];
  const legends: string[] = [];

  data.forEach((item, index) => {
    const percentage = item.value / total;
    const angle = percentage * 2 * Math.PI;
    const endAngle = currentAngle + angle;

    // Calculate path
    const x1 = centerX + radius * Math.cos(currentAngle);
    const y1 = centerY + radius * Math.sin(currentAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    // Create pie slice
    const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    paths.push(`<path d="${path}" fill="${item.color}" stroke="white" stroke-width="2"/>`);

    // Calculate label position (middle of arc)
    const midAngle = currentAngle + angle / 2;
    const labelRadius = radius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);

    // Add percentage label on slice if > 5%
    if (percentage > 0.05) {
      paths.push(
        `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="14" font-weight="bold">${(percentage * 100).toFixed(1)}%</text>`
      );
    }

    // Legend
    const legendY = 60 + index * 30;
    const legendX = width - 150;
    legends.push(`
      <rect x="${legendX}" y="${legendY - 10}" width="20" height="20" fill="${item.color}"/>
      <text x="${legendX + 28}" y="${legendY + 4}" font-size="13" fill="#333">${item.name}</text>
      <text x="${legendX + 28}" y="${legendY + 18}" font-size="11" fill="#666">${formatNumber(item.value)} lines</text>
    `);

    currentAngle = endAngle;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>

  <!-- Title -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="18" font-weight="bold" fill="#1a1a1a">${title}</text>

  <!-- Pie Chart -->
  ${paths.join("\n  ")}

  <!-- Legend -->
  ${legends.join("\n  ")}
</svg>`;
}

// ============================================================================
// Cost Calculation (based on COCOMO II and industry benchmarks)
// ============================================================================

function calculateCostEstimate(totalLOC: number, timelineYears: number = 2, teamSize: number = 2): CostEstimate {
  // Traditional development estimates (COCOMO II + industry benchmarks)
  // For ~800K LOC: 19-26 FTE over 3-4 years at US rates
  const traditionalTeamSize = Math.round(totalLOC / 30000); // ~30K LOC per person over project
  const traditionalTimeline = Math.max(3, Math.round(Math.log10(totalLOC) * 1.2));
  const traditionalCostPerYear = traditionalTeamSize * 180000; // US fully-loaded rate
  const traditionalTotalCost = traditionalCostPerYear * traditionalTimeline;
  const traditionalProductivity = Math.round(totalLOC / (traditionalTeamSize * traditionalTimeline));

  // Haiku development (actual Jupiter data: 2 people, 2 years, ~$150-200K/year)
  const haikuCostPerYear = teamSize * 80000; // LatAm senior rate
  const haikuTotalCost = haikuCostPerYear * timelineYears;
  const haikuProductivity = Math.round(totalLOC / (teamSize * timelineYears));

  // Calculate savings
  const teamReduction = ((traditionalTeamSize - teamSize) / traditionalTeamSize) * 100;
  const timelineReduction = ((traditionalTimeline - timelineYears) / traditionalTimeline) * 100;
  const costReduction = ((traditionalTotalCost - haikuTotalCost) / traditionalTotalCost) * 100;
  const productivityMultiplier = haikuProductivity / traditionalProductivity;

  return {
    traditional: {
      teamSize: `${traditionalTeamSize} FTE`,
      timeline: `${traditionalTimeline} years`,
      costPerYear: `$${(traditionalCostPerYear / 1000000).toFixed(1)}M`,
      totalCost: `$${(traditionalTotalCost / 1000000).toFixed(1)}M`,
      productivityLOCPerYear: traditionalProductivity,
    },
    haiku: {
      teamSize: `${teamSize} FTE`,
      timeline: `${timelineYears} years`,
      costPerYear: `$${Math.round(haikuCostPerYear / 1000)}K`,
      totalCost: `$${Math.round(haikuTotalCost / 1000)}K`,
      productivityLOCPerYear: haikuProductivity,
    },
    savings: {
      teamReduction: `${teamReduction.toFixed(0)}%`,
      timelineReduction: `${timelineReduction.toFixed(0)}%`,
      costReduction: `${costReduction.toFixed(0)}%`,
      productivityMultiplier: `${productivityMultiplier.toFixed(1)}×`,
    },
  };
}

// ============================================================================
// Combined Project Stats
// ============================================================================

function loadSiblingStats(
  currentProjectType: "server" | "client"
): { lines: number; files: number; generated: number; manual: number } | null {
  // Find sibling project's stats.json by scanning sibling directories.
  // We look for a stats.json whose projectType is the opposite of ours.
  const oppositeType = currentProjectType === "server" ? "client" : "server";
  const parentDir = path.resolve(process.cwd(), "..");

  if (!fs.existsSync(parentDir)) return null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parentDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const siblingPath = path.join(parentDir, entry.name, "stats.json");
    if (!fs.existsSync(siblingPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(siblingPath, "utf-8"));
      if (data.summary?.projectType !== oppositeType) continue;
      if (data.summary && data.origin) {
        return {
          lines: data.summary.totalLines || 0,
          files: data.summary.totalFiles || 0,
          generated: (data.origin.framework?.lines || 0) + (data.origin.templateDerived?.lines || 0),
          manual: data.origin.manual?.lines || 0,
        };
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

function getCombinedStats(currentStats: FullStats): CombinedStats {
  const currentTotal =
    currentStats.origin.staticLines + currentStats.origin.templateLines + currentStats.origin.manualLines;
  const currentFiles =
    currentStats.origin.staticFiles + currentStats.origin.templateFiles + currentStats.origin.manualFiles;
  const currentGenerated = currentStats.origin.staticLines + currentStats.origin.templateLines;

  const sibling = loadSiblingStats(currentStats.projectType);

  const isServer = currentStats.projectType === "server";

  if (sibling) {
    const totalLines = currentTotal + sibling.lines;
    const totalFiles = currentFiles + sibling.files;
    const totalGenerated = currentGenerated + sibling.generated;
    const totalManual = currentStats.origin.manualLines + sibling.manual;

    return {
      server: isServer
        ? { lines: currentTotal, files: currentFiles }
        : { lines: sibling.lines, files: sibling.files },
      client: isServer
        ? { lines: sibling.lines, files: sibling.files }
        : { lines: currentTotal, files: currentFiles },
      total: { lines: totalLines, files: totalFiles },
      generated: { lines: totalGenerated, percent: (totalGenerated / totalLines) * 100 },
      humanWritten: { lines: totalManual, percent: (totalManual / totalLines) * 100 },
    };
  }

  return {
    server: isServer ? { lines: currentTotal, files: currentFiles } : null,
    client: isServer ? null : { lines: currentTotal, files: currentFiles },
    total: { lines: currentTotal, files: currentFiles },
    generated: { lines: currentGenerated, percent: (currentGenerated / currentTotal) * 100 },
    humanWritten: {
      lines: currentStats.origin.manualLines,
      percent: (currentStats.origin.manualLines / currentTotal) * 100,
    },
  };
}

function generateMarkdown(stats: FullStats): string {
  const totalLines =
    stats.origin.staticLines + stats.origin.templateLines + stats.origin.manualLines;
  const totalFiles =
    stats.origin.staticFiles + stats.origin.templateFiles + stats.origin.manualFiles;

  // Calculate academic metrics
  const generatedLines = stats.origin.staticLines + stats.origin.templateLines;
  const generationCoverage = totalLines > 0 ? generatedLines / totalLines : 0;
  const customizationRatio = totalLines > 0 ? stats.origin.manualLines / totalLines : 0;
  const frameworkReuse = totalLines > 0 ? stats.origin.staticLines / totalLines : 0;

  let md = `# Code Statistics - ${stats.projectName}

**Generated:** ${new Date(stats.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}
**Project Type:** ${stats.projectType === "server" ? "Backend (Server)" : "Frontend (Client)"}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Lines of Code | ${formatNumber(totalLines)} |
| Total Files | ${formatNumber(totalFiles)} |
| Generation Coverage | ${formatPercent(generatedLines, totalLines)} |
| Customization Ratio | ${formatPercent(stats.origin.manualLines, totalLines)} |
| Platform Code Reuse | ${formatPercent(stats.origin.staticLines, totalLines)} |

---

## Code Automation Summary

| Source | Lines | % |
|--------|-------|---|
| **Automatically Generated** (Haiku DSL) | ${formatNumber(generatedLines)} | ${formatPercent(generatedLines, totalLines)} |
| **Human-Written** (Manual additions) | ${formatNumber(stats.origin.manualLines)} | ${formatPercent(stats.origin.manualLines, totalLines)} |

> **Key finding:** Over ${(generationCoverage * 100).toFixed(0)}% of this codebase is automatically generated
> and maintained by the Haiku code generator. Only ~${(customizationRatio * 100).toFixed(1)}% requires
> manual coding by developers.

---

## Code Composition by Origin

| Origin | Lines | % | Files | Description |
|--------|-------|---|-------|-------------|
| **Platform Code** (Static-files) | ${formatNumber(stats.origin.staticLines)} | ${formatPercent(stats.origin.staticLines, totalLines)} | ${stats.origin.staticFiles} | Reusable code shared across projects |
| **Entity-Generated** (Templates) | ${formatNumber(stats.origin.templateLines)} | ${formatPercent(stats.origin.templateLines, totalLines)} | ${stats.origin.templateFiles} | Per-entity generated code |
| **Human-Written** (Manual) | ${formatNumber(stats.origin.manualLines)} | ${formatPercent(stats.origin.manualLines, totalLines)} | ${stats.origin.manualFiles} | Code written manually by developers |
| **Total** | **${formatNumber(totalLines)}** | **100%** | **${totalFiles}** | |

> **Note:** All generated code (Platform + Entity-Generated) reflects 15+ years of refinement
> of the DSL language, code generation templates, and architecture. The generator has evolved
> through Python/Django, Node.js/Sequelize, and Node.js/Prisma stacks while preserving
> accumulated domain knowledge. The distinction above is by *origin mechanism*, not maturity.

---

## Architectural Concern × Origin Matrix

*Bidimensional taxonomy based on Layered Architecture (O'Reilly) and Cross-cutting Concerns (Dijkstra 1974)*

| Concern | Lines | % Total | Platform | Entity-Gen | Human |
|---------|-------|---------|----------|------------|---------|
`;

  for (const concern of stats.concerns) {
    md += `| **${concern.concern}** | ${formatNumber(concern.totalLines)} | ${formatPercent(concern.totalLines, totalLines)} | ${formatPercent(concern.staticLines, concern.totalLines)} | ${formatPercent(concern.templateLines, concern.totalLines)} | ${formatPercent(concern.manualLines, concern.totalLines)} |\n`;
  }

  md += `
---

## Categories by Architectural Concern

`;

  // Group categories by concern
  const categoryByConcern = new Map<string, CategoryStats[]>();
  for (const cat of stats.categories) {
    const existing = categoryByConcern.get(cat.concern) || [];
    existing.push(cat);
    categoryByConcern.set(cat.concern, existing);
  }

  for (const [concern, cats] of categoryByConcern) {
    md += `### ${concern}

| Category | Lines | Platform | Entity-Gen | Human |
|----------|-------|----------|------------|---------|
`;
    for (const cat of cats) {
      md += `| ${cat.name} | ${formatNumber(cat.totalLines)} | ${formatPercent(cat.staticLines, cat.totalLines)} | ${formatPercent(cat.templateLines, cat.totalLines)} | ${formatPercent(cat.manualLines, cat.totalLines)} |\n`;
    }
    md += `\n`;
  }

  md += `---

## Key Findings

`;

  // Auto-generate key findings
  for (const concern of stats.concerns) {
    if (concern.totalLines > 0) {
      const frameworkPct = (concern.staticLines / concern.totalLines) * 100;
      const templatePct = (concern.templateLines / concern.totalLines) * 100;
      const manualPct = (concern.manualLines / concern.totalLines) * 100;

      if (frameworkPct > 80) {
        md += `- **${concern.concern}** is ${frameworkPct.toFixed(0)}% platform code (reusable across projects)\n`;
      } else if (templatePct > 70) {
        md += `- **${concern.concern}** is ${templatePct.toFixed(0)}% entity-generated (DSL-driven per-entity code)\n`;
      } else if (manualPct > 30) {
        md += `- **${concern.concern}** has ${manualPct.toFixed(0)}% human-written code (manual additions by developers)\n`;
      }
    }
  }

  md += `
---

## For Academic Papers

### Code Generation Metrics

| Metric | Formula | Value |
|--------|---------|-------|
| **Generation Coverage** | (Platform + Entity-Gen) / Total | ${(generationCoverage * 100).toFixed(1)}% |
| **Customization Ratio** | Project-Specific / Total | ${(customizationRatio * 100).toFixed(1)}% |
| **Platform Code Reuse** | Platform / Total | ${(frameworkReuse * 100).toFixed(1)}% |
| **Entity-Gen Contribution** | Entity-Gen / Total | ${formatPercent(stats.origin.templateLines, totalLines)} |

### Branch Analysis

| Metric | Value |
|--------|-------|
| Generated code (base branch) | ${formatNumber(stats.branch.baseBranch)} lines |
| Total code (develop branch) | ${formatNumber(stats.branch.developBranch)} lines |
| Manual additions | ${formatNumber(stats.branch.manualAdditions)} lines |
| % in base branch | ${formatPercent(stats.branch.baseBranch, stats.branch.developBranch)} |

### Pie Chart Data (JSON)

\`\`\`json
{
  "byOrigin": {
    "Platform Code": ${stats.origin.staticLines},
    "Entity-Generated": ${stats.origin.templateLines},
    "Human-Written": ${stats.origin.manualLines}
  },
  "byConcern": {
${stats.concerns.map((c) => `    "${c.concern}": ${c.totalLines}`).join(",\n")}
  }
}
\`\`\`

---

## Combined Project Statistics

`;

  // Add combined stats section
  const combined = getCombinedStats(stats);
  const costEstimate = calculateCostEstimate(combined.total.lines);

  md += `*Aggregated statistics across server and client components*

| Component | Lines of Code | Files |
|-----------|---------------|-------|
`;

  if (combined.server) {
    md += `| Backend (Server) | ${formatNumber(combined.server.lines)} | ${formatNumber(combined.server.files)} |\n`;
  }
  if (combined.client) {
    md += `| Frontend (Client) | ${formatNumber(combined.client.lines)} | ${formatNumber(combined.client.files)} |\n`;
  }
  md += `| **Total Project** | **${formatNumber(combined.total.lines)}** | **${formatNumber(combined.total.files)}** |

### Code Automation Impact

| Metric | Lines | Percentage |
|--------|-------|------------|
| **Automatically Generated** | ${formatNumber(combined.generated.lines)} | **${combined.generated.percent.toFixed(1)}%** |
| **Human-Written** | ${formatNumber(combined.humanWritten.lines)} | ${combined.humanWritten.percent.toFixed(1)}% |

> **Visual:** See \`stats-chart.svg\` for the pie chart visualization.

---

## Development Cost Comparison

*Based on COCOMO II [Boehm 2000], industry benchmarks [ISBSG], and actual Jupiter development data*

| Metric | Traditional Development | Haiku-based Development | Savings |
|--------|------------------------|------------------------|---------|
| **Team Size** | ${costEstimate.traditional.teamSize} | ${costEstimate.haiku.teamSize} | ${costEstimate.savings.teamReduction} |
| **Timeline** | ${costEstimate.traditional.timeline} | ${costEstimate.haiku.timeline} | ${costEstimate.savings.timelineReduction} |
| **Annual Cost** | ${costEstimate.traditional.costPerYear}/year | ${costEstimate.haiku.costPerYear}/year | - |
| **Total Cost** | ${costEstimate.traditional.totalCost} | ${costEstimate.haiku.totalCost} | **${costEstimate.savings.costReduction}** |
| **Productivity** | ${formatNumber(costEstimate.traditional.productivityLOCPerYear)} LOC/person-year | ${formatNumber(costEstimate.haiku.productivityLOCPerYear)} LOC/person-year | **${costEstimate.savings.productivityMultiplier}** |

### Key Insights

- **${costEstimate.savings.productivityMultiplier} productivity multiplier** compared to traditional development
- **${costEstimate.savings.costReduction} cost reduction** through automated code generation
- **${costEstimate.savings.teamReduction} smaller team** while producing the same codebase
- Only **${combined.humanWritten.percent.toFixed(1)}%** of code requires manual development

### Methodology

- **Traditional estimates**: COCOMO II nominal parameters, US fully-loaded rates ($180K/FTE/year)
- **Haiku estimates**: Actual Jupiter data (2 FTE, 2 years, LatAm senior rates)
- **Productivity**: LOC per person-year across full project lifecycle

> **References:**
> - Boehm et al. "Software Cost Estimation with COCOMO II" (2000)
> - Brooks, F. "The Mythical Man-Month" (1975)
> - Kelly & Tolvanen "Domain-Specific Modeling" (2008) - Nokia 10× productivity
> - Baker et al. "Model-Driven Engineering at Motorola" (2005) - 1.2-8× productivity

---

*Generated by \`npm run stats\` using bidimensional taxonomy*
*Based on: Layered Architecture, Cross-cutting Concerns (Dijkstra 1974), MDE metrics*
`;

  return md;
}

function generateJSON(stats: FullStats): object {
  const totalLines =
    stats.origin.staticLines + stats.origin.templateLines + stats.origin.manualLines;
  const totalFiles =
    stats.origin.staticFiles + stats.origin.templateFiles + stats.origin.manualFiles;

  // Calculate academic metrics
  const generatedLines = stats.origin.staticLines + stats.origin.templateLines;
  const generationCoverage = totalLines > 0 ? generatedLines / totalLines : 0;
  const customizationRatio = totalLines > 0 ? stats.origin.manualLines / totalLines : 0;
  const frameworkReuse = totalLines > 0 ? stats.origin.staticLines / totalLines : 0;

  return {
    summary: {
      projectName: stats.projectName,
      projectType: stats.projectType,
      generatedAt: stats.generatedAt,
      totalLines,
      totalFiles,
      // Academic metrics
      generationCoverage,
      customizationRatio,
      frameworkReuse,
      templateContribution: totalLines > 0 ? stats.origin.templateLines / totalLines : 0,
    },
    branch: {
      baseBranchLines: stats.branch.baseBranch,
      developBranchLines: stats.branch.developBranch,
      manualAdditions: stats.branch.manualAdditions,
      percentInBase:
        stats.branch.developBranch > 0
          ? stats.branch.baseBranch / stats.branch.developBranch
          : 0,
    },
    origin: {
      framework: {
        lines: stats.origin.staticLines,
        files: stats.origin.staticFiles,
        percent: totalLines > 0 ? stats.origin.staticLines / totalLines : 0,
      },
      templateDerived: {
        lines: stats.origin.templateLines,
        files: stats.origin.templateFiles,
        percent: totalLines > 0 ? stats.origin.templateLines / totalLines : 0,
      },
      manual: {
        lines: stats.origin.manualLines,
        files: stats.origin.manualFiles,
        percent: totalLines > 0 ? stats.origin.manualLines / totalLines : 0,
      },
    },
    // Bidimensional matrix: concerns × origin
    concerns: stats.concerns.map((c) => ({
      concern: c.concern,
      total: { lines: c.totalLines, files: c.totalFiles },
      framework: {
        lines: c.staticLines,
        files: c.staticFiles,
        percent: c.totalLines > 0 ? c.staticLines / c.totalLines : 0,
      },
      templateDerived: {
        lines: c.templateLines,
        files: c.templateFiles,
        percent: c.totalLines > 0 ? c.templateLines / c.totalLines : 0,
      },
      manual: {
        lines: c.manualLines,
        files: c.manualFiles,
        percent: c.totalLines > 0 ? c.manualLines / c.totalLines : 0,
      },
    })),
    // Categories with concern mapping
    categories: stats.categories.map((cat) => ({
      name: cat.name,
      concern: cat.concern,
      total: { lines: cat.totalLines, files: cat.totalFiles },
      framework: {
        lines: cat.staticLines,
        files: cat.staticFiles,
        percent: cat.totalLines > 0 ? cat.staticLines / cat.totalLines : 0,
      },
      templateDerived: {
        lines: cat.templateLines,
        files: cat.templateFiles,
        percent: cat.totalLines > 0 ? cat.templateLines / cat.totalLines : 0,
      },
      manual: {
        lines: cat.manualLines,
        files: cat.manualFiles,
        percent: cat.totalLines > 0 ? cat.manualLines / cat.totalLines : 0,
      },
    })),
    // Pie chart data
    pieChartData: {
      byOrigin: [
        { name: "Platform Code", value: stats.origin.staticLines },
        { name: "Entity-Generated", value: stats.origin.templateLines },
        { name: "Human-Written", value: stats.origin.manualLines },
      ],
      byConcern: stats.concerns.map((c) => ({
        name: c.concern,
        value: c.totalLines,
      })),
      byCategory: stats.categories.map((cat) => ({
        name: cat.name,
        concern: cat.concern,
        value: cat.totalLines,
      })),
    },
  };
}

function printConsoleSummary(stats: FullStats): void {
  const totalLines =
    stats.origin.staticLines + stats.origin.templateLines + stats.origin.manualLines;

  // Academic metrics
  const generatedLines = stats.origin.staticLines + stats.origin.templateLines;
  const generationCoverage = totalLines > 0 ? (generatedLines / totalLines) * 100 : 0;
  const customizationRatio = totalLines > 0 ? (stats.origin.manualLines / totalLines) * 100 : 0;

  console.log("\n");
  console.log("=".repeat(70));
  console.log(`  CODE STATISTICS - ${stats.projectName} (${stats.projectType})`);
  console.log("=".repeat(70));
  console.log("\n");

  console.log("  EXECUTIVE SUMMARY");
  console.log("  -----------------");
  console.log(`  Total Lines:          ${formatNumber(totalLines)}`);
  console.log(`  Generation Coverage:  ${generationCoverage.toFixed(1)}%`);
  console.log(`  Customization Ratio:  ${customizationRatio.toFixed(1)}%`);
  console.log("\n");

  console.log("  CODE COMPOSITION BY ORIGIN");
  console.log("  --------------------------");
  console.log(`  Platform Code:   ${formatNumber(stats.origin.staticLines).padStart(10)} lines (${formatPercent(stats.origin.staticLines, totalLines).padStart(5)})`);
  console.log(`  Entity-Generated:${formatNumber(stats.origin.templateLines).padStart(10)} lines (${formatPercent(stats.origin.templateLines, totalLines).padStart(5)})`);
  console.log(`  Human-Written:   ${formatNumber(stats.origin.manualLines).padStart(10)} lines (${formatPercent(stats.origin.manualLines, totalLines).padStart(5)})`);
  console.log("\n");

  console.log("  ARCHITECTURAL CONCERNS × ORIGIN MATRIX");
  console.log("  --------------------------------------");
  console.log("  Concern            Lines    % Tot   Platf   EntGn   Human");
  console.log("  " + "-".repeat(62));
  for (const concern of stats.concerns) {
    const fPct = formatPercent(concern.staticLines, concern.totalLines);
    const tPct = formatPercent(concern.templateLines, concern.totalLines);
    const mPct = formatPercent(concern.manualLines, concern.totalLines);
    const totPct = formatPercent(concern.totalLines, totalLines);
    console.log(
      `  ${concern.concern.padEnd(16)} ${formatNumber(concern.totalLines).padStart(8)}  ${totPct.padStart(6)}  ${fPct.padStart(6)}  ${tPct.padStart(6)}  ${mPct.padStart(5)}`
    );
  }
  console.log("\n");

  console.log("  TOP CATEGORIES");
  console.log("  --------------");
  const topCategories = stats.categories.slice(0, 6);
  for (const cat of topCategories) {
    const fPct = formatPercent(cat.staticLines, cat.totalLines);
    const tPct = formatPercent(cat.templateLines, cat.totalLines);
    const mPct = formatPercent(cat.manualLines, cat.totalLines);
    console.log(
      `  ${cat.name.padEnd(22)} ${formatNumber(cat.totalLines).padStart(8)} lines  [P:${fPct.padStart(5)} E:${tPct.padStart(5)} H:${mPct.padStart(5)}]`
    );
  }
  console.log("\n");

  console.log("  OUTPUT FILES");
  console.log("  ------------");
  console.log("  stats.md   - Bidimensional taxonomy report for papers");
  console.log("  stats.json - Structured data for pie charts and visualizations");
  console.log("\n");
  console.log("=".repeat(70));
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  console.log("Analyzing code composition...\n");

  // Check if generator path exists
  if (!fs.existsSync(GENERATOR_PATH)) {
    console.error(`Error: Generator path not found: ${GENERATOR_PATH}`);
    console.error("Set HAIKU_GENERATOR_PATH environment variable to the correct path.");
    process.exit(1);
  }

  console.log(`Project type: ${PROJECT_TYPE}`);
  console.log(`Generator path: ${GENERATOR_PATH}\n`);

  const stats = analyzeProject();

  // Generate outputs
  const markdown = generateMarkdown(stats);
  const json = generateJSON(stats);

  // Generate SVG pie chart
  const combined = getCombinedStats(stats);
  const pieChartSVG = generatePieChartSVG(
    [
      { name: "Generated Code", value: combined.generated.lines, color: "#2563eb" },
      { name: "Human-Written", value: combined.humanWritten.lines, color: "#dc2626" },
    ],
    `Code Composition - ${combined.generated.percent.toFixed(1)}% Automatically Generated`,
    500,
    300
  );

  // Write files
  fs.writeFileSync("stats.md", markdown);
  fs.writeFileSync("stats.json", JSON.stringify(json, null, 2));
  if (pieChartSVG) {
    fs.writeFileSync("stats-chart.svg", pieChartSVG);
  }

  // Print summary
  printConsoleSummary(stats);

  console.log("\n  OUTPUT FILES GENERATED");
  console.log("  ----------------------");
  console.log("  stats.md        - Full report with tables and cost analysis");
  console.log("  stats.json      - Structured data for programmatic use");
  console.log("  stats-chart.svg - Pie chart visualization");
  console.log("\n");
}

main();
