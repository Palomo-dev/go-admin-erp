/**
 * Cierre de periodo consolidado (`report_closings`), en carta y en 80 mm.
 *
 * - Se pinta desde el snapshot congelado al emitirse: el mismo número da
 *   siempre las mismas cifras. Nada se recalcula aquí.
 * - Lectura con el cliente de la sesión: la RLS de `report_closings` exige
 *   membresía y alcance de sucursal (`reporte_alcance_permite`), así que un
 *   gerente de otra sede recibe el mismo 404 que un id inexistente.
 * - Estado: emitido, firmado (periodo contable cerrado), reemplazado (marca
 *   de agua y la versión que lo reemplaza) o borrador.
 * - En 80 mm va solo la vista principal de cada reporte y menos filas.
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { leerSnapshot } from '@/lib/services/reportes/cierres/snapshot';
import { registrarEventoReporte } from '@/lib/services/reportes/historialService';
import { campoDeKpi, seccionesDeReporte } from '../../reporteSecciones';
import type { Traductor } from '../../textos';
import type { Banda, Campo, DocumentoPayload, MarcaAgua, SeccionTabla, Tono } from '../../tipos';
import {
  cargarBase,
  exigirUuid,
  fallaLectura,
  nombreArchivoBase,
  nombresDePerfiles,
  noEncontrado,
  textoLegal,
  texto,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

const MAX_FILAS_CARTA = 300;
const MAX_FILAS_80MM = 40;

interface FilaCierre {
  id: string;
  organization_id: number;
  numero: string;
  version: number;
  tipo: string;
  plantilla: string;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  branch_id: number | null;
  snapshot: unknown;
  zona_horaria: string | null;
  estado: string;
  reemplazado_por: string | null;
  emitido_por: string | null;
  emitido_en: string;
  firmado_por: string | null;
  firmado_en: string | null;
  fiscal_period_id: string | null;
  reabierto_por: string | null;
  reabierto_en: string | null;
  motivo_reapertura: string | null;
}

const SELECT_CIERRE =
  'id, organization_id, numero, version, tipo, plantilla, fecha_inicio, fecha_fin, hora_inicio, hora_fin, branch_id, snapshot, zona_horaria, estado, reemplazado_por, emitido_por, emitido_en, firmado_por, firmado_en, fiscal_period_id, reabierto_por, reabierto_en, motivo_reapertura';

const TONO_ESTADO: Record<string, Tono> = { borrador: 'neutro', emitido: 'marca', firmado: 'exito', reemplazado: 'neutro' };
const MARCA_ESTADO: Record<string, MarcaAgua | null> = { borrador: 'borrador', reemplazado: 'reemplazado' };

/** «20:00:00» → «20:00». */
function hora(valor: string | null): string | null {
  const v = texto(valor);
  return v ? v.slice(0, 5) : null;
}

export async function cargarCierrePeriodo(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const { data, error } = await sesion.supabase
    .from('report_closings')
    .select(SELECT_CIERRE)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('report_closings', error);
  const cierre = data as FilaCierre | null;
  if (!cierre || cierre.organization_id !== sesion.organizationId) throw noEncontrado();
  const snapshot = leerSnapshot(cierre.snapshot);
  if (!snapshot) fallaLectura('report_closings.snapshot', { message: 'snapshot sin formato v2' });

  const [base, moneda, gente, reemplazo] = await Promise.all([
    cargarBase(sesion, cierre.branch_id),
    snapshot.moneda ? Promise.resolve(snapshot.moneda) : resolverContextoMoneda(sesion.supabase, sesion.organizationId),
    nombresDePerfiles(sesion, [cierre.emitido_por, cierre.firmado_por, cierre.reabierto_por]),
    cierre.reemplazado_por
      ? sesion.supabase.from('report_closings').select('version').eq('id', cierre.reemplazado_por).eq('organization_id', sesion.organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const es80 = opciones.papel === '80mm';

  const bandas: Banda[] = [];
  if (cierre.estado === 'reemplazado') {
    const nueva = (reemplazo.data as { version?: number } | null)?.version;
    bandas.push(nueva ? { clave: 'cierreReemplazadoPor', vars: { version: nueva }, tono: 'aviso' } : { clave: 'cierreReemplazado', tono: 'aviso' });
  }
  if (cierre.estado === 'firmado' && cierre.fiscal_period_id) bandas.push({ clave: 'cierrePeriodoCerrado', tono: 'exito' });
  if (snapshot.errores.length > 0) bandas.push({ clave: 'cierreConErrores', vars: { cantidad: snapshot.errores.length }, tono: 'aviso' });

  const hi = hora(cierre.hora_inicio);
  const hf = hora(cierre.hora_fin);
  const metadatos: Campo[] = [
    { clave: 'tipoCierre', valor: { tipo: 'clave', v: `cierre.tipos.${cierre.tipo}` } },
    { clave: 'periodoDesde', valor: { tipo: 'fecha', v: cierre.fecha_inicio } },
    { clave: 'periodoHasta', valor: { tipo: 'fecha', v: cierre.fecha_fin } },
  ];
  if (hi && hf) metadatos.push({ clave: 'franja', valor: { tipo: 'texto', v: `${hi} – ${hf}` } });
  metadatos.push(
    snapshot.sucursal
      ? { clave: 'sucursal', valor: { tipo: 'texto', v: snapshot.sucursal.nombre } }
      : { clave: 'sucursal', valor: { tipo: 'clave', v: 'cierre.consolidado' } },
    { clave: 'plantilla', valor: { tipo: 'clave', v: `cierre.plantillas.${cierre.plantilla}` } },
    { clave: 'version', valor: { tipo: 'texto', v: `v${cierre.version}` } },
    { clave: 'emitidoEn', valor: { tipo: 'instanteHora', v: cierre.emitido_en } },
    { clave: 'emitidoPor', valor: { tipo: 'texto', v: cierre.emitido_por ? gente.get(cierre.emitido_por) ?? null : null } },
  );
  if (cierre.firmado_en) {
    metadatos.push(
      { clave: 'firmadoEn', valor: { tipo: 'instanteHora', v: cierre.firmado_en } },
      { clave: 'firmadoPor', valor: { tipo: 'texto', v: cierre.firmado_por ? gente.get(cierre.firmado_por) ?? null : null } },
    );
  }
  metadatos.push({ clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } });

  const secciones: SeccionTabla[] = [];
  if (!es80 && snapshot.capitulos.length > 1) {
    secciones.push({
      titulo: 'indiceCapitulos',
      columnas: [
        { clave: 'capitulo', tipo: 'texto' },
        { clave: 'reportes', tipo: 'numero' },
      ],
      filas: snapshot.capitulos.map((c) => [c.titulo, c.reportes.length]),
    });
  }
  const notaSinFranja = t('cierre.sinFranja');
  for (const capitulo of snapshot.capitulos) {
    capitulo.reportes.forEach((r, i) => {
      secciones.push(
        ...seccionesDeReporte(r, {
          capitulo: i === 0 ? capitulo.titulo : undefined,
          incluirVistas: !es80,
          maxFilas: es80 ? MAX_FILAS_80MM : MAX_FILAS_CARTA,
          notaSinFranja,
        }),
      );
    });
  }
  if (snapshot.errores.length > 0) {
    secciones.push({
      titulo: 'reportesConError',
      columnas: [{ clave: 'reporte', tipo: 'texto' }],
      filas: snapshot.errores.map((e) => [e.titulo]),
    });
  }

  const reabierto = cierre.reabierto_en && texto(cierre.motivo_reapertura)
    ? t('cierre.reabierto', {
      quien: cierre.reabierto_por ? gente.get(cierre.reabierto_por) ?? '—' : '—',
      motivo: texto(cierre.motivo_reapertura) as string,
    })
    : null;

  await registrarEventoReporte(sesion.supabase, {
    organizationId: sesion.organizationId,
    userId: sesion.userId,
    reportId: `cierre-${cierre.tipo}`,
    modulo: 'cierres',
    accion: 'exportar',
    filtros: { cierre_id: cierre.id, numero: cierre.numero, version: cierre.version, papel: opciones.papel ?? 'carta' },
    branchId: cierre.branch_id,
  });

  return {
    tipo: 'cierre-periodo',
    tituloClave: 'cierre-periodo',
    idioma: opciones.idioma,
    numero: cierre.numero,
    estado: { codigo: `cierre.${cierre.estado}`, tono: TONO_ESTADO[cierre.estado] ?? 'neutro' },
    marcaAgua: MARCA_ESTADO[cierre.estado] ?? null,
    bandas,
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: null,
    referencia: [],
    metadatos,
    resumen: snapshot.kpisPortada.map(campoDeKpi),
    lineas: null,
    secciones,
    totales: [],
    notas: reabierto,
    terminos: null,
    firma: 'cierrePeriodo',
    pieLegal: { textos: textoLegal(base, 'cierre-periodo', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: texto(cierre.zona_horaria) ?? base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'cierre-periodo', `${cierre.numero}-v${cierre.version}`),
  };
}
