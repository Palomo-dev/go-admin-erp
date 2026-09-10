'use client';

/**
 * CallButton — botón click-to-call reutilizable (FASE-03 §5.2).
 * Usa el hook seguro `useSoftphone()`: sin provider o sin registro queda
 * deshabilitado con el motivo en el tooltip. `stopPropagation` para tarjetas.
 * Expone `data-phone`/`data-opportunity-id`/`data-customer-id` para el atajo Ctrl+Shift+C.
 */

import { useState } from 'react';
import { Phone, PhoneCall, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSoftphone } from './SoftphoneProvider';
import { toast } from '@/components/ui/use-toast';

interface CallButtonProps {
  /** Número de teléfono destino (E.164 o local). */
  phoneNumber: string | null | undefined;
  customerId?: string | null;
  opportunityId?: string | null;
  displayName?: string | null;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'icon';
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function CallButton({ phoneNumber, customerId, opportunityId, displayName, variant = 'ghost', size = 'icon', label, className, disabled }: CallButtonProps) {
  const sp = useSoftphone();
  const [isCalling, setIsCalling] = useState(false);

  const isBusy = sp.available && (sp.callStatus === 'connecting' || sp.callStatus === 'ringing' || sp.callStatus === 'connected');
  const reason = !sp.available
    ? 'Softphone no disponible'
    : sp.deviceState !== 'registered'
      ? sp.deviceReason ?? 'Softphone no registrado'
      : null;
  const isDisabled = !phoneNumber || isBusy || isCalling || disabled || Boolean(reason);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!phoneNumber) {
      toast({ title: 'Sin número', description: 'No hay número de teléfono para llamar', variant: 'destructive' });
      return;
    }
    if (!sp.available || sp.deviceState !== 'registered') {
      toast({ title: 'Telefonía no disponible', description: reason ?? 'El softphone no está conectado', variant: 'destructive' });
      return;
    }
    setIsCalling(true);
    try {
      await sp.makeCall(phoneNumber, { customerId, opportunityId, displayName });
    } finally {
      setIsCalling(false);
    }
  };

  const title = !phoneNumber ? 'Sin número' : reason ? `${reason}` : `Llamar a ${displayName ?? phoneNumber} (Ctrl+Shift+C)`;

  return (
    <Button
      onClick={handleClick}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className={className}
      title={title}
      aria-label={title}
      data-phone={phoneNumber ?? undefined}
      data-opportunity-id={opportunityId ?? undefined}
      data-customer-id={customerId ?? undefined}
      data-display-name={displayName ?? undefined}
    >
      {isCalling ? <Loader2 size={16} className="animate-spin" /> : isBusy ? <PhoneCall size={16} className="text-green-600 dark:text-green-400" /> : <Phone size={16} />}
      {label && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}
