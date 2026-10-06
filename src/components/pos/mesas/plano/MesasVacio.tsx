'use client';

import { useTranslations } from 'next-intl';
import { Box, Copy, Plus } from 'lucide-react';
import { KbdButton } from '@/components/kit';

/**
 * Sede sin mesas (Figma 870:105746 «Arma tu salón»): crear zona, agregar mesas
 * en lote y los tres pasos (zona, mesas, plano).
 */
export function MesasVacio({ onCrearZona, onLote }: { onCrearZona: () => void; onLote: () => void }) {
  const t = useTranslations('posMesasPlano.vacio');
  const pasos = [1, 2, 3] as const;
  return (
    <section className="flex flex-col items-center gap-6 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand">
        <Box className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
        <p className="text-sm text-fg-secondary">{t('descripcion')}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <KbdButton variante="primario" tamano="md" icono={Plus} onClick={onCrearZona}>
          {t('crearZona')}
        </KbdButton>
        <KbdButton variante="secundario" tamano="md" icono={Copy} onClick={onLote}>
          {t('lote')}
        </KbdButton>
      </div>
      <ol className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {pasos.map((n) => (
          <li key={n} className="flex flex-col gap-1 rounded-lg bg-subtle p-4 text-left">
            <span className="text-xs font-semibold text-brand">{n}</span>
            <span className="text-sm font-semibold text-fg">{t(`paso${n}.titulo`)}</span>
            <span className="text-[13px] text-fg-secondary">{t(`paso${n}.detalle`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
