/**
 * Envío del pedido manual de Pedidos online con la zona de domicilio (logística Fase 1). Solo
 * servidor.
 *
 * El servidor vuelve a cotizar con `logistica_cotizar_envio` (canal `manual`, que cuenta como POS
 * para el envío gratis) con el cliente de la SESIÓN, y decide con `decidirEnvioServidor`. Sin zonas
 * configuradas el envío es el que escribió la persona, como antes. Si se cambió el valor de la zona
 * (con permiso), queda en `ops_audit_log`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { cotizarEnvio } from '@/lib/services/logistica/cotizacionEnvioService';
import { resolverMunicipioDane } from '@/lib/services/logistica/municipioDaneService';
import { puedeEditarCargoDomicilio } from '@/lib/logistica/permisosLogistica.server';
import { decidirEnvioServidor, nombreZona, type DecisionEnvio } from '@/lib/logistica/presentacionEnvio';
import type { CotizacionEnvio } from '@/lib/logistica/cotizacion';

export interface EnvioPedidoManual {
  decision: DecisionEnvio;
  cotizacion: CotizacionEnvio | null;
  municipioDane: string | null;
}

export async function envioPedidoManual(
  ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase'>,
  e: { branchId: number; subtotal: number; enviado: number | null | undefined; ciudad: string | null; barrio: string | null },
): Promise<EnvioPedidoManual> {
  const municipioDane = await resolverMunicipioDane(ctx.supabase, { ciudad: e.ciudad }).catch(() => null);
  const [cotizacion, puedeEditar] = await Promise.all([
    cotizarEnvio(ctx.supabase, {
      organizationId: ctx.organizationId,
      branchId: e.branchId,
      direccion: { municipio_dane: municipioDane, barrio: e.barrio },
      canal: 'manual',
      subtotal: e.subtotal,
    }).catch((err) => {
      console.warn('[pedido manual] no se pudo cotizar el domicilio; se usa el valor escrito', {
        organizationId: ctx.organizationId,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }),
    puedeEditarCargoDomicilio(ctx),
  ]);
  return { decision: decidirEnvioServidor({ cotizacion, enviado: e.enviado, puedeEditar }), cotizacion, municipioDane };
}

/** Registro del cambio del valor de la zona (después de crear el pedido). Nunca lanza. */
export async function registrarEnvioEditado(
  ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase' | 'userId'>,
  e: { orderId: string; branchId: number; envio: EnvioPedidoManual },
): Promise<void> {
  const d = e.envio.decision;
  if (!d.ok || d.fuente !== 'editado') return;
  const { error } = await ctx.supabase.from('ops_audit_log').insert({
    organization_id: ctx.organizationId,
    branch_id: e.branchId,
    user_id: ctx.userId,
    entity_type: 'web_orders',
    entity_id: e.orderId,
    action: 'cargo_domicilio_editado',
    previous_data: { cargo_domicilio: d.cotizado, zona_id: e.envio.cotizacion?.zona?.id ?? null, zona: nombreZona(e.envio.cotizacion), fuente: 'zona' },
    new_data: { cargo_domicilio: d.envio },
    changed_fields: ['cargo_domicilio'],
    event_time: new Date().toISOString(),
    metadata: { modulo: 'logistica', canal: 'manual', permiso: 'organization_settings' },
  });
  if (error) console.warn('[pedido manual] no se registró el cambio del cargo de domicilio', { organizationId: ctx.organizationId, message: error.message });
}
