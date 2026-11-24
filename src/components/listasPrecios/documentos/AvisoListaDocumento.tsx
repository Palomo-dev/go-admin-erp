'use client';

/**
 * Cotización y factura con cliente de lista (Figma «05 POS y ventas» 08, 3023:201005): selector
 * «Lista de precios» (la del cliente o el precio normal, solo para este documento), la franja
 * «Lista Mayoristas · Si cambias de cliente o de lista, los precios se recalculan…» y la insignia
 * de cada línea.
 */
import { useTranslations } from 'next-intl';
import { Tags } from 'lucide-react';
import type { InsigniaLinea } from '@/components/kit/documento/documentoLineasLogica';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InfoLineaLista } from './useListaPreciosDocumento';

export function AvisoListaDocumento({
  listaNombre,
  usarNormal,
  onUsarNormal,
  documento,
}: {
  listaNombre: string | null;
  usarNormal: boolean;
  onUsarNormal: (v: boolean) => void;
  documento: 'cotizacion' | 'factura';
}) {
  const t = useTranslations('listasPrecios.documentos');
  if (!listaNombre) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="flex shrink-0 flex-col gap-1 text-sm sm:w-64">
        <span className="text-fg-secondary">{t('selector')}</span>
        <Select value={usarNormal ? 'normal' : 'cliente'} onValueChange={(v) => onUsarNormal(v === 'normal')}>
          <SelectTrigger className="h-10" aria-label={t('selector')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cliente">{t('delCliente', { lista: listaNombre })}</SelectItem>
            <SelectItem value="normal">{t('precioNormal')}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text" role="note">
        <Tags aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        <span>
          {usarNormal ? t('avisoNormal') : t('aviso', { lista: listaNombre })}
          {documento === 'factura' && !usarNormal ? ` ${t('avisoFactura')}` : ''}
        </span>
      </div>
    </div>
  );
}

/** Insignias de la línea: «Lista · 48+ · normal $ 10.000» o «A mano». */
export function useInsigniasListaDocumento() {
  const t = useTranslations('listasPrecios.documentos');
  return (info: InfoLineaLista, precio: number, formatear: (n: number) => string): InsigniaLinea[] => {
    if (info.lista) {
      const d = info.lista;
      const detalle = d.minQty ? t('escalon', { n: d.minQty }) : d.porcentaje ? `${d.porcentaje > 0 ? '+' : '−'}${Math.abs(d.porcentaje)} %` : d.etiqueta;
      const normal = info.normal !== null && Math.abs(info.normal - precio) >= 0.005 ? t('normal', { precio: formatear(info.normal) }) : null;
      return [{ texto: [t('lista'), detalle, normal].filter(Boolean).join(' · '), tono: 'informacion' }];
    }
    if (info.aMano) return [{ texto: t('aMano'), tono: 'neutro' }];
    return [];
  };
}
