'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Clock, DollarSign, Receipt, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import type { ParkingSession } from '@/lib/services/parkingService';
import organizationService from '@/lib/services/organizationService';

interface ExitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ParkingSession | null;
  organizationId?: number;
  onConfirm: () => void;
}

interface ParkingRate {
  id: string;
  vehicle_type: string;
  rate_name: string;
  unit: 'minute' | 'hour' | 'day';
  price: number;
  grace_period_min?: number;
}

export function ExitDialog({
  open,
  onOpenChange,
  session,
  organizationId,
  onConfirm,
}: ExitDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rates, setRates] = useState<ParkingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string>('');
  const [calculatedAmount, setCalculatedAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    code: string;
    name: string;
    requires_reference: boolean;
  }>>([]);
  const [duration, setDuration] = useState({ hours: 0, minutes: 0, total: 0 });

  // Cargar métodos de pago
  useEffect(() => {
    const loadPaymentMethods = async () => {
      if (!organizationId || !open) return;
      
      try {
        const methods = await organizationService.getOrganizationPaymentMethods(organizationId);
        setPaymentMethods(methods);
        if (methods.length > 0) {
          setPaymentMethod(methods[0].code);
        }
      } catch (error) {
        console.error('Error cargando métodos de pago:', error);
      }
    };

    loadPaymentMethods();
  }, [organizationId, open]);

  // Cargar tarifas disponibles
  useEffect(() => {
    const loadRates = async () => {
      if (!organizationId || !session || !open) return;

      try {
        const { data, error } = await supabase
          .from('parking_rates')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('vehicle_type', session.vehicle_type)
          .order('price', { ascending: true });

        if (error) throw error;
        setRates(data || []);
        
        // Seleccionar automáticamente la primera tarifa
        if (data && data.length > 0) {
          setSelectedRateId(data[0].id);
        }
      } catch (error) {
        console.error('Error cargando tarifas:', error);
      }
    };

    loadRates();
  }, [organizationId, session, open]);

  // Calcular duración y monto
  useEffect(() => {
    if (!session || !open) return;

    // Calcular duración inmediatamente
    const calculateDuration = () => {
      const entryTime = new Date(session.entry_at);
      const exitTime = new Date();
      const diffMs = exitTime.getTime() - entryTime.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;

      console.log('Calculando duración:', {
        entry_at: session.entry_at,
        entryTime: entryTime.toISOString(),
        exitTime: exitTime.toISOString(),
        diffMs,
        diffMinutes,
        hours,
        minutes
      });

      setDuration({ hours, minutes, total: diffMinutes });

      // Calcular monto si hay tarifa seleccionada
      if (selectedRateId) {
        const selectedRate = rates.find(r => r.id === selectedRateId);
        if (selectedRate) {
          let amount = 0;
          const gracePeriod = selectedRate.grace_period_min || 0;
          const chargeableMinutes = Math.max(0, diffMinutes - gracePeriod);

          switch (selectedRate.unit) {
            case 'minute':
              amount = chargeableMinutes * selectedRate.price;
              break;
            case 'hour':
              amount = Math.ceil(chargeableMinutes / 60) * selectedRate.price;
              break;
            case 'day':
              amount = Math.ceil(chargeableMinutes / (60 * 24)) * selectedRate.price;
              break;
          }

          setCalculatedAmount(Math.round(amount * 100) / 100);
        }
      }
    };

    // Calcular inmediatamente
    calculateDuration();

    // Actualizar cada 30 segundos mientras el dialog está abierto
    const interval = setInterval(calculateDuration, 30000);

    return () => clearInterval(interval);
  }, [session, selectedRateId, rates, open]);

  // Limpiar formulario al cerrar
  useEffect(() => {
    if (!open) {
      setSelectedRateId('');
      setCalculatedAmount(0);
      setPaymentMethod('cash');
      setPaymentReference('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session || !selectedRateId) return;

    setIsSubmitting(true);
    try {
      const exitTime = new Date().toISOString();

      // Actualizar sesión de parking
      const { error: sessionError } = await supabase
        .from('parking_sessions')
        .update({
          exit_at: exitTime,
          duration_min: duration.total,
          rate_id: selectedRateId,
          amount: calculatedAmount,
          status: 'closed',
          updated_at: exitTime,
        })
        .eq('id', session.id);

      if (sessionError) throw sessionError;

      // Registrar pago (opcional, depende de tu estructura)
      // Aquí podrías crear un registro en parking_payments si lo necesitas

      onConfirm();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error registrando salida:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!session) return null;

  const selectedRate = rates.find(r => r.id === selectedRateId);
  const selectedPaymentMethod = paymentMethods.find(m => m.code === paymentMethod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Registrar Salida</DialogTitle>
          <DialogDescription>
            Completa los datos para registrar la salida del vehículo
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Información de la sesión */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Placa:</span>
              <span className="font-semibold">{session.vehicle_plate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Tipo:</span>
              <span className="font-medium capitalize">{session.vehicle_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Entrada:</span>
              <span className="font-medium">
                {new Date(session.entry_at).toLocaleString('es-CO', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Duración:</span>
              </div>
              <span className="text-lg font-bold">
                {duration.hours}h {duration.minutes}m
              </span>
            </div>
          </div>

          {/* Selección de tarifa */}
          <div className="space-y-2">
            <Label htmlFor="rate">Tarifa *</Label>
            {rates.length > 0 ? (
              <>
                <Select value={selectedRateId} onValueChange={setSelectedRateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tarifa" />
                  </SelectTrigger>
                  <SelectContent>
                    {rates.map((rate) => (
                      <SelectItem key={rate.id} value={rate.id}>
                        {rate.rate_name} - ${rate.price}/{rate.unit === 'minute' ? 'min' : rate.unit === 'hour' ? 'hora' : 'día'}
                        {rate.grace_period_min && ` (${rate.grace_period_min}min gratis)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRate && (
                  <p className="text-xs text-gray-500">
                    {selectedRate.grace_period_min && 
                      `Tiempo de gracia: ${selectedRate.grace_period_min} minutos`
                    }
                  </p>
                )}
              </>
            ) : (
              <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">No hay tarifas configuradas</p>
                  <p className="text-xs mt-1">Ve a Configuración → Tarifas de Parqueo para crear una</p>
                </div>
              </div>
            )}
          </div>

          {/* Monto calculado */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium">Total a Pagar:</span>
              </div>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${calculatedAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <Label htmlFor="payment_method">Método de Pago *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.code} value={method.code}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Referencia de pago (si es requerida) */}
          {selectedPaymentMethod?.requires_reference && (
            <div className="space-y-2">
              <Label htmlFor="payment_reference">Referencia de Pago *</Label>
              <Input
                id="payment_reference"
                placeholder="Ej: Número de transacción, voucher..."
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                required
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !selectedRateId || rates.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  Registrar Salida
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
