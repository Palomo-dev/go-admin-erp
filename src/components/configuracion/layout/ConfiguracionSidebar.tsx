'use client';

/**
 * Menú de Configuración (Figma «10. Configuración unificada», ConfigNav):
 * solo los módulos con secciones visibles (el servidor ya quitó los que el plan
 * no tiene); el módulo abierto despliega sus secciones.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import type { ConfigModule } from '../config/configModulesRegistry';
import type { SeccionConfig } from '../config/configSectionsRegistry';

export interface ModuloMenu {
  modulo: ConfigModule;
  secciones: SeccionConfig[];
}

interface Props {
  modulos: readonly ModuloMenu[];
  moduloActivo: string | null;
  seccionActiva: string | null;
  onModulo: (moduloId: string) => void;
  onSeccion: (seccion: SeccionConfig) => void;
}

export function ConfiguracionSidebar({ modulos, moduloActivo, seccionActiva, onModulo, onSeccion }: Props) {
  const t = useTranslations('configuracionUnificada');
  return (
    <nav aria-label={t('menu.aria')} className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('menu.modulosPlan')}</p>
      <ul className="flex flex-col gap-0.5">
        {modulos.map(({ modulo, secciones }) => {
          const abierto = modulo.id === moduloActivo;
          const Icono = modulo.icon;
          const Chevron = abierto ? ChevronDown : ChevronRight;
          return (
            <li key={modulo.id}>
              <button
                type="button"
                onClick={() => onModulo(modulo.id)}
                aria-expanded={secciones.length > 1 ? abierto : undefined}
                aria-current={abierto && secciones.length <= 1 ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand',
                  abierto ? 'font-semibold text-fg' : 'text-fg-secondary',
                )}
              >
                <Icono aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(`modulos.${modulo.id}`)}</span>
                {secciones.length > 1 && <Chevron aria-hidden="true" className="size-3.5 shrink-0 text-fg-muted" />}
              </button>
              {abierto && secciones.length > 1 && (
                <ul aria-label={t('menu.secciones', { modulo: t(`modulos.${modulo.id}`) })} className="mt-0.5 flex flex-col gap-0.5">
                  {secciones.map((s) => {
                    const activa = s.id === seccionActiva;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => onSeccion(s)}
                          aria-current={activa ? 'page' : undefined}
                          className={cn(
                            'w-full rounded-lg py-1.5 pl-9 pr-3 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                            activa ? 'bg-brand-tint font-medium text-brand' : 'text-fg-secondary hover:bg-hover',
                          )}
                        >
                          {t(`secciones.${s.clave}.titulo`)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-3 pt-3 text-xs text-fg-muted">{t('menu.soloActivos')}</p>
    </nav>
  );
}
