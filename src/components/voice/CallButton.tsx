'use client';

/**
 * CallButton — botón click-to-call reutilizable (FASE-03 §5.2).
 * Usa el hook seguro `useSoftphone()`: sin provider o sin registro queda
 * deshabilitado con el motivo en el tooltip. `stopPropagation` para tarjetas.
 * Expone `data-phone`/`data-opportunity-id`/`data-customer-id` para el atajo Ctrl+Shift+C.
 *
 * F15-B: el modo lo decide `resolveDefaultCallMode` (vía `useCallModePolicy`).
 * Si es `mobile` (app Capacitor, teléfono, preferencia del usuario o micrófono
 * bloqueado por el SO) el botón abre el bridge «Llamar desde mi celular» en
 * vez de quedar deshabilitado; y si el softphone falla por micrófono denegado,
 * se ofrece el bridge con la ruta de Ajustes en vez de tragar el error.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Phone, PhoneCall, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSoftphone } from './SoftphoneProvider';
import { useCallModePolicy } from './hooks/useCallModePolicy';
import { toast } from '@/components/ui/use-toast';
import { normalizePhone } from '@/components/crm/shared/quickActionsConfig';
import { useOrgDefaultCountry } from '@/components/crm/shared/useOrgDefaultCountry';

const MobileCallDialog = dynamic(() => import('@/components/crm/shared/MobileCallDialog').then((m) => m.MobileCallDialog), { ssr: false });

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
  const { decision } = useCallModePolicy();
  const defaultCountry = useOrgDefaultCountry() ?? undefined;
  const [isCalling, setIsCalling] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const useBridge = decision?.mode === 'mobile';
  const isBusy = sp.available && (sp.callStatus === 'connecting' || sp.callStatus === 'ringing' || sp.callStatus === 'connected');
  const reason = useBridge
    ? null
    : !sp.available
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
    if (useBridge) {
      setMobileOpen(true);
      return;
    }
    if (!sp.available || sp.deviceState !== 'registered') {
      toast({ title: 'Telefonía no disponible', description: reason ?? 'El softphone no está conectado', variant: 'destructive' });
      return;
    }
    setIsCalling(true);
    try {
      const result = await sp.makeCall(phoneNumber, { customerId, opportunityId, displayName });
      if (!result.ok && result.reason === 'mic_denied') {
        toast({ title: 'Sin micrófono: llamamos desde tu celular', description: result.settingsHint ?? result.message });
        setMobileOpen(true);
      }
    } finally {
      setIsCalling(false);
    }
  };

  const who = displayName ?? phoneNumber;
  const title = !phoneNumber ? 'Sin número' : reason ? `${reason}` : useBridge ? `Llamar a ${who} desde mi celular` : `Llamar a ${who} (Ctrl+Shift+C)`;

  return (
    <>
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
        data-call-mode={decision?.mode ?? undefined}
      >
        {isCalling ? <Loader2 size={16} className="animate-spin" /> : isBusy ? <PhoneCall size={16} className="text-green-600 dark:text-green-400" /> : useBridge ? <Smartphone size={16} /> : <Phone size={16} />}
        {label && <span className="ml-1.5">{label}</span>}
      </Button>
      {mobileOpen && phoneNumber && (
        <MobileCallDialog
          open
          onOpenChange={(o) => !o && setMobileOpen(false)}
          opportunityId={opportunityId ?? undefined}
          customerId={customerId ?? undefined}
          targetPhone={normalizePhone(phoneNumber, defaultCountry) ?? phoneNumber}
          customerName={displayName ?? undefined}
          onStarted={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
