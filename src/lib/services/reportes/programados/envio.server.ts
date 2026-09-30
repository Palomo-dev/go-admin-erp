/**
 * Archivos y correo de un envío programado de reporte.
 *
 * - El PDF lo arma el motor único de documentos (`armarDocumento('reporte')`
 *   + `generarPdf`); el Excel y el CSV salen del mismo reporte congelado
 *   (`prepararReporte` + `exportarTabla`). Con la sesión que se le pase: la
 *   del destinatario en el cron, la de quien pide la prueba en la ruta.
 * - El permiso del documento (`reports.export`) se exige también para
 *   Excel/CSV (`autorizarTipo`): el formato no abre otra puerta.
 * - El correo sale por el canal transaccional del CRM (`sendEmail`) con
 *   `client_request_id` por envío y destinatario: un reintento del cron no
 *   duplica el correo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { sendEmail } from '@/lib/services/crm/email/sendService';
import { escaparHtml } from '@/lib/services/finanzas/enviarDocumento.server';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { armarDocumento } from '@/lib/documents/server/motor';
import { autorizarTipo } from '@/lib/documents/server/permisos';
import { generarPdf } from '@/lib/documents/server/pdf';
import { ORIGEN_ENVIO, prepararReporte } from '@/lib/documents/server/cargadores/reporte';
import { crearFormateador } from '@/lib/documents/formato';
import { cargarTextos, type Traductor } from '@/lib/documents/textos';
import { esIdiomaDocumento, type IdiomaDocumento } from '@/lib/documents/tipos';
import type { SesionDocumento } from '@/lib/documents/server/base';
import { registrarEventoReporte } from '../historialService';
import { reporteACsv, reporteAExcel } from '../exportarTabla';
import type { PeriodoCierre } from '../types';
import type { FiltrosEnvio, FormatoEnvio } from './programacion';

export interface Adjunto {
  filename: string;
  content_base64: string;
  content_type: string;
}

export interface EnvioAArmar {
  reportId: string;
  branchId: number | null;
  formato: FormatoEnvio;
  filtros: FiltrosEnvio;
  periodo: PeriodoCierre;
  zona: string;
}

export interface ArchivosEnvio {
  titulo: string;
  adjuntos: Adjunto[];
}

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function nombreSeguro(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'reporte'
  );
}

function parametrosDe(e: EnvioAArmar): Record<string, string | null> {
  return {
    periodo: e.periodo.tipo,
    sucursal: e.branchId ? String(e.branchId) : null,
    hi: e.periodo.horaInicio ?? null,
    hf: e.periodo.horaFin ?? null,
    vista: e.filtros.vista,
    comparar: e.filtros.comparar,
    origen: ORIGEN_ENVIO,
  };
}

async function nombreSucursal(sesion: SesionDocumento, branchId: number | null): Promise<string | null> {
  if (!branchId) return null;
  const { data } = await sesion.supabase.from('branches').select('name').eq('id', branchId).eq('organization_id', sesion.organizationId).maybeSingle();
  return (data as { name?: string | null } | null)?.name ?? null;
}

/** PDF, Excel y/o CSV del reporte con la sesión dada. Lanza los 403/404 del plan, el alcance o el permiso. */
export async function archivosDelEnvio(sesion: SesionDocumento, envio: EnvioAArmar, idioma: IdiomaDocumento): Promise<ArchivosEnvio> {
  const conPdf = envio.formato === 'pdf' || envio.formato === 'pdf_excel';
  const conTabla = envio.formato !== 'pdf';
  const parametros = parametrosDe(envio);
  const adjuntos: Adjunto[] = [];
  let titulo = envio.reportId;

  if (conPdf) {
    const { html, payload, papel } = await armarDocumento(sesion, {
      tipo: 'reporte',
      id: envio.reportId,
      papel: 'carta',
      idioma,
      desde: envio.periodo.fechaInicio,
      hasta: envio.periodo.fechaFin,
      parametros,
    });
    titulo = payload.numero ?? titulo;
    const pdf = await generarPdf(html, papel);
    adjuntos.push({ filename: `${nombreSeguro(payload.nombreArchivo || titulo)}.pdf`, content_base64: Buffer.from(pdf).toString('base64'), content_type: 'application/pdf' });
  }

  if (conTabla) {
    await autorizarTipo(sesion, 'reporte');
    const [preparado, t, moneda, sucursal] = await Promise.all([
      prepararReporte(sesion, envio.reportId, parametros, envio.periodo.fechaInicio, envio.periodo.fechaFin),
      cargarTextos(idioma),
      resolverContextoMoneda(sesion.supabase, sesion.organizationId),
      nombreSucursal(sesion, envio.branchId),
    ]);
    titulo = preparado.reporte.titulo;
    const f = crearFormateador({ moneda, zonaHoraria: envio.zona, idioma });
    const p = preparado.periodo;
    const lineas = [
      `${t('exportacion.desde')}: ${f.fecha(p.fechaInicio)}`,
      `${t('exportacion.hasta')}: ${f.fecha(p.fechaFin)}`,
      ...(p.horaInicio && p.horaFin ? [`${t('campos.franja')}: ${p.horaInicio} – ${p.horaFin}`] : []),
      `${t('campos.sucursal')}: ${preparado.def.alcance === 'organizacion' ? t('reportes.todaLaOrganizacion') : (sucursal ?? t('cierre.consolidado'))}`,
      `${t('campos.moneda')}: ${moneda.code}`,
    ];
    const textos = {
      resumen: t('exportacion.resumen'),
      indicador: t('exportacion.indicador'),
      valor: t('exportacion.valor'),
      truncado: (mostradas: number, total: number) => t('reportes.truncado', { mostradas, total }),
    };
    const base = nombreSeguro(`${preparado.def.id}_${p.fechaInicio}_${p.fechaFin}`);
    if (envio.formato === 'csv') {
      adjuntos.push({ filename: `${base}.csv`, content_base64: Buffer.from(reporteACsv(preparado.reporte, { textos }, preparado.vista), 'utf8').toString('base64'), content_type: 'text/csv' });
    } else {
      adjuntos.push({ filename: `${base}.xlsx`, content_base64: Buffer.from(reporteAExcel(preparado.reporte, { lineas, textos }, preparado.vista)).toString('base64'), content_type: TIPO_XLSX });
    }
    if (!conPdf) {
      await registrarEventoReporte(sesion.supabase, {
        organizationId: sesion.organizationId,
        userId: sesion.userId,
        reportId: preparado.def.id,
        modulo: preparado.def.modulo,
        accion: 'enviar',
        filtros: { fechaInicio: p.fechaInicio, fechaFin: p.fechaFin, tipo: p.tipo, horaInicio: p.horaInicio ?? null, horaFin: p.horaFin ?? null, formato: envio.formato },
        branchId: preparado.branchId,
      });
    }
  }
  return { titulo, adjuntos };
}

export interface CorreoEnvio {
  organizationId: number;
  organizationName: string;
  /** Quien programó el envío: remitente del CRM. */
  creador: { userId: string; email: string | null; nombre: string | null };
  para: string;
  nombreDestinatario: string | null;
  externo: boolean;
  nombreEnvio: string;
  programadoId: string;
  archivos: ArchivosEnvio;
  periodo: PeriodoCierre;
  idioma: IdiomaDocumento;
  zona: string;
  /** Solo para el formato de las fechas del correo (locale del país). */
  moneda: ContextoMoneda;
  /** Clave de idempotencia: envío + ejecución + destinatario. */
  clave: string;
  prueba?: boolean;
}

export function idiomaDe(valor: unknown, respaldo: IdiomaDocumento = 'es'): IdiomaDocumento {
  return typeof valor === 'string' && esIdiomaDocumento(valor) ? valor : respaldo;
}

function cuerpoCorreo(c: CorreoEnvio, t: Traductor, desde: string, hasta: string): { asunto: string; html: string; texto: string } {
  const periodoTexto = `${desde} – ${hasta}`;
  const asunto = t(c.prueba ? 'envios.asuntoPrueba' : 'envios.asunto', { reporte: c.archivos.titulo, periodo: periodoTexto });
  const parrafos = [
    c.nombreDestinatario ? t('envios.saludo', { nombre: c.nombreDestinatario }) : t('envios.saludoSinNombre'),
    t('envios.cuerpo', { reporte: c.archivos.titulo, organizacion: c.organizationName, periodo: periodoTexto }),
    ...(c.periodo.horaInicio && c.periodo.horaFin ? [t('envios.franja', { franja: `${c.periodo.horaInicio} – ${c.periodo.horaFin}` })] : []),
    c.externo
      ? t('envios.pieExterno', { organizacion: c.organizationName, envio: c.nombreEnvio })
      : t('envios.pie', { creador: c.creador.nombre ?? c.creador.email ?? c.organizationName, envio: c.nombreEnvio }),
  ];
  const html = parrafos.map((p) => `<p>${escaparHtml(p)}</p>`).join('');
  return { asunto, html, texto: parrafos.join('\n\n') };
}

/** Manda el correo con los adjuntos ya armados. `service`: la organización ya está validada. */
export async function enviarCorreoReporte(c: CorreoEnvio, service: SupabaseClient): Promise<string> {
  const t = await cargarTextos(c.idioma);
  const f = crearFormateador({ moneda: c.moneda, zonaHoraria: c.zona, idioma: c.idioma });
  const { asunto, html, texto } = cuerpoCorreo(c, t, f.fecha(c.periodo.fechaInicio), f.fecha(c.periodo.fechaFin));
  const r = await sendEmail(
    c.organizationId,
    { userId: c.creador.userId, userEmail: c.creador.email, orgName: c.organizationName },
    {
      to: [c.para],
      subject: asunto,
      content: { html, text: texto },
      related_type: 'scheduled_report',
      related_id: c.programadoId,
      kind: 'transactional',
      client_request_id: c.clave,
      strict_variables: false,
      attachments: c.archivos.adjuntos,
    },
    service,
  );
  return r.message.id;
}
