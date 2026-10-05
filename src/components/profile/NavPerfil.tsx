'use client';

/**
 * Navegación de «Mi perfil» (Figma 344:9281 escritorio, 348:12239 móvil):
 * lista de texto, una fila por sección, en el orden del diseño. La activa en
 * tinte de marca; «Eliminar cuenta» en rojo. Las marcas «Nuevo» del frame son
 * anotaciones de diseño (qué no existía en código), no se muestran.
 *
 * En móvil es la pantalla de entrada: filas de 48 px con chevron, y la
 * sección se abre con `?seccion=` en la URL (atrás vuelve a la lista).
 */
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { SECCIONES_PERFIL, type SeccionPerfil } from './perfilLogica';

export { SECCIONES_PERFIL, seccionPerfilDe, type SeccionPerfil } from './perfilLogica';

export function NavPerfil({ activa, onElegir }: { activa: SeccionPerfil | null; onElegir: (s: SeccionPerfil) => void }) {
  const t = useTranslations('perfil');
  return (
    <nav aria-label={t('navegacion')} className="rounded-xl border border-line bg-surface p-1 lg:p-2">
      <ul className="flex flex-col divide-y divide-line lg:gap-0.5 lg:divide-y-0">
        {SECCIONES_PERFIL.map((s) => {
          const esActiva = s === activa;
          const peligro = s === 'eliminar-cuenta';
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onElegir(s)}
                aria-current={esActiva ? 'page' : undefined}
                className={cn(
                  'flex h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand lg:h-10 lg:text-sm',
                  esActiva
                    ? 'lg:bg-brand-tint lg:font-semibold lg:text-brand-deep'
                    : '',
                  peligro ? 'text-danger-text hover:bg-danger-subtle' : esActiva ? 'text-fg' : 'text-fg lg:text-fg-secondary hover:bg-hover hover:text-fg',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t(`secciones.${s}`)}</span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-secondary lg:hidden" strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
