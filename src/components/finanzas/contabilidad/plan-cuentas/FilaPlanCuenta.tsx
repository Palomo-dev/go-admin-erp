'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Loader2, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, FormField, Kbd, RowActionsMenu, clasesBoton, type AccionFila } from '@/components/kit';
import { Input } from '@/components/ui/input';
import type { NivelPuc } from '@/lib/finanzas/pucJerarquia';
import { cn } from '@/utils/Utils';

const SANGRIA = '[--sangria:14px] lg:[--sangria:22px]';

function paddingDeNivel(nivel: number) {
  return { paddingLeft: `calc(12px + ${nivel} * var(--sangria))` };
}

export interface FilaPlanCuentaProps {
  codigo: string;
  nombre: string;
  nivel: number;
  etiquetaNivel: string;
  naturaleza: string | null;
  saldo: string;
  rama: 'abierta' | 'cerrada' | 'hoja';
  inactiva?: boolean;
  resaltada?: boolean;
  reciente?: boolean;
  /** Nombre del nivel que se crea debajo. Sin esto no hay «+». */
  crearDebajo?: string;
  acciones: readonly AccionFila[];
  onAlternar: () => void;
  onAbrir: () => void;
  onCrearDebajo?: () => void;
}

/**
 * Fila del árbol (Figma `FilaPlanCuenta`). Desde grupo, cada fila lleva su «+»
 * para crear el nivel de abajo: siempre visible, con el nombre del nivel al pasar
 * el mouse. El 2026-11-06 solo lo tenían las subcuentas y en un plan sin
 * subcuentas no aparecía ninguno.
 */
export function FilaPlanCuenta({
  codigo,
  nombre,
  nivel,
  etiquetaNivel,
  naturaleza,
  saldo,
  rama,
  inactiva,
  resaltada,
  reciente,
  crearDebajo,
  acciones,
  onAlternar,
  onAbrir,
  onCrearDebajo,
}: FilaPlanCuentaProps) {
  const t = useTranslations('planCuentas');
  const Rama = rama === 'abierta' ? ChevronDown : rama === 'cerrada' ? ChevronRight : Minus;
  const titulo = nivel < 2;

  return (
    <div
      role="row"
      data-codigo={codigo}
      className={cn(
        'group flex min-h-10 items-center border-b border-line transition-colors motion-reduce:transition-none',
        reciente ? 'bg-success-subtle' : resaltada ? 'bg-warning-subtle' : nivel === 0 ? 'bg-subtle' : 'bg-surface hover:bg-subtle',
      )}
    >
      <div role="cell" className={cn('flex min-w-0 flex-1 items-center gap-2 py-2 pr-2', SANGRIA)} style={paddingDeNivel(nivel)}>
        {rama === 'hoja' ? (
          <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted" aria-hidden>
            <Rama className="size-3.5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={rama === 'abierta'}
            aria-label={t(rama === 'abierta' ? 'fila.cerrarRama' : 'fila.abrirRama', { cuenta: `${codigo} ${nombre}` })}
            className="flex size-6 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Rama className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onAbrir}
          className="flex min-w-0 flex-col items-start rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex-row lg:items-center lg:gap-2"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={cn('shrink-0 text-[13px] text-link', titulo && 'font-medium')}>{codigo}</span>
            <span
              className={cn(
                'truncate text-sm',
                titulo ? 'font-medium text-fg' : 'text-fg',
                inactiva && 'text-fg-muted line-through',
              )}
            >
              {nombre}
            </span>
          </span>
          <span className="text-xs text-fg-secondary lg:hidden">
            {etiquetaNivel} · {saldo}
          </span>
        </button>
        {inactiva ? <span className="shrink-0 rounded-full border border-line px-2 text-xs text-fg-secondary">{t('fila.inactiva')}</span> : null}
      </div>
      <div role="cell" className="hidden w-[110px] shrink-0 px-3 text-[13px] text-fg-secondary lg:block">{etiquetaNivel}</div>
      <div role="cell" className="hidden w-[96px] shrink-0 px-3 text-[13px] text-fg-secondary lg:block">{naturaleza ?? '—'}</div>
      <div role="cell" className="hidden w-[170px] shrink-0 px-3 text-right text-[13px] tabular-nums text-fg lg:block">{saldo}</div>
      <div role="cell" className="flex shrink-0 items-center justify-end gap-1 px-2 lg:w-[190px]">
        {crearDebajo && onCrearDebajo ? (
          <button
            type="button"
            onClick={onCrearDebajo}
            aria-label={t('fila.crearDebajo', { nivel: crearDebajo, cuenta: `${codigo} ${nombre}` })}
            title={t('fila.crearDebajo', { nivel: crearDebajo, cuenta: `${codigo} ${nombre}` })}
            className={cn(
              clasesBoton({ variante: 'fantasma', tamano: 'sm' }),
              'text-fg-muted hover:text-fg focus-visible:text-fg lg:group-hover:text-fg',
            )}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden lg:group-focus-within:inline lg:group-hover:inline">{crearDebajo}</span>
          </button>
        ) : null}
        <RowActionsMenu acciones={acciones} titulo={`${codigo} ${nombre}`} orientacion="vertical" tamano="sm" />
      </div>
    </div>
  );
}

export interface FilaAltaCuentaProps {
  nivel: number;
  /** Lo que se crea: cuenta, subcuenta, auxiliar o subauxiliar. */
  nivelPuc: NivelPuc;
  /** Dígitos del código nuevo: los del padre más dos. */
  largoCodigo: number;
  codigo: string;
  nombre: string;
  error?: string | null;
  guardando: boolean;
  /** Con saldo no se guarda con Enter: hay que confirmar el traslado. */
  bloqueada: boolean;
  onCodigo: (valor: string) => void;
  onNombre: (valor: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}

/** Fila de alta en línea (Figma `FilaPlanCuenta` Estado=nueva). */
export function FilaAltaCuenta({
  nivel,
  nivelPuc,
  largoCodigo,
  codigo,
  nombre,
  error,
  guardando,
  bloqueada,
  onCodigo,
  onNombre,
  onGuardar,
  onCancelar,
}: FilaAltaCuentaProps) {
  const t = useTranslations('planCuentas');
  const refNombre = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refNombre.current?.focus();
  }, [codigo]);

  const teclas = (evento: React.KeyboardEvent) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      onCancelar();
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      if (!bloqueada) onGuardar();
    }
  };

  return (
    <div role="row" className={cn('flex items-center gap-2 border-y border-line-brand bg-brand-tint py-2 pr-3', SANGRIA)} style={paddingDeNivel(nivel)}>
      <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted" aria-hidden>
        <Minus className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('alta.codigo')}
            value={codigo}
            inputMode="numeric"
            maxLength={largoCodigo}
            onChange={(e) => onCodigo(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={teclas}
            aria-invalid={!!error}
            className={cn('h-8 w-[112px] shrink-0 bg-surface text-[13px]', error && 'border-danger')}
          />
          <Input
            ref={refNombre}
            aria-label={t('alta.nombre')}
            placeholder={t('alta.nombrePlaceholder', { nivel: nivelPuc })}
            value={nombre}
            maxLength={200}
            onChange={(e) => onNombre(e.target.value)}
            onKeyDown={teclas}
            className="h-8 min-w-0 flex-1 bg-surface text-[13px]"
          />
        </div>
        {error ? <p role="alert" className="text-xs font-medium text-danger">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-2">
        <Kbd tecla="Enter" />
        <span className="text-xs text-fg-secondary">{t('alta.pistaEnter')}</span>
        <Kbd tecla="Esc" />
        {!bloqueada ? (
          <button type="button" onClick={onGuardar} disabled={guardando} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
            {guardando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {t('alta.guardar')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface AvisoPadreAltaProps {
  situacion: 'pasa_a_titulo' | 'con_saldo';
  nivel: number;
  codigoPadre: string;
  nombrePadre: string;
  saldo: string;
  nota: string;
  guardando: boolean;
  onNota: (valor: string) => void;
  onTrasladar: () => void;
}

/** Aviso bajo la fila: qué le pasa al padre al crear una cuenta debajo. */
export function AvisoPadreAlta({
  situacion,
  nivel,
  codigoPadre,
  nombrePadre,
  saldo,
  nota,
  guardando,
  onNota,
  onTrasladar,
}: AvisoPadreAltaProps) {
  const t = useTranslations('planCuentas');
  return (
    <div className={cn('flex flex-col gap-2 border-b border-line bg-surface py-2 pr-4', SANGRIA)} style={paddingDeNivel(nivel + 1)}>
      {situacion === 'con_saldo' ? (
        <>
          <AvisoTonal
            tono="advertencia"
            titulo={t('alta.saldoTitulo', { cuenta: `${codigoPadre} ${nombrePadre}`, saldo })}
            descripcion={t('alta.saldoDetalle')}
            accion={{ etiqueta: t('alta.trasladar'), onClick: onTrasladar, cargando: guardando }}
          />
          <FormField etiqueta={t('alta.nota')} ayuda={t('alta.notaAyuda')}>
            <Input value={nota} maxLength={300} onChange={(e) => onNota(e.target.value)} />
          </FormField>
        </>
      ) : (
        <AvisoTonal tono="informacion" titulo={t('alta.tituloTitulo', { cuenta: codigoPadre })} descripcion={t('alta.tituloDetalle')} />
      )}
    </div>
  );
}

/** Pista bajo el árbol mientras se crean cuentas (Figma `AtajosCreacionCuenta`). */
export function AtajosCreacionCuenta({ nivelPuc }: { nivelPuc: NivelPuc }) {
  const t = useTranslations('planCuentas');
  return (
    <div className="hidden w-fit items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2 lg:flex">
      <Kbd tecla="Enter" />
      <span className="text-xs font-medium text-fg-secondary">{t('alta.atajoEnter', { nivel: nivelPuc })}</span>
      <Kbd tecla="Esc" />
      <span className="text-xs font-medium text-fg-secondary">{t('alta.atajoEsc')}</span>
    </div>
  );
}
