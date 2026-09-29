'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  History,
  Layers,
  PackageCheck,
  Pencil,
  Warehouse,
} from 'lucide-react';
import {
  AccionRapida,
  DataTable,
  EmptyState,
  KpiStrip,
  ListCard,
  StatCard,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import type { StockSucursalResumen } from '@/lib/services/productoService';
import { cn } from '@/utils/Utils';
import { TONO_ESTADO_STOCK, estadoStockSucursal, totalesStock, valorInventario } from '../../logica/stock';
import { useProductoDetalle } from '../ContextoProducto';
import { BotonInventario } from './stock/BotonInventario';
import { DesgloseVariantes } from './stock/DesgloseVariantes';
import { rutaAjuste, rutaTransferencia } from './stock/logicaInventario';
import { useCantidad } from './stock/useFormatoInventario';

/**
 * Inventario › Stock (Figma `04 Inventario › Producto — 07 Stock`, paridad
 * A.6 + H.1): tres cifras de la sucursal activa (o de todas), acciones de
 * entrada, salida, historial y transferencia, y la tabla por sucursal con
 * mínimo, costo promedio, valor, actualización y estado frente al mínimo.
 * Los datos vienen agregados en `resumen.sucursales` (fn_producto_resumen);
 * con variantes, además, el desglose variante × sucursal.
 */
export function StockSucursales() {
  const t = useTranslations('productoDetalle.inventario');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, resumen, cargandoResumen, errorResumen, recargarResumen, permisos, moneda, fechas, sucursalActiva, irA } =
    useProductoDetalle();
  const cantidad = useCantidad(producto);
  const localeIntl = useLocaleIntl();

  const esServicio = producto.product_type === 'service';
  const rastrea = producto.track_stock !== false && !esServicio;
  const eliminado = producto.status === 'deleted';
  const variantes = useMemo(() => (producto.children ?? []).filter((v) => v.status !== 'deleted'), [producto.children]);
  const conVariantes = variantes.length > 0;
  /** El ajuste solo admite productos sin variantes: el padre abre con la sucursal y el tipo. */
  const idAjustable = conVariantes ? null : producto.id;

  const motivoAjuste = eliminado
    ? t('motivos.eliminado')
    : resumen && !permisos.ajustar
      ? tc('sinPermiso')
      : undefined;
  const bloqueado = !!motivoAjuste;

  const todas = useMemo(() => resumen?.sucursales ?? [], [resumen]);
  const visibles = useMemo(
    () => (sucursalActiva === null ? todas : todas.filter((s) => s.branch_id === sucursalActiva)),
    [todas, sucursalActiva],
  );
  const totales = totalesStock(todas, sucursalActiva);
  const valorTotal = visibles.reduce((v, s) => v + valorInventario(s.qty_on_hand, s.avg_cost), 0);
  const filasConLote = visibles.reduce((n, s) => n + s.filas_lote, 0);

  if (!rastrea) {
    const puedeEditar = !eliminado && (!resumen || permisos.editar);
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          icono={PackageCheck}
          titulo={t('stock.sinSeguimiento.titulo')}
          descripcion={esServicio ? t('stock.sinSeguimiento.servicio') : t('stock.sinSeguimiento.descripcion')}
          accion={
            puedeEditar
              ? { etiqueta: t('stock.sinSeguimiento.editar'), href: `/app/inventario/productos/${producto.uuid}/editar`, icono: Pencil }
              : undefined
          }
        />
      </div>
    );
  }

  const fechaCorta = (valor: string | null) =>
    valor
      ? formatDateTimeInTz(valor, fechas.timezone, {
          locale: localeIntl,
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : tc('sinDatos');

  const estadoBadge = (s: StockSucursalResumen) => {
    const estado = estadoStockSucursal(s);
    return (
      <Badge tono={TONO_ESTADO_STOCK[estado]} tamano="sm" punto>
        {t(`estadosStock.${estado}`)}
      </Badge>
    );
  };

  const botonLotes = (s: StockSucursalResumen) =>
    s.filas_lote > 0 ? (
      <button
        type="button"
        onClick={() => irA('inventario', 'lotes')}
        className="inline-flex h-[22px] items-center gap-1 rounded-full border border-line-brand bg-brand-tint px-1.5 text-[11px] font-semibold text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Layers aria-hidden="true" className="size-3" strokeWidth={2} />
        {t('stock.conLotes', { count: s.filas_lote })}
      </button>
    ) : null;

  const accionesFila = (s: StockSucursalResumen, soloIcono: boolean) => (
    <>
      <AccionRapida
        etiqueta={soloIcono ? t('stock.entradaEn', { sucursal: s.nombre }) : t('stock.entrada')}
        icono={ArrowUp}
        soloIcono={soloIcono}
        href={rutaAjuste(idAjustable, 'entrada', s.branch_id)}
        deshabilitada={bloqueado}
        motivo={motivoAjuste}
      />
      <AccionRapida
        etiqueta={soloIcono ? t('stock.salidaEn', { sucursal: s.nombre }) : t('stock.salida')}
        icono={ArrowDown}
        soloIcono={soloIcono}
        href={rutaAjuste(idAjustable, 'salida', s.branch_id)}
        deshabilitada={bloqueado}
        motivo={motivoAjuste}
      />
      <AccionRapida
        etiqueta={soloIcono ? t('stock.transferirDesde', { sucursal: s.nombre }) : t('stock.transferir')}
        icono={ArrowLeftRight}
        soloIcono={soloIcono}
        href={rutaTransferencia(idAjustable, s.branch_id)}
        deshabilitada={bloqueado || todas.length < 2}
        motivo={motivoAjuste ?? (todas.length < 2 ? t('motivos.unaSucursal') : undefined)}
      />
    </>
  );

  const columnas: ColumnaTabla<StockSucursalResumen>[] = [
    {
      id: 'sucursal',
      encabezado: tc('sucursal'),
      celda: (s) => (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Warehouse aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          <span className="font-medium text-fg">{s.nombre}</span>
          {s.principal && (
            <Badge tono="marca" tamano="sm">
              {t('stock.principal')}
            </Badge>
          )}
          {!s.activa && (
            <Badge tono="neutro" tamano="sm">
              {t('stock.inactiva')}
            </Badge>
          )}
          {botonLotes(s)}
        </div>
      ),
    },
    { id: 'existencia', encabezado: t('stock.columnas.existencia'), variante: 'importe', celda: (s) => cantidad(s.qty_on_hand) },
    { id: 'reservado', encabezado: t('stock.columnas.reservado'), variante: 'importe', celda: (s) => cantidad(s.qty_reserved) },
    {
      id: 'disponible',
      encabezado: t('stock.columnas.disponible'),
      variante: 'importe',
      celda: (s) => {
        const estado = estadoStockSucursal(s);
        return (
          <span
            className={cn(
              'font-semibold',
              estado === 'agotado' && 'text-danger-text',
              estado === 'bajo_minimo' && 'text-warning-text',
            )}
          >
            {cantidad(s.disponible)}
          </span>
        );
      },
    },
    {
      id: 'minimo',
      encabezado: t('stock.columnas.minimo'),
      variante: 'importe',
      celda: (s) => (s.min_level > 0 ? cantidad(s.min_level) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
    },
    {
      id: 'costo',
      encabezado: t('stock.columnas.costoPromedio'),
      variante: 'importe',
      ocultarDebajo: 'xl',
      celda: (s) => (s.avg_cost > 0 ? moneda.formatear(s.avg_cost) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
    },
    {
      id: 'valor',
      encabezado: t('stock.columnas.valor'),
      variante: 'importe',
      celda: (s) =>
        s.avg_cost > 0 && s.qty_on_hand !== 0 ? (
          moneda.formatear(valorInventario(s.qty_on_hand, s.avg_cost))
        ) : (
          <span className="text-fg-muted">{tc('sinDatos')}</span>
        ),
    },
    {
      id: 'actualizado',
      encabezado: t('stock.columnas.actualizado'),
      ocultarDebajo: 'xl',
      celda: (s) => <span className="whitespace-nowrap text-fg-secondary">{fechaCorta(s.actualizado)}</span>,
    },
    { id: 'estado', encabezado: t('stock.columnas.estado'), celda: estadoBadge },
  ];

  const estadoTabla = cargandoResumen && !resumen ? 'cargando' : errorResumen && !resumen ? 'error' : 'listo';

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip etiqueta={t('stock.cifras')} columnas={3}>
        <StatCard
          etiqueta={t('stock.total')}
          cargando={cargandoResumen && !resumen}
          valor={cantidad(totales.enExistencia)}
          detalle={sucursalActiva === null ? t('stock.enTodas') : t('stock.enSeleccionada')}
        />
        <StatCard
          etiqueta={t('stock.reservado')}
          cargando={cargandoResumen && !resumen}
          valor={cantidad(totales.reservado)}
          detalle={t('stock.reservadoAyuda')}
        />
        <StatCard
          etiqueta={t('stock.disponible')}
          cargando={cargandoResumen && !resumen}
          valor={cantidad(totales.disponible)}
          detalle={
            totales.agotadas > 0
              ? t('stock.agotadas', { count: totales.agotadas })
              : totales.bajoMinimo > 0
                ? t('stock.bajoMinimo', { count: totales.bajoMinimo })
                : t('stock.disponibleAyuda')
          }
          tono={totales.agotadas > 0 ? 'peligro' : totales.bajoMinimo > 0 ? 'advertencia' : 'neutro'}
        />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <BotonInventario
          variante="primario"
          etiqueta={t('stock.registrarEntrada')}
          icono={ArrowUp}
          href={rutaAjuste(idAjustable, 'entrada', sucursalActiva)}
          deshabilitado={bloqueado}
          motivo={motivoAjuste}
        />
        <BotonInventario
          variante="primario"
          etiqueta={t('stock.registrarSalida')}
          icono={ArrowDown}
          href={rutaAjuste(idAjustable, 'salida', sucursalActiva)}
          deshabilitado={bloqueado}
          motivo={motivoAjuste}
        />
        <BotonInventario etiqueta={t('stock.verHistorial')} icono={History} onClick={() => irA('inventario', 'kardex')} />
        <BotonInventario
          etiqueta={t('stock.transferir')}
          icono={ArrowLeftRight}
          href={rutaTransferencia(idAjustable, sucursalActiva)}
          deshabilitado={bloqueado || todas.length < 2}
          motivo={motivoAjuste ?? (todas.length < 2 ? t('motivos.unaSucursal') : undefined)}
        />
      </div>

      {conVariantes && (
        <p className="rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text">
          {t('stock.avisoVariantes', { count: variantes.length })}
        </p>
      )}

      <DataTable
        etiqueta={t('stock.tablaEtiqueta')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(s) => String(s.branch_id)}
        etiquetaFila={(s) => s.nombre}
        estado={estadoTabla}
        filasEsqueleto={3}
        onReintentar={() => void recargarResumen()}
        error={{ titulo: t('stock.errorTitulo'), descripcion: errorResumen ?? tc('errorCargar') }}
        vacio={{
          icono: Warehouse,
          titulo: t('stock.sinSucursales.titulo'),
          descripcion: t('stock.sinSucursales.descripcion'),
          accion: { etiqueta: t('stock.sinSucursales.accion'), href: '/app/organizacion/sucursales' },
        }}
        accionesRapidas={(s) => accionesFila(s, true)}
        tarjetaMovil={(s) => (
          <ListCard
            icono={Warehouse}
            titulo={s.nombre}
            insignia={
              s.principal ? (
                <Badge tono="marca" tamano="sm">
                  {t('stock.principal')}
                </Badge>
              ) : undefined
            }
            subtitulo={t('stock.movil.cifras', {
              existencia: cantidad(s.qty_on_hand),
              reservado: cantidad(s.qty_reserved),
              disponible: cantidad(s.disponible),
            })}
            meta={t('stock.movil.meta', {
              minimo: s.min_level > 0 ? cantidad(s.min_level) : tc('sinDatos'),
              actualizado: fechaCorta(s.actualizado),
            })}
            valor={s.avg_cost > 0 && s.qty_on_hand !== 0 ? moneda.formatear(valorInventario(s.qty_on_hand, s.avg_cost)) : undefined}
            estado={estadoBadge(s)}
            etiquetas={
              <>
                {accionesFila(s, false)}
                {botonLotes(s)}
              </>
            }
          />
        )}
      />

      {estadoTabla === 'listo' && visibles.length > 0 && (
        <p className="text-xs text-fg-muted">
          {t('stock.pie', { valor: moneda.formatear(valorTotal) })}
          {filasConLote > 0 && <> · {t('stock.pieLotes')}</>}
        </p>
      )}

      {conVariantes && <DesgloseVariantes variantes={variantes} motivoAjuste={motivoAjuste} />}
    </div>
  );
}
