'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  User,
  Calendar,
  DoorOpen,
  DollarSign,
  FileText,
  Loader2,
  Receipt,
  FileCheck,
  AlertTriangle,
  Info,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CheckoutReservation } from '@/lib/services/checkoutService';
import { formatCurrency } from '@/utils/Utils';
import { ElectronicInvoiceToggle } from '@/components/finanzas/facturacion-electronica';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: CheckoutReservation | null;
  onConfirm: (data: CheckoutDialogData) => Promise<void>;
}

export interface CheckoutDialogData {
  reservationId: string;
  notes: string;
  generateInvoice: boolean;
  generateReceipt: boolean;
  sendToFactus: boolean;
}

export function CheckoutDialog({
  open,
  onOpenChange,
  reservation,
  onConfirm,
}: CheckoutDialogProps) {
  const [notes, setNotes] = useState('');
  const [generateInvoice, setGenerateInvoice] = useState(false);
  const [generateReceipt, setGenerateReceipt] = useState(false);
  const [sendToFactus, setSendToFactus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validación de fechas
  const [dateWarning, setDateWarning] = useState<{
    type: 'error' | 'warning' | 'info' | null;
    title: string;
    message: string;
  }>({ type: null, title: '', message: '' });

  // Validar fechas cuando se abre el dialog
  React.useEffect(() => {
    if (!reservation || !open) {
      setDateWarning({ type: null, title: '', message: '' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const checkoutDate = new Date(reservation.checkout);
    checkoutDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((checkoutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Check-out antes de la fecha programada
    if (diffDays > 0) {
      setDateWarning({
        type: 'warning',
        title: 'Check-out Anticipado',
        message: `La fecha programada de check-out es el ${checkoutDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} (en ${diffDays} ${diffDays === 1 ? 'día' : 'días'}). ¿Deseas realizar el check-out anticipado? Esto podría generar cargos adicionales o ajustes en la facturación.`,
      });
    }
    // Check-out después de la fecha programada (tardío)
    else if (diffDays < 0) {
      setDateWarning({
        type: 'warning',
        title: 'Check-out Tardío',
        message: `La fecha programada de check-out era el ${checkoutDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} (hace ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}). Estás realizando un check-out tardío. Verifica si hay cargos adicionales por noches extras.`,
      });
    }
    // Check-out en la fecha correcta
    else {
      setDateWarning({
        type: 'info',
        title: 'Check-out en Fecha',
        message: 'El check-out se está realizando en la fecha programada.',
      });
    }

    // Verificar si hay saldo pendiente
    if (reservation.folio && reservation.folio.balance > 0) {
      setDateWarning({
        type: 'error',
        title: 'Saldo Pendiente',
        message: `El huésped tiene un saldo pendiente de ${formatCurrency(reservation.folio.balance)}. No se puede realizar el check-out hasta que se complete el pago.`,
      });
    }
  }, [reservation, open]);

  // Reset cuando se cierra
  React.useEffect(() => {
    if (!open) {
      setNotes('');
      setGenerateInvoice(false);
      setGenerateReceipt(false);
      setSendToFactus(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!reservation) return;

    try {
      setIsSubmitting(true);
      await onConfirm({
        reservationId: reservation.id,
        notes,
        generateInvoice,
        generateReceipt,
        sendToFactus: generateInvoice && sendToFactus,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error en checkout:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!reservation) return null;

  const hasPendingBalance = reservation.folio && reservation.folio.balance > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <DoorOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Check-out - {reservation.code}
          </DialogTitle>
          <DialogDescription>
            Confirme la salida del huésped y revise los detalles del folio
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alerta de Validación de Fechas */}
          {dateWarning.type && (
            <Alert
              variant={dateWarning.type === 'error' ? 'destructive' : 'default'}
              className={
                dateWarning.type === 'error'
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : dateWarning.type === 'warning'
                  ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              }
            >
              {dateWarning.type === 'error' ? (
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : dateWarning.type === 'warning' ? (
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              ) : (
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              )}
              <AlertTitle className={
                dateWarning.type === 'error'
                  ? 'text-red-800 dark:text-red-200'
                  : dateWarning.type === 'warning'
                  ? 'text-yellow-800 dark:text-yellow-200'
                  : 'text-blue-800 dark:text-blue-200'
              }>
                {dateWarning.title}
              </AlertTitle>
              <AlertDescription className={
                dateWarning.type === 'error'
                  ? 'text-red-700 dark:text-red-300'
                  : dateWarning.type === 'warning'
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-blue-700 dark:text-blue-300'
              }>
                {dateWarning.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Información del Huésped */}
          <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-5 w-5 text-gray-400" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Información del Huésped
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Nombre</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {reservation.customer_name}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {reservation.customer_email}
                </p>
              </div>
            </div>
          </div>

          {/* Detalles de la Reserva */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Detalles de la Reserva
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Check-in</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(reservation.checkin)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Check-out</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(reservation.checkout)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Espacios Asignados:
                </p>
              </div>
              {reservation.spaces.map((space) => (
                <div
                  key={space.id}
                  className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {space.label}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {space.space_type_name} • {space.floor_zone}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Detalle del Folio */}
          {reservation.folio ? (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resumen del Folio
              </h3>

              {hasPendingBalance && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-900 dark:text-red-100">
                      Saldo Pendiente
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      Esta reserva tiene un saldo pendiente de{' '}
                      <span className="font-bold">
                        {formatCurrency(reservation.folio.balance)}
                      </span>
                      . Asegúrese de liquidar antes de confirmar el check-out.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Total de Cargos</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(reservation.folio.total_charges)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Total Pagado</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(reservation.folio.total_payments)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    Saldo Pendiente
                  </span>
                  <span
                    className={`text-xl font-bold ${
                      reservation.folio.balance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {formatCurrency(reservation.folio.balance)}
                  </span>
                </div>
              </div>

              {reservation.folio.items.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cargos ({reservation.folio.items.length})
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {reservation.folio.items.map((item, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center text-sm p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.description}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                No hay folio asociado a esta reserva
              </p>
            </div>
          )}

          <Separator />

          {/* Opciones de Documentos */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Documentos
            </h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generateInvoice"
                  checked={generateInvoice}
                  onCheckedChange={(checked) => setGenerateInvoice(checked as boolean)}
                />
                <Label
                  htmlFor="generateInvoice"
                  className="text-sm font-normal cursor-pointer flex items-center gap-2"
                >
                  <FileCheck className="h-4 w-4 text-gray-400" />
                  Generar Factura
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generateReceipt"
                  checked={generateReceipt}
                  onCheckedChange={(checked) => setGenerateReceipt(checked as boolean)}
                />
                <Label
                  htmlFor="generateReceipt"
                  className="text-sm font-normal cursor-pointer flex items-center gap-2"
                >
                  <Receipt className="h-4 w-4 text-gray-400" />
                  Generar Recibo de Pago
                </Label>
              </div>
              {generateInvoice && (
                <div className="ml-6 mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <ElectronicInvoiceToggle
                    checked={sendToFactus}
                    onCheckedChange={setSendToFactus}
                    showLabel={true}
                    showTooltip={true}
                    size="md"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Notas */}
          <div>
            <Label htmlFor="notes">Notas de Salida (Opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Agregue cualquier observación sobre la salida del huésped..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || dateWarning.type === 'error'}
            className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <DoorOpen className="mr-2 h-4 w-4" />
                Confirmar Check-out
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
