'use client';

/**
 * «Calidad SEO por página» (Figma B/08-01, nota-ux 5): páginas PUBLICADAS del
 * borrador con el estado de su título, descripción e imagen y la calidad
 * general (la regla de «falta» es la misma de la columna SEO de Páginas,
 * `saludSeo`). «Corregir» abre el editor en el panel SEO de esa página.
 * Escritorio: DataTable. Móvil: ListCard (el kit lo resuelve con
 * `tarjetaMovil`).
 */
import Link from 'next/link';
import { DataTable, ListCard, StatusBadge, Tarjeta, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { useRouter } from 'next/navigation';
import { rutaEditorSitio } from '../rutasSitioWeb';
import { iconoDePagina } from '../paginas/iconosPagina';
import type { CalidadGeneral, CalidadPagina, NivelCampo } from './seoLogica';
import { useTextosSeoAnalitica, type TraductorSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_NIVEL, ICONO_SECCION_SEO, type NivelIcono } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';

export function rutaCorregirSeo(pageId: string): string {
  return `${rutaEditorSitio(pageId)}?panel=seo`;
}

const ESTADO_CAMPO: Record<NivelCampo, NivelIcono> = { bien: 'bien', mejorable: 'mejorable', falta: 'falta' };

export function etiquetaGeneral(t: TraductorSeoAnalitica, g: CalidadGeneral): string {
  switch (g) {
    case 'bien':
      return t('seo.calidad.bien');
    case 'mejorable':
      return t('seo.calidad.mejorable');
    case 'falta_titulo':
      return t('seo.calidad.faltaTitulo');
    case 'falta_descripcion':
      return t('seo.calidad.faltaDescripcion');
    case 'falta_imagen':
      return t('seo.calidad.faltaImagen');
  }
}

const ESTADO_GENERAL: Record<CalidadGeneral, NivelIcono> = {
  bien: 'bien',
  mejorable: 'mejorable',
  falta_titulo: 'falta',
  falta_descripcion: 'falta',
  falta_imagen: 'falta',
};

export function nombrePagina(p: Pick<CalidadPagina, 'titulo' | 'slug'>): string {
  return `${p.titulo} · /${p.slug}`;
}

export interface CalidadSeoPaginasProps {
  paginas: readonly CalidadPagina[];
  productos: { total: number; conDescripcion: number } | null;
  /** Sin tarjeta contenedora (la hoja del móvil). */
  sinTarjeta?: boolean;
}

export function CalidadSeoPaginas({ paginas, productos, sinTarjeta }: CalidadSeoPaginasProps) {
  const t = useTextosSeoAnalitica();
  const router = useRouter();
  // Cada badge lleva su icono (check · «!» · X): el estado se lee sin el color.
  const campo = (n: NivelCampo) => (
    <StatusBadge estado={ESTADO_CAMPO[n]} etiqueta={t(`seo.calidad.${n}`)} apariencia="contorno" icono={ICONO_NIVEL[ESTADO_CAMPO[n]]} />
  );
  const general = (g: CalidadGeneral) => (
    <StatusBadge estado={ESTADO_GENERAL[g]} etiqueta={etiquetaGeneral(t, g)} apariencia="solido" icono={ICONO_NIVEL[ESTADO_GENERAL[g]]} />
  );
  const corregir = (p: CalidadPagina) => (
    <Link href={rutaCorregirSeo(p.id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} aria-label={`${t('seo.calidad.corregir')}: ${p.titulo}`}>
      <ICONO_ACCION_SEO.corregir aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
      {t('seo.calidad.corregir')}
    </Link>
  );

  const columnas: ColumnaTabla<CalidadPagina>[] = [
    { id: 'pagina', encabezado: t('seo.calidad.pagina'), celda: (p) => <span className="font-medium text-fg">{nombrePagina(p)}</span> },
    { id: 'titulo', encabezado: t('seo.calidad.columnaTitulo'), celda: (p) => campo(p.campos.titulo), ancho: 112 },
    { id: 'descripcion', encabezado: t('seo.calidad.columnaDescripcion'), celda: (p) => campo(p.campos.descripcion), ancho: 120 },
    { id: 'imagen', encabezado: t('seo.calidad.columnaImagen'), celda: (p) => campo(p.campos.imagen), ancho: 112 },
    { id: 'calidad', encabezado: t('seo.calidad.columnaCalidad'), celda: (p) => general(p.general), ancho: 160 },
    { id: 'accion', encabezado: '', celda: (p) => corregir(p), alinear: 'derecha', ancho: 120 },
  ];

  const pie =
    productos && productos.total > 0
      ? t('seo.calidad.herencia', { con: new Intl.NumberFormat('es-CO').format(productos.conDescripcion), total: new Intl.NumberFormat('es-CO').format(productos.total) })
      : t('seo.calidad.herenciaSinProductos');

  const tabla = (
    <div className="flex flex-col gap-3">
      <DataTable
        columnas={columnas}
        filas={paginas}
        obtenerId={(p) => p.id}
        etiqueta={t('seo.calidad.titulo')}
        densidad="compacta"
        etiquetaFila={(p) => p.titulo}
        vacio={{ titulo: t('seo.calidad.vacio'), descripcion: undefined }}
        tarjetaMovil={(p) => (
          <ListCard
            icono={iconoDePagina(p)}
            titulo={p.titulo}
            subtitulo={`/${p.slug}`}
            estado={general(p.general)}
            onClick={() => router.push(rutaCorregirSeo(p.id))}
          />
        )}
      />
      <p className="text-xs text-fg-muted">{pie}</p>
    </div>
  );

  if (sinTarjeta) return tabla;
  return (
    <Tarjeta titulo={t('seo.calidad.titulo')} descripcion={t('seo.calidad.descripcion')} icono={ICONO_SECCION_SEO.calidad}>
      {tabla}
    </Tarjeta>
  );
}
