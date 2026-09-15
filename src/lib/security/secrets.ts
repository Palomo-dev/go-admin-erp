/**
 * Secretos de plataforma: un solo criterio de «secreto real» para toda la
 * capa `src/lib/security/` (F0-SEC r2, cierra el crítico 1 del qa-reviewer r1
 * y el gemelo «Secretos de relleno aceptados como buenos» de PROGRESS 2026-09-10).
 *
 * Un secreto de relleno (`your-…`, `changeme`, el literal de `.env.example`)
 * es PEOR que uno ausente: ausente falla cerrado y se ve; relleno firma con
 * una clave publicada en un repositorio público y no se ve. Por eso aquí un
 * relleno se trata exactamente igual que «no configurado»: 401 y registro.
 *
 * Tres niveles, según lo que tenga el llamador:
 *  - `isRealSecret(value, min)`       → boolean, para valores ya en mano
 *    (app_secret de un canal, token de subcuenta, secreto pasado por parámetro).
 *  - `readRealSecret(name, opts)`     → `string | null`, lee `process.env[name]`
 *    y devuelve null si falta, es relleno o es corto. Registra el motivo una
 *    sola vez por proceso y variable.
 *  - `requireRealSecret(name, opts)`  → `string`, igual pero lanza
 *    `WebhookError(401, '<name>_not_configured')`.
 *
 * El código de error hacia fuera es el mismo para «falta», «relleno» y «corto»
 * (`<name>_not_configured`): el motivo exacto va al log del servidor, no al
 * cliente. Distinguirlo en la respuesta solo le diría a un tercero que el
 * despliegue está mal configurado.
 *
 * Sin dependencias de Next.js: importable desde ws-server.ts.
 */

import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';
import { WebhookError } from './errors';

/** Longitud mínima por defecto. Los secretos reales del sistema (Twilio, Meta, `openssl rand`) tienen 32+. */
export const DEFAULT_MIN_SECRET_LENGTH = 16;

export type SecretProblem = 'missing' | 'placeholder' | 'too_short';

export interface RealSecretOptions {
  /** Longitud mínima (default 16). */
  min?: number;
  /** Otras variables que valen como alias (se prueban en orden si la principal falla). */
  aliases?: string[];
}

/**
 * Por qué un valor NO sirve como secreto, o `null` si sirve.
 * `min` acotado a >= 1: un mínimo 0 o negativo no puede desactivar la comprobación.
 */
export function secretProblem(value: unknown, min: number = DEFAULT_MIN_SECRET_LENGTH): SecretProblem | null {
  if (typeof value !== 'string' || value.trim() === '') return 'missing';
  if (isPlaceholderCredential(value)) return 'placeholder';
  const effectiveMin = Number.isFinite(min) && min >= 1 ? Math.floor(min) : DEFAULT_MIN_SECRET_LENGTH;
  if (value.trim().length < effectiveMin) return 'too_short';
  return null;
}

/** `true` solo si el valor es una cadena no vacía, no es relleno y alcanza la longitud mínima. */
export function isRealSecret(value: unknown, min: number = DEFAULT_MIN_SECRET_LENGTH): value is string {
  return secretProblem(value, min) === null;
}

const reported = new Set<string>();

/**
 * Registra el motivo de rechazo una sola vez por proceso y variable, para que
 * un cron que llega cada minuto no llene el log pero el problema sí se vea.
 * Nunca imprime el valor.
 */
function reportOnce(name: string, problem: SecretProblem): void {
  const key = `${name}:${problem}`;
  if (reported.has(key)) return;
  reported.add(key);
  const detail =
    problem === 'missing'
      ? 'no está definida'
      : problem === 'placeholder'
        ? 'tiene un valor de relleno (copiado de .env.example o similar)'
        : 'es demasiado corta';
  console.error(`[security/secrets] ${name} ${detail}: se rechaza todo lo que dependa de ella (fail-closed)`);
}

/** Solo para tests: vuelve a permitir que se registre cada motivo. */
export function _resetSecretReports(): void {
  reported.clear();
}

/**
 * Lee `process.env[name]` (y sus alias) y devuelve el valor solo si es un
 * secreto real (tal cual, sin recortar: la comparación de firmas debe usar el
 * mismo valor que el proveedor). `null` si falta, es relleno o es corto.
 */
export function readRealSecret(name: string, opts: RealSecretOptions = {}): string | null {
  const candidates = [name, ...(opts.aliases ?? [])];
  let firstProblem: SecretProblem = 'missing';
  for (const envName of candidates) {
    const raw = process.env[envName];
    const problem = secretProblem(raw, opts.min);
    if (problem === null) return raw as string;
    // Un alias ausente no tapa el motivo real de la principal.
    if (envName === name || (firstProblem === 'missing' && problem !== 'missing')) firstProblem = problem;
  }
  reportOnce(name, firstProblem);
  return null;
}

/**
 * Como `readRealSecret` pero lanza `WebhookError(status, '<name>_not_configured')`
 * (status 401 por defecto) cuando no hay un secreto real.
 */
export function requireRealSecret(name: string, opts: RealSecretOptions & { status?: 401 | 403; code?: string } = {}): string {
  const value = readRealSecret(name, opts);
  if (value !== null) return value;
  throw new WebhookError(opts.status ?? 401, opts.code ?? `${name.toLowerCase()}_not_configured`, `${name} no configurado o de relleno`);
}

/**
 * Valida un secreto que NO viene de `process.env` (app_secret de un canal en
 * `channel_credentials`, token de subcuenta en `comm_settings`, secreto pasado
 * por parámetro). Devuelve el valor o lanza `WebhookError`.
 */
export function assertRealSecret(
  value: unknown,
  label: string,
  opts: { min?: number; status?: 401 | 403; code?: string } = {}
): string {
  const problem = secretProblem(value, opts.min);
  if (problem === null) return value as string;
  reportOnce(label, problem);
  throw new WebhookError(opts.status ?? 401, opts.code ?? `${label.toLowerCase()}_not_configured`, `${label} no configurado o de relleno`);
}
