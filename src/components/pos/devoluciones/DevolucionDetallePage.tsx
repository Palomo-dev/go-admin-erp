'use client';

/**
 * Detalle de una devolución (Figma `874:578562`; ruta nueva
 * `/app/pos/devoluciones/[id]`, que ya enlazaban Inventario › Movimientos y la
 * cadena de la venta). Todo sale de UNA respuesta (`GET /api/pos/devoluciones/[id]`).
 *
 * - Cabecera de detalle con badges (estado, nota crédito ante la DIAN si se
 *   envió, parcial/total) y la Cadena del documento: venta → factura → cobros
 *   → devolución → nota crédito → asientos.
 * - Columna principal: Productos devueltos, Reintegro (con enlaces al
 *   movimiento de caja, la nota crédito y el asiento) e Historial.
 * - Columna lateral: Venta original y Motivo.
 * - Menú ⋯ (Figma 2721:955): imprimir comprobante y «Anular devolución…»
 *   (`AnularDevolucionDialog`); `?anular=1` lo abre al llegar desde el listado.
 * - «Reenviar nota crédito a la DIAN» en el ⋯ solo si la DIAN la rechazó o
 *   su envío falló: reutiliza el reintento de la cola (`reintentarEnvioDian`,
 *   `POST /api/factus/jobs`, permiso finance.create en el servidor).
 * - Cadena Venta → Devolución → NC → Venta nueva («Registrar venta nueva»,
 *   `sales.resale_of_return_id`).
 * - Anulada (Figma 2721:17): badge «Anulada», aviso rojo con quién, cuándo y
 *   por qué, y el asiento espejo, el ingreso de caja y la nota en el historial.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, ClipboardList, History, Package, Printer, Receipt, RefreshCw, Send, Undo2, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  BranchBadge,
  DataTable,
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { CadenaDocumento, type EslabonDocumento } from '@/components/kit/documento';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { imprimirDocumento } from '@/lib/documents/cliente';
import { reintentarEnvioDian } from '@/lib/finanzas/notas/clienteNotas';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { reenvioNotaCredito } from '@/lib/pos/devoluciones/anularDevolucionLogica';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { BADGE_ESTADO_VENTA } from '@/lib/pos/ventas/estadoVenta';
import { useFechaHoraCaja } from '@/components/pos/cajas/comunesCaja';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';
import { BADGE_ESTADO_DEVOLUCION, esParcial, estadoDevolucion } from '@/lib/pos/devoluciones/presentacionDevoluciones';
import { ErrorPeticionDevoluciones, pedirDetalleDevolucion } from '@/lib/pos/devoluciones/clienteDevoluciones';
import type { DetalleDevolucion, EventoHistorial, LineaDetalleDevolucion } from '@/lib/pos/devoluciones/detalleServidor';
import { BadgeEstadoDevolucion } from './BadgeEstadoDevolucion';
import { EnlaceFichaProducto } from '@/components/inventario/productos/EnlaceFichaProducto';
import { enlaceLineaProducto } from '@/lib/inventario/enlaceProducto';
import { AnularDevolucionDialog } from './AnularDevolucionDialog';

const RUTA = '/app/pos/devoluciones';

export function DevolucionDetallePage({ devolucionId }: { devolucionId: string }) {
  const t = useTranslations('posDevoluciones.detalle');
  const tl = useTranslations('posDevoluciones.listado');
  const tVentas = useTranslations('posVentas.estados');
  const ta = useTranslations('posDevolucionesAnular');
  const router = useRouter();
  const params = useSearchParams();
  const [anular, setAnular] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const { formatear } = useMonedaOrganizacion();
  const fechaHora = useFechaHoraCaja();
  const { timezone } = useFormatDate();
  const locale = useLocaleIntl();
  const etiquetaMetodo = useEtiquetaMetodoPago();

  const [dev, setDev] = useState<DetalleDevolucion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    pedirDetalleDevolucion(devolucionId)
      .then((d) => {
        if (!vigente) return;
        setDev(d);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionDevoluciones ? e.codigo : 'lectura_fallida'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [devolucionId, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  // `?anular=1` (menú de la fila del listado): abre el diálogo una vez cargado el detalle.
  const pideAnular = params?.get('anular') === '1';
  useEffect(() => {
    if (pideAnular && dev && dev.estado !== 'cancelled') setAnular(true);
  }, [pideAnular, dev]);
  const cambiarAnular = (abierto: boolean) => {
    setAnular(abierto);
    if (!abierto && pideAnular) router.replace(`${RUTA}/${devolucionId}`);
  };
  const hora = (v: string | null) => (v ? formatDateTimeInTz(v, timezone, { locale, hour: '2-digit', minute: '2-digit' }) : '');
  const cantidad = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v);
  const migas = [
    { etiqueta: tl('migas.pos'), href: '/app/pos' },
    { etiqueta: tl('migas.devoluciones'), href: RUTA },
    { etiqueta: dev?.numero ?? '…' },
  ];

  if (cargando && !dev) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('cargando')} variante="detail" migas={migas} icono={Undo2} volverA={RUTA} cargando />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !dev) {
    const noExiste = error === 'devolucion_no_encontrada' || error === 'devolucion_invalida';
    const sinPermiso = error === 'sin_permiso';
    const titulo = noExiste ? t('noExiste.titulo') : sinPermiso ? tl('sinPermiso.titulo') : t('error');
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={titulo} variante="detail" migas={migas} icono={Undo2} volverA={RUTA} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante={noExiste ? 'empty' : sinPermiso ? 'forbidden' : 'error'}
            titulo={titulo}
            descripcion={noExiste ? t('noExiste.descripcion') : undefined}
            onReintentar={noExiste || sinPermiso ? undefined : recargar}
            accion={{ etiqueta: t('volver'), href: RUTA }}
          />
        </div>
      </div>
    );
  }

  const estado = estadoDevolucion(dev.estado);
  const factura = dev.venta.factura;
  const nc = dev.nota_credito;
  const metodoTexto =
    dev.metodo === 'cash'
      ? dev.caja
        ? tl('metodoCaja', { sesion: dev.caja.sesion_id })
        : tl('metodos.cash')
      : tl(`metodos.${dev.metodo === 'store_credit' ? 'store_credit' : 'sin_definir'}`);
  const parcial = esParcial(dev.unidades, dev.unidades_vendidas);

  const eslabones: EslabonDocumento[] = [
    {
      id: `venta-${dev.venta.id}`,
      tipo: 'venta',
      numero: factura?.numero ?? tl('ventaSinNumero'),
      estado: BADGE_ESTADO_VENTA[dev.venta.estado],
      fecha: dev.venta.fecha ? fechaHora(dev.venta.fecha) : null,
      importe: formatear(dev.venta.total),
      href: `/app/pos/ventas/${dev.venta.id}`,
    },
    ...(factura
      ? [{ id: `factura-${factura.id}`, tipo: 'factura' as const, numero: factura.numero ?? '—', estado: factura.estado, importe: formatear(factura.total), href: `/app/finanzas/facturas-venta/${factura.id}` }]
      : []),
    ...dev.venta.cobros.map((p) => ({
      id: `pago-${p.id}`,
      tipo: 'pago' as const,
      numero: p.metodo ? etiquetaMetodo(p.metodo) : '—',
      fecha: p.fecha ? fechaHora(p.fecha) : null,
      importe: formatear(p.monto),
      estado: p.estado,
    })),
    { id: `dev-${dev.id}`, tipo: 'devolucion', numero: dev.numero, estado: BADGE_ESTADO_DEVOLUCION[estado], importe: formatear(dev.total), actual: true },
    ...(nc
      ? [{ id: `nc-${nc.id}`, tipo: 'notaCredito' as const, numero: nc.numero ?? '—', estado: nc.einvoice_status ?? nc.estado, importe: formatear(nc.total), href: `/app/finanzas/facturas-venta/${nc.id}` }]
      : []),
    // Venta nueva que revende esta devolución (Venta → Devolución → NC → Venta nueva).
    ...(dev.ventas_nuevas ?? []).map((v) => ({
      id: `venta-nueva-${v.id}`,
      tipo: 'venta' as const,
      etiquetaTipo: ta('cadena.ventaNueva'),
      numero: v.numero ?? tl('ventaSinNumero'),
      estado: BADGE_ESTADO_VENTA[v.estado],
      fecha: v.fecha ? fechaHora(v.fecha) : null,
      importe: formatear(v.total),
      href: `/app/pos/ventas/${v.id}`,
    })),
    ...dev.asientos.map((a) => ({ id: `asiento-${a.id}`, tipo: 'asiento' as const, numero: a.numero, href: `/app/finanzas/contabilidad/asientos/${a.id}` })),
  ];

  // El producto abre su ficha (Figma 2724:191376); eliminado, sin enlace y con sello.
  const enlaceDe = (l: LineaDetalleDevolucion) =>
    enlaceLineaProducto({ id: l.producto.id, parent_product_id: l.producto.padre_id ?? null, status: l.producto.eliminado ? 'deleted' : null });

  const columnas: ColumnaTabla<LineaDetalleDevolucion>[] = [
    {
      id: 'producto',
      encabezado: t('colProducto'),
      celda: (l) => (
        <div className="flex min-w-0 flex-col">
          <EnlaceFichaProducto nombre={l.producto.nombre ?? t('sinDato')} enlace={enlaceDe(l)} className="text-sm" />
          <span className="truncate text-xs text-fg-secondary">
            {[l.producto.sku, l.linea_venta && factura?.numero ? t('lineaDe', { n: l.linea_venta, factura: factura.numero }) : null].filter(Boolean).join(' · ')}
          </span>
          {l.seriales.length > 0 && <span className="truncate text-xs text-fg-secondary">{t('serialesLinea', { lista: l.seriales.map((s) => s.codigo).join(', ') })}</span>}
        </div>
      ),
    },
    { id: 'cantidad', encabezado: t('colCantidad'), alinear: 'derecha', celda: (l) => cantidad(l.cantidad) },
    { id: 'neto', encabezado: t('colNeto'), variante: 'importe', ocultarDebajo: 'md', celda: (l) => formatear(l.neto) },
    { id: 'impuesto', encabezado: t('colImpuesto'), variante: 'importe', ocultarDebajo: 'md', celda: (l) => formatear(l.impuesto) },
    { id: 'reintegro', encabezado: t('colReintegro'), variante: 'importe', celda: (l) => formatear(l.reintegro) },
    {
      id: 'inventario',
      encabezado: t('colInventario'),
      className: 'whitespace-nowrap',
      celda: (l) => <StatusBadge estado={l.repuesta ? 'completada' : 'no aplica'} etiqueta={l.repuesta ? t('repuesto') : t('noRepuesto')} />,
    },
  ];

  const textoEvento = (e: EventoHistorial) => {
    switch (e.tipo) {
      case 'creada':
        return t('eventos.creada');
      case 'egreso_caja':
        return t('eventos.egreso_caja', { sesion: e.sesion ?? '—' });
      case 'nota_credito':
        return t('eventos.nota_credito', { numero: e.numero ?? '—' });
      case 'saldo_a_favor':
        return t('eventos.saldo_a_favor');
      case 'asiento':
        return t('eventos.asiento', { numero: e.numero });
      case 'anulada':
        return ta('detalle.eventos.anulada', { motivo: e.motivo });
      case 'espejo':
        if (e.numeros && e.monto !== null) return ta('detalle.eventos.espejoIngreso', { numeros: e.numeros, monto: formatear(e.monto), sesion: e.sesion ?? '—' });
        if (e.monto !== null) return ta('detalle.eventos.ingreso', { monto: formatear(e.monto), sesion: e.sesion ?? '—' });
        return ta('detalle.eventos.espejo', { numeros: e.numeros });
    }
  };
  const actorEvento = (e: EventoHistorial) =>
    e.tipo === 'creada' || e.tipo === 'anulada' ? e.usuario ?? t('sinDato') : t('sistema');

  const anulada = estado === 'cancelled';
  const anulacion = dev.anulacion ?? null;
  const avisoAnulada = anulacion
    ? {
        titulo: anulacion.usuario.nombre
          ? ta('detalle.avisoTitulo', { fecha: fechaHora(anulacion.fecha), usuario: anulacion.usuario.nombre, motivo: anulacion.motivo })
          : ta('detalle.avisoTituloSinUsuario', { fecha: fechaHora(anulacion.fecha), motivo: anulacion.motivo }),
        texto: [
          anulacion.espejos.length
            ? ta('detalle.avisoEspejo', {
                numeros: anulacion.espejos.map((e) => (e.fecha ? `${e.numero} (${fechaHora(e.fecha)})` : e.numero)).join(', '),
              })
            : null,
          anulacion.ingreso_caja ? ta('detalle.avisoIngreso', { monto: formatear(anulacion.ingreso_caja.monto), sesion: anulacion.ingreso_caja.sesion ?? '—' }) : null,
          anulacion.unidades_retiradas > 0 ? ta('detalle.avisoUnidades', { unidades: anulacion.unidades_retiradas }) : null,
          nc ? ta(nc.einvoice_status === 'rejected' ? 'detalle.avisoNotaRechazada' : 'detalle.avisoNota', { numero: nc.numero ?? '—' }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    : null;

  const reenvio = reenvioNotaCredito(nc, { anulada, permiso: dev.permisos?.reenviar_nc === true });
  const reenviarNota = async () => {
    if (!reenvio.visible || !reenvio.permitido) return;
    setReenviando(true);
    try {
      await reintentarEnvioDian(reenvio.jobId);
      toastSuccess(ta('menu.reenviada', { numero: nc?.numero ?? '—' }));
      recargar();
    } catch {
      toastError(ta('menu.errorReenvio'));
    } finally {
      setReenviando(false);
    }
  };

  const accionesMenu: AccionFila[] = [
    {
      id: 'imprimir',
      etiqueta: ta('menu.imprimir'),
      icono: Printer,
      deshabilitada: !nc,
      motivo: tl('motivosAccion.sinNc'),
      onSelect: () => nc && imprimirDocumento('nota-credito', nc.id),
    },
    {
      id: 'reenviar',
      etiqueta: ta('menu.reenviar'),
      icono: Send,
      oculta: !reenvio.visible,
      deshabilitada: reenviando || (reenvio.visible && !reenvio.permitido),
      motivo: reenviando ? ta('menu.reenviando') : ta('menu.motivoSinPermisoFinanzas'),
      onSelect: () => void reenviarNota(),
    },
    {
      id: 'anular',
      etiqueta: ta('menu.anular'),
      descripcion: anulada ? undefined : ta('menu.anularAyuda'),
      icono: Ban,
      destructiva: true,
      deshabilitada: anulada,
      motivo: ta('menu.motivoAnulada'),
      onSelect: () => setAnular(true),
    },
  ];

  const subtitulo = dev.usuario.nombre
    ? t('subtitulo', { fecha: fechaHora(dev.fecha), sucursal: dev.sucursal.nombre ?? '—', usuario: dev.usuario.nombre })
    : t('subtituloSinUsuario', { fecha: fechaHora(dev.fecha), sucursal: dev.sucursal.nombre ?? '—' });

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo', { numero: dev.numero })}
        subtitulo={subtitulo}
        icono={Undo2}
        variante="detail"
        volverA={RUTA}
        migas={migas}
        cargando={cargando}
        badge={<BadgeEstadoDevolucion estado={dev.estado} tamano="md" />}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} disabled={cargando} aria-label={tl('actualizar')} title={tl('actualizar')}>
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </Button>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={dev.numero} acciones={accionesMenu} />
          </>
        }
        debajo={
          <>
            <BranchBadge alcance="una" nombre={dev.sucursal.nombre ?? t('sinDato')} />
            {nc?.einvoice_status && <StatusBadge estado={nc.einvoice_status} etiqueta={t('ncEstado', { estado: nc.einvoice_status })} />}
            <Badge tono="neutro" apariencia="suave" tamano="sm">
              {t(parcial ? 'parcial' : 'total', { unidades: cantidad(dev.unidades), vendidas: cantidad(dev.unidades_vendidas) })}
            </Badge>
          </>
        }
      />

      {avisoAnulada && <AvisoTonal tono="peligro" titulo={avisoAnulada.titulo} descripcion={avisoAnulada.texto || undefined} />}

      <section aria-label={t('cadena')} className="overflow-x-auto rounded-xl border border-line bg-surface p-3">
        {/* Orden propio: la venta nueva va después de la nota crédito, no al principio. */}
        <CadenaDocumento eslabones={eslabones} etiqueta={t('cadena')} ordenar={false} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Tarjeta titulo={t('productos', { n: dev.lineas.length })} icono={Package} sinRelleno>
            <DataTable
              etiqueta={t('productos', { n: dev.lineas.length })}
              columnas={columnas}
              filas={dev.lineas}
              obtenerId={(l) => String(l.id)}
              estado={dev.lineas.length ? 'listo' : 'vacio'}
              vacio={{ titulo: t('sinLineas') }}
              tarjetaMovil={(l) => (
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <EnlaceFichaProducto nombre={l.producto.nombre ?? t('sinDato')} enlace={enlaceDe(l)} className="text-sm" />
                    <p className="text-xs text-fg-secondary">
                      {cantidad(l.cantidad)} · {l.repuesta ? t('repuesto') : t('noRepuesto')}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-fg">{formatear(l.reintegro)}</span>
                </div>
              )}
            />
          </Tarjeta>

          <Tarjeta titulo={t('reintegro')} icono={Wallet}>
            <ListaDatos etiqueta={t('reintegro')}>
              <FilaDato etiqueta={t('metodo')} valor={metodoTexto} />
              {dev.caja && (
                <FilaDato
                  etiqueta={t('movimientoCaja')}
                  valor={dev.caja.movimiento ? t('movimientoTexto', { monto: formatear(dev.caja.movimiento.monto), hora: hora(dev.caja.movimiento.fecha), numero: dev.numero }) : t('sinDato')}
                  tono={dev.caja.movimiento ? 'enlace' : 'neutro'}
                  href={dev.caja.movimiento ? `/app/pos/cajas/${dev.caja.sesion_id}` : undefined}
                />
              )}
              {dev.saldo_a_favor && (
                <FilaDato
                  etiqueta={t('saldoFavor')}
                  valor={t('saldoTexto', { monto: formatear(dev.saldo_a_favor.monto), saldo: formatear(dev.saldo_a_favor.saldo) })}
                />
              )}
              <FilaDato
                etiqueta={t('notaCredito')}
                valor={nc ? t('ncTexto', { numero: nc.numero ?? '—', monto: formatear(nc.total) }) : t('sinDato')}
                tono={nc ? 'enlace' : 'neutro'}
                href={nc ? `/app/finanzas/facturas-venta/${nc.id}` : undefined}
              />
              {dev.asientos.length > 0 ? (
                dev.asientos.map((a) => (
                  <FilaDato key={a.id} etiqueta={t('asiento')} valor={[a.numero, a.memo].filter(Boolean).join(' · ')} tono="enlace" href={`/app/finanzas/contabilidad/asientos/${a.id}`} />
                ))
              ) : (
                <FilaDato etiqueta={t('asiento')} valor={t('sinDato')} />
              )}
              <FilaDato etiqueta={t('totalReintegrado')} valor={formatear(dev.total)} tono="fuerte" tamano="lg" separadorAntes />
            </ListaDatos>
          </Tarjeta>

          <Tarjeta titulo={t('historial')} icono={History}>
            <ListaDatos etiqueta={t('historial')}>
              {dev.historial.map((e, i) => (
                <FilaDato key={`${e.tipo}-${i}`} etiqueta={`${hora(e.fecha)} · ${actorEvento(e)}`} valor={textoEvento(e)} />
              ))}
            </ListaDatos>
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={t('ventaOriginal')} icono={Receipt}>
            <ListaDatos etiqueta={t('ventaOriginal')}>
              <FilaDato
                etiqueta={t('cliente')}
                valor={dev.venta.cliente?.nombre ?? tl('consumidorFinal')}
                tono={dev.venta.cliente ? 'enlace' : 'neutro'}
                href={dev.venta.cliente ? `/app/clientes/${dev.venta.cliente.id}` : undefined}
              />
              <FilaDato etiqueta={t('fecha')} valor={dev.venta.fecha ? fechaHora(dev.venta.fecha) : t('sinDato')} />
              <FilaDato etiqueta={t('totalVenta')} valor={formatear(dev.venta.total)} />
              <FilaDato etiqueta={t('devueltoAntes')} valor={formatear(dev.venta.devuelto_antes)} />
              <FilaDato
                etiqueta={t('devueltoAhora')}
                valor={anulada ? ta('detalle.devueltoAnulada', { monto: formatear(0) }) : formatear(dev.total)}
                tono="peligro"
              />
              <FilaDato
                etiqueta={t('estadoVenta')}
                valor={anulada ? ta('detalle.estadoVentaAnulada', { estado: tVentas(dev.venta.estado) }) : tVentas(dev.venta.estado)}
                tono={anulada || dev.venta.estado === 'devuelta_parcial' ? 'advertencia' : dev.venta.estado === 'devuelta' ? 'peligro' : 'neutro'}
              />
            </ListaDatos>
          </Tarjeta>

          <Tarjeta titulo={t('motivoTitulo')} icono={ClipboardList}>
            <ListaDatos etiqueta={t('motivoTitulo')}>
              <FilaDato
                etiqueta={t('motivo')}
                valor={dev.motivo.nombre ? (dev.motivo.codigo ? `${dev.motivo.nombre} (${dev.motivo.codigo})` : dev.motivo.nombre) : dev.motivo.texto || t('sinDato')}
              />
              <FilaDato etiqueta={t('afectaInventario')} valor={dev.motivo.afecta_inventario === null ? t('sinDato') : dev.motivo.afecta_inventario ? t('si') : t('no')} />
              <FilaDato etiqueta={t('requiereFoto')} valor={dev.motivo.requiere_foto === null ? t('sinDato') : dev.motivo.requiere_foto ? t('si') : t('no')} />
              {dev.notas && <FilaDato etiqueta={t('notas')} valor={dev.notas} />}
            </ListaDatos>
          </Tarjeta>
        </div>
      </div>

      <AnularDevolucionDialog abierto={anular} onAbiertoChange={cambiarAnular} devolucion={dev} onAnulada={recargar} />
    </div>
  );
}
