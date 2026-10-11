import { PrismaClient } from "../generated-client/client";
import fs from 'fs';
import path from 'path';

// Interfaces JSON
interface Translations {
  es?: string;
  pt?: string;
  en?: string;
  [key: string]: string | undefined;
}

interface CountrySource {
  id: number;
  name: string; // "Argentina"
  iso2: string;
  iso3: string;
  phone_code: string;
  currency: string;
  region: string;
  subregion: string;
  emoji: string;
  translations?: Translations;
}

interface StateSource {
  id: number;
  name: string;
  iso2: string;
  country_code: string; // "AR"
  translations?: Translations;
}

interface DemonymSource {
  es: string | null;
  pt: string | null;
  en: string | null;
}

/**
 * Siembra países y provincias para los proyectos que declaran esos modelos.
 *
 * El contrato, para todo proyecto que los declare (jupiter lo hace en
 * system/tenant.haiku):
 *   Country:       name y demonym multilenguaje (es/en/pt), code, currency.
 *   ProvinceState: name multilenguaje, compuesto con country.
 * Uno solo para todos: un proyecto que declare países con otra forma se
 * adecua al contrato, no el seed a cada proyecto.
 */
export async function seedCountriesAndStates(prisma: PrismaClient) {
  // Los modelos se usan sin tipos: un proyecto que no los declara igual tiene
  // que compilar este archivo.
  const db = prisma as any;

  // Los modelos Country/ProvinceState son parte del contrato opcional de
  // tenant (jupiter los declara en system/tenant.haiku); si el proyecto no los
  // declara, este módulo no tiene dónde sembrar. El control miraba `state`, un
  // modelo que no existe: con eso el seed salía acá y no sembraba nada.
  if (!db.country || !db.provinceState) {
    console.log('⏭️  Countries/States: modelos no declarados en este proyecto, se omite');
    return;
  }

  console.log('🌱 Seeding Countries and Provinces (Multi-lang)...');

  const countriesPath = path.join(__dirname, 'data/countries.json');
  const statesPath = path.join(__dirname, 'data/states.json');

  if (!fs.existsSync(countriesPath) || !fs.existsSync(statesPath)) {
    console.error(`❌ Archivos no encontrados en data/`);
    return;
  }

  const countriesData: CountrySource[] = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));
  const statesData: StateSource[] = JSON.parse(fs.readFileSync(statesPath, 'utf-8'));

  // Gentilicios por código ISO, en un archivo aparte para no tocar el dataset
  // de países. En castellano y portugués van en femenino porque concuerdan con
  // «nacionalidad»/«nacionalidade»: «de nacionalidad argentina».
  //   es: anexo de gentilicios de la RAE (DPD) · pt: lista de gentílicos,
  //   femenino derivado y revisado · en: campo nationality del dataset.
  const demonymsPath = path.join(__dirname, 'data/countryDemonyms.json');
  const demonyms: Record<string, DemonymSource> =
    fs.existsSync(demonymsPath) ? JSON.parse(fs.readFileSync(demonymsPath, 'utf-8')) : {};

  // Mapa para conectar estados con paises: ISO2 ("AR") -> Country ID ("Argentina")
  const countryIsoToIdMap = new Map<string, string>();

  // Campos comunes para audit trail
  const auditFields = {
    createdAt_: new Date(),
    version_: "0",
    createdBy_: { connect: { id: "SYSADMIN" } },
  };

  // 1. Países
  console.log(`🌎 Procesando ${countriesData.length} países...`);

  for (const country of countriesData) {
    const countryCode = country.iso2;
    const nombre = {
      name_en: country.name,
      name_es: country.translations?.es || country.name,
      name_pt: country.translations?.pt || country.name,
    };
    const gentilicio = {
      demonym_es: demonyms[countryCode]?.es ?? null,
      demonym_pt: demonyms[countryCode]?.pt ?? null,
      demonym_en: demonyms[countryCode]?.en ?? null,
    };

    try {
      // Upsert por code (unique) para evitar duplicados; en los que ya existen
      // actualiza nombre y gentilicio, que pueden haber mejorado en los datos.
      const upserted = await db.country.upsert({
        where: { code: countryCode },
        update: {
          currency: country.currency,
          ...nombre,
          ...gentilicio,
        },
        create: {
          id: country.name,
          ...nombre,
          code: countryCode,
          currency: country.currency,
          ...gentilicio,
          ...auditFields,
        },
      });
      // Usar el ID real del país (puede ser en español si ya existía)
      countryIsoToIdMap.set(countryCode, upserted.id);
    } catch (e) {
      console.error(`Error processing country ${country.name}`, e);
    }
  }

  // 2. Provincias / Estados
  console.log(`📍 Procesando ${statesData.length} estados...`);
  let statesCount = 0;

  for (const state of statesData) {
    const countryId = countryIsoToIdMap.get(state.country_code);

    if (!countryId) continue; // Si no hay país padre, ignoramos

    // Nombre original en inglés (o nativo del json)
    const originalName = state.name;

    const stateInput = {
      name_en: originalName,
      name_es: state.translations?.es || originalName,
      name_pt: state.translations?.pt || originalName,
    };

    try {
      // El unique constraint es @@unique([country_id, name_es])
      const name_es = state.translations?.es || originalName;
      await db.provinceState.upsert({
        where: {
          country_id_name_es: {
            country_id: countryId,
            name_es: name_es
          }
        },
        update: stateInput,
        create: {
          ...stateInput,
          country: {
            connect: { id: countryId }
          },
          ...auditFields,
        },
      });

      statesCount++;
      if (statesCount % 2000 === 0) process.stdout.write('.');
    } catch (e) {
      // Silenciamos errores individuales para continuar con el seed
    }
  }

  console.log(`\n✅ Seed completo: ${statesCount} estados importados.`);
}
