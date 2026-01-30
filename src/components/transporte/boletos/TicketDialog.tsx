'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Ticket, Search, MapPin, Bus } from 'lucide-react';
import { ticketsService, type TicketWithDetails, type TripSeat, type RouteStop, type TripDetails } from '@/lib/services/ticketsService';
import { cn } from '@/lib/utils';

interface Trip {
  id: string;
  trip_code: string;
  trip_date: string;
  scheduled_departure?: string;
  transport_routes?: { name: string };
  available_seats?: number;
}

interface Stop {
  id: string;
  name: string;
  city?: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  document_number?: string;
}

interface TicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket?: TicketWithDetails | null;
  trips: Trip[];
  stops: Stop[];
  onSave: (data: Partial<TicketWithDetails>) => Promise<void>;
  onSearchCustomer?: (query: string) => Promise<Customer[]>;
}

const DOC_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'PP', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
];

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'partial', label: 'Parcial' },
];

export function TicketDialog({
  open,
  onOpenChange,
  ticket,
  trips,
  stops,
  onSave,
  onSearchCustomer,
}: TicketDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  
  // Estados para asientos y rutas
  const [tripDetails, setTripDetails] = useState<TripDetails | null>(null);
  const [tripSeats, setTripSeats] = useState<TripSeat[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [loadingTripInfo, setLoadingTripInfo] = useState(false);

  const [formData, setFormData] = useState({
    trip_id: '',
    passenger_name: '',
    passenger_doc_type: 'CC',
    passenger_doc_number: '',
    passenger_phone: '',
    passenger_email: '',
    boarding_stop_id: '',
    alighting_stop_id: '',
    seat_number: '',
    fare: 0,
    discount: 0,
    total: 0,
    payment_status: 'pending',
    notes: '',
    customer_id: '',
  });

  useEffect(() => {
    if (open) {
      if (ticket) {
        setFormData({
          trip_id: ticket.trip_id || '',
          passenger_name: ticket.passenger_name || '',
          passenger_doc_type: ticket.passenger_doc?.split('-')[0] || 'CC',
          passenger_doc_number: ticket.passenger_doc?.split('-')[1] || ticket.passenger_doc || '',
          passenger_phone: ticket.passenger_phone || '',
          passenger_email: ticket.passenger_email || '',
          boarding_stop_id: ticket.boarding_stop_id || '',
          alighting_stop_id: ticket.alighting_stop_id || '',
          seat_number: ticket.seat_number || '',
          fare: ticket.fare || 0,
          discount: ticket.discount || 0,
          total: ticket.total || 0,
          payment_status: ticket.payment_status || 'pending',
          notes: ticket.notes || '',
          customer_id: ticket.customer_id || '',
        });
      } else {
        setFormData({
          trip_id: '',
          passenger_name: '',
          passenger_doc_type: 'CC',
          passenger_doc_number: '',
          passenger_phone: '',
          passenger_email: '',
          boarding_stop_id: '',
          alighting_stop_id: '',
          seat_number: '',
          fare: 0,
          discount: 0,
          total: 0,
          payment_status: 'pending',
          notes: '',
          customer_id: '',
        });
      }
      setCustomerResults([]);
      setCustomerSearch('');
    }
  }, [open, ticket]);

  useEffect(() => {
    const total = Math.max(0, formData.fare - formData.discount);
    setFormData((prev) => ({ ...prev, total }));
  }, [formData.fare, formData.discount]);

  // Cargar detalles del viaje cuando se seleccione
  const loadTripInfo = useCallback(async (tripId: string) => {
    if (!tripId) {
      setTripDetails(null);
      setTripSeats([]);
      setRouteStops([]);
      return;
    }

    setLoadingTripInfo(true);
    try {
      // Cargar detalles del viaje
      const details = await ticketsService.getTripDetails(tripId);
      setTripDetails(details);

      if (details) {
        // Cargar paradas de la ruta
        if (details.route_id) {
          const stops = await ticketsService.getRouteStops(details.route_id);
          setRouteStops(stops);
          
          // Auto-seleccionar origen y destino de la ruta
          const originStop = stops.find(s => s.is_boarding_allowed && s.stop_order === 1);
          const destStop = stops.find(s => s.is_alighting_allowed && s.stop_order === stops.length);
          
          setFormData(prev => ({
            ...prev,
            boarding_stop_id: prev.boarding_stop_id || (originStop?.transport_stops?.id ?? ''),
            alighting_stop_id: prev.alighting_stop_id || (destStop?.transport_stops?.id ?? ''),
            fare: prev.fare || details.base_fare || 0,
          }));
        }

        // Cargar asientos del viaje
        let seats = await ticketsService.getTripSeats(tripId);
        
        // Si no hay asientos, intentar inicializarlos
        if (seats.length === 0 && details.vehicle_id) {
          await ticketsService.initializeTripSeats(tripId);
          seats = await ticketsService.getTripSeats(tripId);
        }
        
        setTripSeats(seats);
      }
    } catch (error) {
      console.error('Error loading trip info:', error);
    } finally {
      setLoadingTripInfo(false);
    }
  }, []);

  // Cargar info del viaje cuando cambie
  useEffect(() => {
    if (formData.trip_id) {
      loadTripInfo(formData.trip_id);
    }
  }, [formData.trip_id, loadTripInfo]);

  const handleSearchCustomer = async () => {
    if (!onSearchCustomer || !customerSearch.trim()) return;
    
    setSearchingCustomer(true);
    try {
      const results = await onSearchCustomer(customerSearch);
      setCustomerResults(results);
    } catch (error) {
      console.error('Error searching customers:', error);
    } finally {
      setSearchingCustomer(false);
    }
  };

  const selectCustomer = (customer: Customer) => {
    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      passenger_name: customer.name,
      passenger_email: customer.email || '',
      passenger_phone: customer.phone || '',
      passenger_doc_number: customer.document_number || '',
    }));
    setCustomerResults([]);
    setCustomerSearch('');
  };

  const handleSubmit = async () => {
    if (!formData.trip_id || !formData.passenger_name) return;

    setIsSubmitting(true);
    try {
      await onSave({
        trip_id: formData.trip_id,
        passenger_name: formData.passenger_name,
        passenger_doc: formData.passenger_doc_number 
          ? `${formData.passenger_doc_type}-${formData.passenger_doc_number}` 
          : undefined,
        passenger_phone: formData.passenger_phone || undefined,
        passenger_email: formData.passenger_email || undefined,
        boarding_stop_id: formData.boarding_stop_id || undefined,
        alighting_stop_id: formData.alighting_stop_id || undefined,
        seat_number: formData.seat_number || undefined,
        fare: formData.fare,
        discount: formData.discount,
        total: formData.total,
        payment_status: formData.payment_status as TicketWithDetails['payment_status'],
        notes: formData.notes || undefined,
        customer_id: formData.customer_id || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving ticket:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTrip = trips.find((t) => t.id === formData.trip_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-600" />
            {ticket ? 'Editar Boleto' : 'Nuevo Boleto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Viaje */}
          <div className="space-y-2">
            <Label htmlFor="trip">Viaje *</Label>
            <Select
              value={formData.trip_id || '__none__'}
              onValueChange={(v) => setFormData((p) => ({ ...p, trip_id: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar viaje" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleccionar...</SelectItem>
                {trips.map((trip) => (
                  <SelectItem key={trip.id} value={trip.id}>
                    {trip.trip_code} - {trip.transport_routes?.name || 'Sin ruta'} ({trip.trip_date})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTrip && (
              <div className="text-xs text-gray-500 space-y-1 mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p>
                  <strong>Asientos:</strong> {tripDetails?.available_seats ?? selectedTrip.available_seats ?? 'N/A'} disponibles
                  {tripDetails?.total_seats && ` de ${tripDetails.total_seats}`}
                </p>
                {tripDetails?.transport_routes && (
                  <p>
                    <strong>Ruta:</strong> {tripDetails.transport_routes.origin_stop?.name || 'Origen'} 
                    {' → '} 
                    {tripDetails.transport_routes.destination_stop?.name || 'Destino'}
                  </p>
                )}
                {tripDetails?.base_fare && (
                  <p>
                    <strong>Tarifa base:</strong> ${tripDetails.base_fare.toLocaleString('es-CO')} {tripDetails.currency || 'COP'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Búsqueda de cliente */}
          {onSearchCustomer && (
            <div className="space-y-2">
              <Label>Buscar Cliente Existente</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre, email o documento..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchCustomer()}
                />
                <Button type="button" variant="outline" onClick={handleSearchCustomer} disabled={searchingCustomer}>
                  {searchingCustomer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {customerResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-32 overflow-y-auto">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                    >
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.email} · {c.document_number}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Datos del Pasajero */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Datos del Pasajero</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="passenger_name">Nombre Completo *</Label>
                <Input
                  id="passenger_name"
                  value={formData.passenger_name}
                  onChange={(e) => setFormData((p) => ({ ...p, passenger_name: e.target.value }))}
                  placeholder="Nombre del pasajero"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc_type">Tipo Documento</Label>
                <Select
                  value={formData.passenger_doc_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, passenger_doc_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((doc) => (
                      <SelectItem key={doc.value} value={doc.value}>
                        {doc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc_number">Número Documento</Label>
                <Input
                  id="doc_number"
                  value={formData.passenger_doc_number}
                  onChange={(e) => setFormData((p) => ({ ...p, passenger_doc_number: e.target.value }))}
                  placeholder="1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={formData.passenger_phone}
                  onChange={(e) => setFormData((p) => ({ ...p, passenger_phone: e.target.value }))}
                  placeholder="3001234567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.passenger_email}
                  onChange={(e) => setFormData((p) => ({ ...p, passenger_email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                />
              </div>
            </div>
          </div>

          {/* Tramo y Asiento */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Tramo y Asiento
            </h4>
            
            {loadingTripInfo ? (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cargando información del viaje...
              </div>
            ) : (
              <>
                {/* Paradas (origen/destino) */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="boarding">Origen</Label>
                    <Select
                      value={formData.boarding_stop_id || '__none__'}
                      onValueChange={(v) => setFormData((p) => ({ ...p, boarding_stop_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Parada origen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Seleccionar...</SelectItem>
                        {routeStops.length > 0 ? (
                          routeStops
                            .filter(rs => rs.is_boarding_allowed)
                            .map((rs) => (
                              <SelectItem key={rs.transport_stops?.id || rs.id} value={rs.transport_stops?.id || ''}>
                                {rs.transport_stops?.name} {rs.transport_stops?.city && `(${rs.transport_stops.city})`}
                              </SelectItem>
                            ))
                        ) : (
                          stops.map((stop) => (
                            <SelectItem key={stop.id} value={stop.id}>
                              {stop.name} {stop.city && `(${stop.city})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alighting">Destino</Label>
                    <Select
                      value={formData.alighting_stop_id || '__none__'}
                      onValueChange={(v) => setFormData((p) => ({ ...p, alighting_stop_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Parada destino" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Seleccionar...</SelectItem>
                        {routeStops.length > 0 ? (
                          routeStops
                            .filter(rs => rs.is_alighting_allowed)
                            .map((rs) => (
                              <SelectItem key={rs.transport_stops?.id || rs.id} value={rs.transport_stops?.id || ''}>
                                {rs.transport_stops?.name} {rs.transport_stops?.city && `(${rs.transport_stops.city})`}
                              </SelectItem>
                            ))
                        ) : (
                          stops.map((stop) => (
                            <SelectItem key={stop.id} value={stop.id}>
                              {stop.name} {stop.city && `(${stop.city})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Selector de Asientos */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Bus className="h-4 w-4" />
                    Asiento
                    {tripDetails?.vehicles && (
                      <span className="text-xs text-gray-500 font-normal">
                        ({tripDetails.vehicles.vehicle_type} - {tripDetails.vehicles.plate})
                      </span>
                    )}
                  </Label>
                  
                  {tripSeats.length > 0 ? (
                    <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                      <div className="flex flex-wrap gap-2 justify-center">
                        {tripSeats.map((seat) => {
                          const isAvailable = seat.status === 'available';
                          const isSelected = formData.seat_number === seat.seat_label;
                          
                          return (
                            <button
                              key={seat.id}
                              type="button"
                              disabled={!isAvailable && !isSelected}
                              onClick={() => {
                                if (isSelected) {
                                  setFormData(p => ({ ...p, seat_number: '' }));
                                } else if (isAvailable) {
                                  setFormData(p => ({ ...p, seat_number: seat.seat_label }));
                                }
                              }}
                              className={cn(
                                "w-10 h-10 rounded-lg font-medium text-sm transition-all",
                                "border-2 flex items-center justify-center",
                                isSelected && "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300",
                                isAvailable && !isSelected && "bg-green-100 text-green-800 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
                                !isAvailable && !isSelected && "bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                              )}
                              title={isAvailable ? `Asiento ${seat.seat_label} - Disponible` : `Asiento ${seat.seat_label} - ${seat.status}`}
                            >
                              {seat.seat_label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-green-100 border border-green-300 dark:bg-green-900/30 dark:border-green-700"></span>
                          Disponible
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-blue-600 border border-blue-700"></span>
                          Seleccionado
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-gray-200 border border-gray-300 dark:bg-gray-700"></span>
                          Ocupado
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Input
                      id="seat"
                      value={formData.seat_number}
                      onChange={(e) => setFormData((p) => ({ ...p, seat_number: e.target.value.toUpperCase() }))}
                      placeholder="Ej: 1A"
                      className="max-w-[100px]"
                    />
                  )}
                  
                  {formData.seat_number && (
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Asiento seleccionado: <strong>{formData.seat_number}</strong>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Precios */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Precio y Pago</h4>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fare">Tarifa</Label>
                <Input
                  id="fare"
                  type="number"
                  value={formData.fare}
                  onChange={(e) => setFormData((p) => ({ ...p, fare: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount">Descuento</Label>
                <Input
                  id="discount"
                  type="number"
                  value={formData.discount}
                  onChange={(e) => setFormData((p) => ({ ...p, discount: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Total</Label>
                <Input
                  id="total"
                  type="number"
                  value={formData.total}
                  readOnly
                  className="bg-gray-50 dark:bg-gray-800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment">Estado Pago</Label>
                <Select
                  value={formData.payment_status}
                  onValueChange={(v) => setFormData((p) => ({ ...p, payment_status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.trip_id || !formData.passenger_name}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {ticket ? 'Guardar Cambios' : 'Crear Boleto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
