/**
 * Ley 2300 de 2023 («Dejen de fregar»): horarios y periodicidad del contacto.
 *
 * Módulo PURO (sin base, sin red, sin Next): lo usan el despachador de voz
 * (`voiceAgentService.dialClaimedCall`, punto único donde sale toda llamada del
 * agente), el despacho puntual y el diagnóstico del panel. Las pruebas corren
 * con `TZ=UTC` y `TZ=America/Bogota`: nada de aquí depende del huso del
 * proceso, todo va con la zona explícita del destinatario.
 *
 * Fuente (verificada el 2026-09-29; el texto oficial está en el Gestor
 * Normativo de Función Pública, norma 213990, y en la Secretaría del Senado):
 *  - Art. 3 «Horarios y periodicidad»: el contacto se hace «dentro del horario
 *    de lunes a viernes y de 7:00 a. m. a 7:00 p. m., y sábados de 8:00 a. m. a
 *    3:00 p. m., excluyendo cualquier tipo de contacto con el consumidor los
 *    domingos y días festivos».
 *  - El envío de publicidad por SMS, mensajería, correo y las «llamadas
 *    telefónicas de carácter comercial o publicitario» solo puede hacerse dentro
 *    de los horarios del artículo 3.
 *  - Periodicidad: el texto literal del art. 3 («no podrá ser contactado ...
 *    mediante varios canales dentro de una misma semana ni en más de una ocasión
 *    durante el mismo día») está redactado para la cobranza. Para la prospección
 *    el dueño fijó (2026-09-29) una regla igual o más estricta, que es la que se
 *    aplica aquí: como máximo UN contacto efectivo por semana y por canal, y no
 *    más de DOS en la semana sumando canales distintos.
 *  - La Corte Constitucional declaró exequible la ley (Sentencia C-278 de 2024).
 *
 * «Contacto» = contacto EFECTIVO (la persona contestó). Un buzón de voz, una
 * llamada no contestada o un fax no cuentan: la ley habla de «establecido un
 * contacto directo con el consumidor».
 *
 * La hora que manda es la del DESTINATARIO: para números +57 es siempre
 * America/Bogota (Colombia tiene un solo huso y no cambia de hora).
 *
 * Festivos: Ley 51 de 1983 («Ley Emiliani») + fiestas móviles de Pascua. No
 * había calendario de festivos en el repositorio (verificado: ni tabla en la
 * base ni módulo en `src/`), así que se calcula aquí, sin tabla que mantener.
 */

/** Zona de Colombia (único huso nacional, sin horario de verano). */
export const ZONA_COLOMBIA = 'America/Bogota';

/**
 * Canales que cuentan para la periodicidad. Los cuatro primeros son los
 * literales de `contact_consents.channel`; `mensajeria` agrupa Instagram,
 * Facebook y el chat web (`fn_contactos_efectivos_semana`).
 */
export type CanalContacto = 'voice' | 'whatsapp' | 'sms' | 'email' | 'mensajeria';

/** Tope por canal y semana (regla del dueño, ver cabecera). */
export const MAX_CONTACTOS_POR_CANAL_SEMANA = 1;
/** Tope total de la semana sumando canales distintos. */
export const MAX_CONTACTOS_TOTAL_SEMANA = 2;

/** Días de búsqueda de la siguiente ventana. Con festivos seguidos nunca pasa de 4. */
const DIAS_BUSQUEDA_VENTANA = 21;

const MINUTO_MS = 60 * 1000;
const DIA_MS = 24 * 60 * MINUTO_MS;

// ─── Calendario ──────────────────────────────────────────────────────────────

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

function plano(anio: number, mes: number, dia: number): string {
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/** Día calendario + N días (aritmética en UTC puro, sin husos). */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d) + dias * DIA_MS);
  return plano(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = domingo … 6 = sábado, para un día calendario YYYY-MM-DD. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Domingo de Pascua (algoritmo anónimo gregoriano de Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return plano(anio, mes, dia);
}

/** Traslada al lunes siguiente si no cae en lunes (Ley 51 de 1983). */
function alLunes(fecha: string): string {
  const dow = diaSemana(fecha);
  if (dow === 1) return fecha;
  return sumarDias(fecha, (8 - dow) % 7);
}

const cacheFestivos = new Map<number, Set<string>>();

/** Festivos nacionales de Colombia de un año (YYYY-MM-DD, ordenados). */
export function festivosColombia(anio: number): string[] {
  return Array.from(conjuntoFestivos(anio)).sort();
}

function conjuntoFestivos(anio: number): Set<string> {
  const cached = cacheFestivos.get(anio);
  if (cached) return cached;
  const pascua = domingoDePascua(anio);
  const dias = [
    // Fijos: no se trasladan.
    plano(anio, 1, 1), // Año Nuevo
    plano(anio, 5, 1), // Día del Trabajo
    plano(anio, 7, 20), // Independencia
    plano(anio, 8, 7), // Batalla de Boyacá
    plano(anio, 12, 8), // Inmaculada Concepción
    plano(anio, 12, 25), // Navidad
    // Ley Emiliani: se trasladan al lunes siguiente.
    alLunes(plano(anio, 1, 6)), // Reyes Magos
    alLunes(plano(anio, 3, 19)), // San José
    alLunes(plano(anio, 6, 29)), // San Pedro y San Pablo
    alLunes(plano(anio, 8, 15)), // Asunción de la Virgen
    alLunes(plano(anio, 10, 12)), // Día de la Raza
    alLunes(plano(anio, 11, 1)), // Todos los Santos
    alLunes(plano(anio, 11, 11)), // Independencia de Cartagena
    // Móviles de Pascua.
    sumarDias(pascua, -3), // Jueves Santo
    sumarDias(pascua, -2), // Viernes Santo
    sumarDias(pascua, 43), // Ascensión del Señor (jueves +39 → lunes)
    sumarDias(pascua, 64), // Corpus Christi (jueves +60 → lunes)
    sumarDias(pascua, 71), // Sagrado Corazón (viernes +68 → lunes)
  ];
  const set = new Set(dias);
  cacheFestivos.set(anio, set);
  return set;
}

export function esFestivoColombia(fecha: string): boolean {
  const anio = Number(fecha.slice(0, 4));
  return conjuntoFestivos(anio).has(fecha);
}

// ─── Horas de pared en una zona ──────────────────────────────────────────────

interface PartesLocales {
  fecha: string;
  minutosDelDia: number;
}

/** Día calendario y minuto del día de un instante en una zona IANA. */
export function partesLocales(instante: Date, zona: string): PartesLocales {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(instante)) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  return {
    fecha: plano(p.year, p.month, p.day),
    minutosDelDia: (p.hour % 24) * 60 + p.minute,
  };
}

/** Instante de una hora de pared (fecha + minutos) en una zona. */
export function instanteLocal(fecha: string, minutosDelDia: number, zona: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  const paredUtc = Date.UTC(a, m - 1, d, Math.floor(minutosDelDia / 60), minutosDelDia % 60);
  // Dos pasadas bastan para zonas con DST; Colombia no tiene.
  let t = paredUtc;
  for (let i = 0; i < 2; i++) {
    const p = partesLocales(new Date(t), zona);
    const [pa, pm, pd] = p.fecha.split('-').map(Number);
    const vistoUtc = Date.UTC(pa, pm - 1, pd, Math.floor(p.minutosDelDia / 60), p.minutosDelDia % 60);
    t += paredUtc - vistoUtc;
  }
  return new Date(t);
}

// ─── Ventana legal ───────────────────────────────────────────────────────────

export interface VentanaDia {
  /** Minuto del día en que abre (inclusive). */
  desde: number;
  /** Minuto del día en que cierra (exclusivo: a las 19:00 ya no se llama). */
  hasta: number;
}

/**
 * Ventana de contacto de un día calendario del destinatario, o `null` si ese
 * día no se puede contactar (domingo o festivo).
 */
export function ventanaDelDia(fecha: string): VentanaDia | null {
  const dow = diaSemana(fecha);
  if (dow === 0) return null;
  if (esFestivoColombia(fecha)) return null;
  if (dow === 6) return { desde: 8 * 60, hasta: 15 * 60 };
  return { desde: 7 * 60, hasta: 19 * 60 };
}

/** ¿Se puede contactar en este instante, en la zona del destinatario? */
export function ventanaLey2300Abierta(instante: Date, zona: string = ZONA_COLOMBIA): boolean {
  const p = partesLocales(instante, zona);
  const v = ventanaDelDia(p.fecha);
  return !!v && p.minutosDelDia >= v.desde && p.minutosDelDia < v.hasta;
}

/**
 * Primer instante válido a partir de `desde` (incluido). Si la ventana está
 * abierta, devuelve `desde` tal cual.
 */
export function siguienteVentanaLey2300(desde: Date, zona: string = ZONA_COLOMBIA): Date {
  if (ventanaLey2300Abierta(desde, zona)) return desde;
  const p = partesLocales(desde, zona);
  for (let i = 0; i < DIAS_BUSQUEDA_VENTANA; i++) {
    const fecha = sumarDias(p.fecha, i);
    const v = ventanaDelDia(fecha);
    if (!v) continue;
    if (i === 0 && p.minutosDelDia >= v.hasta) continue; // hoy ya cerró
    return instanteLocal(fecha, v.desde, zona);
  }
  // Inalcanzable con el calendario real; se deja una salida segura (nunca «ya»).
  return new Date(desde.getTime() + DIA_MS);
}

/** Lunes 00:00 (hora del destinatario) de la semana del instante. */
export function inicioSemanaLocal(instante: Date, zona: string = ZONA_COLOMBIA): Date {
  const p = partesLocales(instante, zona);
  const dow = diaSemana(p.fecha);
  const lunes = sumarDias(p.fecha, -((dow + 6) % 7));
  return instanteLocal(lunes, 0, zona);
}

/** Lunes 00:00 de la semana SIGUIENTE (fin exclusivo de la semana actual). */
export function inicioSemanaSiguienteLocal(instante: Date, zona: string = ZONA_COLOMBIA): Date {
  const p = partesLocales(inicioSemanaLocal(instante, zona), zona);
  return instanteLocal(sumarDias(p.fecha, 7), 0, zona);
}

// ─── Periodicidad ────────────────────────────────────────────────────────────

/** Contactos efectivos de la semana por canal. Claves desconocidas suman al total. */
export type ConteoSemana = Partial<Record<CanalContacto, number>> & Record<string, number | undefined>;

export type MotivoTope = 'tope_canal_semana' | 'tope_total_semana';

/** ¿Cabe un contacto más por `canal` esta semana? */
export function evaluarTopeSemanal(
  conteos: ConteoSemana,
  canal: CanalContacto
): { permitido: true } | { permitido: false; motivo: MotivoTope } {
  const delCanal = Math.max(0, Number(conteos[canal] ?? 0));
  if (delCanal >= MAX_CONTACTOS_POR_CANAL_SEMANA) return { permitido: false, motivo: 'tope_canal_semana' };
  const total = Object.values(conteos).reduce<number>((s, n) => s + Math.max(0, Number(n ?? 0)), 0);
  if (total >= MAX_CONTACTOS_TOTAL_SEMANA) return { permitido: false, motivo: 'tope_total_semana' };
  return { permitido: true };
}

// ─── Zona del destinatario ───────────────────────────────────────────────────

function zonaValida(zona: string | null | undefined): zona is string {
  if (!zona) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/**
 * La hora que manda es la del destinatario. Un número colombiano (+57) está
 * siempre en America/Bogota, diga lo que diga la ficha del cliente. Para el
 * resto se usa `customers.timezone` y, si no sirve, Colombia.
 */
export function zonaHorariaDestinatario(telefonoE164: string | null | undefined, zonaCliente?: string | null): string {
  const tel = (telefonoE164 || '').replace(/[\s\-()]/g, '');
  if (tel.startsWith('+57')) return ZONA_COLOMBIA;
  return zonaValida(zonaCliente) ? zonaCliente : ZONA_COLOMBIA;
}

// ─── Decisión única ──────────────────────────────────────────────────────────

export type DecisionContacto =
  | { accion: 'contactar'; zona: string }
  | {
      accion: 'reprogramar';
      zona: string;
      motivo: 'fuera_de_horario' | MotivoTope;
      /** Primer instante legal para volver a intentarlo. */
      en: Date;
    };

/**
 * Decide si se contacta ahora o cuándo. Primero la periodicidad (si la semana
 * ya está llena, la siguiente oportunidad es la primera ventana de la semana
 * que viene) y después el horario.
 */
export function decidirContactoLey2300(p: {
  ahora: Date;
  telefonoE164: string | null | undefined;
  zonaCliente?: string | null;
  canal: CanalContacto;
  conteosSemana: ConteoSemana;
}): DecisionContacto {
  const zona = zonaHorariaDestinatario(p.telefonoE164, p.zonaCliente);
  const tope = evaluarTopeSemanal(p.conteosSemana, p.canal);
  if (!tope.permitido) {
    return {
      accion: 'reprogramar',
      zona,
      motivo: tope.motivo,
      en: siguienteVentanaLey2300(inicioSemanaSiguienteLocal(p.ahora, zona), zona),
    };
  }
  if (!ventanaLey2300Abierta(p.ahora, zona)) {
    return { accion: 'reprogramar', zona, motivo: 'fuera_de_horario', en: siguienteVentanaLey2300(p.ahora, zona) };
  }
  return { accion: 'contactar', zona };
}

/** Texto corto del motivo para `error_message` y para el registro. */
export function describirMotivoLey2300(motivo: 'fuera_de_horario' | MotivoTope): string {
  switch (motivo) {
    case 'fuera_de_horario':
      return 'fuera del horario legal de contacto (Ley 2300 de 2023)';
    case 'tope_canal_semana':
      return 'ya hubo un contacto por este canal esta semana (Ley 2300 de 2023)';
    case 'tope_total_semana':
      return 'ya hubo dos contactos esta semana por distintos canales (Ley 2300 de 2023)';
  }
}
