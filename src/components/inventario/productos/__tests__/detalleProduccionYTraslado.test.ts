/**
 * B7 — detalle del producto (INVENTARIO-PLAN §5.8):
 * - monta la pestaña «Producción» de B5 con su contrato
 *   (`<PestanaProduccion producto={…} permisos={…} />`) y la muestra cuando
 *   `debeMostrarPestanaProduccion` lo dice (o si se llega por enlace directo);
 * - «Transferir» lleva el producto y la sucursal de la cabecera como origen.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { esPestana, PESTANAS_DETALLE, subPestanaValida } from '../detalle/tipos';

const detalle = readFileSync(join(process.cwd(), 'src', 'components', 'inventario', 'productos', 'detalle', 'DetalleProducto.tsx'), 'utf8');
const cargar = readFileSync(join(process.cwd(), 'src', 'components', 'inventario', 'productos', 'detalle', 'cargarProducto.ts'), 'utf8');

describe('pestaña Producción', () => {
  it('es una pestaña del detalle, sin sub-pestañas propias del detalle (usa ?psub=)', () => {
    expect(PESTANAS_DETALLE).toContain('produccion');
    expect(esPestana('produccion')).toBe(true);
    expect(subPestanaValida('produccion', 'costo')).toBeNull();
  });

  it('se monta con el contrato de B5 y solo cuando tiene contenido', () => {
    expect(detalle).toContain("from './produccion'");
    expect(detalle).toContain('<PestanaProduccion producto={producto} permisos={permisos} />');
    expect(detalle).toContain("debeMostrarPestanaProduccion(producto) || tab === 'produccion'");
    expect(cargar).toContain('production_type');
  });
});

describe('Transferir desde el detalle', () => {
  it('lleva producto_id y el origen de la sucursal elegida', () => {
    expect(detalle).toContain('/app/inventario/transferencias/nuevo?producto_id=${producto.id}');
    expect(detalle).toContain('&origen=${selectedBranchId}');
  });
});
