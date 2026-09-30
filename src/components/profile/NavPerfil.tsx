'use client';

/**
 * Navegación de «Mi perfil» (Figma 344:9281): lista de texto, una fila por
 * sección, en el orden del diseño. La activa en tinte de marca; «Eliminar
 * cuenta» en rojo. Las marcas «Nuevo» del frame son anotaciones de diseño
 * (qué no existía en código), no se muestran a la persona.
 *
 * En móvil es la pantalla de entrada (lista → sección con «Volver»): cada fila
 * lleva su chevron.
 */
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';

export const SECCIONES_PERFIL = [
  'datos-personales',
  'seguridad',
  'preferencias',
  'sesiones',
  'organizacion-roles',
  'notificaciones',
  'panel-vendedor',
  'eliminar-cuenta',
] as const;
export type SeccionPerfil = (typeof SECCIONES_PERFIL)[number];

/** Valor de `?seccion=` → sección conocida (con los ids antiguos como alias). */
export function seccionPerfilDe(valor: string | null | undefined): SeccionPerfil {
  if (valor === 'organizacion-default' || valor === 'roles') return 'organizacion-roles';
  return (SECCIONES_PERFIL as readonly string[]).includes(valor ?? '') ? (valor as SeccionPerfil) : 'datos-personales';
}

export function NavPerfil({ activa, onElegir }: { activa: SeccionPerfil; onElegir: (s: SeccionPerfil) => void }) {
  const t = useTranslations('perfil');
  return (
    <nav aria-label={t('navegacion')} className="rounded-xl border border-line bg-surface p-2">
      <ul className="flex flex-col gap-0.5">
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
                  'flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                  esActiva ? 'bg-brand-tint font-medium text-brand-deep' : peligro ? 'text-danger-text hover:bg-danger-subtle' : 'text-fg-secondary hover:bg-hover hover:text-fg'
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t(`secciones.${s}`)}</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted lg:hidden" strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
