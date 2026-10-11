#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Enhanced categories with subcategories
const CATEGORIES = {
  database: '🗃️ DATABASE',
  development: '🚀 DEVELOPMENT',
  build: '📦 BUILD',
  monitoring: '📊 MONITORING',
  testing: '🧪 TESTING',
  docker: '🐳 DOCKER'
};

// =====================================================================
// WORKFLOWS - Step-by-step guides for common tasks
// =====================================================================
const WORKFLOWS = {
  'first-time-setup': {
    title: '🚀 Primera Configuración Local',
    category: 'development',
    description: 'Configura tu entorno de desarrollo local desde cero',
    prerequisites: [
      'Node.js 18+ instalado',
      'PostgreSQL corriendo (local o remoto)',
      'Redis corriendo (local o remoto)',
      'DATABASE_URL configurada en .env'
    ],
    steps: [
      { command: 'npm run dev:setup', description: 'Instalar dependencias + inicializar BD', duration: '2-3 min' },
      { command: 'npm run dev', description: 'Iniciar servidor + worker en http://localhost:4000', duration: 'continuo' }
    ],
    tips: [
      'Usa `npm run dev:server` para solo el servidor (sin worker)',
      'Usa `npm run db:seed:select` para seeds específicos',
      'Usa `npm run dev:db` para abrir consola psql'
    ],
    nextSteps: ['add-migration']
  },

  'add-migration': {
    title: '📝 Agregar una Migración de BD',
    category: 'development',
    description: 'Modificar el esquema de base de datos',
    prerequisites: ['Entorno local funcionando (first-time-setup)'],
    steps: [
      { command: 'Editar prisma/schema.prisma', type: 'manual', description: 'Agregar/modificar modelos' },
      { command: 'npm run update', description: 'Generar migración + código TypeScript', duration: '30 seg' },
      { command: 'npm run dev', description: 'Probar los cambios localmente' }
    ],
    tips: [
      'Usa `npm run db:diff` para ver SQL que se generará',
      'Usa `npm run db:validate` para verificar el esquema antes de migrar'
    ]
  },

  'deploy': {
    title: '🚢 Deploy a Producción',
    category: 'development',
    description: 'Desplegar la aplicación usando deploy-toolkit',
    prerequisites: [
      'Servidor con SSH configurado',
      'Docker y registry en el servidor (via /infrastructure)',
      'Traefik configurado (via /infrastructure/traefik-stack)',
      'PostgreSQL configurado (via /infrastructure/postgres-service)'
    ],
    steps: [
      { command: 'Configurar .env.production', type: 'manual', description: 'Variables de entorno de producción (DATABASE_URL, DOMAIN, etc.)' },
      { command: './remote-deploy.sh <ssh-target>', description: 'Build, push y deploy al servidor', duration: '5-10 min' },
      { command: './health-check.sh', description: 'Verificar que todo está funcionando', duration: '10 seg' }
    ],
    tips: [
      'Usa `./remote-deploy.sh user@server --backend-only` para solo backend',
      'Usa `./remote-deploy.sh user@server --skip-build` si la imagen ya está pusheada',
      'Revisa `deploy.json` para la configuración de deploy-toolkit'
    ]
  }
};

// Complete metadata for important commands
const COMMAND_METADATA = {
  // ==================== AI SEARCH ====================
  'ai:search': {
    description: 'Interactive AI Search CLI with LLM',
    category: 'development',
    subcategory: 'ai-search',
    when: 'Use for interactive AI-powered queries over your data',
    related: ['ai:document:search'],
    examples: [
      'npm run ai:search',
      'npm run ai:search --user admin@example.com',
      'npm run ai:search -v  # Verbose mode'
    ]
  },
  'ai:document:search': {
    description: 'Test vector search on indexed documents (embeddings)',
    category: 'development',
    subcategory: 'ai-search',
    when: 'Use to test document embeddings and vector search',
    related: ['ai:search'],
    examples: [
      'npm run ai:document:search "herencia de obra musical"',
      'npm run ai:document:search "copyright law" --limit=10',
      'npm run ai:document:search "query" --verbose'
    ]
  },

  // ==================== DATABASE ====================
  'db:fresh': {
    description: 'Reset database + create fresh migration',
    category: 'database',
    subcategory: 'schema',
    danger: 'DESTRUCTIVE - Deletes all data',
    when: 'Use when changing schema structure significantly',
    related: ['db:reset', 'db:init'],
    examples: ['npm run db:fresh']
  },
  'db:init': {
    description: 'Initialize schema from scratch + seed',
    category: 'database',
    subcategory: 'schema',
    danger: 'DESTRUCTIVE - Resets dev database',
    when: 'Use for initial setup or to reset dev environment',
    related: ['db:fresh', 'dev:setup'],
    examples: ['npm run db:init']
  },
  'db:reset': {
    description: 'Reset database using existing migrations',
    category: 'database',
    subcategory: 'schema',
    danger: 'Deletes data',
    when: 'Use to reset without creating new migration',
    related: ['db:fresh', 'db:reset:force'],
    examples: ['npm run db:reset']
  },
  'db:reset:force': {
    description: 'Reset database without confirmation prompt',
    category: 'database',
    subcategory: 'schema',
    danger: 'DESTRUCTIVE - Deletes data without confirmation',
    when: 'Use in scripts or when you are sure',
    related: ['db:reset'],
    examples: ['npm run db:reset:force']
  },
  'db:seed': {
    description: 'Execute database seeds',
    category: 'database',
    subcategory: 'data',
    related: ['db:seed:select', 'db:seed:system'],
    examples: [
      'npm run db:seed',
      'SEED_ONLY=permissions npm run db:seed  # Seed only permissions'
    ]
  },
  'db:seed:select': {
    description: 'Interactive seed selection menu',
    category: 'database',
    subcategory: 'data',
    when: 'Use when you want to choose which seeds to run',
    related: ['db:seed', 'db:seed:system'],
    examples: ['npm run db:seed:select']
  },
  'db:seed:system': {
    description: 'Run system seeds only (users, permissions, roles)',
    category: 'database',
    subcategory: 'data',
    when: 'Use in production to avoid synthetic data',
    related: ['db:seed:select'],
    examples: ['npm run db:seed:system']
  },
  'db:seed:dry': {
    description: 'List what a seed run would do, without writing',
    category: 'database',
    subcategory: 'data',
    when: 'Use to rehearse a production seed run',
    related: ['db:seed', 'db:seed:list'],
    examples: ['npm run db:seed:dry']
  },
  'update': {
    description: 'Update DB schema + regenerate GraphQL code',
    category: 'database',
    subcategory: 'schema',
    when: 'Use after modifying prisma schema',
    related: ['generate'],
    examples: ['npm run update']
  },
  // ==================== DEVELOPMENT ====================
  'dev': {
    description: 'Start server + worker',
    category: 'development',
    subcategory: 'local',
    when: 'Daily development — starts everything you need',
    related: ['dev:server', 'worker:dev'],
    examples: ['npm run dev']
  },
  'dev:server': {
    description: 'Start only ts-node-dev server (no worker)',
    category: 'development',
    subcategory: 'local',
    when: 'Use when you only need the server process',
    related: ['dev', 'dev:server:debug'],
    examples: ['npm run dev:server']
  },
  'dev:server:debug': {
    description: 'Start server with Node.js inspector (port 9229)',
    category: 'development',
    subcategory: 'local',
    when: 'Use for debugging with Chrome DevTools or VS Code debugger',
    related: ['dev:server'],
    examples: ['npm run dev:server:debug']
  },
  'dev:db': {
    description: 'Open PostgreSQL interactive console via psql',
    category: 'development',
    subcategory: 'local',
    when: 'Use for direct SQL queries against dev database',
    examples: ['npm run dev:db']
  },
  'dev:setup': {
    description: 'Install dependencies + initialize DB',
    category: 'development',
    subcategory: 'local',
    when: 'First time setup',
    related: ['dev', 'db:init'],
    examples: ['npm run dev:setup']
  },
  'dev:seed': {
    description: 'Run seeds via dotenv+tsx (internal)',
    category: 'development',
    subcategory: 'local',
  },

  // ==================== BUILD ====================
  'build:fast': {
    description: 'Fast build using esbuild (for deployment)',
    category: 'build',
    when: 'Used by remote-deploy.sh for fast builds',
    related: ['build', 'build:prod'],
    examples: ['npm run build:fast']
  },
  'build': {
    description: 'Full TypeScript build (slow but complete)',
    category: 'build',
    duration: '2-5 min',
    when: 'Use for production builds or when esbuild has issues',
    related: ['build:fast', 'build:prod'],
    examples: ['npm run build']
  },
  'typecheck': {
    description: 'Type check without building',
    category: 'build',
    when: 'Use to verify types before committing',
    examples: ['npm run typecheck']
  },

  // ==================== DOCKER (cleanup) ====================
  'docker:prune:volumes': {
    description: 'Delete ALL Docker resources including volumes',
    category: 'docker',
    subcategory: 'cleanup',
    danger: 'CRITICAL - Deletes ALL Docker resources (not just this project), including volumes with data',
    when: 'Use only to completely reset Docker',
    related: ['docker:prune', 'docker:prune:all'],
    examples: ['npm run docker:prune:volumes'],
    notes: 'Requires confirmation. Affects ALL projects, not just this one.'
  },
  'docker:prune': {
    description: 'Delete Docker resources older than 24h',
    category: 'docker',
    subcategory: 'cleanup',
    danger: 'WARNING - Deletes Docker resources from ALL projects',
    when: 'Use to clean old resources safely',
    related: ['docker:prune:all', 'docker:prune:volumes'],
    examples: ['npm run docker:prune'],
    notes: 'Requires confirmation. Only affects resources older than 24h.'
  },
  'docker:prune:all': {
    description: 'Delete ALL unused Docker resources',
    category: 'docker',
    subcategory: 'cleanup',
    danger: 'CRITICAL - Deletes ALL unused Docker images/containers from ALL projects',
    when: 'Use only to free maximum space',
    related: ['docker:prune', 'docker:prune:volumes'],
    examples: ['npm run docker:prune:all'],
    notes: 'Requires confirmation. Affects ALL projects.'
  },
  'db:gis:inject': {
    description: 'Inject PostGIS SQL into migration files',
    category: 'database',
    subcategory: 'schema',
    when: 'Use after creating a migration that needs PostGIS support',
    related: ['db:migrate:gis'],
    examples: ['npm run db:gis:inject']
  }
};

// Auto-categorization function
function getCategory(scriptName, scriptValue) {
  if (COMMAND_METADATA[scriptName]) {
    return COMMAND_METADATA[scriptName].category;
  }

  // Pattern-based categorization (order matters — more specific patterns first)
  if (scriptName.startsWith('db:') || scriptName === 'update') return 'database';
  if (scriptName.includes('seed')) return 'database';
  if (scriptName.startsWith('dev:') || scriptName === 'dev') return 'development';
  if (scriptName.includes('docker') || scriptName.includes('container')) return 'docker';
  if (scriptName.includes('build') || scriptName === 'typecheck' || scriptName === 'clean') return 'build';
  if (scriptName.includes('monitoring') || scriptName.includes('health') || scriptName === 'logs') return 'monitoring';
  if (scriptName.includes('test')) return 'testing';
  if (scriptName.startsWith('ai:') || scriptName.startsWith('cron:')) return 'development';
  if (scriptName.startsWith('generate')) return 'build';
  if (scriptName.startsWith('worker:')) return 'development';
  if (scriptName === 'lint' || scriptName.startsWith('lint:') || scriptName === 'format') return 'build';
  if (scriptName.startsWith('setup:') || scriptName.startsWith('db:gis:')) return 'database';

  return null;
}

// Group scripts by category
function groupScriptsByCategory() {
  const grouped = {};

  for (const [name, script] of Object.entries(packageJson.scripts)) {
    if (name.startsWith('//')) continue;

    const category = getCategory(name, script);
    if (!category) continue;

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push({ name, script });
  }

  return grouped;
}

// Print command with metadata
function printCommand(cmd, verbose = false) {
  const metadata = getCommandMetadata(cmd.name) || {};
  const description = metadata.description || 'No description available';

  const lockIcon = metadata.cannotRename ? ' [PROTECTED]' : '';
  const dangerIcon = metadata.danger ? ' [DANGER]' : '';

  if (verbose) {
    console.log(`\n${cmd.name}${lockIcon}${dangerIcon}`);
    console.log(`  ${description}`);

    if (metadata.danger) {
      console.log(`  WARNING: ${metadata.danger}`);
    }

    if (metadata.when) {
      console.log(`  When: ${metadata.when}`);
    }

    if (metadata.duration) {
      console.log(`  Duration: ~${metadata.duration}`);
    }

    if (metadata.examples && metadata.examples.length > 0) {
      console.log(`  Usage:`);
      metadata.examples.forEach(ex => {
        if (!ex.startsWith('#') && ex.trim() !== '') {
          console.log(`    ${ex}`);
        }
      });
    }

    if (metadata.related) {
      console.log(`  Related: ${metadata.related.join(', ')}`);
    }
  } else {
    const example = metadata.examples && metadata.examples.length > 0
      ? metadata.examples.find(ex => !ex.startsWith('#') && ex.trim() !== '')
      : `npm run ${cmd.name}`;

    console.log(`  ${example.padEnd(50)}  # ${description}${dangerIcon}`);
  }
}

// Print category with optional subcategory grouping
function printCategory(categoryKey, commands, showSubcategories = false) {
  const categoryName = CATEGORIES[categoryKey] || categoryKey.toUpperCase();

  console.log('');
  console.log(`${categoryName}`);

  commands.sort((a, b) => a.name.localeCompare(b.name));

  if (showSubcategories) {
    const bySubcategory = {};

    commands.forEach(cmd => {
      const metadata = COMMAND_METADATA[cmd.name];
      const subcategory = metadata?.subcategory || 'other';

      if (!bySubcategory[subcategory]) {
        bySubcategory[subcategory] = [];
      }
      bySubcategory[subcategory].push(cmd);
    });

    // Print by subcategory
    Object.entries(bySubcategory).forEach(([subcat, cmds]) => {
      if (subcat !== 'other') {
        console.log(`  \x1b[1m${subcat.toUpperCase()}\x1b[0m\n`);
      }
      cmds.forEach(cmd => printCommand(cmd));
    });
  } else {
    commands.forEach(cmd => printCommand(cmd));
  }
}

// Getting Started section
function showGettingStarted() {
  console.log('QUICK START\n');
  console.log('  First time:');
  console.log('    npm run dev:setup           # Install + initialize DB');
  console.log('    npm run dev                 # Start everything\n');
  console.log('  Daily:');
  console.log('    npm run dev                 # Start server + worker\n');
  console.log('  Common tasks:');
  console.log('    npm run db:seed:select      # Populate database');
  console.log('    npm run update              # Apply schema changes\n');
  console.log('  Deploy:');
  console.log('    ./remote-deploy.sh user@server   # Deploy via deploy-toolkit');
  console.log('    ./health-check.sh                # Verify deployment\n');
  console.log('  Advanced:');
  console.log('    npm run help -- --verbose db:fresh');
  console.log('    npm run help -- --search seed');
  console.log('');
  console.log('  Workflows (step-by-step tutorials):');
  console.log('    npm run help -- --workflows');
  console.log('');
}

// Main help display
function showHelp(category, options = {}) {
  const totalCommands = Object.keys(packageJson.scripts).filter(k => !k.startsWith('//')).length;

  console.log('');
  console.log(`NPM SCRIPTS (${totalCommands} commands)`);
  console.log('');

  if (!category && !options.skipGettingStarted) {
    showGettingStarted();
    console.log('─'.repeat(60));
  }

  const grouped = groupScriptsByCategory();

  if (category) {
    if (!grouped[category]) {
      console.error(`Category not found: ${category}`);
      console.log('');
      console.log('Available categories:');
      Object.keys(CATEGORIES).forEach(cat => {
        const count = grouped[cat] ? grouped[cat].length : 0;
        const displayName = CATEGORIES[cat] || cat.toUpperCase();
        console.log(`  ${cat.padEnd(12)} → ${displayName} (${count} commands)`);
      });
      console.log('');
      console.log('Usage: npm run help <category>');
      console.log('Example: npm run help database');
      process.exit(1);
    }

    printCategory(category, grouped[category], options.showSubcategories);
  } else {
    const orderedCategories = ['database', 'development', 'build', 'monitoring', 'testing', 'docker'];

    // Show top categories with counts
    console.log('\nCOMMAND CATEGORIES\n');
    orderedCategories.forEach(cat => {
      if (grouped[cat]) {
        const categoryName = CATEGORIES[cat] || cat.toUpperCase();
        console.log(`  ${cat.padEnd(12)} → ${categoryName} (${grouped[cat].length} commands)`);
      }
    });
    console.log('');
    console.log('Usage: npm run help <category>');
    console.log('Examples:');
    console.log('  npm run help database');
    console.log('  npm run help docker\n');
  }

  console.log('');
  console.log('Flags:');
  console.log('  --verbose <cmd>      Show detailed info for a command');
  console.log('  --search <query>     Search commands by name/description');
  console.log('  --workflows          List step-by-step tutorials');
  console.log('  --workflow <name>    Show specific tutorial');
  console.log('  --danger             Show dangerous commands only');
  console.log('  --check              Validate help system');
  console.log('');
}

// Verbose mode for single command
function showVerboseCommand(commandName) {
  const script = packageJson.scripts[commandName];

  if (!script) {
    console.error(`\x1b[31mCommand not found: ${commandName}\x1b[0m`);
    process.exit(1);
  }

  const metadata = getCommandMetadata(commandName) || {};

  console.log('');
  console.log('━'.repeat(60));
  console.log(`\x1b[1m${commandName}\x1b[0m`);
  console.log('━'.repeat(60));
  console.log('');

  if (metadata.description) {
    console.log(`\x1b[1mDescription:\x1b[0m`);
    console.log(`  ${metadata.description}\n`);
  }

  if (metadata.category) {
    const catName = CATEGORIES[metadata.category] || metadata.category;
    const subcatName = metadata.subcategory ? ` > ${metadata.subcategory}` : '';
    console.log(`\x1b[1mCategory:\x1b[0m ${catName}${subcatName}\n`);
  }

  console.log(`\x1b[1mScript:\x1b[0m`);
  console.log(`  ${script}\n`);

  if (metadata.duration) {
    console.log(`\x1b[1mDuration:\x1b[0m ~${metadata.duration}\n`);
  }

  if (metadata.when) {
    console.log(`\x1b[1mWhen to use:\x1b[0m`);
    console.log(`  ${metadata.when}\n`);
  }

  if (metadata.danger) {
    console.log(`\x1b[31m\x1b[1m⚠️  DANGER:\x1b[0m`);
    console.log(`  ${metadata.danger}\n`);
  }

  if (metadata.requires && metadata.requires.length > 0) {
    console.log(`\x1b[1mRequires (run first):\x1b[0m`);
    metadata.requires.forEach(r => {
      console.log(`  • npm run ${r}`);
    });
    console.log('');
  }

  if (metadata._generated) {
    console.log(`\x1b[2m📝 Documentation generated from: ${metadata._baseCommand}\x1b[0m\n`);
  }

  if (metadata.cannotRename && metadata.usedInScripts) {
    console.log(`\x1b[33m\x1b[1m🔒 PROTECTED COMMAND:\x1b[0m`);
    console.log(`  Cannot rename - used in deployment scripts:`);
    metadata.usedInScripts.forEach(s => {
      console.log(`    - ${s}`);
    });
    console.log('');
  }

  if (metadata.note) {
    console.log(`\x1b[33m\x1b[1mNote:\x1b[0m`);
    console.log(`  ${metadata.note}\n`);
  }

  if (metadata.related && metadata.related.length > 0) {
    console.log(`\x1b[1mRelated commands:\x1b[0m`);
    metadata.related.forEach(r => {
      console.log(`  - ${r}`);
    });
    console.log('');
  }

  if (metadata.examples && metadata.examples.length > 0) {
    console.log(`\x1b[1mExamples:\x1b[0m`);
    metadata.examples.forEach(ex => {
      console.log(`  ${ex}`);
    });
    console.log('');
  }
}

// Search commands
function searchCommands(query) {
  console.log('');
  console.log(`\x1b[1m🔍 Search results for: "${query}"\x1b[0m`);
  console.log('');

  const results = [];

  for (const [name, script] of Object.entries(packageJson.scripts)) {
    if (name.startsWith('//')) continue;

    const metadata = getCommandMetadata(name) || {};
    const searchText = `${name} ${script} ${metadata.description || ''}`.toLowerCase();

    if (searchText.includes(query.toLowerCase())) {
      results.push({ name, script });
    }
  }

  if (results.length === 0) {
    console.log('  No commands found.');
  } else {
    // Group by category
    const byCategory = {};
    results.forEach(cmd => {
      const cat = getCategory(cmd.name, cmd.script) || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(cmd);
    });

    Object.entries(byCategory).forEach(([cat, cmds]) => {
      const categoryName = CATEGORIES[cat] || cat.toUpperCase();
      console.log(`\x1b[1m${categoryName}\x1b[0m\n`);
      cmds.sort((a, b) => a.name.localeCompare(b.name));
      cmds.forEach(cmd => printCommand(cmd));
    });

    console.log(`\x1b[90mFound ${results.length} command(s)\x1b[0m`);
  }

  console.log('');
}

// Show only dangerous commands
function showDangerousCommands() {
  console.log('');
  console.log('\x1b[1m⚠️  DANGEROUS COMMANDS (Destructive Operations)\x1b[0m');
  console.log('');

  const critical = [];
  const caution = [];

  Object.entries(COMMAND_METADATA).forEach(([name, meta]) => {
    if (meta.danger) {
      const cmd = { name, script: packageJson.scripts[name] };
      if (meta.danger.includes('CRITICAL') || meta.danger.includes('DELETE ALL')) {
        critical.push(cmd);
      } else {
        caution.push(cmd);
      }
    }
  });

  if (critical.length > 0) {
    console.log('\x1b[31m\x1b[1m🔴 CRITICAL DANGER:\x1b[0m\n');
    critical.forEach(cmd => printCommand(cmd));
  }

  if (caution.length > 0) {
    console.log('\x1b[33m\x1b[1m⚠️  USE WITH CAUTION:\x1b[0m\n');
    caution.forEach(cmd => printCommand(cmd));
  }

  if (critical.length === 0 && caution.length === 0) {
    console.log('  No dangerous commands with metadata.');
  }

  console.log('');
}

// Validate help system
function checkHelpSystem() {
  console.log('');
  console.log('\x1b[1m✅ Help System Validation\x1b[0m');
  console.log('');

  const allScripts = Object.keys(packageJson.scripts).filter(k => !k.startsWith('//'));
  const documented = Object.keys(COMMAND_METADATA);
  const coverage = ((documented.length / allScripts.length) * 100).toFixed(1);

  console.log(`\x1b[1m📊 Statistics:\x1b[0m`);
  console.log(`  Total commands: ${allScripts.length}`);
  console.log(`  Documented: ${documented.length} (${coverage}%)`);
  console.log(`  Categories: ${Object.keys(CATEGORIES).length}`);
  console.log('');

  // Protected commands
  const protected_cmds = documented.filter(cmd => COMMAND_METADATA[cmd].cannotRename);
  if (protected_cmds.length > 0) {
    console.log(`\x1b[1m🔒 Protected Commands (hardcoded in scripts):\x1b[0m`);
    protected_cmds.forEach(cmd => {
      const scripts = COMMAND_METADATA[cmd].usedInScripts || [];
      console.log(`  ✓ ${cmd}`);
      scripts.forEach(s => console.log(`    - ${s}`));
    });
    console.log('');
  }

  // Coverage by category
  const grouped = groupScriptsByCategory();
  console.log(`\x1b[1m📈 Coverage by Category:\x1b[0m`);
  Object.entries(grouped).forEach(([cat, cmds]) => {
    const docCount = cmds.filter(c => COMMAND_METADATA[c.name]).length;
    const catCoverage = ((docCount / cmds.length) * 100).toFixed(0);
    const categoryName = CATEGORIES[cat] || cat;
    console.log(`  ${categoryName}: ${docCount}/${cmds.length} (${catCoverage}%)`);
  });
  console.log('');

  // Warnings
  const warnings = [];

  // Check for commands that don't exist in package.json
  documented.forEach(cmd => {
    if (!packageJson.scripts[cmd]) {
      warnings.push(`Metadata exists for non-existent command: ${cmd}`);
    }
  });

  if (warnings.length > 0) {
    console.log(`\x1b[33m\x1b[1m⚠️  Warnings:\x1b[0m`);
    warnings.forEach(w => console.log(`  - ${w}`));
    console.log('');
  }

  console.log(`\x1b[1m💡 Suggestions:\x1b[0m`);
  if (coverage < 20) {
    console.log(`  - Add metadata for more commands (current: ${coverage}%)`);
  }
  console.log(`  - Top undocumented categories need attention`);
  console.log('');
}

// =====================================================================
// WORKFLOW FUNCTIONS
// =====================================================================

// List all available workflows
function listWorkflows() {
  console.log('');
  console.log('\x1b[1;36m📚 WORKFLOWS DISPONIBLES\x1b[0m');
  console.log('\x1b[2m   Guías paso a paso para tareas comunes\x1b[0m');
  console.log('');

  // Group workflows by category
  const byCategory = {};
  for (const [name, workflow] of Object.entries(WORKFLOWS)) {
    const cat = workflow.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ name, ...workflow });
  }

  const categoryOrder = ['development'];
  const categoryNames = {
    development: '🚀 Desarrollo'
  };

  for (const cat of categoryOrder) {
    if (!byCategory[cat]) continue;
    console.log(`  \x1b[1m${categoryNames[cat] || cat}\x1b[0m`);
    for (const wf of byCategory[cat]) {
      const padding = ' '.repeat(Math.max(0, 22 - wf.name.length));
      console.log(`    \x1b[33m${wf.name}\x1b[0m${padding}${wf.description}`);
    }
    console.log('');
  }

  console.log('\x1b[2m  Uso: npm run help -- --workflow <nombre>\x1b[0m');
  console.log('');
}

// Show a specific workflow
function showWorkflow(workflowName) {
  const workflow = WORKFLOWS[workflowName];

  if (!workflow) {
    console.log('');
    console.log(`\x1b[31m❌ Workflow no encontrado: ${workflowName}\x1b[0m`);
    console.log('');
    console.log('Workflows disponibles:');
    for (const name of Object.keys(WORKFLOWS)) {
      console.log(`  - ${name}`);
    }
    console.log('');
    console.log('Uso: npm run help -- --workflow <nombre>');
    console.log('');
    return;
  }

  console.log('');
  console.log(`\x1b[1;36m${workflow.title}\x1b[0m`);
  console.log(`\x1b[2m${workflow.description}\x1b[0m`);
  console.log('');

  // Prerequisites
  if (workflow.prerequisites && workflow.prerequisites.length > 0) {
    console.log('\x1b[1mPrerrequisitos:\x1b[0m');
    for (const prereq of workflow.prerequisites) {
      console.log(`  • ${prereq}`);
    }
    console.log('');
  }

  // Required commands (if any ran before)
  if (workflow.requires && workflow.requires.length > 0) {
    console.log('\x1b[1mRequiere haber ejecutado:\x1b[0m');
    for (const req of workflow.requires) {
      console.log(`  • \x1b[33mnpm run ${req}\x1b[0m`);
    }
    console.log('');
  }

  // Steps
  console.log('\x1b[1mPasos:\x1b[0m');
  console.log('');
  workflow.steps.forEach((step, index) => {
    const stepNum = `  ${index + 1}.`;
    const isManual = step.type === 'manual';

    if (isManual) {
      console.log(`${stepNum} \x1b[2m${step.command}\x1b[0m`);
    } else {
      console.log(`${stepNum} \x1b[33m${step.command}\x1b[0m`);
    }

    if (step.description) {
      console.log(`     → ${step.description}`);
    }
    if (step.duration) {
      console.log(`     \x1b[2m⏱  ${step.duration}\x1b[0m`);
    }
    if (step.warning) {
      console.log(`     \x1b[31m⚠️  ${step.warning}\x1b[0m`);
    }
    console.log('');
  });

  // Tips
  if (workflow.tips && workflow.tips.length > 0) {
    console.log('\x1b[1m💡 Tips:\x1b[0m');
    for (const tip of workflow.tips) {
      console.log(`  • ${tip}`);
    }
    console.log('');
  }

  // Next steps
  if (workflow.nextSteps && workflow.nextSteps.length > 0) {
    console.log('\x1b[1m➡️  Siguientes pasos:\x1b[0m');
    for (const next of workflow.nextSteps) {
      const nextWf = WORKFLOWS[next];
      if (nextWf) {
        console.log(`  • \x1b[33mnpm run help -- --workflow ${next}\x1b[0m - ${nextWf.description}`);
      }
    }
    console.log('');
  }
}

// =====================================================================
// DYNAMIC METADATA GENERATION
// =====================================================================

// Get command metadata (with fallback to base environment pattern)
function getCommandMetadata(commandName) {
  if (COMMAND_METADATA[commandName]) {
    return COMMAND_METADATA[commandName];
  }
  return null;
}

// Parse arguments and flags

// =====================================================================
// RUNBOOKS (disaster recovery / emergencias) — OPT-IN por proyecto:
// se activan solo si existe docs/runbooks/*.md. Convención por archivo:
//   # Título
//   > Cuándo usar: una línea
// =====================================================================
const RUNBOOKS_DIR = path.join(__dirname, '..', 'docs', 'runbooks');

function readRunbooks() {
  if (!fs.existsSync(RUNBOOKS_DIR)) return [];
  return fs.readdirSync(RUNBOOKS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(RUNBOOKS_DIR, f), 'utf8');
      const title = (content.match(/^# (.+)$/m) || [])[1] || f;
      const when = (content.match(/^> Cuándo usar: (.+)$/m) || [])[1] || '';
      return { name: f.replace(/\.md$/, ''), title, when, file: path.join(RUNBOOKS_DIR, f) };
    });
}

function listRunbooks() {
  const runbooks = readRunbooks();
  if (runbooks.length === 0) {
    console.log('\nEste proyecto no tiene runbooks (docs/runbooks/*.md).');
    console.log('Ver docs/DISASTER_RECOVERY.md si existe, o el runbook central del ecosistema.\n');
    return;
  }
  console.log('\n\x1b[1m🆘 RUNBOOKS DE EMERGENCIA / DISASTER RECOVERY\x1b[0m');
  const indexDoc = path.join(__dirname, '..', 'docs', 'DISASTER_RECOVERY.md');
  if (fs.existsSync(indexDoc)) {
    console.log('\x1b[2m(índice y conceptos: docs/DISASTER_RECOVERY.md)\x1b[0m');
  }
  console.log('');
  for (const rb of runbooks) {
    console.log(`  \x1b[1m${rb.name}\x1b[0m`);
    console.log(`      ${rb.when || rb.title}`);
  }
  console.log('\n\x1b[2mUsage: npm run help -- --runbook <nombre>\x1b[0m\n');
}

function showRunbook(name) {
  const rb = readRunbooks().find(r => r.name === name || r.name.startsWith(name));
  if (!rb) {
    console.log(`\nRunbook "${name}" no encontrado.\n`);
    listRunbooks();
    process.exit(1);
  }
  console.log('\n' + fs.readFileSync(rb.file, 'utf8'));
}

const args = process.argv.slice(2);
const flags = {
  verbose: args.includes('--verbose'),
  search: args.includes('--search'),
  danger: args.includes('--danger'),
  check: args.includes('--check'),
  all: args.includes('--all'),
  groups: args.includes('--groups'),
  workflow: args.includes('--workflow'),
  workflows: args.includes('--workflows'),
  runbook: args.includes('--runbook'),
  runbooks: args.includes('--runbooks')
};

// Remove flags from args
const cleanArgs = args.filter(a => !a.startsWith('--'));

// Category aliases for convenience
const CATEGORY_ALIASES = {
  'db': 'database',
  'dev': 'development',
  'test': 'testing',
};

// Main router
if (flags.check) {
  checkHelpSystem();
} else if (flags.runbooks) {
  listRunbooks();
} else if (flags.runbook) {
  cleanArgs.length > 0 ? showRunbook(cleanArgs[0]) : listRunbooks();
} else if (flags.workflows) {
  listWorkflows();
} else if (flags.workflow && cleanArgs.length > 0) {
  showWorkflow(cleanArgs[0]);
} else if (flags.workflow && cleanArgs.length === 0) {
  // --workflow without name shows list
  listWorkflows();
} else if (flags.danger) {
  showDangerousCommands();
} else if (flags.verbose && cleanArgs.length > 0) {
  showVerboseCommand(cleanArgs[0]);
} else if (flags.search && cleanArgs.length > 0) {
  searchCommands(cleanArgs[0]);
} else if (cleanArgs.length === 0) {
  showHelp(null, { skipGettingStarted: flags.all });
  if (readRunbooks().length > 0) {
    console.log('  npm run help -- --runbooks   \x1b[31m🆘 emergencias / disaster recovery\x1b[0m\n');
  }
} else {
  const resolved = CATEGORY_ALIASES[cleanArgs[0]] || cleanArgs[0];
  showHelp(resolved, { showSubcategories: flags.groups });
}
