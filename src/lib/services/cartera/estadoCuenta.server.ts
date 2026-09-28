/**
 * Estado de cuenta del cliente en pantalla (kit `EstadoCuentaDialog`).
 *
 * No recalcula nada: usa el MISMO cargador que el PDF del motor de documentos
 * (`cargarEstadoCuenta`: movimientos con saldo corrido, saldo inicial,
 * antigüedad a la fecha de corte) con el permiso del tipo `estado-cuenta`, y
 * traduce su payload a la vista del kit (`vistaDesdePayload`). Así el diálogo
 * y el PDF no pueden diferir.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { cargarEstadoCuenta } from '@/lib/documents/server/cargadores/estadoCuenta';
import { autorizarTipo } from '@/lib/documents/server/permisos';
import { cargarTextos } from '@/lib/documents/textos';
import type { IdiomaDocumento } from '@/lib/documents/tipos';
import type { EstadoCuentaVista } from '@/components/kit/documento/carteraLogica';
import { vistaDesdePayload } from '@/lib/finanzas/cartera/estadoCuentaVista';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'roleId' | 'isSuperAdmin'>;

export async function estadoCuentaCliente(
  ctx: Ctx,
  clienteId: string,
  rango: { desde: string | null; hasta: string | null },
  idioma: IdiomaDocumento,
): Promise<EstadoCuentaVista> {
  await autorizarTipo(ctx, 'estado-cuenta');
  const t = await cargarTextos(idioma);
  const payload = await cargarEstadoCuenta(ctx, clienteId, { idioma, desde: rango.desde, hasta: rango.hasta }, t);
  return vistaDesdePayload(payload);
}
