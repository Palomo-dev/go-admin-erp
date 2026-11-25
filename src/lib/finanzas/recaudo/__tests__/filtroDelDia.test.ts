import { claveFiltroDelDia, guardarFiltroDelDia, leerFiltroDelDia, olvidarFiltroDelDia, type AlmacenFiltro } from '../filtroDelDia';

function almacen(): AlmacenFiltro & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
}

describe('filtro recordado solo durante el día', () => {
  const clave = claveFiltroDelDia('pedidos-online', 358, 'u1');

  it('la clave separa organización, persona y pantalla', () => {
    expect(clave).not.toBe(claveFiltroDelDia('pedidos-online', 358, 'u2'));
    expect(clave).not.toBe(claveFiltroDelDia('movimientos', 358, 'u1'));
    expect(clave).not.toBe(claveFiltroDelDia('pedidos-online', 1, 'u1'));
  });

  it('el mismo día devuelve lo guardado', () => {
    const a = almacen();
    guardarFiltroDelDia(a, clave, '2026-11-25', { periodo: 'yesterday', medios: ['bold'] });
    expect(leerFiltroDelDia(a, clave, '2026-11-25')).toEqual({ periodo: 'yesterday', medios: ['bold'] });
  });

  it('al día siguiente vuelve el defecto y se borra lo viejo', () => {
    const a = almacen();
    guardarFiltroDelDia(a, clave, '2026-11-25', { periodo: 'yesterday' });
    expect(leerFiltroDelDia(a, clave, '2026-11-26')).toBeNull();
    expect(a.datos.has(clave)).toBe(false);
  });

  it('un valor dañado o sin almacén no rompe la pantalla', () => {
    const a = almacen();
    a.setItem(clave, '{no es json');
    expect(leerFiltroDelDia(a, clave, '2026-11-25')).toBeNull();
    expect(leerFiltroDelDia(null, clave, '2026-11-25')).toBeNull();
    const roto: AlmacenFiltro = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(() => guardarFiltroDelDia(roto, clave, '2026-11-25', 1)).not.toThrow();
    expect(leerFiltroDelDia(roto, clave, '2026-11-25')).toBeNull();
    expect(() => olvidarFiltroDelDia(roto, clave)).not.toThrow();
  });
});
