/**
 * Lecturas del widget «Transporte» del inicio (ver `transporteInicio.ts`).
 *
 * Con el cliente de la SESIÓN (`ctx.supabase`, RLS) y la organización del
 * contexto:
 *  - Viajes de hoy con `listarViajesDelDia` y su cumplimiento con
 *    `cumplimientoDeViajes` (`fn_transporte_cumplimiento`), lo mismo que
 *    Viajes › Despachos de hoy (solo se pide el cumplimiento de los que faltan
 *    por salir, como allá).
 *  - Vehículos activos por estado y las fechas de documentos de vehículos y
 *    conductores, pasadas por `documentosFlota` / `kpisDocumentos` (la regla de
 *    Flota › Documentos).
 * Si la fila aparece lo decidió la base (`fn_inicio_modulos_resumen`). Cada
 * fuente falla por separado.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { cumplimientoDeViajes, listarViajesDelDia, type ViajeDelDia } from '@/lib/services/transporte/despachosService';
import { documentosFlota, kpisDocumentos, type ConductorConFechas, type VehiculoConFechas } from '@/lib/transporte/documentosFlota';
import type { Cumplimiento } from '@/lib/transporte/despachos';
import type { CrudoTransporteInicio, ViajeInicio } from './transporteInicio';
import { METRICAS_TRANSPORTE } from './fotosOperacion';
import { leerFotosOperacion } from './fotosOperacion.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

async function seguro<T>(etiqueta: string, ctx: Ctx, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (err) {
    console.error(`[inicio/transporte] ${etiqueta}`, {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err),
    });
    return null;
  }
}

/** Tope de vehículos y conductores que se leen (el mismo de Flota › Documentos). */
const TOPE_FLOTA = 1000;

/** Los viajes que faltan por salir: a ellos solo se les pide el cumplimiento (criterio de Despachos de hoy). */
export function pendientesDeSalir(lista: readonly ViajeDelDia[]): ViajeDelDia[] {
  return lista.filter((v) => !v.despachadoEn && ['scheduled', 'boarding', 'delayed', null].includes(v.status));
}

/** Un viaje de la lectura de Despachos de hoy, lo justo para el widget (con su retraso declarado). */
export function aViajeInicio(v: ViajeDelDia, retraso = 0): ViajeInicio {
  return {
    id: v.id,
    codigo: v.codigo,
    salida: v.salida,
    status: v.status,
    despachadoEn: v.despachadoEn,
    conExcepcion: !!v.excepcion,
    ruta: v.ruta?.nombre ?? null,
    placa: v.vehiculo?.placa ?? null,
    puestos: v.puestos,
    disponibles: v.disponibles,
    retraso,
  };
}

export async function leerTransporteInicio(
  ctx: Ctx,
  p: {
    sucursal: number | null;
    dia: string;
    hayViajes: boolean;
    hayVehiculos: boolean;
    /** Leer las fotos de días anteriores (comparación del widget). El bloque «Hoy» no las usa. */
    conFotos?: boolean;
  },
): Promise<CrudoTransporteInicio> {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  if (!p.hayViajes && !p.hayVehiculos) {
    return { hayViajes: false, hayVehiculos: false, viajes: [], cumplimiento: new Map(), vehiculos: null, documentos: null };
  }

  const [viajes, flota, fotos] = await Promise.all([
    seguro('viajes de hoy', ctx, async () => {
      const lista = await listarViajesDelDia(db, { organizationId: org, fecha: p.dia, branchId: p.sucursal });
      // Mismo criterio que Despachos de hoy: el cumplimiento solo de lo que falta por salir.
      const pendientes = pendientesDeSalir(lista);
      const cumplimiento = await cumplimientoDeViajes(db, pendientes.map((v) => v.id)).catch(() => new Map<string, Cumplimiento>());
      // `delay_minutes` no está en la lectura de Despachos: se pide aparte, solo para hoy.
      const retrasos = new Map<string, number>();
      if (lista.length > 0) {
        const { data } = await db.from('trips').select('id, delay_minutes').eq('organization_id', org).eq('trip_date', p.dia).gt('delay_minutes', 0).limit(500);
        for (const r of (data ?? []) as Array<{ id: string; delay_minutes: number | null }>) retrasos.set(r.id, Number(r.delay_minutes) || 0);
      }
      const filas: ViajeInicio[] = lista.map((v) => aViajeInicio(v, retrasos.get(v.id) ?? 0));
      return { filas, cumplimiento };
    }),
    seguro('flota', ctx, async () => {
      let qv = db
        .from('vehicles')
        .select('id, plate, vehicle_type, status, soat_expiry, techno_expiry, insurance_expiry, operating_card_expiry')
        .eq('organization_id', org)
        .eq('is_active', true)
        .order('plate')
        .limit(TOPE_FLOTA);
      if (p.sucursal) qv = qv.eq('branch_id', p.sucursal);
      let qc = db
        .from('driver_credentials')
        .select('id, full_name, license_category, license_expiry, medical_certificate_expiry')
        .eq('organization_id', org)
        .eq('is_active', true)
        .limit(TOPE_FLOTA);
      if (p.sucursal) qc = qc.eq('branch_id', p.sucursal);
      const [v, c] = await Promise.all([qv, qc]);
      if (v.error) throw v.error;
      const vehiculos = (v.data ?? []) as Array<VehiculoConFechas & { status: string | null }>;
      // Sin permiso para ver conductores (RLS de Logística) la lista queda vacía: no es error.
      const conductores = (c.data ?? []) as ConductorConFechas[];
      return { vehiculos, conductores };
    }),
    // Base de «vs. cierre de ayer» y de la mini-gráfica (falla sola: sin fotos, sin comparación).
    p.conFotos === false ? Promise.resolve(null) : leerFotosOperacion(ctx, { sucursal: p.sucursal, hoy: p.dia, metricas: METRICAS_TRANSPORTE }),
  ]);

  let vehiculos: CrudoTransporteInicio['vehiculos'] = null;
  let documentos: CrudoTransporteInicio['documentos'] = null;
  if (flota) {
    const lista = flota.vehiculos;
    const mant = lista.filter((x) => x.status === 'maintenance');
    vehiculos = {
      total: lista.length,
      disponibles: lista.filter((x) => x.status === 'available').length,
      enUso: lista.filter((x) => x.status === 'in_use').length,
      mantenimiento: mant.length,
      placasMantenimiento: mant.map((x) => x.plate),
    };
    const docs = documentosFlota(flota.vehiculos, flota.conductores, p.dia);
    const sinFecha =
      flota.vehiculos.filter((x) => !x.soat_expiry && !x.techno_expiry && !x.insurance_expiry && !x.operating_card_expiry).length +
      flota.conductores.filter((x) => !x.license_expiry && !x.medical_certificate_expiry).length;
    documentos = {
      ...kpisDocumentos(docs, sinFecha),
      vencidosEjemplo: docs.filter((d) => d.estado === 'vencido').slice(0, 2).map((d) => ({ nombre: d.nombre, tipo: d.tipo })),
    };
  }

  return {
    hayViajes: p.hayViajes,
    hayVehiculos: p.hayVehiculos,
    viajes: viajes?.filas ?? null,
    cumplimiento: viajes?.cumplimiento ?? new Map(),
    vehiculos,
    documentos,
    fotos,
    hoy: p.dia,
  };
}
