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
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, CalendarRange, ClipboardList, FileText, HandCoins, Hourglass, ReceiptText, ScrollText, Trash2, Truck, Wallet } from 'lucide-react';
import {
  AccionRapida,
  DataTable,
  Dialogo,
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
  type ColumnaTabla,
} from '@/components/kit';
import { CadenaDocumento, DocumentoCabecera, type EslabonDocumento } from '@/components/kit/documento';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento } from '@/lib/documents/cliente';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import { leerDetalleCxp, type CuotaLeida, type DetalleCxp, type PagoCompraLeido } from '@/lib/services/compras/lecturasCompras';
import { RUTA_COMPRAS_FINANZAS, RUTA_CXP, RUTA_PROVEEDORES } from '@/components/finanzas/facturas-compra/rutasCompras';
import { RegistrarPagoProveedor } from '../RegistrarPagoProveedor';
import { ProgramarPagoDialog } from '../ProgramarPagoDialog';
import { AprobacionesPanel } from '../AprobacionesPanel';
import { EstadoCuentaProveedorDialog } from '../EstadoCuentaProveedorDialog';
import { PlanCuotasDialog } from '../PlanCuotasDialog';

type DialogoAbierto = 'pagar' | 'programar' | 'plan' | 'estadoCuenta' | 'eliminarPlan' | null;

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
  const [dialogo, setDialogo] = useState<DialogoAbierto>(null);
  const [cuotaPago, setCuotaPago] = useState<string | null>(null);
  const [eliminandoPlan, setEliminandoPlan] = useState(false);
  const idMotivoPagar = useId();
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
  const retenido = (c.factura?.retenciones ?? []).reduce((s, r) => s + r.amount, 0);

  // Se confirma con el diálogo del manual (PATRONES §8), no con el confirm del navegador.
  const eliminarPlan = async () => {
    setEliminandoPlan(true);
    try {
      await clienteCompras.eliminarPlanCuotas(c.id);
      toastSuccess(td('cuotas.eliminado'));
      setDialogo(null);
      recargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      toastError(te.has(codigo) ? te(codigo as never) : te('error_desconocido'));
    } finally {
      setEliminandoPlan(false);
    }
  };

  const estadoCuota = (q: CuotaLeida): string => {
    const vencida = q.balance > 0 && q.due_date < hoy;
    return q.balance <= 0 || q.status === 'paid' ? 'pagada' : vencida ? 'vencida' : q.paid_amount > 0 ? 'parcial' : 'pendiente';
  };

  const columnasCuotas: ColumnaTabla<CuotaLeida>[] = [
    { id: 'numero', encabezado: td('cuotas.columnas.numero'), ancho: 48, celda: (q) => <span className="tabular-nums">{q.installment_number}</span> },
    { id: 'vence', encabezado: td('cuotas.columnas.vence'), celda: (q) => <span className="whitespace-nowrap tabular-nums">{formatPlain(q.due_date)}</span> },
    { id: 'valor', encabezado: td('cuotas.columnas.valor'), variante: 'importe', celda: (q) => formatear(q.amount) },
    { id: 'pagado', encabezado: td('cuotas.columnas.pagado'), variante: 'importe', ocultarDebajo: 'md', celda: (q) => formatear(q.paid_amount) },
    { id: 'saldo', encabezado: td('cuotas.columnas.saldo'), variante: 'importe', celda: (q) => formatear(q.balance) },
    {
      id: 'estado',
      encabezado: td('cuotas.columnas.estado'),
      celda: (q) => {
        const e = estadoCuota(q);
        return <StatusBadge estado={e} etiqueta={t(`estado.${e}`)} />;
      },
    },
  ];

  const columnasPagos: ColumnaTabla<PagoCompraLeido>[] = [
    {
      id: 'fecha',
      encabezado: td('pagos.columnas.fecha'),
      celda: (p) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(p.payment_date ?? p.created_at)}</span>,
    },
    { id: 'metodo', encabezado: td('pagos.columnas.metodo'), ocultarDebajo: 'sm', celda: (p) => p.method ?? '—' },
    {
      id: 'referencia',
      encabezado: td('pagos.columnas.referencia'),
      ocultarDebajo: 'md',
      celda: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{p.reference ?? '—'}</span>
          {p.installment_id && <span className="text-xs text-fg-secondary">{td('pagos.aCuota')}</span>}
        </div>
      ),
    },
    { id: 'importe', encabezado: td('pagos.columnas.importe'), variante: 'importe', celda: (p) => formatear(p.amount) },
    {
      id: 'estado',
      encabezado: td('pagos.columnas.estado'),
      celda: (p) => (p.status !== 'completed' ? <StatusBadge estado={p.status ?? 'pendiente'} /> : null),
    },
  ];

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
                aria-describedby={!permisos.crear ? idMotivoPagar : undefined}
                onClick={() => {
                  setCuotaPago(null);
                  setDialogo('pagar');
                }}
                className={clasesBoton({ variante: 'primario' })}
              >
                <Wallet aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.pagar')}
              </button>
            )}
            {abierta && !permisos.crear && (
              <span id={idMotivoPagar} className="sr-only">
                {td('motivos.sinPermiso')}
              </span>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={titulo} acciones={menu} />
          </>
        }
        debajo={eslabones.length > 1 ? <CadenaDocumento eslabones={eslabones} etiqueta={td('enlaces')} /> : undefined}
      />

      {/* Figma Y1 (740:53850): cuatro cifras de la cuenta en lugar de la tarjeta «Resumen». */}
      <KpiStrip etiqueta={td('resumen')}>
        <StatCard
          etiqueta={td('monto')}
          icono={ReceiptText}
          valor={formatear(c.amount)}
          detalle={
            retenido > 0
              ? td('kpis.netoRetenciones', { retenido: formatear(retenido), monto: formatear(Math.max(0, c.amount - c.balance)) })
              : td('kpis.pagado', { monto: formatear(Math.max(0, c.amount - c.balance)) })
          }
        />
        <StatCard
          etiqueta={td('saldo')}
          icono={Wallet}
          valor={formatear(c.balance)}
          tono={c.balance > 0 ? 'peligro' : 'exito'}
          detalle={programadoPendiente > 0 ? td('kpis.programado', { monto: formatear(programadoPendiente) }) : undefined}
        />
        <StatCard etiqueta={td('vencimiento')} icono={CalendarClock} valor={formatDate(c.due_date)} tono={estado === 'vencida' ? 'peligro' : 'neutro'} />
        <StatCard etiqueta={t('antiguedad.titulo')} icono={Hourglass} valor={t(`estado.${estado}`)} tono={estado === 'vencida' ? 'peligro' : 'neutro'} />
      </KpiStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <AprobacionesPanel programaciones={c.programaciones} moneda={ctxMoneda} puedeAprobar={permisos.aprobar} onCambio={recargar} mostrarCuenta={false} />

          <Tarjeta
            id="cuotas"
            titulo={td('cuotas.titulo')}
            icono={CalendarRange}
            accion={
              c.cuotas.length > 0 && !planConAbonos && permisos.crear ? (
                <button
                  type="button"
                  onClick={() => setDialogo('eliminarPlan')}
                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-danger-text hover:text-danger-text' })}
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {td('cuotas.eliminar')}
                </button>
              ) : c.cuotas.length === 0 && abierta && permisos.crear ? (
                <button type="button" onClick={() => setDialogo('plan')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-link hover:text-link' })}>
                  {td('acciones.plan')}
                </button>
              ) : undefined
            }
          >
            {c.cuotas.length === 0 ? (
              <p className="pb-4 text-sm text-fg-secondary">{td('cuotas.vacio')}</p>
            ) : (
              <DataTable
                densidad="compacta"
                etiqueta={td('cuotas.titulo')}
                columnas={columnasCuotas}
                filas={c.cuotas}
                obtenerId={(q) => q.id}
                virtualizar={false}
                accionesRapidas={(q) =>
                  estadoCuota(q) !== 'pagada' && abierta && permisos.crear ? (
                    <AccionRapida
                      soloIcono
                      icono={Wallet}
                      etiqueta={td('cuotas.pagarCuota', { numero: q.installment_number })}
                      onClick={() => {
                        setCuotaPago(q.id);
                        setDialogo('pagar');
                      }}
                    />
                  ) : null
                }
              />
            )}
          </Tarjeta>

          <Tarjeta titulo={td('pagos.titulo')} icono={HandCoins}>
            {c.pagos.length === 0 ? (
              <p className="pb-4 text-sm text-fg-secondary">{td('pagos.vacio')}</p>
            ) : (
              <DataTable
                densidad="compacta"
                etiqueta={td('pagos.titulo')}
                columnas={columnasPagos}
                filas={c.pagos}
                obtenerId={(p) => p.id}
                virtualizar={false}
                accionesRapidas={(p) =>
                  p.status === 'completed' ? (
                    <AccionRapida
                      soloIcono
                      icono={FileText}
                      etiqueta={td('pagos.comprobanteDe', { monto: formatear(p.amount) })}
                      onClick={() => abrirDocumento('comprobante-egreso', p.id)}
                    />
                  ) : null
                }
              />
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
          {/* Figma Y1 (740:54404): el proveedor en su propia tarjeta, separado de los datos de la cuenta. */}
          <Tarjeta titulo={td('proveedor')} icono={Truck}>
            <ListaDatos className="pb-3">
              <FilaDato
                etiqueta={td('proveedorDatos.nombre')}
                valor={c.proveedor?.name ?? '—'}
                href={c.proveedor?.uuid ? `${RUTA_PROVEEDORES}/${c.proveedor.uuid}` : undefined}
              />
              {c.proveedor?.nit && <FilaDato etiqueta={td('proveedorDatos.nit')} valor={c.proveedor.nit} />}
              {c.proveedor?.phone && <FilaDato etiqueta={td('proveedorDatos.telefono')} valor={c.proveedor.phone} />}
              {c.proveedor?.email && <FilaDato etiqueta={td('proveedorDatos.correo')} valor={c.proveedor.email} />}
            </ListaDatos>
          </Tarjeta>
          {c.factura && (
            // Figma «cxp-detalle»: de dónde sale el monto; lo retenido explica por qué es menor que el total.
            <Tarjeta titulo={td('origen.titulo')} icono={FileText}>
              <ListaDatos className="pb-2">
                <FilaDato etiqueta={td('origen.factura')} valor={c.factura.number_ext} href={`${RUTA_COMPRAS_FINANZAS}/${c.factura.id}`} />
                <FilaDato etiqueta={td('origen.recibida')} valor={formatDate(c.factura.issue_date)} />
                <FilaDato etiqueta={td('origen.vence')} valor={formatDate(c.factura.due_date ?? c.due_date)} />
                <FilaDato
                  etiqueta={td('origen.retenciones')}
                  valor={
                    c.factura.retenciones.length > 0
                      ? td('origen.conceptos', { n: c.factura.retenciones.length })
                      : td('origen.sinRetenciones')
                  }
                  descripcion={c.factura.retenciones.length > 0 ? c.factura.retenciones.map((r) => r.concept).join(' · ') : undefined}
                />
                <FilaDato
                  etiqueta={td('origen.formaPago')}
                  valor={c.factura.payment_terms && c.factura.payment_terms > 0 ? td('origen.credito', { n: c.factura.payment_terms }) : td('origen.contado')}
                />
              </ListaDatos>
              <ListaDatos className="border-t border-line py-2">
                <FilaDato etiqueta={td('origen.subtotal')} valor={formatear(c.factura.subtotal)} />
                <FilaDato etiqueta={td('origen.iva')} valor={formatear(c.factura.tax_total)} />
                <FilaDato etiqueta={td('origen.total')} valor={formatear(c.factura.total)} />
                {retenido > 0 && <FilaDato etiqueta={td('origen.menosRetenciones')} valor={`− ${formatear(retenido)}`} />}
                <FilaDato etiqueta={td('origen.neto')} valor={formatear(Math.max(0, c.factura.total - retenido))} />
              </ListaDatos>
              {(c.factura.asiento || c.factura.orden) && (
                <ListaDatos className="border-t border-line pb-3 pt-2">
                  {c.factura.asiento && (
                    <FilaDato
                      etiqueta={td('origen.asiento')}
                      valor={c.factura.asiento.memo ?? `#${c.factura.asiento.id}`}
                      href={`/app/finanzas/contabilidad/asientos/${c.factura.asiento.id}`}
                    />
                  )}
                  {c.factura.orden && (
                    <FilaDato etiqueta={td('origen.orden')} valor={`OC-${c.factura.orden.id}`} href={`/app/inventario/ordenes-compra/${c.factura.orden.uuid}`} />
                  )}
                </ListaDatos>
              )}
            </Tarjeta>
          )}
          <Tarjeta titulo={td('datos')}>
            <ListaDatos className="pb-3">
              <FilaDato etiqueta={td('moneda')} valor={ctxMoneda.code} />
              <FilaDato etiqueta={td('creada')} valor={formatDateTime(c.created_at)} />
            </ListaDatos>
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
      <Dialogo
        abierto={dialogo === 'eliminarPlan'}
        onAbiertoChange={(v) => !v && !eliminandoPlan && setDialogo(null)}
        titulo={td('cuotas.eliminarTitulo')}
        descripcion={td('cuotas.eliminarDescripcion')}
        ancho={440}
        primario={{ etiqueta: td('cuotas.eliminar'), onClick: () => void eliminarPlan(), destructiva: true, cargando: eliminandoPlan }}
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
