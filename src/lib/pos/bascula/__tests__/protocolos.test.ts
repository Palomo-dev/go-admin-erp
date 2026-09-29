import {
  DivisorTramas,
  bytesHex,
  bytesLegibles,
  interpretarTrama,
  leerNumero,
  sugerirProtocolos,
  validarPatronPropio,
  type ProtocoloBascula,
} from '@/lib/pos/bascula';
import { TRAMAS, bytes } from './fixtures/tramas';

/** Corta con el divisor del protocolo e interpreta la primera trama de datos. */
function leer(protocolo: ProtocoloBascula, chunk: Uint8Array, opciones = {}) {
  const tramas = DivisorTramas.para(protocolo).agregar(chunk);
  const datos = tramas.find((t) => t.tipo === 'datos');
  return datos && datos.tipo === 'datos' ? interpretarTrama(protocolo, datos.bytes, opciones) : undefined;
}

describe('leerNumero', () => {
  it('lee punto o coma, signo y espacios; sin separador aplica los decimales implícitos', () => {
    expect(leerNumero('+00.735')).toBe(0.735);
    expect(leerNumero('- 0,015')).toBe(-0.015);
    expect(leerNumero('  0.735 ')).toBe(0.735);
    expect(leerNumero('0000735', 3)).toBe(0.735);
    expect(leerNumero('-0.000')).toBe(0);
    expect(leerNumero('abc')).toBeNull();
    expect(leerNumero('')).toBeNull();
  });
});

describe('continuo ST,GS', () => {
  it('estable, con espacios, en libras y sin punto decimal', () => {
    expect(leer('continuous_st_gs', TRAMAS.stGs.estable)).toEqual({
      neto: 0.735, bruto: 0.735, tara: null, unidad: 'KG', estable: true, estado: 'ok', netoDeBascula: false,
    });
    expect(leer('continuous_st_gs', TRAMAS.stGs.estableConEspacios)?.neto).toBe(0.735);
    expect(leer('continuous_st_gs', TRAMAS.stGs.libras)).toMatchObject({ neto: 1.62, unidad: 'LB' });
    expect(leer('continuous_st_gs', TRAMAS.stGs.sinPunto, { decimales: 3 })?.neto).toBe(0.735);
  });

  it('US es inestable; OL sobrecarga sin peso; negativo bajo cero', () => {
    expect(leer('continuous_st_gs', TRAMAS.stGs.inestable)).toMatchObject({ neto: 0.742, estable: false, estado: 'ok' });
    expect(leer('continuous_st_gs', TRAMAS.stGs.sobrecarga)).toMatchObject({ neto: null, estado: 'sobrecarga' });
    expect(leer('continuous_st_gs', TRAMAS.stGs.negativo)).toMatchObject({ neto: -0.015, estado: 'bajo_cero' });
  });

  it('NT es neto de la báscula (el POS no resta otra vez la tara); TR no es una pesada', () => {
    expect(leer('continuous_st_gs', TRAMAS.stGs.neto)).toMatchObject({ neto: 0.72, bruto: null, netoDeBascula: true });
    expect(leer('continuous_st_gs', TRAMAS.stGs.tara)).toBeNull();
  });
});

describe('Mettler Toledo 8217', () => {
  it('STX peso CR es estable; el byte de estado dice movimiento, sobrecarga o bajo cero', () => {
    expect(leer('toledo_8217', TRAMAS.toledo8217.estable)).toMatchObject({ neto: 0.735, estable: true, estado: 'ok' });
    expect(leer('toledo_8217', TRAMAS.toledo8217.libras)?.neto).toBe(1.62);
    expect(leer('toledo_8217', TRAMAS.toledo8217.enMovimiento)).toMatchObject({ neto: null, estable: false, estado: 'ok' });
    expect(leer('toledo_8217', TRAMAS.toledo8217.sobrecarga)).toMatchObject({ estado: 'sobrecarga' });
    expect(leer('toledo_8217', TRAMAS.toledo8217.bajoCero)).toMatchObject({ estado: 'bajo_cero' });
  });
});

describe('Mettler SICS', () => {
  it('S S estable, S D dinámico, S +, S -, S I, ES; «Z A» no es una pesada', () => {
    expect(leer('mettler_sics', TRAMAS.sics.estable)).toMatchObject({ neto: 0.735, estable: true, unidad: 'KG' });
    expect(leer('mettler_sics', TRAMAS.sics.dinamico)).toMatchObject({ neto: 0.742, estable: false });
    expect(leer('mettler_sics', TRAMAS.sics.sobrecarga)).toMatchObject({ estado: 'sobrecarga', neto: null });
    expect(leer('mettler_sics', TRAMAS.sics.bajoCero)).toMatchObject({ estado: 'bajo_cero' });
    expect(leer('mettler_sics', TRAMAS.sics.ocupado)).toMatchObject({ neto: null, estable: false, estado: 'ok' });
    expect(leer('mettler_sics', TRAMAS.sics.error)).toMatchObject({ estado: 'error' });
    expect(leer('mettler_sics', TRAMAS.sics.ceroAceptado)).toBeNull();
  });
});

describe('CAS PD-II', () => {
  it('ACK suelto se entrega aparte (el POS contesta DC1); SOH…EOT es la trama', () => {
    const tramas = DivisorTramas.para('cas_pd2').agregar(TRAMAS.casPd2.ack);
    expect(tramas).toEqual([{ tipo: 'ack' }]);
    expect(leer('cas_pd2', TRAMAS.casPd2.estable)).toMatchObject({ neto: 0.735, estable: true, unidad: 'KG' });
    expect(leer('cas_pd2', TRAMAS.casPd2.inestable)).toMatchObject({ neto: 0.742, estable: false });
    expect(leer('cas_pd2', TRAMAS.casPd2.negativo)).toMatchObject({ neto: -0.015, estado: 'bajo_cero' });
  });
});

describe('protocolo propio y Dibal', () => {
  it('expresión con grupos estado, signo, peso y unidad', () => {
    const op = { patron: TRAMAS.propio.patron };
    expect(leer('custom_regex', TRAMAS.propio.estable, op)).toMatchObject({ neto: 0.735, estable: true, unidad: 'KG' });
    expect(leer('custom_regex', TRAMAS.propio.inestable, op)).toMatchObject({ neto: 0.742, estable: false });
    expect(leer('custom_regex', TRAMAS.propio.estable, { patron: '(' })).toBeNull();
    expect(leer('custom_regex', TRAMAS.propio.estable, {})).toBeNull();
  });

  it('valida el patrón: vacío, inválido o sin grupo peso', () => {
    expect(validarPatronPropio('')).toBe('vacio');
    expect(validarPatronPropio('(')).toBe('invalido');
    expect(validarPatronPropio('\\d+')).toBe('sin_grupo_peso');
    expect(validarPatronPropio(TRAMAS.propio.patron)).toBeNull();
  });

  it('Dibal está pendiente: nunca interpreta', () => {
    expect(leer('dibal', TRAMAS.stGs.estable)).toBeNull();
  });
});

describe('DivisorTramas', () => {
  it('une pedazos partidos y separa varias tramas de un mismo pedazo', () => {
    const d = DivisorTramas.para('continuous_st_gs');
    expect(d.agregar(bytes('ST,GS,+00.'))).toEqual([]);
    const tramas = d.agregar(bytes('735kg\r\nUS,GS,+00.740kg\r\nST,'));
    expect(tramas).toHaveLength(2);
    const [a, c] = tramas;
    expect(a.tipo === 'datos' && interpretarTrama('continuous_st_gs', a.bytes)?.neto).toBe(0.735);
    expect(c.tipo === 'datos' && interpretarTrama('continuous_st_gs', c.bytes)?.estable).toBe(false);
  });

  it('una línea de más de 256 bytes sin fin es desborde', () => {
    const d = DivisorTramas.para('continuous_st_gs');
    const tramas = d.agregar(new Uint8Array(300).fill(0x41));
    expect(tramas[0].tipo).toBe('desborde');
  });
});

describe('prueba de lectura', () => {
  it('sugiere el protocolo que entiende los bytes y muestra los crudos', () => {
    expect(sugerirProtocolos(TRAMAS.stGs.estable)).toEqual(['continuous_st_gs']);
    expect(sugerirProtocolos(TRAMAS.sics.estable)).toContain('mettler_sics');
    expect(sugerirProtocolos(TRAMAS.basura)).toEqual([]);
    expect(bytesLegibles(bytes('\x02OK\r\n'))).toBe('‹02›OK␍␊\n');
    expect(bytesHex(bytes('ST'))).toBe('53 54');
  });
});
