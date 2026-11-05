/**
 * Adaptadores sin implementar todavía. Cada método lanza NotConfiguredError con el motivo: la UI
 * lo muestra tal cual y la conexión no puede pasar a `connected`. Nunca devuelven datos simulados.
 */
import { NotConfiguredError } from '../errores';
import type { CapacidadesDropshipping, CapacidadesTransportadora, CarrierProvider, DropshipProvider } from '../tipos';

export function transportadoraPendiente(code: string, nombre: string, capabilities: CapacidadesTransportadora, motivo: string): CarrierProvider {
  const no = async (): Promise<never> => { throw new NotConfiguredError(code, motivo); };
  return {
    code,
    nombre,
    capabilities,
    validateCredentials: no,
    quote: no,
    createShipment: no,
    getLabel: no,
    track: no,
    cancel: no,
  };
}

export function dropshippingPendiente(code: string, nombre: string, capabilities: CapacidadesDropshipping, motivo: string): DropshipProvider {
  const no = async (): Promise<never> => { throw new NotConfiguredError(code, motivo); };
  return {
    code,
    nombre,
    capabilities,
    validateCredentials: no,
    listCatalog: no,
    getStock: no,
    getCities: no,
    createOrder: no,
    getOrderStatus: no,
  };
}

export const SIN_CAPACIDADES_TRANSPORTADORA: CapacidadesTransportadora = {
  quote: false, createLabel: false, labelPdf: false, track: false, webhook: false, cancel: false, cod: false, pickup: false,
};

export const SIN_CAPACIDADES_DROPSHIPPING: CapacidadesDropshipping = {
  catalog: false, stock: false, cities: false, quoteShipping: false, createOrder: false, orderStatus: false, cancelOrder: false, webhook: false, cod: false,
};
