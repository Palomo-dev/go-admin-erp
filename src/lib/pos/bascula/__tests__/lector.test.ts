import {
  DetectorEstabilidad,
  ErrorTransporte,
  LectorBascula,
  SIN_LECTURA_MS,
  divisionPorDefecto,
  type ConfigBascula,
  type Reloj,
  type TransporteBascula,
} from '@/lib/pos/bascula';
import { TRAMAS, bytes } from './fixtures/tramas';

describe('DetectorEstabilidad', () => {
  it('estable tras stable_ms con la lectura dentro de una división', () => {
    const d = new DetectorEstabilidad({ estableMs: 500, division: 0.005 });
    expect(d.alimentar(0.735, true, 0)).toBe(false);
    expect(d.alimentar(0.74, true, 300)).toBe(false); // +1 división: sigue la misma referencia
    expect(d.alimentar(0.735, true, 499)).toBe(false);
    expect(d.alimentar(0.735, true, 500)).toBe(true);
  });

  it('un salto de más de una división reinicia el tiempo; la bandera de movimiento también', () => {
    const d = new DetectorEstabilidad({ estableMs: 500, division: 0.005 });
    d.alimentar(0.735, true, 0);
    expect(d.alimentar(0.75, true, 600)).toBe(false);
    expect(d.alimentar(0.75, true, 1100)).toBe(true);
    expect(d.alimentar(0.75, false, 1200)).toBe(false);
    expect(d.alimentar(0.75, true, 1300)).toBe(false);
    expect(d.alimentar(null, true, 1400)).toBe(false);
  });

  it('stable_ms 0 confía en la bandera de la báscula; división por defecto por decimales', () => {
    const d = new DetectorEstabilidad({ estableMs: 0, division: 0.001 });
    expect(d.alimentar(1, true, 0)).toBe(true);
    expect(divisionPorDefecto(3)).toBe(0.001);
    expect(divisionPorDefecto(2)).toBe(0.01);
  });
});

/** Reloj manual: `avanzar` dispara los intervalos vencidos. */
function relojManual(): Reloj & { avanzar(ms: number): void } {
  let t = 0;
  const tareas = new Set<{ cada: number; proximo: number; fn: () => void }>();
  return {
    ahora: () => t,
    cada(ms, fn) {
      const tarea = { cada: ms, proximo: t + ms, fn };
      tareas.add(tarea);
      return () => tareas.delete(tarea);
    },
    avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        const vencidas = [...tareas].filter((x) => x.proximo <= fin).sort((a, c) => a.proximo - c.proximo);
        if (!vencidas.length) break;
        const x = vencidas[0];
        t = x.proximo;
        x.proximo += x.cada;
        x.fn();
      }
      t = fin;
    },
  };
}

/** Transporte doble: registra lo escrito y deja inyectar bytes. */
function transporteDoble(opciones: { falla?: ErrorTransporte } = {}) {
  let receptor: ((c: Uint8Array) => void) | null = null;
  let alFallar: ((c: 'io') => void) | null = null;
  const escritos: string[] = [];
  const t: TransporteBascula & { emitir(c: Uint8Array): void; escritos: string[]; cerrado: boolean; caer(): void } = {
    escritos,
    cerrado: false,
    async abrir() {
      if (opciones.falla) throw opciones.falla;
    },
    async cerrar() {
      t.cerrado = true;
    },
    async escribir(b) {
      escritos.push(String.fromCharCode(...b));
    },
    alRecibir(cb) {
      receptor = cb;
      return () => {
        receptor = null;
      };
    },
    alFallar(cb) {
      alFallar = cb;
      return () => {
        alFallar = null;
      };
    },
    emitir: (c) => receptor?.(c),
    caer: () => alFallar?.('io'),
  };
  return t;
}

const CFG: ConfigBascula = {
  id: 'b1',
  nombre: 'Mostrador',
  transporte: 'web_serial',
  protocolo: 'continuous_st_gs',
  baudios: 9600,
  bitsDatos: 8,
  paridad: 'none',
  bitsParada: 1,
  unidad: 'KG',
  decimales: 3,
  capacidad: 15,
  division: 0.005,
  estableMs: 500,
};

describe('LectorBascula', () => {
  it('conectando → leyendo; estable solo tras stable_ms de lecturas iguales', async () => {
    const reloj = relojManual();
    const t = transporteDoble();
    const lector = new LectorBascula(CFG, t, reloj);
    const fases: string[] = [];
    lector.suscribir((e) => fases.push(e.fase));
    await lector.iniciar();
    expect(lector.estado().fase).toBe('conectando');
    t.emitir(TRAMAS.stGs.estable);
    expect(lector.estado()).toMatchObject({ fase: 'leyendo', peso: 0.735, estable: false });
    reloj.avanzar(250);
    t.emitir(TRAMAS.stGs.estable);
    expect(lector.estado().estable).toBe(false);
    reloj.avanzar(300);
    t.emitir(TRAMAS.stGs.estable);
    expect(lector.estado().estable).toBe(true);
    t.emitir(TRAMAS.stGs.inestable);
    expect(lector.estado().estable).toBe(false);
    expect(fases[0]).toBe('conectando');
  });

  it('sin lectura 3 s → error sin_lectura; vuelve solo con la siguiente trama', async () => {
    const reloj = relojManual();
    const t = transporteDoble();
    const lector = new LectorBascula(CFG, t, reloj);
    await lector.iniciar();
    reloj.avanzar(SIN_LECTURA_MS + 500);
    expect(lector.estado()).toMatchObject({ fase: 'error', error: 'sin_lectura' });
    t.emitir(TRAMAS.stGs.estable);
    expect(lector.estado()).toMatchObject({ fase: 'leyendo', error: null });
  });

  it('protocolo por petición: Toledo pide «W» cada 200 ms; CAS contesta DC1 al ACK', async () => {
    const reloj = relojManual();
    const t = transporteDoble();
    const lector = new LectorBascula({ ...CFG, protocolo: 'toledo_8217' }, t, reloj);
    await lector.iniciar();
    reloj.avanzar(600);
    expect(t.escritos.filter((x) => x === 'W')).toHaveLength(4); // al abrir + 3
    await lector.detener();
    expect(t.cerrado).toBe(true);

    const t2 = transporteDoble();
    const cas = new LectorBascula({ ...CFG, protocolo: 'cas_pd2' }, t2, reloj);
    await cas.iniciar();
    expect(t2.escritos).toEqual(['\x05']);
    t2.emitir(TRAMAS.casPd2.ack);
    expect(t2.escritos).toEqual(['\x05', '\x11']);
    t2.emitir(TRAMAS.casPd2.estable);
    expect(cas.estado().peso).toBe(0.735);
  });

  it('cero: comando de la báscula (SICS «Z») o cero del POS si el protocolo no lo tiene', async () => {
    const reloj = relojManual();
    const t = transporteDoble();
    const sics = new LectorBascula({ ...CFG, protocolo: 'mettler_sics' }, t, reloj);
    await sics.iniciar();
    await sics.cero();
    expect(t.escritos).toContain('Z\r\n');
    expect(sics.estado().ceroEnPos).toBe(false);

    const t2 = transporteDoble();
    const stgs = new LectorBascula(CFG, t2, reloj);
    await stgs.iniciar();
    expect(stgs.estado().ceroEnPos).toBe(true);
    t2.emitir(bytes('ST,GS,+00.012kg\r\n'));
    await stgs.cero();
    t2.emitir(bytes('ST,GS,+00.747kg\r\n'));
    expect(stgs.estado().peso).toBeCloseTo(0.735, 9);
  });

  it('error al abrir, caída del transporte y trama no reconocida con bytes crudos', async () => {
    const reloj = relojManual();
    const lector = new LectorBascula(CFG, transporteDoble({ falla: new ErrorTransporte('sin_puerto') }), reloj);
    await lector.iniciar();
    expect(lector.estado()).toMatchObject({ fase: 'error', error: 'sin_puerto' });

    const t = transporteDoble();
    const otro = new LectorBascula(CFG, t, reloj);
    await otro.iniciar();
    t.emitir(TRAMAS.basura);
    expect(otro.estado()).toMatchObject({ fase: 'conectando', tramasNoReconocidas: 1, tramasReconocidas: 0 });
    expect(otro.estado().crudo.length).toBe(TRAMAS.basura.length);
    t.caer();
    expect(otro.estado()).toMatchObject({ fase: 'error', error: 'io' });
  });

  it('Dibal: guarda los bytes pero avisa que el protocolo está pendiente', async () => {
    const reloj = relojManual();
    const t = transporteDoble();
    const lector = new LectorBascula({ ...CFG, protocolo: 'dibal' }, t, reloj);
    await lector.iniciar();
    expect(lector.estado().error).toBe('protocolo_pendiente');
    t.emitir(TRAMAS.stGs.estable);
    expect(lector.estado().tramasNoReconocidas).toBe(1);
  });
});
