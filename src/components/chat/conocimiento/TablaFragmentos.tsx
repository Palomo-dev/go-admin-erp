'use client';

/**
 * Tabla de fragmentos (Figma 91-chat-31): título con resumen del contenido,
 * etiquetas, estado, si la IA ya lo puede usar, veces usado y fecha. Se usa
 * en «Todos los fragmentos» (con la columna Fuente) y en el detalle de una
 * fuente.
 */
import { useTranslations } from 'next-intl';
import { ExternalLink, Pencil, Power, Trash2 } from 'lucide-react';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { KnowledgeFragment } from '@/lib/services/knowledgeService';

export interface TablaFragmentosProps {
  fragmentos: readonly KnowledgeFragment[];
  estado: EstadoTabla;
  conFuente?: boolean;
  termino?: string;
  onAbrir: (f: KnowledgeFragment) => void;
  onEditar?: (f: KnowledgeFragment) => void;
  onAlternar?: (f: KnowledgeFragment) => void;
  onEliminar: (f: KnowledgeFragment) => void;
  onLimpiarFiltros?: () => void;
  onReintentar?: () => void;
  vacio?: { titulo: string; descripcion?: string; accion?: { etiqueta: string; onClick: () => void } };
}

export function TablaFragmentos({ fragmentos, estado, conFuente, termino, onAbrir, onEditar, onAlternar, onEliminar, onLimpiarFiltros, onReintentar, vacio }: TablaFragmentosProps) {
  const t = useTranslations('chatModulo.conocimiento');
  const { formatDate } = useFormatDate();

  const etiquetas = (f: KnowledgeFragment) => (
    <div className="flex flex-wrap gap-1">
      {(f.tags ?? []).slice(0, 3).map((e) => (
        <Badge key={e} tono="neutro" tamano="sm">
          {e}
        </Badge>
      ))}
      {(f.tags?.length ?? 0) > 3 && <span className="text-xs text-fg-muted">+{(f.tags?.length ?? 0) - 3}</span>}
    </div>
  );

  const columnas: ColumnaTabla<KnowledgeFragment>[] = [
    {
      id: 'fragmento',
      encabezado: t('tabla.fragmento'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{f.title}</p>
          <p className="truncate text-xs text-fg-muted">{f.content}</p>
        </div>
      ),
    },
    ...(conFuente
      ? [{ id: 'fuente', encabezado: t('tabla.fuente'), ancho: 180, ocultarDebajo: 'lg' as const, celda: (f: KnowledgeFragment) => <span className="truncate text-sm text-fg-secondary">{f.source?.name ?? '—'}</span> }]
      : []),
    { id: 'etiquetas', encabezado: t('tabla.etiquetas'), ancho: 200, ocultarDebajo: 'md', celda: etiquetas },
    {
      id: 'estado',
      encabezado: t('tabla.estado'),
      ancho: 110,
      celda: (f) => (
        <Badge tono={f.is_active ? 'exito' : 'neutro'} tamano="sm">
          {t(f.is_active ? 'estados.activo' : 'estados.inactivo')}
        </Badge>
      ),
    },
    {
      id: 'ia',
      encabezado: t('tabla.paraIa'),
      ancho: 120,
      ocultarDebajo: 'sm',
      celda: (f) => (
        <Badge tono={f.has_embedding ? (f.is_active ? 'exito' : 'neutro') : 'advertencia'} tamano="sm">
          {t(f.has_embedding ? 'estados.listo' : 'estados.pendiente')}
        </Badge>
      ),
    },
    { id: 'usado', encabezado: t('tabla.usado'), variante: 'importe', ancho: 80, ocultarDebajo: 'lg', celda: (f) => (f.usage_count ?? 0).toLocaleString() },
    { id: 'actualizado', encabezado: t('tabla.actualizado'), ancho: 120, ocultarDebajo: 'lg', celda: (f) => <span className="text-sm text-fg-secondary">{formatDate(f.updated_at)}</span> },
  ];

  return (
    <DataTable<KnowledgeFragment>
      etiqueta={t('tabla.etiqueta')}
      columnas={columnas}
      filas={fragmentos}
      obtenerId={(f) => f.id}
      estado={estado}
      termino={termino}
      onFilaClick={onAbrir}
      etiquetaFila={(f) => f.title}
      onLimpiarFiltros={onLimpiarFiltros}
      onReintentar={onReintentar}
      vacio={vacio}
      acciones={(f) => [
        { id: 'abrir', etiqueta: t('tabla.abrir'), icono: ExternalLink, onSelect: () => onAbrir(f) },
        { id: 'editar', etiqueta: t('tabla.editarRapido'), icono: Pencil, onSelect: () => onEditar?.(f), oculta: !onEditar },
        { id: 'alternar', etiqueta: t(f.is_active ? 'tabla.desactivar' : 'tabla.activar'), icono: Power, onSelect: () => onAlternar?.(f), oculta: !onAlternar },
        { id: 'eliminar', etiqueta: t('tabla.eliminar'), icono: Trash2, onSelect: () => onEliminar(f), destructiva: true },
      ]}
      tarjetaMovil={(f) => (
        <button type="button" onClick={() => onAbrir(f)} className="flex w-full flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-left">
          <span className="text-sm font-medium text-fg">{f.title}</span>
          <span className="line-clamp-2 text-xs text-fg-muted">{f.content}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tono={f.is_active ? 'exito' : 'neutro'} tamano="sm">
              {t(f.is_active ? 'estados.activo' : 'estados.inactivo')}
            </Badge>
            <Badge tono={f.has_embedding ? 'exito' : 'advertencia'} tamano="sm">
              {t(f.has_embedding ? 'estados.listo' : 'estados.pendiente')}
            </Badge>
          </span>
        </button>
      )}
    />
  );
}
