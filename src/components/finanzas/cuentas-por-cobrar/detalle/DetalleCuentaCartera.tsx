'use client';

/**
 * Detalle de una cuenta por cobrar (Figma X1 `740:49675`, X1b `740:51002`,
 * móvil X6 `740:53238`). Un solo componente para Finanzas y para el POS (D3):
 * en el POS lee con `origen=pos`, cobra con la caja del cajero y no sale a
 * Finanzas. Lee `GET /api/cartera/[id]`; pagar (cuota o abono) y anular van por
 * el pago único; el plan de cuotas por `/api/cartera/[id]/cuotas`; el estado de
 * cuenta y el recordatorio por el motor de documentos y el correo del CRM.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Bell, CalendarClock, CircleDollarSign, FileText, Printer, Receipt, RefreshCw, Trash2, User } from 'lucide-react';
import {
  CadenaDocumento,
  DocumentoCabecera,
  EmptyState,
  FilaDato,
  KpiStrip,
  ListaDatos,
  RowActionsMenu,
  StatCard,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type EslabonDocumento,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento } from '@/lib/documents/cliente';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { proximaCuota, type CuotaCartera, type DetalleCuentaPorCobrar } from '@/lib/finanzas/cartera/contratoCartera';
import { ErrorPeticionCartera, enviarRecordatorio, pedirDetalleCuenta } from '@/lib/finanzas/cartera/clienteCartera';
import { pagoAnulable } from '@/lib/finanzas/ventas/detalleLogica';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { AnularPagoConectado } from '@/components/finanzas/pagos/AnularPagoConectado';
import { PlanCuotasCartera } from '@/components/finanzas/cartera/PlanCuotasCartera';
import { CrearPlanCuotasDialog } from '@/components/finanzas/cartera/CrearPlanCuotasDialog';
import { EstadoCuentaDialog } from '@/components/finanzas/cartera/EstadoCuentaDialog';
import { rutasCartera } from '../listado/ListadoCartera';

export function DetalleCuentaCartera({ id, origen }: { id: string; origen: 'finanzas' | 'pos' }) {
  const t = useTranslations('cartera');
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const rutas = rutasCartera(origen);
  const enPos = origen === 'pos';

  const [datos, setDatos] = useState<DetalleCuentaPorCobrar | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState<{ cuotaId: string | null } | null>(null);
  const [pagoAAnular, setPagoAAnular] = useState<{ id: string; monto: string } | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState(false);
  const [crearPlan, setCrearPlan] = useState(false);
  const [recordando, setRecordando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await pedirDetalleCuenta(id, origen));
    } catch (e) {
      setError(e instanceof ErrorPeticionCartera ? e.codigo : 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [id, origen]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const c = datos?.cuenta;
  const { formatDate, formatDateTime, formatPlain, getToday } = useFormatDate(c?.branchId ?? null);
  const ctxMoneda = moneda.paraDocumento(c?.moneda);
  const fmt = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  if (error === 'cuenta_no_encontrada') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="empty" titulo={t('detalle.noEncontrada')} descripcion={t('detalle.noEncontradaDescripcion')} accion={{ etiqueta: t('detalle.volver'), href: rutas.base }} />
      </div>
    );
  }
  if (error === 'sin_permiso') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="forbidden" titulo={t('listado.sinPermiso')} descripcion={t('listado.sinPermisoDescripcion')} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="error" titulo={t('detalle.errorCarga')} onReintentar={() => void cargar()} />
      </div>
    );
  }

  const puedeCobrar = enPos ? permisos.posCrear || permisos.crear : permisos.crear;
  const puedeAnular = enPos ? permisos.posAnular || permisos.anular : permisos.anular;
  const pagado = (datos?.pagos ?? []).filter((p) => p.estado === 'completed').reduce((s, p) => s + p.monto, 0);
  const proxima = datos ? proximaCuota(datos.cuotas) : null;
  const numero = datos?.factura?.numero ?? t('detalle.sinFactura');
  const abierta = !!c && c.saldo > 0 && c.estado !== 'cancelled';
  const tieneAbonosEnCuotas = (datos?.cuotas ?? []).some((q) => q.pagado > 0);

  const recordar = async () => {
    setRecordando(true);
    try {
      const r = await enviarRecordatorio(id, { canal: 'correo', origen });
      toastSuccess(t('recordatorio.enviados', { count: 1 }), t('recordatorio.enviadoA', { destino: r.destino ?? '' }));
      await cargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCartera ? e.codigo : 'error_desconocido';
      const clave = `errores.${codigo}`;
      toastError(t('recordatorio.ninguno'), t.has(clave) ? t(clave as never) : t('errores.error_desconocido'));
    } finally {
      setRecordando(false);
    }
  };

  const eliminarPlan = async () => {
    const org = getOrganizationId();
    const r = await fetch(`/api/cartera/${encodeURIComponent(id)}/cuotas`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
    });
    if (!r.ok) {
      const cuerpo = (await r.json().catch(() => ({}))) as { codigo?: string };
      const clave = `cuotas.errores.${cuerpo.codigo ?? 'error_desconocido'}`;
      toastError(t('cuotas.noEliminado'), t.has(clave) ? t(clave as never) : t('errores.error_desconocido'));
      return;
    }
    toastSuccess(t('cuotas.eliminado'));
    await cargar();
  };

  const menu: AccionFila[] = [
    { id: 'factura', etiqueta: t('detalle.verFactura'), icono: Receipt, onSelect: () => datos?.factura && router.push(`/app/finanzas/facturas-venta/${datos.factura.id}`), oculta: !datos?.factura || enPos },
    { id: 'pdf-factura', etiqueta: t('detalle.pdfFactura'), icono: Printer, onSelect: () => datos?.factura && abrirDocumento('factura-venta', datos.factura.id), oculta: !datos?.factura },
    { id: 'cliente', etiqueta: t('detalle.carteraCliente'), icono: User, onSelect: () => datos?.cliente && router.push(rutas.cliente(datos.cliente.id)), oculta: !datos?.cliente },
    { id: 'plan', etiqueta: datos?.cuotas.length ? t('cuotas.reemplazar') : t('cuotas.crearPlan'), icono: CalendarClock, onSelect: () => setCrearPlan(true), oculta: !permisos.crear || !abierta || tieneAbonosEnCuotas, separadorAntes: true },
    { id: 'quitar-plan', etiqueta: t('cuotas.eliminar'), icono: Trash2, onSelect: () => void eliminarPlan(), destructiva: true, oculta: !permisos.crear || !datos?.cuotas.length || tieneAbonosEnCuotas },
    { id: 'actualizar', etiqueta: t('listado.actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
  ];

  const eslabones: EslabonDocumento[] = datos
    ? [
        ...(datos.factura
          ? [{ id: datos.factura.id, tipo: 'factura' as const, numero: datos.factura.numero ?? t('detalle.sinFactura'), estado: datos.factura.estado, href: enPos ? undefined : `/app/finanzas/facturas-venta/${datos.factura.id}`, fecha: formatDate(datos.factura.emision), importe: fmt(datos.factura.total) }]
          : []),
        { id: datos.cuenta.id, tipo: 'cuentaPorCobrar' as const, numero: t('detalle.cuenta'), estado: datos.cuenta.estado, importe: fmt(datos.cuenta.saldo), actual: true },
        ...datos.pagos
          .filter((p) => p.estado === 'completed')
          .map((p) => ({ id: p.id, tipo: 'pago' as const, numero: p.recibo ?? t('detalle.pago'), fecha: formatDate(p.fecha), importe: fmt(p.monto) })),
      ]
    : [];

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <DocumentoCabecera
        tipo="cuentaPorCobrar"
        titulo={datos ? t('detalle.titulo', { numero }) : t('detalle.cargando')}
        subtitulo={datos ? [datos.cliente?.nombre ?? t('listado.sinCliente'), t('listado.venceEl', { fecha: formatDate(c?.vencimiento) })].join(' · ') : undefined}
        migas={
          enPos
            ? [{ etiqueta: t('migas.pos'), href: '/app/pos' }, { etiqueta: t('titulo'), href: rutas.base }, { etiqueta: numero }]
            : [{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.cartera') }, { etiqueta: t('titulo'), href: rutas.base }, { etiqueta: numero }]
        }
        estado={c?.estado}
        insignias={c && c.dias > 0 && c.saldo > 0 ? <StatusBadge estado="overdue" etiqueta={t('estados.vencidaDias', { dias: c.dias })} tamano="md" /> : null}
        cargando={cargando && !datos}
        acciones={
          datos ? (
            <div className="flex flex-wrap items-center gap-2">
              {datos.cliente && (
                <button type="button" onClick={() => setEstadoCuenta(true)} className={clasesBoton({ variante: 'secundario' })}>
                  <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('detalle.estadoCuenta')}
                </button>
              )}
              {abierta && (
                <button
                  type="button"
                  disabled={recordando || !datos.cliente?.email}
                  title={!datos.cliente?.email ? t('recordatorio.clienteSinCorreo') : undefined}
                  onClick={() => void recordar()}
                  className={clasesBoton({ variante: 'secundario' })}
                >
                  <Bell aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('listado.acciones.recordatorio')}
                </button>
              )}
              {abierta && puedeCobrar && (
                <button type="button" onClick={() => setPago({ cuotaId: null })} className={clasesBoton({ variante: 'primario' })}>
                  <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('detalle.registrarPago')}
                </button>
              )}
              <RowActionsMenu acciones={menu} titulo={numero} orientacion="horizontal" tamano="md" />
            </div>
          ) : null
        }
        debajo={eslabones.length > 1 ? <CadenaDocumento eslabones={eslabones} etiqueta={t('detalle.cadena')} /> : undefined}
      />

      {datos && c && (
        <>
          <KpiStrip etiqueta={t('detalle.kpis')}>
            <StatCard etiqueta={t('detalle.montoOriginal')} valor={fmt(c.monto)} />
            <StatCard etiqueta={t('detalle.pagado')} valor={fmt(pagado)} tono={pagado > 0 ? 'exito' : 'neutro'} />
            <StatCard etiqueta={t('detalle.saldo')} valor={fmt(c.saldo)} tono={c.dias > 0 && c.saldo > 0 ? 'peligro' : 'neutro'} />
            <StatCard
              etiqueta={t('detalle.proximaCuota')}
              valor={proxima ? fmt(proxima.saldo) : '—'}
              detalle={proxima ? t('cuotas.cuotaN', { numero: proxima.numero, fecha: formatPlain(proxima.vencimiento) }) : t('detalle.sinCuotas')}
            />
          </KpiStrip>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
              {datos.cuotas.length > 0 && (
                <Tarjeta titulo={t('cuotas.titulo')} sinRelleno>
                  <PlanCuotasCartera
                    cuotas={datos.cuotas}
                    formatear={fmt}
                    formatearDia={(d) => formatPlain(d)}
                    onPagar={abierta && puedeCobrar ? (q: CuotaCartera) => setPago({ cuotaId: q.id }) : undefined}
                  />
                </Tarjeta>
              )}

              <Tarjeta titulo={t('detalle.pagos')} sinRelleno>
                {datos.pagos.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-fg-muted">{t('detalle.sinPagos')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {datos.pagos.map((p) => {
                      const anulado = p.estado !== 'completed';
                      const cuota = p.cuotaId ? datos.cuotas.find((q) => q.id === p.cuotaId) : null;
                      return (
                        <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className={anulado ? 'text-fg-muted line-through' : 'font-medium text-fg'}>
                              {[p.recibo, p.metodoNombre ?? p.metodo].filter(Boolean).join(' · ')}
                            </span>
                            <span className="text-xs text-fg-muted">
                              {formatDateTime(p.fecha)}
                              {cuota ? ` · ${t('detalle.aplicadoACuota', { numero: cuota.numero })}` : ''}
                              {anulado && p.motivoAnulacion ? ` · ${t('detalle.anuladoPor', { motivo: p.motivoAnulacion })}` : ''}
                            </span>
                          </div>
                          {anulado && <StatusBadge estado="void" />}
                          <span className={anulado ? 'tabular-nums text-fg-muted line-through' : 'font-medium tabular-nums text-fg'}>{fmt(p.monto)}</span>
                          <RowActionsMenu
                            titulo={p.recibo ?? t('detalle.pago')}
                            acciones={[
                              { id: 'recibo', etiqueta: t('detalle.verRecibo'), icono: Printer, onSelect: () => abrirDocumento('recibo-caja', p.id) },
                              {
                                id: 'anular',
                                etiqueta: t('detalle.anularPago'),
                                icono: Ban,
                                destructiva: true,
                                onSelect: () => setPagoAAnular({ id: p.id, monto: fmt(p.monto) }),
                                oculta: !puedeAnular || !pagoAnulable(p),
                              },
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Tarjeta>
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
              <Tarjeta titulo={t('detalle.cliente')}>
                {datos.cliente ? (
                  <ListaDatos>
                    <FilaDato etiqueta={t('detalle.nombre')} valor={datos.cliente.nombre ?? '—'} />
                    {datos.cliente.documento && <FilaDato etiqueta={t('detalle.documento')} valor={datos.cliente.documento} />}
                    {datos.cliente.email && <FilaDato etiqueta={t('detalle.correo')} valor={datos.cliente.email} />}
                    {datos.cliente.telefono && <FilaDato etiqueta={t('detalle.telefono')} valor={datos.cliente.telefono} />}
                    <FilaDato etiqueta={t('detalle.carteraTotal')} valor={fmt(datos.cliente.carteraTotal)} tono="fuerte" href={rutas.cliente(datos.cliente.id)} />
                  </ListaDatos>
                ) : (
                  <p className="text-sm text-fg-muted">{t('listado.sinCliente')}</p>
                )}
              </Tarjeta>

              <Tarjeta titulo={t('detalle.datos')}>
                <ListaDatos>
                  <FilaDato etiqueta={t('detalle.vencimiento')} valor={formatDate(c.vencimiento)} tono={c.dias > 0 && c.saldo > 0 ? 'peligro' : undefined} />
                  <FilaDato etiqueta={t('detalle.creada')} valor={formatDate(c.creada)} />
                  {c.sucursal && <FilaDato etiqueta={t('detalle.sucursal')} valor={c.sucursal} />}
                  <FilaDato etiqueta={t('detalle.ultimoRecordatorio')} valor={c.ultimoRecordatorio ? formatDateTime(c.ultimoRecordatorio) : t('detalle.nunca')} />
                </ListaDatos>
              </Tarjeta>

              {datos.recordatorios.length > 0 && (
                <Tarjeta titulo={t('recordatorio.historial')}>
                  <ol className="flex flex-col gap-2 text-sm">
                    {datos.recordatorios.map((r, i) => (
                      <li key={`${r.fecha}-${i}`} className="flex flex-col">
                        <span className="text-fg">
                          {t(`recordatorio.estados.${r.estado}` as never)}
                          {r.destino ? ` · ${r.destino}` : ''}
                        </span>
                        <span className="text-xs text-fg-muted">
                          {formatDateTime(r.fecha)}
                          {r.error ? ` · ${t.has(`errores.${r.error}`) ? t(`errores.${r.error}` as never) : r.error}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Tarjeta>
              )}
            </div>
          </div>

          {pago && (
            <RegistrarPagoConectado
              abierto={pago !== null}
              onAbiertoChange={(v) => !v && setPago(null)}
              destino={{ tipo: 'cuenta', id: c.id, cuotaId: pago.cuotaId }}
              origen={enPos ? 'pos_cxc' : 'cxc'}
              onRegistrado={() => void cargar()}
            />
          )}
          <AnularPagoConectado
            abierto={pagoAAnular !== null}
            onAbiertoChange={(v) => !v && setPagoAAnular(null)}
            paymentId={pagoAAnular?.id ?? null}
            montoTexto={pagoAAnular?.monto}
            origen={enPos ? 'pos_cxc' : 'cxc'}
            onAnulado={() => void cargar()}
          />
          {datos.cliente && (
            <EstadoCuentaDialog
              abierto={estadoCuenta}
              onAbiertoChange={setEstadoCuenta}
              clienteId={datos.cliente.id}
              clienteNombre={datos.cliente.nombre}
              correo={datos.cliente.email}
              hoy={getToday()}
              origen={origen}
            />
          )}
          <CrearPlanCuotasDialog
            abierto={crearPlan}
            onAbiertoChange={setCrearPlan}
            cuentaId={c.id}
            saldo={c.saldo}
            decimales={ctxMoneda.decimals}
            hoy={getToday()}
            formatear={fmt}
            formatearDia={(d) => formatPlain(d)}
            onCreado={() => void cargar()}
          />
        </>
      )}
    </div>
  );
}
