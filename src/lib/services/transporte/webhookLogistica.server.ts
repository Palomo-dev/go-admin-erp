/**
 * Avisos (webhooks) de transportadoras, Effi y Dropi: una URL por conexión, es decir, única por
 * organización y proveedor: /api/integrations/logistica/<proveedor>/webhook/<connectionId>.
 *
 * Cerrado por defecto: un aviso solo se procesa si el adaptador del proveedor implementa
 * `parseWebhook` con la verificación de firma de su documentación oficial. Hoy ninguno la tiene
 * (Coordinadora y Servientrega no publican avisos; Envía Colvanes, Interrapidísimo, Effi y Dropi
 * no tienen doc), así que la URL responde 501 sin leer el cuerpo ni tocar la base. La organización
 * sale siempre de la conexión, nunca del payload.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { entradaRegistro } from '@/lib/integrations/core/registro';

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VeredictoWebhook =
  | { aceptado: false; status: 404 | 501; codigo: 'NO_ENCONTRADO' | 'AVISOS_NO_HABILITADOS'; mensaje: string };

/**
 * Puerta del webhook: resuelve la conexión y decide, sin procesar nada, si el aviso se puede
 * aceptar. Mientras ningún adaptador verifique firmas, siempre rechaza (fail-closed).
 */
export async function verificarWebhookLogistica(db: SupabaseClient, proveedor: string, connectionId: string): Promise<VeredictoWebhook> {
  const noEncontrado: VeredictoWebhook = { aceptado: false, status: 404, codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado.' };
  const entrada = entradaRegistro(proveedor);
  if (!entrada || !FORMA_UUID.test(connectionId)) return noEncontrado;
  const { data, error } = await db
    .from('integration_connections')
    .select('id, status, integration_connectors!inner(integration_providers!inner(code))')
    .eq('id', connectionId)
    .maybeSingle();
  if (error) throw new Error(`integration_connections: ${error.message}`);
  const fila = data as unknown as { status: string; integration_connectors: { integration_providers: { code: string } } } | null;
  if (!fila || fila.status === 'revoked' || fila.integration_connectors.integration_providers.code !== proveedor) return noEncontrado;
  return {
    aceptado: false,
    status: 501,
    codigo: 'AVISOS_NO_HABILITADOS',
    mensaje: `${entrada.nombre}: los avisos automáticos todavía no están habilitados (el adaptador no verifica su firma).`,
  };
}
