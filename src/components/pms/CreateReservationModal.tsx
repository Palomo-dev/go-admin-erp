/**
 * 🏨 MODAL DE CREACIÓN DE RESERVAS - PMS
 * 
 * Componente para crear nuevas reservas que automáticamente dispara
 * el trigger reservation.created cuando se confirma una reserva.
 */

'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Hotel, User, Calendar, DollarSign, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { AutomaticTriggers } from '@/lib/services/automaticTriggerIntegrations';

interface CreateReservationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ReservationFormData {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_document: string;
  room_number: string;
  room_type: string;
  check_in: string;
  check_out: string;
  guests_count: number;
  room_rate: number;
  special_requests: string;
}

interface ReservationFormErrors {
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guest_document?: string;
  room_number?: string;
  room_type?: string;
  check_in?: string;
  check_out?: string;
  guests_count?: string;
  room_rate?: string;
  special_requests?: string;
}

export function CreateReservationModal({ open, onOpenChange, onSuccess }: CreateReservationModalProps) {
  const organizationId = getOrganizationId();
  
  const [formData, setFormData] = useState<ReservationFormData>({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    guest_document: '',
    room_number: '',
    room_type: 'standard',
    check_in: '',
    check_out: '',
    guests_count: 1,
    room_rate: 0,
    special_requests: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ReservationFormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: ReservationFormErrors = {};

    if (!formData.guest_name.trim()) newErrors.guest_name = 'Nombre requerido';
    if (!formData.guest_email.trim()) newErrors.guest_email = 'Email requerido';
    if (!formData.room_number.trim()) newErrors.room_number = 'Habitación requerida';
    if (!formData.check_in) newErrors.check_in = 'Fecha de entrada requerida';
    if (!formData.check_out) newErrors.check_out = 'Fecha de salida requerida';
    if (Number(formData.room_rate) <= 0) newErrors.room_rate = 'Tarifa debe ser mayor a 0';

    // Validar fechas
    if (formData.check_in && formData.check_out) {
      const checkInDate = new Date(formData.check_in);
      const checkOutDate = new Date(formData.check_out);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (checkInDate < today) {
        newErrors.check_in = 'La fecha de entrada no puede ser anterior a hoy';
      }
      if (checkOutDate <= checkInDate) {
        newErrors.check_out = 'La fecha de salida debe ser posterior a la de entrada';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateTotal = (): number => {
    if (!formData.check_in || !formData.check_out || !formData.room_rate) return 0;
    
    const checkIn = new Date(formData.check_in);
    const checkOut = new Date(formData.check_out);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    
    return nights * formData.room_rate;
  };

  const handleInputChange = (field: keyof ReservationFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Por favor corrige los errores en el formulario');
      return;
    }

    setIsSubmitting(true);

    try {
      const nights = Math.ceil(
        (new Date(formData.check_out).getTime() - new Date(formData.check_in).getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalAmount = calculateTotal();

      // Crear la reserva en la base de datos
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          organization_id: organizationId,
          guest_name: formData.guest_name,
          guest_email: formData.guest_email,
          guest_phone: formData.guest_phone,
          guest_document: formData.guest_document,
          room_number: formData.room_number,
          room_type: formData.room_type,
          check_in: formData.check_in,
          check_out: formData.check_out,
          guests_count: formData.guests_count,
          room_rate: formData.room_rate,
          total_amount: totalAmount,
          nights: nights,
          status: 'confirmed',
          special_requests: formData.special_requests,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (reservationError) {
        console.error('Error creando reserva:', reservationError);
        toast.error('Error al crear la reserva');
        return;
      }

      // 🚀 TRIGGER AUTOMÁTICO: reservation.created
      try {
        await AutomaticTriggers.reservationCreated({
          reservation_id: reservation.id.toString(),
          guest_name: formData.guest_name,
          guest_email: formData.guest_email,
          guest_phone: formData.guest_phone,
          room_number: formData.room_number,
          room_type: formData.room_type,
          check_in: formData.check_in,
          check_out: formData.check_out,
          total_amount: totalAmount,
          nights: nights,
          guests_count: formData.guests_count,
          room_rate: formData.room_rate,
          special_requests: formData.special_requests,
          confirmation_code: `RSV-${reservation.id}`,
          booking_source: 'direct'
        }, organizationId);
        
        console.log('✅ Trigger reservation.created ejecutado exitosamente');
      } catch (triggerError) {
        console.error('⚠️ Error en trigger reservation.created (no afecta la reserva):', triggerError);
      }

      toast.success('Reserva creada exitosamente');
      onSuccess();
      resetForm();
      onOpenChange(false);

    } catch (error) {
      console.error('Error creando reserva:', error);
      toast.error('Error inesperado al crear la reserva');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      guest_name: '',
      guest_email: '',
      guest_phone: '',
      guest_document: '',
      room_number: '',
      room_type: 'standard',
      check_in: '',
      check_out: '',
      guests_count: 1,
      room_rate: 0,
      special_requests: ''
    });
    setErrors({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Hotel className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Nueva Reserva PMS
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información del Huésped */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader>
              <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                <User className="h-4 w-4" />
                Información del Huésped
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="guest_name">Nombre Completo *</Label>
                  <Input
                    id="guest_name"
                    value={formData.guest_name}
                    onChange={(e) => handleInputChange('guest_name', e.target.value)}
                    className={errors.guest_name ? "border-red-500" : ""}
                    placeholder="Nombre completo del huésped"
                  />
                  {errors.guest_name && <p className="text-sm text-red-500">{errors.guest_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest_email">Email *</Label>
                  <Input
                    id="guest_email"
                    type="email"
                    value={formData.guest_email}
                    onChange={(e) => handleInputChange('guest_email', e.target.value)}
                    className={errors.guest_email ? "border-red-500" : ""}
                    placeholder="email@ejemplo.com"
                  />
                  {errors.guest_email && <p className="text-sm text-red-500">{errors.guest_email}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="guest_phone">Teléfono</Label>
                  <Input
                    id="guest_phone"
                    value={formData.guest_phone}
                    onChange={(e) => handleInputChange('guest_phone', e.target.value)}
                    placeholder="+57 300 123 4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest_document">Documento</Label>
                  <Input
                    id="guest_document"
                    value={formData.guest_document}
                    onChange={(e) => handleInputChange('guest_document', e.target.value)}
                    placeholder="Cédula o pasaporte"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información de la Habitación */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader>
              <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Hotel className="h-4 w-4" />
                Detalles de la Habitación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="room_number">Habitación *</Label>
                  <Input
                    id="room_number"
                    value={formData.room_number}
                    onChange={(e) => handleInputChange('room_number', e.target.value)}
                    className={errors.room_number ? "border-red-500" : ""}
                    placeholder="101"
                  />
                  {errors.room_number && <p className="text-sm text-red-500">{errors.room_number}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room_type">Tipo de Habitación</Label>
                  <Select value={formData.room_type} onValueChange={(value) => handleInputChange('room_type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Estándar</SelectItem>
                      <SelectItem value="deluxe">Deluxe</SelectItem>
                      <SelectItem value="suite">Suite</SelectItem>
                      <SelectItem value="presidential">Presidencial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guests_count">Huéspedes</Label>
                  <Input
                    id="guests_count"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.guests_count}
                    onChange={(e) => handleInputChange('guests_count', parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fechas y Tarifas */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader>
              <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Fechas y Tarifas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="check_in">Check-in *</Label>
                  <Input
                    id="check_in"
                    type="date"
                    value={formData.check_in}
                    onChange={(e) => handleInputChange('check_in', e.target.value)}
                    className={errors.check_in ? "border-red-500" : ""}
                  />
                  {errors.check_in && <p className="text-sm text-red-500">{errors.check_in}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="check_out">Check-out *</Label>
                  <Input
                    id="check_out"
                    type="date"
                    value={formData.check_out}
                    onChange={(e) => handleInputChange('check_out', e.target.value)}
                    className={errors.check_out ? "border-red-500" : ""}
                  />
                  {errors.check_out && <p className="text-sm text-red-500">{errors.check_out}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room_rate">Tarifa por Noche *</Label>
                  <Input
                    id="room_rate"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.room_rate}
                    onChange={(e) => handleInputChange('room_rate', parseFloat(e.target.value) || 0)}
                    className={errors.room_rate ? "border-red-500" : ""}
                    placeholder="150000"
                  />
                  {errors.room_rate && <p className="text-sm text-red-500">{errors.room_rate}</p>}
                </div>
              </div>

              {/* Resumen de Total */}
              {formData.check_in && formData.check_out && formData.room_rate > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-900/20 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 dark:text-blue-400">Total de la Reserva</p>
                      <p className="text-lg font-semibold text-blue-800 dark:text-blue-300">
                        ${calculateTotal().toLocaleString()} COP
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        {Math.ceil((new Date(formData.check_out).getTime() - new Date(formData.check_in).getTime()) / (1000 * 60 * 60 * 24))} noches
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        ${formData.room_rate.toLocaleString()} por noche
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="special_requests">Solicitudes Especiales</Label>
                <Textarea
                  id="special_requests"
                  value={formData.special_requests}
                  onChange={(e) => handleInputChange('special_requests', e.target.value)}
                  placeholder="Cama extra, vista al mar, late check-out..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Crear Reserva
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
