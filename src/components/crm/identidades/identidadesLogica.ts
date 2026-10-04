import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
const ERRORES_FUSION = [
  'factura_emitida',
  'registro_cambio',
  'fila_movida_cambio',
  'fusion_pendiente',
  'fusion_no_reversible',
  'tipo_cliente_distinto',
] as const;
export function claveErrorIdentidades(error: unknown): string {
  if (!(error instanceof ErrorApiCrm)) return 'generico';
  if (
    error.codigo &&
    (ERRORES_FUSION as readonly string[]).includes(error.codigo)
  )
    return error.codigo;
  return error.status === 403 ? 'permiso' : 'generico';
}
export function fusionReversible(
  mergedAt: string,
  undoneAt: string | null,
  now = Date.now(),
) {
  const merged = Date.parse(mergedAt);
  return (
    !undoneAt &&
    Number.isFinite(merged) &&
    now - merged < 30 * 24 * 60 * 60 * 1000
  );
}
