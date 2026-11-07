/**
 * Actualizar PUC: las mismas tres RPC de siempre (`fn_puc_migracion_preview`,
 * `fn_puc_migracion_aplicar`, `fn_puc_migracion_revertir`). La vista previa no
 * escribe. Aplicar crea el asiento de traslado; revertir registra su
 * contra-asiento y devuelve las reglas al código anterior.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface FilaRenombre {
  origen: string;
  actual: string;
  propuesto: string;
  lineas: number;
}

export interface FilaReclasificacion {
  origen: string;
  destino: string;
  debito: number;
  credito: number;
  neto: number;
  motivo: string;
}

export interface FilaRegla {
  id: number | string;
  nombre: string | null;
  source_type: string;
  event_type: string;
  lado: string;
  actual: string;
  propuesto: string | null;
  editada: boolean;
  motivo: string;
}

export interface VistaPrevia {
  organization_id: number;
  type_id: number | null;
  sector: string;
  renombres: FilaRenombre[];
  reclasificaciones: FilaReclasificacion[];
  reglas: FilaRegla[];
}

export interface ResultadoAplicar {
  corrida_id: string;
  journal_entry_id: number | null;
  asientos: number[];
  ya_aplicado: boolean;
}

function numero(valor: number | string | null | undefined): number {
  return Number(valor) || 0;
}

/** La RPC devuelve jsonb: cifras como texto y listas que pueden faltar. */
export function normalizarVistaPrevia(crudo: Partial<VistaPrevia> | null | undefined): VistaPrevia {
  const c = crudo ?? {};
  return {
    organization_id: Number(c.organization_id) || 0,
    type_id: c.type_id ?? null,
    sector: c.sector || 'Comercio',
    renombres: c.renombres || [],
    reclasificaciones: (c.reclasificaciones || []).map((fila) => ({
      ...fila,
      debito: numero(fila.debito),
      credito: numero(fila.credito),
      neto: numero(fila.neto),
    })),
    reglas: (c.reglas || []).map((fila) => ({ ...fila, editada: Boolean(fila.editada) })),
  };
}

export function resumenVistaPrevia(vista: VistaPrevia): {
  renombres: number;
  reclasificaciones: number;
  reglasPorAjustar: number;
  reglasEditadas: number;
  alDia: boolean;
} {
  const reglasEditadas = vista.reglas.filter((r) => r.editada).length;
  return {
    renombres: vista.renombres.length,
    reclasificaciones: vista.reclasificaciones.length,
    reglasPorAjustar: vista.reglas.length - reglasEditadas,
    reglasEditadas,
    alDia: vista.renombres.length === 0 && vista.reclasificaciones.length === 0 && vista.reglas.length === 0,
  };
}

function organizacion(): number {
  const org = getOrganizationId();
  if (!org) throw new Error('sin_organizacion');
  return org;
}

export const ActualizarPucService = {
  async vistaPrevia(): Promise<VistaPrevia> {
    const { data, error } = await supabase.rpc('fn_puc_migracion_preview', { p_organization_id: organizacion() });
    if (error) throw error;
    return normalizarVistaPrevia(data as Partial<VistaPrevia>);
  },

  async aplicar(): Promise<ResultadoAplicar> {
    const { data, error } = await supabase.rpc('fn_puc_migracion_aplicar', { p_organization_id: organizacion() });
    if (error) throw error;
    const crudo = (data ?? {}) as Partial<ResultadoAplicar>;
    return {
      corrida_id: crudo.corrida_id ?? '',
      journal_entry_id: crudo.journal_entry_id ?? null,
      asientos: crudo.asientos || [],
      ya_aplicado: Boolean(crudo.ya_aplicado),
    };
  },

  async revertir(): Promise<void> {
    const { error } = await supabase.rpc('fn_puc_migracion_revertir', { p_organization_id: organizacion() });
    if (error) throw error;
  },
};
