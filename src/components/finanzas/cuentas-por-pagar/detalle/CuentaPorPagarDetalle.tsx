'use client';

/**
 * Detalle de una cuenta por pagar (plan F9–F10).
 *
 * - Datos, factura de origen y cadena del documento.
 * - Plan de cuotas: crear (`PlanCuotasDialog`) y eliminar mientras no tenga
 *   abonos; pagar una cuota abre el pago único con esa cuota.
 * - Pagos programados: programar, y aprobar/rechazar/cancelar en el panel de
 *   aprobaciones (segregación de funciones en la base).
 * - Historial de pagos (de la CxP y de su factura) con comprobante de egreso.
 * - Estado de cuenta del proveedor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, CalendarRange, ClipboardList, FileText, HandCoins, ScrollText, Trash2, Wallet } from 'lucide-react';
import { EmptyState, FilaDato, RowActionsMenu, StatusBadge, Tarjeta, type AccionFila } from '@/components/kit';
import { CadenaDocumento, DocumentoCabecera, type EslabonDocumento } from '@/components/kit/documento';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento } from '@/lib/documents/cliente';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import { leerDetalleCxp, type DetalleCxp } from '@/lib/services/compras/lecturasCompras';
import { RUTA_COMPRAS_FINANZAS, RUTA_CXP, RUTA_PROVEEDORES } from '@/components/finanzas/facturas-compra/rutasCompras';
import { RegistrarPagoProveedor } from '../RegistrarPagoProveedor';
import { ProgramarPagoDialog } from '../ProgramarPagoDialog';
import { AprobacionesPanel } from '../AprobacionesPanel';
import { EstadoCuentaProveedorDialog } from '../EstadoCuentaProveedorDialog';
import { PlanCuotasDialog } from '../PlanCuotasDialog';

type Dialogo = 'pagar' | 'programar' | 'plan' | 'estadoCuenta' | null;

function estadoCuenta(c: DetalleCxp, hoy: string, diaVence: string | null): string {
  if (c.status === 'void' || c.status === 'cancelled') return 'anulada';
  if (c.balance <= 0) return 'pagada';
  if (diaVence && diaVence < hoy) return 'vencida';
  return c.balance < c.amount ? 'parcial' : 'pendiente';
}

export default function CuentaPorPagarDetalle({ id }: { id: string }) {
  const router = useRouter();
  const t = useTranslations('cuentasPorPagar');
  const td = useTranslations('cuentasPorPagar.detalle');
  const te = useTranslations('cuentasPorPagar.errores');
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();

  const [c, setC] = useState<DetalleCxp | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [cuotaPago, setCuotaPago] = useState<string | null>(null);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    leerDetalleCxp(getOrganizationId(), id)
      .then((d) => !cancelado && setC(d))
      .catch((e: unknown) => {
        if (cancelado) return;
        console.error('Error cargando la cuenta por pagar:', e);
        setError(true);
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [id, recarga]);

  // `/cuotas` redirige aquí con `#cuotas`: llevar la vista a la tarjeta cuando cargue.
  useEffect(() => {
    if (c && typeof window !== 'undefined' && window.location.hash === '#cuotas') {
      document.getElementById('cuotas')?.scrollIntoView({ block: 'start' });
    }
  }, [c]);

  const { formatDate, formatDateTime, formatPlain, getToday, toDate } = useFormatDate(c?.branch_id ?? null);
  const ctxMoneda = moneda.paraDocumento(c?.factura?.currency);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  if (cargando && !c) {
    return <DocumentoCabecera tipo="cuentaPorPagar" titulo={td('cargando')} cargando migas={[{ etiqueta: t('titulo'), href: RUTA_CXP }]} />;
  }
  if (error || !c) {
    return (
      <EmptyState
        titulo={error ? td('errorCarga') : td('noEncontrada')}
        descripcion={error ? td('errorCargaDescripcion') : td('noEncontradaDescripcion')}
        icono={ClipboardList}
        accion={{ etiqueta: td('volver'), href: RUTA_CXP }}
      />
    );
  }

  const hoy = getToday();
  const diaVence = c.due_date ? toDate(new Date(c.due_date)) : null;
  const estado = estadoCuenta(c, hoy, diaVence);
  const abierta = estado !== 'pagada' && estado !== 'anulada' && c.balance > 0;
  const programadoPendiente = c.programaciones.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const cuotasAbiertas = c.cuotas.filter((q) => q.balance > 0 && q.status !== 'paid');
  const planConAbonos = c.cuotas.some((q) => q.paid_amount > 0);
  const titulo = c.factura ? td('titulo', { numero: c.factura.number_ext }) : td('tituloSinFactura');

  const eliminarPlan = async () => {
    if (!window.confirm(td('cuotas.eliminarConfirmar'))) return;
    try {
      await clienteCompras.eliminarPlanCuotas(c.id);
      toastSuccess(td('cuotas.eliminado'));
      recargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      toastError(te.has(codigo) ? te(codigo as never) : te('error_desconocido'));
    }
  };

  const eslabones: EslabonDocumento[] = [];
  if (c.factura) {
    eslabones.push({
      id: c.factura.id,
      tipo: 'facturaCompra',
      numero: c.factura.number_ext,
      estado: c.factura.status,
      fecha: formatDate(c.factura.issue_date),
      importe: formatear(c.factura.total),
      href: `${RUTA_COMPRAS_FINANZAS}/${c.factura.id}`,
    });
  }
  eslabones.push({ id: c.id, tipo: 'cuentaPorPagar', numero: td('eslabon'), estado, importe: formatear(c.balance), actual: true });
  for (const p of c.pagos.filter((x) => x.status === 'completed').slice(0, 6)) {
    eslabones.push({ id: p.id, tipo: 'pago', numero: p.reference ?? td('pago'), fecha: formatDate(p.payment_date), importe: formatear(p.amount) });
  }

  const menu: AccionFila[] = [
    { id: 'estadoCuenta', etiqueta: td('acciones.estadoCuenta'), icono: ScrollText, onSelect: () => setDialogo('estadoCuenta'), oculta: !c.proveedor },
    {
      id: 'programar',
      etiqueta: td('acciones.programar'),
      icono: CalendarClock,
      onSelect: () => setDialogo('programar'),
      oculta: !abierta,
      deshabilitada: !permisos.crear,
      motivo: td('motivos.sinPermiso'),
    },
    {
      id: 'plan',
      etiqueta: td('acciones.plan'),
      icono: CalendarRange,
      onSelect: () => setDialogo('plan'),
      oculta: !abierta || c.cuotas.length > 0,
      deshabilitada: !permisos.crear,
      motivo: td('motivos.sinPermiso'),
    },
    {
      id: 'factura',
      etiqueta: td('acciones.factura'),
      icono: FileText,
      onSelect: () => c.factura && router.push(`${RUTA_COMPRAS_FINANZAS}/${c.factura.id}`),
      oculta: !c.factura,
      separadorAntes: true,
    },
  ];

  const botonClase =
    'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <DocumentoCabecera
        tipo="cuentaPorPagar"
        titulo={titulo}
        subtitulo={`${c.proveedor?.name ?? '—'} · ${td('vence', { fecha: formatDate(c.due_date) })}`}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo'), href: RUTA_CXP }, { etiqueta: c.factura?.number_ext ?? td('eslabon') }]}
        estado={estado}
        acciones={
          <>
            {abierta && (
              <button
                type="button"
                disabled={!permisos.crear}
                title={!permisos.crear ? td('motivos.sinPermiso') : undefined}
                onClick={() => {
                  setCuotaPago(null);
                  setDialogo('pagar');
                }}
                className={`${botonClase} bg-brand-action text-fg-on-brand hover:bg-brand-action-hover`}
              >
                <Wallet aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.pagar')}
              </button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={titulo} acciones={menu} />
          </>
        }
        debajo={eslabones.length > 1 ? <CadenaDocumento eslabones={eslabones} etiqueta={td('enlaces')} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <AprobacionesPanel programaciones={c.programaciones} moneda={ctxMoneda} puedeAprobar={permisos.aprobar} onCambio={recargar} mostrarCuenta={false} />

          <Tarjeta
            id="cuotas"
            titulo={td('cuotas.titulo')}
            icono={CalendarRange}
            accion={
              c.cuotas.length > 0 && !planConAbonos && permisos.crear ? (
                <button type="button" onClick={() => void eliminarPlan()} className="inline-flex items-center gap-1 text-sm font-medium text-danger-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {td('cuotas.eliminar')}
                </button>
              ) : c.cuotas.length === 0 && abierta && permisos.crear ? (
                <button type="button" onClick={() => setDialogo('plan')} className="text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {td('acciones.plan')}
                </button>
              ) : undefined
            }
          >
            {c.cuotas.length === 0 ? (
              <p className="pb-4 text-sm text-fg-secondary">{td('cuotas.vacio')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line pb-2">
                {c.cuotas.map((q) => {
                  const vencida = q.balance > 0 && q.due_date < hoy;
                  const estadoQ = q.balance <= 0 || q.status === 'paid' ? 'pagada' : vencida ? 'vencida' : q.paid_amount > 0 ? 'parcial' : 'pendiente';
                  return (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-fg">{td('cuotas.numero', { numero: q.installment_number, fecha: formatPlain(q.due_date) })}</span>
                        <span className="text-xs text-fg-secondary tabular-nums">
                          {td('cuotas.detalle', { valor: formatear(q.amount), saldo: formatear(q.balance) })}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge estado={estadoQ} etiqueta={t(`estado.${estadoQ}`)} />
                        {estadoQ !== 'pagada' && abierta && permisos.crear && (
                          <button
                            type="button"
                            onClick={() => {
                              setCuotaPago(q.id);
                              setDialogo('pagar');
                            }}
                            aria-label={td('cuotas.pagarCuota', { numero: q.installment_number })}
                            className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Wallet aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo={td('pagos.titulo')} icono={HandCoins}>
            {c.pagos.length === 0 ? (
              <p className="pb-4 text-sm text-fg-secondary">{td('pagos.vacio')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line pb-2">
                {c.pagos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-fg">{formatear(p.amount)}</span>
                      <span className="truncate text-xs text-fg-secondary">
                        {[formatDateTime(p.payment_date ?? p.created_at), p.method, p.reference, p.installment_id ? td('pagos.aCuota') : null].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.status !== 'completed' && <StatusBadge estado={p.status ?? 'pendiente'} />}
                      {p.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => abrirDocumento('comprobante-egreso', p.id)}
                          aria-label={td('pagos.comprobanteDe', { monto: formatear(p.amount) })}
                          className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {c.programaciones.some((p) => p.status !== 'pending') && (
            <Tarjeta titulo={td('historialProgramaciones')} icono={CalendarClock}>
              <ul className="flex flex-col divide-y divide-line pb-2">
                {c.programaciones
                  .filter((p) => p.status !== 'pending')
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium tabular-nums text-fg">
                          {formatear(p.amount)} · {formatPlain(p.scheduled_date)}
                        </span>
                        <span className="truncate text-xs text-fg-secondary">
                          {[p.decided_at ? formatDateTime(p.decided_at) : null, p.decision_comment].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <StatusBadge estado={p.status} etiqueta={td(`programacion.${p.status}`)} />
                    </li>
                  ))}
              </ul>
            </Tarjeta>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={td('resumen')}>
            <div className="flex flex-col pb-3">
              <FilaDato etiqueta={td('monto')} valor={formatear(c.amount)} />
              <FilaDato etiqueta={td('pagado')} valor={formatear(Math.max(0, c.amount - c.balance))} />
              {programadoPendiente > 0 && <FilaDato etiqueta={td('programado')} valor={formatear(programadoPendiente)} tono="advertencia" />}
              <FilaDato etiqueta={td('saldo')} valor={formatear(c.balance)} tamano="lg" separadorAntes tono={c.balance > 0 ? 'peligro' : 'exito'} />
            </div>
          </Tarjeta>
          <Tarjeta titulo={td('datos')}>
            <div className="flex flex-col pb-3">
              <FilaDato
                etiqueta={td('proveedor')}
                valor={c.proveedor?.name ?? '—'}
                href={c.proveedor?.uuid ? `${RUTA_PROVEEDORES}/${c.proveedor.uuid}` : undefined}
                descripcion={[c.proveedor?.nit ? `NIT ${c.proveedor.nit}` : null, c.proveedor?.phone, c.proveedor?.email].filter(Boolean).join(' · ') || undefined}
              />
              {c.factura && <FilaDato etiqueta={td('factura')} valor={c.factura.number_ext} href={`${RUTA_COMPRAS_FINANZAS}/${c.factura.id}`} />}
              <FilaDato etiqueta={td('vencimiento')} valor={formatDate(c.due_date)} tono={estado === 'vencida' ? 'peligro' : undefined} />
              <FilaDato etiqueta={td('moneda')} valor={ctxMoneda.code} />
              <FilaDato etiqueta={td('creada')} valor={formatDateTime(c.created_at)} />
            </div>
          </Tarjeta>
        </div>
      </div>

      {dialogo === 'pagar' && (
        <RegistrarPagoProveedor
          abierto
          onAbiertoChange={(v) => !v && setDialogo(null)}
          documento="account_payable"
          id={c.id}
          cuotaId={cuotaPago}
          origen="cxp"
          onRegistrado={recargar}
        />
      )}
      <ProgramarPagoDialog
        abierto={dialogo === 'programar'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        cuentaId={c.id}
        saldo={c.balance}
        programado={programadoPendiente}
        moneda={ctxMoneda}
        hoy={hoy}
        cuotas={cuotasAbiertas.map((q) => ({ id: q.id, numero: q.installment_number, saldo: q.balance, vencimiento: q.due_date }))}
        onProgramado={recargar}
      />
      <PlanCuotasDialog abierto={dialogo === 'plan'} onAbiertoChange={(v) => !v && setDialogo(null)} cuentaId={c.id} saldo={c.balance} moneda={ctxMoneda} hoy={hoy} onCreado={recargar} />
      {c.proveedor && (
        <EstadoCuentaProveedorDialog
          abierto={dialogo === 'estadoCuenta'}
          onAbiertoChange={(v) => !v && setDialogo(null)}
          proveedorId={c.proveedor.id}
          proveedorNombre={c.proveedor.name}
        />
      )}
    </div>
  );
}
