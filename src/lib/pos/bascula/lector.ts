/**
 * Lector de una báscula: transporte → bytes → `DivisorTramas` →
 * `interpretarTrama` → detector de estabilidad → estado para la UI
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.8, §2.9).
 *
 * - Protocolos por petición (Toledo «W», SICS «SI», CAS ENQ): pide cada
 *   `intervaloMs` y, en CAS, contesta DC1 al ACK.
 * - «Sin lectura 3 s» → fase `error` con `sin_lectura`; vuelve sola a
 *   `leyendo` con la siguiente trama.
 * - Cero: el comando de la báscula si el protocolo lo tiene (Toledo «Z», SICS
 *   «Z»); si no, el POS guarda la lectura actual como cero y la resta.
 * - Guarda los últimos bytes crudos para «Probar lectura» (trama no reconocida).
 *
 * El tiempo es inyectable (`Reloj`) para probarlo sin esperar.
 */

import { DetectorEstabilidad, divisionPorDefecto } from './estabilidad';
import { DESCRIPTORES, DivisorTramas, interpretarTrama } from './protocolos';
import type { ConfigBascula, LecturaTrama } from './tipos';
import { ErrorTransporte, type CodigoErrorTransporte, type TransporteBascula } from './transportes';

export const SIN_LECTURA_MS = 3000;
const MAX_CRUDO = 160;

export type FaseLector = 'conectando' | 'leyendo' | 'error' | 'cerrado';
export type ErrorLector = CodigoErrorTransporte | 'sin_lectura' | 'protocolo_pendiente';

export interface EstadoLector {
  fase: FaseLector;
  error: ErrorLector | null;
  /** Última trama reconocida. */
  lectura: LecturaTrama | null;
  /** Peso de la trama con el cero del POS aplicado (unidad de la trama). */
  peso: number | null;
  /** Unidad del peso: la de la trama o, si no la trae, la de la báscula. */
  unidad: string;
  /** Estable según la báscula Y el detector por tiempo. */
  estable: boolean;
  ultimaLecturaMs: number | null;
  /** Últimos bytes recibidos (para mostrarlos crudos). */
  crudo: Uint8Array;
  tramasReconocidas: number;
  tramasNoReconocidas: number;
  /** El cero lo hace el POS (el protocolo no tiene comando). */
  ceroEnPos: boolean;
}

export interface Reloj {
  ahora(): number;
  cada(ms: number, fn: () => void): () => void;
}

export const relojReal: Reloj = {
  ahora: () => Date.now(),
  cada: (ms, fn) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};

function estadoInicial(cfg: ConfigBascula): EstadoLector {
  return {
    fase: 'cerrado',
    error: null,
    lectura: null,
    peso: null,
    unidad: cfg.unidad,
    estable: false,
    ultimaLecturaMs: null,
    crudo: new Uint8Array(0),
    tramasReconocidas: 0,
    tramasNoReconocidas: 0,
    ceroEnPos: DESCRIPTORES[cfg.protocolo].comandoCero === null,
  };
}

export class LectorBascula {
  private estadoActual: EstadoLector;
  private readonly oyentes = new Set<(e: EstadoLector) => void>();
  private readonly divisor: DivisorTramas;
  private readonly detector: DetectorEstabilidad;
  private bajas: (() => void)[] = [];
  private abiertoEn = 0;
  private ceroPos = 0;
  private generacion = 0;

  constructor(
    private readonly cfg: ConfigBascula,
    private readonly transporte: TransporteBascula,
    private readonly reloj: Reloj = relojReal,
  ) {
    this.estadoActual = estadoInicial(cfg);
    this.divisor = DivisorTramas.para(cfg.protocolo);
    this.detector = new DetectorEstabilidad({
      estableMs: cfg.estableMs,
      division: cfg.division && cfg.division > 0 ? cfg.division : divisionPorDefecto(cfg.decimales),
    });
  }

  estado(): EstadoLector {
    return this.estadoActual;
  }

  suscribir(cb: (e: EstadoLector) => void): () => void {
    this.oyentes.add(cb);
    return () => {
      this.oyentes.delete(cb);
    };
  }

  async iniciar(): Promise<void> {
    const gen = ++this.generacion;
    this.limpiarBajas();
    this.divisor.reiniciar();
    this.detector.reiniciar();
    this.cambiar({ ...estadoInicial(this.cfg), fase: 'conectando' });
    try {
      await this.transporte.abrir(this.cfg);
    } catch (err) {
      if (gen !== this.generacion) return;
      const codigo: ErrorLector = err instanceof ErrorTransporte ? err.codigo : 'io';
      this.cambiar({ fase: 'error', error: codigo });
      return;
    }
    if (gen !== this.generacion) {
      // Se detuvo mientras abría: soltar el puerto.
      await this.transporte.cerrar().catch(() => undefined);
      return;
    }
    this.abiertoEn = this.reloj.ahora();
    this.bajas.push(this.transporte.alRecibir((chunk) => this.recibir(chunk)));
    if (this.transporte.alFallar) {
      this.bajas.push(this.transporte.alFallar((codigo) => this.cambiar({ fase: 'error', error: codigo, estable: false })));
    }
    const desc = DESCRIPTORES[this.cfg.protocolo];
    if (desc.pendiente) this.cambiar({ error: 'protocolo_pendiente' });
    if (desc.peticion && desc.intervaloMs > 0) {
      const peticion = desc.peticion;
      this.escribirSeguro(peticion);
      this.bajas.push(this.reloj.cada(desc.intervaloMs, () => this.escribirSeguro(peticion)));
    }
    this.bajas.push(this.reloj.cada(500, () => this.vigilar()));
  }

  async detener(): Promise<void> {
    this.generacion++;
    this.limpiarBajas();
    this.cambiar({ fase: 'cerrado', estable: false });
    await this.transporte.cerrar().catch(() => undefined);
  }

  /** Cero: comando de la báscula o, si no tiene, cero del POS sobre la lectura actual. */
  async cero(): Promise<void> {
    const cmd = DESCRIPTORES[this.cfg.protocolo].comandoCero;
    this.detector.reiniciar();
    if (cmd) {
      this.ceroPos = 0;
      await this.transporte.escribir(cmd);
      return;
    }
    const bruto = this.estadoActual.lectura?.neto;
    if (typeof bruto === 'number') {
      this.ceroPos = bruto;
      this.cambiar({ peso: 0, estable: false });
    }
  }

  /** Procesa bytes recibidos (público para las pruebas y la prueba de lectura). */
  recibir(chunk: Uint8Array): void {
    if (!chunk.length) return;
    const crudo = this.anexarCrudo(chunk);
    let { tramasReconocidas, tramasNoReconocidas } = this.estadoActual;
    let cambios: Partial<EstadoLector> = { crudo };
    for (const t of this.divisor.agregar(chunk)) {
      if (t.tipo === 'ack') {
        const resp = DESCRIPTORES[this.cfg.protocolo].respuestaAck;
        if (resp) this.escribirSeguro(resp);
        continue;
      }
      if (t.tipo === 'desborde') {
        tramasNoReconocidas++;
        continue;
      }
      const lectura = interpretarTrama(this.cfg.protocolo, t.bytes, { decimales: this.cfg.decimales, patron: this.cfg.patron });
      if (!lectura) {
        tramasNoReconocidas++;
        continue;
      }
      tramasReconocidas++;
      const ahora = this.reloj.ahora();
      const peso = lectura.neto === null ? null : lectura.neto - this.ceroPos;
      const estable = this.detector.alimentar(peso, lectura.estable && lectura.estado === 'ok', ahora);
      cambios = {
        ...cambios,
        fase: 'leyendo',
        error: this.estadoActual.error === 'protocolo_pendiente' ? 'protocolo_pendiente' : null,
        lectura,
        peso,
        unidad: lectura.unidad ?? this.cfg.unidad,
        estable,
        ultimaLecturaMs: ahora,
      };
    }
    this.cambiar({ ...cambios, tramasReconocidas, tramasNoReconocidas });
  }

  private vigilar(): void {
    const e = this.estadoActual;
    if (e.fase !== 'conectando' && e.fase !== 'leyendo') {
      // En error por falta de lectura se sigue vigilando: vuelve solo con una trama.
      if (!(e.fase === 'error' && e.error === 'sin_lectura')) return;
    }
    const ahora = this.reloj.ahora();
    const ultima = e.ultimaLecturaMs ?? this.abiertoEn;
    if (ahora - ultima >= SIN_LECTURA_MS && e.fase !== 'error') {
      this.detector.reiniciar();
      this.cambiar({ fase: 'error', error: 'sin_lectura', estable: false });
      return;
    }
    // Estabilidad por tiempo aunque no lleguen tramas nuevas (protocolos lentos).
    if (e.fase === 'leyendo' && e.lectura && !e.estable) {
      const estable = this.detector.alimentar(e.peso, e.lectura.estable && e.lectura.estado === 'ok', ahora);
      if (estable) this.cambiar({ estable });
    }
  }

  private escribirSeguro(bytes: Uint8Array): void {
    this.transporte.escribir(bytes).catch(() => undefined);
  }

  private anexarCrudo(chunk: Uint8Array): Uint8Array {
    const previo = this.estadoActual.crudo;
    const total = previo.length + chunk.length;
    const junto = new Uint8Array(Math.min(total, MAX_CRUDO));
    const desde = Math.max(0, total - MAX_CRUDO);
    for (let i = desde; i < total; i++) {
      junto[i - desde] = i < previo.length ? previo[i] : chunk[i - previo.length];
    }
    return junto;
  }

  private limpiarBajas(): void {
    for (const b of this.bajas) b();
    this.bajas = [];
  }

  private cambiar(parcial: Partial<EstadoLector>): void {
    this.estadoActual = { ...this.estadoActual, ...parcial };
    for (const cb of this.oyentes) cb(this.estadoActual);
  }
}
