/**
 * Lógica pura de la fusión de clientes (Figma CRM 1436:19 y 1438:1553).
 * Sin React. La fusión la hace el servidor en una transacción.
 */
import { CAMPOS_FUSION, type CampoFusion, type ClienteDuplicado } from '@/lib/services/crm/customerMergeLogica';

const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** Campos en los que los dos registros dicen algo distinto (y al menos uno dice algo). */
export function camposDistintos(a: ClienteDuplicado, b: ClienteDuplicado): CampoFusion[] {
  return CAMPOS_FUSION.filter((c) => !(vacio(a[c]) && vacio(b[c])) && String(a[c] ?? '').trim() !== String(b[c] ?? '').trim());
}

/** Por defecto gana el principal; si el principal no tiene el dato, el secundario. */
export function eleccionesIniciales(principal: ClienteDuplicado, secundario: ClienteDuplicado): Partial<Record<CampoFusion, string>> {
  return Object.fromEntries(camposDistintos(principal, secundario).map((c) => [c, vacio(principal[c]) ? secundario.id : principal.id]));
}

/** Solo viajan los campos que se toman del secundario (elegir el principal no cambia nada). */
export function choicesParaApi(elecciones: Partial<Record<CampoFusion, string>>, secundarioId: string): Partial<Record<CampoFusion, string>> {
  return Object.fromEntries(Object.entries(elecciones).filter(([, id]) => id === secundarioId)) as Partial<Record<CampoFusion, string>>;
}

/** Principal sugerido: más oportunidades, luego más conversaciones, luego el más antiguo. */
export function principalSugerido(clientes: readonly ClienteDuplicado[]): ClienteDuplicado | null {
  return (
    [...clientes].sort(
      (a, b) => b.opportunities_count - a.opportunities_count || b.conversations_count - a.conversations_count || a.created_at.localeCompare(b.created_at),
    )[0] ?? null
  );
}

export function nombreCliente(c: Pick<ClienteDuplicado, 'full_name' | 'company_name' | 'trade_name'>): string | null {
  return [c.full_name, c.company_name ?? c.trade_name].map((v) => v?.trim()).filter(Boolean)[0] ?? null;
}

/** Códigos de error de las RPC de fusión que la pantalla sabe explicar. */
const CONOCIDOS = new Set([
  'factura_emitida', 'registro_cambio', 'sucursal_sin_acceso', 'cliente_no_encontrado', 'seleccion_invalida',
  'fusion_no_reversible', 'fusion_pendiente', 'solo_administrador', 'fusion_no_encontrada', 'CRM_FORBIDDEN', 'sin_permiso',
]);

export function claveErrorFusion(codigo: string | null | undefined): string {
  if (!codigo) return 'generico';
  if (codigo === 'CRM_FORBIDDEN') return 'sin_permiso';
  return CONOCIDOS.has(codigo) ? codigo : 'generico';
}

/** «compras@x.co» / «+57 …» / «900…»: el valor compartido que agrupó a los clientes. */
export function tipoIdentidad(t: string): 'phone' | 'email' | 'document' | 'otro' {
  return t === 'phone' || t === 'email' || t === 'document' ? t : 'otro';
}
