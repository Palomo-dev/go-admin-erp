'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, CreditCard, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { BotonImporte, KbdButton, type AccionFila } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { HoraZona, LineaCuentaMesa } from './LineaCuentaMesa';
import type { CuentaAgrupada, LineaMesa, RondaMesa, TotalesCuenta } from './cuentaMesaLogica';

/**
 * Cuenta de la mesa como pestaña del carrito (Figma `CartPanel Variant=mesa`,
 * D2–D9, T2–T6, S1, S4, S7, S8): cabecera «Mesa 4 · Cuenta» con «3 en cocina»
 * y ⋯, cliente, nota de la mesa, «Por enviar», las rondas (la servida se
 * contrae), totales, Pre-cuenta · Dividir · Enviar a cocina (F8) y
 * «Cobrar mesa» (F4).
 *
 * Solo dibuja: cada acción es un callback de la pantalla.
 */
export type EstadoCobroMesa = 'listo' | 'sinCaja' | 'procesando' | 'vacio';

export interface AccionesLineaMesa {
  onCantidad: (linea: LineaMesa, cantidad: number) => void;
  onNota: (linea: LineaMesa) => void;
  onModificadores: (linea: LineaMesa) => void;
  onComensal: (linea: LineaMesa) => void;
  onQuitar: (linea: LineaMesa) => void;
  onServido: (linea: LineaMesa) => void;
  onAnular: (linea: LineaMesa) => void;
  masAcciones?: (linea: LineaMesa) => AccionFila[];
}

export interface PanelCuentaMesaProps {
  mesaNombre: string;
  cuenta: CuentaAgrupada;
  totales: TotalesCuenta;
  formatear: (valor: number) => string;
  /** «Impoconsumo 8 %» para una tasa (nombre del impuesto de la organización). */
  nombreImpuesto: (tasa: number) => string;
  ahora: Date;
  /** Fila del cliente (`FilaClienteMesa`). */
  cliente: ReactNode;
  /** Fila de la nota de la mesa (`FilaNotaMesa`). */
  nota: ReactNode;
  /** Menú ⋯ de la cabecera (`MenuMesa`). */
  menu?: ReactNode;
  /** Aviso dentro de la cuenta (no se usa en escritorio; la tableta lo pone arriba). */
  acciones: AccionesLineaMesa;
  onPrecuenta: () => void;
  onDividir: () => void;
  onEnviar: () => void;
  enviando?: boolean;
  /** Sin conexión: las rondas quedan en cola (S5). */
  rondasEnCola?: number;
  onCobrar: () => void;
  estadoCobro: EstadoCobroMesa;
  onAbrirCaja: () => void;
  deshabilitada?: boolean;
  className?: string;
}

export function PanelCuentaMesa({
  mesaNombre,
  cuenta,
  totales,
  formatear,
  nombreImpuesto,
  ahora,
  cliente,
  nota,
  menu,
  acciones,
  onPrecuenta,
  onDividir,
  onEnviar,
  enviando,
  onCobrar,
  estadoCobro,
  onAbrirCaja,
  deshabilitada,
  className,
}: PanelCuentaMesaProps) {
  const t = useTranslations('posMesasFlujo.cuenta');
  const vacia = cuenta.porEnviar.length === 0 && cuenta.rondas.length === 0 && cuenta.directas.length === 0;
  const [abiertas, setAbiertas] = useState<Record<number, boolean>>({});

  const linea = (l: LineaMesa) => (
    <LineaCuentaMesa
      key={l.id}
      linea={l}
      formatear={formatear}
      textoImpuesto={l.impuesto > 0 ? t('impuestoIncluido', { impuesto: nombreImpuesto(l.tasaImpuesto).toLowerCase() }) : null}
      ahora={ahora}
      deshabilitada={deshabilitada}
      onCantidad={(n) => acciones.onCantidad(l, n)}
      onNota={() => acciones.onNota(l)}
      onModificadores={() => acciones.onModificadores(l)}
      onComensal={() => acciones.onComensal(l)}
      onQuitar={() => acciones.onQuitar(l)}
      onServido={() => acciones.onServido(l)}
      onAnular={() => acciones.onAnular(l)}
      masAcciones={acciones.masAcciones?.(l)}
    />
  );

  const cabeceraRonda = (r: RondaMesa) => {
    const contraida = r.estado === 'servida' && !abiertas[r.numero];
    const Chevron = contraida ? ChevronRight : ChevronDown;
    return (
      <button
        type="button"
        onClick={() => setAbiertas((a) => ({ ...a, [r.numero]: contraida }))}
        aria-expanded={!contraida}
        className="flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="font-semibold text-fg">
          {r.estado === 'servida' ? t('ronda', { n: r.numero }) : t('rondaEstado', { n: r.numero, estado: t(`estadoRonda.${r.estado}`) })}
        </span>
        <span className="text-fg-muted">
          {r.estado === 'servida' ? (
            <>
              {t('servida')} <HoraZona iso={r.servidaAt ?? r.enviadaAt} />
              {contraida && ` · ${t('lineasContraida', { n: r.lineas.length })}`}
            </>
          ) : (
            <>
              {t('enviada')} <HoraZona iso={r.enviadaAt} />
            </>
          )}
        </span>
        {r.estado === 'servida' && <Chevron aria-hidden="true" className="ml-auto size-4 text-fg-muted" strokeWidth={1.5} />}
      </button>
    );
  };

  return (
    <section
      aria-label={t('etiqueta', { mesa: mesaNombre })}
      className={cn('flex h-full min-h-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3', className)}
    >
      <header className="flex shrink-0 items-center gap-2">
        {vacia ? (
          <ShoppingCart aria-hidden="true" className="size-5 text-fg" strokeWidth={1.5} />
        ) : (
          <UtensilsCrossed aria-hidden="true" className="size-5 text-fg" strokeWidth={1.5} />
        )}
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
          {vacia ? t('tituloVacio') : t('titulo', { mesa: mesaNombre })}
        </h2>
        {cuenta.enCocina > 0 && (
          <span className="inline-flex h-6 items-center rounded-full border border-line-info bg-info-subtle px-2 text-xs font-semibold text-info-text">
            {t('enCocina', { n: cuenta.enCocina })}
          </span>
        )}
        {menu}
      </header>

      <div className="shrink-0">{cliente}</div>
      {!vacia && <div className="shrink-0">{nota}</div>}

      {vacia ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand">
            <ShoppingCart className="size-6" strokeWidth={1.5} />
          </span>
          <p className="text-base font-semibold text-fg">{t('vacioTitulo')}</p>
          <p className="max-w-sm text-sm text-fg-secondary">{t('vacioDescripcion')}</p>
        </div>
      ) : (
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
          {cuenta.porEnviar.length > 0 && (
            <>
              <p className="text-[13px]">
                <span className="font-semibold text-fg">{t('porEnviar')}</span>{' '}
                <span className="text-fg-muted">{t('porEnviarDetalle', { n: cuenta.porEnviar.length })}</span>
              </p>
              {cuenta.porEnviar.map(linea)}
            </>
          )}
          {cuenta.rondas.map((r) => (
            <div key={r.numero} className="flex flex-col gap-2">
              {cabeceraRonda(r)}
              {!(r.estado === 'servida' && !abiertas[r.numero]) && r.lineas.map(linea)}
            </div>
          ))}
          {cuenta.directas.length > 0 && (
            <>
              <p className="text-[13px]">
                <span className="font-semibold text-fg">{t('directas')}</span>{' '}
                <span className="text-fg-muted">{t('directasDetalle')}</span>
              </p>
              {cuenta.directas.map(linea)}
            </>
          )}
        </div>
      )}

      {!vacia && (
        <div className="shrink-0 rounded-xl border border-line px-3 py-3">
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between text-fg-secondary">
              <dt>{t('subtotal')}</dt>
              <dd className="tabular-nums text-fg">{formatear(totales.subtotal)}</dd>
            </div>
            {totales.impuestos.map((i) => (
              <div key={i.tasa} className="flex justify-between text-fg-secondary">
                <dt>{nombreImpuesto(i.tasa)}</dt>
                <dd className="tabular-nums text-fg">{formatear(i.importe)}</dd>
              </div>
            ))}
            {totales.abonado > 0 && (
              <div className="flex justify-between text-fg-secondary">
                <dt>{t('abonado')}</dt>
                <dd className="tabular-nums text-success-text">−{formatear(totales.abonado)}</dd>
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between">
              <dt className="text-lg font-semibold text-fg">{t('total')}</dt>
              <dd className="text-lg font-bold tabular-nums text-fg">{formatear(totales.saldo)}</dd>
            </div>
          </dl>
        </div>
      )}

      {!vacia && (
        <div className="grid shrink-0 grid-cols-[1fr_1fr_1.35fr] gap-2">
          <KbdButton variante="secundario" tamano="sm" onClick={onPrecuenta} disabled={deshabilitada} className="h-8">
            {t('precuenta')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="sm" onClick={onDividir} disabled={deshabilitada} className="h-8">
            {t('dividir')}
          </KbdButton>
          <KbdButton
            variante="secundario"
            tamano="sm"
            atajo="F8"
            atajoSiempreVisible
            onClick={onEnviar}
            cargando={enviando}
            disabled={deshabilitada || cuenta.porEnviar.length === 0}
            className="h-8"
          >
            {t('enviar', { n: cuenta.porEnviar.length })}
          </KbdButton>
        </div>
      )}

      <BotonImporte
        etiqueta={estadoCobro === 'sinCaja' ? t('abrirCaja') : vacia ? t('cobrar') : t('cobrarMesa')}
        importe={estadoCobro === 'sinCaja' ? undefined : formatear(vacia ? 0 : totales.saldo)}
        atajo={estadoCobro === 'sinCaja' ? 'F9' : 'F4'}
        estado={estadoCobro === 'procesando' ? 'procesando' : estadoCobro === 'vacio' || vacia ? 'deshabilitado' : 'listo'}
        icono={CreditCard}
        onClick={estadoCobro === 'sinCaja' ? onAbrirCaja : onCobrar}
        className="shrink-0 [&>button]:h-14 [&>button]:justify-start [&>button>span:last-child]:ml-0"
      />
    </section>
  );
}
