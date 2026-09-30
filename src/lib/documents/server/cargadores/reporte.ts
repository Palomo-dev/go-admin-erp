/**
 * Un reporte del catálogo exportado a PDF (tipo `reporte`, solo carta/A4).
 *
 * `id` es el id del reporte (`estado-resultados`). Parámetros de la query:
 * `desde`/`hasta` (días `YYYY-MM-DD`), `periodo` (tipo de cierre, para la
 * etiqueta), `hi`/`hf` (franja `HH:mm`),
 * `sucursal` (id; vacío = consolidado), `vista` (id de la pestaña) y
 * `comparar` (`anterior` | `anio-anterior`).
 *
 * - Plan y alcance de sucursal en el servidor (`acceso.server.ts`); la RPC
 *   del reporte vuelve a exigirlos con el cliente de la sesión.
 * - Se ejecuta en vivo y se pinta con las mismas piezas que un capítulo del
 *   cierre (`reporteSecciones.ts`). Deja el evento «exportar» en el historial.
 */

import { OrgContextError } from '@/lib/utils/orgContextError';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { congelarReporte, type ReporteCongelado } from '@/lib/services/reportes/cierres/snapshot';
import { exigirReporteDisponible, resolverAccesoReportes, sucursalDeParametro, sucursalDelReporte } from '@/lib/services/reportes/acceso.server';
import { registrarEventoReporte } from '@/lib/services/reportes/historialService';
import { compararKpis, lecturaDelReporte } from '@/lib/services/reportes/comparativo';
import { esTipoCierre, normalizarPeriodo, periodoAnioAnterior, periodoAnterior } from '@/lib/services/reportes/periodosService';
import { ejecutarReporte } from '@/lib/services/reportes/reportesEngine';
import type { PeriodoCierre, ReportDefinition } from '@/lib/services/reportes/types';
import { seccionesDeReporte } from '../../reporteSecciones';
import type { Traductor } from '../../textos';
import type { Campo, DocumentoPayload } from '../../tipos';
import { cargarBase, nombreArchivoBase, textoLegal, texto, type OpcionesCarga, type SesionDocumento } from '../base';

/** Filas por tabla en el PDF de un reporte suelto (el visor pagina; el PDF avisa si corta). */
export const MAX_FILAS_REPORTE = 2000;

/**
 * `parametros.origen` que pone el envío programado para que el historial diga
 * «enviar». Lo escribe solo el servidor: la ruta de documentos copia de la
 * query únicamente `PARAMETROS_REPORTE`, que no lo incluye.
 */
export const ORIGEN_ENVIO = 'envio';

export interface ReportePreparado {
  def: ReportDefinition;
  periodo: PeriodoCierre;
  branchId: number | null;
  reporte: ReporteCongelado;
  vista: string | null;
}

/**
 * Plan, alcance, periodo y ejecución de un reporte con los parámetros del
 * documento. `comparar` (`anterior` | `anio-anterior`) corre también el
 * periodo de referencia y deja la variación en la lectura, solo en los
 * reportes que admiten comparativo.
 */
export async function prepararReporte(
  sesion: SesionDocumento,
  idCrudo: string,
  parametros: Readonly<Record<string, string | null>>,
  desde: string | null | undefined,
  hasta: string | null | undefined,
): Promise<ReportePreparado> {
  const p = parametros;
  const acceso = await resolverAccesoReportes(sesion);
  const { def, vista: vistaAlias } = exigirReporteDisponible(acceso, idCrudo);
  const branchId = sucursalDelReporte(acceso, def, sucursalDeParametro(p.sucursal));

  // Un reporte sin el filtro de franja la ignora (se calcula por día) y el documento lo dice.
  const periodo = normalizarPeriodo({
    tipo: esTipoCierre(p.periodo) ? p.periodo : 'personalizado',
    fechaInicio: desde,
    fechaFin: hasta,
    horaInicio: p.hi,
    horaFin: p.hf,
  });
  if (!periodo) throw new OrgContextError('Periodo inválido: desde y hasta son días YYYY-MM-DD', 400, 'PERIODO_INVALIDO');

  const referencia =
    def.filtros.includes('comparativo') && (p.comparar === 'anterior' || p.comparar === 'anio-anterior')
      ? p.comparar === 'anterior'
        ? periodoAnterior(periodo)
        : periodoAnioAnterior(periodo)
      : null;
  const [data, previo] = await Promise.all([
    ejecutarReporte(def.id, sesion.organizationId, periodo, branchId, sesion.supabase),
    referencia ? ejecutarReporte(def.id, sesion.organizationId, referencia, branchId, sesion.supabase).catch(() => null) : Promise.resolve(null),
  ]);
  const conLectura = referencia && previo ? { ...data, lectura: lecturaDelReporte(data, compararKpis(data, previo), referencia.etiqueta) } : data;
  return {
    def,
    periodo,
    branchId,
    reporte: congelarReporte(conLectura, def, periodo, MAX_FILAS_REPORTE),
    vista: texto(p.vista) ?? vistaAlias,
  };
}

export async function cargarReporte(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const p = opciones.parametros ?? {};
  const { def, periodo, branchId, reporte, vista } = await prepararReporte(sesion, idCrudo, p, opciones.desde, opciones.hasta);
  const [base, moneda] = await Promise.all([cargarBase(sesion, branchId), resolverContextoMoneda(sesion.supabase, sesion.organizationId)]);

  const metadatos: Campo[] = [
    { clave: 'periodoDesde', valor: { tipo: 'fecha', v: periodo.fechaInicio } },
    { clave: 'periodoHasta', valor: { tipo: 'fecha', v: periodo.fechaFin } },
  ];
  if (periodo.horaInicio && periodo.horaFin) metadatos.push({ clave: 'franja', valor: { tipo: 'texto', v: `${periodo.horaInicio} – ${periodo.horaFin}` } });
  metadatos.push(
    def.alcance === 'organizacion'
      ? { clave: 'sucursal', valor: { tipo: 'clave', v: 'reportes.todaLaOrganizacion' } }
      : base.sucursal
        ? { clave: 'sucursal', valor: { tipo: 'texto', v: base.sucursal.nombre } }
        : { clave: 'sucursal', valor: { tipo: 'clave', v: 'cierre.consolidado' } },
    { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
  );

  await registrarEventoReporte(sesion.supabase, {
    organizationId: sesion.organizationId,
    userId: sesion.userId,
    reportId: def.id,
    modulo: def.modulo,
    accion: p.origen === ORIGEN_ENVIO ? 'enviar' : 'exportar',
    filtros: {
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      tipo: periodo.tipo,
      horaInicio: periodo.horaInicio ?? null,
      horaFin: periodo.horaFin ?? null,
      vista: vista ?? null,
      comparar: p.comparar ?? null,
      formato: 'pdf',
    },
    branchId,
  });

  return {
    tipo: 'reporte',
    tituloClave: 'reporte',
    idioma: opciones.idioma,
    numero: reporte.titulo,
    estado: null,
    marcaAgua: null,
    bandas: [],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: null,
    referencia: [],
    metadatos,
    resumen: [],
    lineas: null,
    secciones: seccionesDeReporte(reporte, {
      incluirVistas: !vista,
      maxFilas: MAX_FILAS_REPORTE,
      notaSinFranja: t('cierre.sinFranja'),
      soloVista: vista,
    }),
    totales: [],
    notas: null,
    terminos: null,
    firma: null,
    pieLegal: { textos: textoLegal(base, 'reporte', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'reporte', `${def.id}_${periodo.fechaInicio}_${periodo.fechaFin}`),
  };
}
