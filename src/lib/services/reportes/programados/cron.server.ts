/**
 * Cron de envíos programados (`GET /api/cron/reportes-programados`).
 *
 * Por cada envío vencido:
 *   1. Se RECLAMA moviendo `next_run_at` al siguiente con un UPDATE
 *      condicionado al valor leído: dos ejecuciones del cron a la vez no
 *      mandan dos veces (la que pierde no toca nada).
 *   2. Si la cuenta está suspendida, congelada o con la prueba vencida, este
 *      pase no manda nada. La programación sigue: el próximo ciclo sale
 *      cuando la cuenta vuelva a estar al día.
 *   3. Si quien lo programó ya no es miembro activo, el envío se pausa.
 *   4. Cada miembro activo recibe el reporte generado con SU sesión
 *      (`sesionDeMiembro`): su plan, su permiso y su alcance de sucursal. Si
 *      el envío es de todas las sucursales y la persona solo ve algunas,
 *      recibe un archivo por cada una. Si ya no alcanza, se pausa para esa
 *      persona y se avisa a quien lo programó. Nada sale sin permiso vigente.
 *   5. Los externos reciben lo que ve quien programó, y solo si quien los
 *      aprobó sigue siendo administrador.
 *   6. Se guardan el resultado (`last_*`) y el estado por destinatario.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { veredictoCorreoOperativo } from '@/lib/services/cuentaCorreo';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { todayInTz } from '@/lib/utils/dateCore';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { cargarTextos } from '@/lib/documents/textos';
import type { IdiomaDocumento } from '@/lib/documents/tipos';
import { archivosParaMiembro } from './archivosMiembro.server';
import { archivosDelEnvio, enviarCorreoReporte, idiomaDe, type ArchivosEnvio, type EnvioAArmar } from './envio.server';
import { COLUMNAS_PROGRAMADO, programacionDe, type FilaProgramado } from './programados.server';
import { esFormatoEnvio, leerDestinatarios, leerFiltros, nombreDePerfil, periodoDelEnvio, proximoEnvio, type Destinatario, type MotivoPausa } from './programacion';
import { sesionDeMiembro, type SesionEnvio } from './sesionMiembro.server';

/** Envíos por ejecución: cada uno genera un PDF por destinatario. */
export const LOTE_ENVIOS = 10;

export type ResultadoEnvio = 'enviado' | 'parcial' | 'fallido' | 'omitido';

export interface ResumenEnvio {
  id: string;
  estado: ResultadoEnvio | 'reclamado_por_otro';
  enviados: number;
  pausados: number;
  fallidos: number;
}

/** Errores que significan «esta persona ya no puede recibirlo»: se pausa, no se reintenta. */
export function motivoDeError(err: unknown): MotivoPausa | null {
  if (!(err instanceof OrgContextError)) return null;
  switch (err.code) {
    case 'PERMISSION_REQUIRED':
    case 'sin_permiso':
      return 'sin_permiso';
    case 'BRANCH_FORBIDDEN':
    case 'BRANCH_SCOPE_REQUIRED':
      return 'sin_alcance';
    case 'MODULO_NO_CONTRATADO':
    case 'NOT_FOUND':
      return 'modulo_no_contratado';
    case 'ORG_FORBIDDEN':
      return 'sin_membresia';
    default:
      return null;
  }
}

export function resultadoDe(enviados: number, fallidos: number): ResultadoEnvio {
  if (enviados > 0) return fallidos > 0 ? 'parcial' : 'enviado';
  return fallidos > 0 ? 'fallido' : 'omitido';
}

async function sigueSiendoAdmin(service: SupabaseClient, organizationId: number, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await service
    .from('organization_members')
    .select('role_id, is_super_admin')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  const m = data as { role_id: number; is_super_admin: boolean | null } | null;
  if (!m) return false;
  return hasOrgAdminOrPermission({ userId, organizationId, roleId: m.role_id, isSuperAdmin: m.is_super_admin === true, supabase: service });
}

interface Perfil {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_language: string | null;
}

async function leerPerfiles(service: SupabaseClient, ids: string[]): Promise<Map<string, Perfil>> {
  const { data } = await service.from('profiles').select('id, email, first_name, last_name, preferred_language').in('id', [...new Set(ids)]);
  return new Map(((data ?? []) as Perfil[]).map((p) => [p.id, p]));
}

async function avisarPausas(service: SupabaseClient, fila: FilaProgramado, pausas: Array<{ destinatario: string; motivo: MotivoPausa }>, idioma: IdiomaDocumento): Promise<void> {
  if (pausas.length === 0) return;
  const t = await cargarTextos(idioma);
  const { error } = await service.rpc('fn_create_org_notification', {
    p_organization_id: fila.organization_id,
    p_recipient_user_id: fila.user_id,
    p_channel: 'app',
    p_type: 'reporte_programado_pausado',
    p_title: t('envios.pausado.titulo', { envio: fila.name }),
    p_content: pausas.map((p) => t('envios.pausado.linea', { destinatario: p.destinatario, motivo: t(`envios.motivos.${p.motivo}`) })).join('\n'),
    p_metadata: { scheduled_report_id: fila.id, pausas },
  });
  if (error) console.warn('[reportes/programados] aviso de pausa falló', { id: fila.id, message: error.message });
}

async function cerrar(service: SupabaseClient, fila: FilaProgramado, cambios: Record<string, unknown>): Promise<void> {
  const { error } = await service.from('scheduled_reports').update(cambios).eq('id', fila.id).eq('organization_id', fila.organization_id);
  if (error) console.error('[reportes/programados] no se guardó el resultado', { id: fila.id, message: error.message });
}

export async function procesarEnvio(service: SupabaseClient, fila: FilaProgramado, ahora: Date): Promise<ResumenEnvio> {
  const prog = programacionDe(fila);
  const siguiente = proximoEnvio(prog, ahora);
  const { data: reclamado } = await service
    .from('scheduled_reports')
    .update({ next_run_at: siguiente?.toISOString() ?? null, ...(siguiente ? {} : { is_active: false }) })
    .eq('id', fila.id)
    .eq('is_active', true)
    .eq('next_run_at', fila.next_run_at as string)
    .select('id')
    .maybeSingle();
  if (!reclamado) return { id: fila.id, estado: 'reclamado_por_otro', enviados: 0, pausados: 0, fallidos: 0 };

  const base = { last_run_at: ahora.toISOString(), updated_at: ahora.toISOString() };
  const veredicto = await veredictoCorreoOperativo(service, fila.organization_id, ahora);
  if (!veredicto.enviar && veredicto.motivo === 'consulta') {
    await cerrar(service, fila, { ...base, next_run_at: fila.next_run_at, last_status: 'fallido', last_error: 'cuenta_no_consultada' });
    return { id: fila.id, estado: 'fallido', enviados: 0, pausados: 0, fallidos: 1 };
  }
  if (!veredicto.enviar) {
    await cerrar(service, fila, { ...base, last_status: 'omitido', last_error: veredicto.motivo });
    return { id: fila.id, estado: 'omitido', enviados: 0, pausados: 0, fallidos: 0 };
  }
  let dueno: SesionEnvio | null;
  try {
    dueno = await sesionDeMiembro(fila.organization_id, fila.user_id);
  } catch (err) {
    // El reclamo ya movió la próxima fecha. Si la sesión no abre, se devuelve
    // el vencimiento para que el siguiente cron lo reintente: si no, ese
    // correo se pierde hasta la semana siguiente.
    await cerrar(service, fila, { ...base, next_run_at: fila.next_run_at, last_status: 'fallido', last_error: 'sesion_no_disponible' });
    console.error('[reportes/programados] no se abrió la sesión de quien programó', { id: fila.id, message: err instanceof Error ? err.message : String(err) });
    return { id: fila.id, estado: 'fallido', enviados: 0, pausados: 0, fallidos: 1 };
  }
  const abiertas = dueno ? [dueno] : [];
  try {
  if (!dueno || !fila.report_id) {
    await cerrar(service, fila, { ...base, is_active: false, last_status: 'omitido', last_error: dueno ? 'sin_reporte' : 'creador_sin_acceso' });
    return { id: fila.id, estado: 'omitido', enviados: 0, pausados: 0, fallidos: 0 };
  }

  const destinatarios = leerDestinatarios(fila.recipients);
  const filtros = leerFiltros(fila.filtros, prog.frequency);
  const periodo = periodoDelEnvio(filtros, todayInTz(prog.zona));
  const envio: EnvioAArmar = {
    reportId: fila.report_id,
    branchId: fila.branch_id,
    formato: esFormatoEnvio(fila.formato) ? fila.formato : 'pdf',
    filtros,
    periodo,
    zona: prog.zona,
  };
  const [perfiles, moneda] = await Promise.all([
    leerPerfiles(service, [fila.user_id, ...destinatarios.flatMap((d) => (d.tipo === 'miembro' ? [d.user_id] : []))]),
    resolverContextoMoneda(service, fila.organization_id),
  ]);
  const perfilDueno = perfiles.get(fila.user_id);
  const idiomaDueno = idiomaDe(perfilDueno?.preferred_language);
  const archivosDelDueno = new Map<IdiomaDocumento, Promise<ArchivosEnvio>>();
  let adminAprobador: Map<string, Promise<boolean>> | null = null;

  let enviados = 0;
  let fallidos = 0;
  const errores: string[] = [];
  const pausas: Array<{ destinatario: string; motivo: MotivoPausa }> = [];
  const actualizados: Destinatario[] = [];

  for (const d of destinatarios) {
    if (d.estado !== 'activo') {
      actualizados.push(d);
      continue;
    }
    const pausar = (motivo: MotivoPausa) => {
      pausas.push({ destinatario: d.tipo === 'miembro' ? (d.nombre ?? d.email) : d.email, motivo });
      actualizados.push({ ...d, estado: 'pausado', motivo });
    };
    try {
      let sesion: SesionEnvio | null;
      let para: string;
      let idioma: IdiomaDocumento;
      let archivos: ArchivosEnvio;
      if (d.tipo === 'miembro') {
        sesion = d.user_id === fila.user_id ? dueno : await sesionDeMiembro(fila.organization_id, d.user_id);
        if (sesion && sesion !== dueno) abiertas.push(sesion);
        if (!sesion) {
          pausar('sin_membresia');
          continue;
        }
        const perfil = perfiles.get(d.user_id);
        para = perfil?.email ?? d.email;
        idioma = idiomaDe(perfil?.preferred_language);
        archivos = await archivosParaMiembro(sesion, envio, idioma);
      } else {
        adminAprobador ??= new Map();
        const clave = d.aprobado_por ?? '';
        if (!adminAprobador.has(clave)) adminAprobador.set(clave, sigueSiendoAdmin(service, fila.organization_id, d.aprobado_por));
        if (!(await adminAprobador.get(clave))) {
          pausar('aprobador_sin_acceso');
          continue;
        }
        sesion = dueno;
        para = d.email;
        idioma = idiomaDueno;
        if (!archivosDelDueno.has(idioma)) archivosDelDueno.set(idioma, archivosDelEnvio(dueno, envio, idioma));
        archivos = await (archivosDelDueno.get(idioma) as Promise<ArchivosEnvio>);
      }
      await enviarCorreoReporte(
        {
          organizationId: fila.organization_id,
          organizationName: dueno.organizationName,
          creador: { userId: fila.user_id, email: perfilDueno?.email ?? null, nombre: nombreDePerfil(perfilDueno) },
          para,
          nombreDestinatario: d.tipo === 'miembro' ? (nombreDePerfil(perfiles.get(d.user_id)) ?? d.nombre) : null,
          externo: d.tipo === 'externo',
          nombreEnvio: fila.name,
          programadoId: fila.id,
          archivos,
          periodo,
          idioma,
          zona: prog.zona,
          moneda,
          clave: `reporte-programado:${fila.id}:${fila.next_run_at}:${para.toLowerCase()}`,
        },
        service,
      );
      enviados++;
      actualizados.push(d);
    } catch (err) {
      const motivo = motivoDeError(err);
      if (motivo) {
        pausar(motivo);
        continue;
      }
      fallidos++;
      actualizados.push(d);
      const codigo = err instanceof OrgContextError ? err.code : err instanceof Error ? err.message.slice(0, 120) : 'error_desconocido';
      errores.push(codigo);
      console.error('[reportes/programados] envío falló', { id: fila.id, destinatario: d.tipo, codigo });
    }
  }

  const estado = resultadoDe(enviados, fallidos);
  await cerrar(service, fila, {
    ...base,
    recipients: actualizados,
    last_status: estado,
    last_error: errores.length > 0 ? [...new Set(errores)].join('; ').slice(0, 500) : null,
  });
  await avisarPausas(service, fila, pausas, idiomaDueno);
  return { id: fila.id, estado, enviados, pausados: pausas.length, fallidos };
  } finally {
    await Promise.all(abiertas.map((s) => s.cerrar?.() ?? Promise.resolve()));
  }
}

/** Procesa hasta `LOTE_ENVIOS` envíos vencidos, en orden de vencimiento. */
export async function ejecutarEnviosVencidos(ahora: Date = new Date()): Promise<ResumenEnvio[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('scheduled_reports')
    .select(COLUMNAS_PROGRAMADO)
    .eq('is_active', true)
    .not('next_run_at', 'is', null)
    .lte('next_run_at', ahora.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(LOTE_ENVIOS);
  if (error) throw new Error(`No se pudieron leer los envíos vencidos: ${error.message}`);
  const resumen: ResumenEnvio[] = [];
  for (const fila of (data ?? []) as unknown as FilaProgramado[]) {
    try {
      resumen.push(await procesarEnvio(service, fila, ahora));
    } catch (err) {
      console.error('[reportes/programados] envío abortado', { id: fila.id, message: err instanceof Error ? err.message : String(err) });
      await cerrar(service, fila, { last_run_at: ahora.toISOString(), last_status: 'fallido', last_error: 'error_interno' });
      resumen.push({ id: fila.id, estado: 'fallido', enviados: 0, pausados: 0, fallidos: 1 });
    }
  }
  return resumen;
}
