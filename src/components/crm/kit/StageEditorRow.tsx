'use client';

import type { HTMLAttributes, KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardCheck, Ellipsis, GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CLASE_CAMPO } from './camposCrm';
import { SelectCrm } from './SelectCrm';
import { conResultado, contarRequisitos, enteroDeCampo, resultadoDe, type EtapaEditable, type ErrorEtapa, type ResultadoEtapa } from './stageEditorRowLogica';

/**
 * Fila editable de una etapa (Figma `StageEditorRow` 798:24970): asa de
 * arrastre, color, nombre, probabilidad, SLA en días, resultado (abierta ·
 * ganada · perdida) y requisitos. Estado `error`: nombre vacío o repetido
 * (lo calcula `validarEtapas` sobre la lista entera). En móvil la fila se
 * apila y requisitos y eliminar pasan al menú «⋯» (`onMenu`).
 *
 * Teclado: con el foco en el asa, Alt+↑/↓ mueve la etapa (`onMover`).
 */
export interface StageEditorRowProps {
  etapa: EtapaEditable;
  onCambiar: (etapa: EtapaEditable) => void;
  error?: ErrorEtapa | null;
  arrastrando?: boolean;
  propsAsa?: HTMLAttributes<HTMLButtonElement>;
  onMover?: (direccion: -1 | 1) => void;
  onRequisitos?: () => void;
  onEliminar?: () => void;
  /** Menú «⋯» del móvil (requisitos y eliminar). */
  onMenu?: () => void;
  /** Colores elegibles (los de las plantillas o los de la organización). */
  colores: readonly string[];
  deshabilitada?: boolean;
}

const RESULTADOS: readonly ResultadoEtapa[] = ['abierta', 'ganada', 'perdida'];

export function StageEditorRow({ etapa, onCambiar, error, arrastrando, propsAsa, onMover, onRequisitos, onEliminar, onMenu, colores, deshabilitada }: StageEditorRowProps) {
  const t = useTranslations('crm.kit.editorEtapa');
  const resultado = resultadoDe(etapa);
  const cerrada = resultado !== 'abierta';
  const requisitos = contarRequisitos(etapa.exit_criteria);
  const idError = `etapa-${etapa.clave}-error`;
  const cambiar = (p: Partial<EtapaEditable>) => onCambiar({ ...etapa, ...p });
  const teclaAsa = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey || !onMover) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); onMover(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onMover(1); }
  };
  const num = 'h-10 w-full rounded-lg border border-line-strong bg-surface pl-3 pr-10 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:bg-subtle disabled:text-fg-secondary';

  return (
    <div
      role="group"
      aria-label={t('aria', { nombre: etapa.name || t('sinNombre') })}
      data-resultado={resultado}
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-surface p-2 lg:flex-row lg:items-center',
        error ? 'border-line-danger' : 'border-line',
        arrastrando && 'shadow-lg ring-2 ring-brand',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button type="button" {...propsAsa} onKeyDown={teclaAsa} aria-label={t('mover', { nombre: etapa.name || t('sinNombre') })} className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-fg-muted hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        <SelectCrm
          aria-label={t('color')}
          valor={etapa.color}
          disabled={deshabilitada}
          onValorChange={(color) => cambiar({ color })}
          opciones={colores.map((c) => ({ valor: c, etiqueta: c, estilo: { backgroundColor: c } }))}
          className="w-14 shrink-0 px-1 text-transparent"
          style={{ backgroundColor: etapa.color || undefined }}
        />
        <input
          aria-label={t('nombre')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          value={etapa.name}
          disabled={deshabilitada}
          maxLength={80}
          placeholder={t('nombrePlaceholder')}
          onChange={(e) => cambiar({ name: e.target.value })}
          className={cn(CLASE_CAMPO, 'min-w-0 flex-1')}
        />
        {onMenu && (
          <button type="button" aria-label={t('menu')} onClick={onMenu} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover lg:hidden">
            <Ellipsis aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative w-20 shrink-0">
          <span className="sr-only">{t('probabilidad')}</span>
          <input inputMode="numeric" value={etapa.probability ?? ''} disabled={deshabilitada || cerrada} onChange={(e) => cambiar({ probability: enteroDeCampo(e.target.value) })} className={num} />
          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">%</span>
        </label>
        <label className="relative w-24 shrink-0">
          <span className="sr-only">{t('sla')}</span>
          <input inputMode="numeric" value={cerrada ? '' : etapa.sla_days ?? ''} placeholder={cerrada ? '—' : ''} disabled={deshabilitada || cerrada} onChange={(e) => cambiar({ sla_days: enteroDeCampo(e.target.value) })} className={num} />
          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">{t('dias')}</span>
        </label>
        <SelectCrm
          aria-label={t('resultado')}
          valor={resultado}
          disabled={deshabilitada}
          onValorChange={(r) => onCambiar(conResultado(etapa, r as ResultadoEtapa))}
          opciones={RESULTADOS.map((r) => ({ valor: r, etiqueta: t(`resultados.${r}`) }))}
          className="w-32 shrink-0"
        />
        {onRequisitos && (
          <button type="button" onClick={onRequisitos} className="hidden h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] text-fg-secondary hover:bg-hover lg:inline-flex">
            <ClipboardCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {requisitos ? t('requisitosN', { n: requisitos }) : t('requisitos')}
          </button>
        )}
        {onEliminar && (
          <button type="button" aria-label={t('eliminar', { nombre: etapa.name || t('sinNombre') })} onClick={onEliminar} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text lg:flex">
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
      {error && <p id={idError} role="alert" className="text-xs text-danger-text lg:basis-full">{t(`error.${error}`)}</p>}
    </div>
  );
}
