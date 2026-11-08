/**
 * Reimpresión fiel (ronda 2 del Contador): el PDF de un documento expedido usa
 * la instantánea de expedición; sin ella, el envío aceptado guardado; sin nada,
 * la vigencia por fecha marcada «reconstruido».
 */
import { emisorDesdeRespuesta, leerPartesDocumento, receptorDesdeXml } from '../instantanea';

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
    await expect(leerPartesDocumento(db, 42, 'cotizacion', 'c1')).resolves.toEqual({ origen: 'reconstruido', emisor: null, receptor: null, emisorReconstruido: true });
  });

  test('mapeos defensivos del payload de Factus', () => {
    expect(receptorDesdeXml(null, 'cliente')).toBeNull();
    expect(receptorDesdeXml({ names: 'Sin identificación' }, 'cliente')).toBeNull();
    expect(receptorDesdeXml({ identification: '800', names: 'Proveedor', dv: '3' }, 'proveedor')).toMatchObject({ name: 'Proveedor', nit: '800', dv: '3' });
    expect(emisorDesdeRespuesta({ data: { company: { nit: '900' } } })).toBeNull();
    expect(emisorDesdeRespuesta({ company: { nit: '900', name: 'X', responsibilities: [{ code: 'O-13' }, 'O-23'] } })).toMatchObject({ fiscal_responsibilities: ['O-13', 'O-23'] });
  });
});
