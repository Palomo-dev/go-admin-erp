/**
 * Widget «Logística» del inicio (Figma `03` › Inicio, 2917:45049 desplegado,
 * 2922:48373 sin datos, 2922:48859 al día; aprobado el 2026-11-23).
 *
 * Por despachar, atrasados, contraentrega por cobrar hoy y sin domiciliario;
 * «Requiere atención» (atrasados, novedades que vencen hoy, envíos sin
 * movimiento, cuadres con diferencia y dinero por recibir); envíos abiertos por
 * estado y, en el pie, las entregas al primer intento de los últimos 30 días.
 *
 * Regla pura. Las cifras llegan calculadas por las reglas del módulo
 * (`kpisDespacho`, `conteosSeguimiento`, `kpisCuadres`, `tasaPrimerIntento`),
 * leídas con sus servicios en `logisticaInicio.server.ts`: aquí no se vuelve a
 * decidir qué está atrasado ni qué es una novedad.
 */
import type { KpisDespacho } from '@/lib/logistica/despacho';
import type { ConteosSeguimiento } from '@/lib/logistica/seguimiento';
import type { KpisCuadres } from '@/lib/logistica/cuadresVista';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';
import type { CifraModulo, TonoModulo } from './resumenModulos';
import {
  entero,
  numero,
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

/** Lo leído por el servidor; cada parte es null si su fuente falló o no se pudo leer. */
export interface CrudoLogisticaInicio {
  hayEnvios: boolean;
  despacho: KpisDespacho | null;
  /** El envío más atrasado (número del pedido o del envío) y cuántos minutos lleva tarde. */
  masAtrasado: { numero: string; minutos: number } | null;
  seguimiento: ConteosSeguimiento | null;
  cuadres: KpisCuadres | null;
  /** Envíos abiertos agrupados: por despachar · en camino · con novedad. */
  abiertos: { porDespachar: number; enCamino: number; conNovedad: number } | null;
  /** Entregas al primer intento en los últimos 30 días (0–1) o null sin entregas. */
  primerIntento: number | null;
  /** Meta del Figma (0–1). */
  metaPrimerIntento: number;
}

export interface LogisticaInicio {
  estado: EstadoWidget;
  fila: FilaWidget;
  kpis: KpiWidget[];
  atencion: AtencionWidget[];
  abiertos: DesgloseWidget | null;
  /** Pie: «entregas al primer intento (30 días): 91,4 %, meta 90 %». */
  primerIntento: { tasa: number; meta: number } | null;
  /** Alguna fuente falló: lo que se ve puede estar incompleto (nunca se dice «al día»). */
  parcial: boolean;
  acciones: AccionWidget[];
}

export interface EntradaLogistica {
  crudo: CrudoLogisticaInicio;
  moneda: string;
  href: (pagina: string) => string | null;
}

export function armarLogistica(e: EntradaLogistica): LogisticaInicio {
  const c = e.crudo;
  const d = c.despacho;
  const s = c.seguimiento;
  const q = c.cuadres;
  const parcial = !d || !s || !q;
  const din = (v: number): CifraModulo => ({ tipo: 'moneda', valor: numero(v), moneda: e.moneda });
  const hPor = e.href(RUTAS_LOGISTICA.porDespachar);
  const hSeg = e.href(RUTAS_LOGISTICA.seguimiento);
  const hCua = e.href(RUTAS_LOGISTICA.cuadres);

  const porDespachar = entero(d?.porDespachar);
  const atrasados = entero(d?.atrasados);
  const sinDom = entero(d?.sinDomiciliario);

  const kpis: KpiWidget[] = d
    ? [
        {
          id: 'porDespachar',
          etiqueta: { clave: 'logistica.kpis.porDespachar' },
          cifra: { tipo: 'numero', valor: porDespachar },
          detalle:
            porDespachar === 0
              ? { clave: 'logistica.detalles.nadaPendiente' }
              : { clave: 'logistica.detalles.hoyManana', params: { hoy: entero(d.paraHoy), manana: entero(d.paraManana) } },
          href: hPor,
        },
        {
          id: 'atrasados',
          etiqueta: { clave: 'logistica.kpis.atrasados' },
          cifra: { tipo: 'numero', valor: atrasados },
          detalle: { clave: atrasados > 0 ? 'logistica.detalles.atrasados' : 'logistica.detalles.aTiempo' },
          tono: atrasados > 0 ? 'peligro' : 'neutro',
          href: atrasados > 0 ? hPor : null,
        },
        {
          id: 'contraentrega',
          etiqueta: { clave: 'logistica.kpis.contraentrega' },
          cifra: din(d.contraentregaHoy),
          detalle:
            entero(d.enviosContraentregaHoy) > 0
              ? { clave: 'logistica.detalles.contraentrega', params: { n: entero(d.enviosContraentregaHoy) } }
              : { clave: 'logistica.detalles.sinContraentrega' },
          href: entero(d.enviosContraentregaHoy) > 0 ? hPor : null,
        },
        {
          id: 'sinDomiciliario',
          etiqueta: { clave: 'logistica.kpis.sinDomiciliario' },
          cifra: { tipo: 'numero', valor: sinDom },
          detalle:
            sinDom === 0
              ? { clave: 'logistica.detalles.todosConDomiciliario' }
              : { clave: 'logistica.detalles.salenHoy', params: { n: entero(d.sinDomiciliarioHoy), total: entero(d.saleHoy) } },
          tono: sinDom > 0 ? 'advertencia' : 'neutro',
          href: sinDom > 0 ? hPor : null,
        },
      ]
    : [];

  const atencion: AtencionWidget[] = [];
  if (atrasados > 0 && hPor) {
    atencion.push({
      id: 'atrasados',
      icono: 'reloj',
      tono: 'peligro',
      titulo: { clave: 'logistica.atencion.atrasados', params: { n: atrasados } },
      detalle: c.masAtrasado
        ? { clave: 'logistica.atencion.masAtrasado', params: { numero: c.masAtrasado.numero, minutos: entero(c.masAtrasado.minutos) } }
        : undefined,
      accion: { clave: 'logistica.acciones.verAtrasados' },
      href: hPor,
    });
  }
  if (s && entero(s.vencenHoy) > 0 && hSeg) {
    atencion.push({
      id: 'novedades',
      icono: 'alerta',
      tono: 'peligro',
      titulo: { clave: 'logistica.atencion.novedadesHoy', params: { n: entero(s.vencenHoy) } },
      detalle: { clave: 'logistica.atencion.novedadesAbiertas', params: { n: entero(s.novedades) } },
      accion: { clave: 'logistica.acciones.resolver' },
      href: hSeg,
    });
  } else if (s && entero(s.novedades) > 0 && hSeg) {
    atencion.push({
      id: 'novedades',
      icono: 'alerta',
      tono: 'advertencia',
      titulo: { clave: 'logistica.atencion.novedades', params: { n: entero(s.novedades) } },
      accion: { clave: 'logistica.acciones.resolver' },
      href: hSeg,
    });
  }
  if (s && entero(s.sinMovimiento) > 0 && hSeg) {
    atencion.push({
      id: 'sinMovimiento',
      icono: 'ubicacion',
      tono: 'advertencia',
      titulo: { clave: 'logistica.atencion.sinMovimiento', params: { n: entero(s.sinMovimiento) } },
      detalle:
        entero(s.sinMovimientoTransportadora) > 0
          ? { clave: 'logistica.atencion.conTransportadora', params: { n: entero(s.sinMovimientoTransportadora) } }
          : undefined,
      accion: { clave: 'logistica.acciones.revisar' },
      href: hSeg,
    });
  }
  if (q && entero(q.conDiferenciaHoy) > 0 && hCua) {
    atencion.push({
      id: 'conDiferencia',
      icono: 'billetera',
      tono: 'advertencia',
      titulo: { clave: 'logistica.atencion.conDiferencia', params: { n: entero(q.conDiferenciaHoy) } },
      detalle: numero(q.faltanteHoy) < 0 ? { clave: 'logistica.atencion.faltante' } : undefined,
      importe: numero(q.faltanteHoy) < 0 ? din(Math.abs(numero(q.faltanteHoy))) : null,
      accion: { clave: 'logistica.acciones.revisar' },
      href: hCua,
    });
  }
  if (q && numero(q.porRecibir) > 0 && hCua) {
    atencion.push({
      id: 'porRecibir',
      icono: 'dinero',
      tono: entero(q.abiertosAnteriores) > 0 ? 'advertencia' : 'informacion',
      titulo: { clave: 'logistica.atencion.porRecibir' },
      detalle: { clave: 'logistica.atencion.domiciliariosConDinero', params: { n: entero(q.domiciliariosPorRecibir) } },
      importe: din(q.porRecibir),
      accion: { clave: 'logistica.acciones.recibirDinero' },
      href: hCua,
    });
  }

  const a = c.abiertos;
  const totalAbiertos = a ? entero(a.porDespachar) + entero(a.enCamino) + entero(a.conNovedad) : 0;
  const pct = a ? porcentajes([entero(a.porDespachar), entero(a.enCamino), entero(a.conNovedad)]) : [];
  const abiertos: DesgloseWidget | null =
    a && totalAbiertos > 0
      ? {
          id: 'abiertos',
          titulo: { clave: 'logistica.abiertos.titulo' },
          total: { tipo: 'numero', valor: totalAbiertos },
          tramos: (
            [
              ['porDespachar', entero(a.porDespachar), pct[0]],
              ['enCamino', entero(a.enCamino), pct[1]],
              ['conNovedad', entero(a.conNovedad), pct[2]],
            ] as const
          )
            .filter(([, n]) => n > 0)
            .map(([id, n, p]) => ({ id, etiqueta: { clave: `logistica.abiertos.${id}` }, cifra: { tipo: 'numero' as const, valor: n }, porcentaje: p })),
        }
      : null;

  const ordenada = ordenarAtencion(atencion);
  const estado: EstadoWidget = !c.hayEnvios ? 'sinDatos' : ordenada.length > 0 ? 'atencion' : 'alDia';

  let tono: TonoModulo;
  let badge: FilaWidget['badge'];
  if (!c.hayEnvios) {
    tono = 'neutro';
    badge = { clave: 'comun.sinDatos' };
  } else if (atrasados > 0) {
    tono = 'peligro';
    badge = { clave: 'logistica.fila.atrasados', params: { n: atrasados } };
  } else if (ordenada.length > 0) {
    tono = ordenada.some((x) => x.tono === 'peligro') ? 'peligro' : 'advertencia';
    badge = { clave: 'comun.porAtender', params: { n: ordenada.length } };
  } else if (!parcial) {
    tono = 'exito';
    badge = { clave: 'comun.alDia' };
  } else {
    tono = 'neutro';
    badge = null;
  }

  const enCamino = a ? entero(a.enCamino) : 0;
  const resumen: SegmentoFila[] = !c.hayEnvios
    ? [{ clave: 'logistica.fila.sinEnvios' }]
    : !d
      ? []
      : [
          { clave: 'logistica.fila.porDespachar', params: { n: porDespachar } },
          ...(sinDom > 0 ? [{ clave: 'logistica.fila.sinDomiciliario', params: { n: sinDom } }] : []),
          ...(numero(d.contraentregaHoy) > 0 ? [{ clave: 'logistica.fila.contraentrega', cifra: din(d.contraentregaHoy) }] : []),
          ...(enCamino > 0 ? [{ clave: 'logistica.fila.enCamino', params: { n: enCamino } }] : []),
          ...(atrasados === 0 && porDespachar === 0 && enCamino === 0 ? [{ clave: 'logistica.fila.aTiempo' }] : []),
        ];

  const acciones: AccionWidget[] = [];
  if (!c.hayEnvios) {
    const zonas = e.href(RUTAS_LOGISTICA.zonas);
    const dom = e.href(RUTAS_LOGISTICA.domiciliarios);
    if (zonas) acciones.push({ id: 'zonas', etiqueta: { clave: 'logistica.acciones.configurarZonas' }, href: zonas, principal: true });
    if (dom) acciones.push({ id: 'domiciliario', etiqueta: { clave: 'logistica.acciones.agregarDomiciliario' }, href: dom });
  }

  return {
    estado,
    fila: { tono, badge, resumen },
    kpis,
    atencion: ordenada,
    abiertos,
    primerIntento: c.primerIntento === null ? null : { tasa: c.primerIntento, meta: c.metaPrimerIntento },
    parcial,
    acciones,
  };
}
