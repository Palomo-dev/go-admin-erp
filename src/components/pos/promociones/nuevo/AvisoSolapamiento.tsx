'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export interface ConflictoSolape {
  id: string;
  name: string;
}

/**
 * Aviso en línea (no un toast) cuando otra promoción activa se pisa con esta
 * y ninguna de las dos es combinable. No bloquea el guardado.
 */
export function AvisoSolapamiento({ conflictos }: { conflictos: ConflictoSolape[] }) {
  const t = useTranslations('posPromociones.formulario');
  if (conflictos.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-line bg-subtle px-3 py-2 text-[13px] leading-5 text-fg">
      <p className="font-medium">{t('solapamientoTitulo')}</p>
      <p className="mt-1 text-fg-secondary">{t('solapamientoDetalle')}</p>
      <ul className="mt-2 space-y-1">
        {conflictos.map((c) => (
          <li key={c.id}>
            <Link href={`/app/pos/promociones/${c.id}`} className="font-medium text-brand underline">
              {t('solapamientoVer', { nombre: c.name })}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-fg-secondary">{t('solapamientoAccion')}</p>
    </div>
  );
}
