/**
 * Vigilante de silencio del agente de voz. Caso real (org 125, 2026-09-30):
 * el agente se despidió sin colgar y la línea quedó 5 minutos en silencio.
 */
import { duracionHablaMs, VigilanteSilencio, tiemposSilencioDeEntorno } from '../inactividad';

describe('VigilanteSilencio', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const crear = () => {
    const avisar = jest.fn();
    const cerrar = jest.fn();
    const v = new VigilanteSilencio({ avisar, cerrar }, { avisoMs: 45_000, cierreMs: 20_000 });
    return { v, avisar, cerrar };
  };

  test('en silencio: pregunta a los 45 s y cuelga 20 s después', () => {
    const { v, avisar, cerrar } = crear();
    v.reiniciar();
    jest.advanceTimersByTime(44_999);
    expect(avisar).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(avisar).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(19_999);
    expect(cerrar).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  test('si la persona habla tras el aviso, no se cuelga', () => {
    const { v, avisar, cerrar } = crear();
    v.reiniciar();
    jest.advanceTimersByTime(50_000);
    expect(avisar).toHaveBeenCalledTimes(1);
    v.reiniciar();
    jest.advanceTimersByTime(30_000);
    expect(cerrar).not.toHaveBeenCalled();
  });

  test('pausado mientras se procesa un turno, no corre', () => {
    const { v, avisar } = crear();
    v.reiniciar();
    v.pausar();
    jest.advanceTimersByTime(120_000);
    expect(avisar).not.toHaveBeenCalled();
  });

  test('detenido al terminar la sesión, no vuelve a armarse', () => {
    const { v, avisar, cerrar } = crear();
    v.reiniciar();
    v.detener();
    v.reiniciar();
    jest.advanceTimersByTime(120_000);
    expect(avisar).not.toHaveBeenCalled();
    expect(cerrar).not.toHaveBeenCalled();
  });

  test('mientras el agente habla, el aviso espera a que termine la frase', () => {
    const { v, avisar } = crear();
    v.reiniciar(20_000);
    jest.advanceTimersByTime(45_000 + 19_999);
    expect(avisar).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  test('duracionHablaMs deja margen para un saludo largo y no aplaza más de 90 s', () => {
    expect(duracionHablaMs('')).toBe(0);
    expect(duracionHablaMs('   ')).toBe(0);
    // 250 caracteres: el saludo real de Pedro. 250*80 + 2_000 = 22_000.
    expect(duracionHablaMs('a'.repeat(250))).toBe(22_000);
    expect(duracionHablaMs('a'.repeat(5_000))).toBe(90_000);
  });

  test('tiempos de entorno: valores fuera de rango caen al defecto', () => {
    const antes = { ...process.env };
    process.env.VOICE_AGENT_SILENCE_PROMPT_SECONDS = '2';
    process.env.VOICE_AGENT_SILENCE_HANGUP_SECONDS = '30';
    expect(tiemposSilencioDeEntorno()).toEqual({ avisoMs: 45_000, cierreMs: 30_000 });
    process.env = antes;
  });
});
