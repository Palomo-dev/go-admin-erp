'use client';

/**
 * GO Asistente — bienvenida con sugerencias de la página (Figma
 * `AsistenteBienvenida` 660:16014 + `AsistenteSugerencia` 660:16009,
 * pantalla 02 `667:34706`).
 *
 * El texto de bienvenida ya no es genérico: dice qué sabe hacer y la regla que
 * más confianza da («antes de guardar te muestro un resumen»). Las sugerencias
 * llegan del servidor según la pantalla (`suggestionsForPath`); el icono se
 * elige por lo que piden, no por posición.
 *
 * Mejora sobre el Figma: mientras llegan, tres filas de esqueleto del mismo
 * alto (sin salto de maquetación), y el encabezado dice la página real.
 *
 * Cada sugerencia va como en el Figma: Fondo de lienzo (el tinte azulado de
 * `bg-canvas`, no blanco), borde claro, radio 12 y 12 px de relleno; al pasar,
 * `bg-subtle`.
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet, FileText, Package, Settings, Sparkles, TrendingUp, UserPlus, MessageCircle } from 'lucide-react';
import { iconoSugerencia, type IconoSugerencia } from '@/lib/ai/assistant/panelUi';

const ICONOS: Record<IconoSugerencia, React.ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>> = {
  ventas: TrendingUp,
  inventario: Package,
  clientes: UserPlus,
  facturas: FileText,
  configuracion: Settings,
  archivo: FileSpreadsheet,
  general: MessageCircle,
};

export interface WelcomeViewProps {
  nombre: string;
  /** Página actual («Inicio», «Productos»…) o `null` si no se reconoce. */
  pagina: string | null;
  sugerencias: string[];
  cargando: boolean;
  deshabilitado?: boolean;
  onSugerencia(texto: string): void;
}

export default function WelcomeView({ nombre, pagina, sugerencias, cargando, deshabilitado, onSugerencia }: WelcomeViewProps) {
  const t = useTranslations('asistente.bienvenida');
  return (
    <div className="flex flex-col items-center px-1 pt-6 text-center">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint">
        <Sparkles className="h-8 w-8 text-brand" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-fg">{t('saludo', { nombre })}</h3>
      <p className="mb-6 text-sm leading-5 text-fg-secondary">{t('texto')}</p>

      <div className="w-full text-left">
        <p className="mb-2 text-xs font-semibold uppercase leading-4 text-fg-muted">
          {pagina ? t('sugerenciasPara', { pagina }) : t('sugerencias')}
        </p>
        {cargando && sugerencias.length === 0 ? (
          <ul className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[46px] animate-pulse rounded-xl border border-line bg-subtle motion-reduce:animate-none" />
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {sugerencias.map((s, i) => {
              const Icono = ICONOS[iconoSugerencia(s)];
              return (
                <li key={`${i}-${s}`}>
                  <button
                    type="button"
                    onClick={() => onSugerencia(s)}
                    disabled={deshabilitado}
                    className="flex min-h-[46px] w-full items-center gap-3 rounded-xl border border-line bg-canvas p-3 text-left text-sm leading-5 text-fg outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icono className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.5} aria-hidden="true" />
                    <span className="min-w-0 flex-1">{s}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
