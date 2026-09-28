'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowLeftRight, ArrowUp, Shapes } from 'lucide-react';
import { AccionRapida, DataTable, ListCard, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';
import { TONO_ESTADO_STOCK, estadoStockSucursal } from '../../../logica/stock';
import { useProductoDetalle } from '../../ContextoProducto';
import type { VarianteDeProducto } from '../../tipos';
import {
  agregarStockLevels,
  claveVarianteSucursal,
  rutaAjuste,
  rutaTransferencia,
  type FilaStockLevel,
  type StockVarianteSucursal,
} from './logicaInventario';
import { useCantidad } from './useFormatoInventario';

interface FilaDesglose extends StockVarianteSucursal {
  clave: string;
  variante: VarianteDeProducto;
  sucursal: string;
}

/**
 * Producto padre: el stock vive en las variantes. Desglose variante ×
 * sucursal (lee `stock_levels` de las variantes no eliminadas; RLS limita a
 * las sucursales de la organización), con entrada, salida y transferencia de
 * esa variante en esa sucursal.
 */
export function DesgloseVariantes({
  variantes,
  motivoAjuste,
}: {
  variantes: readonly VarianteDeProducto[];
  motivoAjuste?: string;
}) {
  const t = useTranslations('productoDetalle.inventario');
  const tc = useTranslations('productoDetalle.comun');
  const { resumen, sucursalActiva, mensajeError } = useProductoDetalle();
  const cantidad = useCantidad();
  const [niveles, setNiveles] = useState<Map<string, StockVarianteSucursal> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const ids = useMemo(() => variantes.map((v) => v.id), [variantes]);
  const clavesIds = ids.join(',');

  const cargar = useCallback(async () => {
    if (ids.length === 0) return;
    setCargando(true);
    const { data, error: e } = await supabase
      .from('stock_levels')
      .select('product_id, branch_id, qty_on_hand, qty_reserved, min_level, avg_cost, updated_at')
      .in('product_id', ids);
    if (e) {
      setError(mensajeError(e));
    } else {
      setNiveles(agregarStockLevels((data ?? []) as FilaStockLevel[]));
      setError(null);
    }
    setCargando(false);
    // `clavesIds` resume `ids`: no se recarga por una lista nueva con los mismos ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavesIds, mensajeError]);

  // Se relee cuando cambia el resumen (tras un ajuste, `recargarResumen()`).
  useEffect(() => {
    void cargar();
  }, [cargar, resumen]);

  const sucursales = useMemo(
    () => (resumen?.sucursales ?? []).filter((s) => sucursalActiva === null || s.branch_id === sucursalActiva),
    [resumen, sucursalActiva],
  );

  const filas = useMemo<FilaDesglose[]>(() => {
    if (!niveles) return [];
    const salida: FilaDesglose[] = [];
    for (const v of variantes) {
      for (const s of sucursales) {
        const clave = claveVarianteSucursal(v.id, s.branch_id);
        const nivel = niveles.get(clave);
        // Sucursal inactiva sin registro de la variante: no aporta nada.
        if (!nivel && !s.activa) continue;
        salida.push({
          clave,
          variante: v,
          sucursal: s.nombre,
          ...(nivel ?? {
            product_id: v.id,
            branch_id: s.branch_id,
            qty_on_hand: 0,
            qty_reserved: 0,
            disponible: 0,
            min_level: 0,
            avg_cost: 0,
            actualizado: null,
            con_registro: false,
          }),
        });
      }
    }
    return salida;
  }, [niveles, variantes, sucursales]);

  const totalSucursales = resumen?.sucursales.length ?? 0;
  const bloqueado = !!motivoAjuste;
  const motivoTransferir = motivoAjuste ?? (totalSucursales < 2 ? t('motivos.unaSucursal') : undefined);

  const atributos = (v: VarianteDeProducto) =>
    Object.values(v.variant_data ?? {})
      .filter((x) => x && String(x).trim())
      .join(' · ');

  const estadoBadge = (f: FilaDesglose) => {
    const estado = estadoStockSucursal(f);
    return (
      <Badge tono={TONO_ESTADO_STOCK[estado]} tamano="sm" punto>
        {t(`estadosStock.${estado}`)}
      </Badge>
    );
  };

  const acciones = (f: FilaDesglose, soloIcono: boolean) => (
    <>
      <AccionRapida
        etiqueta={soloIcono ? t('desglose.entradaDe', { variante: f.variante.name, sucursal: f.sucursal }) : t('stock.entrada')}
        icono={ArrowUp}
        soloIcono={soloIcono}
        href={rutaAjuste(f.product_id, 'entrada', f.branch_id)}
        deshabilitada={bloqueado}
        motivo={motivoAjuste}
      />
      <AccionRapida
        etiqueta={soloIcono ? t('desglose.salidaDe', { variante: f.variante.name, sucursal: f.sucursal }) : t('stock.salida')}
        icono={ArrowDown}
        soloIcono={soloIcono}
        href={rutaAjuste(f.product_id, 'salida', f.branch_id)}
        deshabilitada={bloqueado}
        motivo={motivoAjuste}
      />
      <AccionRapida
        etiqueta={soloIcono ? t('desglose.transferirDe', { variante: f.variante.name, sucursal: f.sucursal }) : t('stock.transferir')}
        icono={ArrowLeftRight}
        soloIcono={soloIcono}
        href={rutaTransferencia(f.product_id, f.branch_id)}
        deshabilitada={!!motivoTransferir}
        motivo={motivoTransferir}
      />
    </>
  );

  const columnas: ColumnaTabla<FilaDesglose>[] = [
    {
      id: 'variante',
      encabezado: t('desglose.columnas.variante'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.variante.name}</span>
          <span className="truncate text-xs text-fg-secondary">
            <span className="font-mono">{f.variante.sku}</span>
            {atributos(f.variante) && <> · {atributos(f.variante)}</>}
          </span>
        </div>
      ),
    },
    { id: 'sucursal', encabezado: tc('sucursal'), celda: (f) => f.sucursal },
    { id: 'existencia', encabezado: t('stock.columnas.existencia'), variante: 'importe', celda: (f) => cantidad(f.qty_on_hand) },
    { id: 'reservado', encabezado: t('stock.columnas.reservado'), variante: 'importe', celda: (f) => cantidad(f.qty_reserved) },
    {
      id: 'disponible',
      encabezado: t('stock.columnas.disponible'),
      variante: 'importe',
      celda: (f) => {
        const estado = estadoStockSucursal(f);
        return (
          <span className={cn('font-semibold', estado === 'agotado' && 'text-danger-text', estado === 'bajo_minimo' && 'text-warning-text')}>
            {cantidad(f.disponible)}
          </span>
        );
      },
    },
    {
      id: 'minimo',
      encabezado: t('stock.columnas.minimo'),
      variante: 'importe',
      celda: (f) => (f.min_level > 0 ? cantidad(f.min_level) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
    },
    { id: 'estado', encabezado: t('stock.columnas.estado'), celda: estadoBadge },
  ];

  const estado: EstadoTabla = cargando && !niveles ? 'cargando' : error && !niveles ? 'error' : 'listo';

  return (
    <section aria-labelledby="desglose-variantes" className="flex flex-col gap-3">
      <div>
        <h3 id="desglose-variantes" className="text-base font-semibold text-fg">
          {t('desglose.titulo')}
        </h3>
        <p className="text-sm text-fg-secondary">{t('desglose.descripcion', { count: variantes.length })}</p>
      </div>
      <DataTable
        etiqueta={t('desglose.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.clave}
        etiquetaFila={(f) => `${f.variante.name} · ${f.sucursal}`}
        estado={estado}
        densidad="compacta"
        filasEsqueleto={4}
        onReintentar={() => void cargar()}
        error={{ titulo: t('desglose.error'), descripcion: error ?? tc('errorCargar') }}
        vacio={{ icono: Shapes, titulo: t('desglose.vacio'), descripcion: t('desglose.vacioDescripcion') }}
        accionesRapidas={(f) => acciones(f, true)}
        tarjetaMovil={(f) => (
          <ListCard
            icono={Shapes}
            titulo={f.variante.name}
            subtitulo={t('stock.movil.cifras', {
              existencia: cantidad(f.qty_on_hand),
              reservado: cantidad(f.qty_reserved),
              disponible: cantidad(f.disponible),
            })}
            meta={`${f.variante.sku} · ${f.sucursal}`}
            estado={estadoBadge(f)}
            etiquetas={acciones(f, false)}
          />
        )}
      />
    </section>
  );
}
