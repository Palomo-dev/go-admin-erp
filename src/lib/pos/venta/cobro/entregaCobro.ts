/**
 * Entrega del cobro del POS (POS-PLAN §2.6, L46), movida LITERALMENTE de
 * `CheckoutDialog.tsx`. Sin React ni red: el diálogo sigue cargando tarifas y
 * conductores; aquí solo las decisiones.
 *
 * - Tres tipos: recoger (`pickup`), envío propio (`delivery_own`, con
 *   conductor) y tercero (`delivery_third_party`, sin conductor).
 * - Tarifas: solo las activas marcadas `show_on_pos`, con el costo que da
 *   `shippingRatesService.simulateShipping` (ordenado de menor a mayor: la
 *   primera es la más económica y queda elegida).
 * - El flete sigue a la tarifa elegida; sin tarifa, 0. El estado «Pendiente»
 *   del pago del envío NO quita el flete del total (E-15): solo viaja al envío.
 */

export type TipoEntrega = 'pickup' | 'delivery_own' | 'delivery_third_party';

/** Opción de tarifa del selector «Tarifa de envío». */
export interface TarifaEnvioPos {
  id: string;
  rate_name: string;
  total_cost: number;
  currency: string;
}

/** Tarifa tal como la devuelve `shippingRatesService.getShippingRates`. */
export interface TarifaConfigurada {
  id: string;
  show_on_pos: boolean;
}

/** Tarifa simulada tal como la devuelve `shippingRatesService.simulateShipping`. */
export interface TarifaSimulada {
  rate: { id: string; rate_name: string; currency: string };
  total_cost: number;
}

/** Las tarifas que el POS puede ofrecer (marcadas `show_on_pos`). */
export function tarifasVisiblesEnPos<T extends TarifaConfigurada>(rates: T[]): T[] {
  return rates.filter(r => r.show_on_pos);
}

/** Opciones del selector: las simuladas que son del POS, en el orden de la simulación. */
export function opcionesDeTarifa(simulated: TarifaSimulada[], posRates: TarifaConfigurada[]): TarifaEnvioPos[] {
  return simulated
    .filter(s => posRates.some(pr => pr.id === s.rate.id))
    .map(s => ({
      id: s.rate.id,
      rate_name: s.rate.rate_name,
      total_cost: s.total_cost,
      currency: s.rate.currency,
    }));
}

/** La tarifa que queda elegida al cargar: la primera (la más económica). */
export function tarifaPorDefecto(rateOptions: TarifaEnvioPos[]): TarifaEnvioPos | null {
  return rateOptions.length > 0 ? rateOptions[0] : null;
}

/**
 * Flete al cambiar la tarifa elegida o la lista: el costo de la elegida (0 si
 * no está); 0 sin tarifa elegida; `null` (no cambia) si hay una elegida pero
 * la lista está vacía.
 */
export function fleteDeTarifaElegida(selectedRateId: string, shippingRates: TarifaEnvioPos[]): number | null {
  if (selectedRateId && shippingRates.length > 0) {
    const rate = shippingRates.find(r => r.id === selectedRateId);
    return rate?.total_cost || 0;
  } else if (!selectedRateId) {
    return 0;
  }
  return null;
}

export interface EntradaEntregaDelSobre {
  deliveryType: TipoEntrega;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  deliveryInstructions: string;
  selectedDriverId: string;
  shippingFee: number;
}

export interface CamposEntregaDelSobre {
  delivery_type: TipoEntrega;
  delivery_info: {
    address: string;
    city: string;
    contact_name: string;
    contact_phone: string;
    instructions: string;
  } | undefined;
  driver_id: string | undefined;
  shipping_fee: number | undefined;
}

/** Los campos de entrega del sobre del cobro (`CheckoutData`), en su orden. */
export function camposEntregaDelSobre({
  deliveryType,
  deliveryAddress,
  deliveryCity,
  deliveryContactName,
  deliveryContactPhone,
  deliveryInstructions,
  selectedDriverId,
  shippingFee,
}: EntradaEntregaDelSobre): CamposEntregaDelSobre {
  return {
    delivery_type: deliveryType,
    delivery_info: deliveryType !== 'pickup' ? {
      address: deliveryAddress,
      city: deliveryCity,
      contact_name: deliveryContactName,
      contact_phone: deliveryContactPhone,
      instructions: deliveryInstructions,
    } : undefined,
    driver_id: deliveryType === 'delivery_own' ? (selectedDriverId || undefined) : undefined,
    shipping_fee: shippingFee > 0 ? shippingFee : undefined,
  };
}
