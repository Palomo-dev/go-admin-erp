"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Barcode, ClipboardCheck, Download, FileSpreadsheet, Globe, Link2, Package, Plus, Printer, RefreshCw, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageHeader, RowActionsMenu, type AccionFila } from '@/components/kit';
import { Button } from '@/components/ui/button';

/**
 * Cabecera del catálogo sobre el `PageHeader` del kit (Figma «Catálogo de
 * productos»): migas, icono, título, subtítulo con el avance de la carga por
 * lotes y, a la derecha, «Actualizar» · «Importar ▾» · «Nuevo producto» · «⋯».
 *
 * En móvil publica en el MobileHeader «Productos», el subtítulo corto y dos
 * acciones: «+» y «⋯» (hoja «Acciones del catálogo»).
 */
export interface ProductosPageHeaderProps {
  onImportarArchivo: () => void;
  onImportarWeb: () => void;
  onExportarCsv: () => void;
  onExportarFacebook: () => void;
  onFeedFacebook: () => void;
  onActualizar: () => void;
  /** «Imprimir etiquetas» (seleccionados o, sin selección, lo filtrado). */
  onImprimirEtiquetas?: () => void;
  /** «Códigos de barras»: generar los que faltan (misma regla de alcance). */
  onCodigosBarras?: () => void;
  actualizando?: boolean;
  /** Subtítulo de escritorio («Consolidado · 3 sucursales · 4.368 productos · …»). */
  subtitulo: string;
  /** Subtítulo corto del MobileHeader («4.368 productos» / «Cargando…»). */
  subtituloMovil: string;
  /** Carga por lotes: productos ya cargados de cuántos. */
  progresoCarga?: { cargados: number; total: number } | null;
}

const HREF_NUEVO = '/app/inventario/productos/nuevo';

const ProductosPageHeader: React.FC<ProductosPageHeaderProps> = ({
  onImportarArchivo,
  onImportarWeb,
  onExportarCsv,
  onExportarFacebook,
  onFeedFacebook,
  onActualizar,
  onImprimirEtiquetas,
  onCodigosBarras,
  actualizando = false,
  subtitulo,
  subtituloMovil,
  progresoCarga = null,
}) => {
  const router = useRouter();
  const tEtq = useTranslations('inventarioEtiquetas.catalogo');
  const t = useTranslations('productos.cabecera');
  const cargandoLotes = !!progresoCarga && progresoCarga.cargados < progresoCarga.total;

  const importar: AccionFila[] = [
    {
      id: 'importar-archivo',
      etiqueta: t('importarArchivo'),
      descripcion: t('importarArchivoDescripcion'),
      icono: FileSpreadsheet,
      onSelect: onImportarArchivo,
    },
    {
      id: 'importar-web',
      etiqueta: t('importarWeb'),
      descripcion: t('importarWebDescripcion'),
      icono: Globe,
      onSelect: onImportarWeb,
    },
  ];

  const exportar: AccionFila[] = [
    { id: 'exportar-csv', etiqueta: t('exportarCsv'), icono: Download, onSelect: onExportarCsv },
    {
      id: 'exportar-facebook',
      etiqueta: t('exportarFacebook'),
      icono: Download,
      onSelect: onExportarFacebook,
      separadorAntes: true,
    },
    { id: 'feed-facebook', etiqueta: t('feedFacebook'), icono: Link2, onSelect: onFeedFacebook },
  ];

  const irAjustes: AccionFila = {
    id: 'ajustes',
    etiqueta: t('ajustes'),
    icono: ClipboardCheck,
    onSelect: () => router.push('/app/inventario/ajustes'),
    separadorAntes: true,
  };

  // Etiquetas de papel y códigos de barras (Figma «Etiquetas y códigos — cómo
  // se llega», 516:268810). «Etiquetas» a secas son los tags de clasificación.
  const etiquetasYCodigos: AccionFila[] = [
    ...(onImprimirEtiquetas
      ? [{ id: 'imprimir-etiquetas', etiqueta: tEtq('imprimirEtiquetas'), icono: Printer, onSelect: onImprimirEtiquetas }]
      : []),
    ...(onCodigosBarras
      ? [{ id: 'codigos-barras', etiqueta: tEtq('codigosBarras'), icono: Barcode, onSelect: onCodigosBarras }]
      : []),
  ];

  const masAcciones: AccionFila[] = [
    ...etiquetasYCodigos,
    ...exportar.map((a, i) => (i === 0 && etiquetasYCodigos.length ? { ...a, separadorAntes: true } : a)),
    irAjustes,
  ];

  // Hoja móvil «Acciones del catálogo»: lo mismo que la cabecera de escritorio.
  const accionesMovil: AccionFila[] = [
    { id: 'nuevo', etiqueta: t('nuevoProducto'), icono: Plus, onSelect: () => router.push(HREF_NUEVO) },
    { ...importar[0], etiqueta: t('importarDesdeArchivo'), descripcion: undefined, separadorAntes: true },
    { ...importar[1], etiqueta: t('importarDesdeWeb'), descripcion: undefined },
    ...etiquetasYCodigos.map((a, i) => (i === 0 ? { ...a, separadorAntes: true } : a)),
    { ...exportar[0], separadorAntes: true },
    { ...exportar[1], separadorAntes: false },
    exportar[2],
    irAjustes,
    {
      id: 'actualizar',
      etiqueta: t('actualizar'),
      icono: RefreshCw,
      onSelect: onActualizar,
      deshabilitada: actualizando,
      motivo: t('yaCargando'),
    },
  ];

  return (
    <PageHeader
      titulo={t('titulo')}
      icono={Package}
      migas={[{ etiqueta: t('migaInventario'), href: '/app/inventario' }, { etiqueta: t('migaProductos') }]}
      subtitulo={subtitulo}
      cargando={cargandoLotes}
      progreso={progresoCarga ? { actual: progresoCarga.cargados, total: progresoCarga.total, etiqueta: t('progreso') } : null}
      acciones={
        <>
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            onClick={onActualizar}
            disabled={actualizando}
            aria-label={t('actualizar')}
            title={t('actualizar')}
          >
            <RefreshCw aria-hidden="true" className={actualizando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
          </Button>
          <RowActionsMenu acciones={importar} etiquetaBoton={t('importar')} iconoBoton={Upload} />
          <Button asChild className="h-10 gap-2">
            <Link href={HREF_NUEVO} prefetch>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevoProducto')}
            </Link>
          </Button>
          <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo={t('menuTitulo')} />
        </>
      }
      movil={{
        titulo: t('migaProductos'),
        subtitulo: subtituloMovil,
        accion: (
          <div className="flex items-center gap-1">
            <Link
              href={HREF_NUEVO}
              aria-label={t('nuevoProducto')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
            <RowActionsMenu acciones={accionesMovil} orientacion="horizontal" tamano="sm" titulo={t('accionesMovil')} className="size-10" />
          </div>
        ),
      }}
    />
  );
};

export default ProductosPageHeader;
