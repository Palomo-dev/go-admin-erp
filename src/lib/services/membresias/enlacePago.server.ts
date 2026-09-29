/**
 * Enlace de pago de una membresía (C5, §12.2) — lado del servidor: ¿se puede ofrecer y, si no, por
 * qué? Solo lee: la membresía (de la organización de la sesión, si no 404) y las conexiones de
 * pasarela `connected` de la organización (RLS por pertenencia; solo el código del conector, nunca
 * credenciales). No crea enlaces: ver `enlacePago.ts` para el hallazgo que lo impide hoy.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { evaluarEnlacePago, type EstadoEnlacePago } from './enlacePago';
import { ErrorMembresiasServidor, exigir } from './membresias.server';

type Fila = Record<string, unknown>;

function codigoConector(c: Fila): string | null {
  const conector = c.integration_connectors as Fila | Fila[] | null;
  const uno = Array.isArray(conector) ? conector[0] : conector;
  return typeof uno?.code === 'string' ? uno.code : null;
}

export async function estadoEnlacePago(ctx: ServerOrgContext, id: number): Promise<EstadoEnlacePago> {
  await exigir(ctx, 'ver');
  const { data: m } = await ctx.supabase
    .from('memberships')
    .select('id, status')
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (!m) throw new ErrorMembresiasServidor('membresia_no_encontrada', 404);

  const { data: conexiones, error } = await ctx.supabase
    .from('integration_connections')
    .select('id, organization_id, status, integration_connectors!inner(code)')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'connected');
  if (error) console.warn('[membresias] conexiones de pasarela no leídas', { organizationId: ctx.organizationId });

  const codigos = ((conexiones ?? []) as Fila[])
    .filter((c) => Number(c.organization_id) === ctx.organizationId)
    .map(codigoConector);
  return evaluarEnlacePago({ estadoMembresia: String((m as Fila).status), pasarelasConectadas: codigos });
}
