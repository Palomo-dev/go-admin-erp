/**
 * Toma de las fotos diarias de la operación (`ops_daily_snapshots`, ver `fotosOperacion.ts`).
 * Solo servidor: la llama el cron `/api/cron/fotos-operacion` (Vercel, cada hora) con el
 * cliente service_role.
 *
 * Por qué en Node y no en pg_cron (que existe en el proyecto): «atrasado» (la promesa de
 * entrega de `promesaDe`) y el estado de cada salida (`estadoDespacho`) son reglas de TypeScript
 * que usan Por despachar y Despachos de hoy. Recalcularlas en SQL sería una segunda
 * implementación que diverge; aquí se leen con los mismos servicios y se pasan por las mismas
 * reglas (`kpisDespacho`, `resumenViajesHoy`).
 *
 * Una vez al día por organización: solo las que tienen Logística o Transporte activos y cuya
 * hora local es la última del día (`tocaFoto`). La escritura es un upsert sobre
 * (organización, sucursal, día, métrica): repetir la hora no duplica. Se guarda la foto de
 * toda la organización (sucursal NULL) y la de cada sucursal activa, a partir de la misma
 * lectura. La organización sale de `organization_modules`, nunca de la petición.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { toPlainDate } from '@/lib/utils/dateCore';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { listarPorDespachar } from '@/lib/services/logistica/despachoService';
import { listarViajesDelDia } from '@/lib/services/transporte/despachosService';
import { kpisDespacho } from '@/lib/logistica/despacho';
import { leerCumplimientos, type Cumplimiento } from '@/lib/transporte/despachos';
import { resumenViajesHoy } from './transporteInicio';
import { aViajeInicio, pendientesDeSalir } from './transporteInicio.server';
import { tocaFoto, valoresLogistica, valoresTransporte, type FilaFoto } from './fotosOperacion';

/** Tope de viajes por salir a los que se les pide el cumplimiento (el mismo de la RPC de sesión). */
const TOPE_CUMPLIMIENTO = 500;

export interface ResumenFotos {
  organizaciones: number;
  conFoto: number;
  filas: number;
  errores: number;
}

/**
 * Cumplimiento de los viajes que faltan por salir. `fn_transporte_cumplimiento` exige sesión
 * (`auth.uid()`); el cron usa la función interna que ella misma llama por viaje
 * (`fn_transporte_cumplimiento_interno`, solo service_role): misma regla, sin sesión.
 */
async function cumplimientoServicio(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, Cumplimiento>> {
  const salida: unknown[] = [];
  for (const id of ids.slice(0, TOPE_CUMPLIMIENTO)) {
    const { data, error } = await db.rpc('fn_transporte_cumplimiento_interno', { p_trip: id });
    if (error) throw error;
    if (Array.isArray(data)) salida.push(...data);
    else if (data) salida.push(data);
  }
  return leerCumplimientos(salida);
}

/** Filas de foto de una organización: toda la organización y cada sucursal activa. */
export async function fotosDeOrganizacion(
  db: SupabaseClient,
  org: number,
  p: { logistica: boolean; transporte: boolean; zona: string; ahora: Date },
): Promise<FilaFoto[]> {
  const hoy = toPlainDate(p.ahora, p.zona);
  const { data: sedes, error } = await db.from('branches').select('id').eq('organization_id', org).eq('is_active', true).limit(500);
  if (error) throw error;
  const sucursales = ((sedes ?? []) as Array<{ id: number }>).map((b) => b.id);
  const alcances: Array<number | null> = [null, ...sucursales];
  const filas: FilaFoto[] = [];
  const agregar = (branch: number | null, valores: ReadonlyArray<readonly [FilaFoto['metrica'], number]>) => {
    for (const [metrica, valor] of valores) {
      if (Number.isFinite(valor)) filas.push({ organization_id: org, branch_id: branch, fecha: hoy, metrica, valor });
    }
  };

  if (p.logistica) {
    const { filas: bandeja } = await listarPorDespachar(db, { organizationId: org });
    for (const b of alcances) {
      const propias = b === null ? bandeja : bandeja.filter((f) => f.branchId === b);
      agregar(b, valoresLogistica(kpisDespacho(propias, p.ahora, p.zona)));
    }
  }

  if (p.transporte) {
    const lista = await listarViajesDelDia(db, { organizationId: org, fecha: hoy });
    const pendientes = pendientesDeSalir(lista);
    const cumplimiento = await cumplimientoServicio(db, pendientes.map((v) => v.id));
    for (const b of alcances) {
      const propios = (b === null ? lista : lista.filter((v) => v.sedeId === b)).map((v) => aViajeInicio(v));
      agregar(b, valoresTransporte(resumenViajesHoy(propios, cumplimiento)));
    }
  }
  return filas;
}

export async function tomarFotosOperacion(db: SupabaseClient, ahora: Date = new Date()): Promise<ResumenFotos> {
  const { data, error } = await db
    .from('organization_modules')
    .select('organization_id, module_code')
    .eq('is_active', true)
    .in('module_code', ['logistica', 'transport'])
    .limit(10000);
  if (error) throw error;
  const porOrg = new Map<number, { logistica: boolean; transporte: boolean }>();
  for (const r of (data ?? []) as Array<{ organization_id: number; module_code: string }>) {
    const m = porOrg.get(r.organization_id) ?? { logistica: false, transporte: false };
    if (r.module_code === 'logistica') m.logistica = true;
    if (r.module_code === 'transport') m.transporte = true;
    porOrg.set(r.organization_id, m);
  }

  const resumen: ResumenFotos = { organizaciones: porOrg.size, conFoto: 0, filas: 0, errores: 0 };
  for (const [org, modulos] of porOrg) {
    try {
      const zona = await getOrganizationTimezone(org, db);
      if (!tocaFoto(ahora, zona)) continue;
      const filas = await fotosDeOrganizacion(db, org, { ...modulos, zona, ahora });
      if (filas.length === 0) continue;
      const { error: e } = await db.from('ops_daily_snapshots').upsert(filas, { onConflict: 'organization_id,branch_id,fecha,metrica' });
      if (e) throw e;
      resumen.conFoto += 1;
      resumen.filas += filas.length;
    } catch (err) {
      resumen.errores += 1;
      console.error('[cron/fotos-operacion]', {
        organizationId: org,
        message: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err),
      });
    }
  }
  return resumen;
}
