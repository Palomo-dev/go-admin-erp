/**
 * Cierre de la llamada del agente de voz: despedida obligatoria y tope de un
 * reintento ante el desinterés.
 *
 * Caso real (org 125, 2026-10-07, `voice_agent_calls` 6f7d4e15): el cliente
 * dijo «No, todo funciona perfecto» y el modelo llamó `log_objection` y
 * `end_call` en el mismo turno. La llamada se cortó en 3 s SIN despedida y el
 * agente se rindió a la primera objeción. Decisión del dueño:
 *
 *  1. Despedirse SIEMPRE antes de colgar, garantizado por el runtime: si el
 *     último texto hablado no fue una despedida, el runtime dice una corta
 *     (configurable por agente) y espera a que termine de sonar.
 *  2. Ante la PRIMERA objeción de desinterés, UN solo reintento breve. Si el
 *     cliente vuelve a decir que no, despedida y fin. Nunca más de uno.
 *  3. Si el cliente pide no ser llamado (Ley 2300 / Ley 1581) NO hay
 *     reintento: se respeta la baja como siempre (`log_consent_opt_out`).
 *
 * Todo lo de aquí es lógica pura (sin red ni base): lo usa
 * `conversationRelayHandler` y lo prueban los tests de `src/__tests__/voz`.
 */

/** Despedida que dice el runtime cuando el modelo cuelga sin despedirse. */
export const DESPEDIDA_POR_DEFECTO = 'Entiendo, muchas gracias por su tiempo. Que tenga un buen día.';

/** Tope de caracteres de la despedida configurada (una frase, no un discurso). */
export const MAX_DESPEDIDA = 200;

/**
 * Despedida del agente: `voice_agents.guardrails.despedida` si la organización
 * la configuró (texto no vacío, acotado); si no, la de por defecto.
 */
export function despedidaDelAgente(guardrails: Record<string, unknown> | null | undefined): string {
  const valor = (guardrails ?? {}).despedida;
  if (typeof valor !== 'string') return DESPEDIDA_POR_DEFECTO;
  const limpia = valor.replace(/\s+/g, ' ').trim();
  if (!limpia) return DESPEDIDA_POR_DEFECTO;
  return limpia.length > MAX_DESPEDIDA ? DESPEDIDA_POR_DEFECTO : limpia;
}

const PATRON_DESPEDIDA =
  /(gracias por su tiempo|gracias por atender|que (tenga|pase) (un |una )?(buen|buena|feliz|lindo|linda|excelente)|feliz (d[ií]a|tarde|noche)|buen d[ií]a|hasta luego|hasta pronto|adi[oó]s|que le vaya (muy )?bien|chao|nos vemos)/i;

/** ¿El texto ya es (o termina en) una despedida? */
export function esDespedida(texto: string | null | undefined): boolean {
  return PATRON_DESPEDIDA.test((texto ?? '').trim());
}

/**
 * ¿La persona pidió no volver a ser contactada? Solo se usa para NO exigir el
 * reintento (dirección segura: un falso positivo solo evita insistir). La baja
 * la sigue registrando el modelo con `log_consent_opt_out`, como siempre.
 */
const PATRON_BAJA =
  /(no (me|nos) (vuelva[ns]? a |)llame[ns]?|no (me |nos )?(vuelvan|vuelva) a llamar|no (me |nos )?llamen m[aá]s|no quiero que me (llamen|vuelvan a llamar|contacten)|no (me |nos )?(contacte[ns]?|molesten) m[aá]s|qu[ií]te(me|nme|nos)? de (la|su|sus|esa|esta) (lista|base)|b[oó]rre(me|nme|nos) de|s[aá]que(me|nme|nos) de (la|su|sus) (lista|base))/i;

export function pideNoSerLlamado(texto: string | null | undefined): boolean {
  return PATRON_BAJA.test((texto ?? '').trim());
}

// ─── Clasificación de objeciones ─────────────────────────────────────────────

/**
 * Tipos de objeción de `log_objection`. Solo `desinteres` cuenta para el tope
 * de reintentos y para dar la oportunidad por perdida; «llámeme después»
 * (`momento`) NO es desinterés.
 */
export const TIPOS_OBJECION = ['desinteres', 'ya_tiene_solucion', 'precio', 'momento', 'competidor', 'otro'] as const;
export type TipoObjecion = (typeof TIPOS_OBJECION)[number];

/** Tipos que cuentan como «no me interesa». */
const TIPOS_DESINTERES: readonly TipoObjecion[] = ['desinteres', 'ya_tiene_solucion'];

const PATRON_TEXTO_DESINTERES =
  /(no (me |nos |le |les )?interesa|sin inter[eé]s|no (estoy|estamos) interesad|no (lo |la |los )?necesit|no (me |nos )?hace falta|ya (tengo|tenemos|cuento|contamos)|(todo )?funciona (perfecto|bien)|no gracias)/i;

/**
 * Tipo de una objeción. Con `tipo` válido manda el modelo; sin él (agentes con
 * historial anterior al campo) se clasifica por el texto, y lo que no parezca
 * desinterés queda como `otro` (no cuenta).
 */
export function clasificarObjecion(tipo: unknown, texto: string | null | undefined): TipoObjecion {
  if (typeof tipo === 'string' && (TIPOS_OBJECION as readonly string[]).includes(tipo)) return tipo as TipoObjecion;
  return PATRON_TEXTO_DESINTERES.test(texto ?? '') ? 'desinteres' : 'otro';
}

export function esDesinteres(tipo: TipoObjecion): boolean {
  return TIPOS_DESINTERES.includes(tipo);
}

// ─── Estado del cierre de una llamada ────────────────────────────────────────

export interface ObjecionRegistrada {
  texto: string;
  detalle: string | null;
  tipo: TipoObjecion;
}

/** Qué hacer cuando el modelo pide `end_call`. */
export type DecisionEndCall =
  /** Colgar (con despedida garantizada). */
  | { accion: 'colgar' }
  /** Primera objeción de desinterés sin reintento: se rechaza el `end_call` UNA vez. */
  | { accion: 'exigir_reintento'; mensaje: string };

/** Instrucción que recibe el modelo cuando cuelga sin el único reintento. */
export const MENSAJE_EXIGIR_REINTENTO =
  'Todavía no cuelgues. Es la PRIMERA vez que el cliente muestra desinterés: haz UN solo intento breve, ' +
  'una pregunta o argumento corto relacionado con lo que acaba de decir (por ejemplo, si ya tiene un ' +
  'software: «¿Ese software también le maneja la facturación electrónica y el inventario?»). ' +
  'Una sola frase, sin presionar. Si vuelve a decir que no, registra la objeción, despídete y usa end_call.';

/**
 * Cuenta las objeciones de desinterés de la llamada (una por turno del
 * cliente) y decide si el agente puede colgar o le queda el único reintento.
 *
 *  - 1.ª objeción de desinterés: el primer `end_call` se rechaza con
 *    `MENSAJE_EXIGIR_REINTENTO` (una vez; nunca más).
 *  - 2.ª objeción de desinterés: desinterés DEFINITIVO. El runtime cierra la
 *    llamada aunque el modelo quiera seguir: nunca hay un segundo reintento.
 *  - Baja (`log_consent_opt_out` o frase de baja): sin reintento, sin pérdida.
 */
export class ControlCierre {
  private turnosConDesinteres = new Set<number>();
  private reintentoExigido = false;
  private baja = false;
  private ultima: ObjecionRegistrada | null = null;

  /** Registra una objeción en el turno `turnoUsuario` (índice del turno del cliente). */
  registrarObjecion(turnoUsuario: number, objecion: ObjecionRegistrada): void {
    if (!esDesinteres(objecion.tipo)) return;
    this.turnosConDesinteres.add(turnoUsuario);
    this.ultima = objecion;
  }

  registrarBaja(): void {
    this.baja = true;
  }

  get bajaRegistrada(): boolean {
    return this.baja;
  }

  /** Turnos distintos del cliente en los que mostró desinterés. */
  get objecionesDesinteres(): number {
    return this.turnosConDesinteres.size;
  }

  /** Desinterés definitivo: dijo que no DESPUÉS del reintento (2.ª objeción), sin baja. */
  get desinteresDefinitivo(): boolean {
    return !this.baja && this.turnosConDesinteres.size >= 2;
  }

  get ultimaObjecion(): ObjecionRegistrada | null {
    return this.ultima;
  }

  /**
   * `end_call` pedido por el modelo. `ultimoTextoCliente` es lo último que
   * dijo el cliente: si pide no ser llamado, jamás se exige el reintento.
   */
  decidirEndCall(ultimoTextoCliente: string | null | undefined): DecisionEndCall {
    if (this.baja || pideNoSerLlamado(ultimoTextoCliente)) return { accion: 'colgar' };
    if (this.turnosConDesinteres.size === 1 && !this.reintentoExigido) {
      this.reintentoExigido = true;
      return { accion: 'exigir_reintento', mensaje: MENSAJE_EXIGIR_REINTENTO };
    }
    return { accion: 'colgar' };
  }
}

// ─── Espera a que suene la despedida ─────────────────────────────────────────

/** Milisegundos por carácter de TTS en español a velocidad normal (aprox. 14–15 car/s). */
export const MS_POR_CARACTER = 70;
export const ESPERA_MIN_MS = 2500;
export const ESPERA_MAX_MS = 15000;

/**
 * Tope de la espera antes de `end`: cubre lo que tarda en sonar el texto. Si
 * llega antes el `agentSpeaking: off` de ConversationRelay, se cuelga antes.
 */
export function esperaMaximaReproduccionMs(texto: string): number {
  const estimado = 1200 + texto.length * MS_POR_CARACTER;
  return Math.min(Math.max(estimado, ESPERA_MIN_MS), ESPERA_MAX_MS);
}

/**
 * Mensaje `info` de ConversationRelay (`events="speaker-events"`):
 * `{type:'info', name:'agentSpeaking', value:'on'|'off'}`.
 */
export interface CRInfoMessage {
  type: 'info';
  name?: string;
  value?: string;
}

export function esFinDeHablaAgente(m: CRInfoMessage): boolean {
  return m.name === 'agentSpeaking' && m.value === 'off';
}

export function esInicioDeHablaAgente(m: CRInfoMessage): boolean {
  return m.name === 'agentSpeaking' && m.value === 'on';
}

/**
 * Qué falta por sonar cuando se decide colgar:
 *  - `nuevo`: se acaba de mandar texto (la despedida del runtime). Se espera
 *    el `agentSpeaking: off` que siga a un `on` posterior al envío (el `off`
 *    de una frase anterior no cuenta).
 *  - `en_curso`: no hay texto nuevo, pero el agente está hablando (la
 *    despedida del propio modelo). Vale el siguiente `off`.
 *  - `sin_eventos`: no hay texto nuevo y ConversationRelay no manda eventos
 *    de habla (TwiML sin `events`): solo el tope.
 *  - `ya_sono`: no hay texto nuevo y el agente ya calló: no se espera.
 */
export type PendienteReproduccion = 'nuevo' | 'en_curso' | 'sin_eventos' | 'ya_sono';

export function pendienteReproduccion(p: { textoNuevo: boolean; eventosHabla: boolean; agenteHablando: boolean }): PendienteReproduccion {
  if (p.textoNuevo) return 'nuevo';
  if (!p.eventosHabla) return 'sin_eventos';
  return p.agenteHablando ? 'en_curso' : 'ya_sono';
}

/**
 * Espera a que termine de sonar lo último que se mandó al TTS, o al tope. Un
 * solo uso. `terminada` nunca se rechaza.
 */
export class EsperaReproduccion {
  private vistoOn: boolean;
  private resolver: ((r: 'fin_reproduccion' | 'tope' | 'cancelada') => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly terminada: Promise<'fin_reproduccion' | 'tope' | 'cancelada'>;

  constructor(pendiente: PendienteReproduccion, topeMs: number) {
    this.vistoOn = pendiente === 'en_curso';
    this.terminada = new Promise((resolve) => {
      this.resolver = resolve;
    });
    if (pendiente === 'ya_sono') {
      this.cerrar('fin_reproduccion');
      return;
    }
    this.timer = setTimeout(() => this.cerrar('tope'), topeMs);
  }

  /** Procesa un `info` de ConversationRelay. */
  info(m: CRInfoMessage): void {
    if (esInicioDeHablaAgente(m)) this.vistoOn = true;
    else if (esFinDeHablaAgente(m) && this.vistoOn) this.cerrar('fin_reproduccion');
  }

  /** La persona colgó o el socket se cerró: no hay nada que esperar. */
  cancelar(): void {
    this.cerrar('cancelada');
  }

  private cerrar(r: 'fin_reproduccion' | 'tope' | 'cancelada'): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const resolver = this.resolver;
    this.resolver = null;
    resolver?.(r);
  }
}
