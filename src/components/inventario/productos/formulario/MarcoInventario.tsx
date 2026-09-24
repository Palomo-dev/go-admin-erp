'use client';

import { PackageX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { SeccionStockInicial } from './secciones/SeccionStockInicial';
import { SeccionTrazabilidad } from './secciones/SeccionTrazabilidad';
import type { PropsSeccionFormulario } from './tipos';

/**
 * Contenido de «Inventario por sucursal»: el switch «Rastrear inventario»,
 * el stock inicial por sucursal (solo si rastrea) y la trazabilidad por
 * serial. Un servicio no llega aquí: `ProductoForm` oculta la sección.
 */
export function MarcoInventario(props: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.inventario');
  const { estado, cambiar } = props;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor="producto-rastrear" className="min-w-0 text-sm font-medium text-fg">
          {t('rastrear')}
          <span className="mt-0.5 block text-xs font-normal text-fg-muted">{t('rastrearAyuda')}</span>
        </label>
        <Switch id="producto-rastrear" checked={estado.track_stock} onCheckedChange={(v) => cambiar('track_stock', v)} />
      </div>

      {estado.track_stock ? (
        // Los avisos de «con variantes» y «en editar solo mínimos» los pinta la tabla.
        <SeccionStockInicial {...props} />
      ) : (
        <div className="flex items-start gap-3 rounded-lg bg-subtle p-3">
          <PackageX aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          <div className="text-sm">
            <p className="font-medium text-fg">{t('sinSeguimiento')}</p>
            <p className="text-fg-secondary">{t('sinSeguimientoAyuda')}</p>
          </div>
        </div>
      )}

      <div className="border-t border-line pt-5">
        <SeccionTrazabilidad {...props} />
      </div>
    </div>
  );
}
