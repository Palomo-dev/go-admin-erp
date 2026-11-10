/**
 * Reimpresión fiel (ronda 2 del Contador): el PDF de un documento expedido usa
 * la instantánea de expedición; sin ella, el envío aceptado guardado; sin nada,
 * la vigencia por fecha marcada «reconstruido».
 */
import fs from 'fs';
import path from 'path';
import { emisorDesdeRespuesta, leerPartesDocumento, receptorDesdeXml, type PartesDocumento } from '../instantanea';
import { bandaReconstruido, type BaseDocumento } from '../base';
import { conBandasRonda5 } from '../../textos';

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null };

function doble(tablas: Record<string, Respuesta>) {
  const filtros: { tabla: string; columna: string; valor: unknown }[] = [];
  const db = {
    from(tabla: string) {
      const r = tablas[tabla] ?? { data: null, error: null };
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit']) b[m] = () => b;
      b.eq = (columna: string, valor: unknown) => {
        filtros.push({ tabla, columna, valor });
        return b;
      };
      b.maybeSingle = async () => r;
      return b;
    },
  };
  return { db: db as never, filtros };
}

describe('instantánea de las partes', () => {
  test('con instantánea: emisor y receptor originales; el receptor del XML manda', async () => {
    const { db, filtros } = doble({
      document_party_snapshots: {
        data: {
          emisor: { legal_name: 'Emisor original', nit: '900111222', fiscal_responsibilities: ['O-13'] },
          receptor: { full_name: 'Cliente original', identification_number: '1010' },
          receptor_xml: { identification: '1010', names: 'Cliente del XML', legal_organization_code: '2' },
        },
        error: null,
      },
    });
    const p = await leerPartesDocumento(db, 42, 'factura_venta', 'f1');
    expect(p).toMatchObject({ origen: 'instantanea', emisorReconstruido: false, emisor: { legal_name: 'Emisor original' }, receptor: { full_name: 'Cliente del XML' } });
    expect(filtros).toEqual(expect.arrayContaining([{ tabla: 'document_party_snapshots', columna: 'organization_id', valor: 42 }]));
  });

  test('sin instantánea pero con envío aceptado: receptor del XML; emisor de la respuesta si la trae', async () => {
    const { db } = doble({
      document_party_snapshots: { data: null, error: null },
      electronic_invoicing_jobs: {
        data: {
          request_payload: { customer: { identification: '1010', company: 'Empresa cliente', legal_organization_code: '1' } },
          response_payload: { data: { company: { nit: '900111222', company: 'Emisor según Factus' } } },
        },
        error: null,
      },
    });
    const p = await leerPartesDocumento(db, 42, 'factura_venta', 'f1');
    expect(p).toMatchObject({ origen: 'factus', emisorReconstruido: false, receptor: { company_name: 'Empresa cliente', customer_type: 'company' }, emisor: { legal_name: 'Emisor según Factus' } });
  });

  test('sin nada guardado: reconstruido (el PDF lo dice)', async () => {
    const { db } = doble({ document_party_snapshots: { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.document_party_snapshots'" } } });
    await expect(leerPartesDocumento(db, 42, 'cotizacion', 'c1')).resolves.toEqual({
      origen: 'reconstruido',
      emisor: null,
      receptor: null,
      emisorReconstruido: true,
      receptorReconstruido: true,
    });
  });

  test('mapeos defensivos del payload de Factus', () => {
    expect(receptorDesdeXml(null, 'cliente')).toBeNull();
    expect(receptorDesdeXml({ names: 'Sin identificación' }, 'cliente')).toBeNull();
    expect(receptorDesdeXml({ identification: '800', names: 'Proveedor', dv: '3' }, 'proveedor')).toMatchObject({ name: 'Proveedor', nit: '800', dv: '3' });
    expect(emisorDesdeRespuesta({ data: { company: { nit: '900' } } })).toBeNull();
    expect(emisorDesdeRespuesta({ company: { nit: '900', name: 'X', responsibilities: [{ code: 'O-13' }, 'O-23'] } })).toMatchObject({ fiscal_responsibilities: ['O-13', 'O-23'] });
  });
});

describe('reimpresión reconstruida: advertencia visible y precisa (ronda 4 del Contador)', () => {
  const conPartes = (partes: PartesDocumento | null) => ({ partes }) as unknown as BaseDocumento;

  test('sin nada guardado: se dice que no es copia idéntica, qué se reconstruyó y que el contenido no se recalcula', async () => {
    const { db } = doble({ document_party_snapshots: { data: null, error: null } });
    const factura = await leerPartesDocumento(db, 42, 'factura_venta', 'f9');
    expect(bandaReconstruido(conPartes(factura)).map((b) => b.clave)).toEqual([
      'reimpresionReconstruida',
      'reconstruidoFecha',
      'reconstruidoEmisor',
      'reconstruidoReceptor',
      'reconstruidoContenido',
    ]);
    // Un recibo de pago no lleva receptor: solo se reconstruye el emisor.
    const recibo = await leerPartesDocumento(db, 42, 'recibo_pago', 'r9');
    expect(recibo.receptorReconstruido).toBe(false);
    expect(bandaReconstruido(conPartes(recibo)).map((b) => b.clave)).toEqual([
      'reimpresionReconstruida',
      'reconstruidoFecha',
      'reconstruidoEmisor',
      'reconstruidoContenido',
    ]);
  });

  test('envío aceptado sin la empresa en la respuesta: solo el emisor es reconstruido', () => {
    const p: PartesDocumento = { origen: 'factus', emisor: null, receptor: { full_name: 'Cliente del XML' }, emisorReconstruido: true, receptorReconstruido: false };
    expect(bandaReconstruido(conPartes(p)).map((b) => b.clave)).toEqual([
      'reimpresionReconstruida',
      'reconstruidoFecha',
      'reconstruidoEmisor',
      'reconstruidoContenido',
    ]);
  });

  test('con instantánea no hay banda', () => {
    const p: PartesDocumento = { origen: 'instantanea', emisor: { nit: '900' }, receptor: null, emisorReconstruido: false, receptorReconstruido: false };
    expect(bandaReconstruido(conPartes(p))).toEqual([]);
    expect(bandaReconstruido(conPartes(null))).toEqual([]);
  });
});

describe('reimpresión reconstruida: fecha de la reconstrucción (ronda 5 del Contador)', () => {
  test('la banda lleva la fecha y la hora de la reconstrucción en la zona del documento', () => {
    const p: PartesDocumento = { origen: 'reconstruido', emisor: null, receptor: null, emisorReconstruido: true, receptorReconstruido: true };
    const base = { partes: p, zonaHoraria: 'America/Bogota' } as unknown as BaseDocumento;
    // 2026-11-10 02:30 UTC = 2026-11-09 21:30 en Bogotá: la fecha es la de la zona, no la UTC.
    const banda = bandaReconstruido(base, new Date('2026-11-10T02:30:00Z')).find((b) => b.clave === 'reconstruidoFecha');
    expect(banda).toEqual({ clave: 'reconstruidoFecha', tono: 'aviso', vars: { fecha: '09/11/2026 21:30', zona: 'America/Bogota' } });
  });

  test('el texto de la banda sale de finanzasTributarioR5.bandas sin pisar documentos.bandas', () => {
    const documentos = { bandas: { anulada: 'Anulada' }, tipos: { x: 'X' } };
    const mezcla = conBandasRonda5(documentos, { bandas: { reconstruidoFecha: 'Reconstruida el {fecha}', anulada: 'otra' } });
    expect(mezcla).toEqual({ bandas: { reconstruidoFecha: 'Reconstruida el {fecha}', anulada: 'Anulada' }, tipos: { x: 'X' } });
    expect(conBandasRonda5(documentos, undefined)).toBe(documentos);
  });

  test('los cuatro idiomas tienen el texto de la fecha de la reconstrucción con sus variables', () => {
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const ruta = path.join(__dirname, '../../../../../messages', `${idioma}.json`);
      const m = JSON.parse(fs.readFileSync(ruta, 'utf8')) as { finanzasTributarioR5?: { bandas?: Record<string, string> } };
      const texto = m.finanzasTributarioR5?.bandas?.reconstruidoFecha ?? '';
      expect(texto).toContain('{fecha}');
      expect(texto).toContain('{zona}');
    }
  });
});
