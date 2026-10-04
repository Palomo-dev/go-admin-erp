import { z } from 'zod';
import type { ToolContext, ToolResult } from '../voiceAgentTools';
import type { CalendarEventRow } from '../meetingsService';
import { wallTimeToInstant } from '@/lib/utils/dateCore';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { zonaHorariaOrganizacion } from './cumplimiento';
import { notificarReunion } from '../reunionCorreo.server';

const entradaSchema = z.object({
  start_at: z.string(),
  duration_minutes: z.number().finite().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(5000).optional(),
}).strict();

/** Sin desfase, la hora es de la organización; fechas imposibles se rechazan. */
export function resolverInicioReunion(valor: string | null | undefined, zona: string): Date | null {
  const texto = (valor ?? '').trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(texto)) {
    const iso = texto.replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(/z$/, 'Z');
    if (!z.string().datetime({ offset: true }).safeParse(iso).success) return null;
    const instante = Date.parse(iso);
    return Number.isFinite(instante) ? new Date(instante) : null;
  }
  const partes = texto.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (!partes || !z.string().date().safeParse(partes[1]).success) return null;
  if (Number(partes[2]) > 23 || Number(partes[3]) > 59 || Number(partes[4] ?? 0) > 59) return null;
  try {
    const instante = wallTimeToInstant(partes[1], `${partes[2].padStart(2, '0')}:${partes[3]}:${partes[4] ?? '00'}`, zona);
    return Number.isFinite(instante.getTime()) ? instante : null;
  } catch {
    return null;
  }
}

const errores: Record<string, string> = {
  rango_invalido: 'Revisa la fecha y la duración de la reunión.',
  datos_invalidos: 'Revisa los datos de la reunión.',
  zona_horaria_invalida: 'La zona horaria cambió; vuelve a consultar el horario.',
  clave_reutilizada: 'Ya existe una reunión para ese horario con otros datos.',
  sesion_voz_sin_evidencia: 'La sesión de voz no está habilitada para agendar.',
  herramienta_no_permitida: 'Este agente no tiene habilitado agendar reuniones.',
};

/** Una RPC guarda calendario e historial; el aviso se intenta después. */
export async function bookMeeting(
  ctx: ToolContext,
  args: { start_at: string; duration_minutes?: number; title?: string; notes?: string },
): Promise<ToolResult> {
  const parsed = entradaSchema.safeParse(args);
  if (!parsed.success) return { success: false, error: 'Revisa los datos de la reunión.' };
  if (!ctx.voiceAgentCallId) return { success: false, error: 'La llamada no tiene contexto para agendar una reunión.' };
  const zona = await zonaHorariaOrganizacion(ctx.supabase, ctx.orgId);
  const inicio = resolverInicioReunion(parsed.data.start_at, zona);
  if (!inicio) return { success: false, error: 'Fecha de inicio inválida: indica una fecha y una hora válidas.' };
  if (inicio.getTime() < Date.now()) return { success: false, error: 'La reunión no puede ser en el pasado' };
  const minutos = Math.min(Math.max(parsed.data.duration_minutes || 30, 15), 180);
  const { data, error } = await ctx.supabase.rpc('fn_crm_agendar_reunion_voz', {
    p_org: ctx.orgId,
    p_vac: ctx.voiceAgentCallId,
    p_payload: {
      title: parsed.data.title ?? 'Reunión agendada por el agente IA',
      description: parsed.data.notes ?? null,
      start_at: inicio.toISOString(),
      end_at: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
      timezone: zona,
    },
  });
  if (error) return { success: false, error: errores[error.message] ?? 'No se pudo agendar la reunión. Vuelve a intentarlo.' };
  const result = data as { event: CalendarEventRow; activity_id: string } | null;
  if (!result?.event?.id || !result.activity_id) {
    return { success: false, error: 'No se pudo confirmar el calendario y el historial de la reunión.' };
  }
  const evento = result.event;
  const invite = await notificarReunion(ctx.orgId, { userId: evento.created_by }, evento, ctx.supabase);
  const cuando = formatDateTimeInTz(evento.start_at, evento.timezone ?? zona, { locale: 'es-CO' });
  return {
    success: true,
    data: { id: evento.id, start_at: evento.start_at, end_at: evento.end_at,
      activity_id: result.activity_id, local: cuando, timezone: evento.timezone ?? zona, invite },
    say: `Listo, la reunión quedó agendada para el ${cuando}.`,
  };
}
