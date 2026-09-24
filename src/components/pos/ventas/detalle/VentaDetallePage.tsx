'use client';

/**
 * Detalle de venta (Figma `332:40219`; web `333:40636`, mesa `333:41394`,
 * anulada `333:42129`, sin sincronizar `333:42840`, cargando `333:43573`, no
 * encontrada `333:44288`, móvil `334:95699`). Paso 16 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md; sustituye a `VentaDetalle.tsx`.
 *
 * - Todo sale de UNA respuesta del servidor (`GET /api/pos/ventas/[id]`):
 *   venta, líneas, factura y NC, pagos, cartera, devoluciones, asientos.
 * - Cadena del documento (venta → factura → CxC → pagos → devolución → NC → asiento).
 * - Barra de 3 acciones + ⋯ con motivo cuando no aplican (`accionesVenta.ts`).
 * - Cobrar con el pago único; devolver con el formulario del agente de
 *   devoluciones; anular con `DialogoMotivo` → `pos_anular_venta_v1`.
 * - Imprimir por el motor de documentos; «Reimprimir en caja» por la cola de
 *   impresión de la estación de caja.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CircleDollarSign, Copy, FileText, Printer, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { BranchBadge, EmptyState, PageHeader, RowActionsMenu, StatusBadge, type AccionFila } from '@/components/kit';
import { CadenaDocumento, type EslabonDocumento } from '@/components/kit/documento';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { BADGE_ESTADO_VENTA } from '@/lib/pos/ventas/estadoVenta';
import { accionesDeVenta, destinoCobro, type DisponibilidadAccion } from '@/lib/pos/ventas/accionesVenta';
import { ErrorPeticionVentas, pedirDetalleVenta } from '@/lib/pos/ventas/clienteVentas';
import type { DetalleVenta } from '@/lib/pos/ventas/detalleServidor';
import { useFechaHoraCaja } from '@/components/pos/cajas/comunesCaja';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { AnularVentaDialog } from '../AnularVentaDialog';
import { DevolucionPanel } from './DevolucionPanel';
import {
  TarjetaAsientos,
  TarjetaCliente,
  TarjetaComision,
  TarjetaCuentaPorCobrar,
  TarjetaDevoluciones,
  TarjetaFactura,
  TarjetaHistorial,
  TarjetaMesa,
  TarjetaNotas,
  TarjetaPagos,
  TarjetaPedido,
  TarjetaProductos,
  TarjetaResumen,
} from './tarjetasVenta';

const RUTA = '/app/pos/ventas';

export function VentaDetallePage({ ventaId }: { ventaId: string }) {
  const t = useTranslations('posVentas');
  const router = useRouter();
  const params = useSearchParams();
  const moneda = useMonedaOrganizacion();
  const fechaHora = useFechaHoraCaja();
  const formatear = useCallback((v: number) => moneda.formatear(v), [moneda]);

  const [venta, setVenta] = useState<DetalleVenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [cobrar, setCobrar] = useState(false);
  const [anular, setAnular] = useState(false);
  const [devolver, setDevolver] = useState(false);
  const [reimprimiendo, setReimprimiendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    pedirDetalleVenta(ventaId)
      .then((v) => {
        if (!vigente) return;
        setVenta(v);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionVentas ? e.codigo : 'lectura_fallida'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [ventaId, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const fila = useMemo(
    () =>
      venta
        ? {
            estado: venta.estado,
            origen: venta.origen,
            saldo: venta.saldo,
            devuelto: venta.devuelto,
            factura_id: venta.factura?.id ?? null,
            cxc_id: venta.cxc?.id ?? null,
          }
        : null,
    [venta],
  );
  const acciones = useMemo(() => (venta && fila ? accionesDeVenta(fila, venta.permisos) : null), [venta, fila]);

  // «Crear devolución» desde el menú del listado llega con ?devolver=1.
  useEffect(() => {
    if (acciones?.devolver.habilitada && params?.get('devolver') === '1') setDevolver(true);
  }, [acciones, params]);

  const numero = venta ? (venta.numero.tipo === 'sin_numero' ? null : venta.numero.numero) : null;
  const titulo = numero ?? t('listado.sinNumero');
  const migas = [
    { etiqueta: t('listado.migas.pos'), href: '/app/pos' },
    { etiqueta: t('listado.titulo'), href: RUTA },
    { etiqueta: venta ? titulo : '…' },
  ];

  if (cargando && !venta) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('detalle.cargando')} variante="detail" migas={migas} icono={Receipt} volverA={RUTA} cargando />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !venta || !acciones || !fila) {
    const noExiste = error === 'venta_no_encontrada' || error === 'venta_invalida';
    const sinRed = error === 'sin_red';
    const tituloError = noExiste ? t('detalle.noExiste.titulo') : sinRed ? t('detalle.sinRed.titulo') : t('detalle.error');
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={tituloError} variante="detail" migas={migas} icono={Receipt} volverA={RUTA} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante={noExiste || sinRed ? 'empty' : 'error'}
            titulo={tituloError}
            descripcion={noExiste ? t('detalle.noExiste.descripcion') : sinRed ? t('detalle.sinRed.descripcion') : undefined}
            onReintentar={noExiste ? undefined : recargar}
            accion={{ etiqueta: t('detalle.volver'), href: RUTA }}
          />
        </div>
      </div>
    );
  }

  const motivo = (d: DisponibilidadAccion) => (d.motivo ? t(`listado.motivos.${d.motivo}`) : undefined);
  const destino = destinoCobro(fila);

  const reimprimirEnCaja = async () => {
    setReimprimiendo(true);
    try {
      const r = await PrintJobsService.enqueueSaleTicket(venta.sucursal.id, {
        saleId: venta.id,
        saleNumber: numero ?? undefined,
        currency: moneda.code,
        customerName: venta.cliente?.nombre ?? undefined,
        customerDocNumber: venta.cliente?.documento ?? undefined,
        createdAt: venta.fecha,
        total: venta.total,
        subtotal: venta.subtotal,
        taxTotal: venta.impuestos,
        discountTotal: venta.descuentos,
        tipAmount: venta.propina,
        deliveryFee: venta.envio,
        cashierName: venta.cajero.nombre ?? undefined,
        totalPaid: venta.pagado,
        items: venta.lineas.map((l) => ({
          productName: l.nombre ?? t('detalle.productos.sinNombre'),
          quantity: l.cantidad,
          unitPrice: l.precio,
          total: l.total,
          taxAmount: l.impuesto,
          discountAmount: l.descuento,
          note: l.nota,
        })),
        payments: venta.pagos.filter((p) => p.estado === 'completed' || !p.estado).map((p) => ({ method: p.metodo ?? 'other', amount: p.monto })),
      });
      if (r.enqueued > 0 || r.printedLocally > 0) toastSuccess(t('detalle.reimpresion.enviada'));
      else toastError(t('detalle.reimpresion.sinImpresora'));
    } catch {
      toastError(t('detalle.reimpresion.error'));
    } finally {
      setReimprimiendo(false);
    }
  };

  const botonPrincipal = acciones.cobrar.visible
    ? { id: 'cobrar', etiqueta: t('listado.acciones.cobrar'), icono: CircleDollarSign, d: acciones.cobrar, onClick: () => destino && setCobrar(true) }
    : { id: 'devolver', etiqueta: t('listado.acciones.devolver'), icono: Undo2, d: acciones.devolver, onClick: () => setDevolver(true) };

  const masAcciones: AccionFila[] = [
    {
      id: 'pdf',
      etiqueta: t('detalle.acciones.pdf'),
      icono: FileText,
      onSelect: () => venta.factura && abrirDocumento('factura-venta', venta.factura.id),
      deshabilitada: !acciones.imprimir.habilitada,
      motivo: motivo(acciones.imprimir),
    },
    {
      id: 'reimprimir',
      etiqueta: t('detalle.acciones.reimprimirCaja'),
      icono: Printer,
      onSelect: () => void reimprimirEnCaja(),
      deshabilitada: reimprimiendo || venta.estado === 'anulada',
      motivo: venta.estado === 'anulada' ? t('detalle.motivoAnulada') : t('detalle.reimpresion.enviando'),
    },
    {
      id: 'devolver',
      etiqueta: t('listado.acciones.devolver'),
      icono: Undo2,
      onSelect: () => setDevolver(true),
      oculta: botonPrincipal.id === 'devolver' || !acciones.devolver.visible,
      deshabilitada: !acciones.devolver.habilitada,
      motivo: motivo(acciones.devolver),
    },
    {
      id: 'duplicar',
      etiqueta: t('listado.acciones.duplicar'),
      icono: Copy,
      onSelect: () => router.push(`${RUTA}/nuevo?duplicar=${venta.id}`),
      deshabilitada: !acciones.duplicar.habilitada,
      motivo: motivo(acciones.duplicar),
    },
    {
      id: 'anular',
      etiqueta: t('listado.acciones.anular'),
      icono: Ban,
      destructiva: true,
      separadorAntes: true,
      onSelect: () => setAnular(true),
      oculta: !acciones.anular.visible,
      deshabilitada: !acciones.anular.habilitada,
      motivo: motivo(acciones.anular),
    },
  ];

  const eslabones: EslabonDocumento[] = [
    { id: `venta-${venta.id}`, tipo: 'venta', numero: titulo, estado: BADGE_ESTADO_VENTA[venta.estado], fecha: fechaHora(venta.fecha), importe: formatear(venta.total), actual: true },
    ...(venta.pedido
      ? [{ id: `pedido-${venta.pedido.id}`, tipo: 'pedido' as const, numero: venta.pedido.numero ?? '—', href: `/app/pos/pedidos-online/${venta.pedido.id}` }]
      : []),
    ...(venta.factura
      ? [
          {
            id: `factura-${venta.factura.id}`,
            tipo: 'factura' as const,
            numero: venta.factura.numero ?? '—',
            estado: venta.factura.estado,
            importe: formatear(venta.factura.total),
            href: `/app/finanzas/facturas-venta/${venta.factura.id}`,
          },
        ]
      : []),
    ...(venta.cxc
      ? [
          {
            id: `cxc-${venta.cxc.id}`,
            tipo: 'cuentaPorCobrar' as const,
            numero: t('listado.cxc'),
            estado: venta.cxc.estado,
            importe: formatear(venta.cxc.saldo),
            href: `/app/finanzas/cuentas-por-cobrar/${venta.cxc.id}`,
          },
        ]
      : []),
    ...venta.pagos.map((p) => ({ id: `pago-${p.id}`, tipo: 'pago' as const, numero: fechaHora(p.fecha), importe: formatear(p.monto), estado: p.estado })),
    ...venta.devoluciones.map((d) => ({ id: `dev-${d.id}`, tipo: 'devolucion' as const, numero: `#${d.id}`, importe: formatear(d.total), estado: d.estado })),
    ...venta.notas_credito.map((n) => ({
      id: `nc-${n.id}`,
      tipo: 'notaCredito' as const,
      numero: n.numero ?? '—',
      importe: formatear(n.total),
      href: `/app/finanzas/facturas-venta/${n.id}`,
    })),
    ...venta.asientos.map((a) => ({ id: `asiento-${a.id}`, tipo: 'asiento' as const, numero: `#${a.id}`, href: `/app/finanzas/contabilidad/asientos/${a.id}` })),
  ];

  const anulada = venta.estado === 'anulada';

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={titulo}
        subtitulo={t('detalle.subtitulo', { fecha: fechaHora(venta.fecha), origen: t(`listado.origenes.${venta.origen}`) })}
        icono={Receipt}
        variante="detail"
        volverA={RUTA}
        migas={migas}
        cargando={cargando}
        badge={<StatusBadge estado={BADGE_ESTADO_VENTA[venta.estado]} etiqueta={t(`estados.${venta.estado}`)} />}
        acciones={
          <>
            <Button variant="outline" className="h-10 gap-2" onClick={recargar} disabled={cargando} aria-label={t('listado.actualizar')}>
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </Button>
            <Button
              variant="outline"
              className="h-10 gap-2"
              disabled={!acciones.imprimir.habilitada}
              title={motivo(acciones.imprimir)}
              onClick={() => venta.factura && imprimirDocumento('factura-venta', venta.factura.id, { papel: '80mm' })}
            >
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('listado.acciones.imprimir')}
            </Button>
            {botonPrincipal.d.visible && (
              <Button className="h-10 gap-2" disabled={!botonPrincipal.d.habilitada} title={motivo(botonPrincipal.d)} onClick={botonPrincipal.onClick}>
                <botonPrincipal.icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {botonPrincipal.etiqueta}
              </Button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={titulo} acciones={masAcciones} />
          </>
        }
        movil={{
          accion: <RowActionsMenu orientacion="horizontal" tamano="md" titulo={titulo} acciones={[...masAcciones]} />,
        }}
        debajo={
          <>
            <BranchBadge alcance="una" nombre={venta.sucursal.nombre ?? t('detalle.sucursalNumero', { id: venta.sucursal.id })} />
            <span className="text-xs text-fg-secondary">{t('detalle.cajero', { nombre: venta.cajero.nombre ?? '—' })}</span>
          </>
        }
      />

      {anulada && (
        <p role="status" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {venta.notas_credito.length > 0 ? t('detalle.avisoAnuladaNc', { numero: venta.notas_credito[0].numero ?? '' }) : t('detalle.avisoAnulada')}
        </p>
      )}
      {venta.estado === 'pendiente_sincronizar' && (
        <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
          {t('listado.motivos.pendiente_sincronizar')}
        </p>
      )}

      <section aria-label={t('detalle.cadena')} className="overflow-x-auto rounded-xl border border-line bg-surface p-3">
        <CadenaDocumento eslabones={eslabones} etiqueta={t('detalle.cadena')} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <TarjetaProductos venta={venta} formatear={formatear} />
          <TarjetaPagos venta={venta} formatear={formatear} />
          <TarjetaDevoluciones venta={venta} formatear={formatear} />
          <TarjetaHistorial venta={venta} formatear={formatear} />
          <TarjetaNotas venta={venta} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TarjetaResumen venta={venta} formatear={formatear} />
          <TarjetaCliente venta={venta} />
          <TarjetaMesa venta={venta} />
          <TarjetaPedido venta={venta} />
          <TarjetaFactura venta={venta} formatear={formatear} />
          <TarjetaCuentaPorCobrar venta={venta} formatear={formatear} />
          <TarjetaComision venta={venta} formatear={formatear} />
          <TarjetaAsientos venta={venta} />
        </div>
      </div>

      {cobrar && destino && (
        <RegistrarPagoConectado
          abierto
          onAbiertoChange={(v) => !v && setCobrar(false)}
          destino={destino}
          origen="venta_pos"
          onRegistrado={recargar}
        />
      )}
      <AnularVentaDialog
        abierto={anular}
        onAbiertoChange={setAnular}
        venta={{ id: venta.id, numero, facturada: !!venta.factura }}
        onAnulada={recargar}
      />
      <DevolucionPanel
        abierto={devolver}
        onAbiertoChange={(v) => {
          setDevolver(v);
          if (!v && params?.get('devolver') === '1') router.replace(`${RUTA}/${venta.id}`);
        }}
        ventaId={venta.id}
        numero={numero}
        onDevuelta={recargar}
      />
    </div>
  );
}
