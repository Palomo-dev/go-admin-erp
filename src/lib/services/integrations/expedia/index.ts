// Los servicios con acceso a datos se construyen con clientes inyectados
// (`ChannelManagerClients`): nunca importan el cliente browser.
import type { ChannelManagerClients } from '../channelManagerClients';
import { createExpediaAuthService } from './expediaAuthService';
import { createExpediaConnectionService } from './expediaConnectionService';
import { createExpediaReservationService } from './expediaReservationService';
import { createExpediaAvailabilityService } from './expediaAvailabilityService';
import { createExpediaProductService } from './expediaProductService';

export {
  createExpediaAuthService,
  createExpediaConnectionService,
  createExpediaReservationService,
  createExpediaAvailabilityService,
  createExpediaProductService,
};
export type { ChannelManagerClients } from '../channelManagerClients';
export { expediaXmlParser } from './expediaXmlParser';
export * from './expediaTypes';
export * from './expediaConfig';

/** Todos los servicios de Expedia Group sobre los mismos clientes. */
export function createExpediaServices(clients: ChannelManagerClients) {
  return {
    auth: createExpediaAuthService(clients),
    connections: createExpediaConnectionService(clients),
    reservations: createExpediaReservationService(clients),
    availability: createExpediaAvailabilityService(clients),
    products: createExpediaProductService(clients),
  };
}
