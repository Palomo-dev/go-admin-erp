'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Bot, Calendar, CheckCircle2, Copy, Globe, Mail, MessageSquare, Pencil, Phone, Receipt, StickyNote, Trash2, BedDouble, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge, clasesBadgeTono } from '@/components/ui/badge';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { cuandoEntrada, TONO_TIPO, type EntradaLinea, type TipoEntrada } from './timelineEntryLogica';

/**
 * Entrada de la línea de tiempo (Figma `TimelineEntry` 329:109173, sección
 * Clientes; el CRM añadió `reunión` y `llamada IA`): ícono por tipo, título,
 * detalle, «Hoy 10:24 · Ana Gómez» en la zona de la organización y badge de
 * estado. Menú «⋯» (Editar, Duplicar, Eliminar) solo si `editable`.
 */
const ICONO: Record<TipoEntrada, LucideIcon> = {
  venta: Receipt,
  reserva: BedDouble,
  pedido: Globe,
  llamada: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  nota: StickyNote,
  tarea: CheckCircle2,
  sistema: Settings,
  reunion: Calendar,
  llamadaIa: Bot,
};

export interface TimelineEntryProps {
  entrada: EntradaLinea;
  onAbrir?: (id: string) => void;
  onEditar?: (id: string) => void;
  onDuplicar?: (id: string) => void;
  onEliminar?: (id: string) => void;
  ahora?: Date;
  className?: string;
}

export function TimelineEntry({ entrada: e, onAbrir, onEditar, onDuplicar, onEliminar, ahora = new Date(), className }: TimelineEntryProps) {
  const t = useTranslations('crm.kit.linea');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const Icono = ICONO[e.tipo];
  const cuando = cuandoEntrada(e.ocurrioEn, ahora, timezone, idioma);
  const meta = [cuando ? t(`cuando.${cuando.clave}`, cuando.valores) : null, e.autor].filter(Boolean).join(' · ');
  const acciones = e.editable
    ? [
        ...(onEditar ? [{ id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => onEditar(e.id) }] : []),
        ...(onDuplicar ? [{ id: 'duplicar', etiqueta: t('duplicar'), icono: Copy, onSelect: () => onDuplicar(e.id) }] : []),
        ...(onEliminar ? [{ id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, destructiva: true, onSelect: () => onEliminar(e.id) }] : []),
      ]
    : [];

  return (
    <article aria-label={`${t(`tipo.${e.tipo}`)}: ${e.titulo}`} className={cn('flex items-start gap-3 rounded-xl border border-line bg-surface p-3', className)}>
      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', clasesBadgeTono(TONO_TIPO[e.tipo], 'suave', 'md'), 'p-0')}>
        <Icono className="size-4" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {onAbrir ? (
          <button type="button" onClick={() => onAbrir(e.id)} className="truncate text-left text-sm font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{e.titulo}</button>
        ) : (
          <span className="truncate text-sm font-medium text-fg">{e.titulo}</span>
        )}
        {e.detalle && <span className="truncate text-[13px] text-fg-secondary">{e.detalle}</span>}
        {meta && <span className="text-xs text-fg-muted">{meta}</span>}
      </div>
      {e.estado && <Badge tono={e.estado.tono} apariencia="contorno" tamano="sm">{e.estado.etiqueta}</Badge>}
      {acciones.length > 0 && <RowActionsMenu acciones={acciones} titulo={e.titulo} tamano="sm" />}
    </article>
  );
}
