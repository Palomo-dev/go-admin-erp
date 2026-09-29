'use client';

/**
 * Pagos de membresías — las líneas de venta cuyo producto es una membresía (POS, factura o web),
 * con su factura y saldo y el enlace a la membresía que crearon. Rango de días de la
 * organización en la URL (`desde`/`hasta`; por defecto el mes en curso).
 * Datos: `GET /api/membresias/pagos`.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleDollarSign, FileText, Receipt, ShoppingCart, UserCheck } from 'lucide-react';
import {
  DataTable,
  DateRangeButton,
  KpiStrip,
  ListCard,
  PageHeader,
  Pagination,
  StatCard,
  StatusBadge,
  useListadoServidor,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { PagoFila } from '@/lib/services/membresias/tipos';
import { EstadoPantalla } from '../comun/EstadoPantalla';
import { esSinPermiso, useCargaMembresias } from '../comun/useCargaMembresias';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { RUTA_MEMBRESIAS, leerRangoPagos, rutaDetalle } from '../logica';

const CLASE_ENLACE = 'font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export default function PagosMembresias() {
  const router = useRouter();
  const t = useTranslations('membresias.pagos');
  const tc = useTranslations('membresias.comun');
  const tp = useTranslations('membresias.pantalla');
  const { getToday } = useFormatDate();
  const hoy = getToday();

  const l = useListadoServidor({ filtros: ['desde', 'hasta'], tamanoPorDefecto: 20 });
  const rango = leerRangoPagos(l.filtros.desde, l.filtros.hasta, hoy);
  const consulta = { desde: rango.desde, hasta: rango.hasta, pagina: l.pagina, porPagina: l.tamano };
  const carga = useCargaMembresias(JSON.stringify(consulta), () => apiMembresias.pagos(consulta));
  const datos = carga.datos;
  const f = useFormatoMembresias(datos?.zona);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;

  const accionesDe = (p: PagoFila): AccionFila[] => [
    { id: 'venta', etiqueta: t('acciones.verVenta'), icono: Receipt, onSelect: () => router.push(`/app/pos/ventas/${p.saleId}`) },
    { id: 'factura', etiqueta: t('acciones.verFactura'), icono: FileText, onSelect: () => p.factura && router.push(`/app/finanzas/facturas-venta/${p.factura.id}`), oculta: !p.factura },
    { id: 'membresia', etiqueta: t('acciones.verMembresia'), icono: UserCheck, onSelect: () => p.membresiaId && router.push(rutaDetalle(p.membresiaId)), oculta: !p.membresiaId },
  ];

  const columnas: ColumnaTabla<PagoFila>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (p) => <span className="whitespace-nowrap tabular-nums">{f.fecha(p.fecha)}</span> },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      celda: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{p.cliente?.nombre ?? t('sinCliente')}</span>
          {p.cliente?.documento && <span className="truncate text-xs text-fg-secondary tabular-nums">{p.cliente.documento}</span>}
        </div>
      ),
    },
    { id: 'producto', encabezado: t('columnas.producto'), celda: (p) => <span className="truncate">{p.producto}</span> },
    { id: 'cantidad', encabezado: t('columnas.cantidad'), variante: 'importe', ocultarDebajo: 'md', celda: (p) => f.entero(p.cantidad) },
    { id: 'total', encabezado: t('columnas.total'), variante: 'importe', celda: (p) => f.moneda(p.total) },
    {
      id: 'estado',
      encabezado: t('columnas.estadoVenta'),
      ocultarDebajo: 'lg',
      celda: (p) => (p.estadoVenta ? <StatusBadge estado={p.estadoVenta} tamano="sm" /> : '—'),
    },
    {
      id: 'factura',
      encabezado: t('columnas.factura'),
      ocultarDebajo: 'lg',
      celda: (p) =>
        p.factura ? (
          <div className="flex min-w-0 flex-col">
            <Link href={`/app/finanzas/facturas-venta/${p.factura.id}`} onClick={(e) => e.stopPropagation()} className={CLASE_ENLACE}>
              {p.factura.numero}
            </Link>
            <span className={p.factura.saldo > 0.009 ? 'text-xs text-warning-text' : 'text-xs text-fg-secondary'}>
              {p.factura.saldo > 0.009 ? t('saldo', { saldo: f.moneda(p.factura.saldo) }) : t('sinSaldo')}
            </span>
          </div>
        ) : (
          <span className="text-fg-secondary">{t('sinFactura')}</span>
        ),
    },
    {
      id: 'membresia',
      encabezado: t('columnas.membresia'),
      ocultarDebajo: 'xl',
      celda: (p) =>
        p.membresiaId ? (
          <Link href={rutaDetalle(p.membresiaId)} onClick={(e) => e.stopPropagation()} className={CLASE_ENLACE}>
            {t('verMembresia')}
          </Link>
        ) : (
          <span className="text-fg-secondary">{t('renovacion')}</span>
        ),
    },
  ];

  const estadoTabla: EstadoTabla =
    carga.cargando && !datos
      ? 'cargando'
      : carga.error
        ? esSinPermiso(carga.error)
          ? 'sinPermiso'
          : 'error'
        : carga.cargando
          ? 'cargando'
          : 'listo';

  const fijarRango = (r: { desde: string; hasta: string }) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } });

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={datos ? t('subtitulo', { count: datos.total, desde: f.dia(rango.desde), hasta: f.dia(rango.hasta) }) : t('cargando')}
        icono={CircleDollarSign}
        cargando={carga.cargando}
        migas={[{ etiqueta: tc('modulo'), href: RUTA_MEMBRESIAS }, { etiqueta: t('titulo') }]}
        acciones={
          <Link
            href="/app/pos"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tc('venderMembresia')}
          </Link>
        }
      />

      {!esSinPermiso(carga.error) && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <DateRangeButton valor={rango} onValorChange={fijarRango} hoy={hoy} etiqueta={t('rango')} />
          </div>
          <KpiStrip etiqueta={t('kpis.etiqueta')} columnas={2}>
            <StatCard
              etiqueta={t('kpis.totalPeriodo')}
              icono={CircleDollarSign}
              cargando={!datos}
              valor={datos ? f.moneda(datos.totalImporte) : '—'}
              detalle={datos ? t('kpis.lineas', { count: datos.total }) : undefined}
            />
            <StatCard
              etiqueta={t('kpis.conSaldo')}
              icono={FileText}
              cargando={!datos}
              valor={datos ? f.entero(filas.filter((p) => p.factura && p.factura.saldo > 0.009).length) : '—'}
              detalle={t('kpis.conSaldoDetalle')}
              tono={filas.some((p) => p.factura && p.factura.saldo > 0.009) ? 'advertencia' : 'neutro'}
            />
          </KpiStrip>
        </>
      )}

      {carga.error && !esSinPermiso(carga.error) && !datos ? (
        <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('error')} />
      ) : (
        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(p) => p.saleItemId}
          estado={estadoTabla}
          onFilaClick={(p) => router.push(p.membresiaId ? rutaDetalle(p.membresiaId) : `/app/pos/ventas/${p.saleId}`)}
          etiquetaFila={(p) => `${p.cliente?.nombre ?? t('sinCliente')} · ${p.producto}`}
          acciones={accionesDe}
          tarjetaMovil={(p) => (
            <ListCard
              icono={Receipt}
              titulo={p.cliente?.nombre ?? t('sinCliente')}
              subtitulo={`${p.producto} · ${f.fecha(p.fecha)}`}
              meta={p.factura ? (p.factura.saldo > 0.009 ? t('saldo', { saldo: f.moneda(p.factura.saldo) }) : p.factura.numero) : t('sinFactura')}
              valor={f.moneda(p.total)}
              estado={p.estadoVenta ? <StatusBadge estado={p.estadoVenta} tamano="sm" /> : undefined}
              acciones={accionesDe(p)}
              onClick={() => router.push(p.membresiaId ? rutaDetalle(p.membresiaId) : `/app/pos/ventas/${p.saleId}`)}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: CircleDollarSign,
            accion: { etiqueta: t('vacio.irAlPos'), href: '/app/pos', icono: ShoppingCart },
          }}
          sinPermiso={{ titulo: tp('sinPermiso.titulo'), descripcion: tp('sinPermiso.descripcion') }}
          error={{ titulo: t('error') }}
          onReintentar={carga.recargar}
          pie={
            <Pagination
              pagina={l.pagina}
              tamano={l.tamano}
              total={total}
              onPaginaChange={l.setPagina}
              onTamanoChange={l.setTamano}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
              cargando={carga.cargando}
            />
          }
        />
      )}
    </div>
  );
}
