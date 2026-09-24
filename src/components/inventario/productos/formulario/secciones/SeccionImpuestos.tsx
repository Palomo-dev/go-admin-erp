'use client';

import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Impuestos del producto (N por producto: `product_tax_relations`). El
 * impuesto por defecto de la organización llega preseleccionado al crear.
 * Dice si el precio de venta ya los incluye (`tax_included`).
 */
export function SeccionImpuestos({ estado, cambiar, errores, catalogos }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.impuestos');
  const tErr = useTranslations('productoForm.errores');
  const localeIntl = useLocaleIntl();

  const tasa = useMemo(() => new Intl.NumberFormat(localeIntl, { maximumFractionDigits: 2 }), [localeIntl]);
  const opciones = useMemo(
    () =>
      catalogos.impuestos.map((i) => ({
        valor: i.id,
        etiqueta: t('opcion', { nombre: i.name, tasa: tasa.format(i.rate) }),
        descripcion: i.is_default ? t('porDefecto') : undefined,
      })),
    [catalogos.impuestos, t, tasa],
  );

  const elegidos = catalogos.impuestos.filter((i) => estado.impuestos.includes(i.id));
  const incluidos = elegidos.filter((i) => i.tax_included === true);
  const nota =
    elegidos.length === 0
      ? t('notaSinImpuestos')
      : incluidos.length === elegidos.length
        ? t('notaIncluidos')
        : incluidos.length === 0
          ? t('notaSeSuman')
          : t('notaMixtos');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField
        etiqueta={t('etiqueta')}
        error={errores.impuestos ? tErr(errores.impuestos) : null}
        ayuda={catalogos.impuestos.length === 0 ? t('sinCatalogo') : t('ayuda')}
      >
        {(campo) => (
          <MultiSelect
            id={campo.id}
            aria-describedby={campo['aria-describedby']}
            aria-invalid={campo['aria-invalid']}
            opciones={opciones}
            valores={estado.impuestos}
            onValoresChange={(v) => cambiar('impuestos', v)}
            placeholder={t('placeholder')}
            placeholderBusqueda={t('buscar')}
            textoVacio={t('vacio')}
            etiquetaQuitar={(nombre) => t('quitar', { nombre })}
          />
        )}
      </FormField>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-fg">{t('precioIncluye')}</span>
        <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2.5 text-sm text-fg-secondary" aria-live="polite">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          {nota}
        </p>
      </div>
    </div>
  );
}
