'use client';

/**
 * Diseño › «Encabezado y pie» (Figma D/06 acceso directo): Diseño NO edita el
 * encabezado ni el pie; abre el editor de la página de inicio con el elemento ya
 * seleccionado (`?seleccion=header|footer`, que acepta el editor). Sin página de
 * inicio, lleva a Páginas.
 */
import Link from 'next/link';
import { PanelBottom } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '../rutasSitioWeb';
import { CajaIcono } from '../ui/CajaIcono';
import { CLASE_TAMANO_ICONO, ICONO_TAREA_SITIO, TRAZO_ICONO } from '../ui/iconosSitio';
import { useTextosDiseno } from './textos';

const PanelTop = ICONO_TAREA_SITIO.encabezado;
const IconoPaginas = ICONO_TAREA_SITIO.paginas;
const ICONO_BOTON = { className: CLASE_TAMANO_ICONO.base, strokeWidth: TRAZO_ICONO } as const;

/** Editor de `paginaId` con el encabezado o el pie seleccionado. */
export function rutaEditorConSeleccion(paginaId: string, seleccion: 'header' | 'footer'): string {
  return `${rutaEditorSitio(paginaId)}?seleccion=${seleccion}`;
}

export interface PestanaEncabezadoPieProps {
  paginaInicioId: string | null;
}

export function PestanaEncabezadoPie({ paginaInicioId }: PestanaEncabezadoPieProps) {
  const t = useTextosDiseno();
  return (
    <section className="flex max-w-3xl flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-6">
      <div className="flex items-start gap-3">
        <CajaIcono icono={PanelTop} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold leading-6 text-fg">{t('encabezadoPie.titulo')}</h2>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('encabezadoPie.descripcion')}</p>
        </div>
      </div>
      {paginaInicioId ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={rutaEditorConSeleccion(paginaInicioId, 'header')}
            className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'w-full sm:w-auto' })}
          >
            <PanelTop aria-hidden="true" {...ICONO_BOTON} />
            {t('encabezadoPie.abrirEncabezado')}
          </Link>
          <Link
            href={rutaEditorConSeleccion(paginaInicioId, 'footer')}
            className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-full sm:w-auto' })}
          >
            <PanelBottom aria-hidden="true" {...ICONO_BOTON} />
            {t('encabezadoPie.abrirPie')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-[13px] leading-[18px] text-fg-secondary sm:flex-1">{t('encabezadoPie.sinInicio')}</p>
          <Link href={`${RAIZ_SITIO_WEB}/paginas`} className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-full sm:w-auto' })}>
            <IconoPaginas aria-hidden="true" {...ICONO_BOTON} />
            {t('encabezadoPie.irPaginas')}
          </Link>
        </div>
      )}
    </section>
  );
}
