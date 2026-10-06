'use client';

/**
 * Configuración en móvil 390 (Figma B/12-03): una fila por sección con icono,
 * título y resumen dinámico; «Zona de peligro» en rojo. Tocar una fila abre la
 * sección sola (la misma sección que en escritorio, sin copias).
 */
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { ResumenSeccion, SeccionConfiguracion } from '@/lib/website/configuracionSitio';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONOS_SECCION_CONFIGURACION, ICONO_ESTADO_LEGAL, claseColorIconoSeccion } from './iconosSecciones';
import type { TraductorConfiguracion } from './textos';

export function ListaSeccionesMovil({
  t,
  resumenes,
  onAbrir,
  textoIdioma,
}: {
  t: TraductorConfiguracion;
  resumenes: ResumenSeccion[];
  onAbrir: (s: SeccionConfiguracion) => void;
  /** «Español (Colombia) · COP»: lo arma la página con los nombres traducidos. */
  textoIdioma: string;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {resumenes.map((r) => {
        const Icono = ICONOS_SECCION_CONFIGURACION[r.seccion];
        const peligro = r.seccion === 'peligro';
        const resumen = r.seccion === 'idioma' ? textoIdioma : t(r.clave, r.valores);
        return (
          <li key={r.seccion}>
            <button
              type="button"
              onClick={() => onAbrir(r.seccion)}
              data-seccion={r.seccion}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
              <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.fila, 'shrink-0', claseColorIconoSeccion(r.seccion))} strokeWidth={TRAZO_ICONO} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-sm font-medium leading-5', peligro ? 'text-danger-text' : 'text-fg')}>{t(`secciones.${r.seccion}`)}</span>
                <span className="truncate text-xs leading-4 text-fg-secondary">{resumen}</span>
              </span>
              {r.falta && <StatusBadge tamano="sm" estado="falta" icono={ICONO_ESTADO_LEGAL.falta} etiqueta={t('legales.falta')} />}
              <ChevronRight aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-muted')} strokeWidth={TRAZO_ICONO} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
