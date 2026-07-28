export interface ShipmentStatusConfig {
  label: string;
  color: string;
  icon: 'package' | 'truck' | 'check' | 'x' | 'rotate';
}

export const SHIPMENT_STATUSES: Record<string, ShipmentStatusConfig> = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-800', icon: 'package' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: 'package' },
  assigned: { label: 'Asignado', color: 'bg-cyan-100 text-cyan-800', icon: 'package' },
  ready: { label: 'Listo', color: 'bg-blue-100 text-blue-800', icon: 'package' },
  picked: { label: 'Recogido', color: 'bg-blue-100 text-blue-800', icon: 'package' },
  dispatched: { label: 'Despachado', color: 'bg-indigo-100 text-indigo-800', icon: 'truck' },
  in_transit: { label: 'En Tránsito', color: 'bg-purple-100 text-purple-800', icon: 'truck' },
  out_for_delivery: { label: 'En Entrega', color: 'bg-orange-100 text-orange-800', icon: 'truck' },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-800', icon: 'check' },
  failed: { label: 'Fallido', color: 'bg-red-100 text-red-800', icon: 'x' },
  returned: { label: 'Devuelto', color: 'bg-orange-100 text-orange-800', icon: 'rotate' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500', icon: 'x' },
};

export const SHIPMENT_STATUS_OPTIONS = Object.entries(SHIPMENT_STATUSES).map(([value, config]) => ({
  value,
  label: config.label,
}));

export const SHIPMENT_PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'cod', label: 'Contra entrega' },
  { value: 'cancelled', label: 'Cancelado' },
];
