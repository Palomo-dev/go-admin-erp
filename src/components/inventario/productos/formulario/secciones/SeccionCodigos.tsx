'use client';

import { useTranslations } from 'next-intl';
import { CodigoBarras } from '@/components/kit';
import { CampoCodigoBarras } from '../../codigos/CampoCodigoBarras';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Código de barras del producto (generador con la numeración de la
 * organización y validación de formato y unicidad) y vista previa con el SKU.
 * Las variantes llevan su propio código en la sección Variantes.
 */
export function SeccionCodigos({ estado, cambiar, modo, productId }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.codigos');
  const codigo = estado.barcode.trim();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <CampoCodigoBarras
        id="producto-codigo-barras"
        value={estado.barcode}
        onChange={(v) => cambiar('barcode', v)}
        excluirIds={modo === 'editar' && productId ? [productId] : []}
      />

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-fg">{t('vistaPrevia')}</span>
        <div className="flex min-h-10 items-center gap-3 rounded-lg border border-line bg-subtle p-2">
          <div className="flex h-14 w-36 shrink-0 overflow-hidden rounded">
            <CodigoBarras valor={codigo} textoSinCodigo={t('sinCodigo')} textoInvalido={t('invalido')} className="h-full p-1" />
          </div>
          <div className="min-w-0 text-xs">
            <p className="truncate font-mono text-sm text-fg">{codigo || t('sinCodigo')}</p>
            <p className="truncate text-fg-secondary">{t('sku', { sku: estado.sku || '—' })}</p>
            <p className="text-fg-muted">{t('escaner')}</p>
          </div>
        </div>
        {estado.tiene_variantes && <p className="text-xs text-fg-muted">{t('variantes')}</p>}
        {modo === 'duplicar' && <p className="text-xs text-fg-muted">{t('duplicar')}</p>}
      </div>
    </div>
  );
}
