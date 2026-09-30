/** Todas las lecturas y escrituras de identidades pasan por el servidor. */
import { emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { GrupoDuplicado } from '@/lib/services/crm/customerDuplicatesLogica';

export interface ListaDuplicados {
  data: GrupoDuplicado[];
  total: number;
  canMerge: boolean;
  canUndo: boolean;
  stats: Record<'phone' | 'email' | 'document', number>;
  scan: { id: string; status: string; processed: number; total: number } | null;
}
export interface FilaFusion {
  id: string;
  merged_at: string;
  undone_at: string | null;
  principal: { full_name: string | null } | null;
  secundario: { full_name: string | null } | null;
  autor: { first_name: string | null; last_name: string | null } | null;
  moved_counts: { table: string; count: number }[];
}
export interface IdentidadReal {
  id: string;
  identity_type: string;
  identity_value: string;
  verified: boolean;
  last_seen_at: string | null;
  customer: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  channel: { id: string; name: string; type: string } | null;
}
export async function leerDuplicados(
  page: number,
  q: string,
  signal?: AbortSignal,
): Promise<ListaDuplicados> {
  const { data, extra } = await pedirCrm<GrupoDuplicado[]>(
    `/api/crm/customer-duplicates?${new URLSearchParams({ page: String(page), q })}`,
    { signal },
  );
  return { data, ...extra } as unknown as ListaDuplicados;
}
export async function leerFusiones(page: number, signal?: AbortSignal) {
  const { data, extra } = await pedirCrm<FilaFusion[]>(
    `/api/crm/customer-merges?page=${page}`,
    { signal },
  );
  return { data, total: Number(extra.total ?? 0) };
}
export async function leerIdentidades(page: number, signal?: AbortSignal) {
  const { data, extra } = await pedirCrm<IdentidadReal[]>(
    `/api/crm/customer-identities?page=${page}`,
    { signal },
  );
  return {
    data,
    total: Number(extra.total ?? 0),
    canEdit: extra.canEdit === true,
  };
}
export async function fusionarClientes(
  primary: string,
  secondary: string,
  choices: Record<string, string>,
) {
  const result = await pedirCrm('/api/crm/customer-merges', {
    method: 'POST',
    cuerpo: {
      primary_customer_id: primary,
      secondary_customer_ids: [secondary],
      choices,
    },
  });
  emitirCambioCrm({ entidad: 'customer', id: primary, accion: 'fusionar' });
  return result;
}
export async function deshacerFusion(id: string) {
  const result = await pedirCrm(
    `/api/crm/customer-merges/${encodeURIComponent(id)}/undo`,
    { method: 'POST', cuerpo: {} },
  );
  emitirCambioCrm({ entidad: 'customer', accion: 'deshacerFusion' });
  return result;
}
export function excluirPar(a: string, b: string) {
  return pedirCrm('/api/crm/customer-duplicates', {
    method: 'DELETE',
    cuerpo: { customer_a: a, customer_b: b },
  });
}
export function iniciarBusqueda() {
  return pedirCrm('/api/crm/customer-duplicates', {
    method: 'POST',
    cuerpo: {},
  });
}
export function editarIdentidad(id: string, value: string, verified: boolean) {
  return pedirCrm(`/api/crm/customer-identities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    cuerpo: { identity_value: value, verified },
  });
}
export function eliminarIdentidad(id: string) {
  return pedirCrm(`/api/crm/customer-identities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    cuerpo: {},
  });
}
