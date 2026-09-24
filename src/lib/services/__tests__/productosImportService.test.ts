/// <reference types="jest" />
/**
 * Importación en servidor: forma del cuerpo del lote, traducción de errores
 * de la RPC y guarda SSRF de las URLs que el servidor descarga.
 */
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));

import { codigoErrorRpc, ErrorLote, importarLote, validarCuerpoLote } from '@/lib/services/productosImportService';
import { urlPublicaSegura } from '@/lib/services/urlSegura';

const fila = { fila: 2, sku: 'A', nombre: 'Uno', proveedores: [], etiquetas: [], modificadores: [], es_padre: false, imagenes: ['https://img.example/1.jpg'] };

describe('validarCuerpoLote', () => {
  it('acepta un lote válido y normaliza opciones', () => {
    const c = validarCuerpoLote({ modo: 'solo_crear', branch_id: '7', opciones: { stock_existentes: 'x', importar_imagenes: false, origen: 'web', fuente_url: 'https://t.co' }, filas: [fila] });
    expect(c).toMatchObject({ modo: 'solo_crear', branch_id: 7, opciones: { stock_existentes: 'ignorar', importar_imagenes: false, origen: 'web', fuente_url: 'https://t.co' } });
  });
  it.each([
    [{ modo: 'borrar_todo', branch_id: 1, filas: [fila] }, 'INVALID_MODE'],
    [{ modo: 'solo_crear', branch_id: 0, filas: [fila] }, 'BRANCH_REQUIRED'],
    [{ modo: 'solo_crear', branch_id: 1, filas: [] }, 'ROWS_REQUIRED'],
    [{ modo: 'solo_crear', branch_id: 1, filas: Array(201).fill(fila) }, 'TOO_MANY_ROWS'],
    [null, 'INVALID_BODY'],
  ])('rechaza %#', (cuerpo, codigo) => {
    try {
      validarCuerpoLote(cuerpo);
      throw new Error('no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorLote);
      expect((e as ErrorLote).code).toBe(codigo);
    }
  });
});

describe('codigoErrorRpc', () => {
  it('traduce los mensajes de la RPC y de Postgres', () => {
    expect(codigoErrorRpc('STOCK_SIN_COSTO')).toBe('STOCK_SIN_COSTO');
    expect(codigoErrorRpc('duplicate key value violates unique constraint')).toBe('DUPLICADO');
    expect(codigoErrorRpc('new row violates check constraint "products_station_check"')).toBe('DATO_NO_VALIDO');
    expect(codigoErrorRpc('otra cosa')).toBe('ERROR');
  });
});

describe('importarLote', () => {
  it('llama la RPC con la sesión del usuario, sin URLs, y mapea errores de pertenencia', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { creados: 1, actualizados: 0, omitidos: 0, fallidos: 0, resultados: [{ fila: 2, sku: 'A', ok: true, accion: 'creado', product_id: 5, avisos: [] }] }, error: null });
    const r = await importarLote({ rpc } as never, 9, { modo: 'crear_y_actualizar', branch_id: 3, opciones: { stock_existentes: 'ignorar', importar_imagenes: false, origen: 'archivo' }, filas: [fila] });
    expect(rpc).toHaveBeenCalledWith('fn_importar_productos_lote', expect.objectContaining({ p_organization_id: 9, p_branch_id: 3, p_modo: 'crear_y_actualizar' }));
    expect(rpc.mock.calls[0][1].p_filas[0]).not.toHaveProperty('imagenes');
    expect(r.resultados[0]).toMatchObject({ ok: true, accion: 'creado', productId: 5 });

    const ajena = jest.fn().mockResolvedValue({ data: null, error: { message: 'SUCURSAL_NO_ES_DE_LA_ORGANIZACION' } });
    await expect(importarLote({ rpc: ajena } as never, 9, { modo: 'crear_y_actualizar', branch_id: 3, opciones: { stock_existentes: 'ignorar', importar_imagenes: false, origen: 'archivo' }, filas: [fila] })).rejects.toMatchObject({ status: 403, code: 'BRANCH_NOT_IN_ORG' });
  });
});

describe('urlPublicaSegura (SSRF)', () => {
  it.each(['https://tienda.com/a.jpg', 'http://cdn.shopify.com/x.png?v=1'])('permite %s', (u) => expect(urlPublicaSegura(u)).not.toBeNull());
  it.each([
    'http://localhost:3000/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/',
    'http://[::1]/x',
    'file:///etc/passwd',
    'ftp://x.com/a',
    'https://user:pass@x.com/',
    'https://x.com:8080/',
    'no es url',
  ])('bloquea %s', (u) => expect(urlPublicaSegura(u)).toBeNull());
});
