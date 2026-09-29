'use client';

/**
 * Diálogos del detalle de la factura de compra: confirmar (con «Recepcionar al
 * confirmar» y «Generar documento soporte») y recepcionar a inventario (resumen
 * de lo que entra: cantidad, costo unitario neto y lo que no afecta inventario).
 * Toda la escritura va por los route handlers; el costo definitivo lo calcula la
 * base (D6), aquí solo se muestra la estimación.
 */
import { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, PackageCheck } from 'lucide-react';
import { DataTable, Dialogo } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { costoUnitarioCompra } from '@/lib/services/compras/logica';
import type { LineaCompra } from '@/lib/services/compras/lecturasCompras';
import type { LotesRecepcionFactura } from '@/lib/services/compras/contrato';
import type { LoteCapturado } from '@/lib/services/inventario/recepcionOrdenCompra';
import { LotesDeDocumento, faltanLotes, lotesPorLinea, type LineaConLote } from '@/components/inventario/recepcion/LotesRecepcion';

/**
 * Inventario B8: líneas cuyo producto maneja lotes. Al recibir se captura su
 * lote y vencimiento (obligatorio); la base los valida y crea.
 */
export interface RecepcionConLotes {
  organizacionId: number;
  sucursalId: number;
  hoy: string;
  lineas: readonly LineaConLote[];
}

function useLotesDeRecepcion(abierto: boolean) {
  const [valores, setValores] = useState<Record<string, LoteCapturado[]>>({});
  useEffect(() => {
    if (abierto) setValores({});
  }, [abierto]);
  const cambiar = (clave: string, valor: LoteCapturado[]) => setValores((prev) => ({ ...prev, [clave]: valor }));
  return { valores, cambiar };
}

export function DialogoConfirmarCompra({
  abierto,
  onAbiertoChange,
  numero,
  total,
  moneda,
  hayProductos,
  puedeRecepcionar,
  cargando,
  error,
  onConfirmar,
  recepcion,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  numero: string;
  total: number;
  moneda: ContextoMoneda;
  hayProductos: boolean;
  puedeRecepcionar: boolean;
  cargando: boolean;
  error: string | null;
  onConfirmar: (opciones: { recepcionar: boolean; generar_ds: boolean; lotes?: LotesRecepcionFactura }) => void;
  /** Inventario B8: productos con lotes de esta factura. */
  recepcion?: RecepcionConLotes;
}) {
  const t = useTranslations('facturasCompra.detalle.confirmar');
  const tLotes = useTranslations('inventarioRecepcionOC.lotes');
  const { valores, cambiar } = useLotesDeRecepcion(abierto);
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const [recepcionar, setRecepcionar] = useState(true);
  const [generarDs, setGenerarDs] = useState(false);
  useEffect(() => {
    if (abierto) {
      setRecepcionar(hayProductos && puedeRecepcionar);
      setGenerarDs(false);
    }
  }, [abierto, hayProductos, puedeRecepcionar]);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { numero })}
      descripcion={t('descripcion', { total: formatear(total) })}
      icono={CheckCircle2}
      primario={{
        etiqueta: t('boton'),
        onClick: () =>
          onConfirmar({
            recepcionar,
            generar_ds: generarDs,
            ...(recepcionar && recepcion ? { lotes: lotesPorLinea(recepcion.lineas, valores) } : {}),
          }),
        cargando,
        deshabilitada: Boolean(recepcionar && recepcion && faltanLotes(recepcion.lineas, valores)),
        motivo: tLotes('motivoFaltan'),
      }}
    >
      <div className="flex flex-col gap-3">
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          <li>{t('consecuencias.cuenta')}</li>
          <li>{t('consecuencias.asiento')}</li>
          <li>{t('consecuencias.noEditable')}</li>
        </ul>
        <label className="flex items-start gap-2 text-sm text-fg">
          <Checkbox
            checked={recepcionar}
            disabled={!hayProductos || !puedeRecepcionar}
            onCheckedChange={(v) => setRecepcionar(v === true)}
            className="mt-0.5 size-[18px] rounded"
          />
          <span className="flex flex-col">
            {t('recepcionar')}
            <span className="text-xs text-fg-muted">
              {!hayProductos ? t('recepcionarSinProductos') : !puedeRecepcionar ? t('recepcionarSinPermiso') : t('recepcionarAyuda')}
            </span>
          </span>
        </label>
        {recepcionar && recepcion && (
          <LotesDeDocumento
            organizacionId={recepcion.organizacionId}
            sucursalId={recepcion.sucursalId}
            hoy={recepcion.hoy}
            lineas={recepcion.lineas}
            valores={valores}
            onChange={cambiar}
          />
        )}
        <label className="flex items-start gap-2 text-sm text-fg">
          <Checkbox checked={generarDs} onCheckedChange={(v) => setGenerarDs(v === true)} className="mt-0.5 size-[18px] rounded" />
          <span className="flex flex-col">
            {t('generarDs')}
            <span className="text-xs text-fg-muted">{t('generarDsAyuda')}</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

export function DialogoRecepcionar({
  abierto,
  onAbiertoChange,
  numero,
  lineas,
  taxIncluded,
  moneda,
  cargando,
  error,
  onRecepcionar,
  recepcion,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  numero: string;
  lineas: readonly LineaCompra[];
  taxIncluded: boolean;
  moneda: ContextoMoneda;
  cargando: boolean;
  error: string | null;
  onRecepcionar: (lotes?: LotesRecepcionFactura) => void;
  /** Inventario B8: productos con lotes de esta factura. */
  recepcion?: RecepcionConLotes;
}) {
  const t = useTranslations('facturasCompra.detalle.recepcionar');
  const tLotes = useTranslations('inventarioRecepcionOC.lotes');
  const { valores, cambiar } = useLotesDeRecepcion(abierto);
  const faltan = Boolean(recepcion && faltanLotes(recepcion.lineas, valores));
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const conProducto = lineas.filter((l) => l.product_id !== null && l.qty > 0);
  const sinProducto = lineas.length - conProducto.length;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { numero })}
      descripcion={t('descripcion')}
      icono={PackageCheck}
      ancho={672}
      primario={{
        etiqueta: t('boton'),
        onClick: () => onRecepcionar(recepcion ? lotesPorLinea(recepcion.lineas, valores) : undefined),
        cargando,
        deshabilitada: conProducto.length === 0 || faltan,
        motivo: conProducto.length === 0 ? t('sinProductos') : tLotes('motivoFaltan'),
      }}
    >
      <div className="flex flex-col gap-3">
        {conProducto.length > 0 && (
          <DataTable
            densidad="compacta"
            etiqueta={t('tabla')}
            filas={conProducto}
            obtenerId={(l) => l.id}
            virtualizar={false}
            columnas={[
              { id: 'producto', encabezado: t('producto'), celda: (l) => <span className="text-fg">{l.description}</span> },
              { id: 'cantidad', encabezado: t('cantidad'), variante: 'importe', celda: (l) => l.qty },
              { id: 'costo', encabezado: t('costo'), variante: 'importe', celda: (l) => formatear(costoUnitarioCompra(l, taxIncluded)) },
            ]}
          />
        )}
        <p className="text-xs text-fg-muted">{t('ayudaCosto')}</p>
        {recepcion && (
          <LotesDeDocumento
            organizacionId={recepcion.organizacionId}
            sucursalId={recepcion.sucursalId}
            hoy={recepcion.hoy}
            lineas={recepcion.lineas}
            valores={valores}
            onChange={cambiar}
          />
        )}
        {sinProducto > 0 && <p className="text-sm text-fg-secondary">{t('lineasSinProducto', { n: sinProducto })}</p>}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
