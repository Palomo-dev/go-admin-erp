/**
 * Regla dura 5 (CLAUDE.md): la organización sale de la sesión, nunca del body.
 *
 * Una sola decisión para todas las rutas que reciben un body o un query con
 * `organization_id`. Nació en `voiceLibrary.ts` (rediseño de Voces, r4); F10
 * la importaba desde allí y F13 r2 la movió aquí sin cambiar el contrato.
 * `voiceLibrary.ts` la reexporta, así que Voces y F10 siguen importando lo mismo.
 *
 * Devuelve el valor ajeno cuando el body (JSON, campo multipart o query)
 * declara OTRA organización, para que la ruta responda 403 y lo registre.
 * Ausente, vacío o la misma organización → `null` (no es un ataque; el valor
 * nunca se usa: la organización efectiva es siempre la de la sesión).
 */
export function foreignOrganizationInBody(claimed: unknown, sessionOrg: number): unknown | null {
  if (claimed == null || String(claimed).trim() === '') return null;
  return Number(claimed) === sessionOrg ? null : claimed;
}
