'use client';

/**
 * CallButton — Botón click-to-call reutilizable.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Recibe un número de teléfono y opcionalmente IDs de cliente/oportunidad.
 * Al hacer click, invoca makeCall del SoftphoneProvider.
 *
 * Debe usarse dentro de <SoftphoneProvider>.
 */

import { useState } from 'react';
import { Phone, PhoneCall, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSoftphone } from './SoftphoneProvider';
import { useToast } from '@/components/ui/use-toast';

interface CallButtonProps {
  /** Número de teléfono destino (formato E.164 o local). */
  phoneNumber: string | null | undefined;
  /** ID del cliente asociado (opcional). */
  customerId?: string;
  /** ID de la oportunidad asociada (opcional). */
  opportunityId?: string;
  /** Habilitar grabación de la llamada. */
  recordingEnabled?: boolean;
  /** Variante del botón. */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  /** Tamaño del botón. */
  size?: 'default' | 'sm' | 'icon';
  /** Texto alternativo (por defecto sin texto, solo icono). */
  label?: string;
  /** Clase adicional. */
  className?: string;
  /** Deshabilitar manualmente. */
  disabled?: boolean;
}

export function CallButton({
  phoneNumber,
  customerId,
  opportunityId,
  recordingEnabled,
  variant = 'ghost',
  size = 'icon',
  label,
  className,
  disabled,
}: CallButtonProps) {
  const { makeCall, callStatus, deviceState } = useSoftphone();
  const { toast } = useToast();
  const [isCalling, setIsCalling] = useState(false);

  const isBusy = callStatus === 'connecting' || callStatus === 'connected';
  const isDisabled = !phoneNumber || isBusy || isCalling || disabled || deviceState !== 'registered';

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!phoneNumber) {
      toast({
        title: 'Sin número',
        description: 'No hay número de teléfono para llamar',
        variant: 'destructive',
      });
      return;
    }

    if (deviceState !== 'registered') {
      toast({
        title: 'Telefonía no disponible',
        description: 'El dispositivo de voz no está conectado',
        variant: 'destructive',
      });
      return;
    }

    setIsCalling(true);
    try {
      await makeCall(phoneNumber, {
        customerId,
        opportunityId,
        recordingEnabled,
      });
    } catch (err) {
      console.error('[CallButton] Error:', err);
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className={className}
      title={phoneNumber ? `Llamar a ${phoneNumber}` : 'Sin número'}
      aria-label={phoneNumber ? `Llamar a ${phoneNumber}` : 'Sin número'}
    >
      {isCalling ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isBusy ? (
        <PhoneCall size={16} className="text-green-600 dark:text-green-400" />
      ) : (
        <Phone size={16} />
      )}
      {label && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}
