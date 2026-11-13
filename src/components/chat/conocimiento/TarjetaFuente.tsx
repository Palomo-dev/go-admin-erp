'use client';

/**
 * Tarjeta de una fuente de conocimiento (Figma 91-chat-30): ícono, nombre,
 * menú, descripción, estado, cantidad de fragmentos y última actualización.
 * Toda la tarjeta abre la fuente.
 */
import { useTranslations } from 'next-intl';
import { BookOpen, Eye, Pencil, Power, Trash2 } from 'lucide-react';
import { RowActionsMenu } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { KnowledgeSource } from '@/lib/services/knowledgeService';

export interface TarjetaFuenteProps {
  fuente: KnowledgeSource;
  onAbrir: () => void;
  onEditar: () => void;
  onAlternar: () => void;
  onEliminar: () => void;
}

export function TarjetaFuente({ fuente, onAbrir, onEditar, onAlternar, onEliminar }: TarjetaFuenteProps) {
  const t = useTranslations('chatModulo.conocimiento');
  const { formatDate } = useFormatDate();
  return (
    <article className="relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-lg">
          {fuente.icon || <BookOpen className="size-4 text-fg-secondary" strokeWidth={1.5} />}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">
          {/* El enlace cubre la tarjeta; el menú queda por encima. */}
          <button type="button" onClick={onAbrir} className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand">
            {fuente.name}
          </button>
        </h3>
        <div className="relative z-10">
          <RowActionsMenu
            orientacion="horizontal"
            titulo={fuente.name}
            acciones={[
              { id: 'ver', etiqueta: t('fuentes.verFragmentos'), icono: Eye, onSelect: onAbrir },
              { id: 'editar', etiqueta: t('fuentes.editar'), icono: Pencil, onSelect: onEditar },
              { id: 'alternar', etiqueta: t(fuente.is_active ? 'fuentes.desactivar' : 'fuentes.activar'), icono: Power, onSelect: onAlternar },
              { id: 'eliminar', etiqueta: t('fuentes.eliminar'), icono: Trash2, onSelect: onEliminar, destructiva: true },
            ]}
          />
        </div>
      </div>
      <p className="line-clamp-2 min-h-[20px] text-[13px] leading-5 text-fg-secondary">{fuente.description || t('fuentes.sinDescripcion')}</p>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Badge tono={fuente.is_active ? 'exito' : 'neutro'} tamano="sm">
          {t(fuente.is_active ? 'estados.activa' : 'estados.inactiva')}
        </Badge>
        <span>{t('fuentes.fragmentos', { n: fuente.fragment_count ?? 0 })}</span>
        <span className="ml-auto">{t('fuentes.actualizada', { fecha: formatDate(fuente.updated_at) })}</span>
      </div>
    </article>
  );
}
