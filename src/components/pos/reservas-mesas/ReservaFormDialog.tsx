'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  RESERVATION_SOURCE_LABELS,
  type RestaurantReservation,
  type CreateReservationInput,
  type UpdateReservationInput,
  type ReservationSource,
} from './reservasMesasService';
import { reservasMesasService } from './reservasMesasService';

interface ReservaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation?: RestaurantReservation | null;
  onSubmit: (data: CreateReservationInput | UpdateReservationInput) => Promise<void>;
}

export function ReservaFormDialog({
  open,
  onOpenChange,
  reservation,
  onSubmit,
}: ReservaFormDialogProps) {
  const isEditing = !!reservation;

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [tableId, setTableId] = useState<string>('none');
  const [source, setSource] = useState<ReservationSource>('admin');
  const [notes, setNotes] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Mesas disponibles
  const [availableTables, setAvailableTables] = useState<
    Array<{ id: string; name: string; zone: string | null; capacity: number; state: string }>
  >([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Resetear formulario al abrir/cerrar
  useEffect(() => {
    if (open) {
      if (reservation) {
        setCustomerName(reservation.customer_name);
        setCustomerPhone(reservation.customer_phone || '');
        setCustomerEmail(reservation.customer_email || '');
        setPartySize(reservation.party_size);
        setDate(reservation.reservation_date);
        setTime(reservation.reservation_time.substring(0, 5));
        setDurationMinutes(reservation.duration_minutes);
        setTableId(reservation.restaurant_table_id || 'none');
        setSource(reservation.source);
        setNotes(reservation.notes || '');
        setSpecialRequests(reservation.special_requests || '');
      } else {
        const today = new Date().toISOString().split('T')[0];
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setPartySize(2);
        setDate(today);
        setTime('19:00');
        setDurationMinutes(90);
        setTableId('none');
        setSource('admin');
        setNotes('');
        setSpecialRequests('');
      }
    }
  }, [open, reservation]);

  // Cargar mesas disponibles cuando cambian fecha, hora o tamaño de grupo
  useEffect(() => {
    if (!open || !date || !time) return;

    const loadTables = async () => {
      setLoadingTables(true);
      try {
        const tables = await reservasMesasService.getAvailableTables(
          date,
          time,
          partySize,
          reservation?.id
        );
        setAvailableTables(tables);
      } catch {
        setAvailableTables([]);
      } finally {
        setLoadingTables(false);
      }
    };

    const debounce = setTimeout(loadTables, 300);
    return () => clearTimeout(debounce);
  }, [open, date, time, partySize, reservation?.id]);

  const handleSubmit = async () => {
    if (!customerName.trim() || !date || !time) return;

    setIsSaving(true);
    try {
      if (isEditing) {
        const updateData: UpdateReservationInput = {
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || undefined,
          customer_email: customerEmail.trim() || undefined,
          party_size: partySize,
          reservation_date: date,
          reservation_time: time,
          duration_minutes: durationMinutes,
          restaurant_table_id: tableId === 'none' ? null : tableId,
          notes: notes.trim() || undefined,
          special_requests: specialRequests.trim() || undefined,
        };
        await onSubmit(updateData);
      } else {
        const createData: CreateReservationInput = {
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || undefined,
          customer_email: customerEmail.trim() || undefined,
          party_size: partySize,
          reservation_date: date,
          reservation_time: time,
          duration_minutes: durationMinutes,
          restaurant_table_id: tableId === 'none' ? null : tableId,
          source,
          notes: notes.trim() || undefined,
          special_requests: specialRequests.trim() || undefined,
        };
        await onSubmit(createData);
      }
      onOpenChange(false);
    } catch {
      // Error manejado por el padre
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {isEditing ? 'Editar Reserva' : 'Nueva Reserva'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nombre del cliente */}
          <div className="space-y-1.5">
            <Label htmlFor="customerName" className="dark:text-gray-300">
              Nombre del cliente *
            </Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre completo"
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>

          {/* Teléfono y Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customerPhone" className="dark:text-gray-300">
                Teléfono
              </Label>
              <Input
                id="customerPhone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+57 300 123 4567"
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerEmail" className="dark:text-gray-300">
                Email
              </Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Fecha, Hora, Personas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date" className="dark:text-gray-300">
                Fecha *
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time" className="dark:text-gray-300">
                Hora *
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partySize" className="dark:text-gray-300">
                Personas *
              </Label>
              <Input
                id="partySize"
                type="number"
                min={1}
                max={50}
                value={partySize}
                onChange={(e) => setPartySize(parseInt(e.target.value) || 1)}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Duración */}
          <div className="space-y-1.5">
            <Label htmlFor="duration" className="dark:text-gray-300">
              Duración (minutos)
            </Label>
            <Select
              value={String(durationMinutes)}
              onValueChange={(v) => setDurationMinutes(Number(v))}
            >
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">60 min (1h)</SelectItem>
                <SelectItem value="90">90 min (1h 30m)</SelectItem>
                <SelectItem value="120">120 min (2h)</SelectItem>
                <SelectItem value="150">150 min (2h 30m)</SelectItem>
                <SelectItem value="180">180 min (3h)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mesa */}
          <div className="space-y-1.5">
            <Label className="dark:text-gray-300">
              Mesa {loadingTables && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
            </Label>
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                <SelectValue placeholder="Sin mesa asignada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin mesa asignada</SelectItem>
                {availableTables.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — Cap. {t.capacity}
                    {t.zone ? ` (${t.zone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTables && availableTables.length === 0 && date && time && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay mesas disponibles con capacidad para {partySize} personas en ese horario
              </p>
            )}
          </div>

          {/* Origen (solo al crear) */}
          {!isEditing && (
            <div className="space-y-1.5">
              <Label className="dark:text-gray-300">Origen</Label>
              <Select value={source} onValueChange={(v) => setSource(v as ReservationSource)}>
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(RESERVATION_SOURCE_LABELS) as [ReservationSource, string][]).map(
                    ([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notas y solicitudes especiales */}
          <div className="space-y-1.5">
            <Label htmlFor="specialRequests" className="dark:text-gray-300">
              Solicitudes especiales
            </Label>
            <Textarea
              id="specialRequests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="Silla para bebé, cumpleaños, alergias..."
              rows={2}
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="dark:text-gray-300">
              Notas internas
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas para el equipo..."
              rows={2}
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600 dark:text-gray-300"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!customerName.trim() || !date || !time || isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Guardar Cambios' : 'Crear Reserva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
