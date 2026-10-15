#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting fast build with esbuild...');

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Common options
const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  keepNames: true,
  // Lo que NO se bundlea: primero los nativos y runtimes pesados del framework,
  // después lo que el proyecto haya declarado en su hkconfig (bundleExternals).
  // Un paquete con binario propio (.node) rompe el build entero si entra acá.
  external: [
    '@prisma/client',
    'prisma',
    'bcrypt',
    'sharp',
    'canvas',
    'bufferutil',
    'utf-8-validate',
    'cpu-features',
    'nodemailer',
    '@apollo/server',
    'graphql',
    'graphql-upload-minimal',
    'express',
    'tsyringe',
    'reflect-metadata',
    'pino',
    'pino-pretty',
    'fsevents',
    'playwright',
    'playwright-core',
    'onnxruntime-node',
    '@xenova/transformers',
    '@gutenye/ocr-node',
  ],
  loader: {
    '.graphql': 'text',
    '.sql': 'text',
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

async function build() {
  try {
    // Build server
    console.log('📦 Building server.js...');
    await esbuild.build({
      ...commonOptions,
      entryPoints: ['./src/server.ts'],
      outfile: './dist/server.js',
    });

    // Build worker if exists
    const workerPath = './src/workers/worker.ts';
    if (fs.existsSync(workerPath)) {
      console.log('📦 Building worker.js...');
      await esbuild.build({
        ...commonOptions,
        entryPoints: [workerPath],
        outfile: './dist/workers/worker.js',
      });
    }

    // Build pipeline services as separate modules (for dynamic imports)
    console.log('🔧 Building pipeline services...');
    const pipelinesDir = './src/pipelines';
    if (fs.existsSync(pipelinesDir)) {
      const pipelines = fs.readdirSync(pipelinesDir, { withFileTypes: true });
      let pipelineCount = 0;

      for (const pipeline of pipelines) {
        if (pipeline.isDirectory()) {
          const servicePath = `${pipelinesDir}/${pipeline.name}/${pipeline.name}Service.ts`;
          if (fs.existsSync(servicePath)) {
            const outDir = `./dist/pipelines/${pipeline.name}`;
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }

            await esbuild.build({
              ...commonOptions,
              entryPoints: [servicePath],
              outfile: `${outDir}/${pipeline.name}Service.js`,
            });
            console.log(`  Built: ${pipeline.name}Service.js`);
            pipelineCount++;
          }
        }
      }

      if (pipelineCount > 0) {
        console.log(`  ✅ Built ${pipelineCount} pipeline services`);
      } else {
        console.log('  ℹ️  No pipeline services found');
      }
    }

    // Build workflow services as separate modules (for dynamic imports)
    console.log('🔧 Building workflow services...');
    const workflowsDir = './src/workflows';
    if (fs.existsSync(workflowsDir)) {
      const workflows = fs.readdirSync(workflowsDir, { withFileTypes: true });
      let workflowCount = 0;

      for (const workflow of workflows) {
        if (workflow.isDirectory()) {
          const servicePath = `${workflowsDir}/${workflow.name}/${workflow.name}Service.ts`;
          if (fs.existsSync(servicePath)) {
            const outDir = `./dist/workflows/${workflow.name}`;
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }

            await esbuild.build({
              ...commonOptions,
              entryPoints: [servicePath],
              outfile: `${outDir}/${workflow.name}Service.js`,
            });
            console.log(`  Built: ${workflow.name}Service.js`);
            workflowCount++;
          }
        }
      }

      if (workflowCount > 0) {
        console.log(`  ✅ Built ${workflowCount} workflow services`);
      } else {
        console.log('  ℹ️  No workflow services found');
      }
    }

    // Build seed files with special configuration
    console.log('🌱 Building seed files...');
    const seedDir = './src/prisma/seed';
    if (fs.existsSync(seedDir)) {
      // Ensure output directory exists
      const seedOutDir = './dist/prisma/seed';
      if (!fs.existsSync(seedOutDir)) {
        fs.mkdirSync(seedOutDir, { recursive: true });
      }
      
      // Build main seed.ts with bundling
      const mainSeedPath = './src/prisma/seed/seed.ts';
      if (fs.existsSync(mainSeedPath)) {
        console.log('  Building main seed.ts with dependencies...');
        await esbuild.build({
          ...commonOptions,
          bundle: true,  // Bundle to include all internal dependencies
          entryPoints: [mainSeedPath],
          outfile: './dist/prisma/seed/seed.js',
          // Minimal externals - only real npm packages, not internal modules
          external: [
            '@prisma/client',
            'prisma',
            'bcrypt',
            'nodemailer',
            '@sendgrid/mail',
            'tsyringe',
            'reflect-metadata',
            // Remove internal path imports from external list
          ],
        });
      }
      
      // Build seed-cli separately if needed
      const seedCliPath = './src/prisma/seed/seed-cli.ts';
      if (fs.existsSync(seedCliPath)) {
        console.log('  Building seed-cli.ts...');
        await esbuild.build({
          ...commonOptions,
          bundle: true,
          entryPoints: [seedCliPath],
          outfile: './dist/prisma/seed/seed-cli.js',
          external: [
            '@prisma/client',
            'prisma',
            'bcrypt',
            'nodemailer',
            '@sendgrid/mail',
            'tsyringe',
            'reflect-metadata',
          ],
        });
      }
      
      console.log('  ✅ Seed files built successfully');
    } else {
      console.log('  ⚠️  No seed directory found');
    }

    // Las credenciales de integración se emiten desde la consola del contenedor,
    // y la imagen solo trae dist/.
    const integrationCliPath = './src/admin/integrationCli.ts';
    if (fs.existsSync(integrationCliPath)) {
      console.log('🔑 Building admin/integrationCli.ts...');
      await esbuild.build({
        ...commonOptions,
        entryPoints: [integrationCliPath],
        outfile: './dist/admin/integrationCli.js',
      });
    }

    // Copy GraphQL files (needed for readFileSync at runtime)
    console.log('📄 Copying GraphQL files...');
    const copyGraphQLFiles = (srcDir, destDir) => {
      if (!fs.existsSync(srcDir)) return;
      
      const files = fs.readdirSync(srcDir, { withFileTypes: true });
      
      for (const file of files) {
        const srcPath = path.join(srcDir, file.name);
        const destPath = path.join(destDir, file.name);
        
        if (file.isDirectory()) {
          // Recursively copy subdirectories
          copyGraphQLFiles(srcPath, destPath);
        } else if (file.name.endsWith('.graphql')) {
          // Ensure destination directory exists
          const destDirPath = path.dirname(destPath);
          if (!fs.existsSync(destDirPath)) {
            fs.mkdirSync(destDirPath, { recursive: true });
          }
          
          // Copy the .graphql file
          fs.copyFileSync(srcPath, destPath);
          console.log(`  Copied: ${file.name} -> ${destPath.replace(__dirname, '.')}`);
        }
      }
    };
    
    // Copy all GraphQL files from src to dist
    copyGraphQLFiles('./src', './dist');
    console.log('  ✅ GraphQL files copied');

    // Fix GraphQL paths for bundled code (esbuild changes __dirname context)
    console.log('🔧 Fixing GraphQL paths for bundled code...');
    const fixGraphQLPaths = () => {
      const fixes = [
        // Common GraphQL file
        {
          from: './dist/common/schemas/common.graphql',
          to: './dist/common.graphql'
        }
      ];
      
      // Auto-detect and add entity GraphQL files
      if (fs.existsSync('./dist/entities')) {
        const entities = fs.readdirSync('./dist/entities', { withFileTypes: true });
        entities.forEach(entity => {
          if (entity.isDirectory()) {
            const graphqlFile = `${entity.name}.graphql`;
            const sourcePath = `./dist/entities/${entity.name}/schemas/${graphqlFile}`;
            if (fs.existsSync(sourcePath)) {
              fixes.push({
                from: sourcePath,
                to: `./dist/${graphqlFile}`
              });
            }
          }
        });
      }
      
      // Handle pipelines (e.g., editionGenerateDraft)
      if (fs.existsSync('./dist/pipelines')) {
        const pipelines = fs.readdirSync('./dist/pipelines', { withFileTypes: true });
        pipelines.forEach(pipeline => {
          if (pipeline.isDirectory()) {
            const graphqlFile = `${pipeline.name}.graphql`;
            const sourcePath = `./dist/pipelines/${pipeline.name}/${graphqlFile}`;
            if (fs.existsSync(sourcePath)) {
              // Pipelines need their directory structure preserved
              const targetDir = `./dist/${pipeline.name}`;
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              fixes.push({
                from: sourcePath,
                to: `${targetDir}/${graphqlFile}`
              });
            }
          }
        });
      }
      
      // Handle workflows
      if (fs.existsSync('./dist/workflows')) {
        const workflows = fs.readdirSync('./dist/workflows', { withFileTypes: true });
        workflows.forEach(workflow => {
          if (workflow.isDirectory()) {
            const graphqlFile = `${workflow.name}.graphql`;
            const sourcePath = `./dist/workflows/${workflow.name}/${graphqlFile}`;
            if (fs.existsSync(sourcePath)) {
              // Workflows need their directory structure preserved
              const targetDir = `./dist/${workflow.name}`;
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              fixes.push({
                from: sourcePath,
                to: `${targetDir}/${graphqlFile}`
              });
            }
          }
        });
      }

      // Copy satellite resolver GraphQL files from src (esbuild doesn't copy non-code files)
      const satelliteGraphqlSrcDir = './src/satellite/resolvers';
      if (fs.existsSync(satelliteGraphqlSrcDir)) {
        fs.readdirSync(satelliteGraphqlSrcDir).forEach(file => {
          if (file.endsWith('.graphql')) {
            fixes.push({
              from: `${satelliteGraphqlSrcDir}/${file}`,
              to: `./dist/${file}`
            });
          }
        });
      }

      // Copy satellite proto files from src (esbuild doesn't copy non-code files)
      const satelliteProtoSrcDir = './src/satellite/proto';
      if (fs.existsSync(satelliteProtoSrcDir)) {
        const protoTargetDir = './dist/proto';
        if (!fs.existsSync(protoTargetDir)) {
          fs.mkdirSync(protoTargetDir, { recursive: true });
        }
        fs.readdirSync(satelliteProtoSrcDir).forEach(file => {
          if (file.endsWith('.proto')) {
            fixes.push({
              from: `${satelliteProtoSrcDir}/${file}`,
              to: `${protoTargetDir}/${file}`
            });
          }
        });
      }

      // Copy services GraphQL files (e.g., aiSearch)
      const findServicesGraphQL = (dir) => {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir, { withFileTypes: true }).forEach(item => {
          const itemPath = `${dir}/${item.name}`;
          if (item.isDirectory()) {
            findServicesGraphQL(itemPath);
          } else if (item.name.endsWith('.graphql')) {
            fixes.push({
              from: itemPath.replace('./src/', './dist/'),
              to: `./dist/${item.name}`
            });
          }
        });
      };
      findServicesGraphQL('./src/services');

      // Copy seed data files (countries.json, states.json)
      const seedDataSrcDir = './src/prisma/seed/data';
      if (fs.existsSync(seedDataSrcDir)) {
        const seedDataTargetDir = './dist/prisma/seed/data';
        if (!fs.existsSync(seedDataTargetDir)) {
          fs.mkdirSync(seedDataTargetDir, { recursive: true });
        }
        fs.readdirSync(seedDataSrcDir).forEach(file => {
          if (file.endsWith('.json')) {
            fixes.push({
              from: `${seedDataSrcDir}/${file}`,
              to: `${seedDataTargetDir}/${file}`
            });
          }
        });
      }

      // Apply all fixes
      let fixCount = 0;
      fixes.forEach(({ from, to }) => {
        if (fs.existsSync(from)) {
          fs.copyFileSync(from, to);
          console.log(`  ✓ Fixed: ${path.basename(to)}`);
          fixCount++;
          // Espejo para el bundle del WORKER (__dirname = dist/workers): el
          // worker arrastra pipelines/workflows vía resolvers y resuelve los
          // mismos assets relativos bajo dist/workers/.
          if (to.startsWith('./dist/') && !to.startsWith('./dist/workers/')) {
            const workerTo = './dist/workers/' + to.slice('./dist/'.length);
            const workerDir = path.dirname(workerTo);
            if (!fs.existsSync(workerDir)) {
              fs.mkdirSync(workerDir, { recursive: true });
            }
            fs.copyFileSync(from, workerTo);
          }
        }
      });
      
      if (fixCount > 0) {
        console.log(`  ✅ Fixed ${fixCount} GraphQL file paths for bundled code`);
      } else {
        console.log('  ℹ️  No GraphQL path fixes needed');
      }
    };
    
    fixGraphQLPaths();

    // Copy paljs DMMF to every bundle output directory.
    // esbuild rewrites __dirname to the output dir of each bundle, so
    // readFileSync(join(__dirname, 'dmmf.json')) resolves relative to each .js file.
    const dmmfSrc = './src/paljs-generated/dmmf/dmmf.json';
    if (fs.existsSync(dmmfSrc)) {
      const dmmfTargets = ['./dist'];
      // Worker bundle lives in dist/workers/
      if (fs.existsSync('./dist/workers')) {
        dmmfTargets.push('./dist/workers');
      }
      // Pipeline bundles live in dist/pipelines/<name>/
      if (fs.existsSync('./dist/pipelines')) {
        fs.readdirSync('./dist/pipelines', { withFileTypes: true })
          .filter(d => d.isDirectory())
          .forEach(d => dmmfTargets.push(`./dist/pipelines/${d.name}`));
      }
      // Workflow bundles live in dist/workflows/<name>/
      if (fs.existsSync('./dist/workflows')) {
        fs.readdirSync('./dist/workflows', { withFileTypes: true })
          .filter(d => d.isDirectory())
          .forEach(d => dmmfTargets.push(`./dist/workflows/${d.name}`));
      }
      for (const target of dmmfTargets) {
        fs.copyFileSync(dmmfSrc, path.join(target, 'dmmf.json'));
      }
      console.log(`📁 Copied paljs dmmf.json → ${dmmfTargets.length} bundle directories`);
    }

    // Copy Prisma client
    console.log('📁 Copying Prisma client...');
    const prismaSrc = './src/prisma/generated-client';
    const prismaDest = './dist/prisma/generated-client';
    if (fs.existsSync(prismaSrc)) {
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(file => {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        });
      };
      copyDir(prismaSrc, prismaDest);
    }

    // Copy frontend assets if they exist
    if (fs.existsSync('./frontend')) {
      console.log('🎨 Copying frontend assets...');
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(file => {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        });
      };
      copyDir('./frontend', './dist/frontend');
    }

    // Copy API docs if they exist
    if (fs.existsSync('./public')) {
      console.log('📚 Copying API documentation...');
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(file => {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        });
      };
      copyDir('./public', './dist/frontend/api-doc');
    }

    // Copy all assets from src/**/assets/**/* to dist (preserving structure)
    console.log('📦 Copying src assets...');
    const copyAssets = (srcDir, destDir) => {
      if (!fs.existsSync(srcDir)) return;

      const files = fs.readdirSync(srcDir, { withFileTypes: true });

      for (const file of files) {
        const srcPath = path.join(srcDir, file.name);
        const destPath = path.join(destDir, file.name);

        if (file.isDirectory()) {
          if (file.name === 'assets') {
            // Found an assets directory - copy it entirely
            console.log(`  Found assets at: ${srcPath.replace(__dirname, '.')}`);
            if (!fs.existsSync(destPath)) {
              fs.mkdirSync(destPath, { recursive: true });
            }
            const copyDir = (src, dest) => {
              fs.readdirSync(src).forEach(f => {
                const s = path.join(src, f);
                const d = path.join(dest, f);
                if (fs.statSync(s).isDirectory()) {
                  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
                  copyDir(s, d);
                } else {
                  fs.copyFileSync(s, d);
                  console.log(`    Copied: ${f}`);
                }
              });
            };
            copyDir(srcPath, destPath);
          } else {
            // Recursively search for assets in subdirectories
            copyAssets(srcPath, destPath);
          }
        }
      }
    };

    copyAssets('./src', './dist');
    console.log('  ✅ Assets copied');

    console.log('✅ Build completed successfully!');
    console.log(`⏱️  Total time: ${process.uptime().toFixed(2)}s`);
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();
