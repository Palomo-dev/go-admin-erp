/**
 * Plan único que se copia al crear una organización.
 * PUC comercial, Decreto 2650 de 1993, clases 1 a 9.
 *
 * 4110 es Pesca y 4115 es Explotación de minas y canteras. Hotelería es
 * 414005 y restaurantes 414015. La comisión de canales es 529505; 5235
 * queda como Servicios. La clase 8 es débito y la 9 crédito; 84/86/88 y
 * 94/96/98 son la contrapartida.
 */
import {
  claseDe,
  naturalezaPorClase,
  nivelDe,
  prefijoPadre,
  tipoDeClase,
  type NaturalezaPuc,
  type NivelPuc,
  type TipoCuentaPuc,
} from './pucJerarquia';

export interface CuentaPlantilla {
  codigo: string;
  nombre: string;
  tipo: TipoCuentaPuc;
  padre: string | null;
  descripcion: string | null;
  naturaleza: NaturalezaPuc;
  esMovimiento: boolean;
  nivel: NivelPuc;
  requiereTercero: boolean;
  requiereCentroCosto: boolean;
}

/** Contrapartidas: naturaleza opuesta a la de su clase. */
const NATURALEZA_EXPLICITA: Record<string, NaturalezaPuc> = {
  '1399': 'credito',
  '1592': 'credito',
  '1599': 'credito',
  '1698': 'credito',
  '3610': 'debito',
  '3710': 'debito',
  '4175': 'debito',
  '6225': 'credito',
};

/** 84/86/88 acreditan la clase 8. 94/96/98 debitan la clase 9. El grupo arrastra a sus hijas. */
const CONTRA_ORDEN: Record<string, NaturalezaPuc> = {
  '84': 'credito',
  '86': 'credito',
  '88': 'credito',
  '94': 'debito',
  '96': 'debito',
  '98': 'debito',
};

const TERCERO = new Set([
  '1305', '1310', '1325', '1330', '1355', '1365', '1380',
  '2105', '2205', '2210', '2215',
  '2305', '2335', '2365', '2367', '2368', '2370', '2380',
  '2505', '2805',
]);

const DESCRIPCION: Record<string, string> = {
  '1405': 'Materias primas. La mercancía para la venta es 1435.',
  '1435': 'Mercancías no fabricadas por la empresa.',
  '2105': 'Obligaciones financieras con bancos nacionales. Los proveedores van en 2205.',
  '2205': 'Proveedores nacionales.',
  '2335': 'Costos y gastos por pagar, incluida la comisión de los canales de venta.',
  '2365': 'Retención en la fuente practicada, por pagar.',
  '2367': 'IVA retenido, por pagar.',
  '2368': 'Impuesto de industria y comercio retenido, por pagar.',
  '2370': 'Retenciones y aportes de nómina.',
  '2408': 'IVA generado por pagar.',
  '2805': 'Anticipos y avances recibidos, incluidos los saldos a favor de clientes.',
  '3115': 'Aportes sociales. Un aporte de capital adicional se acredita aquí cuando la cuenta existe.',
  '4105': 'Agricultura, ganadería, caza y silvicultura. El comercio es 4135.',
  '4110': 'Pesca. El ingreso de restaurante es 414015.',
  '4115': 'Explotación de minas y canteras. El hospedaje es 414005.',
  '4135': 'Comercio al por mayor y al por menor.',
  '414005': 'Hotelería.',
  '414015': 'Restaurantes.',
  '4175': 'Devoluciones, rebajas y descuentos en ventas. Naturaleza débito.',
  '4235': 'Servicios. Las sesiones y los pases de parqueadero se acreditan aquí.',
  '5150': 'Adecuación e instalación. El faltante de inventario es 519595.',
  '519595': 'Faltantes de inventario.',
  '5235': 'Servicios de venta. La comisión de canales es 529505.',
  '529505': 'Comisiones, incluidas las de canales de venta.',
  '5305': 'Gastos financieros.',
  '6105': 'Costo de ventas de agricultura, ganadería, caza y silvicultura. El comercio es 6135.',
  '6135': 'Costo de ventas del comercio al por mayor y al por menor.',
};

type Fila = readonly [codigo: string, nombre: string];

const CLASES: readonly Fila[] = [
  ['1', 'Activo'],
  ['2', 'Pasivo'],
  ['3', 'Patrimonio'],
  ['4', 'Ingresos'],
  ['5', 'Gastos'],
  ['6', 'Costos de ventas'],
  ['7', 'Costos de producción o de operación'],
  ['8', 'Cuentas de orden deudoras'],
  ['9', 'Cuentas de orden acreedoras'],
];

const GRUPOS: readonly Fila[] = [
  ['11', 'Disponible'],
  ['12', 'Inversiones'],
  ['13', 'Deudores'],
  ['14', 'Inventarios'],
  ['15', 'Propiedades, planta y equipo'],
  ['16', 'Intangibles'],
  ['17', 'Diferidos'],
  ['18', 'Otros activos'],
  ['19', 'Valorizaciones'],
  ['21', 'Obligaciones financieras'],
  ['22', 'Proveedores'],
  ['23', 'Cuentas por pagar'],
  ['24', 'Impuestos, gravámenes y tasas'],
  ['25', 'Obligaciones laborales'],
  ['26', 'Pasivos estimados y provisiones'],
  ['27', 'Diferidos'],
  ['28', 'Otros pasivos'],
  ['29', 'Bonos y papeles comerciales'],
  ['31', 'Capital social'],
  ['32', 'Superávit de capital'],
  ['33', 'Reservas'],
  ['36', 'Resultados del ejercicio'],
  ['37', 'Resultados de ejercicios anteriores'],
  ['41', 'Operacionales'],
  ['42', 'No operacionales'],
  ['51', 'Operacionales de administración'],
  ['52', 'Operacionales de ventas'],
  ['53', 'No operacionales'],
  ['54', 'Impuesto de renta y complementarios'],
  ['59', 'Ganancias y pérdidas'],
  ['61', 'Costo de ventas y de prestación de servicios'],
  ['62', 'Compras'],
  ['71', 'Materia prima'],
  ['72', 'Mano de obra directa'],
  ['73', 'Costos indirectos'],
  ['74', 'Contratos de servicios'],
  ['81', 'Derechos contingentes'],
  ['82', 'Deudoras fiscales'],
  ['83', 'Deudoras de control'],
  ['84', 'Derechos contingentes por contra (cr)'],
  ['86', 'Deudoras fiscales por contra (cr)'],
  ['88', 'Deudoras de control por contra (cr)'],
  ['91', 'Responsabilidades contingentes'],
  ['92', 'Acreedoras fiscales'],
  ['93', 'Acreedoras de control'],
  ['94', 'Responsabilidades contingentes por contra (db)'],
  ['96', 'Acreedoras fiscales por contra (db)'],
  ['98', 'Acreedoras de control por contra (db)'],
];

const CUENTAS: readonly Fila[] = [
  ['1105', 'Caja'],
  ['1110', 'Bancos'],
  ['1115', 'Remesas en tránsito'],
  ['1120', 'Cuentas de ahorro'],
  ['1125', 'Fondos'],
  ['1205', 'Acciones'],
  ['1210', 'Cuotas o partes de interés social'],
  ['1245', 'Derechos fiduciarios'],
  ['1305', 'Clientes'],
  ['1310', 'Cuentas corrientes comerciales'],
  ['1325', 'Cuentas por cobrar a socios y accionistas'],
  ['1330', 'Anticipos y avances'],
  ['1355', 'Anticipo de impuestos y contribuciones o saldos a favor'],
  ['135517', 'Impuesto a las ventas retenido'],
  ['135518', 'Impuesto de industria y comercio retenido'],
  ['1365', 'Cuentas por cobrar a trabajadores'],
  ['1380', 'Deudores varios'],
  ['1390', 'Deudas de difícil cobro'],
  ['1399', 'Provisiones'],
  ['1405', 'Materias primas'],
  ['1410', 'Productos en proceso'],
  ['1415', 'Obras de construcción en curso'],
  ['1430', 'Productos terminados'],
  ['1435', 'Mercancías no fabricadas por la empresa'],
  ['1440', 'Bienes raíces para la venta'],
  ['1455', 'Materiales, repuestos y accesorios'],
  ['1465', 'Inventarios en tránsito'],
  ['1504', 'Terrenos'],
  ['1508', 'Construcciones en curso'],
  ['1516', 'Construcciones y edificaciones'],
  ['1520', 'Maquinaria y equipo'],
  ['1524', 'Equipo de oficina'],
  ['1528', 'Equipo de computación y comunicación'],
  ['1540', 'Flota y equipo de transporte'],
  ['1592', 'Depreciación acumulada'],
  ['1599', 'Provisiones'],
  ['1605', 'Crédito mercantil'],
  ['1610', 'Marcas'],
  ['1625', 'Derechos'],
  ['1698', 'Amortización acumulada'],
  ['1705', 'Gastos pagados por anticipado'],
  ['1710', 'Cargos diferidos'],
  ['1805', 'Bienes de arte y cultura'],
  ['1905', 'De inversiones'],
  ['1910', 'De propiedades, planta y equipo'],
  ['2105', 'Bancos nacionales'],
  ['2110', 'Bancos del exterior'],
  ['2195', 'Otras obligaciones'],
  ['2205', 'Proveedores nacionales'],
  ['2210', 'Proveedores del exterior'],
  ['2215', 'Cuentas corrientes comerciales'],
  ['2305', 'Cuentas corrientes comerciales'],
  ['2335', 'Costos y gastos por pagar'],
  ['2365', 'Retención en la fuente'],
  ['2367', 'Impuesto a las ventas retenido'],
  ['2368', 'Impuesto de industria y comercio retenido'],
  ['2370', 'Retenciones y aportes de nómina'],
  ['2380', 'Acreedores varios'],
  ['2404', 'De renta y complementarios'],
  ['2408', 'Impuesto sobre las ventas por pagar'],
  ['2412', 'De industria y comercio'],
  ['2495', 'Otros'],
  ['2505', 'Salarios por pagar'],
  ['2510', 'Cesantías consolidadas'],
  ['2515', 'Intereses sobre cesantías'],
  ['2520', 'Prima de servicios'],
  ['2525', 'Vacaciones consolidadas'],
  ['2540', 'Indemnizaciones laborales'],
  ['2605', 'Para costos y gastos'],
  ['2610', 'Para obligaciones laborales'],
  ['2615', 'Para obligaciones fiscales'],
  ['2705', 'Ingresos recibidos por anticipado'],
  ['2710', 'Abonos diferidos'],
  ['2725', 'Impuestos diferidos'],
  ['2805', 'Anticipos y avances recibidos'],
  ['2810', 'Depósitos recibidos'],
  ['2815', 'Ingresos recibidos para terceros'],
  ['2905', 'Bonos en circulación'],
  ['3105', 'Capital suscrito y pagado'],
  ['3115', 'Aportes sociales'],
  ['3205', 'Prima en colocación de acciones, cuotas o partes de interés social'],
  ['3210', 'Donaciones'],
  ['3215', 'Crédito mercantil'],
  ['3305', 'Reservas obligatorias'],
  ['3310', 'Reservas estatutarias'],
  ['3315', 'Reservas ocasionales'],
  ['3605', 'Utilidad del ejercicio'],
  ['3610', 'Pérdida del ejercicio'],
  ['3705', 'Utilidades o excedentes acumulados'],
  ['3710', 'Pérdidas acumuladas'],
  ['4105', 'Agricultura, ganadería, caza y silvicultura'],
  ['4110', 'Pesca'],
  ['4115', 'Explotación de minas y canteras'],
  ['4135', 'Comercio al por mayor y al por menor'],
  ['4140', 'Hoteles y restaurantes'],
  ['414005', 'Hotelería'],
  ['414015', 'Restaurantes'],
  ['414095', 'Otros'],
  ['4145', 'Transporte, almacenamiento y comunicaciones'],
  ['4155', 'Actividades inmobiliarias y de alquiler'],
  ['4165', 'Servicios sociales y de salud'],
  ['4175', 'Devoluciones en ventas'],
  ['4205', 'Otras ventas'],
  ['4210', 'Financieros'],
  ['4215', 'Dividendos y participaciones'],
  ['4220', 'Arrendamientos'],
  ['4235', 'Servicios'],
  ['4250', 'Recuperaciones'],
  ['4255', 'Indemnizaciones'],
  ['4295', 'Diversos'],
  ['5105', 'Gastos de personal'],
  ['5110', 'Honorarios'],
  ['5115', 'Impuestos'],
  ['511595', 'Otros'],
  ['5120', 'Arrendamientos'],
  ['5135', 'Servicios'],
  ['513525', 'Acueducto y alcantarillado'],
  ['513530', 'Energía eléctrica'],
  ['513535', 'Teléfono'],
  ['5145', 'Mantenimiento y reparaciones'],
  ['5150', 'Adecuación e instalación'],
  ['5155', 'Gastos de viaje'],
  ['5160', 'Depreciación'],
  ['5165', 'Amortización'],
  ['5195', 'Diversos'],
  ['519525', 'Elementos de aseo y cafetería'],
  ['519530', 'Útiles, papelería y fotocopias'],
  ['519545', 'Taxis y buses'],
  ['519595', 'Faltantes'],
  ['5205', 'Gastos de personal'],
  ['5235', 'Servicios'],
  ['523550', 'Transportes, fletes y acarreos'],
  ['5295', 'Diversos'],
  ['529505', 'Comisiones'],
  ['5305', 'Financieros'],
  ['530595', 'Otros'],
  ['5395', 'Gastos diversos'],
  ['5405', 'Impuesto de renta y complementarios'],
  ['5905', 'Ganancias y pérdidas'],
  ['6105', 'Agricultura, ganadería, caza y silvicultura'],
  ['6135', 'Comercio al por mayor y al por menor'],
  ['6140', 'Hoteles y restaurantes'],
  ['6155', 'Actividades inmobiliarias y de alquiler'],
  ['6205', 'De mercancías'],
  ['6210', 'De materias primas'],
  ['6225', 'Devoluciones en compras'],
  ['7105', 'Materias primas'],
  ['7205', 'Mano de obra directa'],
  ['7305', 'Costos indirectos'],
  ['7405', 'Contratos de servicios'],
  ['8105', 'Bienes y valores entregados en custodia'],
  ['8110', 'Bienes y valores entregados en garantía'],
  ['8115', 'Bienes y valores en poder de terceros'],
  ['8205', 'Cuentas deudoras fiscales'],
  ['8305', 'Cuentas deudoras de control'],
  ['8405', 'Derechos contingentes por contra'],
  ['8605', 'Deudoras fiscales por contra'],
  ['8805', 'Deudoras de control por contra'],
  ['9105', 'Bienes y valores recibidos en custodia'],
  ['9110', 'Bienes y valores recibidos en garantía'],
  ['9115', 'Bienes y valores recibidos de terceros'],
  ['9205', 'Cuentas acreedoras fiscales'],
  ['9305', 'Cuentas acreedoras de control'],
  ['9405', 'Responsabilidades contingentes por contra'],
  ['9605', 'Acreedoras fiscales por contra'],
  ['9805', 'Acreedoras de control por contra'],
];

function armar(filas: readonly Fila[]): CuentaPlantilla[] {
  const codigos = new Set(filas.map(([codigo]) => codigo));
  const conHijos = new Set<string>();
  for (const [codigo] of filas) {
    const padre = prefijoPadre(codigo);
    if (padre && codigos.has(padre)) conHijos.add(padre);
  }

  return filas.map(([codigo, nombre]) => {
    const clase = claseDe(codigo);
    if (clase == null) throw new Error(`Código sin clase: ${codigo}`);
    const esMovimiento = !conHijos.has(codigo);
    return {
      codigo,
      nombre,
      tipo: tipoDeClase(clase),
      padre: prefijoPadre(codigo),
      descripcion: DESCRIPCION[codigo] ?? null,
      naturaleza: NATURALEZA_EXPLICITA[codigo] ?? CONTRA_ORDEN[codigo.slice(0, 2)] ?? naturalezaPorClase(clase),
      esMovimiento,
      nivel: nivelDe(codigo),
      requiereTercero: TERCERO.has(codigo),
      requiereCentroCosto: esMovimiento && (clase === 5 || clase === 6 || clase === 7),
    };
  });
}

export const PLANTILLA_PUC: readonly CuentaPlantilla[] = armar([...CLASES, ...GRUPOS, ...CUENTAS]);

export function cuentaPlantilla(codigo: string): CuentaPlantilla | undefined {
  return PLANTILLA_PUC.find((c) => c.codigo === codigo);
}
