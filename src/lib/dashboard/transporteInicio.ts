/**
 * Widget «Transporte» del inicio (Figma `03` › Inicio, 2917:45560 desplegado,
 * 2922:48432 sin datos, 2922:49068 al día; aprobado el 2026-11-23). Sustituye
 * al «Inicio del día» de Transporte (descartado: el único tablero es Inicio).
 *
 * Viajes de hoy, ocupación de los ya salidos, vehículos disponibles y
 * documentos por vencer; «Requiere atención» (despachos bloqueados, documentos
 * vencidos, vehículos en mantenimiento y viajes con retraso) y los viajes de
 * hoy por estado.
 *
 * Regla pura. El estado de cada salida sale de `estadoDespacho` con el
 * cumplimiento de la base (`fn_transporte_cumplimiento`) y los documentos de
 * `documentosFlota` / `kpisDocumentos`: las mismas reglas de Viajes › Despachos
 * de hoy y Flota › Documentos.
 */
import {
  estadoDespacho,
  ocupacion,
  yaSalio,
  type CausaBloqueo,
  type Cumplimiento,
  type EstadoDespacho,
} from '@/lib/transporte/despachos';
import type { KpisDocumentos } from '@/lib/transporte/documentosFlota';
import type { TonoModulo } from './resumenModulos';
import {
  entero,
  ordenarAtencion,
  porcentajes,
  type AccionWidget,
  type AtencionWidget,
  type DesgloseWidget,
  type EstadoWidget,
  type FilaWidget,
  type KpiWidget,
  type SegmentoFila,
} from './widgetsInicio';

/** Páginas de Transporte que usa el widget (rutas del catálogo, `catalog.ts`). */
export const PAGINAS_TRANSPORTE = {
  /** Abre en la pestaña «Despachos de hoy». */
  viajes: '/app/transporte/viajes',
  flota: '/app/transporte/flota',
  vehiculos: '/app/transporte/vehiculos',
  rutas: '/app/transporte/rutas',
} as const;

/** Un viaje de hoy, lo justo para el widget. */
export interface ViajeInicio {
  id: string;
  codigo: string;
  /** Instante de salida programada. */
  salida: string;
  status: string | null;
  despachadoEn: string | null;
  conExcepcion: boolean;
  ruta: string | null;
  placa: string | null;
  puestos: number;
  disponibles: number;
  /** Retraso declarado del viaje (minutos). */
  retraso: number;
}

export interface CrudoTransporteInicio {
  hayViajes: boolean;
  hayVehiculos: boolean;
  /** null si la lectura falló. */
  viajes: ViajeInicio[] | null;
  cumplimiento: Map<string, Cumplimiento>;
  /** Vehículos activos por estado (`vehicles.status`). */
  vehiculos: { total: number; disponibles: number; enUso: number; mantenimiento: number; placasMantenimiento: string[] } | null;
  documentos: (KpisDocumentos & { vencidosEjemplo: Array<{ nombre: string; tipo: CausaBloqueo }> }) | null;
}

export interface TransporteInicio {
  estado: EstadoWidget;
  fila: FilaWidget;
  kpis: KpiWidget[];
  atencion: AtencionWidget[];
  porEstado: DesgloseWidget | null;
  parcial: boolean;
  acciones: AccionWidget[];
}

export interface EntradaTransporte {
  crudo: CrudoTransporteInicio;
  href: (pagina: string) => string | null;
}

/** Grupo de un viaje de hoy en el desglose por estado. */
export type GrupoViaje = 'completados' | 'enRuta' | 'porSalir' | 'bloqueados' | 'cancelados';

export function grupoViaje(v: Pick<ViajeInicio, 'status'>, estado: EstadoDespacho): GrupoViaje {
  if (estado === 'cancelado') return 'cancelados';
  if (yaSalio(estado)) return v.status === 'completed' || v.status === 'arrived' ? 'completados' : 'enRuta';
  return estado === 'bloqueado' ? 'bloqueados' : 'porSalir';
}

/** Máximo de despachos bloqueados que se listan uno por uno; el resto va en «Ver despachos». */
const MAX_BLOQUEADOS = 3;

export function armarTransporte(e: EntradaTransporte): TransporteInicio {
  const c = e.crudo;
  const hViajes = e.href(PAGINAS_TRANSPORTE.viajes);
  const hFlota = e.href(PAGINAS_TRANSPORTE.flota);
  const hVehiculos = e.href(PAGINAS_TRANSPORTE.vehiculos) ?? hFlota;
  const parcial = !c.viajes || !c.vehiculos || !c.documentos;

  const filas = (c.viajes ?? []).map((v) => {
    const cumplimiento = c.cumplimiento.get(v.id) ?? null;
    const estado = estadoDespacho({ id: v.id, status: v.status, dispatched_at: v.despachadoEn, dispatch_override_by: v.conExcepcion ? 'si' : null }, cumplimiento);
    return { v, cumplimiento, estado, grupo: grupoViaje(v, estado) };
  });
  const cuenta = (g: GrupoViaje) => filas.filter((f) => f.grupo === g).length;
  const completados = cuenta('completados');
  const enRuta = cuenta('enRuta');
  const porSalir = cuenta('porSalir');
  const bloqueados = cuenta('bloqueados');
  const total = completados + enRuta + porSalir + bloqueados;
  const retrasados = filas.filter((f) => f.grupo !== 'cancelados' && f.grupo !== 'completados' && f.v.retraso > 0).length;

  // Ocupación de los viajes ya salidos (puestos vendidos / puestos), con la regla de Despachos.
  const salidos = filas.filter((f) => f.grupo === 'completados' || f.grupo === 'enRuta');
  const puestos = salidos.reduce((s, f) => s + Math.max(0, entero(f.v.puestos)), 0);
  const vendidos = salidos.reduce((s, f) => s + ocupacion(f.v.puestos, f.v.disponibles).vendidos, 0);
  const pctOcupacion = puestos > 0 ? Math.round((vendidos / puestos) * 100) : null;

  const veh = c.vehiculos;
  const doc = c.documentos;

  const kpis: KpiWidget[] = [];
  if (c.viajes) {
    kpis.push({
      id: 'viajesHoy',
      etiqueta: { clave: 'transporte.kpis.viajesHoy' },
      cifra: { tipo: 'numero', valor: total },
      detalle:
        total === 0
          ? { clave: 'transporte.detalles.sinViajesHoy' }
          : { clave: 'transporte.detalles.viajesHoy', params: { completados, enRuta, porSalir: porSalir + bloqueados } },
      href: hViajes,
    });
    kpis.push({
      id: 'ocupacion',
      etiqueta: { clave: 'transporte.kpis.ocupacion' },
      cifra: pctOcupacion === null ? null : { tipo: 'texto', texto: { clave: 'transporte.detalles.porcentaje', params: { p: pctOcupacion } } },
      sinCifra: pctOcupacion === null,
      detalle:
        pctOcupacion === null
          ? { clave: 'transporte.detalles.sinSalidos' }
          : { clave: 'transporte.detalles.ocupacion', params: { n: salidos.length } },
    });
  }
  if (veh) {
    kpis.push({
      id: 'vehiculos',
      etiqueta: { clave: 'transporte.kpis.vehiculos' },
      cifra: { tipo: 'texto', texto: { clave: 'transporte.detalles.deTotal', params: { n: veh.disponibles, total: veh.total } } },
      detalle:
        veh.mantenimiento === 0 && veh.enUso === 0
          ? { clave: 'transporte.detalles.ningunoMantenimiento' }
          : { clave: 'transporte.detalles.vehiculos', params: { enUso: veh.enUso, mantenimiento: veh.mantenimiento } },
      href: hVehiculos,
    });
  }
  if (doc) {
    kpis.push({
      id: 'documentos',
      etiqueta: { clave: 'transporte.kpis.documentos' },
      cifra: { tipo: 'numero', valor: entero(doc.porVencer) },
      detalle:
        entero(doc.vencidos) > 0
          ? { clave: 'transporte.detalles.documentosVencidos', params: { n: entero(doc.vencidos) } }
          : entero(doc.porVencer) > 0
            ? { clave: 'transporte.detalles.proximos30' }
            : { clave: 'transporte.detalles.nadaVence' },
      tono: entero(doc.vencidos) > 0 ? 'peligro' : entero(doc.porVencer) > 0 ? 'advertencia' : 'neutro',
      href: hFlota,
    });
  }

  const atencion: AtencionWidget[] = [];
  if (hViajes) {
    const lista = filas
      .filter((f) => f.grupo === 'bloqueados')
      .sort((a, b) => a.v.salida.localeCompare(b.v.salida));
    for (const f of lista.slice(0, MAX_BLOQUEADOS)) {
      const b = f.cumplimiento?.bloqueos[0];
      atencion.push({
        id: `bloqueado-${f.v.id}`,
        icono: b?.grupo === 'vehiculo' || b?.grupo === 'conductor' ? 'documento' : 'ruta',
        tono: 'peligro',
        titulo: { clave: 'transporte.atencion.bloqueado', params: { codigo: f.v.codigo } },
        detalle: {
          clave: 'transporte.atencion.bloqueadoDetalle',
          params: { salida: f.v.salida, ruta: f.v.ruta ?? '—', causa: b?.causa ?? 'sin_vehiculo', placa: f.v.placa ?? '—' },
        },
        accion: { clave: 'transporte.acciones.resolver' },
        href: hViajes,
      });
    }
    if (lista.length > MAX_BLOQUEADOS) {
      atencion.push({
        id: 'bloqueados-mas',
        icono: 'ruta',
        tono: 'peligro',
        titulo: { clave: 'transporte.atencion.masBloqueados', params: { n: lista.length - MAX_BLOQUEADOS } },
        accion: { clave: 'transporte.acciones.verDespachos' },
        href: hViajes,
      });
    }
    if (retrasados > 0) {
      atencion.push({
        id: 'retrasados',
        icono: 'retraso',
        tono: 'advertencia',
        titulo: { clave: 'transporte.atencion.retrasados', params: { n: retrasados } },
        accion: { clave: 'transporte.acciones.verViajes' },
        href: hViajes,
      });
    }
  }
  if (doc && entero(doc.vencidos) > 0 && hFlota) {
    const ej = doc.vencidosEjemplo[0];
    atencion.push({
      id: 'documentosVencidos',
      icono: 'escudo',
      tono: 'advertencia',
      titulo: { clave: 'transporte.atencion.documentosVencidos', params: { n: entero(doc.vencidos) } },
      detalle: ej ? { clave: 'transporte.atencion.documentoEjemplo', params: { nombre: ej.nombre, causa: ej.tipo } } : undefined,
      accion: { clave: 'transporte.acciones.verDocumentos' },
      href: hFlota,
    });
  }
  if (veh && veh.mantenimiento > 0 && hVehiculos) {
    atencion.push({
      id: 'mantenimiento',
      icono: 'llave',
      tono: 'informacion',
      titulo: { clave: 'transporte.atencion.mantenimiento', params: { n: veh.mantenimiento } },
      detalle: veh.placasMantenimiento.length > 0 ? { clave: 'transporte.atencion.placas', params: { placas: veh.placasMantenimiento.slice(0, 3).join(' · ') } } : undefined,
      accion: { clave: 'transporte.acciones.verFlota' },
      href: hVehiculos,
    });
  }

  const pct = porcentajes([completados, enRuta, porSalir, bloqueados]);
  const tramos = [
    { id: 'completados', n: completados, p: pct[0] },
    { id: 'enRuta', n: enRuta, p: pct[1] },
    { id: 'porSalir', n: porSalir, p: pct[2] },
    { id: 'bloqueados', n: bloqueados, p: pct[3] },
  ].filter((t) => t.n > 0);
  const porEstado: DesgloseWidget | null =
    total > 0
      ? {
          id: 'porEstado',
          titulo: { clave: 'transporte.porEstado.titulo' },
          total: { tipo: 'numero', valor: total },
          tramos: tramos.map((t) => ({ id: t.id, etiqueta: { clave: `transporte.porEstado.${t.id}` }, cifra: { tipo: 'numero', valor: t.n }, porcentaje: t.p })),
        }
      : null;

  const ordenada = ordenarAtencion(atencion);
  const sinDatos = !c.hayViajes && !c.hayVehiculos;
  const estado: EstadoWidget = sinDatos ? 'sinDatos' : ordenada.length > 0 ? 'atencion' : 'alDia';

  let tono: TonoModulo;
  let badge: FilaWidget['badge'];
  if (sinDatos) {
    tono = 'neutro';
    badge = { clave: 'comun.sinDatos' };
  } else if (bloqueados > 0) {
    tono = 'peligro';
    badge = { clave: 'transporte.fila.bloqueados', params: { n: bloqueados } };
  } else if (doc && entero(doc.vencidos) > 0) {
    tono = 'advertencia';
    badge = { clave: 'transporte.fila.documentosVencidos', params: { n: entero(doc.vencidos) } };
  } else if (retrasados > 0) {
    tono = 'advertencia';
    badge = { clave: 'transporte.fila.retrasados', params: { n: retrasados } };
  } else if (!parcial) {
    tono = 'exito';
    badge = { clave: 'comun.alDia' };
  } else {
    tono = 'neutro';
    badge = null;
  }

  const resumen: SegmentoFila[] = sinDatos
    ? [{ clave: 'transporte.fila.sinViajes' }]
    : [
        { clave: 'transporte.fila.viajesHoy', params: { n: total } },
        ...(enRuta > 0 ? [{ clave: 'transporte.fila.enRuta', params: { n: enRuta } }] : []),
        ...(completados > 0 ? [{ clave: 'transporte.fila.completados', params: { n: completados } }] : []),
        ...(pctOcupacion !== null ? [{ clave: 'transporte.fila.ocupacion', params: { p: pctOcupacion } }] : []),
        ...(total === 0 && veh && veh.mantenimiento === 0 ? [{ clave: 'transporte.fila.flotaDisponible' }] : []),
      ];

  const acciones: AccionWidget[] = [];
  if (sinDatos) {
    if (hViajes) acciones.push({ id: 'programar', etiqueta: { clave: 'transporte.acciones.programarViaje' }, href: hViajes, principal: true });
    if (hVehiculos) acciones.push({ id: 'vehiculo', etiqueta: { clave: 'transporte.acciones.registrarVehiculo' }, href: hVehiculos });
  }

  return { estado, fila: { tono, badge, resumen }, kpis, atencion: ordenada, porEstado, parcial, acciones };
}
