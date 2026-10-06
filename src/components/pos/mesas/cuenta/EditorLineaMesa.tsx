'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChefHat, TriangleAlert, UserRound, UsersRound } from 'lucide-react';
import { ChipsOpcion, KbdButton } from '@/components/kit';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/utils/Utils';
import type { LineaMesa } from './cuentaMesaLogica';

/**
 * Nota, alergia y comensal de una línea (Figma T3, `Comensal` Nuevo 1073:667312,
 * `LineNote Destino=cocina/alergia`): para quién va («General» o C1…Cn), notas
 * rápidas de un toque (`pos_quick_notes`), nota libre y la casilla de alergia
 * (la cocina la confirma antes de empezar). Muestra cómo queda en la comanda.
 */
export interface CambioEditorLinea {
  comensal: number | null;
  notaCocina: string;
  alergia: boolean;
}

export interface EditorLineaMesaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ancla: ReactNode;
  linea: LineaMesa | null;
  comensales: number;
  /** Notas rápidas de cocina de la sede (`useNotasRapidas`). */
  notasRapidas: Array<{ texto: string; alergia: boolean }>;
  /** Solo comensal (la línea ya está en cocina: la nota no cambia sin ajuste). */
  soloComensal?: boolean;
  /** Alergias de la nota de la mesa: si la línea es «alergia», la comanda lleva estas (Figma T3: «Alergia: maní (C2)»). */
  alergiasMesa?: string[];
  guardando?: boolean;
  onGuardar: (cambio: CambioEditorLinea) => void;
}

/** Chip de comensal (Figma `Comensal`: Tipo=numero/general × Estado=default/seleccionado). */
export function ChipComensal({ etiqueta, general, seleccionado, onClick }: { etiqueta: string; general?: boolean; seleccionado: boolean; onClick: () => void }) {
  const Icono = general ? UsersRound : UserRound;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionado}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        seleccionado ? 'border-line-brand bg-brand-tint text-brand' : 'border-line-strong bg-surface text-fg hover:bg-hover',
      )}
    >
      <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {etiqueta}
    </button>
  );
}

export function EditorLineaMesa({
  abierto,
  onAbiertoChange,
  ancla,
  linea,
  comensales,
  notasRapidas,
  soloComensal,
  alergiasMesa = [],
  guardando,
  onGuardar,
}: EditorLineaMesaProps) {
  const t = useTranslations('posMesasFlujo.editorLinea');
  const [comensal, setComensal] = useState<number | null>(null);
  const [rapidas, setRapidas] = useState<string[]>([]);
  const [libre, setLibre] = useState('');
  const [alergia, setAlergia] = useState(false);

  const textosRapidos = useMemo(() => notasRapidas.map((n) => n.texto), [notasRapidas]);

  useEffect(() => {
    if (!abierto || !linea) return;
    setComensal(linea.comensal);
    const partes = (linea.notaCocina ?? '').split(/\s*,\s*/).filter(Boolean);
    setRapidas(partes.filter((p) => textosRapidos.some((r) => r.toLowerCase() === p.toLowerCase())));
    setLibre(partes.filter((p) => !textosRapidos.some((r) => r.toLowerCase() === p.toLowerCase())).join(', '));
    setAlergia(linea.alergia);
  }, [abierto, linea, textosRapidos]);

  const nota = [...rapidas, libre.trim()].filter(Boolean).join(', ');
  const n = Math.max(1, comensales);
  const textoAlergia = alergiasMesa.length > 0 ? alergiasMesa.join(', ') : nota;

  return (
    <Popover open={abierto} onOpenChange={onAbiertoChange}>
      <PopoverAnchor asChild>{ancla}</PopoverAnchor>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        className="flex w-[380px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-xl border-line bg-surface p-5 text-fg shadow-lg dark:border-line dark:bg-surface"
      >
        <h3 className="text-base font-semibold text-fg">{t('titulo', { producto: linea?.nombre ?? '' })}</h3>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-fg-secondary">{t('paraQuien')}</span>
          <div role="radiogroup" aria-label={t('paraQuien')} className="flex flex-wrap gap-2">
            <ChipComensal general etiqueta={t('general')} seleccionado={comensal === null} onClick={() => setComensal(null)} />
            {Array.from({ length: n }, (_, i) => i + 1).map((c) => (
              <ChipComensal key={c} etiqueta={t('comensalCorto', { n: c })} seleccionado={comensal === c} onClick={() => setComensal(c)} />
            ))}
          </div>
        </div>

        {!soloComensal && (
          <>
            {textosRapidos.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-fg-secondary">{t('notasRapidas')}</span>
                <ChipsOpcion
                  multiple
                  etiqueta={t('notasRapidas')}
                  opciones={textosRapidos.map((r) => ({ valor: r, etiqueta: r }))}
                  valor={rapidas}
                  onValorChange={(v) => {
                    setRapidas(v);
                    if (v.some((x) => notasRapidas.find((r) => r.texto === x)?.alergia)) setAlergia(true);
                  }}
                />
              </div>
            )}
            <input
              type="text"
              value={libre}
              maxLength={140}
              onChange={(e) => setLibre(e.target.value)}
              placeholder={t('notaLibre')}
              aria-label={t('notaLibre')}
              className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-fg-secondary">{t('asiQueda')}</span>
              <p className={cn('flex items-center gap-2 rounded-md bg-subtle px-2 py-1.5 text-[13px] text-fg-secondary', !nota && 'text-fg-muted')}>
                <ChefHat aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                {nota ? t('cocina', { nota: nota.toLowerCase() }) : t('sinNota')}
              </p>
              {alergia && textoAlergia && (
                <p className="flex items-center gap-2 rounded-md bg-danger-subtle px-2 py-1.5 text-[13px] font-medium text-danger-text">
                  <TriangleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
                  {t('alergiaLinea', { nota: textoAlergia.toLowerCase(), comensal: comensal ? ` (${t('comensalCorto', { n: comensal })})` : '' })}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={alergia}
                onChange={(e) => setAlergia(e.target.checked)}
                className="size-4 rounded accent-brand-action"
              />
              {t('esAlergia')}
            </label>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <KbdButton variante="fantasma" tamano="md" onClick={() => onAbiertoChange(false)}>
            {t('cancelar')}
          </KbdButton>
          <KbdButton
            variante="primario"
            tamano="md"
            cargando={guardando}
            onClick={() => onGuardar({ comensal, notaCocina: nota, alergia: alergia && !!textoAlergia })}
          >
            {t('guardar')}
          </KbdButton>
        </div>
      </PopoverContent>
    </Popover>
  );
}
