/**
 * Cuentas que el contador pide agregar, por sector.
 * Dos códigos quedan por definir hasta que Juan confirme: la contribución
 * parafiscal del turismo y el costo de la actividad de servicios (6155 o 6170).
 */

export type SectorPlantilla = 'todos' | 'comercio' | 'restaurante' | 'hotel' | 'servicios' | 'manufactura';

export type EstadoCuentaPlantilla = 'agregar' | 'por_definir';

export interface CuentaPlantilla {
  /** Código que se puede programar. Null mientras Juan no confirme. */
  codigo: string | null;
  /** Lo que trae la hoja, aunque no se use como código definitivo. */
  codigoEnHoja: string | null;
  nombre: string;
  sector: SectorPlantilla;
  nota: string;
  estado: EstadoCuentaPlantilla;
  alternativas: readonly string[];
  naturaleza: 'debito' | 'credito' | null;
}

const TODOS: readonly CuentaPlantilla[] = [
  fila('1120', 'Cuentas de ahorro', 'todos', ''),
  fila('1330', 'Anticipos a proveedores', 'todos', ''),
  fila('1355', 'Anticipo de impuestos', 'todos', 'Subcuentas: 135515 retención en la fuente, 135517 retención de IVA, 135518 retención de ICA.'),
  fila('135515', 'Retención en la fuente', 'todos', 'Subcuenta de 1355.'),
  fila('135517', 'Retención de IVA (reteIVA)', 'todos', 'Subcuenta de 1355.'),
  fila('135518', 'Retención de ICA (reteICA)', 'todos', 'Subcuenta de 1355.'),
  fila('1365', 'Cuentas por cobrar a trabajadores', 'todos', ''),
  fila('1380', 'Deudores varios', 'todos', ''),
  fila('1399', 'Deterioro de cartera', 'todos', 'Naturaleza crédito.', 'credito'),
  fila('1524', 'Equipo de oficina', 'todos', ''),
  fila('1528', 'Equipo de cómputo y comunicación', 'todos', ''),
  fila('1540', 'Flota y equipo de transporte', 'todos', ''),
  fila('1592', 'Depreciación acumulada', 'todos', 'Naturaleza crédito.', 'credito'),
  fila('16', 'Intangibles', 'todos', 'Licencias.'),
  fila('2335', 'Costos y gastos por pagar', 'todos', ''),
  fila('2355', 'Deudas con socios', 'todos', ''),
  fila('2370', 'Retenciones y aportes de nómina', 'todos', ''),
  fila('2380', 'Acreedores varios', 'todos', ''),
  fila('2404', 'Impuesto de renta', 'todos', ''),
  fila('2412', 'Industria y comercio', 'todos', ''),
  fila('2505', 'Salarios por pagar', 'todos', ''),
  fila('2510', 'Cesantías', 'todos', ''),
  fila('2515', 'Intereses sobre cesantías', 'todos', ''),
  fila('2520', 'Prima de servicios', 'todos', ''),
  fila('2525', 'Vacaciones', 'todos', ''),
  fila('2805', 'Anticipos de clientes', 'todos', ''),
  fila('2815', 'Ingresos recibidos para terceros', 'todos', ''),
  fila('3305', 'Reserva legal', 'todos', ''),
  fila('3705', 'Utilidades acumuladas', 'todos', ''),
  fila('3710', 'Pérdidas acumuladas', 'todos', 'Naturaleza débito.', 'debito'),
  fila('4210', 'Financieros', 'todos', ''),
  fila('4250', 'Recuperaciones', 'todos', ''),
  fila('4295', 'Diversos', 'todos', ''),
  fila('5110', 'Honorarios', 'todos', ''),
  fila('5115', 'Impuestos', 'todos', ''),
  fila('5120', 'Arrendamientos', 'todos', ''),
  fila('5130', 'Seguros', 'todos', ''),
  fila('5140', 'Gastos legales', 'todos', ''),
  fila('5145', 'Mantenimiento', 'todos', ''),
  fila('5155', 'Gastos de viaje', 'todos', ''),
  fila('5160', 'Depreciaciones', 'todos', ''),
  fila('5165', 'Amortizaciones', 'todos', ''),
  fila('5195', 'Diversos', 'todos', ''),
  fila('52', 'Gastos de ventas', 'todos', 'Grupo completo, como espejo de 51.'),
  fila('5405', 'Impuesto de renta', 'todos', ''),
  fila('5905', 'Ganancias y pérdidas', 'todos', 'Para el cierre.'),
];

const RESTAURANTE: readonly CuentaPlantilla[] = [
  fila('4140', 'Hoteles y restaurantes', 'restaurante', ''),
  fila('6140', 'Costo de ventas hoteles y restaurantes', 'restaurante', ''),
  fila('1405', 'Materias primas', 'restaurante', 'Insumos.'),
  fila('1460', 'Envases y empaques', 'restaurante', ''),
  fila('2815', 'Ingresos recibidos para terceros', 'restaurante', 'Propinas.'),
  fila('2495', 'Otros', 'restaurante', 'Impuesto nacional al consumo (el PUC de 1993 no lo trae).'),
];

const HOTEL: readonly CuentaPlantilla[] = [
  fila('4140', 'Hoteles y restaurantes', 'hotel', 'Alojamiento.'),
  fila('6140', 'Costo de ventas hoteles y restaurantes', 'hotel', ''),
  fila('2805', 'Anticipos de clientes', 'hotel', 'Anticipos de reservas.'),
  fila('2815', 'Ingresos recibidos para terceros', 'hotel', 'Propinas.'),
  {
    codigo: null,
    codigoEnHoja: null,
    nombre: 'Contribución parafiscal para el turismo',
    sector: 'hotel',
    nota: 'Crear cuenta para esta contribución; código a validar con el contador.',
    estado: 'por_definir',
    alternativas: [],
    naturaleza: null,
  },
];

const SERVICIOS: readonly CuentaPlantilla[] = [
  {
    codigo: '4155',
    codigoEnHoja: '4155',
    nombre: 'Actividades inmobiliarias, empresariales y de alquiler',
    sector: 'servicios',
    nota: 'O según actividad: 4145 transporte, 4165 enseñanza, 4170 salud.',
    estado: 'agregar',
    alternativas: ['4145', '4165', '4170'],
    naturaleza: null,
  },
  {
    codigo: null,
    codigoEnHoja: '6155',
    nombre: 'Costo de ventas de la actividad de servicios',
    sector: 'servicios',
    nota: 'La hoja anota 6155 y queda abierta 6170. Ninguna de las dos es definitiva hasta que Juan confirme.',
    estado: 'por_definir',
    alternativas: ['6155', '6170'],
    naturaleza: null,
  },
  fila('74', 'Contratos de servicios (clase 7)', 'servicios', ''),
];

const MANUFACTURA: readonly CuentaPlantilla[] = [
  fila('4120', 'Industrias manufactureras', 'manufactura', ''),
  fila('6120', 'Costo de ventas industrias manufactureras', 'manufactura', ''),
  fila('1405', 'Materias primas', 'manufactura', ''),
  fila('1410', 'Productos en proceso', 'manufactura', ''),
  fila('1430', 'Productos terminados', 'manufactura', ''),
  fila('71', 'Materia prima (clase 7)', 'manufactura', ''),
  fila('72', 'Mano de obra directa (clase 7)', 'manufactura', ''),
  fila('73', 'Costos indirectos (clase 7)', 'manufactura', ''),
];

/** El comercio no tiene filas propias en «Cuentas a agregar»: sale de la reclasificación. */
const COMERCIO: readonly CuentaPlantilla[] = [
  fila('4135', 'Comercio al por mayor y al por menor', 'comercio', 'Reclasificación de 4105 cuando la plantilla vendía comercio.'),
  fila('6135', 'Costo de ventas comercio al por mayor y al por menor', 'comercio', 'Reclasificación de 6105. 6105 sigue siendo agricultura.'),
  fila('1435', 'Mercancías no fabricadas por la empresa', 'comercio', 'Reclasificación de 1405. 1405 sigue siendo materias primas.'),
];

export const CUENTAS_PLANTILLA: readonly CuentaPlantilla[] = [
  ...TODOS,
  ...RESTAURANTE,
  ...HOTEL,
  ...SERVICIOS,
  ...MANUFACTURA,
];

export const ALTERNATIVAS_COSTO_SERVICIOS = ['6155', '6170'] as const;

export function plantillaDeSector(sector: Exclude<SectorPlantilla, 'todos'>): readonly CuentaPlantilla[] {
  const propias = sector === 'comercio'
    ? COMERCIO
    : CUENTAS_PLANTILLA.filter((cuenta) => cuenta.sector === sector);
  return [...TODOS, ...propias];
}

/** type_id de la organización. Manufactura no tiene tipo: se elige aparte. */
export function sectorDeTipoOrganizacion(typeId: number): 'restaurante' | 'hotel' | 'comercio' | 'servicios' | null {
  if (typeId === 1) return 'restaurante';
  if (typeId === 2) return 'hotel';
  if (typeId === 3) return 'comercio';
  if (typeId === 4) return 'servicios';
  return null;
}

export function cuentasPorDefinir(): readonly CuentaPlantilla[] {
  return CUENTAS_PLANTILLA.filter((cuenta) => cuenta.estado === 'por_definir');
}

function fila(
  codigo: string,
  nombre: string,
  sector: SectorPlantilla,
  nota: string,
  naturaleza: 'debito' | 'credito' | null = null,
): CuentaPlantilla {
  return {
    codigo,
    codigoEnHoja: codigo,
    nombre,
    sector,
    nota,
    estado: 'agregar',
    alternativas: [],
    naturaleza,
  };
}
