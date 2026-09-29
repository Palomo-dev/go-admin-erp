/**
 * Básculas del POS (tabla `pos_scales`, fase 3 de productos por peso). Todo
 * pasa por RPC SECURITY DEFINER que validan pertenencia a la organización y el
 * permiso `pos.basculas.configurar` en el servidor
 * (supabase/migrations/20260929220100_peso_f3_pos_basculas_rpc.sql).
 *
 * Cliente del navegador (sesión del usuario): la organización la valida la
 * RPC con `fn_assert_acceso_org`, nunca se confía en el id que se manda.
 */

import { supabase } from '@/lib/supabase/config';
import type { FilaBascula } from '@/lib/pos/bascula/config';

/** Fila completa para Configuración (incluye estado y nombres de sucursal/caja). */
export interface BasculaConfigurada extends FilaBascula {
  organization_id: number;
  branch_id: number;
  branch_name: string | null;
  pos_terminal_name: string | null;
  print_agent_name: string | null;
  is_active: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ListadoBasculas {
  puedeConfigurar: boolean;
  basculas: BasculaConfigurada[];
}

/** Lo que se manda a `pos_basculas_guardar` (sin `id` crea). */
export interface BasculaPayload {
  id?: string;
  branch_id: number;
  name: string;
  transport: 'desktop_serial' | 'web_serial';
  protocol: string;
  custom_pattern: string | null;
  device_hint: string | null;
  pos_terminal_id: string | null;
  baud_rate: number;
  data_bits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stop_bits: 1 | 2;
  unit_code: string;
  decimals: number;
  capacity_max: number | null;
  min_division: number | null;
  stable_ms: number;
}

export const CODIGOS_ERROR_BASCULAS = [
  'sin_permiso',
  'bascula_no_encontrada',
  'sucursal_invalida',
  'transporte_no_disponible',
  'equipo_invalido',
  'caja_invalida',
  'unidad_invalida',
  'nombre_duplicado',
  'datos_invalidos',
] as const;

export type CodigoErrorBasculas = (typeof CODIGOS_ERROR_BASCULAS)[number];

/** Código estable del error de la RPC (el mensaje de la excepción), o null. */
export function codigoErrorBasculas(error: unknown): CodigoErrorBasculas | null {
  if (!error || typeof error !== 'object') return null;
  const mensaje = String((error as { message?: unknown }).message ?? '').trim();
  if (/acceso denegado/i.test(mensaje)) return 'sin_permiso';
  const primera = mensaje.split(/[\s:]/)[0];
  return (CODIGOS_ERROR_BASCULAS as readonly string[]).includes(primera) ? (primera as CodigoErrorBasculas) : null;
}

export class BasculasService {
  static async listar(orgId: number, branchId?: number | null): Promise<ListadoBasculas> {
    const { data, error } = await supabase.rpc('pos_basculas_listar', { p_org: orgId, p_branch: branchId ?? null });
    if (error) throw error;
    const d = (data ?? {}) as { puede_configurar?: boolean; basculas?: BasculaConfigurada[] };
    return { puedeConfigurar: d.puede_configurar === true, basculas: Array.isArray(d.basculas) ? d.basculas : [] };
  }

  static async guardar(orgId: number, payload: BasculaPayload): Promise<BasculaConfigurada> {
    const { data, error } = await supabase.rpc('pos_basculas_guardar', { p_org: orgId, p_payload: payload });
    if (error) throw error;
    return data as BasculaConfigurada;
  }

  static async archivar(orgId: number, id: string, archivar = true): Promise<BasculaConfigurada> {
    const { data, error } = await supabase.rpc('pos_basculas_archivar', { p_org: orgId, p_id: id, p_archivar: archivar });
    if (error) throw error;
    return data as BasculaConfigurada;
  }

  static async registrarPrueba(orgId: number, id: string, ok: boolean): Promise<BasculaConfigurada> {
    const { data, error } = await supabase.rpc('pos_basculas_registrar_prueba', { p_org: orgId, p_id: id, p_ok: ok });
    if (error) throw error;
    return data as BasculaConfigurada;
  }

  /** Básculas activas de la sucursal para el POS, ordenadas para este equipo. */
  static async paraPos(orgId: number, branchId: number, posTerminalId: string | null): Promise<FilaBascula[]> {
    const { data, error } = await supabase.rpc('pos_basculas_para_pos', {
      p_org: orgId,
      p_branch: branchId,
      p_pos_terminal: esUuid(posTerminalId) ? posTerminalId : null,
      p_print_agent: null,
    });
    if (error) throw error;
    return Array.isArray(data) ? (data as FilaBascula[]) : [];
  }
}

function esUuid(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
