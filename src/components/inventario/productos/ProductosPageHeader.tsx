"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Download, FileSpreadsheet, Globe, Link2, Package, Plus, RefreshCw, Upload } from 'lucide-react';

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
  actualizando = false,
  subtitulo,
  subtituloMovil,
  progresoCarga = null,
}) => {
  const router = useRouter();
  const cargandoLotes = !!progresoCarga && progresoCarga.cargados < progresoCarga.total;

  const importar: AccionFila[] = [
    {
      id: 'importar-archivo',
      etiqueta: 'Desde un archivo',
      descripcion: 'CSV o Excel · plantilla de 26 columnas',
      icono: FileSpreadsheet,
      onSelect: onImportarArchivo,
    },
    {
      id: 'importar-web',
      etiqueta: 'Desde una web',
      descripcion: 'Pega una URL y la IA extrae los productos',
      icono: Globe,
      onSelect: onImportarWeb,
    },
  ];

  const exportar: AccionFila[] = [
    { id: 'exportar-csv', etiqueta: 'Exportar a CSV', icono: Download, onSelect: onExportarCsv },
    {
      id: 'exportar-facebook',
      etiqueta: 'Exportar a Facebook (CSV)',
      icono: Download,
      onSelect: onExportarFacebook,
      separadorAntes: true,
    },
    { id: 'feed-facebook', etiqueta: 'URL del feed para Facebook', icono: Link2, onSelect: onFeedFacebook },
  ];

  const irAjustes: AccionFila = {
    id: 'ajustes',
    etiqueta: 'Ajustes de inventario',
    icono: ClipboardCheck,
    onSelect: () => router.push('/app/inventario/ajustes'),
    separadorAntes: true,
  };

  const masAcciones: AccionFila[] = [...exportar, irAjustes];

  // Hoja móvil «Acciones del catálogo»: lo mismo que la cabecera de escritorio.
  const accionesMovil: AccionFila[] = [
    { id: 'nuevo', etiqueta: 'Nuevo producto', icono: Plus, onSelect: () => router.push(HREF_NUEVO) },
    { ...importar[0], etiqueta: 'Importar desde un archivo', descripcion: undefined, separadorAntes: true },
    { ...importar[1], etiqueta: 'Importar desde una web', descripcion: undefined },
    { ...exportar[0], separadorAntes: true },
    { ...exportar[1], separadorAntes: false },
    exportar[2],
    irAjustes,
    {
      id: 'actualizar',
      etiqueta: 'Actualizar catálogo',
      icono: RefreshCw,
      onSelect: onActualizar,
      deshabilitada: actualizando,
      motivo: 'Ya se está cargando',
    },
  ];

  return (
    <PageHeader
      titulo="Catálogo de productos"
      icono={Package}
      migas={[{ etiqueta: 'Inventario', href: '/app/inventario' }, { etiqueta: 'Productos' }]}
      subtitulo={subtitulo}
      cargando={cargandoLotes}
      progreso={progresoCarga ? { actual: progresoCarga.cargados, total: progresoCarga.total, etiqueta: 'Progreso de carga del catálogo' } : null}
      acciones={
        <>
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            onClick={onActualizar}
            disabled={actualizando}
            aria-label="Actualizar catálogo"
            title="Actualizar catálogo"
          >
            <RefreshCw aria-hidden="true" className={actualizando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
          </Button>
          <RowActionsMenu acciones={importar} etiquetaBoton="Importar" iconoBoton={Upload} />
          <Button asChild className="h-10 gap-2">
            <Link href={HREF_NUEVO} prefetch>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Nuevo producto
            </Link>
          </Button>
          <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo="catálogo" />
        </>
      }
      movil={{
        titulo: 'Productos',
        subtitulo: subtituloMovil,
        accion: (
          <div className="flex items-center gap-1">
            <Link
              href={HREF_NUEVO}
              aria-label="Nuevo producto"
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
            <RowActionsMenu acciones={accionesMovil} orientacion="horizontal" tamano="sm" titulo="Acciones del catálogo" className="size-10" />
          </div>
        ),
      }}
    />
  );
};

export default ProductosPageHeader;
