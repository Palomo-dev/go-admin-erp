'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardList, Minus, Plus } from 'lucide-react';
import { ChipsOpcion, KbdButton, SegmentedControl } from '@/components/kit';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/utils/Utils';
import type { NotaMesa, RitmoSalida } from './cuentaMesaLogica';

/**
 * Nota de la mesa (Figma `OrderNotePanel Contexto=mesa`, D6): comensales,
 * alergias de toda la mesa, instrucciones para cocina (van en cada comanda),
 * ritmo de salida y la nota para el recibo del cliente. Se guarda en la mesa
 * (`table_sessions.service_notes`) y viaja con la próxima ronda.
 */
const ALERGIAS_COMUNES = ['mani', 'lacteos', 'gluten', 'mariscos', 'huevo'] as const;

export interface NotaMesaPanelProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** La fila de la nota (ancla del panel). */
  ancla: ReactNode;
  mesaNombre: string;
  nota: NotaMesa;
  comensales: number;
  capacidad: number;
  /** Alergias marcadas en las líneas («Comensal 2 · maní»). */
  avisoLineas?: string | null;
  guardando?: boolean;
  onGuardar: (nota: NotaMesa, comensales: number) => void;
}

const CAMPO =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function NotaMesaPanel({
  abierto,
  onAbiertoChange,
  ancla,
  mesaNombre,
  nota,
  comensales,
  capacidad,
  avisoLineas,
  guardando,
  onGuardar,
}: NotaMesaPanelProps) {
  const t = useTranslations('posMesasFlujo.nota');
  const [borrador, setBorrador] = useState<NotaMesa>(nota);
  const [n, setN] = useState(comensales);
  const [otra, setOtra] = useState('');
  const [conOtra, setConOtra] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setBorrador(nota);
    setN(comensales);
    setOtra('');
    setConOtra(false);
  }, [abierto, nota, comensales]);

  const comunes = ALERGIAS_COMUNES.map((c) => t(`alergiasComunes.${c}`));
  const propias = borrador.alergias.filter((a) => !comunes.includes(a));
  const opciones = [...comunes, ...propias].map((a) => ({ valor: a, etiqueta: a }));

  const guardar = () => {
    const alergias = conOtra && otra.trim() ? [...borrador.alergias, otra.trim()] : borrador.alergias;
    onGuardar({ ...borrador, alergias }, n);
  };

  const avisoAlergia = avisoLineas || (borrador.alergias.length > 0 ? t('avisoAlergiaMesa', { alergias: borrador.alergias.join(', ').toLowerCase() }) : null);

  return (
    <Popover open={abierto} onOpenChange={onAbiertoChange}>
      <PopoverAnchor asChild>{ancla}</PopoverAnchor>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        className="flex w-[400px] max-w-[calc(100vw-24px)] flex-col gap-4 rounded-xl border-line bg-surface p-4 text-fg shadow-lg dark:border-line dark:bg-surface"
      >
        <div className="flex items-center gap-2">
          <ClipboardList aria-hidden="true" className="size-5 text-brand" strokeWidth={1.5} />
          <h3 className="text-base font-semibold text-fg">{t('titulo', { mesa: mesaNombre })}</h3>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-fg">{t('comensales')}</span>
          <div className="flex items-center gap-2" role="group" aria-label={t('comensales')}>
            <button
              type="button"
              onClick={() => setN((v) => Math.max(1, v - 1))}
              aria-label={t('menosComensales')}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-line-strong text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{n}</span>
            <button
              type="button"
              onClick={() => setN((v) => Math.min(Math.max(capacidad, 1) * 3, v + 1))}
              aria-label={t('masComensales')}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-line-strong text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px]">
            <span className="font-semibold text-fg">{t('alergias')}</span> <span className="text-fg-muted">{t('alergiasAyuda')}</span>
          </p>
          <ChipsOpcion
            multiple
            etiqueta={t('alergias')}
            opciones={[...opciones, { valor: '__otra', etiqueta: t('otra') }]}
            valor={conOtra ? [...borrador.alergias, '__otra'] : borrador.alergias}
            onValorChange={(v) => {
              setConOtra(v.includes('__otra'));
              setBorrador((b) => ({ ...b, alergias: v.filter((x) => x !== '__otra') }));
            }}
          />
          {conOtra && (
            <input
              type="text"
              value={otra}
              onChange={(e) => setOtra(e.target.value)}
              maxLength={40}
              placeholder={t('otraPlaceholder')}
              aria-label={t('otra')}
              className={CAMPO}
            />
          )}
          {avisoAlergia && <p className="text-[13px] text-danger-text">{avisoAlergia}</p>}
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-[13px]">
            <span className="font-semibold text-fg">{t('instrucciones')}</span> <span className="text-fg-muted">{t('instruccionesAyuda')}</span>
          </span>
          <textarea
            rows={2}
            maxLength={300}
            value={borrador.instrucciones}
            onChange={(e) => setBorrador((b) => ({ ...b, instrucciones: e.target.value }))}
            className={cn(CAMPO, 'resize-none')}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-fg">{t('ritmo')}</span>
          <SegmentedControl<RitmoSalida>
            etiqueta={t('ritmo')}
            className="flex w-full"
            valor={borrador.ritmo}
            onValorChange={(ritmo) => setBorrador((b) => ({ ...b, ritmo }))}
            opciones={[
              { valor: 'junto', etiqueta: t('ritmos.junto') },
              { valor: 'tiempos', etiqueta: t('ritmos.tiempos') },
              { valor: 'aviso', etiqueta: t('ritmos.aviso') },
            ]}
          />
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-[13px]">
            <span className="font-semibold text-fg">{t('notaCliente')}</span> <span className="text-fg-muted">{t('notaClienteAyuda')}</span>
          </span>
          <input
            type="text"
            maxLength={200}
            value={borrador.notaCliente}
            onChange={(e) => setBorrador((b) => ({ ...b, notaCliente: e.target.value }))}
            className={CAMPO}
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-fg-muted">{t('pie')}</p>
          <KbdButton variante="primario" tamano="md" onClick={guardar} cargando={guardando}>
            {t('guardar')}
          </KbdButton>
        </div>
      </PopoverContent>
    </Popover>
  );
}
