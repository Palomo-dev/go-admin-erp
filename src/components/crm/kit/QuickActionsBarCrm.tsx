'use client';

import { useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { QuickAction } from './QuickAction';
import {
  accionExtraDeVariante,
  ACCIONES_RAPIDAS,
  formatoDeVariante,
  indiceConTecla,
  type AccionRapidaCrm,
  type EstadoAccionRapida,
  type VarianteBarraAcciones,
} from './quickActionLogica';

/**
 * Barra de acciones rápidas del CRM (Figma `QuickActionsBar (CRM)` 759:21433):
 *
 * - `tarjeta`: 6 íconos, **siempre visibles** (pedido del dueño del
 *   2026-09-24: antes aparecían solo con hover);
 * - `drawer`: 6 botones con texto;
 * - `detalle`: 6 botones + «Propuesta»;
 * - `cliente`: 6 botones + «Nueva oportunidad» (abre `OpportunityForm
 *   Origen=cliente`);
 * - `tarjetaMovil`: 6 íconos con área táctil de 44 × 40.
 *
 * Es solo presentación: qué hace cada acción lo decide la pantalla con
 * `onAccion` (los diálogos y el evento `crm:entity-changed` son de la ola 3A).
 * Los clics no llegan a la tarjeta ni inician el arrastre. Teclado: una sola
 * parada de tabulación y flechas para recorrer (patrón `toolbar`).
 */
export interface QuickActionsBarCrmProps {
  variante: VarianteBarraAcciones;
  /** De `estadoAccionesRapidas`; sin él, todas habilitadas. */
  estados?: readonly EstadoAccionRapida[];
  onAccion?: (accion: AccionRapidaCrm) => void;
  /** Acción en curso (spinner en su botón). */
  enCurso?: AccionRapidaCrm | null;
  onPropuesta?: () => void;
  onNuevaOportunidad?: () => void;
  /** Sin permiso de crear oportunidad: el botón no se pinta. */
  puedeCrearOportunidad?: boolean;
  className?: string;
}

const detener = (e: SyntheticEvent) => e.stopPropagation();

export function QuickActionsBarCrm({
  variante,
  estados,
  onAccion,
  enCurso,
  onPropuesta,
  onNuevaOportunidad,
  puedeCrearOportunidad = true,
  className,
}: QuickActionsBarCrmProps) {
  const t = useTranslations('crm.kit.acciones');
  const raiz = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);
  const lista: readonly EstadoAccionRapida[] = estados ?? ACCIONES_RAPIDAS.map((accion) => ({ accion, habilitada: true }));
  const formato = formatoDeVariante(variante);
  const extra = accionExtraDeVariante(variante);
  const conIconos = formato === 'icono';

  const teclear = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const botones = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const actual = botones.findIndex((b) => b === document.activeElement);
    const siguiente = indiceConTecla(e.key, actual < 0 ? activo : actual, botones.length);
    if (siguiente === null) return;
    e.preventDefault();
    setActivo(siguiente);
    botones[siguiente]?.focus();
  };

  return (
    <div
      ref={raiz}
      role="toolbar"
      aria-label={t('barra')}
      data-variante={variante}
      onClick={detener}
      onPointerDown={detener}
      onMouseDown={detener}
      onKeyDown={teclear}
      className={cn(
        'flex items-center',
        conIconos ? 'justify-between rounded-lg bg-subtle' : 'flex-wrap gap-2',
        className,
      )}
    >
      {lista.map((e, i) => (
        <QuickAction
          key={e.accion}
          accion={e.accion}
          formato={formato}
          habilitada={e.habilitada}
          motivo={e.motivo}
          cargando={enCurso === e.accion}
          onClick={onAccion}
          tactil={variante === 'tarjetaMovil'}
          tabIndex={i === activo ? 0 : -1}
        />
      ))}
      {extra === 'propuesta' && (
        <button
          type="button"
          tabIndex={lista.length === activo ? 0 : -1}
          onClick={onPropuesta}
          className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('propuesta')}
        </button>
      )}
      {extra === 'nuevaOportunidad' && puedeCrearOportunidad && (
        <button
          type="button"
          tabIndex={lista.length === activo ? 0 : -1}
          onClick={onNuevaOportunidad}
          className="inline-flex h-8 items-center gap-2 rounded-lg bg-brand-action px-3 text-xs font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('nuevaOportunidad')}
        </button>
      )}
    </div>
  );
}
