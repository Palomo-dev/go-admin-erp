'use client';

/**
 * Tarjeta de un tema del tablero «Ventas en línea» (Figma B/10-01): icono,
 * título y estado (Configurado / Falta / Opcional / Disponible con…), filas con
 * su marca (check verde, aviso ámbar o círculo atenuado), pie con el origen del
 * dato y la acción («Editar opciones» o «Ir a …»). La tarjeta en «Falta» lleva
 * borde de advertencia. La versión de error parcial (B/10-03) es
 * `TarjetaVentaConError`.
 *
 * El color nunca va solo: cada estado lleva su texto y cada fila su icono.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Pencil, RefreshCw, Truck } from 'lucide-react';
import { StatusBadge, Tarjeta, clasesBoton, type TonoBadge } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { EstadoTarjetaVenta, FilaVenta, TarjetaVenta, TemaVenta } from './estadoVentas';
import { etiquetaEstado, etiquetaFila, formatoFila } from './formatoVentas';
import { ICONO_ESTADO_VENTA, ICONO_MARCA_FILA, ICONO_TEMA_VENTA, iconoDestino } from './iconosVentas';
import { useTextosVentas } from './textos';

/** @deprecated Usa `ICONO_TEMA_VENTA` de `iconosVentas.ts` (la tabla única del área). */
export const ICONO_TEMA = ICONO_TEMA_VENTA;


/**
 * Tono del badge por estado (B/10-04 nota 2). «Falta» es ámbar en este tablero
 * (la captura y la nota): algo pendiente para vender, no un error. La tabla
 * general (estadoTono) lo tiene en rojo para Legales; aquí se fija el tono.
 */
export const TONO_ESTADO: Record<EstadoTarjetaVenta, { tono: TonoBadge; apariencia: 'suave' | 'contorno' }> = {
  configurado: { tono: 'exito', apariencia: 'suave' },
  falta: { tono: 'advertencia', apariencia: 'suave' },
  opcional: { tono: 'neutro', apariencia: 'contorno' },
  disponible: { tono: 'informacion', apariencia: 'suave' },
};


/** Nombre del módulo dueño («Transporte») desde el catálogo de navegación. */
export function useNombreModulo(): (clave: string) => string {
  const tNav = useTranslations('nav');
  return (clave: string) => (tNav.has(clave) ? tNav(clave) : clave);
}

export function EstadoVentaBadge({ tarjeta, tamano = 'md' }: { tarjeta: Pick<TarjetaVenta, 'estado' | 'enlace'>; tamano?: 'sm' | 'md' }) {
  const t = useTextosVentas();
  const modulo = useNombreModulo();
  const { tono, apariencia } = TONO_ESTADO[tarjeta.estado];
  return (
    <StatusBadge
      estado={tarjeta.estado}
      etiqueta={etiquetaEstado(tarjeta, t, modulo(tarjeta.enlace?.modulo ?? ''))}
      tono={tono}
      apariencia={apariencia}
      tamano={tamano}
      icono={ICONO_ESTADO_VENTA[tarjeta.estado]}
    />
  );
}

export function FilasVenta({ filas, moneda }: { filas: readonly FilaVenta[]; moneda: ContextoMoneda }) {
  const t = useTextosVentas();
  if (filas.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f, i) => {
        const m = ICONO_MARCA_FILA[f.marca];
        const Icono = m.icono;
        return (
          <li key={`${f.clave}-${i}`} className="flex items-center justify-between gap-3 text-[13px] leading-5">
            <span className="flex min-w-0 items-center gap-2 text-fg">
              <Icono aria-label={t(`ventas.marcas.${f.marca}`)} role="img" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0', m.clase)} strokeWidth={TRAZO_ICONO} />
              <span className="truncate">{etiquetaFila(f, t)}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums text-fg-secondary">{formatoFila(f, t, moneda)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface TarjetaEstadoVentaProps {
  tarjeta: TarjetaVenta;
  moneda: ContextoMoneda;
  onEditarCheckout?: () => void;
  /** Envíos: abre las tarifas de Transporte dentro del módulo. */
  onGestionarTarifas?: () => void;
  onAlternarReservas?: (activo: boolean) => void;
  reservasOcupado?: boolean;
  /** Sin borde ni título propios (dentro de la hoja de móvil). */
  incrustada?: boolean;
}

/** Acción del pie: «Editar opciones», «Ir a …» o «Disponible con …». */
export function AccionTarjeta({ tarjeta, onEditarCheckout }: Pick<TarjetaEstadoVentaProps, 'tarjeta' | 'onEditarCheckout'>) {
  const t = useTextosVentas();
  const modulo = useNombreModulo();
  if (tarjeta.tema === 'checkout') {
    if (!tarjeta.editable || !onEditarCheckout) return null;
    return (
      <button type="button" onClick={onEditarCheckout} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
        <Pencil aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        {t('ventas.acciones.editarOpciones')}
      </button>
    );
  }
  if (!tarjeta.enlace) return null;
  if (!tarjeta.enlace.visible) {
    const Candado = ICONO_ESTADO_VENTA.disponible;
    return (
      <span className="flex items-center gap-1.5 text-xs text-fg-secondary" title={t('ventas.acciones.disponibleConDetalle', { modulo: modulo(tarjeta.enlace.modulo) })}>
        <Candado aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
        {t('ventas.acciones.disponibleCon', { modulo: modulo(tarjeta.enlace.modulo) })}
      </span>
    );
  }
  // El icono de la página destino, el mismo de su entrada en el menú.
  const Destino = iconoDestino(tarjeta.enlace.href);
  return (
    <Link href={tarjeta.enlace.href} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
      <Destino aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
      {t(`ventas.acciones.${tarjeta.enlace.texto}`)}
    </Link>
  );
}

/** Interruptor global de reservas (B/10-01): caja con borde dentro de la tarjeta. */
export function InterruptorReservas({
  tarjeta,
  onAlternar,
  ocupado,
}: {
  tarjeta: TarjetaVenta;
  onAlternar?: (activo: boolean) => void;
  ocupado?: boolean;
}) {
  const t = useTextosVentas();
  if (!tarjeta.interruptor) return null;
  const id = 'interruptor-reservas-web';
  const sinFilas = tarjeta.filas.length === 0;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[13px] font-medium leading-5 text-fg">
          {t('ventas.reservas.interruptor')}
        </label>
        <p id={`${id}-ayuda`} className="text-xs leading-4 text-fg-secondary">
          {sinFilas ? t('ventas.reservas.sinConfigurar') : t('ventas.reservas.ayuda')}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-ayuda`}
        checked={tarjeta.interruptor.valor}
        disabled={!tarjeta.interruptor.habilitado || ocupado || !onAlternar}
        onCheckedChange={(v) => onAlternar?.(v)}
      />
    </div>
  );
}

export function TarjetaEstadoVenta({
  tarjeta,
  moneda,
  onEditarCheckout,
  onGestionarTarifas,
  onAlternarReservas,
  reservasOcupado,
  incrustada,
}: TarjetaEstadoVentaProps) {
  const t = useTextosVentas();
  const contenido = (
    <div className="flex flex-col gap-3">
      <FilasVenta filas={tarjeta.filas} moneda={moneda} />
      {tarjeta.tema === 'reservas' && <InterruptorReservas tarjeta={tarjeta} onAlternar={onAlternarReservas} ocupado={reservasOcupado} />}
    </div>
  );
  const pie = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-fg-muted">{t(`ventas.origen.${tarjeta.origen}`)}</span>
      <div className="flex flex-wrap items-center gap-2">
        {tarjeta.tema === 'envios' && tarjeta.enlace?.visible && onGestionarTarifas && (
          <button type="button" onClick={onGestionarTarifas} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Truck aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('ventas.acciones.gestionarTarifas')}
          </button>
        )}
        <AccionTarjeta tarjeta={tarjeta} onEditarCheckout={onEditarCheckout} />
      </div>
    </div>
  );
  if (incrustada) {
    return (
      <div className="flex flex-col gap-4">
        {contenido}
        <div className="border-t border-line pt-3">{pie}</div>
      </div>
    );
  }
  return (
    <Tarjeta
      titulo={t(`ventas.temas.${tarjeta.tema}`)}
      icono={ICONO_TEMA_VENTA[tarjeta.tema]}
      tono={tarjeta.estado === 'falta' ? 'advertencia' : 'neutro'}
      accion={<EstadoVentaBadge tarjeta={tarjeta} />}
      pie={pie}
      className="h-full"
    >
      {contenido}
    </Tarjeta>
  );
}

/** Módulo dueño de cada tema (clave `nav.*` del catálogo) para el error parcial. */
const MODULO_TEMA: Partial<Record<TemaVenta, string>> = {
  envios: 'transport',
  pagos: 'finance',
  pasarela: 'integrations',
  cupones: 'pointOfSale',
  pedidos: 'pointOfSale',
  reservas: 'pointOfSale',
};

/** Error parcial de una tarjeta (B/10-03): las demás siguen al día. */
export function TarjetaVentaConError({ tema, onReintentar, reintentando }: { tema: TemaVenta; onReintentar: () => void; reintentando?: boolean }) {
  const t = useTextosVentas();
  const modulo = useNombreModulo();
  const clave = MODULO_TEMA[tema];
  return (
    <Tarjeta className="h-full" tono="peligro">
      <div role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-danger-subtle text-danger-text">
          <AlertTriangle className={CLASE_TAMANO_ICONO.fila} strokeWidth={TRAZO_ICONO} />
        </span>
        <div>
          <p className="text-sm font-semibold text-fg">{t('ventas.errorTarjeta.titulo', { tema: t(`ventas.temasCortos.${tema}`) })}</p>
          <p className="text-[13px] text-fg-secondary">
            {clave ? t('ventas.errorTarjeta.descripcion', { modulo: modulo(clave) }) : t('ventas.errorTarjeta.descripcionGenerica')}
          </p>
        </div>
        <button type="button" onClick={onReintentar} disabled={reintentando} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <RefreshCw aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, reintentando && 'animate-spin motion-reduce:animate-none')} strokeWidth={TRAZO_ICONO} />
          {t('ventas.reintentar')}
        </button>
      </div>
    </Tarjeta>
  );
}
