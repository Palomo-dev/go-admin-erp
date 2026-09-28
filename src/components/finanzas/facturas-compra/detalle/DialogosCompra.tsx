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
import { Dialogo } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { costoUnitarioCompra } from '@/lib/services/compras/logica';
import type { LineaCompra } from '@/lib/services/compras/lecturasCompras';

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
  onConfirmar: (opciones: { recepcionar: boolean; generar_ds: boolean }) => void;
}) {
  const t = useTranslations('facturasCompra.detalle.confirmar');
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
      primario={{ etiqueta: t('boton'), onClick: () => onConfirmar({ recepcionar, generar_ds: generarDs }), cargando }}
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
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  numero: string;
  lineas: readonly LineaCompra[];
  taxIncluded: boolean;
  moneda: ContextoMoneda;
  cargando: boolean;
  error: string | null;
  onRecepcionar: () => void;
}) {
  const t = useTranslations('facturasCompra.detalle.recepcionar');
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
        onClick: onRecepcionar,
        cargando,
        deshabilitada: conProducto.length === 0,
        motivo: t('sinProductos'),
      }}
    >
      <div className="flex flex-col gap-3">
        {conProducto.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('tabla')}</caption>
              <thead className="bg-subtle text-left text-xs text-fg-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('producto')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('cantidad')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('costo')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {conProducto.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="px-3 py-2 text-fg">{l.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatear(costoUnitarioCompra(l, taxIncluded))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-fg-muted">{t('ayudaCosto')}</p>
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
