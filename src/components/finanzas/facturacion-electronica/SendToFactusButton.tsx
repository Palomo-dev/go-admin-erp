'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  electronicInvoicingService,
  type EInvoiceStatus,
} from '@/lib/services/electronicInvoicingService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

interface SendToFactusButtonProps {
  invoiceId: string;
  invoiceNumber: string;
  organizationId: number;
  currentStatus?: EInvoiceStatus | null;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function SendToFactusButton({
  invoiceId,
  invoiceNumber,
  organizationId,
  currentStatus,
  disabled = false,
  variant = 'default',
  size = 'sm',
  className,
  onSuccess,
  onError,
}: SendToFactusButtonProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // No mostrar si ya está aceptada
  const isAlreadyAccepted = currentStatus === 'accepted';
  const isProcessing = currentStatus === 'processing' || currentStatus === 'sent';
  const isPending = currentStatus === 'pending';

  const handleClick = async () => {
    // Validar primero
    setIsValidating(true);
    const validation = await electronicInvoicingService.validateInvoiceForEInvoicing(invoiceId);
    setIsValidating(false);

    if (!validation.valid) {
      setValidationErrors(validation.errors);
      setShowConfirmDialog(true);
      return;
    }

    setValidationErrors([]);
    setShowConfirmDialog(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirmDialog(false);
    setIsLoading(true);

    try {
      const result = await electronicInvoicingService.sendToFactus(invoiceId, organizationId);

      if (result.success) {
        toast({
          title: 'Factura enviada a DIAN',
          description: `La factura ${invoiceNumber} ha sido enviada para validación`,
        });
        onSuccess?.();
      } else {
        toast({
          title: 'Error al enviar',
          description: result.error || 'No se pudo enviar la factura a DIAN',
          variant: 'destructive',
        });
        onError?.(result.error || 'Error desconocido');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Error al procesar la solicitud',
        variant: 'destructive',
      });
      onError?.(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Texto del botón según estado
  const getButtonText = () => {
    if (isLoading || isValidating) return 'Enviando...';
    if (isAlreadyAccepted) return 'Enviada a DIAN';
    if (isProcessing) return 'Procesando...';
    if (isPending) return 'Pendiente DIAN';
    if (currentStatus === 'rejected' || currentStatus === 'failed') return 'Reintentar DIAN';
    return 'Enviar a DIAN';
  };

  // Deshabilitado si está procesando o ya aceptada
  const isDisabled = disabled || isLoading || isValidating || isAlreadyAccepted || isProcessing;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={isDisabled}
        onClick={handleClick}
      >
        {isLoading || isValidating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : isAlreadyAccepted ? (
          <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
        ) : (
          <Zap className="h-4 w-4 mr-2" />
        )}
        {getButtonText()}
      </Button>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              Enviar Factura Electrónica
            </DialogTitle>
            <DialogDescription>
              Se enviará la factura <strong>{invoiceNumber}</strong> a la DIAN para su validación.
            </DialogDescription>
          </DialogHeader>

          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Errores de validación</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="text-sm">{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validationErrors.length === 0 && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Una vez enviada, la factura será procesada por el proveedor de facturación electrónica
                y validada ante la DIAN. Este proceso puede tomar unos minutos.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={validationErrors.length > 0}
            >
              <Zap className="h-4 w-4 mr-2" />
              Confirmar envío
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SendToFactusButton;
