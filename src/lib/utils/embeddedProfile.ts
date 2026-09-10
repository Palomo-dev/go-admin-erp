/**
 * Utilidades para leer perfiles embebidos de PostgREST.
 *
 * Contexto verificado contra la base (proyecto jgmgphmzusbluqhuqihj):
 *
 * - `organization_members.user_id` tiene DOS claves foráneas: una a
 *   `auth.users` (`organization_members_user_id_fkey`) y otra a `profiles`
 *   (`organization_members_user_id_fkey1`). Como el esquema `auth` no está
 *   expuesto en PostgREST, el embebido `profiles:user_id(...)` NO es ambiguo y
 *   se resuelve igual que `profiles(...)` o que la restricción nombrada.
 *
 * - Ese embebido es a-uno (la FK sale de `organization_members`), así que
 *   PostgREST devuelve un OBJETO, nunca un array. El fallo real que vaciaba las
 *   listas era leerlo como `m.profiles?.[0]`: siempre daba `null` y el nombre
 *   caía al identificador del usuario recortado a 8 caracteres.
 *
 * Estas funciones aceptan objeto o array (por si alguna vista devuelve la
 * forma de a-muchos) y nunca exponen un identificador crudo al usuario.
 */

export interface EmbeddedProfile {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

/** Devuelve el registro embebido, venga como objeto, como array o como null. */
export function pickEmbedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Nombre visible de un perfil embebido: nombre completo, si no el correo, y si
 * no una etiqueta explícita. Nunca el identificador del usuario.
 */
export function profileDisplayName(
  profile: EmbeddedProfile | EmbeddedProfile[] | null | undefined,
  fallback = 'Miembro sin nombre'
): string {
  const p = pickEmbedded(profile);
  if (!p) return fallback;
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return full || p.email || fallback;
}
