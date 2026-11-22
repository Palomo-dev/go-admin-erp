'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { EnlaceTienda } from '@/lib/inventario/tiendaProducto';

const CLASES_CHIP =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/**
 * «Ver en la tienda ↗» junto al nombre y el estado (Figma `2726:193647`): abre la página del
 * producto en el dominio principal, en otra pestaña. No publicado (inactivo, eliminado o con
 * el padre fuera de la tienda): deshabilitado con el motivo (Figma `2726:194089`). Sin tienda,
 * no aparece. La URL y el motivo los decide el servidor (`/api/inventario/productos/[id]/tienda`).
 */
export function VerEnTienda({ productoUuid, version }: { productoUuid: string; version?: string | null }) {
  const t = useTranslations('detallesMarca.tienda');
  const [enlace, setEnlace] = useState<EnlaceTienda | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/inventario/productos/${encodeURIComponent(productoUuid)}/tienda`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<EnlaceTienda>) : null))
      .then((datos) => {
        if (vivo) setEnlace(datos);
      })
      .catch(() => {
        if (vivo) setEnlace(null);
      });
    return () => {
      vivo = false;
    };
    // `version` (updated_at del producto) vuelve a preguntar tras activar o desactivar.
  }, [productoUuid, version]);

  if (!enlace || enlace.estado === 'sinTienda') return null;

  const sinEsquema = enlace.estado === 'publicado' ? enlace.url.replace(/^https?:\/\//, '') : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {enlace.estado === 'publicado' ? (
            <a href={enlace.url} target="_blank" rel="noopener noreferrer" className={`${CLASES_CHIP} bg-brand-tint text-link hover:bg-brand-tint-hover`}>
              <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              {t('ver')}
              <span className="sr-only">{t('otraPestana')}</span>
            </a>
          ) : (
            <span
              role="link"
              aria-disabled="true"
              tabIndex={0}
              className={`${CLASES_CHIP} cursor-not-allowed bg-subtle text-fg-muted`}
            >
              <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              {t('ver')}
              <span className="sr-only">
                {t('noPublicado')}. {t(`motivos.${enlace.motivo}`)}
              </span>
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs">
          {enlace.estado === 'publicado' ? (
            <>
              <p className="text-xs font-medium">{t('abre')}</p>
              <p className="break-all text-xs opacity-80">{sinEsquema}</p>
            </>
          ) : (
            <div>
              <p className="text-xs font-medium">{t('noPublicado')}</p>
              <p className="text-xs opacity-80">{t(`motivos.${enlace.motivo}`)}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
