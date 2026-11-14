'use client';

/**
 * Marco de todas las páginas del Chat: pestañas del módulo arriba y la página
 * debajo. La Bandeja y la conversación completa ocupan el alto visible (su
 * lista e hilo tienen scroll propio); las demás crecen con su contenido.
 *
 * En las pantallas de la Bandeja pide el menú lateral en riel mientras están
 * abiertas (`useRielMientrasMontada`): al salir vuelve a la preferencia de la
 * persona, y si lo expande ahí, se respeta. Vive en el layout del Chat para
 * que ir de la Bandeja a la conversación no suelte la solicitud.
 */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/Utils';
import { useRielMientrasMontada } from '@/components/shell/sidebar/rielSolicitado';
import { ChatNavTabs } from './ChatNavTabs';
import { esPantallaAltoFijo, ocultaPestanasModulo, usaRielAngosto } from './chatNavLogica';

export function MarcoChat({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const altoFijo = esPantallaAltoFijo(pathname);
  useRielMientrasMontada(usaRielAngosto(pathname));
  return (
    <div className={cn('flex min-w-0 flex-col', altoFijo ? 'h-full' : 'min-h-full')}>
      {!ocultaPestanasModulo(pathname) && (
        <ChatNavTabs className={cn('shrink-0', altoFijo && 'max-lg:hidden')} />
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col', altoFijo && 'min-h-0')}>{children}</div>
    </div>
  );
}
