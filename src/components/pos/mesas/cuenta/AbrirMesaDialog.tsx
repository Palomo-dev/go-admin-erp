'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { KbdButton } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { DialogoMesa } from './DialogoMesa';
import type { OpcionMesero } from './cuentaMesaService';

/**
 * Abrir la mesa (Figma D1 escritorio y T1 tableta): la reserva que llega (se
 * sienta en la misma acción), comensales 1–6 u «Otro», mesero (quien abre por
 * defecto) y, en escritorio, el cliente opcional. Una sola llamada:
 * `pos_mesa_abrir` (con la reserva reutiliza `pos_reserva_sentar`).
 */
export interface ReservaQueLlega {
  id: string;
  nombre: string;
  hora: string;
  personas: number;
  /** «Llegó a la hora», «Llega en 10 min», «Va 15 min tarde». */
  llegada: string;
}

export interface DatosAbrirDialogo {
  comensales: number;
  meseroId: string | null;
  sentarReserva: boolean;
}

export interface AbrirMesaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesa: string;
  zona: string | null;
  capacidad: number;
  reserva?: ReservaQueLlega | null;
  onVerReserva?: () => void;
  meseros: OpcionMesero[];
  /** Quien abre la mesa (va primero y marcado «(tú)»). */
  usuarioId: string | null;
  /** Campo del cliente (`CustomerSelector` con disparador de campo); sin él no se muestra (tableta). */
  campoCliente?: ReactNode;
  /** Tableta: botones de 48 px y «Abrir mesa». */
  tableta?: boolean;
  abriendo?: boolean;
  onAbrir: (datos: DatosAbrirDialogo) => void;
}

const COMENSALES = [1, 2, 3, 4, 5, 6] as const;

export function AbrirMesaDialog({
  abierto,
  onAbiertoChange,
  mesa,
  zona,
  capacidad,
  reserva,
  onVerReserva,
  meseros,
  usuarioId,
  campoCliente,
  tableta,
  abriendo,
  onAbrir,
}: AbrirMesaDialogProps) {
  const t = useTranslations('posMesasFlujo.abrir');
  const [comensales, setComensales] = useState<number>(2);
  const [otro, setOtro] = useState(false);
  const [mesero, setMesero] = useState<string | null>(usuarioId);
  const [sentar, setSentar] = useState(true);

  useEffect(() => {
    if (!abierto) return;
    const inicial = reserva?.personas ?? Math.min(2, Math.max(1, capacidad || 2));
    setComensales(inicial);
    setOtro(inicial > 6);
    setMesero(usuarioId);
    setSentar(true);
  }, [abierto, reserva, capacidad, usuarioId]);

  const titulo = zona ? t('tituloZona', { mesa, zona }) : t('titulo', { mesa });
  const listaMeseros = [...meseros].sort((a, b) => (a.id === usuarioId ? -1 : b.id === usuarioId ? 1 : 0));

  return (
    <DialogoMesa
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      textoCerrar={t('cerrar')}
      ocupado={abriendo}
      ancho={560}
      pie={
        <>
          <KbdButton variante="fantasma" tamano={tableta ? 'lg' : 'md'} onClick={() => onAbiertoChange(false)} disabled={abriendo}>
            {t('cancelar')}
          </KbdButton>
          <KbdButton
            variante="primario"
            tamano={tableta ? 'lg' : 'md'}
            cargando={abriendo}
            disabled={!comensales || comensales < 1}
            onClick={() => onAbrir({ comensales, meseroId: mesero, sentarReserva: !!reserva && sentar })}
          >
            {tableta ? t('abrir') : t('abrirYTomar')}
          </KbdButton>
        </>
      }
    >
      {reserva && (
        <>
          <AvisoTonal
            tono="informacion"
            titulo={t('reserva', { nombre: reserva.nombre, hora: reserva.hora, n: reserva.personas })}
            descripcion={tableta ? t('reservaLigadaCorta') : t('reservaLigada', { llegada: reserva.llegada })}
            accion={onVerReserva && !tableta ? { etiqueta: t('verReserva'), onClick: onVerReserva } : undefined}
          />
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={sentar} onChange={(e) => setSentar(e.target.checked)} className="size-4 rounded accent-brand-action" />
            {tableta ? t('sentarCorto') : t('sentar', { mesa })}
          </label>
        </>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg">{t('comensales')}</span>
        <div role="radiogroup" aria-label={t('comensales')} className="flex flex-wrap items-center gap-2">
          {COMENSALES.map((n) => {
            const activo = !otro && comensales === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => {
                  setOtro(false);
                  setComensales(n);
                }}
                className={cn(
                  'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border px-2.5 text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  tableta && 'h-10 min-w-10',
                  activo ? 'border-line-brand bg-brand-tint px-3 text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
                )}
              >
                {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                {n}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={otro}
            onClick={() => setOtro(true)}
            className={cn(
              'inline-flex h-8 items-center justify-center rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              tableta && 'h-10',
              otro ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
            )}
          >
            {t('otro')}
          </button>
          {otro && (
            <input
              type="number"
              min={1}
              max={99}
              autoFocus
              value={comensales || ''}
              onChange={(e) => setComensales(Math.max(0, Math.min(99, Math.trunc(Number(e.target.value) || 0))))}
              aria-label={t('comensalesOtro')}
              className="h-8 w-20 rounded-lg border border-line-strong bg-surface px-2 text-sm tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          )}
        </div>
        {comensales > capacidad && capacidad > 0 && <p className="text-xs text-warning-text">{t('masQueCapacidad', { n: capacidad })}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg">{t('mesero')}</span>
        <Select value={mesero ?? ''} onValueChange={(v) => setMesero(v || null)}>
          <SelectTrigger aria-label={t('mesero')} className={cn('h-10 border-line-strong bg-surface text-sm', tableta && 'h-12')}>
            <SelectValue placeholder={t('meseroPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {listaMeseros.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.id === usuarioId ? t('tu', { nombre: m.nombre }) : m.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {campoCliente && !tableta && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t('cliente')}</span>
          {campoCliente}
          <p className="text-xs text-fg-muted">{t('clienteAyuda')}</p>
        </div>
      )}
    </DialogoMesa>
  );
}
