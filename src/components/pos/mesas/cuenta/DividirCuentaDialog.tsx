'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';
import { KbdButton, SegmentedControl } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { DialogoMesa } from './DialogoMesa';
import { CuentaDividida } from './CuentaDividida';
import {
  partesIguales,
  partesPorComensal,
  partesPorProductos,
  unidadesSinAsignar,
  type LineaMesa,
  type ModoDivision,
  type ParteMesa,
} from './cuentaMesaLogica';

/**
 * Dividir la cuenta (Figma D8 escritorio y T6 tableta), sobre lo que falta por
 * pagar:
 * - Por comensal: precargado con el comensal de cada línea; lo «General» se
 *   reparte en partes iguales entre todos.
 * - Partes iguales: por MONTO (sin repartir platos).
 * - Por ítems/productos: unidades de cada línea a cada parte (una línea se
 *   puede partir).
 * Cada parte se cobra con el mismo cobro del POS, por monto; el saldo lo dice
 * el servidor.
 */
export interface DividirCuentaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesaNombre: string;
  lineas: LineaMesa[];
  comensales: number;
  formatear: (valor: number) => string;
  decimales: number;
  /** Tableta (T6): tarjetas `CuentaDividida` 2×2 y «Dividir en N partes». */
  tableta?: boolean;
  /** Escritorio: cobra ya la primera parte («Cobrar comensal 1 · $ 41.500»). */
  onCobrarPrimera: (partes: ParteMesa[], modo: ModoDivision) => void;
  /** Tableta: crea las partes y abre «Cobrar por partes» (D8b). */
  onDividir: (partes: ParteMesa[], modo: ModoDivision) => void;
}

export function DividirCuentaDialog({
  abierto,
  onAbiertoChange,
  mesaNombre,
  lineas,
  comensales,
  formatear,
  decimales,
  tableta,
  onCobrarPrimera,
  onDividir,
}: DividirCuentaDialogProps) {
  const t = useTranslations('posMesasFlujo.dividir');
  const tp = useTranslations('posMesasFlujo.partes');
  const [modo, setModo] = useState<ModoDivision>('comensal');
  const [n, setN] = useState(Math.max(2, comensales));
  const [asignacion, setAsignacion] = useState<Record<string, number[]>>({});

  const pendientes = useMemo(() => lineas.filter((l) => !l.pagada && l.cantidad > 0), [lineas]);

  useEffect(() => {
    if (!abierto) return;
    setModo('comensal');
    setN(Math.max(2, comensales));
    // Por productos arranca con cada línea en la parte de su comensal (o la 1).
    const inicial: Record<string, number[]> = {};
    for (const l of pendientes) {
      const parte = Math.min(Math.max(1, l.comensal ?? 1), Math.max(2, comensales)) - 1;
      const arr = Array.from({ length: Math.max(2, comensales) }, () => 0);
      arr[parte] = l.cantidad;
      inicial[l.id] = arr;
    }
    setAsignacion(inicial);
  }, [abierto, comensales, pendientes]);

  const partes: ParteMesa[] = useMemo(() => {
    if (modo === 'comensal') return partesPorComensal(pendientes, comensales, decimales);
    if (modo === 'iguales') return partesIguales(pendientes, n, decimales);
    return partesPorProductos(pendientes, asignacion, n, decimales);
  }, [modo, pendientes, comensales, n, asignacion, decimales]);

  const sinAsignar = modo === 'productos' ? unidadesSinAsignar(pendientes, asignacion) : 0;
  const validas = partes.filter((p) => p.importe > 0);
  const listo = validas.length > 0 && sinAsignar === 0;
  const nombreParte = (p: ParteMesa) => (p.comensal ? tp('comensal', { n: p.comensal }) : tp('parte', { n: p.nombre }));
  const detalleParte = (p: ParteMesa) => {
    const nombres = p.lineas.map((l) => l.nombre).join(', ');
    const general = p.fraccionGeneral > 0 && modo === 'comensal' ? tp('masGeneral', { n: Math.round(1 / p.fraccionGeneral) }) : '';
    if (modo === 'iguales') return tp('detalleIgual', { n });
    return [nombres, general].filter(Boolean).join(' ') || tp('soloGeneral', { n: Math.round(1 / (p.fraccionGeneral || 1)) });
  };

  const cambiarUnidades = (lineaId: string, parte: number, valor: number, cantidad: number) => {
    setAsignacion((a) => {
      const arr = [...(a[lineaId] ?? Array.from({ length: n }, () => 0))];
      while (arr.length < n) arr.push(0);
      const otras = arr.reduce((s, x, i) => (i === parte ? s : s + (x || 0)), 0);
      arr[parte] = Math.max(0, Math.min(valor, cantidad - otras));
      return { ...a, [lineaId]: arr };
    });
  };

  const primera = validas[0];
  const etiquetaModo = { comensal: t('modos.comensal'), iguales: t('modos.iguales'), productos: tableta ? t('modos.productos') : t('modos.items') };

  return (
    <DialogoMesa
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={tableta ? t('tituloTableta', { mesa: mesaNombre }) : t('titulo', { mesa: mesaNombre })}
      textoCerrar={t('cerrar')}
      ancho={tableta ? 720 : 880}
      pie={
        <>
          <KbdButton variante={tableta ? 'fantasma' : 'secundario'} tamano={tableta ? 'lg' : 'md'} onClick={() => onAbiertoChange(false)}>
            {t('cancelar')}
          </KbdButton>
          {tableta ? (
            <KbdButton variante="primario" tamano="lg" disabled={!listo} onClick={() => onDividir(validas, modo)}>
              {t('dividirEn', { n: validas.length })}
            </KbdButton>
          ) : (
            <KbdButton variante="primario" tamano="md" disabled={!listo || !primera} onClick={() => onCobrarPrimera(validas, modo)}>
              {primera ? t('cobrarPrimera', { parte: nombreParte(primera), importe: formatear(primera.importe) }) : t('cobrar')}
            </KbdButton>
          )}
        </>
      }
    >
      <SegmentedControl<ModoDivision>
        etiqueta={t('modo')}
        valor={modo}
        onValorChange={setModo}
        className="self-start"
        opciones={
          tableta
            ? [
                { valor: 'comensal', etiqueta: etiquetaModo.comensal },
                { valor: 'productos', etiqueta: etiquetaModo.productos },
                { valor: 'iguales', etiqueta: etiquetaModo.iguales },
              ]
            : [
                { valor: 'comensal', etiqueta: etiquetaModo.comensal },
                { valor: 'iguales', etiqueta: etiquetaModo.iguales },
                { valor: 'productos', etiqueta: etiquetaModo.productos },
              ]
        }
      />

      {tableta && modo === 'comensal' && <p className="text-sm text-fg-secondary">{t('ayudaComensalTableta', { n: comensales })}</p>}

      {modo !== 'comensal' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg">{t('partes')}</span>
          <div className="flex items-center gap-2" role="group" aria-label={t('partes')}>
            <button type="button" aria-label={t('menosPartes')} onClick={() => setN((v) => Math.max(2, v - 1))} className="inline-flex size-8 items-center justify-center rounded-lg border border-line-strong text-fg-secondary hover:bg-hover">
              <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{n}</span>
            <button type="button" aria-label={t('masPartes')} onClick={() => setN((v) => Math.min(20, v + 1))} className="inline-flex size-8 items-center justify-center rounded-lg border border-line-strong text-fg-secondary hover:bg-hover">
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {modo === 'productos' && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-xs text-fg-secondary">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('producto')}</th>
                {Array.from({ length: n }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-medium">{tp('parte', { n: i + 1 })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendientes.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-2 text-fg">
                    {l.nombre} <span className="text-fg-muted">×{l.cantidad}</span>
                  </td>
                  {Array.from({ length: n }, (_, i) => (
                    <td key={i} className="px-2 py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={l.cantidad}
                        value={asignacion[l.id]?.[i] ?? 0}
                        onChange={(e) => cambiarUnidades(l.id, i, Math.trunc(Number(e.target.value) || 0), l.cantidad)}
                        aria-label={t('unidadesDe', { producto: l.nombre, parte: i + 1 })}
                        className="h-8 w-14 rounded-md border border-line-strong bg-surface px-1 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sinAsignar > 0 && <p className="border-t border-line px-3 py-2 text-[13px] text-warning-text">{t('sinAsignar', { n: sinAsignar })}</p>}
        </div>
      )}

      {tableta ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {validas.map((p) => (
            <CuentaDividida key={p.id} titulo={nombreParte(p)} detalle={detalleParte(p)} importe={formatear(p.importe)} estado="pendiente" onCobrar={() => onDividir(validas, modo)} />
          ))}
        </div>
      ) : (
        <div className={cn('grid gap-3', validas.length >= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
          {validas.map((p) => (
            <div key={p.id} className="flex min-w-0 flex-col gap-2 self-start rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-action text-xs font-semibold text-fg-on-brand">
                  {p.comensal ? `C${p.comensal}` : `P${p.nombre}`}
                </span>
                <span className="truncate text-sm font-medium text-fg">{nombreParte(p)}</span>
              </div>
              {p.lineas.map((l) => (
                <div key={`${p.id}-${l.lineaId}`} className="flex items-start justify-between gap-2 text-[13px]">
                  <span className="min-w-0 text-fg">{t('lineaParte', { nombre: l.nombre, n: l.cantidad })}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-fg-secondary">{formatear(l.importe)}</span>
                </div>
              ))}
              {p.fraccionGeneral > 0 && modo === 'comensal' && pendientes.some((l) => !l.comensal) && (
                <div className="flex items-start justify-between gap-2 text-[13px]">
                  <span className="text-fg-secondary">{tp('masGeneral', { n: Math.round(1 / p.fraccionGeneral) })}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="whitespace-nowrap text-xs text-fg-secondary">{t('totalImpuestos')}</span>
                <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{formatear(p.importe)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!tableta && <p className="text-[13px] text-fg-secondary">{t('ayuda')}</p>}
    </DialogoMesa>
  );
}
