'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, ChefHat, Download, Factory, History, Layers, Pencil, Plus } from 'lucide-react';
import { EmptyState, RelatedLinkCard, StatusBadge, Tarjeta, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { lineaDeFila, ResumenCostoReceta, useCostoReceta, type IngredienteBorrador } from '@/components/kit/receta';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { puede } from '@/lib/inventario/permisos';
import { filasACsv } from '@/lib/utils/csv';
import type { FilaReceta } from '@/lib/services/recipeService';
import type { ResumenProduccionProducto } from '@/lib/services/productionOrderService';
import { useFormatoCantidad } from '../../../produccion/piezas';
import { cargarEditorReceta, type DatosEditorReceta } from '../../../recetas/datosEditor';
import { BadgeModoReceta, rutaEditarReceta } from '../../../recetas/piezas';
import { useAccionesReceta } from '../../../recetas/useAccionesReceta';
import type { ProductoPestanaProduccion, SubProduccion } from './PestanaProduccion';

/**
 * Producción › Receta (Figma D1 968:175070): la versión activa en solo lectura
 * con su costo en la sucursal del encabezado (el mismo de la venta), «Receta
 * de:» por variante, «Cómo se conecta» y el menú (versiones, crear orden,
 * exportar, desactivar). «Editar receta» abre el MISMO editor del formulario
 * (pantalla Recetas); guardar crea la versión N+1.
 */
export function SubRecetaProducto({
  producto,
  resumen,
  puedeEditar,
  onCambio,
  irA,
}: {
  producto: ProductoPestanaProduccion;
  resumen: ResumenProduccionProducto;
  puedeEditar: boolean;
  onCambio: () => void;
  irA: (s: SubProduccion) => void;
}) {
  const t = useTranslations('subseccion.receta');
  const tr = useTranslations('inventarioRecetas');
  const router = useRouter();
  const cantidad = useFormatoCantidad();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const { branchFilter, branches } = useBranch();
  const [datos, setDatos] = useState<DatosEditorReceta | null>(null);
  const [error, setError] = useState(false);

  const sucursalId = branchFilter ?? branches[0]?.id ?? null;
  const sucursalNombre = branches.find((b) => b.id === sucursalId)?.name ?? null;
  const propia = resumen.receta_propia;
  const heredada = resumen.receta_efectiva?.heredada ? resumen.receta_efectiva : null;

  useEffect(() => {
    let vivo = true;
    setError(false);
    cargarEditorReceta(getOrganizationId(), producto.id)
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [producto.id, resumen]);

  const borrador = propia ? datos?.activa ?? null : null;
  const { costo, cargando, error: errorCosto } = useCostoReceta(getOrganizationId(), sucursalId, borrador);

  // Fila «como la del listado» para reutilizar las acciones de receta (versiones, desactivar, producir).
  const fila: FilaReceta | null =
    propia && datos
      ? {
          recipe_id: propia.recipe_id,
          product_id: producto.id,
          nombre: propia.nombre,
          version: propia.version,
          activa: true,
          rinde: borrador?.rinde ?? 1,
          unidad_rinde: borrador?.unidadRinde ?? resumen.producto.unidad,
          creada_en: propia.creada_en,
          producto: {
            id: producto.id,
            nombre: producto.name,
            sku: producto.sku ?? null,
            unidad: resumen.producto.unidad,
            variante: resumen.producto.parent_product_id !== null,
            decimales: resumen.producto.decimales,
            track_stock: resumen.producto.track_stock,
          },
          modo: resumen.producto.modo,
          ingredientes: borrador?.ingredientes.length ?? 0,
          costo_tanda: costo?.costo_tanda ?? null,
          costo_unidad: costo?.costo_unidad ?? null,
          completo: costo?.completo ?? false,
          lineas_sin_costo: costo?.lineas_sin_costo ?? 0,
          lineas_con_error: costo?.lineas_con_error ?? 0,
          fuente: 'promedio_sucursal',
          precio: datos.producto.precio,
          margen: null,
          ordenes_abiertas: resumen.ordenes_abiertas,
        }
      : null;
  const acciones = useAccionesReceta({ permisos: resumen.permisos, onCambio });

  const exportar = () => {
    if (!borrador) return;
    const csv = filasACsv(
      [t('csv.ingrediente'), t('csv.sku'), t('csv.cantidad'), t('csv.unidad'), t('csv.merma'), t('csv.opcional'), t('csv.costo')],
      borrador.ingredientes.map((i, n) => [i.nombre, i.sku, i.cantidad, i.unidad, i.mermaPct, i.opcional ? 1 : 0, lineaDeFila(costo?.lineas, n)?.costo_linea ?? null]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `receta_${producto.sku ?? producto.id}_v${propia?.version ?? 1}_${getToday()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const opciones: AccionFila[] = fila
    ? [
        ...acciones.accionesDe(fila).filter((a) => ['versiones', 'producir', 'desactivar'].includes(a.id)),
        { id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: exportar },
      ].sort((a, b) => Number(!!a.destructiva) - Number(!!b.destructiva))
    : [];

  const columnas = useMemo<ColumnaTabla<IngredienteBorrador & { indice: number }>[]>(
    () => [
      {
        id: 'ingrediente',
        encabezado: t('col.ingrediente'),
        celda: (i) => (
          <div className="flex min-w-0 flex-col">
            <Link href={`/app/inventario/productos/${i.ingredientProductId}`} className="truncate text-brand hover:underline">
              {i.nombre}
            </Link>
            <span className="truncate text-xs text-fg-secondary">
              {[
                i.sku,
                i.unidad !== i.unidadIngrediente ? t('seLlevaEn', { unidad: i.unidadIngrediente }) : null,
                (i.mermaPct ?? 0) > 0 ? t('merma', { pct: i.mermaPct ?? 0 }) : null,
                i.opcional ? t('opcional') : null,
                !i.trackStock ? t('sinInventario') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ),
      },
      { id: 'cantidad', encabezado: t('col.cantidad'), celda: (i) => cantidad(i.cantidad ?? 0, i.unidad) },
      {
        id: 'costo',
        encabezado: t('col.costo'),
        variante: 'importe',
        celda: (i) => {
          const l = lineaDeFila(costo?.lineas, i.indice);
          return l?.error === 'conversion_faltante' ? <span className="text-xs text-danger-text">{t('sinConversion')}</span> : l?.costo_linea !== null && l?.costo_linea !== undefined ? moneda(l.costo_linea) : '—';
        },
      },
      {
        id: 'inventario',
        encabezado: t('col.inventario'),
        celda: (i) => (
          <StatusBadge
            estado={i.trackStock && !i.opcional ? 'descuenta' : 'no descuenta'}
            tono={i.trackStock && !i.opcional ? 'neutro' : 'informacion'}
            apariencia={i.trackStock && !i.opcional ? 'suave' : 'contorno'}
            etiqueta={i.trackStock && !i.opcional ? t('descuenta') : t('noDescuenta')}
          />
        ),
      },
    ],
    [cantidad, costo?.lineas, moneda, t],
  );

  if (!propia) {
    return (
      <div className="flex flex-col gap-4">
        {heredada ? (
          <Tarjeta titulo={t('heredadaTitulo')} icono={Layers}>
            <p className="text-sm text-fg-secondary">{t('heredadaDescripcion', { version: heredada.version })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/app/inventario/productos/${heredada.product_id}?tab=produccion`} className="text-sm text-brand hover:underline">
                {t('verPadre')}
              </Link>
            </div>
          </Tarjeta>
        ) : (
          <EmptyState
            icono={ChefHat}
            titulo={resumen.versiones > 0 ? t('desactivadaTitulo') : t('vacioTitulo')}
            descripcion={resumen.versiones > 0 ? t('desactivadaDescripcion') : t('vacioDescripcion')}
            accion={
              puedeEditar
                ? { etiqueta: resumen.versiones > 0 ? t('verVersiones') : t('crear'), onClick: () => router.push(rutaEditarReceta(producto.id)) }
                : undefined
            }
          />
        )}
        <UsadoEn resumen={resumen} />
      </div>
    );
  }

  const pie = [
    tr('listado.recetaNombre', { nombre: propia.nombre ?? producto.name, version: propia.version }),
    propia.creada_en ? t('activaDesde', { fecha: formatDate(propia.creada_en) }) : null,
    t('laUsan'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
      <TablaSubseccion
        titulo={t('titulo')}
        descripcion={pie}
        accionNueva={puedeEditar ? { etiqueta: t('editar'), icono: Pencil, onClick: () => router.push(rutaEditarReceta(producto.id)) } : undefined}
        opciones={opciones}
        encabezadoExtra={
          <Tarjeta>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-fg">{t('base', { nombre: propia.nombre ?? t('recetaBase'), version: propia.version })}</h3>
                <StatusBadge estado="activa" etiqueta={tr('estados.activa')} />
                <BadgeModoReceta modo={resumen.producto.modo} />
              </div>
              <p className="text-sm text-fg-secondary">
                {t('resumenLinea', {
                  rinde: cantidad(borrador?.rinde ?? 1, borrador?.unidadRinde ?? resumen.producto.unidad),
                  count: borrador?.ingredientes.length ?? 0,
                })}
              </p>
              {resumen.variantes_con_receta.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-fg">{t('recetaDe')}</span>
                  <span className="rounded-full border border-brand bg-brand-tint px-3 py-1 text-xs text-brand-deep">{t('compartida')}</span>
                  {resumen.variantes_con_receta.map((v) => (
                    <Link key={v.product_id} href={`/app/inventario/productos/${v.product_id}?tab=produccion`} className="rounded-full border border-line px-3 py-1 text-xs text-fg hover:bg-hover">
                      {t('propiaDe', { nombre: v.nombre, version: v.version })}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Tarjeta>
        }
        columnas={columnas}
        filas={(borrador?.ingredientes ?? []).map((i, indice) => ({ ...i, indice }))}
        obtenerId={(i) => i.clave}
        estado={error ? 'error' : !datos ? 'cargando' : 'listo'}
        densidad="compacta"
        vacio={{ titulo: t('sinIngredientes'), icono: ChefHat }}
        onReintentar={onCambio}
      />

      <div className="flex flex-col gap-4">
        <ResumenCostoReceta
          costo={costo}
          cargando={cargando}
          error={errorCosto}
          sucursalNombre={sucursalNombre}
          unidadRinde={borrador?.unidadRinde ?? resumen.producto.unidad}
          precioVenta={datos?.producto.precio ?? null}
          formatearMoneda={(n) => moneda(n)}
          formatearCantidad={(n) => cantidad(n)}
        />
        <Tarjeta titulo={t('conecta')}>
          <div className="flex flex-col gap-2">
            <RelatedLinkCard icono={Factory} etiqueta={t('ordenesAbiertas')} valor={String(resumen.ordenes_abiertas)} onAccion={() => irA('ordenes')} textoAccion={t('ver')} />
            <RelatedLinkCard icono={Layers} etiqueta={t('usadoEn')} valor={t('nRecetas', { count: resumen.usado_en_total })} onAccion={() => document.getElementById('receta-usado-en')?.scrollIntoView({ behavior: 'smooth' })} textoAccion={t('ver')} />
            <RelatedLinkCard icono={History} etiqueta={t('versiones')} valor={String(resumen.versiones)} onAccion={() => fila && acciones.accionesDe(fila).find((a) => a.id === 'versiones')?.onSelect()} textoAccion={t('ver')} />
            <RelatedLinkCard icono={ArrowLeftRight} etiqueta={t('movimientos')} valor={String(resumen.movimientos_produccion)} href={`/app/inventario/kardex?producto=${producto.id}&origen=production`} textoAccion={t('ver')} />
          </div>
        </Tarjeta>
        <UsadoEn resumen={resumen} />
        {puedeEditar && resumen.producto.modo === 'al_producir' && puede(resumen.permisos, 'producir') && fila && (
          <button type="button" onClick={() => acciones.pedirProducir(fila)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('crearOrden')}
          </button>
        )}
      </div>
      {acciones.dialogos}
    </div>
  );
}

function UsadoEn({ resumen }: { resumen: ResumenProduccionProducto }) {
  const t = useTranslations('subseccion.receta');
  if (resumen.usado_en_total === 0) return null;
  return (
    <Tarjeta titulo={t('usadoEnTitulo', { count: resumen.usado_en_total })} id="receta-usado-en">
      <ul className="flex flex-col gap-1.5 text-sm">
        {resumen.usado_en.map((u) => (
          <li key={u.recipe_id} className="flex items-center justify-between gap-2">
            <Link href={rutaEditarReceta(u.product_id)} className="min-w-0 truncate text-brand hover:underline">
              {u.producto}
            </Link>
            <span className="shrink-0 text-xs text-fg-secondary">v{u.version}</span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
