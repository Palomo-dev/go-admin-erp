'use client';

/**
 * Piezas de Tesorería v2 (Figma `02 Componentes › Finanzas — kit/tesorería`,
 * `997:32520`) que solo usa este frente: `MovimientoTipoBadge`,
 * `EfectoEnCuentaTarjeta` y `CuentaDineroCard`. Sin lógica de negocio: reciben
 * cifras ya calculadas (`@/lib/finanzas/tesoreria/*`) y textos traducidos.
 * Tokens semánticos; sin `dark:`, hex ni `gray-*`.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Ban, Banknote, Landmark, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FilaDato, ListaDatos, StatusBadge, clasesBoton } from '@/components/kit';
import type { TipoFila } from '@/lib/finanzas/tesoreria/movimientosLista';
import type { EfectoEnCuenta } from '@/lib/finanzas/tesoreria/efectoEnCuenta';
import { cn } from '@/utils/Utils';

const TIPO: Record<TipoFila | 'anulado', { icono: LucideIcon; tono: 'exito' | 'peligro' | 'informacion' | 'neutro' }> = {
  entrada: { icono: ArrowDownCircle, tono: 'exito' },
  salida: { icono: ArrowUpCircle, tono: 'peligro' },
  traslado: { icono: ArrowLeftRight, tono: 'informacion' },
  anulado: { icono: Ban, tono: 'neutro' },
};

/** `MovimientoTipoBadge` (`997:32549`): entrada · salida · traslado · anulado. */
export function MovimientoTipoBadge({ tipo, anulado = false }: { tipo: TipoFila; anulado?: boolean }) {
  const t = useTranslations('finanzasTesoreriaR3.comun.tipos');
  const clave = anulado ? 'anulado' : tipo;
  const c = TIPO[clave];
  return <StatusBadge estado={clave} etiqueta={t(clave)} tono={c.tono} icono={c.icono} />;
}

/** `EfectoEnCuenta` (`997:32857`): saldo ahora → este movimiento → saldo después. */
export function EfectoEnCuentaTarjeta({
  cuenta,
  efecto,
  formatear,
  nota,
  cargando = false,
}: {
  cuenta: string;
  efecto: EfectoEnCuenta;
  formatear: (n: number) => string;
  nota?: ReactNode;
  cargando?: boolean;
}) {
  const t = useTranslations('finanzasTesoreriaR3.efecto');
  const oculto = efecto.antes === null;
  const signo = efecto.movimiento > 0 ? '+' : efecto.movimiento < 0 ? '−' : '';
  return (
    <section
      aria-label={t('titulo')}
      className={cn(
        'rounded-xl border bg-surface p-4',
        efecto.bloquea ? 'border-danger' : efecto.avisa ? 'border-warning' : 'border-line',
      )}
    >
      <h3 className="text-sm font-semibold text-fg">{t('titulo')}</h3>
      <p className="mb-3 mt-1 text-xs text-fg-secondary">{cuenta}</p>
      <ListaDatos etiqueta={t('titulo')}>
        <FilaDato etiqueta={t('ahora')} valor={cargando ? '…' : efecto.antes !== null ? formatear(efecto.antes) : t('oculto')} />
        <FilaDato
          etiqueta={t('movimiento')}
          valor={`${signo}${formatear(Math.abs(efecto.movimiento))}`}
          tono={efecto.movimiento > 0 ? 'exito' : efecto.movimiento < 0 ? 'peligro' : 'neutro'}
        />
        <FilaDato
          etiqueta={t('despues')}
          valor={efecto.despues !== null ? formatear(efecto.despues) : t('oculto')}
          tono={efecto.supera ? 'peligro' : 'fuerte'}
          tamano="lg"
          separadorAntes
        />
      </ListaDatos>
      {oculto && !cargando && <p className="mt-2 text-xs text-fg-secondary">{t('ocultoAyuda')}</p>}
      {efecto.bloquea && <p className="mt-2 text-xs font-medium text-danger-text">{t('bloqueaBanco')}</p>}
      {efecto.avisa && <p className="mt-2 text-xs font-medium text-warning-text">{t('avisaCaja')}</p>}
      {nota && <div className="mt-2 text-xs text-fg-secondary">{nota}</div>}
    </section>
  );
}

export interface AccionTarjeta {
  etiqueta: string;
  href?: string;
  onClick?: () => void;
}

/**
 * `CuentaDineroCard` (`997:32768`): caja (activa · vencida · oculta) o banco
 * (activa · sin cuenta contable · inactiva).
 */
export function CuentaDineroCard({
  tipo,
  nombre,
  detalle,
  etiquetaSaldo,
  saldo,
  pie,
  estado,
  tonoPie = 'neutro',
  acciones = [],
  href,
}: {
  tipo: 'caja' | 'banco';
  nombre: string;
  detalle: string;
  etiquetaSaldo: string;
  saldo: string;
  pie?: string | null;
  estado: { etiqueta: string; tono: 'exito' | 'advertencia' | 'neutro' };
  tonoPie?: 'neutro' | 'advertencia';
  acciones?: AccionTarjeta[];
  href?: string;
}) {
  const Icono = tipo === 'caja' ? Banknote : Landmark;
  const advertencia = estado.tono === 'advertencia';
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-surface p-4',
        advertencia ? 'border-warning' : 'border-line',
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            advertencia ? 'bg-warning-subtle text-warning-text' : 'bg-brand-tint text-brand',
          )}
          aria-hidden
        >
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="block truncate text-sm font-semibold text-fg hover:underline">
              {nombre}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-fg">{nombre}</p>
          )}
          <p className="truncate text-xs text-fg-secondary">{detalle}</p>
        </div>
        <StatusBadge estado={estado.etiqueta} etiqueta={estado.etiqueta} tono={estado.tono} />
      </header>
      <div>
        <p className="text-xs text-fg-secondary">{etiquetaSaldo}</p>
        <p className="text-2xl font-semibold tabular-nums text-fg">{saldo}</p>
      </div>
      {pie && <p className={cn('text-xs', tonoPie === 'advertencia' ? 'text-warning-text' : 'text-fg-tertiary')}>{pie}</p>}
      {acciones.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2">
          {acciones.map((a, i) =>
            a.href ? (
              <Link key={a.etiqueta} href={a.href} className={clasesBoton({ variante: i === 0 ? 'fantasma' : 'secundario', tamano: 'sm' })}>
                {a.etiqueta}
              </Link>
            ) : (
              <button
                key={a.etiqueta}
                type="button"
                onClick={a.onClick}
                className={clasesBoton({ variante: i === 0 ? 'fantasma' : 'secundario', tamano: 'sm' })}
              >
                {a.etiqueta}
              </button>
            ),
          )}
        </div>
      )}
    </article>
  );
}

/** Select nativo con el estilo del kit: un Select de Radix dentro de un diálogo lo cierra. */
export function SelectNativo({
  id,
  valor,
  onCambiar,
  opciones,
  vacio,
  deshabilitado,
  ...aria
}: {
  id?: string;
  valor: string;
  onCambiar: (v: string) => void;
  opciones: readonly { valor: string; etiqueta: string; deshabilitada?: boolean }[];
  vacio?: string;
  deshabilitado?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}) {
  return (
    <select
      id={id}
      value={valor}
      disabled={deshabilitado}
      onChange={(e) => onCambiar(e.target.value)}
      className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg disabled:opacity-60"
      {...aria}
    >
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}

/** Descarga un CSV en el navegador (la exportación de las listas viejas). */
export function descargarCsv(nombre: string, contenido: string): void {
  const blob = new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
