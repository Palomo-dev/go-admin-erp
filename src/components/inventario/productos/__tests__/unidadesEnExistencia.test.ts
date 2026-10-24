import { unidadesEnExistencia } from '@/components/inventario/productos/logica/seriales';

describe('unidades en existencia al activar seriales', () => {
  it('suma el stock ya cargado del producto y de sus variantes, no la entrada nueva', () => {
    expect(unidadesEnExistencia({
      stock: [{ qty_actual: 20 }, { qty_actual: 0 }, { qty_actual: -1 }],
      variantes: [{ stock: [{ qty_actual: 14 }] }],
    })).toBe(34);
    expect(unidadesEnExistencia({})).toBe(0);
  });
});
