/**
 * Factura carta y 80 mm del motor de documentos con líneas por peso
 * (PRODUCTOS-POR-PESO-BASCULA.md fase 1, frame D3): columna «Unidad»,
 * «0,735» con 3 decimales y «und» en las líneas por unidad.
 */
import fs from 'fs';
import path from 'path';
import { contextoMoneda } from '@/lib/utils/moneda';
import { renderizarCarta } from '@/lib/documents/render/carta';
import { payloadTicketVenta } from '@/lib/documents/render/termico';
import { crearTraductor } from '@/lib/documents/textos';
import { lineaDeItem } from '@/lib/documents/server/base';
import type { DocumentoPayload } from '@/lib/documents/tipos';

const mensajes = (idioma: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${idioma}.json`), 'utf8')) as { documentos: Record<string, unknown> };

const queso = lineaDeItem({
  description: 'Queso campesino',
  qty: '0.735',
  unit_price: '18900',
  total_line: '13891.5',
  producto: { sku: 'QUE-CAMP-KG', unit_code: 'KG  ', sale_mode: 'weight', qty_decimals: 3 },
});
const carne = lineaDeItem({
  description: 'Carne molida',
  qty: '2.5',
  unit_price: '18000',
  total_line: '45000',
  producto: [{ sku: 'CAR-MOL-KG', unit_code: 'KG', sale_mode: 'weight', qty_decimals: 3 }],
});
const gaseosa = lineaDeItem({ description: 'Gaseosa', qty: 3, unit_price: 4300, total_line: 12900, producto: { sku: 'GAS-15', unit_code: 'UN', sale_mode: 'unit', qty_decimals: 0 } });

function doc(): DocumentoPayload {
  return {
    tipo: 'factura-venta',
    tituloClave: 'factura-venta',
    idioma: 'es',
    numero: 'FV-1',
    estado: { codigo: 'issued', tono: 'marca' },
    marcaAgua: null,
    bandas: [],
    emisor: {
      nombre: 'Tienda de ejemplo',
      razonSocial: null,
      nit: null,
      dv: null,
      direccion: null,
      ciudad: null,
      telefono: null,
      email: null,
      web: null,
      responsabilidades: [],
      actividadEconomica: null,
      logoDataUri: null,
      colorPrimario: null,
    },
    sucursal: null,
    contraparte: null,
    referencia: [],
    metadatos: [],
    resumen: [],
    lineas: [queso, carne, gaseosa],
    secciones: [],
    totales: [{ clave: 'total', valor: 71791.5, estilo: 'total' }],
    notas: null,
    terminos: null,
    firma: null,
    pieLegal: { textos: [], resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda: contextoMoneda('COP', { locale: 'es-CO' }),
    zonaHoraria: 'America/Bogota',
    generadoEn: '2026-09-29T15:00:00Z',
    nombreArchivo: 'Factura_FV-1',
  } as unknown as DocumentoPayload;
}

describe('línea del documento desde invoice_items', () => {
  test('por peso: unidad «kg» y 3 decimales; por unidad: sin unidad', () => {
    expect(queso).toMatchObject({ cantidad: 0.735, unidad: 'kg', decimalesCantidad: 3, codigo: 'QUE-CAMP-KG' });
    expect(carne).toMatchObject({ cantidad: 2.5, unidad: 'kg' });
    expect(gaseosa).toMatchObject({ cantidad: 3, unidad: null, decimalesCantidad: null });
  });
});

describe('factura carta', () => {
  const html = renderizarCarta(doc(), crearTraductor(mensajes('es').documentos), { papel: 'carta' });

  test('columna «Unidad» con kg y und; cantidad con 3 decimales', () => {
    expect(html).toContain('>Unidad<');
    expect(html).toContain('>0,735<');
    expect(html).toContain('>2,500<');
    expect(html).toContain('>kg<');
    expect(html).toContain('>und<');
    expect(html).toContain('/ kg');
  });

  test('los otros idiomas tienen la columna', () => {
    for (const idioma of ['en', 'fr', 'pt']) {
      const d = mensajes(idioma).documentos as { columnas: Record<string, string>; lineas: Record<string, string> };
      expect(d.columnas.unidad).toBeTruthy();
      expect(d.lineas.unidadPorDefecto).toBeTruthy();
    }
  });
});

describe('80 mm del motor', () => {
  test('el ticket recibe la unidad y los decimales de la línea', () => {
    const p = payloadTicketVenta(doc(), crearTraductor(mensajes('es').documentos));
    expect(p.items[0]).toMatchObject({ quantity: 0.735, unit: 'kg', qtyDecimals: 3 });
    expect(p.items[2]).toMatchObject({ quantity: 3, unit: null });
  });
});
