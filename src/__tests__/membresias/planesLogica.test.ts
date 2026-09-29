/** Planes de membresía (B1/B2/B3): filtro local, estado, cifras, texto de acceso y rutas. */
import {
  RUTA_NUEVO_PLAN,
  estadoPlan,
  filtrarPlanes,
  leerFiltroPlanes,
  normalizar,
  ordenarPlanes,
  resumenPlanes,
  rutaEditarProducto,
  rutaPlan,
  textoDias,
  textoFranja,
} from '@/components/membresias/planes/logicaPlanes';
import { preseleccionDesdeUrl } from '@/components/inventario/productos/logica/membresiaProducto';
import type { PlanFila, ReglasPlan } from '@/lib/services/membresias/tipos';

const reglas: ReglasPlan = {
  durationUnit: 'month',
  durationValue: 1,
  billingMode: 'prepaid',
  graceDays: 0,
  requiresActivation: false,
  activationWindowDays: null,
  freezeAllowed: false,
  freezeMaxTimes: null,
  freezeMaxDays: null,
  allowedBranchIds: null,
  accessSchedule: null,
  dailyCheckinLimit: null,
};

function plan(extra: Partial<PlanFila>): PlanFila {
  return {
    id: 1,
    nombre: 'Plan mensual',
    descripcion: null,
    productId: 10,
    productUuid: null,
    sku: 'MEM-MENS-01',
    estadoProducto: 'active',
    activo: true,
    precio: 120000,
    reglas,
    membresiasVivas: 0,
    membresiasActivas: 0,
    ...extra,
  };
}

const planes = [
  plan({ id: 1, nombre: 'Plan Mensual', sku: 'MEM-MENS-01', membresiasActivas: 86, membresiasVivas: 91 }),
  plan({ id: 2, nombre: 'Plan Básico (antiguo)', productId: null, sku: null, membresiasActivas: 0 }),
  plan({ id: 3, nombre: 'Plan Estudiante', sku: 'MEM-EST-01', activo: false, membresiasActivas: 0, membresiasVivas: 2 }),
  plan({ id: 4, nombre: 'Anual', sku: 'MEM-ANUAL-01', membresiasActivas: 18, membresiasVivas: 18 }),
];

describe('estado del plan', () => {
  it('sin producto manda sobre activo', () => {
    expect(estadoPlan(planes[0])).toBe('activo');
    expect(estadoPlan(planes[1])).toBe('sin_producto');
    expect(estadoPlan(planes[2])).toBe('inactivo');
  });
});

describe('filtro y búsqueda locales', () => {
  it('busca por nombre sin tildes ni mayúsculas y por SKU', () => {
    expect(filtrarPlanes(planes, { q: 'basico' }).map((p) => p.id)).toEqual([2]);
    expect(filtrarPlanes(planes, { q: 'anual-01' }).map((p) => p.id)).toEqual([4]);
    expect(filtrarPlanes(planes, { q: '  ' })).toHaveLength(4);
  });
  it('activos / inactivos (sin producto cuenta como no activo)', () => {
    expect(filtrarPlanes(planes, { estado: 'activos' }).map((p) => p.id)).toEqual([1, 4]);
    expect(filtrarPlanes(planes, { estado: 'inactivos' }).map((p) => p.id)).toEqual([2, 3]);
  });
  it('filtro desconocido en la URL = todos', () => {
    expect(leerFiltroPlanes('activos')).toBe('activos');
    expect(leerFiltroPlanes('x')).toBe('todos');
    expect(leerFiltroPlanes(null)).toBe('todos');
  });
  it('normaliza', () => {
    expect(normalizar(' Ñandú ')).toBe('nandu');
  });
});

describe('cifras de la cabecera', () => {
  it('cuenta activos, inactivos, sin producto y membresías', () => {
    expect(resumenPlanes(planes)).toEqual({ total: 4, activos: 2, inactivos: 2, sinProducto: 1, activas: 104, vivas: 111 });
    expect(resumenPlanes([])).toEqual({ total: 0, activos: 0, inactivos: 0, sinProducto: 0, activas: 0, vivas: 0 });
  });
  it('ordena activos primero y luego por nombre', () => {
    expect(ordenarPlanes(planes).map((p) => p.id)).toEqual([4, 1, 3, 2]);
  });
});

describe('texto de acceso', () => {
  const corto = (d: number) => ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][d];
  it('tramos de 3 o más días seguidos se abrevian', () => {
    expect(textoDias([1, 2, 3, 4, 5], corto)).toBe('lun–vie');
    expect(textoDias([6, 7], corto)).toBe('sáb, dom');
    expect(textoDias([1, 3, 4, 5, 7], corto)).toBe('lun, mié–vie, dom');
    expect(textoDias([5, 1, 1, 2], corto)).toBe('lun, mar, vie');
  });
  it('los 7 días o ninguno = sin restricción', () => {
    expect(textoDias([1, 2, 3, 4, 5, 6, 7], corto)).toBeNull();
    expect(textoDias([], corto)).toBeNull();
    expect(textoDias(undefined, corto)).toBeNull();
  });
  it('franja solo con ambas horas', () => {
    expect(textoFranja({ dias: [1], desde: '05:00:00', hasta: '10:00' })).toBe('05:00–10:00');
    expect(textoFranja({ dias: [1] })).toBeNull();
    expect(textoFranja(null)).toBeNull();
  });
});

describe('rutas', () => {
  it('detalle, producto por uuid y «Nuevo plan» con Servicio › Membresía', () => {
    expect(rutaPlan(7)).toBe('/app/membresias/planes/7');
    expect(rutaEditarProducto('a-b')).toBe('/app/inventario/productos/a-b/editar');
    const [ruta, query] = RUTA_NUEVO_PLAN.split('?');
    expect(ruta).toBe('/app/inventario/productos/nuevo');
    expect(preseleccionDesdeUrl(query)).toEqual({ product_type: 'service', service_type: 'membership' });
  });
});
