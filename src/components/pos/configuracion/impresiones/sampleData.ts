import type { KitchenTicketPrintPayload, SaleTicketPrintPayload } from '@printing';

/**
 * Datos de ejemplo para la previsualizacion de impresiones.
 *
 * La cabecera (logo, razon social, NIT, direccion, sucursal) se toma de la
 * organizacion real, porque es la parte que cada negocio necesita verificar
 * antes de imprimir: que el logo se lea en termico y que los datos fiscales
 * salgan bien.
 *
 * El resto (cliente, productos, domicilio, pagos) sigue siendo ficticio a
 * proposito, para provocar los casos que suelen romper la maquetacion:
 *   - Nombres de producto muy largos, que deben partirse sin descuadrar la
 *     columna de importes.
 *   - Varios modificadores en una linea.
 *   - Desglose de impuestos con mas de una linea (IVA + ICA).
 *   - Importes de 6 cifras, los mas anchos en pesos colombianos.
 *   - Bloque de entrega completo, con indicaciones largas.
 *
 * Si un cambio de plantilla se ve bien con estos datos, se vera bien con
 * datos reales.
 */

/**
 * Cabecera del ticket. Son los campos de `SaleTicketPrintPayload` que
 * describen al negocio, por lo que se pueden derramar directamente en el
 * payload.
 */
export type PreviewBusiness = Pick<
  SaleTicketPrintPayload,
  | 'businessName'
  | 'businessNit'
  | 'businessPhone'
  | 'businessAddress'
  | 'businessCity'
  | 'businessEmail'
  | 'businessFiscalResponsibilities'
  | 'businessLogoUrl'
  | 'branchName'
  | 'branchAddress'
  | 'branchPhone'
>;

/**
 * Respaldo para cuando aun no ha cargado la organizacion o el negocio no tiene
 * los datos completos. Nunca deberia verse en un negocio configurado.
 */
const FALLBACK_BUSINESS: PreviewBusiness = {
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

/**
 * Completa con el respaldo solo los campos que el negocio no tenga definidos,
 * de modo que un negocio a medio configurar siga mostrando un ticket legible.
 */
function resolveBusiness(business?: PreviewBusiness): PreviewBusiness {
  if (!business) return FALLBACK_BUSINESS;
  return {
    ...business,
    businessName: business.businessName || FALLBACK_BUSINESS.businessName,
  };
}

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

/**
 * Entrega de ejemplo. Las indicaciones son deliberadamente largas: es el campo
 * con mas riesgo de desbordar las 32 columnas de un papel de 58mm.
 */
const DELIVERY = {
  type: 'Domicilio propio',
  address: 'Carrera 15 #85-40 Apto 502 Torre B',
  city: 'Bogota D.C.',
  contactName: 'Maria Fernanda Rodriguez',
  contactPhone: '3201234567',
  driverName: 'Jose Antonio Martinez',
  instructions: 'Portal amarillo junto a la panaderia, timbre danado, llamar al llegar',
};

const DELIVERY_FEE = 8000;

const SUBTOTAL = 128000;
const TAX_LINES = [
  { name: 'IVA 19%', amount: 20520 },
  { name: 'INC 8%', amount: 3400 },
];
const TOTAL = 149920;

export function buildSampleSaleTicket(business?: PreviewBusiness): SaleTicketPrintPayload {
  return {
    ...resolveBusiness(business),
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
    deliveryFee: DELIVERY_FEE,
    total: TOTAL,
    payments: [
      { method: 'cash', methodName: 'Efectivo', amount: 110000 },
      { method: 'card', methodName: 'Tarjeta', amount: 49920 },
    ],
    totalPaid: 159920,
    changeAmount: 2000,
    deliveryInfo: DELIVERY,
  };
}

export function buildSamplePreCuenta(business?: PreviewBusiness): SaleTicketPrintPayload {
  return {
    ...resolveBusiness(business),
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
    // La pre-cuenta tambien puede llevar flete cuando el pedido es a domicilio.
    deliveryFee: DELIVERY_FEE,
    total: TOTAL - 15000,
    deliveryInfo: DELIVERY,
  };
}

export function buildSampleKitchenTicket(business?: PreviewBusiness): KitchenTicketPrintPayload {
  const resolved = resolveBusiness(business);
  return {
    ticketId: 1042,
    station: 'hot_kitchen',
    tableName: 'Mesa 7',
    serverName: 'Ana Lucia',
    createdAt: new Date().toISOString(),
    businessName: resolved.businessName,
    branchName: resolved.branchName,
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
