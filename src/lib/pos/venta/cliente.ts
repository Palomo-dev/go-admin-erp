/**
 * Cliente del carrito (`src/components/pos/CustomerSelector.tsx`), L34 del
 * plan. Extracción literal del cliente que se arma al elegir una habitación
 * ocupada: es el HUÉSPED de la reserva. La página solo asigna su id al carrito
 * (`asignarClienteAlCarrito`) e ignora la habitación: la venta no se carga a
 * la habitación. Se fija tal cual; el rediseño no lo cambia.
 */
import type { Customer } from '@/components/pos/types';
import type { OccupiedSpace } from '@/components/pos/CustomerSelector';

export function clienteDesdeHabitacion(room: OccupiedSpace, ahora: string = new Date().toISOString()): Customer {
  return {
    id: room.customer_id,
    organization_id: 0,
    full_name: room.customer_name,
    email: room.customer_email || '',
    phone: room.customer_phone || '',
    doc_type: 'CC',
    doc_number: '',
    address: '',
    country: 'Colombia',
    roles: [],
    tags: [],
    preferences: {},
    created_at: ahora,
    updated_at: ahora,
  };
}
