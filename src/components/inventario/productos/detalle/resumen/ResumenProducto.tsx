'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Barcode,
  Boxes,
  CalendarClock,
  ChefHat,
  FileText,
  Info,
  Layers,
  Percent,
  Truck,
  Package,
} from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { supabase } from '@/lib/supabase/config';
import { loadProductImages, type ProductImageType } from '@/lib/supabase/imageUtils';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { totalesStock } from '../../logica/stock';
import { GaleriaProducto } from '../CabeceraProducto';
import { useProductoDetalle } from '../ContextoProducto';
import { BloqueResumen, Dato, Datos, EnlacePestana } from './BloqueResumen';
import { tiempoRelativo } from './tiempoRelativo';

const ESTACIONES = ['hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all'] as const;
type Estacion = (typeof ESTACIONES)[number];
const ESTADOS = ['active', 'inactive', 'discontinued', 'deleted'] as const;
type EstadoConocido = (typeof ESTADOS)[number];

interface CategoriaAdicional {
  id: number;
  nombre: string;
  porRegla: boolean;
}

interface FilaRelacion {
  category_id: number;
  assigned_by_rule: boolean | null;
  categories: { name: string } | { name: string }[] | null;
}

const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Resumen del producto (Figma `Producto — Detalles`, A.2 y A.3 de
 * PARIDAD-DETALLE-PRODUCTO-FIDELIDAD). De SOLO LECTURA: cada bloque lleva
 * «Editar» a su sección del formulario único (una sola vía de edición).
 * Escritorio en dos columnas (galería + bloques); en móvil apilado y sin la
 * galería (la cabecera móvil ya la muestra).
 */
export function ResumenProducto() {
  const t = useTranslations('productoDetalle.resumen');
  const tc = useTranslations('productoDetalle.comun');
  const te = useTranslations('productoDetalle.estado');
  const { producto, organizacionId, resumen, cargandoResumen, errorResumen, moneda, fechas, irA, recargarResumen } =
    useProductoDetalle();
  const localeIntl = useLocaleIntl();
  const entero = useFormatoEntero();

  const [imagenes, setImagenes] = useState<ProductImageType[]>([]);
  const [cargandoImagenes, setCargandoImagenes] = useState(true);
  const [adicionales, setAdicionales] = useState<CategoriaAdicional[] | null>(null);
  const [errorCategorias, setErrorCategorias] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargandoImagenes(true);
    loadProductImages(producto.id)
      .then((imgs) => {
        if (vivo) setImagenes(imgs);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCargandoImagenes(false);
      });
    return () => {
      vivo = false;
    };
  }, [producto.id, producto.updated_at]);

  useEffect(() => {
    let vivo = true;
    setErrorCategorias(false);
    supabase
      .from('product_category_relations')
      .select('category_id, assigned_by_rule, categories(name)')
      .eq('product_id', producto.id)
      .eq('organization_id', organizacionId)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setErrorCategorias(true);
          setAdicionales([]);
          return;
        }
        const filas = (data ?? []) as unknown as FilaRelacion[];
        setAdicionales(
          filas
            .filter((f) => f.category_id !== producto.category_id)
            .map((f) => {
              const c = Array.isArray(f.categories) ? f.categories[0] : f.categories;
              return { id: f.category_id, nombre: c?.name ?? `#${f.category_id}`, porRegla: !!f.assigned_by_rule };
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        );
      });
    return () => {
      vivo = false;
    };
  }, [producto.id, producto.category_id, producto.updated_at, organizacionId]);

  const decimal = useMemo(() => new Intl.NumberFormat(localeIntl, { maximumFractionDigits: 3 }), [localeIntl]);
  const esServicio = producto.product_type === 'service';
  const rastrea = producto.track_stock !== false && !esServicio;
  const estado: EstadoConocido = (ESTADOS as readonly string[]).includes(producto.status)
    ? (producto.status as EstadoConocido)
    : 'inactive';
  const estacion = (ESTACIONES as readonly string[]).includes(producto.station ?? '') ? (producto.station as Estacion) : null;
  const impuestos = (producto.product_tax_relations ?? [])
    .map((r) => r.organization_taxes)
    .filter((i): i is NonNullable<typeof i> => !!i);
  const proveedores = producto.product_suppliers ?? [];
  const preferido = proveedores.find((s) => s.is_preferred) ?? null;
  const totales = totalesStock(resumen?.sucursales ?? [], null);
  const conteos = resumen?.conteos;

  const peso = numero(producto.weight_kg);
  const largo = numero(producto.length_cm);
  const ancho = numero(producto.width_cm);
  const alto = numero(producto.height_cm);
  const volumen = largo !== null && ancho !== null && alto !== null ? largo * ancho * alto : null;
  const sinDato = <span className="text-fg-muted">{tc('sinDatos')}</span>;
  const siNo = (v: boolean | null | undefined) => (v ? tc('si') : tc('no'));
  const cifra = (v: number | null, sufijo: string) => (v === null ? sinDato : `${decimal.format(v)} ${sufijo}`);

  const fecha = (valor: string | null) =>
    valor ? (
      <span>
        {tiempoRelativo(valor, localeIntl)}
        <span className="text-fg-secondary">
          {' · '}
          {formatDateTimeInTz(valor, fechas.timezone, { locale: localeIntl })}
        </span>
      </span>
    ) : (
      sinDato
    );

  const conteoCargando = (valor: ReactNode) => (cargandoResumen && !resumen ? <Skeleton className="h-5 w-16" /> : valor);

  const bloques = (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Información (A.3 #1-#15) */}
      <BloqueResumen titulo={t('informacion.titulo')} icono={Info} seccion="informacion">
        <Datos>
          <Dato etiqueta={t('informacion.nombre')}>{producto.name}</Dato>
          <Dato etiqueta={t('informacion.sku')} mono>
            {producto.sku}
          </Dato>
          <Dato etiqueta={t('informacion.codigoBarras')} mono>
            {producto.barcode || sinDato}
          </Dato>
          <Dato etiqueta={t('informacion.tipo')}>{esServicio ? t('informacion.servicio') : t('informacion.producto')}</Dato>
          <Dato etiqueta={t('informacion.estado')}>
            <StatusBadge estado={producto.status} etiqueta={te(estado)} />
          </Dato>
          <Dato etiqueta={t('informacion.unidad')}>{producto.unit_code || sinDato}</Dato>
          <Dato etiqueta={t('informacion.categoria')}>{producto.categories?.name ?? t('informacion.sinCategoria')}</Dato>
          <Dato etiqueta={t('informacion.estacion')}>
            {estacion ? t(`estaciones.${estacion}`) : t('estaciones.heredada')}
          </Dato>
          <Dato etiqueta={t('informacion.marca')}>{producto.brand || sinDato}</Dato>
          <Dato etiqueta={t('informacion.referencia')}>{producto.reference || sinDato}</Dato>
          <Dato etiqueta={t('informacion.categoriasAdicionales')} ancho>
            {adicionales === null ? (
              <Skeleton className="h-6 w-40" />
            ) : errorCategorias ? (
              <span className="text-danger-text">{tc('errorCargar')}</span>
            ) : adicionales.length === 0 ? (
              <span className="text-fg-muted">{t('informacion.sinAdicionales')}</span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {adicionales.map((c) => (
                  <Badge key={c.id} tono={c.porRegla ? 'informacion' : 'neutro'} tamano="sm" title={c.porRegla ? t('informacion.porReglaAyuda') : undefined}>
                    {c.nombre}
                    {c.porRegla ? ` · ${t('informacion.porRegla')}` : ''}
                  </Badge>
                ))}
              </span>
            )}
          </Dato>
        </Datos>
      </BloqueResumen>

      {/* Descripción (A.2 #19) */}
      <BloqueResumen titulo={t('descripcion.titulo')} icono={FileText} seccion="informacion">
        {producto.description?.trim() ? (
          <DescripcionColapsable html={producto.description} />
        ) : (
          <p className="text-sm text-fg-muted">{t('descripcion.vacia')}</p>
        )}
      </BloqueResumen>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Impuestos (A.2 #15: todos, «{nombre} {tasa} %») */}
        <BloqueResumen titulo={t('impuestos.titulo')} icono={Percent} seccion="impuestos">
          {impuestos.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('impuestos.vacio')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {impuestos.map((imp) => (
                <Badge key={imp.id} tono="neutro">
                  {t('impuestos.chip', { nombre: imp.name, tasa: decimal.format(Number(imp.rate)) })}
                </Badge>
              ))}
            </div>
          )}
        </BloqueResumen>

        {/* Proveedor preferido (A.3 #9) */}
        <BloqueResumen
          titulo={t('proveedor.titulo')}
          icono={Truck}
          seccion="organizacion"
          accion={
            proveedores.length > 0 ? (
              <EnlacePestana onClick={() => irA('proveedores', 'proveedores')}>
                {t('proveedor.verTodos', { count: proveedores.length })}
              </EnlacePestana>
            ) : undefined
          }
        >
          {preferido ? (
            <Datos>
              <Dato etiqueta={t('proveedor.nombre')} ancho>
                {preferido.supplier?.name ?? tc('desconocido')}
                {preferido.supplier?.nit && <span className="text-fg-secondary"> · {preferido.supplier.nit}</span>}
              </Dato>
              <Dato etiqueta={t('proveedor.costo')}>
                {numero(preferido.cost) !== null ? moneda.formatear(preferido.cost) : sinDato}
              </Dato>
              <Dato etiqueta={t('proveedor.skuProveedor')} mono>
                {preferido.supplier_sku || sinDato}
              </Dato>
              <Dato etiqueta={t('proveedor.entrega')}>
                {preferido.lead_time_days !== null ? t('proveedor.dias', { count: preferido.lead_time_days }) : sinDato}
              </Dato>
              <Dato etiqueta={t('proveedor.minimo')}>
                {numero(preferido.min_order_qty) !== null ? decimal.format(numero(preferido.min_order_qty) ?? 0) : sinDato}
              </Dato>
            </Datos>
          ) : (
            <p className="text-sm text-fg-muted">
              {proveedores.length > 0 ? t('proveedor.sinPreferido') : t('proveedor.vacio')}
            </p>
          )}
        </BloqueResumen>

        {/* Inventario */}
        <BloqueResumen
          titulo={t('inventario.titulo')}
          icono={Boxes}
          seccion="inventario"
          accion={rastrea ? <EnlacePestana onClick={() => irA('inventario', 'stock')}>{t('inventario.verStock')}</EnlacePestana> : undefined}
        >
          {errorResumen && !resumen ? (
            <p className="text-sm text-danger-text">
              {errorResumen}{' '}
              <button type="button" className="font-medium text-link underline" onClick={() => void recargarResumen()}>
                {tc('reintentar')}
              </button>
            </p>
          ) : (
            <Datos>
              <Dato etiqueta={t('inventario.rastrea')}>
                {esServicio ? t('inventario.servicio') : siNo(producto.track_stock !== false)}
              </Dato>
              {rastrea && (
                <>
                  <Dato etiqueta={t('inventario.stockTotal')}>
                    {conteoCargando(tc('unidadesCortas', { n: entero(resumen?.stock_total ?? 0) }))}
                  </Dato>
                  <Dato etiqueta={t('inventario.reservadoDisponible')}>
                    {conteoCargando(
                      t('inventario.reservadoDisponibleValor', {
                        reservado: entero(resumen?.reservado ?? 0),
                        disponible: entero((resumen?.stock_total ?? 0) - (resumen?.reservado ?? 0)),
                      }),
                    )}
                  </Dato>
                  <Dato etiqueta={t('inventario.bajoMinimo')}>
                    {conteoCargando(
                      totales.bajoMinimo + totales.agotadas > 0 ? (
                        <span className="font-medium text-warning-text">
                          {t('inventario.sucursalesAlerta', { bajo: totales.bajoMinimo, agotadas: totales.agotadas })}
                        </span>
                      ) : (
                        t('inventario.sinAlertas')
                      ),
                    )}
                  </Dato>
                </>
              )}
            </Datos>
          )}
        </BloqueResumen>

        {/* Trazabilidad (A.3 #16-#20) */}
        <BloqueResumen
          titulo={t('trazabilidad.titulo')}
          icono={Barcode}
          seccion="avanzado"
          accion={
            producto.track_serial ? (
              <EnlacePestana onClick={() => irA('inventario', 'seriales')}>{t('trazabilidad.verSeriales')}</EnlacePestana>
            ) : undefined
          }
        >
          <Datos>
            <Dato etiqueta={t('trazabilidad.requiereSerial')}>{siNo(producto.track_serial)}</Dato>
            <Dato etiqueta={t('trazabilidad.garantia')}>
              {producto.warranty_months ? t('trazabilidad.meses', { count: producto.warranty_months }) : t('trazabilidad.sinGarantia')}
            </Dato>
            <Dato etiqueta={t('trazabilidad.autoGenerar')}>{siNo(producto.auto_generate_serial)}</Dato>
            <Dato etiqueta={t('trazabilidad.patron')} mono>
              {producto.serial_pattern || sinDato}
            </Dato>
          </Datos>
        </BloqueResumen>

        {/* Envío */}
        <BloqueResumen titulo={t('envio.titulo')} icono={Package} seccion="avanzado">
          <Datos>
            <Dato etiqueta={t('envio.peso')}>{cifra(peso, 'kg')}</Dato>
            <Dato etiqueta={t('envio.volumen')}>{cifra(volumen, 'cm³')}</Dato>
            <Dato etiqueta={t('envio.dimensiones')} ancho>
              {largo === null && ancho === null && alto === null
                ? sinDato
                : t('envio.dimensionesValor', {
                    largo: largo === null ? '—' : decimal.format(largo),
                    ancho: ancho === null ? '—' : decimal.format(ancho),
                    alto: alto === null ? '—' : decimal.format(alto),
                  })}
            </Dato>
          </Datos>
        </BloqueResumen>

        {/* Compuesto / receta */}
        <BloqueResumen titulo={t('compuesto.titulo')} icono={ChefHat} seccion="avanzado">
          <Datos columnas={1}>
            <Dato etiqueta={t('compuesto.esCompuesto')}>{siNo(producto.is_composite)}</Dato>
            {producto.is_composite && (
              <Dato etiqueta={t('compuesto.receta')}>
                <Link href="/app/inventario/recetas" className="font-medium text-link hover:underline">
                  {t('compuesto.verRecetas')}
                </Link>
              </Dato>
            )}
          </Datos>
        </BloqueResumen>

        {/* Variantes y modificadores */}
        <BloqueResumen titulo={t('variantes.titulo')} icono={Layers} seccion="variantes">
          <Datos>
            <Dato etiqueta={t('variantes.variantes')}>
              {conteoCargando(
                <button type="button" onClick={() => irA('variantes', 'variantes')} className="font-medium text-link hover:underline">
                  {t('variantes.conteoVariantes', {
                    count: conteos?.variantes ?? 0,
                    activas: conteos?.variantes_activas ?? 0,
                  })}
                </button>,
              )}
            </Dato>
            <Dato etiqueta={t('variantes.modificadores')}>
              {conteoCargando(
                <button
                  type="button"
                  onClick={() => irA('variantes', 'modificadores')}
                  className="font-medium text-link hover:underline"
                >
                  {t('variantes.conteoModificadores', { count: conteos?.modificadores ?? 0 })}
                </button>,
              )}
            </Dato>
          </Datos>
        </BloqueResumen>
      </div>

      {/* Fechas (A.3 #21-#22) */}
      <BloqueResumen titulo={t('fechas.titulo')} icono={CalendarClock}>
        <Datos>
          <Dato etiqueta={t('fechas.creado')}>{fecha(producto.created_at)}</Dato>
          <Dato etiqueta={t('fechas.modificado')}>{fecha(producto.updated_at)}</Dato>
        </Datos>
      </BloqueResumen>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
      <div className="hidden lg:block">
        {cargandoImagenes && imagenes.length === 0 ? (
          <Skeleton className="aspect-square w-full max-w-[200px] rounded-xl" />
        ) : (
          <GaleriaProducto imagenes={imagenes} />
        )}
        <div className="mt-2 max-w-[200px]">
          <EnlacePestana onClick={() => irA('imagenes')}>{t('verImagenes')}</EnlacePestana>
        </div>
      </div>
      {bloques}
    </div>
  );
}

/** Descripción con «Ver más» (A.2 #19); textos traducidos, no los fijos del renderer. */
function DescripcionColapsable({ html }: { html: string }) {
  const tc = useTranslations('productoDetalle.comun');
  const [abierta, setAbierta] = useState(false);
  const larga = html.replace(/<[^>]*>/g, '').length > 320;
  return (
    <div>
      <div className={larga && !abierta ? 'max-h-[120px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]' : undefined}>
        <HtmlContentRenderer html={html} className="text-fg [&_a]:text-link" />
      </div>
      {larga && (
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="mt-1 text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {abierta ? tc('verMenos') : tc('verMas')}
        </button>
      )}
    </div>
  );
}
