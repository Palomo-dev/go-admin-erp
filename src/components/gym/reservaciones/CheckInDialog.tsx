'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, Clock, Calendar, MapPin } from 'lucide-react';
import { ClassReservation, getClassTypeLabel } from '@/lib/services/gymService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toast } from 'sonner';

interface CheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: ClassReservation | null;
  onCheckInComplete: () => void;
}

type CheckInMethod = 'manual' | 'qr' | 'card' | 'biometric';

export function CheckInDialog({ open, onOpenChange, reservation, onCheckInComplete }: CheckInDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<CheckInMethod>('manual');

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleCheckIn = async () => {
    if (!reservation) return;

    setIsLoading(true);
    try {
      const orgId = getOrganizationId();
      const now = new Date().toISOString();

      // Actualizar reservación con check-in time
      const { error: reservationError } = await supabase
        .from('class_reservations')
        .update({
          checkin_time: now,
          status: 'attended',
          updated_at: now,
        })
        .eq('id', reservation.id);

      if (reservationError) throw reservationError;

      // Registrar en member_checkins
      const { error: checkinError } = await supabase
        .from('member_checkins')
        .insert({
          organization_id: orgId,
          customer_id: reservation.customer_id,
          branch_id: reservation.gym_classes?.branch_id || 1,
          checkin_at: now,
          method,
          class_reservation_id: reservation.id,
          membership_id: reservation.membership_id,
        });

      if (checkinError) {
        console.error('Error registrando check-in:', checkinError);
        // No falla si no puede registrar en member_checkins
      }

      toast.success('Check-in registrado correctamente');
      onCheckInComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error en check-in:', error);
      toast.error('Error al registrar check-in');
    } finally {
      setIsLoading(false);
    }
  };

  if (!reservation) return null;

  const gymClass = reservation.gym_classes;
  const customer = reservation.customers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-green-600" />
            Check-in de Clase
          </DialogTitle>
          <DialogDescription>
            Registrar asistencia del miembro a la clase
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info del cliente */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="font-semibold text-gray-900 dark:text-white">
              {customer?.first_name} {customer?.last_name}
            </p>
            {customer?.email && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{customer.email}</p>
            )}
          </div>

          {/* Info de la clase */}
          {gymClass && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 dark:text-white">{gymClass.title}</p>
                <Badge variant="outline">{getClassTypeLabel(gymClass.class_type)}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(gymClass.start_at)}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatTime(gymClass.start_at)} - {formatTime(gymClass.end_at)}
                </div>
              </div>
              {gymClass.room && (
                <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="h-4 w-4" />
                  {gymClass.room}
                </div>
              )}
            </div>
          )}

          {/* Método de check-in */}
          <div>
            <Label>Método de Check-in</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as CheckInMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="qr">Código QR</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="biometric">Biométrico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hora actual */}
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Hora de check-in</p>
            <p className="text-2xl font-bold text-green-600">
              {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCheckIn}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <UserCheck className="h-4 w-4 mr-2" />
            Confirmar Check-in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
