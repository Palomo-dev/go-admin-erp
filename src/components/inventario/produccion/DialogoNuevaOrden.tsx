'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChefHat, Factory } from 'lucide-react';
import { CampoNumero, DataTable, Dialogo, FormField, SelectorEntidad, type ColumnaTabla } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { recipeService, type FilaReceta } from '@/lib/services/recipeService';
import {
  nuevaClaveProduccion,
  productionOrderService,
  type LineaNecesidad,
  type NecesidadesProduccion,
} from '@/lib/services/productionOrderService';
import { crearDebounce } from '@/components/kit/debounce';
import { validarCantidadProducida } from './logica';
import { useFormatoCantidad, useMensajeErrorProduccion } from './piezas';

/** Producto a producir (fila del listado de recetas o el producto del detalle). */
export interface ProductoAProducir {
  product_id: number;
  nombre: string;
  sku: string | null;
  unidad: string;
  decimales: number;
  recipe_id: number;
  version: number;
}

export const aProductoAProducir = (f: FilaReceta): ProductoAProducir => ({
  product_id: f.product_id,
  nombre: f.producto.nombre,
  sku: f.producto.sku,
  unidad: f.producto.unidad,
  decimales: f.producto.decimales,
  recipe_id: f.recipe_id,
  version: f.version,
});

/**
 * «Nueva orden de producción» (Figma G1 970:177054 y 604:158714): producto con
 * receta activa, sucursal, cantidad (con los decimales del producto) y la
 * versión de receta que la orden guarda. Vista previa de necesidades por
 * ingrediente (necesario · disponible · faltante) y costo estimado, del mismo
 * cálculo que el costo de la receta y la venta. Si falta stock se avisa: se
 * puede crear igual y «Completar» pedirá confirmar el faltante.
 */
export interface DialogoNuevaOrdenProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Fijo desde la pestaña Producción del producto. */
  producto?: ProductoAProducir | null;
  onCreada: (id: number) => void;
}

export function DialogoNuevaOrden({ abierto, onAbiertoChange, producto: fijo, onCreada }: DialogoNuevaOrdenProps) {
  const t = useTranslations('inventarioProduccion.nueva');
  const cantidadFmt = useFormatoCantidad();
  const mensajeError = useMensajeErrorProduccion();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { branches, branchFilter } = useBranch();
  const [producto, setProducto] = useState<ProductoAProducir | null>(fijo ?? null);
  const [sucursal, setSucursal] = useState<number | null>(branchFilter ?? branches[0]?.id ?? null);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [necesidades, setNecesidades] = useState<NecesidadesProduccion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState<'borrador' | 'confirmar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setProducto(fijo ?? null);
    setSucursal(branchFilter ?? branches[0]?.id ?? null);
    setCantidad(null);
    setNecesidades(null);
    setError(null);
    setClave(nuevaClaveProduccion('crear'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const errorCantidad = producto ? validarCantidadProducida(cantidad, Number.MAX_SAFE_INTEGER, producto.decimales) : 'requerida';

  // Necesidades con debounce (se recalculan al cambiar producto, sucursal o cantidad).
  useEffect(() => {
    if (!abierto || !producto || !sucursal || errorCantidad || cantidad === null) {
      setNecesidades(null);
      return;
    }
    const control = new AbortController();
    setCargando(true);
    const d = crearDebounce(async () => {
      try {
        const r = await productionOrderService.necesidades(getOrganizationId(), sucursal, producto.recipe_id, cantidad, control.signal);
        if (!control.signal.aborted) setNecesidades(r);
      } catch {
        if (!control.signal.aborted) setNecesidades(null);
      } finally {
        if (!control.signal.aborted) setCargando(false);
      }
    }, 350);
    d.llamar();
    return () => {
      d.cancelar();
      control.abort();
    };
  }, [abierto, producto, sucursal, cantidad, errorCantidad]);

  const buscar = useCallback(async (texto: string, senal: AbortSignal) => {
    const r = await recipeService.listar(getOrganizationId(), { busqueda: texto || undefined, estado: 'activas', limite: 20 }, senal);
    return r.filas;
  }, []);

  const faltantes = necesidades?.lineas.filter((l) => l.faltante > 0) ?? [];

  const guardar = async (confirmar: boolean) => {
    if (!producto || !sucursal || cantidad === null || errorCantidad) return;
    setTrabajando(confirmar ? 'confirmar' : 'borrador');
    setError(null);
    try {
      const r = await productionOrderService.guardar(
        getOrganizationId(),
        { branch_id: sucursal, product_id: producto.product_id, recipe_id: producto.recipe_id, qty_to_produce: cantidad, confirmar },
        `${clave}:${confirmar ? 'c' : 'b'}`,
      );
      onCreada(r.id);
      onAbiertoChange(false);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const columnas = useMemo<ColumnaTabla<LineaNecesidad>[]>(
    () => [
      {
        id: 'ingrediente',
        encabezado: t('columnas.ingrediente'),
        celda: (l) => (
          <span className="text-fg">
            {l.nombre}
            {l.merma_pct > 0 && <span className="text-fg-secondary"> {t('merma', { pct: l.merma_pct })}</span>}
          </span>
        ),
      },
      { id: 'necesario', encabezado: t('columnas.necesario'), variante: 'importe', celda: (l) => cantidadFmt(l.necesario, l.unidad) },
      {
        id: 'disponible',
        encabezado: t('columnas.disponible'),
        variante: 'importe',
        celda: (l) => (l.track_stock ? cantidadFmt(l.disponible, l.unidad) : <span className="text-fg-secondary">{t('noDescuenta')}</span>),
      },
      {
        id: 'faltante',
        encabezado: t('columnas.faltante'),
        variante: 'importe',
        celda: (l) =>
          l.error === 'conversion_faltante' ? (
            <span className="text-danger-text">{t('sinConversion')}</span>
          ) : l.faltante > 0 ? (
            <span className="font-medium text-danger-text">{cantidadFmt(l.faltante, l.unidad)}</span>
          ) : (
            <span className="text-fg-muted">—</span>
          ),
      },
    ],
    [cantidadFmt, t],
  );

  const sucursalNombre = branches.find((b) => b.id === sucursal)?.name ?? '';

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !trabajando && onAbiertoChange(a)}
      titulo={t('titulo')}
      descripcion={producto ? t('descripcionProducto', { producto: producto.nombre }) : t('descripcion')}
      icono={Factory}
      ancho={672}
      primario={{
        etiqueta: t('crearYConfirmar'),
        onClick: () => guardar(true),
        cargando: trabajando === 'confirmar',
        deshabilitada: !producto || !sucursal || !!errorCantidad || !!trabajando,
        motivo: !producto ? t('eligeProducto') : errorCantidad ? t('escribeCantidad') : undefined,
      }}
      secundarios={[
        {
          etiqueta: t('guardarBorrador'),
          onClick: () => guardar(false),
          cargando: trabajando === 'borrador',
          deshabilitada: !producto || !sucursal || !!errorCantidad || !!trabajando,
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        {!fijo && (
          <FormField etiqueta={t('producto')} id="nueva-orden-producto" obligatorio>
            <SelectorEntidad<FilaReceta>
              layout="campo"
              etiqueta={t('producto')}
              icono={ChefHat}
              valor={null}
              insigniaValor={producto ? <span className="truncate text-sm text-fg">{producto.nombre}</span> : undefined}
              aOpcion={(f) => ({
                id: String(f.recipe_id),
                titulo: f.producto.nombre,
                subtitulo: [f.producto.sku, t('recetaVersion', { version: f.version }), t(`modo.${f.modo}`)].filter(Boolean).join(' · '),
              })}
              buscar={buscar}
              onCambiar={(f) => setProducto(aProductoAProducir(f))}
              textos={{ placeholder: producto?.nombre ?? t('buscarProducto'), buscar: t('buscarProducto'), titulo: t('producto'), vacio: t('buscarVacio'), sinResultados: t('sinRecetas') }}
            />
          </FormField>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
          <FormField etiqueta={t('sucursal')}>
            {(c) => (
              <Select value={sucursal ? String(sucursal) : undefined} onValueChange={(v) => setSucursal(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue placeholder={t('eligeSucursal')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('cantidad')} obligatorio>
            <CampoNumero
              valor={cantidad}
              onValorChange={setCantidad}
              decimales={producto?.decimales ?? 0}
              minimo={0}
              sufijo={producto?.unidad}
              alinear="derecha"
              disabled={!producto}
            />
          </FormField>
          <FormField etiqueta={t('receta')}>
            {(c) => (
              <p id={c.id} className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg">
                {producto ? t('versionActiva', { version: producto.version }) : '—'}
              </p>
            )}
          </FormField>
        </div>

        {producto && cantidad !== null && !errorCantidad && (
          <section aria-labelledby="nueva-orden-necesidades" className="flex flex-col gap-2">
            <h3 id="nueva-orden-necesidades" className="text-sm font-semibold text-fg">
              {t('necesidadesPara', { cantidad: cantidadFmt(cantidad, producto.unidad), sucursal: sucursalNombre })}
            </h3>
            <DataTable
              etiqueta={t('necesidades')}
              columnas={columnas}
              filas={necesidades?.lineas ?? []}
              obtenerId={(l) => String(l.orden)}
              estado={cargando && !necesidades ? 'cargando' : 'listo'}
              vacio={{ titulo: t('sinIngredientes'), icono: ChefHat }}
              densidad="compacta"
            />
            {necesidades && (faltantes.length > 0 || necesidades.costo_total !== null) && (
              <p
                role="status"
                className={
                  faltantes.length > 0
                    ? 'flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-text'
                    : 'text-[13px] text-fg-secondary'
                }
              >
                {faltantes.length > 0 && <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />}
                <span>
                  {faltantes.length > 0
                    ? t('avisoFaltante', { count: faltantes.length, nombre: faltantes[0].nombre, cantidad: cantidadFmt(faltantes[0].faltante, faltantes[0].unidad) })
                    : ''}
                  {necesidades.costo_total !== null ? ` ${t('costoEstimado', { costo: moneda(necesidades.costo_total) })}` : ''}
                </span>
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Dialogo>
  );
}
