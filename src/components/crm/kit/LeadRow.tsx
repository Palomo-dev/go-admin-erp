'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, MessageSquare, Phone, Tags, UserPlus, TrendingUp, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  accionesLead,
  bandaScore,
  detalleContacto,
  diasSinContacto,
  etiquetasVisibles,
  origenValido,
  TONO_BANDA,
  type AccionLead,
  type LeadFila,
  type PermisosLead,
} from './leadRowLogica';

/**
 * Fila de la tabla de Leads (Figma `LeadRow` 759:444712): personas y empresas
 * con `lifecycle_stage='lead'`. Columnas: lead (avatar, nombre, correo ·
 * teléfono), origen, responsable, score, etiquetas, último contacto y
 * acciones («Calificar» → `QualifyLeadDialog` y menú «⋯»).
 *
 * Son filas `<tr>`: la pantalla pone `<table>`, `LeadRowEncabezado` en
 * `<thead>` y las filas (o `LeadRowCargando`) en `<tbody>`.
 */
const ICONO: Record<AccionLead, LucideIcon> = {
  ver: Eye,
  llamar: Phone,
  whatsapp: MessageSquare,
  asignar: UserPlus,
  etiquetar: Tags,
  descartar: XCircle,
};

const CELDA = 'px-3 py-2 align-middle';

export function LeadRowEncabezado({ casilla }: { casilla?: ReactNode }) {
  const t = useTranslations('crm.kit.leads.columnas');
  const th = 'h-11 whitespace-nowrap px-3 text-left text-xs font-medium text-fg-secondary';
  return (
    <tr className="border-b border-line bg-subtle">
      <th scope="col" className="w-11 pl-4 pr-0">
        {casilla ?? <span className="sr-only">{t('seleccion')}</span>}
      </th>
      <th scope="col" className={th}>{t('lead')}</th>
      <th scope="col" className={th}>{t('origen')}</th>
      <th scope="col" className={th}>{t('responsable')}</th>
      <th scope="col" className={th}>{t('score')}</th>
      <th scope="col" className={th}>{t('etiquetas')}</th>
      <th scope="col" className={th}>{t('ultimoContacto')}</th>
      <th scope="col" className={th}><span className="sr-only">{t('acciones')}</span></th>
    </tr>
  );
}

export function LeadRowCargando() {
  const barra = 'block h-3 animate-pulse rounded bg-line';
  return (
    <tr aria-hidden="true" className="border-b border-line bg-surface">
      <td className="w-11 pl-4 pr-0"><span className={cn(barra, 'w-4')} /></td>
      <td className={CELDA}>
        <span className="flex items-center gap-3">
          <span className="size-8 shrink-0 animate-pulse rounded-full bg-line" />
          <span className={cn(barra, 'h-3.5 w-52')} />
        </span>
      </td>
      {['w-24', 'w-28', 'w-14', 'w-24', 'w-20', 'w-24'].map((w, i) => (
        <td key={i} className={CELDA}><span className={cn(barra, w)} /></td>
      ))}
    </tr>
  );
}

export interface LeadRowProps {
  lead: LeadFila;
  seleccionada?: boolean;
  onSeleccionChange?: (seleccionada: boolean) => void;
  onCalificar?: (id: string) => void;
  onAccion?: (accion: AccionLead, id: string) => void;
  permisos?: PermisosLead;
  ahora?: Date;
}

export function LeadRow({ lead, seleccionada, onSeleccionChange, onCalificar, onAccion, permisos = {}, ahora = new Date() }: LeadRowProps) {
  const t = useTranslations('crm.kit.leads');
  const { timezone } = useFormatDate();
  const nombre = lead.full_name?.trim() || t('sinNombre');
  const origen = origenValido(lead.lead_source);
  const banda = bandaScore(lead.lead_score);
  const { visibles, resto } = etiquetasVisibles(lead.tags);
  const dias = diasSinContacto(lead, ahora, timezone);
  const acciones = accionesLead(lead, permisos).map((id) => ({
    id,
    etiqueta: t(`menu.${id}`),
    icono: ICONO[id],
    destructiva: id === 'descartar',
    onSelect: () => onAccion?.(id, lead.id),
  }));

  return (
    <tr aria-selected={seleccionada || undefined} className={cn('border-b border-line', seleccionada ? 'bg-brand-tint' : 'bg-surface hover:bg-hover')}>
      <td className="w-11 pl-4 pr-0">
        <Checkbox
          checked={!!seleccionada}
          onCheckedChange={(v) => onSeleccionChange?.(v === true)}
          aria-label={t('seleccionar', { nombre })}
          className="size-[18px] rounded"
        />
      </td>
      <td className={cn(CELDA, 'max-w-[292px]')}>
        <span className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={nombre} src={lead.avatar_url} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-fg">{nombre}</span>
            <span className="truncate text-xs font-medium text-fg-muted">{detalleContacto(lead) || t('sinContacto')}</span>
          </span>
        </span>
      </td>
      <td className={CELDA}>
        {origen ? <Badge tono="informacion" tamano="sm">{t(`origen.${origen}`)}</Badge> : <span className="text-[13px] text-fg-muted">—</span>}
      </td>
      <td className={CELDA}>
        {lead.responsable ? (
          <span className="flex min-w-0 items-center gap-2">
            <AvatarIniciales nombre={lead.responsable.nombre} src={lead.responsable.avatarUrl} />
            <span className="truncate text-[13px] text-fg-secondary">{lead.responsable.nombre}</span>
          </span>
        ) : (
          <span className="text-[13px] text-fg-muted">{t('sinResponsable')}</span>
        )}
      </td>
      <td className={CELDA}>
        {banda ? (
          <Badge tono={TONO_BANDA[banda]} tamano="sm">{t('score', { score: lead.lead_score ?? 0, banda: t(`banda.${banda}`) })}</Badge>
        ) : (
          <span className="text-[13px] text-fg-muted">—</span>
        )}
      </td>
      <td className={CELDA}>
        <span className="flex flex-wrap gap-1">
          {visibles.map((tag) => (
            <Badge key={tag} tono="neutro" apariencia="contorno" tamano="sm">{tag}</Badge>
          ))}
          {resto > 0 && <Badge tono="neutro" apariencia="contorno" tamano="sm" aria-label={t('masEtiquetas', { n: resto })}>+{resto}</Badge>}
        </span>
      </td>
      <td className={cn(CELDA, 'whitespace-nowrap text-[13px] text-fg-secondary')}>
        {dias === null ? t('nuncaContactado') : t('haceDias', { dias })}
      </td>
      <td className={CELDA}>
        <span className="flex items-center justify-end gap-1">
          {permisos.convertir !== false && (
            <button
              type="button"
              onClick={() => onCalificar?.(lead.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <TrendingUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('calificar')}
            </button>
          )}
          <RowActionsMenu acciones={acciones} titulo={nombre} />
        </span>
      </td>
    </tr>
  );
}
