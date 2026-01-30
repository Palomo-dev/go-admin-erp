'use client';

import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, LogOut, Clock, DollarSign, AlertTriangle, CreditCard } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import type { ActiveSession } from './ActiveSessionsPanel';
import type { ParkingRate } from './RatesPanel';

interface ExitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ActiveSession | null;
  rates: ParkingRate[];
  onSubmit: (data: {
    session_id: string;
    amount: number;
    payment_method?: string;
    is_lost_ticket?: boolean;
    is_exception?: boolean;
    exception_reason?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

function calculateAmount(
  entryAt: string,
  rate: ParkingRate | undefined,
  isLostTicket: boolean,
  lostTicketFee: number = 50000
): { amount: number; duration: string; durationMinutes: number } {
  const entry = new Date(entryAt);
  const now = new Date();
  const diffMs = now.getTime() - entry.getTime();
  const durationMinutes = Math.floor(diffMs / (1000 * 60));
  
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const duration = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;

  if (isLostTicket) {
    return { amount: lostTicketFee, duration, durationMinutes };
  }

  if (!rate) {
    return { amount: 0, duration, durationMinutes };
  }

  let amount = 0;
  const gracePeriod = rate.grace_period_min || 0;

  if (durationMinutes <= gracePeriod) {
    amount = 0;
  } else if (rate.unit === 'hour') {
    const billableMinutes = durationMinutes - gracePeriod;
    const billableHours = Math.ceil(billableMinutes / 60);
    amount = billableHours * rate.price;
  } else if (rate.unit === 'day') {
    const billableDays = Math.ceil((durationMinutes - gracePeriod) / (60 * 24));
    amount = billableDays * rate.price;
  } else if (rate.unit === 'fraction') {
    const fractions = Math.ceil((durationMinutes - gracePeriod) / 15);
    amount = fractions * rate.price;
  }

  return { amount, duration, durationMinutes };
}

export function ExitDialog({
  open,
  onOpenChange,
  session,
  rates,
  onSubmit,
  isLoading,
}: ExitDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isLostTicket, setIsLostTicket] = useState(false);
  const [isException, setIsException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentMethod('cash');
      setIsLostTicket(false);
      setIsException(false);
      setExceptionReason('');
    }
  }, [open]);

  if (!session) return null;

  const applicableRate = rates.find(
    (r) => r.vehicle_type.toLowerCase() === session.vehicle_type.toLowerCase()
  );

  const { amount, duration, durationMinutes } = calculateAmount(
    session.entry_at,
    applicableRate,
    isLostTicket
  );

  const finalAmount = isException ? 0 : amount;
  const isPassHolder = session.is_pass_holder;

  const handleSubmit = async () => {
    if (!session) return;

    setSubmitting(true);
    try {
      await onSubmit({
        session_id: session.id,
        amount: finalAmount,
        payment_method: !isPassHolder && finalAmount > 0 ? paymentMethod : undefined,
        is_lost_ticket: isLostTicket,
        is_exception: isException,
        exception_reason: isException ? exceptionReason : undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <LogOut className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            Registrar Salida
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información del vehículo */}
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">
                {session.vehicle_plate}
              </span>
              {isPassHolder && (
                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Abonado
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>{session.vehicle_type}</span>
              <span>•</span>
              <span>Entrada: {formatDate(session.entry_at)}</span>
            </div>
          </div>

          {/* Tiempo y tarifa */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Tiempo</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {duration}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium">Total</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {isPassHolder ? 'Incluido' : formatCurrency(finalAmount)}
              </p>
            </div>
          </div>

          {!isPassHolder && (
            <>
              <Separator />

              {/* Opciones especiales */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="lostTicket"
                    checked={isLostTicket}
                    onChange={(e) => {
                      setIsLostTicket(e.target.checked);
                      if (e.target.checked) setIsException(false);
                    }}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <Label htmlFor="lostTicket" className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Pérdida de Ticket (+{formatCurrency(50000)})
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="exception"
                    checked={isException}
                    onChange={(e) => {
                      setIsException(e.target.checked);
                      if (e.target.checked) setIsLostTicket(false);
                    }}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <Label htmlFor="exception" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    Salida sin cobro (excepción)
                  </Label>
                </div>

                {isException && (
                  <div className="pl-6">
                    <Input
                      placeholder="Motivo de la excepción (requerido)"
                      value={exceptionReason}
                      onChange={(e) => setExceptionReason(e.target.value)}
                      className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                    />
                  </div>
                )}
              </div>

              {finalAmount > 0 && (
                <>
                  <Separator />

                  {/* Método de pago */}
                  <div className="space-y-2">
                    <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Método de Pago
                    </Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                        <SelectItem value="nequi">Nequi</SelectItem>
                        <SelectItem value="daviplata">Daviplata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || isLoading || (isException && !exceptionReason.trim())}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 mr-2" />
                {finalAmount > 0 && !isPassHolder
                  ? `Cobrar ${formatCurrency(finalAmount)}`
                  : 'Registrar Salida'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
