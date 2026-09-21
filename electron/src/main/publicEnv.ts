import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Variables públicas del proceso main (auditoría desktop §4.5).
 *
 * Antes `constants.ts` llevaba la URL y la anon key de Supabase cableadas en
 * el asar: la app quedaba clavada a un proyecto y rotar la clave obligaba a
 * publicar un release. Ahora se leen, en este orden:
 *
 *   1. Variables de entorno del proceso (`NEXT_PUBLIC_SUPABASE_URL` o
 *      `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `SUPABASE_ANON_KEY`,
 *      `NEXT_PUBLIC_SENTRY_DSN` o `SENTRY_DSN`). Sirven para forzar valores en
 *      desarrollo o en una instalación concreta.
 *   2. `resources/web/.env`: el archivo que escribe `scripts/build-web.js` con
 *      la allow-list de claves `NEXT_PUBLIC_*` y que viaja en el instalador
 *      junto al build standalone de Next (fase 3). Es la misma fuente que usa
 *      el servidor embebido, así que la web y el agente hablan siempre con el
 *      mismo proyecto de Supabase.
 *   3. Solo sin empaquetar: `.env` y `.env.local` de la raíz del repositorio.
 *
 * Sin valores no se lanza: cada consumidor decide (el agente de impresión no
 * arranca y lo dice en el log; la comprobación de conectividad se hace contra
 * la web; Sentry queda desactivado). La app sigue abriendo la web.
 *
 * Nunca se escriben los valores en el log: solo qué claves faltan y de dónde
 * se leyeron.
 */

export interface PublicEnv {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  sentryDsn: string | null;
  /** Descripción de la fuente, para el log (`entorno`, ruta del .env, `ninguna`). */
  source: string;
}

/** Solo estas claves pasan de un .env a la app (y al servidor Next embebido). */
export const PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC_';

let cached: PublicEnv | null = null;

/**
 * Parser mínimo de .env (KEY=VALUE, comillas simples o dobles, comentarios con
 * #). Devuelve solo las claves `NEXT_PUBLIC_*`: aunque `build-web.js` ya
 * aplica la allow-list al construir, se repite aquí por si el archivo se
 * editara a mano en una instalación.
 */
export function parsePublicEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key.startsWith(PUBLIC_ENV_PREFIX)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Lee un .env del disco y devuelve sus claves públicas; `null` si no existe. */
export function readPublicEnvFile(file: string): Record<string, string> | null {
  try {
    return parsePublicEnv(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Carpeta con el build standalone de la web (server.js, .env...). */
export function getWebRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'web');
  // dist/main → electron/resources/web
  return path.join(__dirname, '..', '..', 'resources', 'web');
}

/** Ruta del .env empaquetado con la web. */
export function getPackagedEnvPath(): string {
  return path.join(getWebRoot(), '.env');
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

function fromRecord(rec: Record<string, string | undefined>): Omit<PublicEnv, 'source'> {
  return {
    supabaseUrl: firstNonEmpty(rec.NEXT_PUBLIC_SUPABASE_URL, rec.SUPABASE_URL),
    supabaseAnonKey: firstNonEmpty(rec.NEXT_PUBLIC_SUPABASE_ANON_KEY, rec.SUPABASE_ANON_KEY),
    sentryDsn: firstNonEmpty(rec.NEXT_PUBLIC_SENTRY_DSN, rec.SENTRY_DSN),
  };
}

function isComplete(env: Omit<PublicEnv, 'source'>): boolean {
  return !!(env.supabaseUrl && env.supabaseAnonKey);
}

/** Candidatos de .env en orden de prioridad (el primero completo gana). */
function envFileCandidates(): string[] {
  const files = [getPackagedEnvPath()];
  if (!app.isPackaged) {
    // dist/main → raíz del repositorio. `.env.local` pisa a `.env`, como en Next.
    const repoRoot = path.join(__dirname, '..', '..', '..');
    files.push(path.join(repoRoot, '.env.local'), path.join(repoRoot, '.env'));
  }
  return files;
}

/**
 * Resuelve las variables públicas una sola vez por proceso. Las variables de
 * entorno ganan clave a clave; lo que falte se completa con el primer .env que
 * las tenga.
 */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const fromProcess = fromRecord(process.env);
  let merged: Omit<PublicEnv, 'source'> = { ...fromProcess };
  const sources: string[] = [];
  if (fromProcess.supabaseUrl || fromProcess.supabaseAnonKey || fromProcess.sentryDsn) sources.push('entorno');

  for (const file of envFileCandidates()) {
    if (isComplete(merged) && merged.sentryDsn) break;
    const rec = readPublicEnvFile(file);
    if (!rec) continue;
    const fromFile = fromRecord(rec);
    const before = merged;
    merged = {
      supabaseUrl: merged.supabaseUrl ?? fromFile.supabaseUrl,
      supabaseAnonKey: merged.supabaseAnonKey ?? fromFile.supabaseAnonKey,
      sentryDsn: merged.sentryDsn ?? fromFile.sentryDsn,
    };
    if (
      merged.supabaseUrl !== before.supabaseUrl ||
      merged.supabaseAnonKey !== before.supabaseAnonKey ||
      merged.sentryDsn !== before.sentryDsn
    ) {
      sources.push(file);
    }
  }

  cached = { ...merged, source: sources.length ? sources.join(' + ') : 'ninguna' };

  const missing: string[] = [];
  if (!cached.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!cached.supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length) {
    console.error(
      `[publicEnv] Faltan ${missing.join(' y ')} (fuentes revisadas: ${envFileCandidates().join(', ')}). ` +
        'El agente de impresión no podrá arrancar; la web abre igual.'
    );
  } else {
    console.log(`[publicEnv] Variables públicas leídas de: ${cached.source}${cached.sentryDsn ? '' : ' (sin NEXT_PUBLIC_SENTRY_DSN: Sentry desactivado)'}`);
  }
  return cached;
}

/** Error específico para que los consumidores lo distingan de un fallo de red o de sesión. */
export class PublicEnvMissingError extends Error {
  constructor(what: string) {
    super(
      `Faltan variables públicas (${what}). Revisa resources/web/.env en la instalación ` +
        'o define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.'
    );
    this.name = 'PublicEnvMissingError';
  }
}

/** URL y anon key de Supabase, o lanza `PublicEnvMissingError`. */
export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const env = getPublicEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new PublicEnvMissingError(
      [!env.supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL', !env.supabaseAnonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
        .filter(Boolean)
        .join(', ')
    );
  }
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };
}
