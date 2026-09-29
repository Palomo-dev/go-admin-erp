/**
 * Servicio de la biblioteca: todo por RPC con la organización de la sesión,
 * borrado del storage solo de lo que el servidor dice que ya nadie usa, y sin
 * archivos huérfanos si el registro falla.
 */
const rpc = jest.fn();
const remove = jest.fn();
const upload = jest.fn();
const getSession = jest.fn();

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: (bucket: string) => ({ remove: (r: string[]) => remove(bucket, r), upload: (...a: unknown[]) => upload(bucket, ...a) }) },
    auth: { getSession: () => getSession() },
    from: jest.fn(),
  },
}));
jest.mock('@/components/inventario/productos/imagenes/subirImagen', () => ({
  urlImagen: (r: string) => `https://cdn/${r}`,
  bucketDeRuta: (r: string) => (r.startsWith('products/') ? 'product-images' : 'organization_images'),
}));

import { eliminarImagenes, listarBiblioteca, resumenImagenes, subirImagen, ErrorSubida } from '../ImagenesService';
import { parametrosListado } from '../imagenesLogica';

beforeEach(() => {
  rpc.mockReset();
  remove.mockReset().mockResolvedValue({ error: null });
  upload.mockReset().mockResolvedValue({ error: null });
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
});

describe('lecturas', () => {
  it('el listado manda la organización y los filtros a fn_imagenes_listado y arma la URL pública', async () => {
    rpc.mockResolvedValue({ data: { total: 1, filas: [{ id: 7, storage_path: '2/a.jpg', file_name: 'a.jpg', file_size: 10, productos: 3, dimensions: { width: 10, height: 5 } }] }, error: null });
    const p = parametrosListado({ busqueda: '', filtros: {}, pagina: 2, tamano: 10, orden: null });
    const r = await listarBiblioteca(2, p);
    expect(rpc).toHaveBeenCalledWith('fn_imagenes_listado', expect.objectContaining({ p_org: 2, p_origen: 'biblioteca', p_offset: 10, p_limit: 10 }));
    expect(r.total).toBe(1);
    expect(r.filas[0]).toMatchObject({ id: 7, productos: 3, url: 'https://cdn/2/a.jpg', dimensions: { width: 10, height: 5 } });
  });
  it('otra organización (42501) llega como error para que la pantalla muestre «sin permiso»', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_permiso' } });
    await expect(resumenImagenes(999)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('eliminar', () => {
  it('borra del storage solo las rutas que devuelve el servidor, por bucket, y nunca URLs externas', async () => {
    rpc.mockResolvedValue({
      data: { eliminadas: 2, quitadas_de_productos: 3, rutas: ['2/a.jpg', 'products/2/b.png', 'https://externa/x.jpg'] },
      error: null,
    });
    const r = await eliminarImagenes(2, [1, 2]);
    expect(rpc).toHaveBeenCalledWith('fn_imagenes_eliminar', { p_org: 2, p_ids: [1, 2] });
    expect(remove).toHaveBeenCalledWith('organization_images', ['2/a.jpg']);
    expect(remove).toHaveBeenCalledWith('product-images', ['products/2/b.png']);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ eliminadas: 2, quitadas_de_productos: 3 });
  });
  it('si el servidor rechaza (sin permiso), no toca el storage', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(eliminarImagenes(2, [1])).rejects.toMatchObject({ code: '42501' });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('subir', () => {
  const archivo = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });

  it('rechaza en el navegador lo que el servidor rechazaría, sin subir nada', async () => {
    await expect(subirImagen(2, archivo('foto.heic', 'image/heic', 10), () => undefined)).rejects.toBeInstanceOf(ErrorSubida);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sube a la carpeta de la organización y registra con fn_imagen_registrar', async () => {
    rpc.mockResolvedValue({ data: { id: 9, storage_path: '2/x-a.png', file_name: 'a.png', file_size: 4, usada_en: [] }, error: null });
    const avance: number[] = [];
    const r = await subirImagen(2, archivo('a.png', 'image/png', 4), (p) => avance.push(p));
    expect(upload).toHaveBeenCalledWith('organization_images', expect.stringMatching(/^2\/[a-z0-9]+-a\.png$/), expect.any(File), expect.objectContaining({ contentType: 'image/png', upsert: false }));
    expect(rpc).toHaveBeenCalledWith('fn_imagen_registrar', expect.objectContaining({ p_org: 2, p_file_name: 'a.png', p_file_size: 4, p_mime_type: 'image/png' }));
    expect(avance).toContain(100);
    expect(r.id).toBe(9);
  });
  it('si el registro falla, borra el archivo recién subido (nada huérfano)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(subirImagen(2, archivo('a.jpg', 'image/jpeg', 4), () => undefined)).rejects.toMatchObject({ motivo: 'registro' });
    const ruta = upload.mock.calls[0][1];
    expect(remove).toHaveBeenCalledWith('organization_images', [ruta]);
  });
});
