'use client';

import { useTranslations } from 'next-intl';
import { CodigoBarras, FormField } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { CampoCodigoBarras } from '../../codigos/CampoCodigoBarras';
import { PLU_MAXIMO } from '../../logica/formularioProducto';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Código de barras del producto (generador con la numeración de la
 * organización y validación de formato y unicidad) y vista previa con el SKU.
 * Las variantes llevan su propio código en la sección Variantes.
 * Productos por peso o medida: «PLU de balanza», el número que la balanza
 * etiquetadora imprime en la etiqueta de peso variable (Figma P2).
 */
export function SeccionCodigos({ estado, cambiar, modo, productId, errores }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.codigos');
  const tErr = useTranslations('productoForm.errores');
  const codigo = estado.barcode.trim();
  const conPlu = estado.sale_mode !== 'unit' && estado.product_type !== 'service';

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

      {conPlu && (
        <FormField
          etiqueta={t('plu')}
          ayuda={t('pluAyuda')}
          error={errores.scale_plu ? tErr(errores.scale_plu) : null}
        >
          <CampoNumero
            id="producto-plu-balanza"
            valor={estado.scale_plu}
            onValorChange={(v) => cambiar('scale_plu', v)}
            decimales={0}
            minimo={1}
            maximo={PLU_MAXIMO}
            alinear="izquierda"
          />
        </FormField>
      )}
    </div>
  );
}
