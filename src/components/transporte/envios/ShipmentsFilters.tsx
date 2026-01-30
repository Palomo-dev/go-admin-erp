'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface Trip {
  id: string;
  trip_code: string;
  transport_routes?: { name: string };
}

interface ShipmentsFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  paymentFilter: string;
  onPaymentChange: (value: string) => void;
  tripFilter: string;
  onTripChange: (value: string) => void;
  trips: Trip[];
  onClearFilters: () => void;
  hasFilters: boolean;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'received', label: 'Recibido' },
  { value: 'in_transit', label: 'En Tránsito' },
  { value: 'arrived', label: 'Llegó' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'returned', label: 'Devuelto' },
  { value: 'cancelled', label: 'Cancelado' },
];

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'Todos los pagos' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'cod', label: 'Contra entrega' },
  { value: 'cancelled', label: 'Cancelado' },
];

export function ShipmentsFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  paymentFilter,
  onPaymentChange,
  tripFilter,
  onTripChange,
  trips,
  onClearFilters,
  hasFilters,
}: ShipmentsFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por tracking, remitente, destinatario..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={paymentFilter} onValueChange={onPaymentChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Pago" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={tripFilter} onValueChange={onTripChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Viaje" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los viajes</SelectItem>
          {trips.map((trip) => (
            <SelectItem key={trip.id} value={trip.id}>
              {trip.trip_code} - {trip.transport_routes?.name || 'Sin ruta'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          <X className="h-4 w-4 mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
