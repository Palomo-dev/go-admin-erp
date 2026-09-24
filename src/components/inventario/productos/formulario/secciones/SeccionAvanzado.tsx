'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChefHat, StickyNote, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Avanzado: envío (peso y medidas para cotizar guías; oculto en servicios),
 * nota interna (una nota nueva; el hilo vive en la pestaña Notas del detalle)
 * y compuesto/receta (`is_composite`).
 */
type CampoEnvio = 'weight_kg' | 'length_cm' | 'width_cm' | 'height_cm';

const CAMPOS_ENVIO: readonly { campo: CampoEnvio; unidad: 'kg' | 'cm' }[] = [
  { campo: 'weight_kg', unidad: 'kg' },
  { campo: 'length_cm', unidad: 'cm' },
  { campo: 'width_cm', unidad: 'cm' },
  { campo: 'height_cm', unidad: 'cm' },
];

function Subtitulo({ icono: Icono, children }: { icono: typeof Truck; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
      <Icono aria-hidden className="size-4 text-fg-muted" strokeWidth={1.5} />
      {children}
    </h3>
  );
}

export function SeccionAvanzado({ estado, cambiar, errores, modo, productUuid }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.avanzado');
  const tErr = useTranslations('productoForm.errores');
  const entero = useFormatoEntero();
  const esServicio = estado.product_type === 'service';

  const { length_cm: largo, width_cm: ancho, height_cm: alto } = estado;
  const volumen = largo && ancho && alto && largo > 0 && ancho > 0 && alto > 0 ? Math.round(largo * ancho * alto) : null;
  const etiquetaEnvio: Record<CampoEnvio, string> = {
    weight_kg: t('peso'),
    length_cm: t('largo'),
    width_cm: t('ancho'),
    height_cm: t('alto'),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Envío */}
      <div className="flex flex-col gap-3">
        <Subtitulo icono={Truck}>{t('envio')}</Subtitulo>
        {esServicio ? (
          <p className="text-sm text-fg-secondary">{t('envioServicio')}</p>
        ) : (
          <>
            <p className="text-xs text-fg-muted">{t('envioAyuda')}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CAMPOS_ENVIO.map(({ campo, unidad }) => (
                <FormField key={campo} etiqueta={etiquetaEnvio[campo]}>
                  <CampoNumero
                    id={`producto-${campo}`}
                    valor={estado[campo]}
                    onValorChange={(v) => cambiar(campo, v)}
                    sufijo={unidad}
                    decimales={unidad === 'kg' ? 3 : 2}
                    minimo={0}
                    aria-invalid={errores.dimensiones ? true : undefined}
                  />
                </FormField>
              ))}
            </div>
            {errores.dimensiones && (
              <p role="alert" className="text-xs text-danger-text">
                {tErr(errores.dimensiones)}
              </p>
            )}
            <p className="text-xs text-fg-secondary" aria-live="polite">
              {volumen !== null ? t('volumen', { volumen: entero(volumen) }) : t('volumenVacio')}
            </p>
          </>
        )}
      </div>

      {/* Nota interna */}
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <Subtitulo icono={StickyNote}>{t('nota')}</Subtitulo>
        <div role="group" aria-label={t('nota')}>
          <RichTextEditor value={estado.nota} onChange={(html) => cambiar('nota', html)} placeholder={t('notaPlaceholder')} />
        </div>
        <p className="text-xs text-fg-muted">
          {modo === 'editar' ? t('notaAyudaEditar') : t('notaAyudaCrear')}{' '}
          {modo === 'editar' && productUuid && (
            <Link href={`/app/inventario/productos/${productUuid}?tab=notas`} className="text-link hover:underline">
              {t('verNotas')}
            </Link>
          )}
        </p>
      </div>

      {/* Compuesto / receta */}
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <Subtitulo icono={ChefHat}>{t('compuesto')}</Subtitulo>
        <div className="flex items-start justify-between gap-4">
          <label htmlFor="producto-compuesto" className="min-w-0 text-sm text-fg">
            {t('esCompuesto')}
            <span className="mt-0.5 block text-xs text-fg-muted">{t('compuestoAyuda')}</span>
          </label>
          <Switch id="producto-compuesto" checked={estado.is_composite} onCheckedChange={(v) => cambiar('is_composite', v)} />
        </div>
        {estado.is_composite && (
          <Link href="/app/inventario/recetas" className="self-start text-sm text-link hover:underline">
            {t('irRecetas')}
          </Link>
        )}
      </div>
    </div>
  );
}
