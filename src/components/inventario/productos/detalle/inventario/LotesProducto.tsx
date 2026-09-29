'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarClock, History, Layers, PackageMinus, Pencil, Plus, SlidersHorizontal, TriangleAlert, Truck, Warehouse } from 'lucide-react';
import { DataTable, ListCard, SegmentedControl, type AccionFila, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { BadgeVencimiento } from '@/components/kit/inventario';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { listarStock, type StockFila } from '@/lib/services/stockService';
import { DialogoAjustarLote, DialogoLote } from '../../../lotes/DialogosLote';
import { listarLotes } from '../../../lotes/LotesService';
import type { LoteFila } from '../../../lotes/types';
import { useProductoDetalle } from '../ContextoProducto';
import { BotonInventario } from './stock/BotonInventario';
import { rutaKardexCompleto, rutaKardexLote, rutaLotesProducto } from './stock/logicaInventario';
import { useCantidad } from './stock/useFormatoInventario';

type FiltroLotes = 'con_existencia' | 'todos';
type Dialogo = { tipo: 'nuevo' } | { tipo: 'editar' | 'ajustar' | 'baja'; fila: LoteFila } | null;

/**
 * Inventario › Lotes del producto (Figma 525:65157, móvil 525:65947): una fila
 * por lote y sucursal (`fn_lotes_listado` con el producto y sus variantes), con
 * cantidad, vencimiento en el día de la organización, costo, proveedor y estado.
 * Aviso de lo que vence pronto (el POS vende primero el vencimiento más próximo,
 * FEFO) y de lo vencido. Nuevo lote, editar, ajustar cantidad y dar de baja por
 * merma con los mismos diálogos de la pantalla de Lotes.
 */
export function LotesProducto() {
  const router = useRouter();
  const t = useTranslations('productoDetalle.inventario');
  const tc = useTranslations('productoDetalle.comun');
  const tl = useTranslations('inventarioLotes');
  const { producto, organizacionId, sucursalActiva, fechas, moneda, mensajeError, recargarResumen } = useProductoDetalle();
  const permisos = usePermisosInventario();
  const cantidad = useCantidad(producto);
  const [filasTodas, setFilasTodas] = useState<LoteFila[] | null>(null);
  const [hoy, setHoy] = useState(fechas.getToday());
  const [verCostos, setVerCostos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<FiltroLotes>('con_existencia');
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [filaProducto, setFilaProducto] = useState<StockFila | null>(null);

  const conVariantes = (producto.children ?? []).some((v) => v.status !== 'deleted');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await listarLotes(organizacionId, { producto: producto.id, sucursales: sucursalActiva ? [sucursalActiva] : undefined }, 0, 500);
      setFilasTodas(r.filas);
      setHoy(r.hoy || fechas.getToday());
      setVerCostos(r.costos);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [organizacionId, producto.id, sucursalActiva, mensajeError, fechas]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Producto sin variantes: el diálogo «Nuevo lote» ya lo trae elegido.
  useEffect(() => {
    if (conVariantes) return;
    let vivo = true;
    listarStock(organizacionId, { producto: producto.id, agrupar: false }, 0, 5)
      .then((r) => vivo && setFilaProducto(r.filas.find((f) => f.product_id === producto.id) ?? null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [organizacionId, producto.id, conVariantes]);

  const alGuardar = () => {
    void cargar();
    void recargarResumen();
  };

  const todas = useMemo(() => filasTodas ?? [], [filasTodas]);
  const conExistencia = todas.filter((l) => l.qty_on_hand > 0);
  const filas = filtro === 'todos' ? todas : conExistencia;
  const unidades = conExistencia.reduce((n, l) => n + l.qty_on_hand, 0);
  const sucursalesConLotes = new Set(conExistencia.map((l) => l.branch_id)).size;
  const porVencer = conExistencia.filter((l) => l.estado === 'por_vencer');
  const vencidos = conExistencia.filter((l) => l.estado === 'vencido');
  const unidadesPorVencer = porVencer.reduce((n, l) => n + l.qty_on_hand, 0);
  const diasMinimos = porVencer.reduce((m, l) => Math.min(m, l.dias ?? m), Number.POSITIVE_INFINITY);
  const unidadesVencidas = vencidos.reduce((n, l) => n + l.qty_on_hand, 0);

  const textoVence = (l: LoteFila) => {
    if (l.dias === null) return null;
    if (l.dias < 0) return t('lotes.vencioHace', { count: -l.dias });
    if (l.dias === 0) return t('lotes.venceHoy');
    return t('lotes.venceEn', { count: l.dias });
  };

  const puedeCrear = permisos.crear || permisos.editar_catalogo;
  const acciones = (l: LoteFila): AccionFila[] => [
    { id: 'movimientos', etiqueta: tl('acciones.movimientos'), icono: History, onSelect: () => router.push(rutaKardexLote(l.product_id, l.lot_id)) },
    { id: 'editar', etiqueta: tl('acciones.editar'), icono: Pencil, oculta: !puedeCrear, onSelect: () => setDialogo({ tipo: 'editar', fila: l }) },
    { id: 'ajustar', etiqueta: tl('acciones.ajustar'), icono: SlidersHorizontal, oculta: !permisos.ajustar, onSelect: () => setDialogo({ tipo: 'ajustar', fila: l }) },
    {
      id: 'baja',
      etiqueta: tl('acciones.baja'),
      icono: PackageMinus,
      oculta: !permisos.ajustar,
      deshabilitada: l.qty_on_hand <= 0,
      motivo: tl('acciones.sinExistencias'),
      onSelect: () => setDialogo({ tipo: 'baja', fila: l }),
    },
  ];

  const columnas: ColumnaTabla<LoteFila>[] = [
    { id: 'lote', encabezado: t('lotes.columnas.lote'), variante: 'mono', celda: (l) => <span className="font-medium text-fg">{l.lot_code}</span> },
    ...(conVariantes
      ? [{ id: 'variante', encabezado: t('lotes.columnas.variante'), celda: (l: LoteFila) => <span className="text-fg-secondary">{l.atributos ?? l.nombre}</span> } satisfies ColumnaTabla<LoteFila>]
      : []),
    { id: 'sucursal', encabezado: tc('sucursal'), celda: (l) => <span className="text-fg">{l.sucursal ?? tc('sinDatos')}</span> },
    { id: 'existencia', encabezado: t('lotes.columnas.existencia'), variante: 'importe', celda: (l) => <span className="font-semibold">{cantidad(l.qty_on_hand)}</span> },
    {
      id: 'vence',
      encabezado: t('lotes.columnas.vence'),
      celda: (l) =>
        l.expiry_date ? (
          <div className="flex flex-col">
            <span className="tabular-nums text-fg">{fechas.formatPlain(l.expiry_date)}</span>
            <span className={l.estado === 'vencido' ? 'text-xs text-danger-text' : l.estado === 'por_vencer' ? 'text-xs text-warning-text' : 'text-xs text-fg-muted'}>{textoVence(l)}</span>
          </div>
        ) : (
          <span className="text-fg-muted">{t('lotes.sinVencimiento')}</span>
        ),
    },
    ...(verCostos
      ? [
          {
            id: 'costo',
            encabezado: tl('dialogo.costo'),
            variante: 'importe',
            ocultarDebajo: 'lg',
            celda: (l: LoteFila) => (l.costo_promedio ? moneda.formatear(l.costo_promedio) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
          } satisfies ColumnaTabla<LoteFila>,
        ]
      : []),
    { id: 'proveedor', encabezado: t('lotes.columnas.proveedor'), ocultarDebajo: 'xl', celda: (l) => l.proveedor ?? <span className="text-fg-muted">{tc('sinDatos')}</span> },
    { id: 'estado', encabezado: t('lotes.columnas.estado'), celda: (l) => <BadgeVencimiento expiry={l.expiry_date} hoy={hoy} /> },
  ];

  const estado: EstadoTabla = cargando && !filasTodas ? 'cargando' : error && !filasTodas ? 'error' : 'listo';
  const hayLotes = todas.length > 0;

  return (
    <section aria-labelledby="lotes-producto" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="lotes-producto" className="text-base font-semibold text-fg">
            {t('lotes.titulo')}
          </h3>
          <p className="text-sm text-fg-secondary">
            {estado === 'listo' && hayLotes
              ? t('lotes.resumen', { count: new Set(conExistencia.map((l) => l.lot_id)).size, unidades: cantidad(unidades), sucursales: sucursalesConLotes })
              : t('lotes.descripcion')}
          </p>
        </div>
        <Link
          href={rutaLotesProducto(producto.id)}
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
            { valor: 'todos', etiqueta: t('lotes.filtro.todos'), contador: todas.length },
          ]}
        />
      )}

      <DataTable
        etiqueta={t('lotes.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(l) => `${l.lot_id}:${l.branch_id ?? ''}`}
        etiquetaFila={(l) => l.lot_code}
        estado={estado}
        filasEsqueleto={3}
        acciones={acciones}
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
                accion: puedeCrear ? { etiqueta: tl('nuevo'), onClick: () => setDialogo({ tipo: 'nuevo' }), icono: Plus } : { etiqueta: t('lotes.vacio.accion'), href: '/app/inventario/lotes' },
              }
        }
        tarjetaMovil={(l) => (
          <ListCard
            icono={Layers}
            titulo={l.lot_code}
            insignia={<BadgeVencimiento expiry={l.expiry_date} hoy={hoy} />}
            subtitulo={conVariantes ? l.atributos ?? l.nombre : undefined}
            datos={[
              { icono: Warehouse, etiqueta: tc('sucursal'), texto: `${l.sucursal ?? tc('sinDatos')} · ${cantidad(l.qty_on_hand)}` },
              l.expiry_date ? { icono: CalendarClock, etiqueta: t('lotes.columnas.vence'), texto: `${fechas.formatPlain(l.expiry_date)} · ${textoVence(l) ?? ''}` } : null,
              l.proveedor ? { icono: Truck, etiqueta: t('lotes.columnas.proveedor'), texto: l.proveedor } : null,
            ]}
            acciones={acciones(l)}
          />
        )}
      />

      <div className="flex flex-wrap gap-2">
        {puedeCrear && <BotonInventario etiqueta={tl('nuevo')} icono={Plus} onClick={() => setDialogo({ tipo: 'nuevo' })} />}
        <BotonInventario etiqueta={t('lotes.verKardex')} icono={History} onClick={() => router.push(rutaKardexCompleto(producto.id))} />
      </div>

      <DialogoLote
        abierto={dialogo?.tipo === 'nuevo' || dialogo?.tipo === 'editar'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        organizacionId={organizacionId}
        lote={dialogo?.tipo === 'editar' ? dialogo.fila : null}
        producto={filaProducto}
        verCostos={verCostos}
        puedeAjustar={permisos.ajustar}
        onGuardado={alGuardar}
      />
      <DialogoAjustarLote
        abierto={dialogo?.tipo === 'ajustar' || dialogo?.tipo === 'baja'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        organizacionId={organizacionId}
        lote={dialogo && dialogo.tipo !== 'nuevo' ? dialogo.fila : null}
        filasDelLote={dialogo && dialogo.tipo !== 'nuevo' ? todas.filter((f) => f.lot_id === dialogo.fila.lot_id) : []}
        darDeBaja={dialogo?.tipo === 'baja'}
        onGuardado={alGuardar}
      />
    </section>
  );
}
