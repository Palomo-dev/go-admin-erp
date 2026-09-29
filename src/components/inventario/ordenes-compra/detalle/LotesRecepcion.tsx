'use client';

/**
 * Captura de lotes al recibir una línea de la orden de compra (inventario B8).
 * Lo mínimo para que la recepción lleve lote y vencimiento sin rediseñar el
 * diálogo: filas «código · vence · cantidad», «Agregar lote» y «Elegir lote
 * existente» con el `DialogoLotes` del kit (lotes del producto por
 * `fn_lotes_de_producto`). El servidor (`fn_oc_recepcionar`) valida el reparto,
 * crea los lotes nuevos por `fn_lote_guardar` y rechaza un lote con otro
 * vencimiento: aquí solo se captura.
 *
 * `expiry_date` es un día calendario (`YYYY-MM-DD`): se elige con `CampoFecha`
 * y nunca pasa por `new Date`.
 */
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Layers } from 'lucide-react';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { clasesBoton } from '@/components/kit/botonClases';
import { DialogoLotes } from '@/components/kit/inventario';
import { lotesDeProducto } from '@/components/inventario/lotes/LotesService';
import type { LoteDisponible } from '@/lib/inventario/nucleo/tipos';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import {
  ErrorRecepcionOrdenCompra,
  totalLotes,
  type LoteCapturado,
} from '@/lib/services/inventario/recepcionOrdenCompra';

export interface LotesRecepcionProps {
  organizacionId: number;
  sucursalId: number;
  productoId: number;
  productoNombre: string;
  /** Lo que llega AHORA en la línea (el reparto debe sumar esto). */
  cantidad: number;
  /** El producto maneja lotes: el lote es obligatorio. */
  requerido: boolean;
  valor: LoteCapturado[];
  onChange: (valor: LoteCapturado[]) => void;
  /** «Hoy» en la zona de la organización (`todayInTz`). */
  hoy: string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function LotesRecepcion({
  organizacionId,
  sucursalId,
  productoId,
  productoNombre,
  cantidad,
  requerido,
  valor,
  onChange,
  hoy,
}: LotesRecepcionProps) {
  const t = useTranslations('inventarioRecepcionOC.lotes');
  const [dialogo, setDialogo] = useState(false);
  const [lotes, setLotes] = useState<LoteDisponible[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);

  const asignado = totalLotes(valor);
  const restante = Math.max(0, r3(cantidad - asignado));
  const cuadra = valor.length === 0 ? !requerido : asignado === r3(cantidad);

  const cambiar = (i: number, parcial: Partial<LoteCapturado>) =>
    onChange(valor.map((l, j) => (j === i ? { ...l, ...parcial } : l)));

  const abrirExistentes = useCallback(async () => {
    setErrorCarga(false);
    setDialogo(true);
    try {
      setLotes(await lotesDeProducto(organizacionId, productoId, sucursalId));
    } catch {
      setLotes([]);
      setErrorCarga(true);
    }
  }, [organizacionId, productoId, sucursalId]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3" data-testid={`lotes-recepcion-${productoId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg">
          {t('titulo')}
          {requerido && <span className="ml-1 text-danger-text">*</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void abrirExistentes()}>
            <Layers className="size-4" aria-hidden />
            {t('elegirExistente')}
          </button>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
            onClick={() => onChange([...valor, { lot_code: '', expiry_date: null, qty: restante || cantidad }])}
          >
            <Plus className="size-4" aria-hidden />
            {t('agregar')}
          </button>
        </div>
      </div>

      {valor.length === 0 ? (
        <p className="text-xs text-fg-muted">{requerido ? t('requerido') : t('opcional')}</p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {valor.map((l, i) => {
            const existente = Boolean(l.lot_id);
            return (
              <li key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_6rem_auto] sm:items-center">
                <input
                  type="text"
                  value={l.lot_code ?? ''}
                  readOnly={existente}
                  maxLength={60}
                  placeholder={t('codigoPlaceholder')}
                  aria-label={t('codigo')}
                  onChange={(e) => cambiar(i, { lot_code: e.target.value })}
                  className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg read-only:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <CampoFecha
                  valor={l.expiry_date ?? null}
                  onValorChange={(dia) => cambiar(i, { expiry_date: dia || null })}
                  hoy={hoy}
                  min={existente ? null : hoy}
                  disabled={existente && Boolean(l.expiry_date)}
                  placeholder={t('vence')}
                  aria-label={t('vence')}
                  tamano="sm"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={l.qty}
                  aria-label={t('cantidad', { codigo: l.lot_code || String(i + 1) })}
                  onChange={(e) => cambiar(i, { qty: Math.max(0, Number(e.target.value.replace(',', '.')) || 0) })}
                  className="h-8 rounded-md border border-line-strong bg-surface px-2 text-right text-sm tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <button
                  type="button"
                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                  aria-label={t('quitar', { codigo: l.lot_code || String(i + 1) })}
                  onClick={() => onChange(valor.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {valor.length > 0 && (
        <p className={cuadra ? 'text-xs text-fg-secondary' : 'text-xs text-warning-text'} aria-live="polite">
          {t('asignado', { asignado, total: cantidad })}
          {!cuadra && ` · ${t('noCuadra')}`}
        </p>
      )}

      <DialogoLotes
        abierto={dialogo}
        onAbiertoChange={setDialogo}
        descripcion={errorCarga ? t('errorCarga') : lotes === null ? t('cargando') : t('dialogoDescripcion', { producto: productoNombre })}
        lotes={lotes ?? []}
        hoy={hoy}
        onConfirmar={(elegidos) => {
          const nuevos = elegidos
            .map((a) => (lotes ?? []).find((x) => x.lot_id === a.lot_id))
            .filter((x): x is LoteDisponible => Boolean(x))
            .filter((x) => !valor.some((v) => v.lot_id === x.lot_id))
            .map((x) => ({ lot_id: x.lot_id, lot_code: x.lot_code, expiry_date: x.expiry_date, qty: restante || cantidad }));
          if (nuevos.length > 0) onChange([...valor, ...nuevos]);
        }}
      />
    </div>
  );
}

/** Lote obligatorio sin capturar o reparto que no cuadra: la pantalla no envía. */
export function lotesIncompletos(requerido: boolean, cantidad: number, valor: readonly LoteCapturado[]): boolean {
  if (cantidad <= 0) return false;
  if (valor.length === 0) return requerido;
  return totalLotes(valor) !== r3(cantidad) || valor.some((l) => !(Number(l.qty) > 0));
}

/** Mensaje legible (es/en/fr/pt) de un error de la recepción. */
export function useMensajeErrorRecepcionOC(): (err: unknown) => string {
  const t = useTranslations('inventarioRecepcionOC.errores');
  return useCallback(
    (err: unknown) => {
      if (!(err instanceof ErrorRecepcionOrdenCompra)) return t('error_desconocido');
      const d = err.detalle;
      const o = d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
      const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));
      switch (err.codigo) {
        case 'sobre_recepcion':
          return t('sobre_recepcion', { producto: texto(o.producto), pendiente: Number(o.pendiente ?? 0), solicitado: Number(o.solicitado ?? 0) });
        case 'seriales_no_cuadran':
          return t('seriales_no_cuadran', { producto: texto(o.producto), cantidad: Number(o.cantidad ?? 0), seriales: Number(o.seriales ?? 0) });
        case 'serial_repetido':
          return typeof d === 'string' && d ? t('serial_repetido_cual', { serial: d }) : t('serial_repetido');
        case 'lote_vencimiento_distinto':
          return t('lote_vencimiento_distinto', { lote: texto(o.lot_code), vence: formatPlainDate(texto(o.vence)) });
        case 'lotes_no_cuadran':
          return t('lotes_no_cuadran', { cantidad: Number(o.cantidad ?? 0), lotes: Number(o.lotes ?? 0) });
        default:
          return t(err.codigo);
      }
    },
    [t],
  );
}
