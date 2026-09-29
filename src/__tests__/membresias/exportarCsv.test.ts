// ============================================================
// Exportar listados de Membresías a CSV (§12.3): construcción del archivo.
//
// Utilidad única de CSV del repo (`filasACsv`: BOM, «;», CRLF, comillas cuando hace falta y
// fórmulas neutralizadas); fechas en la zona de la ORGANIZACIÓN (una entrada a las 23:30 de Bogotá
// es de ese día en Bogotá aunque en UTC ya sea el siguiente); importes con separadores de la moneda
// y sin símbolo; textos de messages/*.json en el idioma pedido.
// ============================================================
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import pt from '../../../messages/pt.json';
import { construirCsv, encabezados, nombreArchivo, type Traductor } from '@/lib/services/membresias/exportarCsv';
import type { MembresiaFila, MiembroFila, PagoFila, TipoExportacion } from '@/lib/services/membresias/tipos';

const t = (mensajes: unknown, locale = 'es') =>
  createTranslator({ locale, messages: mensajes as AbstractIntlMessages }) as unknown as Traductor;

const formato = { t: t(es), zona: 'America/Bogota', locale: 'es-CO', moneda: 'COP' };

const cliente = { id: 'c1', nombre: 'Ana Pérez; "la del 6"', documento: '1020304050', email: 'ana@example.com', telefono: '3001234567', avatarUrl: null };

const membresia: MembresiaFila = {
  id: 7,
  estado: 'past_due',
  estadoVisual: 'en_gracia',
  dias: 2,
  desde: '2026-08-28T15:00:00Z',
  hasta: '2026-09-28T04:59:59Z', // 27 sep 23:59:59 en Bogotá
  graceUntil: '2026-09-30T04:59:59Z',
  codigo: 'MEM-7',
  origen: 'pos',
  cliente,
  plan: { id: 2, nombre: 'Mensual', productId: 96918 },
  saleId: null,
  invoiceId: null,
  branchId: 79,
  sucursal: 'Sede norte',
  ultimaEntrada: '2026-09-27T04:30:00Z', // 26 sep 23:30 en Bogotá
};

function lineas(csv: string): string[] {
  expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM para que Excel abra bien las tildes
  return csv.slice(1).split('\r\n');
}

describe('CSV de membresías', () => {
  it('encabezados en el idioma y una fila con fechas en la zona de la organización', () => {
    const [cab, fila] = lineas(construirCsv('membresias', [membresia], formato));
    expect(cab).toBe('Miembro;Documento;Plan;Código de acceso;Desde;Hasta;Estado;Sede;Última entrada;Origen');
    // «;» y comillas en el nombre: celda entre comillas con las comillas dobladas.
    expect(fila.startsWith('"Ana Pérez; ""la del 6""";1020304050;Mensual;MEM-7;')).toBe(true);
    expect(fila).toContain(';27/09/2026;'); // hasta: día de Bogotá, no el 28 de UTC
    expect(fila).toContain('En gracia 2 d');
    expect(fila).toContain('Sede norte');
    expect(fila).toContain('26/09/2026 23:30');
    expect(fila.endsWith(';Punto de venta')).toBe(true);
  });

  it('sin sede ni entradas: celdas vacías, no «null»', () => {
    const [, fila] = lineas(construirCsv('membresias', [{ ...membresia, sucursal: null, ultimaEntrada: null, origen: null }], formato));
    expect(fila).not.toContain('null');
    expect(fila.endsWith(';;;')).toBe(true);
  });

  it('inyección de fórmulas: un nombre que empieza por «=» no se ejecuta en Excel', () => {
    const malicioso = { ...membresia, cliente: { ...cliente, nombre: '=HYPERLINK("http://x";"clic")' } };
    const [, fila] = lineas(construirCsv('membresias', [malicioso], formato));
    expect(fila.startsWith(`"'=HYPERLINK(""http://x"";""clic"")";`)).toBe(true);
  });
});

describe('CSV de miembros', () => {
  const miembro: MiembroFila = { cliente, membresias: 3, vigente: { ...membresia, estadoVisual: 'activa', dias: 12 }, ultimaEntrada: null };

  it('persona con su membresía vigente', () => {
    const [cab, fila] = lineas(construirCsv('miembros', [miembro], formato));
    expect(cab).toBe('Miembro;Documento;Correo;Teléfono;Membresía vigente;Estado;Vence;Última entrada;Membresías');
    expect(fila).toContain(';ana@example.com;3001234567;Mensual;Activa;27/09/2026;;3');
  });

  it('sin membresía vigente', () => {
    const [, fila] = lineas(construirCsv('miembros', [{ ...miembro, vigente: null }], formato));
    expect(fila).toContain('Sin membresía vigente');
  });
});

describe('CSV de pagos', () => {
  const pago: PagoFila = {
    saleItemId: 'si-1',
    saleId: 's-1',
    fecha: '2026-09-01T03:00:00Z', // 31 ago 22:00 en Bogotá
    cliente,
    producto: 'Mensual',
    cantidad: 1,
    total: 1250000,
    estadoVenta: 'paid',
    factura: { id: 'f1', numero: 'FV-12', estado: 'issued', saldo: 0 },
    membresiaId: 7,
  };

  it('importe con separadores colombianos y sin símbolo', () => {
    const [cab, fila] = lineas(construirCsv('pagos', [pago], formato));
    expect(cab).toBe('Fecha;Cliente;Documento;Producto;Cantidad;Total;Estado de la venta;Factura;Saldo;Membresía');
    expect(fila.startsWith('31/08/2026;')).toBe(true);
    expect(fila).toContain(';1.250.000;');
    expect(fila).not.toContain('$');
    expect(fila).toContain('FV-12;0;7');
  });

  it('estado de la venta con la etiqueta del kit (no el código de la base)', () => {
    const [, fila] = lineas(construirCsv('pagos', [pago], formato));
    expect(fila).not.toContain(';paid;');
  });

  it('sin cliente ni factura', () => {
    const [, fila] = lineas(construirCsv('pagos', [{ ...pago, cliente: null, factura: null, membresiaId: null }], formato));
    expect(fila).toContain('Sin cliente');
    expect(fila.endsWith(';;;')).toBe(true);
  });
});

describe('idiomas y nombre del archivo', () => {
  const tipos: TipoExportacion[] = ['membresias', 'miembros', 'pagos'];

  it('los cuatro idiomas tienen todas las columnas (ninguna cae a la clave)', () => {
    for (const [locale, mensajes] of [['es', es], ['en', en], ['fr', fr], ['pt', pt]] as const) {
      const tr = t(mensajes, locale);
      for (const tipo of tipos) {
        for (const c of encabezados(tipo, tr)) expect(c).not.toMatch(/membresias\.exportar/);
      }
    }
  });

  it('en inglés', () => {
    expect(encabezados('pagos', t(en, 'en'))[4]).toBe('Quantity');
  });

  it('nombre sin tildes ni espacios, con el día de la organización', () => {
    expect(nombreArchivo('pagos', '2026-09-29', formato.t)).toBe('pagos_de_membresias_2026-09-29.csv');
    expect(nombreArchivo('membresias', '2026-09-29', t(fr, 'fr'))).toBe('adhesions_2026-09-29.csv');
  });
});
