/**
 * PLU de balanza en el formulario del producto (PRODUCTOS-POR-PESO-BASCULA.md
 * §2.7, fase 4): solo en productos por peso o medida, entero de 1 a 99.999, y
 * el «PLU duplicado» del servidor (fn_producto_int_plu) cae en su campo.
 */
import {
  camposModoVenta,
  campoDeErrorRpc,
  estadoInicial,
  SECCION_DE_CAMPO,
  validarFormulario,
  validarPlu,
} from '@/components/inventario/productos/logica/formularioProducto';
import { PASO_DE_CAMPO } from '@/components/inventario/productos/formulario/mapaSecciones';
import { aErrorProducto } from '@/lib/services/productoService';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const base = estadoInicial([]);
const peso = { ...base, sale_mode: 'weight' as const, unit_code: 'KG', price: 18900 };

describe('PLU de balanza en el formulario', () => {
  it('viaja con «Cómo se vende»: por peso se envía; por unidad o servicio se borra', () => {
    expect(camposModoVenta({ ...peso, scale_plu: 104 }).scale_plu).toBe(104);
    expect(camposModoVenta({ ...peso, scale_plu: null }).scale_plu).toBeNull();
    expect(camposModoVenta({ ...base, scale_plu: 104 }).scale_plu).toBeNull();
    expect(camposModoVenta({ ...peso, product_type: 'service', scale_plu: 104 }).scale_plu).toBeNull();
  });

  it('entero de 1 a 99.999; vacío vale; por unidad no se valida', () => {
    expect(validarPlu({ ...peso, scale_plu: 104 })).toBeNull();
    expect(validarPlu({ ...peso, scale_plu: null })).toBeNull();
    expect(validarPlu({ ...peso, scale_plu: 0 })).toBe('plu_invalido');
    expect(validarPlu({ ...peso, scale_plu: 100000 })).toBe('plu_invalido');
    expect(validarPlu({ ...peso, scale_plu: 10.5 })).toBe('plu_invalido');
    expect(validarPlu({ ...base, scale_plu: 0 })).toBeNull();
  });

  it('el error va al campo scale_plu, en la sección Códigos', () => {
    const err = validarFormulario({ ...peso, sku: 'Q-1', name: 'Queso', scale_plu: 0 }, 'crear', {});
    expect(err.scale_plu).toBe('plu_invalido');
    expect(SECCION_DE_CAMPO.scale_plu).toBe('codigos');
    expect(PASO_DE_CAMPO.scale_plu).toBe('detalles');
  });

  it('«PLU duplicado» del servidor: código propio y campo scale_plu', () => {
    const e = aErrorProducto({ message: 'plu_duplicado', details: '15049', code: '23505' });
    expect(e.codigo).toBe('plu_duplicado');
    expect(campoDeErrorRpc(e.codigo)).toBe('scale_plu');
    expect(campoDeErrorRpc(aErrorProducto({ message: 'plu_invalido', code: '22023' }).codigo)).toBe('scale_plu');
  });
});
