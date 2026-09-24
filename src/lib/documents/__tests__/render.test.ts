/**
 * Plantillas del motor: escape de HTML, moneda del documento, fechas en la
 * zona de la organización, nada remoto, cierre ciego y 80 mm reutilizando el
 * ticket de `@printing`. Y el namespace `documentos` completo en es/en/fr/pt.
 */
import fs from 'fs';
import path from 'path';
import { getPaperSpec } from '@printing';
import { contextoMoneda } from '@/lib/utils/moneda';
import { renderizarCarta } from '../render/carta';
import { renderizarTermico, payloadTicketVenta } from '../render/termico';
import { crearTraductor, type Traductor } from '../textos';
import type { DocumentoPayload } from '../tipos';

const mensajes = (idioma: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${idioma}.json`), 'utf8')) as { documentos: Record<string, unknown> };
const tEs: Traductor = crearTraductor(mensajes('es').documentos);

const XSS = '<img src=x onerror=alert(1)>';

function payload(extra: Partial<DocumentoPayload> = {}): DocumentoPayload {
  return {
    tipo: 'factura-venta',
    tituloClave: 'factura-venta',
    idioma: 'es',
    numero: `FV-1${XSS}`,
    estado: { codigo: 'issued', tono: 'marca' },
    marcaAgua: null,
    bandas: [],
    emisor: {
      nombre: `Mi empresa ${XSS}`,
      razonSocial: 'Mi empresa S.A.S.',
      nit: '900123456',
      dv: '7',
      direccion: 'Calle 1 # 2-3',
      ciudad: 'Medellín',
      telefono: '3000000000',
      email: 'ventas@example.com',
      web: null,
      responsabilidades: ['O-13'],
      actividadEconomica: '4771',
      logoDataUri: 'https://evil.example/logo.png',
      colorPrimario: '#ffff00',
    },
    sucursal: { nombre: 'Sucursal Norte', direccion: null, ciudad: null, telefono: null },
    contraparte: {
      rol: 'cliente',
      nombre: `Cliente "${XSS}"`,
      tipoDocumento: 'nit',
      numeroDocumento: '800111222',
      dv: '1',
      direccion: null,
      ciudad: null,
      telefono: null,
      email: null,
      responsabilidades: [],
    },
    referencia: [],
    metadatos: [
      // 03:00 UTC del 24 = 22:00 del 23 en Bogotá.
      { clave: 'fechaEmision', valor: { tipo: 'instante', v: '2026-09-24T03:00:00Z' } },
      { clave: 'validaHasta', valor: { tipo: 'fecha', v: '2026-09-30' } },
    ],
    resumen: [],
    lineas: [
      {
        codigo: 'SKU-1',
        descripcion: `Producto ${XSS}`,
        nota: `nota ${XSS}`,
        seriales: ['S1'],
        cantidad: 2,
        precioUnitario: 1000.5,
        descuento: 0,
        impuesto: { nombre: 'INC', tasa: 8, incluido: false },
        total: 2001,
      },
    ],
    secciones: [],
    totales: [
      { clave: 'subtotal', valor: 2001 },
      { clave: 'impuestoNombrado', vars: { nombre: 'INC' }, valor: 160.08 },
      { clave: 'total', valor: 2161.08, estilo: 'total' },
    ],
    notas: `Notas ${XSS}`,
    terminos: null,
    firma: 'recibido',
    pieLegal: { textos: [`Legal ${XSS}`], resolucion: null, codigoUnico: null, qr: { contenido: 'FV-1', leyenda: 'resumen' } },
    sobrio: false,
    moneda: contextoMoneda('MXN', { locale: 'es-MX' }),
    zonaHoraria: 'America/Bogota',
    generadoEn: '2026-09-24T15:00:00Z',
    nombreArchivo: 'Factura_FV-1',
    ...extra,
  };
}

describe('plantilla carta', () => {
  const html = renderizarCarta(payload(), tEs, { papel: 'carta' });

  it('escapa todo texto de la base', () => {
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('usa la moneda del documento (MXN, locale es-MX) y nunca pesos', () => {
    expect(html).toContain('$2,161.08');
    expect(html).not.toMatch(/COP/);
  });

  it('pinta el instante en la zona de la organización y la fecha plana sin correrla', () => {
    expect(html).toContain('23/09/2026');
    expect(html).not.toContain('24/09/2026</div>');
    expect(html).toContain('30/09/2026');
  });

  it('el impuesto se rotula con su nombre real, no «IVA»', () => {
    expect(html).toContain('INC 8 %');
    expect(html).not.toMatch(/>IVA</);
  });

  it('nada remoto: el logo que no es data: se descarta y el QR es svg local', () => {
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('qrserver');
    expect(html).toContain('<svg');
  });

  it('el color de la organización sin contraste con blanco no se usa para la cabecera', () => {
    expect(html).not.toContain('#ffff00');
  });

  it('carta con @page, paginación y cabecera de tabla repetida; A4 cambia solo el tamaño', () => {
    expect(html).toContain('size: letter');
    expect(html).toContain('counter(pages)');
    expect(html).toContain('display: table-header-group');
    expect(renderizarCarta(payload(), tEs, { papel: 'a4' })).toContain('size: A4');
  });

  it('el script de impresión solo sale con nonce', () => {
    expect(html).not.toContain('<script');
    const conScript = renderizarCarta(payload(), tEs, { papel: 'carta', imprimir: true, nonce: 'abc123' });
    expect(conScript).toContain('<script nonce="abc123">');
  });

  it('valores ocultos (cierre ciego) salen como ***', () => {
    const ciego = renderizarCarta(
      payload({ totales: [{ clave: 'caja.esperado', valor: 500, oculto: true }], resumen: [{ clave: 'efectivoEsperado', valor: { tipo: 'oculto' } }] }),
      tEs,
      { papel: 'carta' },
    );
    expect(ciego).toContain('***');
    expect(ciego).not.toContain('$500');
  });

  it('la cadena del pie de página no puede cerrar el <style>', () => {
    const malo = renderizarCarta(payload({ numero: '</style><script>alert(1)</script>' }), tEs, { papel: 'carta' });
    const estilo = malo.slice(malo.indexOf('<style>'), malo.indexOf('</style>'));
    expect(estilo).not.toContain('<script');
    expect(malo).not.toContain('<script>alert(1)</script>');
  });

  it('en inglés el mismo documento sale con los textos del idioma', () => {
    const tEn = crearTraductor(mensajes('en').documentos, mensajes('es').documentos);
    const en = renderizarCarta(payload({ idioma: 'en' }), tEn, { papel: 'carta' });
    expect(en).toContain('Sales invoice');
    expect(en).toContain('Page');
  });
});

describe('80 mm', () => {
  it('la factura de venta reutiliza el ticket de @printing con los textos escapados', () => {
    const ticket = payloadTicketVenta(payload(), tEs);
    expect(ticket.businessName).not.toContain('<img');
    expect(ticket.items[0].productName).toContain('&lt;img');
    // La nota la escapa @printing: va cruda para no escaparla dos veces.
    expect(ticket.items[0].note).toBe(`nota ${XSS}`);
    expect(ticket.currency).toBe('MXN');
    const html = renderizarTermico(payload(), tEs);
    expect(html).not.toContain(XSS);
    expect(html).toContain('TOTAL:');
  });

  it('los comprobantes de caja usan el ancho imprimible de @printing', () => {
    const html = renderizarTermico(payload({ tipo: 'recibo-caja', tituloClave: 'recibo-caja', lineas: null }), tEs);
    expect(html).toContain(`size: ${getPaperSpec('80mm').printableMm}mm auto`);
    expect(html).not.toContain(XSS);
    expect(html).toContain('Recibo de caja'.toUpperCase());
  });
});

describe('namespace documentos en los cuatro idiomas', () => {
  function hojas(obj: unknown, prefijo = ''): string[] {
    if (!obj || typeof obj !== 'object') return [prefijo];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => hojas(v, prefijo ? `${prefijo}.${k}` : k));
  }
  const claves = (idioma: string) => new Set(hojas(mensajes(idioma).documentos));

  it.each(['en', 'fr', 'pt'])('%s tiene exactamente las mismas claves que es', (idioma) => {
    expect([...claves(idioma)].sort()).toEqual([...claves('es')].sort());
  });

  it('cubre los títulos y los textos legales por defecto de todos los tipos', () => {
    const es = claves('es');
    for (const tipo of ['factura-venta', 'nota-credito', 'cotizacion', 'factura-compra', 'documento-soporte', 'estado-cuenta', 'recibo-caja', 'comprobante-egreso', 'cierre-caja', 'arqueo-caja']) {
      expect(es.has(`tipos.${tipo}`)).toBe(true);
      expect(es.has(`legal.porDefecto.${tipo}`)).toBe(true);
    }
  });
});
