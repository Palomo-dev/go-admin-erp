/**
 * Código DANE del municipio para cotizar un domicilio (logística Fase 1).
 *
 * El POS y el pedido manual escriben la ciudad a mano («Bogotá»); la zona puede estar definida por
 * municipio DANE. Aquí se traduce: primero el id del municipio (p. ej. el fiscal del cliente),
 * luego el nombre, solo si un único municipio del catálogo `municipalities` se llama así. La regla
 * de comparación es pura (`municipioPorNombre`, presentacionEnvio.ts).
 *
 * Recibe el cliente de quien llama (sesión del usuario en el servidor): `municipalities` es un
 * catálogo de lectura.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { municipioPorNombre, normalizarMunicipio } from '@/lib/logistica/presentacionEnvio';
import { normalizarCodigoDane } from '@/lib/logistica/cotizacion';

/** País del catálogo de municipios con código DANE. */
const PAIS_DANE = 'COL';

export async function resolverMunicipioDane(
  client: SupabaseClient,
  entrada: { municipioId?: string | null; ciudad?: string | null },
): Promise<string | null> {
  if (entrada.municipioId && /^[0-9a-f-]{36}$/i.test(entrada.municipioId)) {
    const { data } = await client.from('municipalities').select('code').eq('id', entrada.municipioId).maybeSingle();
    const codigo = normalizarCodigoDane((data as { code?: string } | null)?.code ?? null);
    if (codigo) return codigo;
  }
  const ciudad = normalizarMunicipio(entrada.ciudad);
  if (ciudad.length < 3) return null;
  // Prefiltro barato por la primera palabra; la comparación exacta la hace la función pura. ILIKE
  // distingue tildes: cada vocal (y la n, por la ñ) pasa a `_`, que acepta «á» o «a».
  const patron = ciudad.split(' ')[0].replace(/[aeioun]/g, '_');
  const { data, error } = await client
    .from('municipalities')
    .select('code, name')
    .eq('country_code', PAIS_DANE)
    .ilike('name', `%${patron}%`)
    .limit(50);
  if (error || !data) return null;
  return normalizarCodigoDane(municipioPorNombre(entrada.ciudad, data as { code: string; name: string }[]));
}
