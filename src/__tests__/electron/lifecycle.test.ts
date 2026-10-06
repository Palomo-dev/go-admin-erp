/**
 * Ciclo de vida de Go Admin Desktop (electron/src/main/lifecycle.ts): la
 * segunda instancia no resucita una app que está saliendo, el cierre nunca se
 * queda esperando a la red y agent.log registra por qué se cerró la app.
 *
 * Reporte del 2026-10-06: «la app se abre y se cierra sola de inmediato».
 */
import { EventEmitter } from 'events';
import {
  type AppEventos,
  decidirSegundaInstancia,
  ejecutarCierre,
  lineaArranque,
  registrarCicloDeVida,
  resumirUrl,
} from '../../../electron/src/main/lifecycle';

describe('segunda instancia', () => {
  it('con ventana y sin salir: la trae al frente', () => {
    expect(decidirSegundaInstancia({ hayVentana: true, saliendo: false, actualizacionPendiente: false })).toBe('mostrar');
  });

  it('durante el arranque (sin ventana todavía): la muestra al crearla, no se pierde', () => {
    expect(decidirSegundaInstancia({ hayVentana: false, saliendo: false, actualizacionPendiente: false })).toBe('mostrarAlCrear');
  });

  it('mientras la app sale: no la resucita (eso era «se abre y se cierra»); relanza al terminar', () => {
    expect(decidirSegundaInstancia({ hayVentana: true, saliendo: true, actualizacionPendiente: false })).toBe('relanzarTrasSalir');
  });

  it('mientras sale para instalar una actualización: espera al instalador (que cerraría el relanzamiento)', () => {
    expect(decidirSegundaInstancia({ hayVentana: true, saliendo: true, actualizacionPendiente: true })).toBe('esperarInstalacion');
  });
});

describe('cierre acotado', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('un paso que nunca responde (red colgada) no bloquea la salida: se registra y se sigue', async () => {
    const log = jest.fn();
    const orden: string[] = [];
    const promesa = ejecutarCierre(
      [
        { nombre: 'pantalla', limiteMs: 1000, ejecutar: () => orden.push('pantalla') },
        { nombre: 'agente offline en Supabase', limiteMs: 3000, ejecutar: () => new Promise(() => undefined) },
        { nombre: 'servidor', limiteMs: 1000, ejecutar: async () => orden.push('servidor') },
      ],
      { limiteTotalMs: 10_000, log },
    );
    await jest.advanceTimersByTimeAsync(3_000);
    const r = await promesa;
    expect(r.map((p) => p.resultado)).toEqual(['ok', 'tiempo', 'ok']);
    expect(orden).toEqual(['pantalla', 'servidor']);
    expect(log.mock.calls.flat().join('\n')).toMatch(/agente offline en Supabase» sin respuesta tras 3000 ms/);
  });

  it('un paso que lanza no impide los siguientes', async () => {
    const log = jest.fn();
    const r = await ejecutarCierre(
      [
        {
          nombre: 'báscula',
          limiteMs: 1000,
          ejecutar: () => {
            throw new Error('puerto ocupado');
          },
        },
        { nombre: 'bandeja', limiteMs: 1000, ejecutar: () => undefined },
      ],
      { limiteTotalMs: 5_000, log },
    );
    expect(r.map((p) => p.resultado)).toEqual(['error', 'ok']);
    expect(log.mock.calls.flat().join('\n')).toMatch(/báscula» falló: puerto ocupado/);
  });

  it('el tope total corta los pasos restantes sin ejecutarlos', async () => {
    const log = jest.fn();
    const tarde = jest.fn();
    const promesa = ejecutarCierre(
      [
        { nombre: 'lento', limiteMs: 60_000, ejecutar: () => new Promise(() => undefined) },
        { nombre: 'tarde', limiteMs: 1000, ejecutar: tarde },
      ],
      { limiteTotalMs: 2_000, log },
    );
    await jest.advanceTimersByTimeAsync(2_000);
    const r = await promesa;
    expect(r.map((p) => p.resultado)).toEqual(['tiempo', 'tiempo']);
    expect(tarde).not.toHaveBeenCalled();
  });
});

describe('registro del ciclo de vida en agent.log', () => {
  it('registra salida, procesos hijos caídos y renderers caídos sin query string', () => {
    const app = new EventEmitter();
    const log = jest.fn();
    // Doble de `app`: un EventEmitter (la firma genérica de @types/node no encaja tal cual).
    registrarCicloDeVida(app as unknown as AppEventos, log);
    app.emit('before-quit', {});
    app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: -1073741819 });
    app.emit('render-process-gone', {}, { getURL: () => 'http://localhost:47800/app/inventario?token=x' }, { reason: 'oom', exitCode: 1 });
    app.emit('quit', {}, 0);
    const texto = log.mock.calls.flat().join('\n');
    expect(texto).toMatch(/\[app\] before-quit/);
    expect(texto).toMatch(/child-process-gone: tipo=GPU motivo=crashed código=-1073741819/);
    expect(texto).toMatch(/render-process-gone: motivo=oom código=1 url=http:\/\/localhost:47800\/app\/inventario$/m);
    expect(texto).not.toMatch(/token=x/);
    expect(texto).toMatch(/\[app\] quit \(código 0\)/);
  });

  it('la línea de arranque dice si obtuvo el bloqueo de instancia única', () => {
    expect(lineaArranque({ version: '0.2.8', pid: 10, argv: ['x.exe', '--hidden'], empaquetada: true, bloqueo: false })).toBe(
      '[app] Arranque v0.2.8 pid=10 --hidden bloqueo=NO (otra instancia lo tiene; esta sale)',
    );
    expect(lineaArranque({ version: '0.2.8', pid: 11, argv: ['x.exe'], empaquetada: true, bloqueo: true })).toBe(
      '[app] Arranque v0.2.8 pid=11 bloqueo=sí',
    );
  });

  it('resumirUrl no deja pasar datos de pantallas data: ni parámetros', () => {
    expect(resumirUrl('data:text/html,<h1>x</h1>')).toBe('data:(pantalla propia)');
    expect(resumirUrl('')).toBe('(sin url)');
    expect(resumirUrl('https://app.goadmin.io/auth/callback?code=abc#t')).toBe('https://app.goadmin.io/auth/callback');
  });
});
