import { enmascarar, pestanaConexionInicial } from '../detalle/detalleLogica';
import { claveDePosicion, esDominioValido, normalizarDominio, porcentajeCelular, posicionDeClave } from '../website/id/widgetLogica';

describe('detalle de canal', () => {
  it('enmascara tokens sin perder el principio y el final (se ven con «Ver»)', () => {
    expect(enmascarar('EAAGabcdefghijklmn7Qx')).toBe(`EAAG${'•'.repeat(14)}7Qx`);
    expect(enmascarar('corto')).toBe('•••••');
    expect(enmascarar(null)).toBe('');
  });
  it('la pestaña de conexión sale de ?conexion= y si no, de lo guardado', () => {
    expect(pestanaConexionInicial('qr_scan', 'cloud_api')).toBe('qr_scan');
    expect(pestanaConexionInicial('cualquiera', 'coexistence')).toBe('coexistence');
    expect(pestanaConexionInicial(null, undefined)).toBe('cloud_api');
  });
});

describe('chat del sitio web', () => {
  it('normaliza y valida dominios', () => {
    expect(normalizarDominio(' https://www.Tienda.com/ruta?x=1 ')).toBe('www.tienda.com');
    expect(esDominioValido('tienda.com.co')).toBe(true);
    expect(esDominioValido('localhost')).toBe(true);
    expect(esDominioValido('tienda')).toBe(false);
  });
  it('posición ↔ esquina conserva los márgenes', () => {
    const p = { side: 'right' as const, vertical: 'bottom' as const, offsetX: 12, offsetY: 30 };
    expect(claveDePosicion(p)).toBe('abajoDerecha');
    expect(posicionDeClave('arribaIzquierda', p)).toEqual({ side: 'left', vertical: 'top', offsetX: 12, offsetY: 30 });
  });
  it('porcentaje desde celular', () => {
    expect(porcentajeCelular({ mobile: 7, desktop: 3 })).toBe(70);
    expect(porcentajeCelular({})).toBeNull();
  });
});
