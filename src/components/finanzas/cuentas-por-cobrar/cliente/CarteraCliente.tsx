'use client';

/**
 * Cartera del cliente (Figma X2 `740:51004`, X2b pago a varias con sobrante
 * `740:52151`, X4 sin resultados `740:52424`): saldo total, vencido, saldo a
 * favor y antigüedad del cliente; sus cuentas abiertas; «Registrar pago» con el
 * diálogo único en destino «tercero» (reparto de la más antigua a la más nueva
 * y sobrante a saldo a favor solo con casilla) y el estado de cuenta.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CircleDollarSign, Eye, FileText, PiggyBank, User, WalletCards } from 'lucide-react';
import {
  ChipDocumento,
  DataTable,
  EmptyState,
  KpiStrip,
  ListCard,
  PageHeader,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import type { FilaCartera, RespuestaListadoCartera } from '@/lib/finanzas/cartera/listadoCartera';
import { pedirListadoCartera } from '@/lib/finanzas/cartera/clienteCartera';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { BandaAntiguedad } from '@/components/kit';
import { EstadoCuentaDialog } from '@/components/finanzas/cartera/EstadoCuentaDialog';
import { rutasCartera } from '../listado/ListadoCartera';

interface Cabecera {
  cliente: { id: string; nombre: string | null; documento: string | null; email: string | null; telefono: string | null };
  saldoAFavor: number;
}

export function CarteraCliente({ customerId, origen }: { customerId: string; origen: 'finanzas' | 'pos' }) {
  const t = useTranslations('cartera');
  const router = useRouter();
  const entero = useFormatoEntero();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const rutas = rutasCartera(origen);
  const enPos = origen === 'pos';
  const puedeCobrar = enPos ? permisos.posCrear || permisos.crear : permisos.crear;

  const [cabecera, setCabecera] = useState<Cabecera | null>(null);
  const [datos, setDatos] = useState<RespuestaListadoCartera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pagar, setPagar] = useState(false);
  const [estadoCuenta, setEstadoCuenta] = useState(false);
  /** Cuentas elegidas para «Registrar pago» (Figma X2: todas marcadas al cargar). */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cobrarId, setCobrarId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const org = getOrganizationId();
      const q = new URLSearchParams({ cliente: customerId, estado: 'abiertas', tamano: '200', orden: 'vencimiento_asc' });
      if (enPos) q.set('origen', 'pos');
      const [cab, lista] = await Promise.all([
        fetch(`/api/clientes/${encodeURIComponent(customerId)}/cartera${enPos ? '?origen=pos' : ''}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
        }).then(async (r) => {
          const c = await r.json();
          if (!r.ok) throw Object.assign(new Error('cabecera'), { codigo: (c as { codigo?: string }).codigo ?? 'error_desconocido' });
          return c as Cabecera;
        }),
        pedirListadoCartera(q),
      ]);
      setCabecera(cab);
      setDatos(lista);
      setSeleccion(new Set(lista.filas.map((f) => f.id)));
    } catch (e) {
      setError((e as { codigo?: string }).codigo ?? 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [customerId, enPos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = datos?.resumen;
  const monedaResumen = resumen?.monedas.length === 1 ? resumen.monedas[0] : moneda.code;
  const fmt = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(monedaResumen)), [moneda, monedaResumen]);
  const filas = datos?.filas ?? [];

  if (error === 'cliente_no_encontrado') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="empty" titulo={t('cliente.noEncontrado')} accion={{ etiqueta: t('detalle.volver'), href: rutas.base }} />
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

  /**
   * Facturas elegidas para el reparto del pago (mismo contrato que el lote del
   * listado de facturas). Con todas marcadas, o si ninguna elegida trae
   * factura, el diálogo arranca con todas las cuentas del cliente, como antes.
   */
  const facturasElegidas =
    seleccion.size > 0 && seleccion.size < filas.length
      ? filas.filter((f) => seleccion.has(f.id) && f.invoice_id).map((f) => f.invoice_id as string)
      : [];
  const destinoPago = { tipo: 'tercero' as const, customerId, facturaIds: facturasElegidas.length > 0 ? facturasElegidas : undefined };

  const accionesDe = (f: FilaCartera): AccionFila[] => [
    { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(rutas.detalle(f.id)) },
    { id: 'cobrar', etiqueta: t('listado.acciones.registrarAbono'), icono: CircleDollarSign, onSelect: () => setCobrarId(f.id), oculta: !puedeCobrar || f.saldo <= 0 },
  ];

  const estadoFila = (f: FilaCartera) =>
    f.dias > 0 ? <StatusBadge estado="overdue" etiqueta={t('estados.vencidaDias', { dias: f.dias })} /> : <StatusBadge estado={f.estado} />;

  const columnas: ColumnaTabla<FilaCartera>[] = [
    {
      id: 'documento',
      encabezado: t('listado.columnas.documento'),
      celda: (f) =>
        f.numero ? (
          <ChipDocumento
            tipo={f.origen === 'factura' ? 'factura' : 'venta'}
            numero={f.numero}
            href={enPos || !f.invoice_id ? undefined : `/app/finanzas/facturas-venta/${f.invoice_id}`}
          />
        ) : (
          <span>{t(`listado.origen.${f.origen}`)}</span>
        ),
    },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vencimiento'),
      celda: (f) => <span className={f.dias > 0 ? 'text-danger-text' : undefined}>{formatDate(f.vencimiento)}</span>,
    },
    { id: 'monto', encabezado: t('listado.columnas.monto'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => fmt(f.monto) },
    { id: 'saldo', encabezado: t('listado.columnas.saldo'), variante: 'importe', celda: (f) => <span className="font-medium">{fmt(f.saldo)}</span> },
    { id: 'estado', encabezado: t('listado.columnas.estado'), celda: estadoFila },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={cabecera?.cliente.nombre ?? t('cliente.titulo')}
        subtitulo={
          cabecera
            ? [cabecera.cliente.documento ?? t('cliente.titulo'), datos ? t('listado.subtitulo', { count: filas.length, n: entero(filas.length) }) : null].filter(Boolean).join(' · ')
            : undefined
        }
        icono={User}
        variante="detail"
        volverA={rutas.base}
        cargando={cargando}
        migas={
          enPos
            ? [{ etiqueta: t('migas.pos'), href: '/app/pos' }, { etiqueta: t('titulo'), href: rutas.base }, { etiqueta: t('cliente.titulo') }]
            : [{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo'), href: rutas.base }, { etiqueta: t('cliente.titulo') }]
        }
        acciones={
          cabecera ? (
            <>
              <button type="button" onClick={() => setEstadoCuenta(true)} className={clasesBoton({ variante: 'secundario' })}>
                <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('detalle.estadoCuenta')}
              </button>
              {puedeCobrar && filas.length > 0 && (
                <button type="button" onClick={() => setPagar(true)} className={clasesBoton({ variante: 'primario' })}>
                  <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('detalle.registrarPago')}
                </button>
              )}
            </>
          ) : null
        }
      />

      <KpiStrip etiqueta={t('cliente.kpis')}>
        <StatCard
          etiqueta={t('cliente.saldoTotal')}
          icono={WalletCards}
          cargando={!datos}
          valor={fmt(resumen?.por_cobrar ?? 0)}
          detalle={datos ? t('listado.subtitulo', { count: filas.length, n: entero(filas.length) }) : undefined}
        />
        <StatCard
          etiqueta={t('listado.kpis.vencida')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={fmt(resumen?.vencida ?? 0)}
          tono={resumen && resumen.vencida > 0 ? 'peligro' : 'neutro'}
          detalle={resumen ? t('listado.kpis.vencidasDetalle', { count: resumen.cuentas_vencidas, n: entero(resumen.cuentas_vencidas) }) : undefined}
        />
        <StatCard
          etiqueta={t('cliente.saldoAFavor')}
          icono={PiggyBank}
          cargando={!cabecera}
          valor={fmt(cabecera?.saldoAFavor ?? 0)}
          tono={cabecera && cabecera.saldoAFavor > 0 ? 'exito' : 'neutro'}
          detalle={cabecera && cabecera.saldoAFavor === 0 ? t('cliente.sinAnticipos') : undefined}
        />
        <StatCard
          etiqueta={t('cliente.pagaEnPromedio')}
          cargando={!datos}
          valor={resumen?.promedio_cobro_dias != null ? t('listado.kpis.dias', { dias: Math.round(resumen.promedio_cobro_dias) }) : '—'}
        />
      </KpiStrip>

      <BandaAntiguedad tramos={resumen?.tramos ?? []} formatear={fmt} cargando={!datos} />

      <DataTable
        etiqueta={t('cliente.cuentasAbiertas')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? 'vacio' : 'listo'}
        seleccion={puedeCobrar ? seleccion : undefined}
        onSeleccionChange={puedeCobrar ? setSeleccion : undefined}
        onFilaClick={(f) => router.push(rutas.detalle(f.id))}
        etiquetaFila={(f) => f.numero ?? f.id}
        acciones={accionesDe}
        tonoFila={(f) => (f.dias > 0 ? 'peligro' : undefined)}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={WalletCards}
            titulo={f.numero ?? t(`listado.origen.${f.origen}`)}
            meta={<span className={f.dias > 0 ? 'text-danger-text' : undefined}>{t('listado.venceEl', { fecha: formatDate(f.vencimiento) })}</span>}
            valor={fmt(f.saldo)}
            estado={estadoFila(f)}
            acciones={accionesDe(f)}
            onClick={() => router.push(rutas.detalle(f.id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{ titulo: t('cliente.sinCuentas'), descripcion: t('cliente.sinCuentasDescripcion'), icono: WalletCards }}
        error={{ titulo: t('listado.errorCarga') }}
        onReintentar={() => void cargar()}
      />

      {cobrarId && (
        <RegistrarPagoConectado
          abierto={cobrarId !== null}
          onAbiertoChange={(v) => !v && setCobrarId(null)}
          destino={{ tipo: 'cuenta', id: cobrarId }}
          origen={enPos ? 'pos_cxc' : 'cxc'}
          onRegistrado={() => void cargar()}
        />
      )}

      {pagar && (
        <RegistrarPagoConectado
          abierto={pagar}
          onAbiertoChange={setPagar}
          destino={destinoPago}
          origen={enPos ? 'pos_cxc' : 'ficha_cliente'}
          onRegistrado={() => void cargar()}
        />
      )}
      {cabecera && (
        <EstadoCuentaDialog
          abierto={estadoCuenta}
          onAbiertoChange={setEstadoCuenta}
          clienteId={customerId}
          clienteNombre={cabecera.cliente.nombre}
          correo={cabecera.cliente.email}
          hoy={getToday()}
          origen={origen}
        />
      )}
    </div>
  );
}
