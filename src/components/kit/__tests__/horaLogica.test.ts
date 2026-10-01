/**
 * Lógica de `CampoHora`: reemplaza al `<input type="time">` nativo sin cambiar
 * qué se guarda (`HH:mm`).
 */
import { buscarPorTexto, esHora, etiquetaHora, horasDelDia, indiceInicial, moverIndice, normalizarHora, opcionesConValor } from '../horaLogica';

describe('horaLogica', () => {
  test('horas del día cada 15 min y formato HH:mm', () => {
    const l = horasDelDia(15);
    expect(l).toHaveLength(96);
    expect(l[0]).toBe('00:00');
    expect(l[1]).toBe('00:15');
    expect(l[95]).toBe('23:45');
    expect(horasDelDia(0)).toHaveLength(96);
  });

  test('normaliza lo que guarda la base y descarta basura', () => {
    expect(normalizarHora('14:30:00')).toBe('14:30');
    expect(normalizarHora('25:00')).toBe('');
    expect(normalizarHora(null)).toBe('');
    expect(esHora('09:05')).toBe(true);
    expect(esHora('9:05')).toBe(false);
  });

  test('una hora guardada fuera del paso se conserva en su sitio; min y max acotan', () => {
    const l = opcionesConValor(horasDelDia(30), '10:07');
    expect(l.indexOf('10:07')).toBe(l.indexOf('10:00') + 1);
    expect(opcionesConValor(horasDelDia(60), '', '08:00', '10:00')).toEqual(['08:00', '09:00', '10:00']);
  });

  test('rótulo en el idioma sin mover la hora por la zona', () => {
    expect(etiquetaHora('15:00', 'en-US')).toBe('3:00 PM');
    expect(etiquetaHora('00:30', 'en-US')).toBe('12:30 AM');
    expect(etiquetaHora('xx', 'es-CO')).toBe('');
  });

  test('abre en la elegida o, sin valor, cerca de las 9', () => {
    const l = horasDelDia(30);
    expect(l[indiceInicial(l, '14:30')]).toBe('14:30');
    expect(l[indiceInicial(l, '')]).toBe('09:00');
  });

  test('teclado: flechas, páginas, inicio y fin acotados', () => {
    expect(moverIndice(0, 'ArrowUp', 10)).toBe(0);
    expect(moverIndice(9, 'ArrowDown', 10)).toBe(9);
    expect(moverIndice(2, 'PageDown', 10)).toBe(6);
    expect(moverIndice(5, 'End', 10)).toBe(9);
    expect(moverIndice(5, 'a', 10)).toBeNull();
  });

  test('escribir salta: «14», «2 p», «12a»', () => {
    const l = horasDelDia(15);
    expect(l[buscarPorTexto(l, '14')]).toBe('14:00');
    expect(l[buscarPorTexto(l, '2 p')]).toBe('14:00');
    expect(l[buscarPorTexto(l, '12a')]).toBe('00:00');
    expect(l[buscarPorTexto(l, '9:3')]).toBe('09:30');
    expect(buscarPorTexto(l, 'xyz')).toBe(-1);
  });
});
