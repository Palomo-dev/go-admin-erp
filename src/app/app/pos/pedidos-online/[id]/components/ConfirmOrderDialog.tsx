'use client';

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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type TimeUnit = 'minutes' | 'hours' | 'days';

export interface EstimatedTime {
  value: number;
  unit: TimeUnit;
}

interface ConfirmOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tiempo de preparación (Listo aprox) */
  prepTime: EstimatedTime;
  onPrepTimeChange: (time: EstimatedTime) => void;
  /** Tiempo de traslado (Entrega aprox). Solo si es delivery. */
  transitTime?: EstimatedTime;
  onTransitTimeChange?: (time: EstimatedTime) => void;
  /** Si el pedido es delivery (muestra campo de traslado) */
  isDelivery?: boolean;
  onConfirm: () => void;
  markAsPaid?: boolean;
  onMarkAsPaidChange?: (value: boolean) => void;
  isLoading?: boolean;
}


/** Convierte EstimatedTime a milisegundos */
export function timeToMs(time: EstimatedTime): number {
  const multipliers: Record<TimeUnit, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  };
  return time.value * multipliers[time.unit];
}

/**
 * Formatea el tiempo para mostrar (ej: "30 min", "2 hrs", "3 días") con el traductor de
 * `pedidoWeb` (`unidadCorta.*`).
 */
export function formatEstimatedTime(time: EstimatedTime, t: (clave: string, valores: { n: number }) => string): string {
  return t(`unidadCorta.${time.unit}`, { n: time.value });
}

export function ConfirmOrderDialog({
  open,
  onOpenChange,
  prepTime,
  onPrepTimeChange,
  transitTime,
  onTransitTimeChange,
  isDelivery = false,
  onConfirm,
  markAsPaid = false,
  onMarkAsPaidChange,
  isLoading = false,
}: ConfirmOrderDialogProps) {
  const t = useTranslations('pedidoWeb');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">{t('confirmOrderDialog.confirmarPedido')}</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {t('confirmOrderDialog.indicaTiemposEstimadosNotificar')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {/* Tiempo de preparación */}
          <div>
            <Label htmlFor="prep-time" className="dark:text-gray-200">
              {t('confirmOrderDialog.tiempoPreparacionListoAprox')}
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="prep-time"
                type="number"
                value={prepTime.value}
                onChange={(e) => onPrepTimeChange({ ...prepTime, value: Number(e.target.value) })}
                min={1}
                className="flex-1"
              />
              <Select
                value={prepTime.unit}
                onValueChange={(unit: TimeUnit) => onPrepTimeChange({ ...prepTime, unit })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">{t('confirmOrderDialog.minutos')}</SelectItem>
                  <SelectItem value="hours">{t('confirmOrderDialog.horas')}</SelectItem>
                  <SelectItem value="days">{t('confirmOrderDialog.dias')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tiempo de traslado (solo delivery) */}
          {isDelivery && onTransitTimeChange && transitTime && (
            <div>
              <Label htmlFor="transit-time" className="dark:text-gray-200">
                {t('confirmOrderDialog.tiempoTrasladoEntregaAprox')}
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="transit-time"
                  type="number"
                  value={transitTime.value}
                  onChange={(e) => onTransitTimeChange({ ...transitTime, value: Number(e.target.value) })}
                  min={0}
                  className="flex-1"
                />
                <Select
                  value={transitTime.unit}
                  onValueChange={(unit: TimeUnit) => onTransitTimeChange({ ...transitTime, unit })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">{t('confirmOrderDialog.minutos')}</SelectItem>
                    <SelectItem value="hours">{t('confirmOrderDialog.horas')}</SelectItem>
                    <SelectItem value="days">{t('confirmOrderDialog.dias')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
                {t('confirmOrderDialog.tiempoDesdeEstaListo')}
              </p>
            </div>
          )}

          <p className="text-sm text-muted-foreground dark:text-gray-400">
            {t('confirmOrderDialog.clienteRecibiraNotificacionEstos')}
          </p>

          {onMarkAsPaidChange && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mark-as-paid-detail"
                checked={markAsPaid}
                onCheckedChange={(checked) => onMarkAsPaidChange(checked === true)}
              />
              <Label htmlFor="mark-as-paid-detail" className="text-sm font-medium cursor-pointer dark:text-gray-200">
                {t('confirmOrderDialog.marcarComoPagado')}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-gray-600">
            {t('ficha.cancelar')}
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('confirmOrderDialog.confirmarPedido')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
