'use client';

import React, { useState, useEffect } from 'react';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  Car,
  Clock,
  DollarSign,
  LogOut,
  Receipt,
  Printer,
  Calendar,
  Timer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import type { ParkingSession } from '@/lib/services/parkingService';

interface ParkingRate {
  id: string;
  vehicle_type: string;
  rate_name: string;
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  price: number;
  grace_period_min?: number;
  space_type_id?: string;
}

interface ParkingSessionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ParkingSession | null;
  organizationId?: number;
  onRegisterExit: (session: ParkingSession) => void;
  onPrintTicket?: (session: ParkingSession) => void;
}

const statusLabels: Record<string, string> = {
  open: 'Activa',
  closed: 'Completada',
  cancelled: 'Cancelada',
};

const statusColors: Record<string, string> = {
  open: 'bg-green-500',
  closed: 'bg-gray-500',
  cancelled: 'bg-red-500',
};

export function ParkingSessionDrawer({
  open,
  onOpenChange,
  session,
  organizationId,
  onRegisterExit,
  onPrintTicket,
}: ParkingSessionDrawerProps) {
  const { toast } = useToast();
  const [rateInfo, setRateInfo] = useState<ParkingRate | null>(null);
  const [duration, setDuration] = useState({ hours: 0, minutes: 0, total: 0 });
  const [calculatedAmount, setCalculatedAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar tarifa y calcular monto
  useEffect(() => {
    const loadRateAndCalculate = async () => {
      if (!session || !organizationId || !open) return;

      try {
        // Si la sesión ya tiene tarifa asignada
        if (session.rate_id) {
          const { data: rate } = await supabase
            .from('parking_rates')
            .select('*')
            .eq('id', session.rate_id)
            .single();

          if (rate) {
            setRateInfo(rate);
            return;
          }
        }

        // Buscar tarifa por tipo de vehículo
        const { data: rates } = await supabase
          .from('parking_rates')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('vehicle_type', session.vehicle_type)
          .order('price', { ascending: true })
          .limit(1);

        if (rates && rates.length > 0) {
          setRateInfo(rates[0]);
        }
      } catch (error) {
        console.error('Error cargando tarifa:', error);
      }
    };

    loadRateAndCalculate();
  }, [session, organizationId, open]);

  // Calcular duración en tiempo real
  useEffect(() => {
    if (!session || !open) return;

    const calculateDuration = () => {
      const entryTime = new Date(session.entry_at);
      const exitTime = session.exit_at ? new Date(session.exit_at) : new Date();
      const diffMinutes = differenceInMinutes(exitTime, entryTime);
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;

      setDuration({ hours, minutes, total: diffMinutes });

      // Calcular monto si hay tarifa
      if (rateInfo) {
        let amount = 0;
        const gracePeriod = rateInfo.grace_period_min || 0;
        const chargeableMinutes = Math.max(0, diffMinutes - gracePeriod);

        switch (rateInfo.unit) {
          case 'minute':
            amount = chargeableMinutes * rateInfo.price;
            break;
          case 'hour':
            amount = Math.ceil(chargeableMinutes / 60) * rateInfo.price;
            break;
          case 'day':
            amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24))) * rateInfo.price;
            break;
          case 'week':
            amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24 * 7))) * rateInfo.price;
            break;
          case 'month':
            amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24 * 30))) * rateInfo.price;
            break;
          case 'year':
            amount = Math.max(1, Math.ceil(chargeableMinutes / (60 * 24 * 365))) * rateInfo.price;
            break;
        }

        setCalculatedAmount(session.amount || Math.round(amount * 100) / 100);
      }
    };

    calculateDuration();

    // Actualizar cada 30 segundos si está abierta
    if (session.status === 'open') {
      const interval = setInterval(calculateDuration, 30000);
      return () => clearInterval(interval);
    }
  }, [session, rateInfo, open]);

  // Limpiar al cerrar
  useEffect(() => {
    if (!open) {
      setRateInfo(null);
      setDuration({ hours: 0, minutes: 0, total: 0 });
      setCalculatedAmount(0);
    }
  }, [open]);

  if (!session) return null;

  const formatDuration = () => {
    if (duration.hours > 0) {
      return `${duration.hours}h ${duration.minutes}m`;
    }
    return `${duration.minutes} minutos`;
  };

  const formatRate = () => {
    if (!rateInfo) return 'Sin tarifa';
    const unitLabels: Record<string, string> = {
      minute: 'min',
      hour: 'hora',
      day: 'día',
      week: 'semana',
      month: 'mes',
      year: 'año'
    };
    return `$${rateInfo.price.toLocaleString()}/${unitLabels[rateInfo.unit] || rateInfo.unit}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[450px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <Car className="h-5 w-5" />
              {session.vehicle_plate}
            </SheetTitle>
            <Badge className={`${statusColors[session.status]} text-white`}>
              {statusLabels[session.status]}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 capitalize">{session.vehicle_type}</p>
        </SheetHeader>

        <div className="space-y-6 py-4">

          {/* Fechas y Horas */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Calendar className="h-4 w-4" />
              Tiempo de Estadía
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Entrada:</span>
                <span className="font-medium">
                  {format(new Date(session.entry_at), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                </span>
              </div>
              
              {session.exit_at ? (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Salida:</span>
                  <span className="font-medium">
                    {format(new Date(session.exit_at), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Salida:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Pendiente
                  </span>
                </div>
              )}

              <Separator className="my-2" />

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Timer className="h-4 w-4" />
                  <span className="font-medium">Duración:</span>
                </div>
                <span className="text-xl font-bold">
                  {formatDuration()}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tarifa y Cobro */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <DollarSign className="h-4 w-4" />
              Información de Cobro
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Tarifa:</span>
                <span className="font-medium">
                  {rateInfo ? rateInfo.rate_name : 'No asignada'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Precio:</span>
                <span className="font-medium">{formatRate()}</span>
              </div>

              {rateInfo?.grace_period_min && rateInfo.grace_period_min > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tiempo de gracia:</span>
                  <span className="font-medium">{rateInfo.grace_period_min} min</span>
                </div>
              )}

              <Separator className="my-2" />

              <div className="flex justify-between items-center pt-2">
                <span className="font-semibold text-lg">Total:</span>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${calculatedAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Acciones */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-500">Acciones</p>
            
            <div className="grid grid-cols-2 gap-3">
              {session.status === 'open' && (
                <Button
                  onClick={() => {
                    onRegisterExit(session);
                    onOpenChange(false);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Registrar Salida
                </Button>
              )}

              {onPrintTicket && (
                <Button
                  variant="outline"
                  onClick={() => onPrintTicket(session)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Ticket
                </Button>
              )}

              {session.status === 'closed' && (
                <Button
                  variant="outline"
                  onClick={() => onPrintTicket?.(session)}
                  className="col-span-2"
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Ver Recibo
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
