'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Plug, RotateCcw, Scale } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import type { MotivoNoAgregar } from '@/lib/pos/bascula/pesada';
import { cn } from '@/utils/Utils';

/**
 * Lectura de la báscula dentro de «Pesar» (Figma `LecturaBascula` 1078:702560:
 * estable · inestable · manual · error · fuera-de-rango · conectando;
 * docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6 punto 2 y §2.9).
 *
 * Solo pinta: el estado, los números ya formateados y las acciones llegan del
 * diálogo (`usePesadaBascula`). En `manual` el campo de peso va como `children`.
 */
export type EstadoLecturaBascula = 'conectando' | 'estable' | 'inestable' | 'fuera_de_rango' | 'error' | 'manual';

export interface LecturaBasculaProps {
  estado: EstadoLecturaBascula;
  nombreBascula?: string | null;
  /** Peso grande ya formateado con su unidad («0,735 kg»). */
  neto?: string | null;
  bruto?: string | null;
  tara?: string | null;
  fueraDeRango?: 'bajo_cero' | 'sobrecarga' | null;
  /** Capacidad formateada («15 kg») para «Sobrecarga (máx. 15 kg)». */
  capacidad?: string | null;
  /** Código de error del lector (`sin_lectura`, `sin_puerto`, …). */
  error?: string | null;
  /** Por qué no se puede agregar aún (con lectura estable). */
  motivo?: MotivoNoAgregar | null;
  minimo?: string | null;
  /** Tara predefinida del producto formateada («0,015 kg»), si tiene. */
  taraProducto?: string | null;
  taraActiva?: boolean;
  onCero?: () => void;
  onTara?: () => void;
  onQuitarTara?: () => void;
  onTaraProducto?: () => void;
  onReintentar?: () => void;
  /** Web Serial sin puerto autorizado: elegirlo (gesto del usuario). */
  onConectar?: () => void;
  /** «Peso a mano (M)», si la regla y el permiso lo permiten. */
  onPesarAMano?: () => void;
  /** Desde «manual», volver a la báscula. */
  onUsarBascula?: () => void;
  /**
   * Venta en un paso (§11): se agrega sola al estabilizarse. `pesoNuevo`: la
   * báscula aún tiene el peso de la pesada anterior.
   */
  esperandoAuto?: 'estable' | 'pesoNuevo' | null;
  children?: ReactNode;
}

const PUNTO: Record<EstadoLecturaBascula, string> = {
  conectando: 'bg-fg-muted',
  estable: 'bg-success',
  inestable: 'bg-warning',
  fuera_de_rango: 'bg-danger',
  error: 'bg-danger',
  manual: 'bg-fg-muted',
};

const CAJA: Record<EstadoLecturaBascula, string> = {
  conectando: 'border-line bg-subtle',
  estable: 'border-line bg-success-subtle',
  inestable: 'border-line bg-warning-subtle',
  fuera_de_rango: 'border-line-danger bg-danger-subtle',
  error: 'border-line-danger bg-danger-subtle',
  manual: 'border-line bg-subtle',
};

const ERRORES_CONOCIDOS = ['sin_lectura', 'sin_puerto', 'puerto_ocupado', 'permiso', 'io', 'no_soportado', 'no_disponible', 'protocolo_pendiente', 'unidad'];

function Boton({ onClick, children, atajo, variante = 'secundario' }: { onClick: () => void; children: ReactNode; atajo?: string; variante?: 'secundario' | 'fantasma' | 'tinte' }) {
  return (
    <button type="button" onClick={onClick} aria-keyshortcuts={atajo} className={clasesBoton({ variante, tamano: 'sm' })}>
      {children}
      {atajo && (
        <span aria-hidden="true" className="hidden rounded border border-line px-1 text-[10px] text-fg-muted lg:inline">
          {atajo}
        </span>
      )}
    </button>
  );
}

export function LecturaBascula(props: LecturaBasculaProps) {
  const t = useTranslations('posBascula.lectura');
  const { estado } = props;
  const errorCodigo = props.error && ERRORES_CONOCIDOS.includes(props.error) ? props.error : 'io';

  const etiquetaEstado = (() => {
    switch (estado) {
      case 'conectando':
        return t('estado.conectando');
      case 'estable':
        return t('estado.estable');
      case 'inestable':
        return t('estado.inestable');
      case 'fuera_de_rango':
        return t('estado.fueraDeRango');
      case 'error':
        return t('estado.error');
      default:
        return t('estado.manual');
    }
  })();

  const mensaje = (() => {
    if (estado === 'conectando') return t('conectando', { bascula: props.nombreBascula ?? '' });
    if (estado === 'inestable') return t('motivos.inestable');
    if (estado === 'error') return t(`errores.${errorCodigo}`);
    if (estado === 'fuera_de_rango') {
      if (props.fueraDeRango === 'bajo_cero') return t('bajoCero');
      return props.capacidad ? t('sobrecarga', { capacidad: props.capacidad }) : t('sobrecargaSinCapacidad');
    }
    if (estado === 'estable' && props.motivo) {
      if (props.motivo === 'bajo_minimo') return t('motivos.bajo_minimo', { minimo: props.minimo ?? '' });
      if (props.motivo === 'sin_tara') return t('motivos.sin_tara');
      if (props.motivo === 'sin_peso') return t('motivos.sin_peso');
    }
    return null;
  })();

  const mostrarNumero = estado === 'estable' || estado === 'inestable' || (estado === 'fuera_de_rango' && !!props.neto);
  const leyendo = estado !== 'manual' && estado !== 'error' && estado !== 'conectando';

  return (
    <div
      className={cn('flex flex-col gap-3 rounded-lg border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-brand', CAJA[estado])}
      data-estado={estado}
      // Recibe el foco al abrir «Pesar»: Enter agrega (y no pulsa la «×» del diálogo).
      data-lectura-bascula=""
      tabIndex={-1}
      role="group"
      aria-label={t('grupo')}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-fg-secondary">
        <span className="inline-flex items-center gap-1.5" aria-live="polite">
          {estado === 'conectando' ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <span aria-hidden="true" className={cn('size-2 rounded-full', PUNTO[estado])} />
          )}
          <span className="font-medium text-fg">{etiquetaEstado}</span>
        </span>
        {props.nombreBascula && (
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-fg-muted">
            <Scale aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{props.nombreBascula}</span>
          </span>
        )}
      </div>

      {estado === 'manual' ? (
        props.children
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                'text-4xl font-bold tabular-nums leading-none',
                estado === 'inestable' ? 'text-fg-secondary' : estado === 'fuera_de_rango' ? 'text-danger-text' : 'text-fg',
              )}
              aria-live={estado === 'estable' ? 'polite' : 'off'}
            >
              {mostrarNumero && props.neto ? props.neto : '—'}
            </span>
            {(props.bruto || props.tara) && mostrarNumero && (
              <span className="mt-1 text-xs tabular-nums text-fg-secondary">
                {[props.bruto ? t('bruto', { valor: props.bruto }) : null, props.tara ? t('tara', { valor: props.tara }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
          {estado === 'error' || estado === 'fuera_de_rango' ? (
            <AlertTriangle aria-hidden="true" className="size-6 shrink-0 text-danger-text" strokeWidth={1.5} />
          ) : null}
        </div>
      )}

      {props.esperandoAuto && estado !== 'manual' && estado !== 'error' && (
        <p className="inline-flex items-center gap-2 rounded-md bg-surface px-2 py-1 text-xs font-medium text-fg" data-auto={props.esperandoAuto}>
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-brand" strokeWidth={1.5} />
          {t(props.esperandoAuto === 'pesoNuevo' ? 'auto.pesoNuevo' : 'auto.esperando')}
        </p>
      )}

      {mensaje && (
        <p className={cn('text-xs', estado === 'error' || estado === 'fuera_de_rango' ? 'text-danger-text' : 'text-fg-secondary')} role={estado === 'error' ? 'alert' : undefined}>
          {mensaje}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {leyendo && props.onCero && (
          <Boton onClick={props.onCero} atajo="Z">
            {t('acciones.cero')}
          </Boton>
        )}
        {leyendo && props.onTara && !props.taraActiva && (
          <Boton onClick={props.onTara} atajo="T">
            {t('acciones.tara')}
          </Boton>
        )}
        {leyendo && props.onQuitarTara && props.taraActiva && (
          <Boton onClick={props.onQuitarTara} atajo="T">
            {t('acciones.quitarTara')}
          </Boton>
        )}
        {leyendo && props.onTaraProducto && props.taraProducto && (
          <Boton onClick={props.onTaraProducto} variante="fantasma">
            {t('acciones.taraProducto', { valor: props.taraProducto })}
          </Boton>
        )}
        {estado === 'error' && props.onConectar && (
          <Boton onClick={props.onConectar} variante="tinte">
            <Plug aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.conectar')}
          </Boton>
        )}
        {estado === 'error' && props.onReintentar && (
          <Boton onClick={props.onReintentar}>
            <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.reintentar')}
          </Boton>
        )}
        {estado !== 'manual' && props.onPesarAMano && (
          <Boton onClick={props.onPesarAMano} atajo="M" variante="fantasma">
            {t('acciones.pesarAMano')}
          </Boton>
        )}
        {estado === 'manual' && props.onUsarBascula && (
          <Boton onClick={props.onUsarBascula} variante="fantasma">
            <Scale aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.usarBascula')}
          </Boton>
        )}
      </div>
    </div>
  );
}
