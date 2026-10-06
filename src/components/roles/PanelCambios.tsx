'use client';

/**
 * «Cambios sin guardar» del editor de rol y de cargo (Figma «13. Equipo ›
 * Roles y permisos», «Editar rol: matriz, módulo y revisión»): en escritorio,
 * tarjeta lateral con cada cambio (↺ para deshacerlo), aviso de sensibles, a
 * quién afecta y los botones; en móvil, aviso arriba y barra fija abajo.
 */
import { useTranslations } from 'next-intl';
import { Minus, Plus, RotateCcw, TriangleAlert } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ResumenCambios } from '@/lib/roles/cambios';
import type { PersonaResumen } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';

export interface PanelCambiosProps {
  cambios: ResumenCambios;
  otrosCambios?: number;
  personas: readonly PersonaResumen[];
  onDeshacer: (id: number) => void;
  onRevisar: () => void;
  onDescartar: () => void;
  deshabilitado?: boolean;
  motivo?: string;
}

export function PanelCambios({ cambios, otrosCambios = 0, personas, onDeshacer, onRevisar, onDescartar, deshabilitado, motivo }: PanelCambiosProps) {
  const t = useTranslations('roles.editor');
  const total = cambios.total + otrosCambios;
  const lista = [...cambios.anadidos.map((p) => ({ p, tipo: 'anadido' as const })), ...cambios.quitados.map((p) => ({ p, tipo: 'quitado' as const }))];
  return (
    <section aria-label={t('cambiosSinGuardar')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">{t('cambiosSinGuardar')}</h2>
      {total === 0 ? (
        <p className="text-sm text-fg-secondary">{t('sinCambios')}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {lista.map(({ p, tipo }) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              {tipo === 'anadido' ? (
                <Plus aria-hidden="true" className="size-3.5 shrink-0 text-success" />
              ) : (
                <Minus aria-hidden="true" className="size-3.5 shrink-0 text-danger" />
              )}
              <span className="min-w-0 flex-1 truncate text-fg">{p.nombre}</span>
              <button
                type="button"
                onClick={() => onDeshacer(p.id)}
                aria-label={t('deshacer', { permiso: p.nombre })}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover"
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cambios.sensibles.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-xs text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('avisoSensibles', { n: cambios.sensibles.length })}
        </p>
      )}
      <div className="flex items-center gap-2">
        {personas.length > 0 && (
          <span className="flex -space-x-2">
            {personas.slice(0, 4).map((p) => (
              <AvatarIniciales key={p.id} nombre={p.nombre} tamano="sm" className="ring-2 ring-surface" />
            ))}
          </span>
        )}
        <span className="text-xs text-fg-secondary">{t('afecta', { n: personas.length })}</span>
      </div>
      <button
        type="button"
        onClick={onRevisar}
        disabled={total === 0 || deshabilitado}
        title={deshabilitado ? motivo : undefined}
        className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}
      >
        {total > 0 ? t('revisarGuardarN', { n: total }) : t('revisarGuardar')}
      </button>
      {total > 0 && (
        <button type="button" onClick={onDescartar} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}>
          {t('descartarCambios')}
        </button>
      )}
      {deshabilitado && motivo && <p className="text-xs text-fg-muted">{motivo}</p>}
    </section>
  );
}

/** Aviso amarillo de arriba en móvil: «3 cambios sin guardar · 1 sensible». */
export function AvisoCambiosMovil({ cambios, otrosCambios = 0, personas }: Pick<PanelCambiosProps, 'cambios' | 'otrosCambios' | 'personas'>) {
  const t = useTranslations('roles.editor');
  const total = cambios.total + otrosCambios;
  if (total === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-line-warning bg-warning-subtle p-3 text-warning-text lg:hidden">
      <p className="text-sm font-semibold">{t('bannerMovil', { n: total, sensibles: cambios.sensibles.length })}</p>
      <p className="text-xs">{t('afecta', { n: personas.length })}</p>
    </div>
  );
}

/** Barra fija del pie en móvil: «Descartar · Revisar y guardar (3)». */
export function BarraGuardarMovil({
  total,
  onRevisar,
  onDescartar,
  deshabilitado,
}: {
  total: number;
  onRevisar: () => void;
  onDescartar: () => void;
  deshabilitado?: boolean;
}) {
  const t = useTranslations('roles.editor');
  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 lg:hidden', total === 0 && 'hidden')}>
      <button type="button" onClick={onDescartar} className={clasesBoton({ variante: 'fantasma', tamano: 'lg' })}>
        {t('descartar')}
      </button>
      <button type="button" onClick={onRevisar} disabled={deshabilitado} className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}>
        {t('revisarGuardarN', { n: total })}
      </button>
    </div>
  );
}
