/** Horario y capacidad del destinatario, con la misma regla que voz. No recibe force. */
import { decidirContactoLey2300, inicioSemanaLocal, inicioSemanaSiguienteLocal, instanteLocal,
  MAX_CONTACTOS_POR_CANAL_SEMANA, MAX_CONTACTOS_TOTAL_SEMANA, partesLocales, ventanaDelDia, zonaHorariaDestinatario } from './ley2300.ts';
import { isWithinAllowedHours, nextAllowedSlot, type AllowedHours } from './allowedHours.ts';
import { normalizePhoneDigits, resolverIndicativo } from './telefono.ts';
import type { ClienteRpcContacto } from './puerta.ts';

interface ContextoLegal {
  gate: { allowed: boolean; reason?: string };
  required: boolean;
  phone_raw: string | null;
  identity_raw: boolean;
  timezone: string | null;
  default_country_code: string | null;
  allowed_hours: unknown;
  server_now: string;
}
export type ContactoLegal = { allowed: true; exemption?: 'numero_prueba' }
  | { allowed: false; reason: string; retryAt?: string; uncertain?: boolean };

function validarHorario(value: unknown): AllowedHours | null {
  if (value == null) return null;
  const r = value as AllowedHours;
  const hora = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!r || typeof r.tz !== 'string' || !Array.isArray(r.days) || !r.days.length
    || !r.days.every(n => Number.isInteger(n) && n >= 0 && n <= 6)
    || typeof r.from !== 'string' || typeof r.to !== 'string' || !hora.test(r.from) || !hora.test(r.to) || r.from >= r.to)
    throw new Error('Horario inválido');
  new Intl.DateTimeFormat('en-US', { timeZone: r.tz });
  return r;
}

/** Intersección de la franja de organización y la ley; ninguna amplía la otra. */
export function siguienteVentanaComun(desde: Date, telefono: string, zonaCliente: string | null, horario: AllowedHours | null): Date | null {
  let candidato = desde;
  const limite = desde.getTime() + 28 * 24 * 60 * 60_000;
  for (let i = 0; i < 60 && candidato.getTime() <= limite; i++) {
    const ley = decidirContactoLey2300({ ahora: candidato, telefonoE164: telefono, zonaCliente, canal: 'whatsapp', conteosSemana: {} });
    if (ley.accion === 'reprogramar') { candidato = ley.en; continue; }
    if (isWithinAllowedHours(horario, candidato)) return candidato;
    const proxima = nextAllowedSlot(horario, candidato);
    if (proxima.getTime() <= candidato.getTime()) return null;
    candidato = proxima;
  }
  return null;
}

async function rpc(cliente: ClienteRpcContacto, nombre: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await cliente.rpc(nombre, args);
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Compuerta no disponible');
  return data as Record<string, unknown>;
}

function retry(en: Date | null, reason: string): ContactoLegal {
  return en ? { allowed: false, reason, retryAt: en.toISOString() } : { allowed: false, reason: 'legal_schedule_unavailable' };
}

export async function reservarContactoLegal(cliente: ClienteRpcContacto, org: number, mensaje: string, token: string,
  destinatario: string, indicativoEntorno?: string | null,
): Promise<ContactoLegal> {
  try {
    const ctx = await rpc(cliente, 'crm_message_legal_context', { p_org: org, p_message: mensaje }) as unknown as ContextoLegal;
    if (!ctx.gate || typeof ctx.gate.allowed !== 'boolean' || typeof ctx.required !== 'boolean') throw new Error('Contexto inválido');
    if (!ctx.gate.allowed) return { allowed: false, reason: ctx.gate.reason || 'contact_blocked' };
    if (!ctx.required) return { allowed: true };
    const ahora = new Date(ctx.server_now);
    if (!Number.isFinite(ahora.getTime()) || typeof ctx.phone_raw !== 'string' || typeof ctx.identity_raw !== 'boolean'
      || (ctx.timezone !== null && typeof ctx.timezone !== 'string')
      || (ctx.default_country_code !== null && typeof ctx.default_country_code !== 'string')) throw new Error('Contexto inválido');
    const digitos = normalizePhoneDigits(ctx.phone_raw, ctx.identity_raw ? null : resolverIndicativo(ctx.default_country_code, indicativoEntorno));
    if (!digitos || digitos !== destinatario) return { allowed: false, reason: 'recipient_changed' };
    const telefono = `+${digitos}`;
    const horario = validarHorario(ctx.allowed_hours);
    const ley = decidirContactoLey2300({ ahora, telefonoE164: telefono, zonaCliente: ctx.timezone, canal: 'whatsapp', conteosSemana: {} });
    if (ley.accion === 'reprogramar') return retry(siguienteVentanaComun(ley.en, telefono, ctx.timezone, horario), ley.motivo);
    if (!isWithinAllowedHours(horario, ahora)) return retry(siguienteVentanaComun(ahora, telefono, ctx.timezone, horario), 'outside_hours');
    const zona = zonaHorariaDestinatario(telefono, ctx.timezone);
    const pared = partesLocales(ahora, zona);
    const ventana = ventanaDelDia(pared.fecha);
    if (!ventana) throw new Error('Ventana inválida');
    let apertura = instanteLocal(pared.fecha, ventana.desde, zona);
    let cierre = instanteLocal(pared.fecha, ventana.hasta, zona);
    if (horario) {
      const fecha = partesLocales(ahora, horario.tz).fecha;
      const minutos = (hora: string) => { const [h, m] = hora.split(':').map(Number); return h * 60 + m; };
      apertura = new Date(Math.max(apertura.getTime(), instanteLocal(fecha, minutos(horario.from), horario.tz).getTime()));
      cierre = new Date(Math.min(cierre.getTime(), instanteLocal(fecha, minutos(horario.to), horario.tz).getTime()));
    }
    // Una espera de candado larga obliga a comprobar otra vez la ventana.
    cierre = new Date(Math.min(cierre.getTime(), ahora.getTime() + 30_000));
    const reserva = await rpc(cliente, 'crm_reserve_legal_contact', {
      p_org: org, p_message: mensaje, p_token: token, p_raw: ctx.phone_raw, p_phone: telefono, p_zone: zona,
      p_from: inicioSemanaLocal(ahora, zona).toISOString(), p_until: inicioSemanaSiguienteLocal(ahora, zona).toISOString(),
      p_open: apertura.toISOString(), p_close: cierre.toISOString(),
      p_limits: { channel: MAX_CONTACTOS_POR_CANAL_SEMANA, total: MAX_CONTACTOS_TOTAL_SEMANA },
    });
    if (reserva.allowed === true) return { allowed: true, ...(reserva.exemption === 'numero_prueba' ? { exemption: 'numero_prueba' as const } : {}) };
    if (reserva.reason === 'weekly_capacity') {
      const counts = reserva.counts as Record<string, number> | null;
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)
        || Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Conteos inválidos');
      const decision = decidirContactoLey2300({ ahora, telefonoE164: telefono, zonaCliente: ctx.timezone, canal: 'whatsapp', conteosSemana: counts });
      if (decision.accion !== 'reprogramar') throw new Error('Capacidad discordante');
      return retry(siguienteVentanaComun(decision.en, telefono, ctx.timezone, horario), decision.motivo);
    }
    if (reserva.reason === 'window_changed') {
      const reloj = new Date(typeof reserva.server_now === 'string' ? reserva.server_now : ctx.server_now);
      if (!Number.isFinite(reloj.getTime())) throw new Error('Reloj inválido');
      return retry(siguienteVentanaComun(new Date(reloj.getTime() + 60_000), telefono, ctx.timezone, horario), 'window_changed');
    }
    return { allowed: false, reason: typeof reserva.reason === 'string' ? reserva.reason : 'legal_gate_unavailable',
      ...(reserva.reason === 'dispatch_unresolved' ? { uncertain: true } : {}) };
  } catch { return { allowed: false, reason: 'legal_gate_unavailable' }; }
}
