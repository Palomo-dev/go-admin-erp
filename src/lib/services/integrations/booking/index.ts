// Los servicios con acceso a datos se construyen con clientes inyectados
// (`ChannelManagerClients`): nunca importan el cliente browser.
import type { ChannelManagerClients } from '../channelManagerClients';
import { createBookingAuthService } from './bookingAuthService';
import { createBookingReservationService } from './bookingReservationService';
import { createBookingAvailabilityService } from './bookingAvailabilityService';
import { createBookingConnectionService } from './bookingConnectionService';
import { createBookingContentService } from './bookingContentService';

export {
  createBookingAuthService,
  createBookingReservationService,
  createBookingAvailabilityService,
  createBookingConnectionService,
  createBookingContentService,
};
export type { ChannelManagerClients } from '../channelManagerClients';
export { bookingXmlParser } from './bookingXmlParser';
export * from './bookingTypes';
export * from './bookingConfig';

/** Todos los servicios de Booking.com sobre los mismos clientes. */
export function createBookingServices(clients: ChannelManagerClients) {
  return {
    auth: createBookingAuthService(clients),
    reservations: createBookingReservationService(clients),
    availability: createBookingAvailabilityService(clients),
    connections: createBookingConnectionService(clients),
    content: createBookingContentService(clients),
  };
}
