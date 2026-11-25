'use client';

/**
 * Pestaña «Resumen» de la ficha del cliente (Figma 06 Clientes 331:112627;
 * móvil 332:118153):
 *
 * - 6 KPIs en dos filas de tres, sin iconos: Compras · Gasto total · Saldo en
 *   cartera / Estadías · Pedidos web · Saldo folios. En móvil solo «Saldo en
 *   cartera» y «Gasto total» (con el número de compras), como el Figma.
 * - «Reservas futuras» ya no es tarjeta: la próxima reserva se anuncia en el
 *   detalle de «Estadías» («Próxima: 12 dic»), que es donde se lee junto con
 *   la última estancia. Así quedan los 6 KPIs aprobados sin perder el dato.
 * - Historial reciente con «Ver toda la actividad» y cada entrada con su
 *   detalle (productos · sucursal · importe; hora · persona).
 *
 * El saldo en cartera no se calcula aquí: llega de `useCarteraFicha` (el mismo
 * listado de Cuentas por cobrar, organización de la sesión).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, ShoppingBag, ShoppingCart, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { EmptyState, StatCard, StatusBadge, Tarjeta } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { EntradaHistorial, unirPartes } from './EntradaHistorial';
import { mensajeError, useFechasFicha } from './useFechasFicha';
import type { CarteraFicha } from './useCarteraFicha';

interface HistorialItem {
  id: string;
  tipo: 'venta' | 'reserva' | 'web_order';
  /** Número de venta o de pedido; en reservas, la fecha de inicio. */
  referencia: string;
  fecha: string;
  monto: number;
  status: string;
  productos?: number;
  sucursal?: string | null;
  usuarioId?: string | null;
}

interface ResumenTabProps {
  clienteId: string;
  organizationId: number;
  /**
   * CRM ola 3A (Figma 772:20971): vacío corregido cuando el cliente no tiene
   * historial (Nota, Registrar llamada, Registrar venta). Sin él, el texto de siempre.
   */
  vacio?: ReactNode;
  /** Cartera del cliente (la misma que usa «Registrar pago» de la cabecera). */
  cartera?: Pick<CarteraFicha, 'estado' | 'resumen' | 'filas'>;
  /** «Ver toda la actividad»: abre la pestaña Actividad. */
  onVerActividad?: () => void;
}

interface ReservaResumen {
  id: string;
  start_date: string;
  checkin: string | null;
  status: string;
}

interface FolioResumen {
  id: string;
  balance: number | string | null;
}

interface VentaResumen {
  id: string;
  total: number | string | null;
  sale_date: string;
  status: string | null;
  payment_status: string | null;
  user_id: string | null;
  branch: { name: string | null } | { name: string | null }[] | null;
  sale_items: { count: number }[] | null;
}

interface PedidoResumen {
  id: string;
  order_number: string | number;
  status: string | null;
  total: number | string | null;
  created_at: string;
  branch: { name: string | null } | { name: string | null }[] | null;
}

interface Perfil {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const DIA_MES: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const DIA_MES_ANIO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

interface Stats {
  totalCompras: number;
  totalEstadias: number;
  montoTotalGastado: number;
  ultimaCompra: Date | null;
  ultimaEstadia: Date | null;
  totalWebOrders: number;
  ultimaWebOrder: Date | null;
  historial: HistorialItem[];
  folioSaldoPendiente: number;
  folioItemsPendientes: number;
  proximaReserva: string | null;
  personas: Record<string, string>;
}

const STATS_VACIAS: Stats = {
  totalCompras: 0,
  totalEstadias: 0,
  montoTotalGastado: 0,
  ultimaCompra: null,
  ultimaEstadia: null,
  totalWebOrders: 0,
  ultimaWebOrder: null,
  historial: [],
  folioSaldoPendiente: 0,
  folioItemsPendientes: 0,
  proximaReserva: null,
  personas: {},
};

export default function ResumenTab({ clienteId, organizationId, vacio, cartera, onVerActividad }: ResumenTabProps) {
  const t = useTranslations('clientes.ficha');
  // Ventas, folios y cartera no traen moneda propia: la base de la organización.
  const { formatear } = useMonedaOrganizacion();
  const { instante, plana, cuando, timezone } = useFechasFicha();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [stats, setStats] = useState<Stats>(STATS_VACIAS);

  useEffect(() => {
    let cancelado = false;
    const fetchResumenData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Ventas del cliente, con sucursal y número de líneas para el historial.
        // Si el conteo embebido no estuviera disponible, se repite sin él: el resumen no se cae por un detalle.
        // «Facturar a» (2026-11-25): también las que facturó a una empresa ligada y recibió él
        // (contact_customer_id): su historial sigue en su ficha.
        const consultarVentas = (columnas: string) =>
          supabase
            .from('sales')
            .select(columnas)
            .or(`customer_id.eq.${clienteId},contact_customer_id.eq.${clienteId}`)
            .eq('organization_id', organizationId)
            .order('sale_date', { ascending: false });
        const BASE_VENTAS = 'id, total, sale_date, status, payment_status, user_id, branch:branches(name)';
        let ventasRes = await consultarVentas(`${BASE_VENTAS}, sale_items(count)`);
        if (ventasRes.error) ventasRes = await consultarVentas(BASE_VENTAS);
        if (ventasRes.error) throw ventasRes.error;
        const ventas = (ventasRes.data ?? []) as unknown as VentaResumen[];

        // 2. Reservas (checkin es columna date).
        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select('id, start_date, end_date, checkin, checkout, status')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('start_date', { ascending: false });
        if (reservationsError) throw reservationsError;
        const reservas: ReservaResumen[] = reservationsData || [];

        // 2b. Folios de las reservas: saldo pendiente (abiertos) y consumo pagado (cerrados).
        const reservationIds = reservas.map((r) => r.id);
        let folioSaldoPendiente = 0;
        let folioItemsPendientes = 0;
        let foliosPagadosCount = 0;
        let foliosPagadosMonto = 0;

        if (reservationIds.length > 0) {
          const { data: foliosOpenData } = await supabase
            .from('folios')
            .select('id, balance, status')
            .in('reservation_id', reservationIds)
            .eq('status', 'open');

          if (foliosOpenData) {
            const foliosAbiertos: FolioResumen[] = foliosOpenData;
            const folioIds = foliosAbiertos.map((f) => f.id);
            folioSaldoPendiente = foliosAbiertos.reduce((sum, f) => sum + Number(f.balance), 0);
            if (folioIds.length > 0) {
              const { data: folioItemsData } = await supabase
                .from('folio_items')
                .select('id, payment_status')
                .in('folio_id', folioIds)
                .eq('payment_status', 'pending');
              folioItemsPendientes = folioItemsData?.length ?? 0;
            }
          }

          const { data: foliosClosedData } = await supabase
            .from('folios')
            .select('id, reservation_id, balance, status, created_at')
            .in('reservation_id', reservationIds)
            .eq('status', 'closed');

          if (foliosClosedData && foliosClosedData.length > 0) {
            const foliosCerrados: FolioResumen[] = foliosClosedData;
            const { data: closedFolioItems } = await supabase
              .from('folio_items')
              .select('folio_id, amount')
              .in(
                'folio_id',
                foliosCerrados.map((f) => f.id),
              );
            const folioTotalMap = new Map<string, number>();
            for (const fi of closedFolioItems ?? []) {
              folioTotalMap.set(fi.folio_id, (folioTotalMap.get(fi.folio_id) || 0) + (Number(fi.amount) || 0));
            }
            foliosPagadosCount = foliosClosedData.length;
            foliosPagadosMonto = foliosCerrados.reduce((sum, f) => sum + (folioTotalMap.get(f.id) || 0), 0);
          }
        }

        // 2c. Próxima reserva: día calendario de llegada posterior a hoy en la zona de la organización.
        const hoy = todayInTz(timezone);
        const futuras = reservas
          .filter((r) => !!r.checkin && r.checkin.slice(0, 10) > hoy && ['confirmed', 'tentative'].includes(r.status))
          .sort((a, b) => (a.checkin ?? '').localeCompare(b.checkin ?? ''));
        const proximaReserva = futuras[0]?.checkin ?? null;

        // 3. Pedidos web.
        const { data: webOrdersData, error: webOrdersError } = await supabase
          .from('web_orders')
          .select('id, order_number, status, total, created_at, branch:branches(name)')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
        if (webOrdersError) throw webOrdersError;
        const pedidos = (webOrdersData ?? []) as unknown as PedidoResumen[];

        // 4. Estadísticas: pedidos web pagados y folios cerrados cuentan como compras.
        const paidWebOrders = pedidos.filter((o) => o.status === 'paid' || o.status === 'delivered');
        const totalCompras = ventas.length + paidWebOrders.length + foliosPagadosCount;
        const montoVentas = ventas.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        const montoWebPaid = paidWebOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const ultimaCompraRaw = [...ventas.map((s) => new Date(s.sale_date)), ...paidWebOrders.map((o) => new Date(o.created_at))].sort(
          (a, b) => b.getTime() - a.getTime(),
        );

        // 5. Historial unificado (ventas + reservas + pedidos web).
        const historial: HistorialItem[] = [
          ...ventas.slice(0, 10).map((s) => ({
            id: `sale-${s.id}`,
            tipo: 'venta' as const,
            referencia: s.id.slice(0, 8).toUpperCase(),
            fecha: s.sale_date,
            monto: Number(s.total) || 0,
            status: s.payment_status || s.status || '',
            productos: uno(s.sale_items)?.count ?? undefined,
            sucursal: uno(s.branch)?.name ?? null,
            usuarioId: s.user_id,
          })),
          ...reservas.slice(0, 10).map((r) => ({
            id: `res-${r.id}`,
            tipo: 'reserva' as const,
            referencia: r.start_date,
            fecha: r.start_date,
            monto: 0,
            status: r.status || '',
          })),
          ...pedidos.slice(0, 10).map((o) => ({
            id: `web-${o.id}`,
            tipo: 'web_order' as const,
            referencia: String(o.order_number),
            fecha: o.created_at,
            monto: Number(o.total) || 0,
            status: o.status || '',
            sucursal: uno(o.branch)?.name ?? null,
          })),
        ]
          .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
          .slice(0, 8);

        // 6. Quién registró cada venta del historial.
        const ids = Array.from(new Set(historial.map((h) => h.usuarioId).filter((v): v is string => !!v)));
        const personas: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: perfiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
          for (const p of (perfiles ?? []) as Perfil[]) {
            const nombre = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
            if (nombre) personas[p.id] = nombre;
          }
        }

        if (cancelado) return;
        setStats({
          totalCompras,
          totalEstadias: reservas.length,
          montoTotalGastado: montoVentas + montoWebPaid + foliosPagadosMonto,
          ultimaCompra: ultimaCompraRaw[0] ?? null,
          ultimaEstadia: reservas[0] ? new Date(reservas[0].start_date) : null,
          totalWebOrders: pedidos.length,
          ultimaWebOrder: pedidos[0] ? new Date(pedidos[0].created_at) : null,
          historial,
          folioSaldoPendiente,
          folioItemsPendientes,
          proximaReserva,
          personas,
        });
      } catch (err) {
        console.error('Error al cargar el resumen:', err);
        if (!cancelado) setError({ mensaje: mensajeError(err) });
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void fetchResumenData();
    return () => {
      cancelado = true;
    };
  }, [clienteId, organizationId, timezone, vuelta]);

  // Cartera: «N facturas vencidas», con los días de la más antigua en móvil.
  const carteraKpi = useMemo(() => {
    const estado = cartera?.estado ?? 'cargando';
    const resumen = cartera?.resumen ?? null;
    const vencidas = resumen?.cuentas_vencidas ?? 0;
    const diasMax = (cartera?.filas ?? []).reduce((m, f) => Math.max(m, f.dias || 0), 0);
    return { estado, resumen, vencidas, diasMax };
  }, [cartera]);

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" compacto descripcion={error.mensaje || t('resumen.errorCarga')} onReintentar={() => setVuelta((n) => n + 1)} />
      </div>
    );
  }

  if (!loading && vacio && stats.historial.length === 0) return <>{vacio}</>;

  const saldoCartera =
    carteraKpi.estado === 'listo' ? formatear(carteraKpi.resumen?.por_cobrar ?? 0) : carteraKpi.estado === 'cargando' ? '' : '—';
  const detalleCartera = (largo: boolean): string =>
    carteraKpi.estado === 'sinPermiso'
      ? t('resumen.carteraSinPermiso')
      : carteraKpi.estado === 'error'
        ? t('resumen.carteraError')
        : carteraKpi.vencidas > 0
          ? largo && carteraKpi.diasMax > 0
            ? t('resumen.facturasVencidasHace', { count: carteraKpi.vencidas, dias: carteraKpi.diasMax })
            : t('resumen.facturasVencidas', { count: carteraKpi.vencidas })
          : t('resumen.sinSaldoPendiente');
  const carteraVencida = carteraKpi.estado === 'listo' && carteraKpi.vencidas > 0;
  const tarjetaCartera = (largo: boolean) => (
    <StatCard
      etiqueta={t('resumen.saldoCartera')}
      valor={saldoCartera}
      detalle={detalleCartera(largo)}
      tono={carteraVencida ? 'peligro' : 'neutro'}
      tendencia={carteraVencida ? 'baja' : undefined}
      cargando={carteraKpi.estado === 'cargando'}
      tamano="sm"
    />
  );
  const tarjetaGasto = (detalle: string) => (
    <StatCard etiqueta={t('resumen.gastoTotal')} valor={formatear(stats.montoTotalGastado)} detalle={detalle} cargando={loading} tamano="sm" />
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Móvil (Figma 332:118153): lo que se mira de pie en el mostrador. */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {tarjetaCartera(true)}
        {tarjetaGasto(t('resumen.comprasConteo', { count: stats.totalCompras }))}
      </div>

      <section aria-label={t('resumen.kpisAria')} className="hidden grid-cols-3 gap-2.5 sm:grid">
        <StatCard
          etiqueta={t('resumen.compras')}
          valor={stats.totalCompras}
          detalle={stats.ultimaCompra ? t('resumen.ultima', { fecha: instante(stats.ultimaCompra, DIA_MES_ANIO) }) : t('resumen.sinCompras')}
          cargando={loading}
          tamano="sm"
        />
        {tarjetaGasto(t('resumen.gastoTotalDescripcion'))}
        {tarjetaCartera(false)}
        <StatCard
          etiqueta={t('resumen.estadias')}
          valor={stats.totalEstadias}
          detalle={
            stats.proximaReserva
              ? t('resumen.proxima', { fecha: plana(stats.proximaReserva, DIA_MES_ANIO) })
              : stats.ultimaEstadia
                ? t('resumen.ultima', { fecha: instante(stats.ultimaEstadia, DIA_MES_ANIO) })
                : t('resumen.sinEstadias')
          }
          tono={stats.proximaReserva ? 'informacion' : 'neutro'}
          cargando={loading}
          tamano="sm"
        />
        <StatCard
          etiqueta={t('resumen.pedidosWeb')}
          valor={stats.totalWebOrders}
          detalle={stats.ultimaWebOrder ? t('resumen.ultimo', { fecha: instante(stats.ultimaWebOrder, DIA_MES_ANIO) }) : t('resumen.sinPedidosWeb')}
          cargando={loading}
          tamano="sm"
        />
        <StatCard
          etiqueta={t('resumen.saldoFolios')}
          valor={formatear(stats.folioSaldoPendiente)}
          detalle={stats.folioItemsPendientes > 0 ? t('resumen.itemsPendientes', { count: stats.folioItemsPendientes }) : t('resumen.sinSaldoPendiente')}
          tono={stats.folioItemsPendientes > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={stats.folioItemsPendientes > 0 ? TriangleAlert : undefined}
          cargando={loading}
          tamano="sm"
        />
      </section>

      <Tarjeta
        titulo={t('resumen.historialReciente')}
        accion={
          onVerActividad ? (
            <button
              type="button"
              onClick={onVerActividad}
              className="rounded text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('resumen.verTodaActividad')}
            </button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : stats.historial.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {stats.historial.map((item) => {
              const persona = item.usuarioId ? stats.personas[item.usuarioId] : undefined;
              if (item.tipo === 'venta') {
                return (
                  <EntradaHistorial
                    key={item.id}
                    icono={ShoppingCart}
                    tono="exito"
                    titulo={t('resumen.historial.venta', { numero: item.referencia })}
                    estado={item.status ? <StatusBadge estado={item.status} /> : undefined}
                    detalle={unirPartes([
                      item.productos !== undefined ? t('resumen.productos', { count: item.productos }) : null,
                      item.sucursal,
                      item.monto > 0 ? formatear(item.monto) : null,
                    ])}
                    meta={unirPartes([cuando(item.fecha), persona])}
                  />
                );
              }
              if (item.tipo === 'reserva') {
                return (
                  <EntradaHistorial
                    key={item.id}
                    icono={CalendarDays}
                    tono="informacion"
                    titulo={t('resumen.historial.reserva', { fecha: instante(item.referencia, DIA_MES) })}
                    estado={item.status ? <StatusBadge estado={item.status} /> : undefined}
                  />
                );
              }
              return (
                <EntradaHistorial
                  key={item.id}
                  icono={ShoppingBag}
                  tono="marca"
                  titulo={t('resumen.historial.pedido', { numero: item.referencia })}
                  estado={item.status ? <StatusBadge estado={item.status} /> : undefined}
                  detalle={unirPartes([item.sucursal, item.monto > 0 ? formatear(item.monto) : null])}
                  meta={cuando(item.fecha)}
                />
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-fg-secondary">{t('resumen.sinActividad')}</p>
        )}
      </Tarjeta>
    </div>
  );
}
