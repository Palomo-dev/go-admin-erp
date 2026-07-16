'use client';

import { ReactNode } from 'react';
import { MailWarning } from 'lucide-react';
import { useEmailConfirmed } from '@/hooks/useEmailConfirmed';

interface EmailConfirmedGateProps {
  children: ReactNode;
  /**
   * Si true (default), envuelve el children en un <span> con tooltip y lo
   * deshabilita visualmente en vez de ocultarlo por completo. Útil para
   * botones donde queremos que el usuario vea la acción pero no pueda usarla.
   */
  disableInsteadOfHide?: boolean;
  message?: string;
}

/**
 * Restringe una acción sensible (cambiar contraseña, facturación, invitar
 * usuarios) a solo cuentas con email confirmado. Mientras carga el estado,
 * no bloquea (evita parpadeos); una vez confirmado que no está verificado,
 * deshabilita/oculta el contenido.
 */
export function EmailConfirmedGate({
  children,
  disableInsteadOfHide = true,
  message = 'Confirma tu correo electrónico para usar esta función'
}: EmailConfirmedGateProps) {
  const { confirmed, loading } = useEmailConfirmed();

  if (loading || confirmed) {
    return <>{children}</>;
  }

  if (!disableInsteadOfHide) {
    return null;
  }

  return (
    <span
      title={message}
      className="relative inline-block cursor-not-allowed opacity-50 [&_button]:pointer-events-none [&_a]:pointer-events-none"
    >
      {children}
      <span className="sr-only">{message}</span>
    </span>
  );
}

/**
 * Variante para mostrar un mensaje de advertencia en vez de envolver un
 * elemento existente (por ejemplo, arriba de un formulario completo).
 */
export function EmailConfirmedWarning({ message = 'Debes confirmar tu correo electrónico para usar esta función.' }: { message?: string }) {
  const { confirmed, loading } = useEmailConfirmed();

  if (loading || confirmed) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 mb-3">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
