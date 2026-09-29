'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarClock, History, Layers, TriangleAlert, Truck, Warehouse } from 'lucide-react';
import {
  DataTable,
  ListCard,
  SegmentedControl,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { productoService, type LoteProducto } from '@/lib/services/productoService';
import { useProductoDetalle } from '../ContextoProducto';
import { BotonInventario } from './stock/BotonInventario';
import { TONO_VENCIMIENTO, estadoVencimiento } from './stock/logicaInventario';
import { useCantidad } from './stock/useFormatoInventario';

type FiltroLotes = 'con_existencia' | 'todos';

/** Lote con las cifras de la sucursal activa (o de todas). */
interface FilaLote extends LoteProducto {
  existencia: number;
  reservado: number;
  desglose: LoteProducto['sucursales'];
}

/**
 * Inventario › Lotes (Figma `32 · lotes en el detalle de producto`, «Nuevo»):
 * código, variante, vencimiento con su estado, proveedor, existencia,
 * reservado y desglose por sucursal. Aviso de lo que vence pronto. Los lotes
 * se capturan en compras y ajustes; aquí se consultan.
 */
export function LotesProducto() {
  const t = useTranslations('productoDetalle.inventario');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, sucursalActiva, fechas, mensajeError, irA } = useProductoDetalle();
  const cantidad = useCantidad(producto);
  const localeIntl = useLocaleIntl();
  const [lotes, setLotes] = useState<LoteProducto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<FiltroLotes>('con_existencia');

  const conVariantes = (producto.children ?? []).some((v) => v.status !== 'deleted');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await productoService.lotes(organizacionId, producto.id);
      setLotes(r);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [organizacionId, producto.id, mensajeError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const conCifras = useMemo<FilaLote[]>(
    () =>
      (lotes ?? []).map((l) => {
        const desglose = sucursalActiva === null ? l.sucursales : l.sucursales.filter((s) => s.branch_id === sucursalActiva);
        return {
          ...l,
          desglose,
          existencia: sucursalActiva === null ? l.qty_on_hand : desglose.reduce((n, s) => n + s.qty_on_hand, 0),
          reservado: sucursalActiva === null ? l.qty_reserved : desglose.reduce((n, s) => n + s.qty_reserved, 0),
        };
      }),
    [lotes, sucursalActiva],
  );

  const filas = useMemo(
    () => (filtro === 'todos' ? conCifras : conCifras.filter((l) => l.existencia > 0)),
    [conCifras, filtro],
  );

  const conExistencia = conCifras.filter((l) => l.existencia > 0);
  const unidades = conExistencia.reduce((n, l) => n + l.existencia, 0);
  const sucursalesConLotes = new Set(conExistencia.flatMap((l) => l.desglose.filter((s) => s.qty_on_hand > 0).map((s) => s.branch_id))).size;
  const porVencer = conExistencia.filter((l) => estadoVencimiento(l.dias_para_vencer) === 'por_vencer');
  const vencidos = conExistencia.filter((l) => estadoVencimiento(l.dias_para_vencer) === 'vencido');
  const unidadesPorVencer = porVencer.reduce((n, l) => n + l.existencia, 0);
  const diasMinimos = porVencer.reduce((m, l) => Math.min(m, l.dias_para_vencer ?? m), Number.POSITIVE_INFINITY);
  const unidadesVencidas = vencidos.reduce((n, l) => n + l.existencia, 0);

  const textoVence = (l: FilaLote) => {
    if (l.dias_para_vencer === null) return null;
    if (l.dias_para_vencer < 0) return t('lotes.vencioHace', { count: -l.dias_para_vencer });
    if (l.dias_para_vencer === 0) return t('lotes.venceHoy');
    return t('lotes.venceEn', { count: l.dias_para_vencer });
  };

  const badgeEstado = (l: FilaLote) => {
    const estado = estadoVencimiento(l.dias_para_vencer);
    return (
      <Badge tono={TONO_VENCIMIENTO[estado]} tamano="sm">
        {t(`lotes.estados.${estado}`)}
      </Badge>
    );
  };

  const desgloseTexto = (l: FilaLote) =>
    l.desglose.length === 0
      ? tc('sinDatos')
      : l.desglose.map((s) => t('lotes.enSucursal', { sucursal: s.sucursal, cantidad: cantidad(s.qty_on_hand) })).join(' · ');

  const columnas: ColumnaTabla<FilaLote>[] = [
    { id: 'lote', encabezado: t('lotes.columnas.lote'), variante: 'mono', celda: (l) => <span className="font-medium text-fg">{l.lot_code}</span> },
    ...(conVariantes
      ? [
          {
            id: 'variante',
            encabezado: t('lotes.columnas.variante'),
            celda: (l: FilaLote) => <span className="text-fg-secondary">{l.producto_nombre}</span>,
          } satisfies ColumnaTabla<FilaLote>,
        ]
      : []),
    {
      id: 'sucursales',
      encabezado: t('lotes.columnas.sucursales'),
      celda: (l) => (
        <ul className="flex flex-col gap-0.5 text-fg-secondary">
          {l.desglose.length === 0 ? (
            <li className="text-fg-muted">{tc('sinDatos')}</li>
          ) : (
            l.desglose.map((s) => (
              <li key={s.branch_id} className="whitespace-nowrap">
                {s.sucursal} <span className="tabular-nums text-fg">{cantidad(s.qty_on_hand)}</span>
              </li>
            ))
          )}
        </ul>
      ),
    },
    { id: 'existencia', encabezado: t('lotes.columnas.existencia'), variante: 'importe', celda: (l) => <span className="font-semibold">{cantidad(l.existencia)}</span> },
    { id: 'reservado', encabezado: t('lotes.columnas.reservado'), variante: 'importe', ocultarDebajo: 'xl', celda: (l) => cantidad(l.reservado) },
    {
      id: 'vence',
      encabezado: t('lotes.columnas.vence'),
      celda: (l) =>
        l.expiry_date ? (
          <div className="flex flex-col">
            <span className="tabular-nums text-fg">{formatPlainDate(l.expiry_date)}</span>
            <span
              className={
                estadoVencimiento(l.dias_para_vencer) === 'vencido'
                  ? 'text-xs text-danger-text'
                  : estadoVencimiento(l.dias_para_vencer) === 'por_vencer'
                    ? 'text-xs text-warning-text'
                    : 'text-xs text-fg-muted'
              }
            >
              {textoVence(l)}
            </span>
          </div>
        ) : (
          <span className="text-fg-muted">{t('lotes.sinVencimiento')}</span>
        ),
    },
    {
      id: 'proveedor',
      encabezado: t('lotes.columnas.proveedor'),
      ocultarDebajo: 'xl',
      celda: (l) => l.proveedor ?? <span className="text-fg-muted">{tc('sinDatos')}</span>,
    },
    {
      id: 'creado',
      encabezado: t('lotes.columnas.creado'),
      ocultarDebajo: 'xl',
      celda: (l) => (
        <span className="whitespace-nowrap text-fg-secondary">
          {formatDateInTz(l.creado, fechas.timezone, { locale: localeIntl, day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    { id: 'estado', encabezado: t('lotes.columnas.estado'), celda: badgeEstado },
  ];

  const estado: EstadoTabla = cargando && !lotes ? 'cargando' : error && !lotes ? 'error' : 'listo';
  const hayLotes = (lotes ?? []).length > 0;

  return (
    <section aria-labelledby="lotes-producto" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="lotes-producto" className="text-base font-semibold text-fg">
            {t('lotes.titulo')}
          </h3>
          <p className="text-sm text-fg-secondary">
            {estado === 'listo' && hayLotes
              ? t('lotes.resumen', { count: conExistencia.length, unidades: cantidad(unidades), sucursales: sucursalesConLotes })
              : t('lotes.descripcion')}
          </p>
        </div>
        <Link
          href="/app/inventario/lotes"
          className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('lotes.verTodos')}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Link>
      </div>

      {estado === 'listo' && unidadesVencidas > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('lotes.alertaVencidos', { unidades: cantidad(unidadesVencidas), count: vencidos.length })}
        </p>
      )}
      {estado === 'listo' && unidadesPorVencer > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('lotes.alertaPorVencer', { unidades: cantidad(unidadesPorVencer), count: diasMinimos })}
        </p>
      )}

      {hayLotes && (
        <SegmentedControl
          etiqueta={t('lotes.filtroEtiqueta')}
          tamano="sm"
          className="self-start"
          valor={filtro}
          onValorChange={setFiltro}
          opciones={[
            { valor: 'con_existencia', etiqueta: t('lotes.filtro.conExistencia'), contador: conExistencia.length },
            { valor: 'todos', etiqueta: t('lotes.filtro.todos'), contador: conCifras.length },
          ]}
        />
      )}

      <DataTable
        etiqueta={t('lotes.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(l) => String(l.lot_id)}
        etiquetaFila={(l) => l.lot_code}
        estado={estado}
        filasEsqueleto={3}
        onReintentar={() => void cargar()}
        error={{ titulo: t('lotes.error'), descripcion: error ?? tc('errorCargar') }}
        vacio={
          hayLotes
            ? {
                icono: Layers,
                titulo: t('lotes.vacioFiltro.titulo'),
                descripcion: t('lotes.vacioFiltro.descripcion'),
                accion: { etiqueta: t('lotes.filtro.todos'), onClick: () => setFiltro('todos') },
              }
            : {
                icono: Layers,
                titulo: t('lotes.vacio.titulo'),
                descripcion: t('lotes.vacio.descripcion'),
                accion: { etiqueta: t('lotes.vacio.accion'), href: '/app/inventario/lotes' },
              }
        }
        tarjetaMovil={(l) => (
          <ListCard
            icono={Layers}
            titulo={l.lot_code}
            subtitulo={conVariantes ? l.producto_nombre : undefined}
            datos={[
              {
                icono: CalendarClock,
                etiqueta: t('lotes.columnas.vence'),
                texto: l.expiry_date ? `${formatPlainDate(l.expiry_date)} · ${textoVence(l) ?? ''}` : t('lotes.sinVencimiento'),
              },
              { icono: Warehouse, etiqueta: t('lotes.columnas.sucursales'), texto: desgloseTexto(l) },
              l.proveedor ? { icono: Truck, etiqueta: t('lotes.columnas.proveedor'), texto: l.proveedor } : null,
            ]}
            valor={tc('unidadesCortas', { n: cantidad(l.existencia) })}
            estado={badgeEstado(l)}
          />
        )}
      />

      {estado === 'listo' && hayLotes && (
        <div className="flex flex-wrap items-center gap-2">
          <BotonInventario tamano="sm" etiqueta={t('lotes.verKardex')} icono={History} onClick={() => irA('inventario', 'kardex')} />
        </div>
      )}
    </section>
  );
}
