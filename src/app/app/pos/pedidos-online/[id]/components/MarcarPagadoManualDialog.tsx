'use client';

import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { referenciaValida } from '@/lib/services/webOrderPagoManual';

interface MarcarPagadoManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Número del pedido, para el título. */
  orderNumber: string;
  /** El pedido venció: el texto avisa que se reactiva y se vuelve a reservar el stock. */
  vencido: boolean;
  isLoading?: boolean;
  onConfirm: (datos: { referencia: string; motivo: string }) => void;
}

/**
 * «Marcar como pagado (pago en línea)»: pide la referencia de la transacción en
 * Wompi y el motivo; los dos quedan en la auditoría del pedido. No pasa por la
 * caja: el dinero ya entró por la pasarela.
 */
export function MarcarPagadoManualDialog({
  open,
  onOpenChange,
  orderNumber,
  vencido,
  isLoading = false,
  onConfirm,
}: MarcarPagadoManualDialogProps) {
  const t = useTranslations('pedidoWeb');
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (!open) {
      setReferencia('');
      setMotivo('');
    }
  }, [open]);

  const refOk = referenciaValida(referencia);
  const valido = refOk && motivo.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pagoManual.titulo', { numero: orderNumber })}</DialogTitle>
          <DialogDescription>
            {vencido ? t('pagoManual.descripcionVencido') : t('pagoManual.descripcion')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pago-manual-referencia">{t('pagoManual.referencia')}</Label>
            <Input
              id="pago-manual-referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={t('pagoManual.referenciaEjemplo')}
              autoComplete="off"
              maxLength={200}
              aria-invalid={referencia.trim() !== '' && !refOk}
            />
            {referencia.trim() !== '' && !refOk && (
              <p className="text-sm text-destructive">{t('pagoManual.errores.REFERENCIA_INVALIDA')}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pago-manual-motivo">{t('pagoManual.motivo')}</Label>
            <Textarea
              id="pago-manual-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={t('pagoManual.motivoEjemplo')}
              rows={3}
              maxLength={500}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t('pagoManual.auditoria')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t('detalle.volver')}
          </Button>
          <Button
            onClick={() => onConfirm({ referencia: referencia.trim(), motivo: motivo.trim() })}
            disabled={isLoading || !valido}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('pagoManual.confirmar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
