'use client';

/**
 * Marco de todas las páginas del Chat: pestañas del módulo arriba y la página
 * debajo. La Bandeja y la conversación completa ocupan el alto visible (su
 * lista e hilo tienen scroll propio); las demás crecen con su contenido.
 */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/Utils';
import { ChatNavTabs } from './ChatNavTabs';
import { esPantallaAltoFijo, ocultaPestanasModulo } from './chatNavLogica';

export function MarcoChat({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const altoFijo = esPantallaAltoFijo(pathname);
  return (
    <div className={cn('flex min-w-0 flex-col', altoFijo ? 'h-full' : 'min-h-full')}>
      {!ocultaPestanasModulo(pathname) && (
        <ChatNavTabs className={cn('shrink-0', altoFijo && 'max-lg:hidden')} />
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col', altoFijo && 'min-h-0')}>{children}</div>
    </div>
  );
}
