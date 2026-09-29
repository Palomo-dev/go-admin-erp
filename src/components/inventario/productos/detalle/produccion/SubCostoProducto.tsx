'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calculator, Download, Lock, Plus, RefreshCw } from 'lucide-react';
import { EmptyState, KpiStrip, StatCard, StatusBadge, Tarjeta, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { filasACsv } from '@/lib/utils/csv';
import { recipeService, type CostoReceta, type LineaCostoReceta, type VersionReceta } from '@/lib/services/recipeService';
import type { ResumenProduccionProducto } from '@/lib/services/productionOrderService';
import { margenReceta } from '@/components/kit/receta';
import { useFormatoCantidad, useFormatoPorcentaje } from '../../../produccion/piezas';
import { cargarProductoReceta } from '../../../recetas/datosEditor';
import { rutaCostoRecetas } from '../../../recetas/piezas';
import type { ProductoPestanaProduccion } from './PestanaProduccion';

/**
 * Producción › Costo (Figma D3 968:177163): costo de la receta por sucursal y
 * versión con `fn_receta_costo` (la misma función del formulario, del reporte y
 * de la venta). Fuente por ingrediente: promedio de la sucursal → costo vigente
 * → sin costo. Sin el permiso «Ver costos» se ven solo cantidades.
 */
export function SubCostoProducto({ producto, resumen }: { producto: ProductoPestanaProduccion; resumen: ResumenProduccionProducto }) {
  const t = useTranslations('subseccion.costo');
  const tr = useTranslations('inventarioRecetas');
  const router = useRouter();
  const cantidad = useFormatoCantidad();
  const porcentaje = useFormatoPorcentaje();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const { branchFilter, branches } = useBranch();
  const [sucursal, setSucursal] = useState<number | null>(branchFilter ?? branches[0]?.id ?? null);
  const [versiones, setVersiones] = useState<VersionReceta[] | null>(null);
  const [recetaId, setRecetaId] = useState<number | null>(resumen.receta_efectiva?.recipe_id ?? null);
  const [costo, setCosto] = useState<CostoReceta | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [recarga, setRecarga] = useState(0);

  const duenoReceta = resumen.receta_efectiva?.product_id ?? producto.id;

  useEffect(() => {
    recipeService.versiones(getOrganizationId(), duenoReceta, sucursal).then(setVersiones).catch(() => setVersiones([]));
  }, [duenoReceta, sucursal, recarga]);

  useEffect(() => {
    cargarProductoReceta(getOrganizationId(), producto.id).then((p) => setPrecio(p?.precio ?? null)).catch(() => setPrecio(null));
  }, [producto.id]);

  useEffect(() => {
    if (!recetaId) {
      setEstado('listo');
      return;
    }
    let vivo = true;
    setEstado('cargando');
    recipeService
      .costo(getOrganizationId(), sucursal, { recipe_id: recetaId })
      .then((c) => {
        if (!vivo) return;
        setCosto(c);
        setEstado('listo');
      })
      .catch(() => vivo && setEstado('error'));
    return () => {
      vivo = false;
    };
  }, [recetaId, sucursal, recarga]);

  const permitido = costo?.permitido !== false;
  const version = versiones?.find((v) => v.recipe_id === recetaId) ?? null;
  const anterior = versiones && version ? versiones.find((v) => v.version === version.version - 1) ?? null : null;
  const margen = permitido ? margenReceta(costo?.costo_unidad, precio) : null;
  const sinCosto = costo?.lineas.find((l) => !l.opcional && l.costo_unitario === null && !l.error) ?? null;

  const exportar = () => {
    if (!costo) return;
    const csv = filasACsv(
      [t('col.ingrediente'), t('col.neto'), t('col.bruto'), t('col.unidad'), t('col.costoUnitario'), t('col.fuente'), t('col.linea')],
      costo.lineas.map((l) => [l.nombre, l.cantidad_neta, l.cantidad_bruta, l.unidad_receta, l.costo_unitario, tr(`fuentes.${l.fuente}`), l.costo_linea]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `costo_receta_${producto.sku ?? producto.id}_${getToday()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columnas = useMemo<ColumnaTabla<LineaCostoReceta>[]>(
    () => [
      {
        id: 'ingrediente',
        encabezado: t('col.ingrediente'),
        celda: (l) => (
          <div className="flex min-w-0 flex-col">
            <Link href={`/app/inventario/productos/${l.ingredient_product_id}`} className="truncate text-brand hover:underline">
              {l.nombre ?? `#${l.ingredient_product_id}`}
            </Link>
            <span className="truncate text-xs text-fg-secondary">
              {[l.sku, l.unidad_receta !== l.unidad_ingrediente && l.factor ? `${cantidad(l.cantidad_bruta, l.unidad_receta)} = ${cantidad(l.cantidad, l.unidad_ingrediente)}` : null, l.merma_pct > 0 ? t('merma', { pct: l.merma_pct }) : null, !l.track_stock ? t('sinInventario') : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ),
      },
      { id: 'neto', encabezado: t('col.netoBruto'), celda: (l) => `${cantidad(l.cantidad_neta)} → ${cantidad(l.cantidad_bruta, l.unidad_receta)}` },
      {
        id: 'unitario',
        encabezado: t('col.costoUnitario'),
        variante: 'importe',
        ocultarDebajo: 'md',
        celda: (l) => (l.costo_unitario !== null ? `${moneda(l.costo_unitario)} / ${l.unidad_ingrediente}` : '—'),
      },
      { id: 'fuente', encabezado: t('col.fuente'), ocultarDebajo: 'lg', celda: (l) => <span className="text-fg">{tr(`fuentes.${l.error === 'conversion_faltante' ? 'sin_conversion' : l.fuente}`)}</span> },
      { id: 'linea', encabezado: t('col.linea'), variante: 'importe', celda: (l) => (l.costo_linea !== null ? moneda(l.costo_linea) : '—') },
      {
        id: 'estado',
        encabezado: t('col.estado'),
        celda: (l) =>
          l.error === 'conversion_faltante' ? (
            <StatusBadge estado="error" tono="peligro" etiqueta={t('sinConversion')} />
          ) : l.opcional ? (
            <StatusBadge estado="opcional" tono="neutro" etiqueta={t('opcional')} />
          ) : l.fuente === 'sin_costo' ? (
            <StatusBadge estado="sin costo" tono="advertencia" etiqueta={t('sinCosto')} />
          ) : l.fuente === 'costo_vigente' ? (
            <StatusBadge estado="respaldo" tono="advertencia" apariencia="contorno" etiqueta={t('respaldo')} />
          ) : (
            <StatusBadge estado="con costo" tono="exito" apariencia="contorno" etiqueta={t('conCosto')} />
          ),
      },
    ],
    [cantidad, moneda, t, tr],
  );

  if (!resumen.receta_efectiva && (versiones?.length ?? 0) === 0) {
    return <EmptyState icono={Calculator} titulo={t('sinRecetaTitulo')} descripcion={t('sinRecetaDescripcion')} />;
  }

  const maxVersion = Math.max(1, ...(versiones ?? []).map((v) => v.costo_unidad ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <TablaSubseccion
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        accionNueva={
          permitido && sinCosto
            ? { etiqueta: t('registrarFaltante'), icono: Plus, onClick: () => router.push(`/app/inventario/productos/${sinCosto.ingredient_product_id}?tab=precios`) }
            : undefined
        }
        opciones={[
          { id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: exportar, deshabilitada: !costo, motivo: !costo ? t('sinDatos') : undefined },
          { id: 'reporte', etiqueta: t('irReporte'), icono: Calculator, onSelect: () => router.push(`${rutaCostoRecetas()}?busqueda=${encodeURIComponent(producto.name)}`) },
          { id: 'recalcular', etiqueta: t('recalcular'), icono: RefreshCw, onSelect: () => setRecarga((n) => n + 1) },
        ]}
        encabezadoExtra={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sucursal ? String(sucursal) : undefined} onValueChange={(v) => setSucursal(Number(v))}>
                <SelectTrigger aria-label={t('sucursal')} className="h-10 w-auto min-w-48 border-brand bg-brand-tint text-brand-deep">
                  <SelectValue placeholder={t('sucursal')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={recetaId ? String(recetaId) : undefined} onValueChange={(v) => setRecetaId(Number(v))}>
                <SelectTrigger aria-label={t('version')} className="h-10 w-auto min-w-56">
                  <SelectValue placeholder={t('version')} />
                </SelectTrigger>
                <SelectContent>
                  {(versiones ?? []).map((v) => (
                    <SelectItem key={v.recipe_id} value={String(v.recipe_id)}>
                      {v.activa ? t('versionActiva', { version: v.version }) : t('versionN', { version: v.version })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <KpiStrip etiqueta={t('kpis')}>
              <StatCard etiqueta={t('tanda')} cargando={estado === 'cargando'} valor={permitido && costo?.costo_tanda !== null && costo ? moneda(costo.costo_tanda ?? 0) : '—'} detalle={costo ? t('rinde', { rinde: cantidad(costo.rinde, costo.unidad_rinde ?? resumen.producto.unidad) }) : undefined} />
              <StatCard
                etiqueta={t('unidad')}
                cargando={estado === 'cargando'}
                valor={permitido && costo?.costo_unidad !== null && costo ? moneda(costo.costo_unidad ?? 0) : '—'}
                tono={anterior?.costo_unidad && costo?.costo_unidad && costo.costo_unidad > anterior.costo_unidad ? 'advertencia' : 'neutro'}
                detalle={
                  anterior?.costo_unidad && costo?.costo_unidad && permitido
                    ? t('vsAnterior', { version: anterior.version, costo: moneda(anterior.costo_unidad), cambio: porcentaje((costo.costo_unidad - anterior.costo_unidad) / anterior.costo_unidad) })
                    : undefined
                }
              />
              <StatCard etiqueta={t('precio')} valor={precio !== null ? moneda(precio) : '—'} detalle={precio === null ? t('sinPrecio') : undefined} />
              <StatCard etiqueta={t('margen')} valor={porcentaje(margen)} tono={margen !== null && margen < 0.3 ? 'advertencia' : 'neutro'} />
            </KpiStrip>
          </>
        }
        columnas={columnas}
        filas={costo?.lineas ?? []}
        obtenerId={(l) => String(l.orden)}
        estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : 'listo'}
        densidad="compacta"
        vacio={{ titulo: t('sinIngredientes'), icono: Calculator }}
        onReintentar={() => setRecarga((n) => n + 1)}
      />

      {permitido && versiones && versiones.some((v) => v.costo_unidad !== null) && (
        <Tarjeta titulo={t('porVersion')}>
          <ul className="flex flex-col gap-2">
            {[...versiones].reverse().map((v) => (
              <li key={v.recipe_id} className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                <span className="text-fg-secondary">
                  v{v.version} · {v.creada_en ? formatDate(v.creada_en) : '—'}
                  {v.activa ? ` (${t('activa')})` : ''}
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <span className={v.activa ? 'block h-full rounded-full bg-brand' : 'block h-full rounded-full bg-brand/40'} style={{ width: `${Math.round(((v.costo_unidad ?? 0) / maxVersion) * 100)}%` }} />
                </span>
                <span className="tabular-nums text-fg">{v.costo_unidad !== null ? moneda(v.costo_unidad) : '—'}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {!permitido && (
        <p className="flex items-center gap-2 rounded-xl bg-subtle px-4 py-3 text-[13px] text-fg-secondary">
          <Lock aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          {t('sinPermiso')}
        </p>
      )}
    </div>
  );
}
