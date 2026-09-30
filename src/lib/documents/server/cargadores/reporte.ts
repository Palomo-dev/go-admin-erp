/**
 * Un reporte del catálogo exportado a PDF (tipo `reporte`, solo carta/A4).
 *
 * `id` es el id del reporte (`estado-resultados`). Parámetros de la query:
 * `desde`/`hasta` (días `YYYY-MM-DD`), `periodo` (tipo de cierre, para la
 * etiqueta), `hi`/`hf` (franja `HH:mm`),
 * `sucursal` (id; vacío = consolidado) y `vista` (id de la pestaña).
 *
 * - Plan y alcance de sucursal en el servidor (`acceso.server.ts`); la RPC
 *   del reporte vuelve a exigirlos con el cliente de la sesión.
 * - Se ejecuta en vivo y se pinta con las mismas piezas que un capítulo del
 *   cierre (`reporteSecciones.ts`). Deja el evento «exportar» en el historial.
 */

import { OrgContextError } from '@/lib/utils/orgContextError';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { congelarReporte } from '@/lib/services/reportes/cierres/snapshot';
import { exigirReporteDisponible, resolverAccesoReportes, sucursalDeParametro, sucursalDelReporte } from '@/lib/services/reportes/acceso.server';
import { registrarEventoReporte } from '@/lib/services/reportes/historialService';
import { esTipoCierre, normalizarPeriodo } from '@/lib/services/reportes/periodosService';
import { ejecutarReporte } from '@/lib/services/reportes/reportesEngine';
import { seccionesDeReporte } from '../../reporteSecciones';
import type { Traductor } from '../../textos';
import type { Campo, DocumentoPayload } from '../../tipos';
import { cargarBase, nombreArchivoBase, textoLegal, texto, type OpcionesCarga, type SesionDocumento } from '../base';

/** Filas por tabla en el PDF de un reporte suelto (el visor pagina; el PDF avisa si corta). */
export const MAX_FILAS_REPORTE = 2000;

export async function cargarReporte(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const p = opciones.parametros ?? {};
  const acceso = await resolverAccesoReportes(sesion);
  const { def, vista: vistaAlias } = exigirReporteDisponible(acceso, idCrudo);
  const branchId = sucursalDelReporte(acceso, def, sucursalDeParametro(p.sucursal));

  // Un reporte sin el filtro de franja la ignora (se calcula por día) y el documento lo dice.
  const periodo = normalizarPeriodo({
    tipo: esTipoCierre(p.periodo) ? p.periodo : 'personalizado',
    fechaInicio: opciones.desde,
    fechaFin: opciones.hasta,
    horaInicio: p.hi,
    horaFin: p.hf,
  });
  if (!periodo) throw new OrgContextError('Periodo inválido: desde y hasta son días YYYY-MM-DD', 400, 'PERIODO_INVALIDO');

  const [data, base, moneda] = await Promise.all([
    ejecutarReporte(def.id, sesion.organizationId, periodo, branchId, sesion.supabase),
    cargarBase(sesion, branchId),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId),
  ]);
  const reporte = congelarReporte(data, def, periodo, MAX_FILAS_REPORTE);
  const vista = texto(p.vista) ?? vistaAlias;

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
    accion: 'exportar',
    filtros: {
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      tipo: periodo.tipo,
      horaInicio: periodo.horaInicio ?? null,
      horaFin: periodo.horaFin ?? null,
      vista: vista ?? null,
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
