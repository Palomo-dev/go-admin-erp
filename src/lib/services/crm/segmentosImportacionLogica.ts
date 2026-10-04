import Papa from 'papaparse';
import { CrmHttpError, UUID_RE } from './crmErrors';
import type { ConditionGroup } from './automation/conditionsDsl';
export const MAX_MIEMBROS_IMPORTADOS = 5000;
export function filtroDeIdsSegmento(ids: string[]): ConditionGroup {
  if (!ids.length || ids.length > MAX_MIEMBROS_IMPORTADOS || ids.some(id => !UUID_RE.test(id)) || new Set(ids).size !== ids.length)
    throw new CrmHttpError(400, 'lista_invalida', 'Revisa los IDs de clientes');
  const rules: ConditionGroup['rules'] = [];
  for (let i = 0; i < ids.length; i += 100) rules.push({ field: 'customer.id', operator: 'in', value: ids.slice(i, i + 100) });
  return { op: 'or', rules };
}
export function leerCsvMiembrosSegmento(text: string): string[] {
  if (text.length > 1024 * 1024) throw new CrmHttpError(400, 'archivo_grande', 'Archivo demasiado grande');
  const parsed = Papa.parse<{ customer_id: string }>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy' });
  // Un CSV válido de una sola columna no tiene delimitador que autodetectar.
  if (parsed.errors.some(error => error.code !== 'UndetectableDelimiter') || !parsed.meta.fields?.includes('customer_id')) throw new CrmHttpError(400, 'lista_invalida', 'Revisa la columna customer_id');
  const ids = parsed.data.map(row => String(row.customer_id ?? '').trim().toLowerCase());
  filtroDeIdsSegmento(ids);
  return ids;
}
