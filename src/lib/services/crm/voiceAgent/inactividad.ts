/**
 * Vigilante de silencio del agente de voz (ConversationRelay).
 *
 * Caso real (org 125, 2026-09-30): el agente se despidió sin llamar a
 * `end_call` y la línea quedó abierta en silencio 5 minutos, hasta que la
 * persona colgó. Se cobraron 8 minutos por 3 de conversación. El tope
 * `maxDurationSeconds` no lo evitaba: solo se comprobaba al llegar un turno
 * del usuario, y en silencio no llega ninguno.
 *
 * Regla: sin turno del usuario durante `avisoMs`, se pregunta si sigue en la
 * línea; si pasan `cierreMs` más sin respuesta, se cierra la llamada. Cada
 * turno del usuario reinicia el conteo.
 */

export const SILENCIO_AVISO_S_DEFECTO = 45;
export const SILENCIO_CIERRE_S_DEFECTO = 20;

export const FRASE_AVISO_SILENCIO = '¿Sigue ahí?';
export const FRASE_CIERRE_SILENCIO =
  'Como no le escucho, voy a finalizar la llamada. Gracias por su tiempo, que tenga buen día.';

export interface TiemposSilencio {
  avisoMs: number;
  cierreMs: number;
}

function segundosDeEntorno(nombre: string, defecto: number): number {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v >= 5 && v <= 600 ? v : defecto;
}

/** `VOICE_AGENT_SILENCE_PROMPT_SECONDS` / `VOICE_AGENT_SILENCE_HANGUP_SECONDS` (5–600 s). */
export function tiemposSilencioDeEntorno(): TiemposSilencio {
  return {
    avisoMs: segundosDeEntorno('VOICE_AGENT_SILENCE_PROMPT_SECONDS', SILENCIO_AVISO_S_DEFECTO) * 1000,
    cierreMs: segundosDeEntorno('VOICE_AGENT_SILENCE_HANGUP_SECONDS', SILENCIO_CIERRE_S_DEFECTO) * 1000,
  };
}

/**
 * Cuánto tarda en sonar un texto. El reloj de silencio no puede arrancar
 * cuando el saludo EMPIEZA: con el aviso a los 10 s, una frase de ~20 s se
 * cortaba a la mitad con «¿Sigue ahí?» y la persona oía que el agente colgaba.
 * ~80 ms por carácter más 2 s de margen; tope 90 s para no aplazar el aviso
 * indefinidamente.
 */
export function duracionHablaMs(texto: string): number {
  const chars = texto.trim().length;
  if (chars === 0) return 0;
  return Math.min(Math.ceil(chars * 80) + 2_000, 90_000);
}

export interface AccionesSilencio {
  avisar: () => void;
  cerrar: () => void;
}

export class VigilanteSilencio {
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private detenido = false;

  constructor(
    private readonly acciones: AccionesSilencio,
    private readonly tiempos: TiemposSilencio = tiemposSilencioDeEntorno()
  ) {}

  /**
   * Reinicia el conteo. `esperaHablaMs` es lo que el agente aún va a estar
   * hablando: el aviso de silencio corre DESPUÉS de eso, no encima de la frase.
   */
  reiniciar(esperaHablaMs = 0): void {
    if (this.detenido) return;
    this.limpiar();
    const extra = Number.isFinite(esperaHablaMs) && esperaHablaMs > 0 ? Math.min(esperaHablaMs, 90_000) : 0;
    this.temporizador = setTimeout(() => {
      this.acciones.avisar();
      this.temporizador = setTimeout(() => {
        this.detener();
        this.acciones.cerrar();
      }, this.tiempos.cierreMs);
    }, this.tiempos.avisoMs + extra);
  }

  /** Mientras se procesa un turno no corre el conteo (el modelo o una herramienta pueden tardar). */
  pausar(): void {
    this.limpiar();
  }

  /** Fin de la sesión: no vuelve a armarse. */
  detener(): void {
    this.detenido = true;
    this.limpiar();
  }

  private limpiar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}
