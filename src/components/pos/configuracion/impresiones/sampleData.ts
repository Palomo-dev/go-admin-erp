import type { KitchenTicketPrintPayload, SaleTicketPrintPayload } from '@printing';

/**
 * Datos de ejemplo para la previsualizacion de impresiones.
 *
 * Estan pensados para provocar los casos que suelen romper la maquetacion:
 *   - Nombres de producto muy largos, que deben partirse sin descuadrar la
 *     columna de importes.
 *   - Varios modificadores en una linea.
 *   - Desglose de impuestos con mas de una linea (IVA + ICA).
 *   - Importes de 6 cifras, los mas anchos en pesos colombianos.
 *
 * Si un cambio de plantilla se ve bien con estos datos, se vera bien con
 * datos reales.
 */

const BUSINESS = {
  businessName: 'Restaurante La Buena Mesa',
  businessNit: '901479683-5',
  businessPhone: '3113195711',
  businessAddress: 'Calle 123 #45-67',
  businessCity: 'Bogota D.C.',
  businessEmail: 'hola@labuenamesa.co',
  branchName: 'Sede Chapinero',
  branchAddress: 'Carrera 7 #60-20',
  branchPhone: '3009998877',
};

const ITEMS = [
  {
    productName: 'Hamburguesa Doble con Queso Cheddar y Tocineta Crocante',
    quantity: 2,
    unitPrice: 38500,
    total: 77000,
    taxAmount: 12300,
    modifiers: [
      { name: 'Sin cebolla', extraPrice: 0 },
      { name: 'Queso extra', extraPrice: 3500 },
    ],
    variantData: { Termino: 'Tres cuartos' },
  },
  {
    productName: 'Limonada de coco',
    quantity: 3,
    unitPrice: 12000,
    total: 36000,
    taxAmount: 5760,
  },
  {
    productName: 'Postre del dia',
    quantity: 1,
    unitPrice: 15000,
    total: 15000,
    discountAmount: 2000,
  },
];

const SUBTOTAL = 128000;
const TAX_LINES = [
  { name: 'IVA 19%', amount: 20520 },
  { name: 'INC 8%', amount: 3400 },
];
const TOTAL = 149920;

export function buildSampleSaleTicket(): SaleTicketPrintPayload {
  return {
    ...BUSINESS,
    saleId: 'a1b2c3d4',
    saleNumber: 'FV-00123',
    customerName: 'Maria Fernanda Rodriguez Gomez',
    customerDocType: 'CC',
    customerDocNumber: '1020304050',
    customerPhone: '3201234567',
    cashierName: 'Carlos Perez',
    createdAt: new Date().toISOString(),
    items: ITEMS,
    subtotal: SUBTOTAL,
    taxLines: TAX_LINES,
    taxIncluded: true,
    discountTotal: 2000,
    tipAmount: 15000,
    total: TOTAL,
    payments: [
      { method: 'cash', methodName: 'Efectivo', amount: 100000 },
      { method: 'card', methodName: 'Tarjeta', amount: 49920 },
    ],
  };
}

export function buildSamplePreCuenta(): SaleTicketPrintPayload {
  return {
    ...BUSINESS,
    saleId: 'pre-mesa-7',
    title: 'PRE-CUENTA',
    tableName: 'Mesa 7',
    serverName: 'Ana Lucia',
    createdAt: new Date().toISOString(),
    items: ITEMS,
    subtotal: SUBTOTAL,
    taxLines: TAX_LINES,
    taxIncluded: true,
    discountTotal: 2000,
    total: TOTAL - 15000,
  };
}

export function buildSampleKitchenTicket(): KitchenTicketPrintPayload {
  return {
    ticketId: 1042,
    station: 'hot_kitchen',
    tableName: 'Mesa 7',
    serverName: 'Ana Lucia',
    createdAt: new Date().toISOString(),
    businessName: BUSINESS.businessName,
    branchName: BUSINESS.branchName,
    items: [
      {
        productName: 'Hamburguesa Doble con Queso Cheddar y Tocineta Crocante',
        quantity: 2,
        notes: 'Una sin salsas, alergia al mani',
        variantData: { Termino: 'Tres cuartos' },
        modifiers: [
          { name: 'Sin cebolla', extraPrice: 0 },
          { name: 'Queso extra', extraPrice: 3500 },
        ],
      },
      { productName: 'Papas a la francesa', quantity: 2, notes: 'Bien doradas' },
    ],
  };
}
