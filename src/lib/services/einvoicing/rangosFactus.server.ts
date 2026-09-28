/**
 * Rangos de numeración de la cuenta de Factus de una organización — SOLO
 * SERVIDOR. Sustituye a la sincronización que se hacía desde el navegador con
 * la cuenta de la plataforma y la sucursal «2» cableada.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { FactusApiError } from '@/lib/services/factusService';
import type { AccesoFactus } from './accesoFactus.server';

const URL_BASE = {
  sandbox: 'https://api-sandbox.factus.com.co',
  production: 'https://api.factus.com.co',
} as const;

export interface RangoFactus {
  id: number;
  document: string;
  prefix: string;
  from: number | null;
  to: number | null;
  current: number | null;
  resolution_number: string | null;
  start_date: string | null;
  end_date: string | null;
  technical_key: string | null;
  is_expired: boolean;
  is_active: boolean;
}

/** Tipo de documento del ERP para el nombre que da Factus. null = no se numera en el ERP. */
export function tipoDocumentoDeRango(documento: string): 'invoice' | 'credit_note' | 'debit_note' | 'support_document' | null {
  const d = documento
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (d.includes('ajuste')) return null; // nota de ajuste al documento soporte: el CHECK de invoice_sequences no la admite
  if (d.includes('soporte')) return 'support_document';
  if (d.includes('credito')) return 'credit_note';
  if (d.includes('debito')) return 'debit_note';
  if (d.includes('factura')) return 'invoice';
  return null;
}

export async function leerRangosFactus(acceso: AccesoFactus): Promise<RangoFactus[]> {
  let response: Response;
  try {
    response = await fetch(`${URL_BASE[acceso.environment]}/v2/numbering-ranges`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${acceso.accessToken}` },
    });
  } catch (err) {
    throw new FactusApiError(`Sin respuesta de Factus: ${err instanceof Error ? err.message : String(err)}`, null);
  }
  const json = (await response.json().catch(() => null)) as { data?: { data?: unknown[] } | unknown[] } | null;
  if (!response.ok) throw new FactusApiError(`Factus respondió ${response.status} al listar rangos`, response.status, json);
  const lista = Array.isArray(json?.data) ? json?.data : (json?.data as { data?: unknown[] } | undefined)?.data ?? [];
  return (lista as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    document: String(r.document ?? ''),
    prefix: String(r.prefix ?? ''),
    from: r.from === null || r.from === undefined ? null : Number(r.from),
    to: r.to === null || r.to === undefined ? null : Number(r.to),
    current: r.current === null || r.current === undefined ? null : Number(r.current),
    resolution_number: (r.resolution_number as string | null) || null,
    start_date: (r.start_date as string | null) || null,
    end_date: (r.end_date as string | null) || null,
    technical_key: (r.technical_key as string | null) || null,
    is_expired: r.is_expired === true,
    is_active: r.is_active !== false,
  }));
}

/** Fecha de Factus (YYYY-MM-DD o DD-MM-YYYY) a YYYY-MM-DD, o null. */
export function fechaRango(valor: string | null): string | null {
  if (!valor) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})/.exec(valor);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

export interface ResultadoSincronizacion {
  importados: number;
  desactivados: number;
  omitidos: string[];
}

/**
 * Copia los rangos de la cuenta de Factus a la numeración de la sucursal
 * indicada y desactiva los rangos de la organización que no pertenecen a esa
 * cuenta (p. ej. los de la cuenta demo copiados antes). `db` es el cliente de
 * la sesión del usuario: la RLS de `invoice_sequences` (pertenencia y acceso a
 * la sucursal) se aplica.
 */
export async function sincronizarRangos(
  db: SupabaseClient,
  params: { organizationId: number; branchId: number; rangos: RangoFactus[] },
): Promise<ResultadoSincronizacion> {
  const omitidos: string[] = [];
  let importados = 0;

  for (const r of params.rangos) {
    const tipo = tipoDocumentoDeRango(r.document);
    if (!tipo || !r.prefix) {
      omitidos.push(`${r.document} ${r.prefix}`.trim());
      continue;
    }
    const fila = {
      organization_id: params.organizationId,
      branch_id: params.branchId,
      document_type: tipo,
      prefix: r.prefix,
      resolution_number: r.resolution_number,
      range_start: r.from ?? 0,
      range_end: r.to ?? r.from ?? 0,
      current_number: Math.max(0, r.current ?? 0),
      valid_from: fechaRango(r.start_date),
      valid_until: fechaRango(r.end_date),
      technical_key: r.technical_key,
      is_active: r.is_active && !r.is_expired,
      factus_numbering_range_id: r.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db
      .from('invoice_sequences')
      .upsert(fila, { onConflict: 'organization_id,branch_id,document_type,prefix' });
    if (error) {
      omitidos.push(`${r.prefix}: ${error.message}`);
      continue;
    }
    importados += 1;
  }

  const idsCuenta = params.rangos.map((r) => r.id).filter((id) => Number.isFinite(id));
  let desactivados = 0;
  if (idsCuenta.length > 0) {
    const { data } = await db
      .from('invoice_sequences')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', params.organizationId)
      .eq('is_active', true)
      .not('factus_numbering_range_id', 'is', null)
      .not('factus_numbering_range_id', 'in', `(${idsCuenta.join(',')})`)
      .select('id');
    desactivados = (data ?? []).length;
  }

  return { importados, desactivados, omitidos };
}
