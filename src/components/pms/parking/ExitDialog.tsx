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
import parkingPaymentService from '@/lib/services/parkingPaymentService';
import { useTranslations } from 'next-intl';

/** Unidades de tarifa con etiqueta en `pmsParking.unidades`. */
const UNIDADES_TARIFA = new Set(['minute', 'hour', 'day', 'week', 'month', 'year']);

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
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  price: number;
  grace_period_min?: number;
  space_type_id?: string;
}

export function ExitDialog({
  open,
  onOpenChange,
  session,
  organizationId,
  onConfirm,
}: ExitDialogProps) {
  const t = useTranslations('pmsParking');
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
        // parking_sessions no guarda space_type_id: las tarifas se buscan por vehicle_type
        const { data, error } = await supabase
          .from('parking_rates')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('vehicle_type', session.vehicle_type)
          .eq('is_active', true)
          .order('price', { ascending: true });

        const ratesData: ParkingRate[] = !error && data ? data : [];

        setRates(ratesData);
        
        // Seleccionar automáticamente la primera tarifa
        if (ratesData.length > 0) {
          setSelectedRateId(ratesData[0].id);
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
              // Por día/noche: mínimo 1 día
              amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24))) * selectedRate.price;
              break;
            case 'week':
              // Por semana: mínimo 1 semana
              amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24 * 7))) * selectedRate.price;
              break;
            case 'month':
              // Por mes: aproximado 30 días, mínimo 1 mes
              amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24 * 30))) * selectedRate.price;
              break;
            case 'year':
              // Por año: aproximado 365 días, mínimo 1 año
              amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24 * 365))) * selectedRate.price;
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

      // Registrar el cobro en caja (payments + parking_payments). Antes la
      // salida cerraba la sesión sin dejar ningún pago.
      if (organizationId && calculatedAmount > 0) {
        await parkingPaymentService.registrarPago({
          organization_id: organizationId,
          branch_id: session.branch_id,
          source: 'parking_session',
          source_id: session.id,
          method: paymentMethod,
          amount: calculatedAmount,
        });
      }

      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error registrando salida:', error);
      alert(t('exitDialog.errorSalida', { error: (error as Error)?.message ?? t('exitDialog.noPudoRegistrarSalida') }));
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
          <DialogTitle>{t('exitDialog.registrarSalida')}</DialogTitle>
          <DialogDescription>
            {t('exitDialog.completaDatosRegistrarSalida')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Información de la sesión */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('exitDialog.placa')}</span>
              <span className="font-semibold">{session.vehicle_plate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('exitDialog.tipo')}</span>
              <span className="font-medium capitalize">{session.vehicle_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('exitDialog.entrada')}</span>
              <span className="font-medium">
                {new Date(session.entry_at).toLocaleString('es-CO', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex flex-wrap items-center gap-2 text-blue-600 dark:text-blue-400">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">{t('exitDialog.duracion')}</span>
              </div>
              <span className="text-lg font-bold">
                {duration.hours}h {duration.minutes}m
              </span>
            </div>
          </div>

          {/* Selección de tarifa */}
          <div className="space-y-2">
            <Label htmlFor="rate">{t('exitDialog.tarifa')}</Label>
            {rates.length > 0 ? (
              <>
                <Select value={selectedRateId} onValueChange={setSelectedRateId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('exitDialog.seleccionarTarifa')} />
                  </SelectTrigger>
                  <SelectContent>
                    {rates.map((rate) => {
                      const unidad = UNIDADES_TARIFA.has(rate.unit) ? t(`unidades.${rate.unit}`) : rate.unit;
                      return (
                        <SelectItem key={rate.id} value={rate.id}>
                          {rate.rate_name} - ${rate.price.toLocaleString()}/{unidad}
                          {rate.grace_period_min && t('exitDialog.minGratis', { n: rate.grace_period_min })}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedRate && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedRate.grace_period_min && 
                      t('exitDialog.tiempoGracia', { n: selectedRate.grace_period_min })
                    }
                  </p>
                )}
              </>
            ) : (
              <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex flex-wrap items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{t('exitDialog.noHayTarifasConfiguradas')}</p>
                  <p className="text-xs mt-1">{t('exitDialog.veConfiguracionTarifasParqueo')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Monto calculado */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium">{t('exitDialog.totalPagar')}</span>
              </div>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${calculatedAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <Label htmlFor="payment_method">{t('exitDialog.metodoPago')}</Label>
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
              <Label htmlFor="payment_reference">{t('exitDialog.referenciaPago')}</Label>
              <Input
                id="payment_reference"
                placeholder={t('exitDialog.ejNumeroTransaccionVoucher')}
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
              {t('passVehiclesDialog.cancelar')}
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !selectedRateId || rates.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('exitDialog.procesando')}
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  {t('exitDialog.registrarSalida')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
