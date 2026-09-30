'use client';

/**
 * Asiento de una factura de compra (Figma «asiento-compra-retenciones»,
 * docs/design/RETENCIONES-COMPRAS.md §6): por qué el proveedor recibe solo el
 * neto y de dónde sale el asiento. Aviso de asiento automático con enlace a la
 * factura, y la cadena OC → factura → pagos → retenciones, cuyo eslabón abre
 * el certificado de retenciones del mes de la factura.
 *
 * Lee la factura con `leerDetalleFacturaCompra` (la misma lectura del detalle
 * de la factura, con la RLS de la sesión); nada se recalcula aquí.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { Tarjeta } from '@/components/kit';
import { CadenaDocumento, type EslabonDocumento } from '@/components/kit/documento';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { leerDetalleFacturaCompra, type DetalleFacturaCompra } from '@/lib/services/compras/lecturasCompras';
import { RUTA_COMPRAS_FINANZAS } from '@/components/finanzas/facturas-compra/rutasCompras';
import { CertificadoRetencionesDialog, rangoMesDe } from '@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog';

export function OrigenCompraAsiento({ facturaId }: { facturaId: string }) {
  const t = useTranslations('asientoContable.origenCompra');
  const moneda = useMonedaOrganizacion();
  const [f, setF] = useState<DetalleFacturaCompra | null>(null);
  const [certificado, setCertificado] = useState(false);
  const { formatDate, getToday, toDate } = useFormatDate(f?.branch_id ?? null);

  useEffect(() => {
    let vigente = true;
    leerDetalleFacturaCompra(getOrganizationId(), facturaId)
      .then((d) => vigente && setF(d))
      .catch((e) => console.error('Error leyendo la factura de compra del asiento:', e));
    return () => {
      vigente = false;
    };
  }, [facturaId]);

  const ctxMoneda = moneda.paraDocumento(f?.currency);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  if (!f) return null;

  const retenido = f.retenciones.reduce((s, r) => s + r.amount, 0);
  const neto = Math.max(0, f.total - retenido);
  const rutaFactura = `${RUTA_COMPRAS_FINANZAS}/${f.id}`;

  const eslabones: EslabonDocumento[] = [];
  if (f.orden) eslabones.push({ id: `oc-${f.orden.id}`, tipo: 'ordenCompra', numero: `OC-${f.orden.id}`, href: `/app/inventario/ordenes-compra/${f.orden.uuid}` });
  eslabones.push({
    id: f.id,
    tipo: 'facturaCompra',
    numero: f.number_ext,
    estado: f.status,
    fecha: formatDate(f.issue_date),
    importe: formatear(f.total),
    href: rutaFactura,
  });
  for (const p of f.pagos.filter((x) => x.status === 'completed').slice(0, 6)) {
    eslabones.push({ id: p.id, tipo: 'pago', numero: p.reference ?? t('pago'), fecha: formatDate(p.payment_date), importe: formatear(p.amount) });
  }
  if (retenido > 0 && f.proveedor) {
    eslabones.push({
      id: 'retenciones',
      tipo: 'recibo',
      etiquetaTipo: t('retenciones'),
      numero: t('verCertificado'),
      importe: `${formatear(retenido)} · ${t('conceptos', { n: f.retenciones.length })}`,
      onClick: () => setCertificado(true),
    });
  }

  return (
    <>
      <Tarjeta
        tono="informacion"
        icono={Info}
        titulo={t('titulo', { numero: f.number_ext })}
        descripcion={
          retenido > 0
            ? t('conRetenciones', { neto: formatear(neto), retenido: formatear(retenido) })
            : t('sinRetenciones', { total: formatear(f.total) })
        }
        accion={
          <Link href={rutaFactura} className="whitespace-nowrap text-sm font-medium text-link underline-offset-2 hover:underline">
            {t('irFactura')}
          </Link>
        }
        className="pb-4"
      />
      <Tarjeta titulo={t('cadena')}>
        <CadenaDocumento eslabones={eslabones} ordenar={false} etiqueta={t('cadena')} className="pb-4" />
      </Tarjeta>
      {f.proveedor && retenido > 0 && (
        <CertificadoRetencionesDialog
          abierto={certificado}
          onAbiertoChange={setCertificado}
          proveedorId={f.proveedor.id}
          proveedorNombre={f.proveedor.name}
          rangoInicial={f.issue_date ? rangoMesDe(toDate(new Date(f.issue_date)), getToday()) : undefined}
        />
      )}
    </>
  );
}
