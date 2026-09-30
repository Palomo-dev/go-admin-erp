'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Copy, Eye, ListPlus, Pencil, RefreshCw, Trash2, Trophy, XCircle, type LucideIcon } from 'lucide-react';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import type { AccionFila } from '@/components/kit/acciones';
import {
  accionesMenuOportunidad,
  esDestructiva,
  estadoMenuDe,
  type AccionMenuOportunidad,
  type PermisosOportunidad,
} from './opportunityRowMenuLogica';

/**
 * Menú «⋯» de oportunidad (Figma `OpportunityRowMenu` 759:21624) sobre el
 * `RowActionsMenu` del kit: un ícono por acción, Eliminar separado y en rojo
 * (la pantalla lo confirma con `ConfirmDialog`), y en móvil la misma lista en
 * hoja inferior. El mismo menú en tabla, tarjeta, drawer y detalle.
 */
const ICONO: Record<AccionMenuOportunidad, LucideIcon> = {
  ver: Eye,
  editar: Pencil,
  mover: ArrowLeftRight,
  ganar: Trophy,
  perder: XCircle,
  reabrir: RefreshCw,
  duplicar: Copy,
  nuevaTarea: ListPlus,
  eliminar: Trash2,
};

export interface OpportunityRowMenuProps {
  /** Nombre de la oportunidad: título de la hoja móvil y nombre accesible. */
  titulo: string;
  /** `opportunities.status`. */
  status: string | null | undefined;
  permisos?: PermisosOportunidad;
  onAccion: (accion: AccionMenuOportunidad) => void;
  orientacion?: 'vertical' | 'horizontal';
  tamano?: 'sm' | 'md';
  className?: string;
}

export function OpportunityRowMenu({ titulo, status, permisos, onAccion, orientacion, tamano, className }: OpportunityRowMenuProps) {
  const t = useTranslations('crm.kit.menuOportunidad');
  const acciones: AccionFila[] = accionesMenuOportunidad(estadoMenuDe(status), permisos).map((id) => ({
    id,
    etiqueta: t(id),
    icono: ICONO[id],
    destructiva: esDestructiva(id),
    onSelect: () => onAccion(id),
  }));
  return (
    <RowActionsMenu
      acciones={acciones}
      titulo={titulo}
      orientacion={orientacion}
      tamano={tamano}
      className={className}
    />
  );
}
