'use client';

/**
 * Convertir una cotización en factura (Figma `1022:95117`,
 * `73-documentos-cotizacion-convertir.png`). La factura nace en BORRADOR
 * (`POST /api/cotizaciones/[id]/convertir` → `fn_cotizacion_convertir` →
 * `fn_factura_venta_guardar`): se revisa y se emite desde su detalle, donde
 * se toma el número de la resolución, se venden los seriales y, si es
 * electrónica, se envía a la DIAN. Aquí solo se elige la sucursal de la
 * factura (por defecto la de la cotización) y se ve qué se copia.
 *
 * Sin la cotización cargada (desde el listado), la lee del servidor.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Info } from 'lucide-react';
import { Dialogo, FilaDato, FormField, ListaDatos } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { CotizacionesService } from '@/lib/services/cotizacionesService';
import type { CotizacionDetalle, ResultadoConversion } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { impuestosPorTarifa } from '@/lib/finanzas/ventas/listadoCotizaciones';
import { nombreImpuesto } from './textoCotizacion';
import { useMensajeErrorCotizacion } from './useMensajeErrorCotizacion';

export interface ConvertirCotizacionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cotizacionId: string;
  cotizacion?: CotizacionDetalle | null;
  onConvertida: (r: ResultadoConversion) => void;
}

export function ConvertirCotizacionDialog({ abierto, onAbiertoChange, cotizacionId, cotizacion: dada, onConvertida }: ConvertirCotizacionDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.cotizaciones.convertir');
  const tv = useTranslations('documentosVenta.cotizaciones');
  const mensajeError = useMensajeErrorCotizacion();
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId } = useBranch();
  const [cot, setCot] = useState<CotizacionDetalle | null>(dada ?? null);
  const [sucursal, setSucursal] = useState<string>('');
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    if (dada) {
      setCot(dada);
      return;
    }
    let cancelado = false;
    CotizacionesService.detalle(cotizacionId)
      .then((c) => !cancelado && setCot(c))
      .catch((e) => !cancelado && setError(mensajeError(e)));
    return () => {
      cancelado = true;
    };
  }, [abierto, dada, cotizacionId, mensajeError]);

  useEffect(() => {
    if (!cot) return;
    const propuesta = cot.branch_id ?? selectedBranchId ?? branches[0]?.id ?? null;
    setSucursal(propuesta != null ? String(propuesta) : '');
  }, [cot, selectedBranchId, branches]);

  const fmt = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(cot?.currency)), [moneda, cot?.currency]);
  const impuestos = useMemo(() => impuestosPorTarifa(cot?.quotation_items ?? []), [cot]);
  const lineas = cot?.quotation_items.length ?? 0;
  const conDescuento = (cot?.quotation_items ?? []).some((i) => (i.discount_amount ?? 0) > 0);

  const convertir = async () => {
    if (!sucursal) return;
    setConvirtiendo(true);
    setError(null);
    try {
      const r = await CotizacionesService.convertToInvoice(cotizacionId, { branchId: Number(sucursal), opportunityId: cot?.opportunity_id ?? null });
      toastSuccess(tv('conversion.titulo'), tv(r.yaConvertida ? 'conversion.yaConvertida' : 'conversion.borrador', { numero: r.numero ?? '' }));
      if (r.faltantes.length > 0) toastWarning(tv('conversion.faltantes', { n: r.faltantes.length }));
      onAbiertoChange(false);
      onConvertida(r);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setConvirtiendo(false);
    }
  };

  const condiciones = [
    cot?.payment_terms ? t('plazo', { dias: cot.payment_terms }) : t('contado'),
    cot?.salesperson_name ? t('vendedor', { nombre: cot.salesperson_name }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !convirtiendo && onAbiertoChange(v)}
      titulo={t('titulo', { numero: cot?.number ?? '' })}
      descripcion={cot ? [cot.customers?.full_name, t('lineas', { count: lineas }), fmt(cot.total)].filter(Boolean).join(' · ') : undefined}
      icono={FileText}
      ancho={560}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void convertir(),
        cargando: convirtiendo,
        deshabilitada: !cot || !sucursal,
        motivo: !sucursal ? t('eligeSucursal') : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('sucursal')} obligatorio ayuda={t('sucursalAyuda')}>
          {(c) => (
            <Select value={sucursal} onValueChange={setSucursal}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('eligeSucursal')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {cot && (
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-2 text-sm font-semibold text-fg">{t('queSeCopia')}</p>
            <ListaDatos>
              <FilaDato etiqueta={t('clienteCondiciones')} valor={condiciones} />
              <FilaDato etiqueta={t('lineasEtiqueta')} valor={conDescuento ? t('lineasConDescuento', { count: lineas }) : String(lineas)} />
              {impuestos.map((i) => (
                <FilaDato key={`${i.codigo}-${i.tarifa}`} etiqueta={`${nombreImpuesto(i.codigo) ?? t('impuesto')} ${i.tarifa} %`} valor={fmt(i.importe)} />
              ))}
              <FilaDato etiqueta={t('total')} valor={fmt(cot.total)} tamano="lg" />
            </ListaDatos>
          </div>
        )}

        <div className="flex gap-3 rounded-lg border border-line-info bg-info-subtle px-4 py-3 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" strokeWidth={1.5} />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-info-text">{t('nacerBorrador')}</p>
            <p className="text-fg-secondary">{t('nacerBorradorDetalle')}</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
