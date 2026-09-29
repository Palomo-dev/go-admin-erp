/**
 * Lógica del catálogo de variantes (B6a): repetidos, orden del catálogo para
 * el POS y la tienda, código para el SKU y normalización del resumen.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 2 }));

import {
  catalogoOrdenDe,
  cifrasTipos,
  cifrasValores,
  clavePareceIgual,
  codigoSkuSugerido,
  estadoDe,
  gruposRepetidos,
  mapaRepetidos,
  metaSugerido,
  moverEnLista,
  normalizarHex,
  normalizarNombre,
  ordenarAtributosSegunCatalogo,
  pasaFiltroEstado,
  sePuedeEliminar,
  traduccionesFaltantes,
} from '@/components/inventario/variantes/logicaVariantes';
import { aErrorVariantes, aResumenVariantes, variantesService } from '@/components/inventario/variantes/variantesService';
import { escrituraVariantesSchema, estadoHttpDeError, permisoDeAccion } from '@/components/inventario/variantes/contrato';
import type { TipoVariante, ValorVariante } from '@/components/inventario/variantes/tipos';

const tipo = (id: number, nombre: string, extra: Partial<TipoVariante> = {}): TipoVariante => ({
  id,
  nombre,
  orden: id,
  activo: true,
  estilo: 'texto',
  meta: null,
  traducciones: {},
  creado: null,
  variantes: 0,
  relaciones: 0,
  valores_fuera: 0,
  escrituras: [],
  ...extra,
});
const valor = (id: number, tipo_id: number, texto: string, extra: Partial<ValorVariante> = {}): ValorVariante => ({
  id,
  tipo_id,
  valor: texto,
  orden: 0,
  activo: true,
  hex: null,
  imagen: null,
  sku: null,
  traducciones: {},
  variantes: 0,
  relaciones: 0,
  escrituras: [],
  ...extra,
});

describe('nombres y repetidos', () => {
  it('normaliza sin mayúsculas, tildes ni espacios sobrantes (igual que fn_variantes_int_norm)', () => {
    expect(normalizarNombre('  Diseño  ')).toBe('diseno');
    expect(normalizarNombre('Talla   Camiseta')).toBe('talla camiseta');
  });

  it('«Talla», «talla.», «Tallas» y «TALLA» se parecen; «Tallaje» no', () => {
    const claves = ['Talla', 'talla.', 'Tallas', 'TALLA', 'Tallaje'].map(clavePareceIgual);
    expect(new Set(claves.slice(0, 4)).size).toBe(1);
    expect(claves[4]).not.toBe(claves[0]);
    expect(clavePareceIgual('Colores')).toBe(clavePareceIgual('Color'));
    expect(clavePareceIgual('10 US')).toBe('10 us');
  });

  it('agrupa repetidos y marca como principal al más usado', () => {
    const tipos = [tipo(45, 'Talla', { variantes: 840 }), tipo(47, 'Tallas', { variantes: 21 }), tipo(52, 'talla.', { variantes: 35 }), tipo(48, 'Tallaje')];
    expect(gruposRepetidos(tipos, (x) => x.nombre)).toHaveLength(1);
    const mapa = mapaRepetidos(tipos, (x) => x.nombre);
    expect([...mapa.keys()].sort()).toEqual([47, 52]);
    expect(mapa.get(47)?.nombre).toBe('Talla');
    expect(estadoDe(tipos[1], mapa)).toBe('repetido');
    expect(estadoDe(tipos[0], mapa)).toBe('activo');
    expect(estadoDe(tipos[3], mapa)).toBe('sinUsar');
    expect(estadoDe({ ...tipos[0], activo: false }, mapa)).toBe('inactivo');
  });

  it('solo se elimina lo que no usa ninguna variante ni relación por id', () => {
    expect(sePuedeEliminar({ variantes: 0, relaciones: 0 })).toBe(true);
    expect(sePuedeEliminar({ variantes: 0, relaciones: 3 })).toBe(false);
    expect(sePuedeEliminar({ variantes: 2, relaciones: 0 })).toBe(false);
  });

  it('filtro de estado', () => {
    expect(pasaFiltroEstado('repetido', 'activos')).toBe(true);
    expect(pasaFiltroEstado('inactivo', 'activos')).toBe(false);
    expect(pasaFiltroEstado('sinUsar', 'sinUsar')).toBe(true);
    expect(pasaFiltroEstado('activo', 'todos')).toBe(true);
  });
});

describe('orden del catálogo para el POS y la tienda', () => {
  const catalogo = catalogoOrdenDe({
    tipos: [tipo(1, 'Talla', { orden: 1 }), tipo(2, 'Color', { orden: 0, estilo: 'color' }), tipo(3, 'Viejo', { orden: 2, activo: false })],
    valores: [
      valor(10, 1, 'XS', { orden: 0 }),
      valor(11, 1, 'S', { orden: 1 }),
      valor(12, 1, 'M', { orden: 2 }),
      valor(13, 1, 'L', { orden: 3 }),
      valor(14, 1, 'XL', { orden: 4 }),
      valor(20, 2, 'Rojo', { orden: 1, hex: '#DC2626' }),
      valor(21, 2, 'Negro', { orden: 0, hex: '#111827' }),
    ],
  });

  it('ordena tipos y valores por display_order, no alfabético («L, M, S, XL, XS»)', () => {
    const r = ordenarAtributosSegunCatalogo({ talla: ['L', 'M', 'S', 'XL', 'XS'], Color: ['rojo', 'Negro'] }, catalogo);
    expect(r.map((a) => a.nombre)).toEqual(['Color', 'talla']);
    expect(r[1].valores.map((v) => v.valor)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(r[0].estilo).toBe('color');
    expect(r[0].valores).toEqual([
      { valor: 'Negro', hex: '#111827' },
      { valor: 'rojo', hex: '#DC2626' },
    ]);
  });

  it('lo que no está en el catálogo va al final en orden natural (2 antes de 10)', () => {
    const r = ordenarAtributosSegunCatalogo({ Talla: ['10', 'M', '2'], Sabor: ['Mora', 'Fresa'] }, catalogo);
    expect(r.map((a) => a.nombre)).toEqual(['Talla', 'Sabor']);
    expect(r[0].valores.map((v) => v.valor)).toEqual(['M', '2', '10']);
    expect(r[1].valores.map((v) => v.valor)).toEqual(['Fresa', 'Mora']);
    expect(r[1].estilo).toBe('texto');
  });

  it('los tipos inactivos no dan orden (no se ofrecen)', () => {
    expect(catalogo.tipos.map((t) => t.nombre)).toEqual(['Talla', 'Color']);
  });
});

describe('formularios', () => {
  it('código para el SKU sugerido', () => {
    expect(codigoSkuSugerido('Negro')).toBe('NEG');
    expect(codigoSkuSugerido('Verde oliva')).toBe('VOL');
    expect(codigoSkuSugerido('10 US')).toBe('10US');
    expect(codigoSkuSugerido('Beige')).toBe('BEI');
    expect(codigoSkuSugerido('   ')).toBe('');
  });

  it('hex y atributo de Facebook', () => {
    expect(normalizarHex('6b7c3a')).toBe('#6B7C3A');
    expect(normalizarHex('')).toBe('');
    expect(metaSugerido('Colores')).toBe('color');
    expect(metaSugerido('Tamaño')).toBe('size');
    expect(metaSugerido('Referencia')).toBeNull();
  });

  it('mover en la lista y traducciones que faltan', () => {
    expect(moverEnLista([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moverEnLista([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(traduccionesFaltantes({ en: 'Olive', pt: ' ' }, ['en', 'fr', 'pt'])).toEqual(['fr', 'pt']);
  });
});

describe('cifras', () => {
  it('tipos: activos, sin orden y sin usar', () => {
    const c = cifrasTipos({
      tipos: [tipo(1, 'Talla', { variantes: 5 }), tipo(2, 'Tallas'), tipo(3, 'Color', { activo: false, variantes: 2 })],
      valores: [valor(1, 1, 'S'), valor(2, 1, 'M'), valor(3, 3, 'Rojo', { orden: 0 }), valor(4, 3, 'Azul', { orden: 1 })],
    });
    expect(c.activos).toBe(2);
    expect(c.valores).toBe(4);
    expect(c.tiposConValores).toBe(2);
    expect(c.sinOrden).toBe(1);
    expect(c.repetidos).toHaveLength(1);
    expect(c.sinUsar.map((t) => t.id)).toEqual([2]);
  });

  it('valores: con muestra y repetidos por tipo', () => {
    const c = cifrasValores([valor(1, 1, 'Rojo', { hex: '#DC2626', variantes: 3 }), valor(2, 1, 'rojo'), valor(3, 2, 'Rojo')]);
    expect(c.conMuestra).toBe(1);
    expect(c.repetidos).toHaveLength(1);
    expect(c.sinUsar.map((v) => v.id)).toEqual([2, 3]);
  });
});

describe('servicio y contrato', () => {
  it('normaliza el resumen de la RPC (números, nulos y estilos desconocidos)', () => {
    const r = aResumenVariantes({
      tipos: [{ id: '45', nombre: 'Talla', orden: '2', activo: true, estilo: 'raro', variantes: '840', escrituras: [{ texto: 'talla', variantes: '349' }], traducciones: { en: 'Size', xx: 'y' } }],
      valores: [{ id: 1, tipo_id: 45, valor: 'M', hex: null }],
      fuera_catalogo: { tipos: [], pares: '19' },
      variantes: '1033',
      globales: null,
    });
    expect(r.tipos[0]).toMatchObject({ id: 45, orden: 2, estilo: 'texto', variantes: 840, traducciones: { en: 'Size' } });
    expect(r.tipos[0].escrituras).toEqual([{ texto: 'talla', variantes: 349 }]);
    expect(r.fuera_catalogo.pares).toBe(19);
    expect(r.variantes).toBe(1033);
    expect(r.globales).toEqual([]);
    expect(aResumenVariantes(null).tipos).toEqual([]);
  });

  it('traduce los errores de la RPC a claves estables', () => {
    expect(aErrorVariantes({ code: '23505', message: 'nombre_repetido', hint: '45' })).toMatchObject({ clave: 'nombreRepetido', relacionado: 45 });
    expect(aErrorVariantes({ code: '42501', message: 'sin_permiso' }).clave).toBe('sinPermiso');
    expect(aErrorVariantes({ code: '42501', message: 'Acceso denegado a la organización' }).clave).toBe('sinPermiso');
    expect(aErrorVariantes({ code: '23503', message: 'en_uso' }).clave).toBe('enUso');
    expect(aErrorVariantes({ message: 'algo raro' }).clave).toBe('desconocido');
  });

  it('permisos y estados HTTP de la ruta', () => {
    expect(permisoDeAccion('eliminar')).toBe('eliminar');
    expect(permisoDeAccion('fusionar_tipos')).toBe('editar_catalogo');
    expect(estadoHttpDeError('42501')).toBe(403);
    expect(estadoHttpDeError(undefined)).toBe(500);
  });

  it('el contrato no admite la organización ni campos sueltos', () => {
    expect(escrituraVariantesSchema.safeParse({ accion: 'completar' }).success).toBe(true);
    expect(escrituraVariantesSchema.safeParse({ accion: 'completar', p_org: 5 }).success).toBe(false);
    expect(escrituraVariantesSchema.safeParse({ accion: 'valor_guardar', id: null, datos: { valor: 'M', sku: 'M-1' } }).success).toBe(false);
  });
});

describe('orden del catálogo para el POS (una consulta)', () => {
  it('lee tipos activos con sus valores activos y los deja listos para ordenarAtributosSegunCatalogo', async () => {
    const filtros: [string, unknown][] = [];
    const cliente = {
      from: (tabla: string) => {
        expect(tabla).toBe('variant_types');
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => {
            filtros.push([c, v]);
            return q;
          },
          then: (ok: (r: unknown) => unknown) =>
            ok({
              data: [
                {
                  name: 'Talla',
                  display_order: 1,
                  display_style: 'texto',
                  variant_values: [
                    { value: 'M', display_order: 1, hex_color: null, is_active: true },
                    { value: 'S', display_order: 0, hex_color: null, is_active: true },
                    { value: 'XXS', display_order: 9, hex_color: null, is_active: false },
                  ],
                },
                { name: 'Color', display_order: 0, display_style: 'color', variant_values: [{ value: 'Negro', display_order: 0, hex_color: '#111827', is_active: true }] },
              ],
              error: null,
            }),
        };
        return q;
      },
    };
    const catalogo = await variantesService.catalogoOrden(132, cliente as never);
    expect(filtros).toEqual([
      ['organization_id', 132],
      ['is_active', true],
    ]);
    expect(catalogo.valores.map((v) => v.valor)).toEqual(['M', 'S', 'Negro']);
    const r = ordenarAtributosSegunCatalogo({ Talla: ['M', 'S'], Color: ['Negro'] }, catalogo);
    expect(r.map((a) => a.nombre)).toEqual(['Color', 'Talla']);
    expect(r[1].valores.map((v) => v.valor)).toEqual(['S', 'M']);
  });
});
