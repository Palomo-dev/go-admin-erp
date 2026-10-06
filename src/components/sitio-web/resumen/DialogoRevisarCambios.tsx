'use client';

/**
 * «Revisar cambios» y confirmación de «Publicar cambios» (Figma A/02a): qué
 * cambia en el sitio al publicar, por área (páginas nuevas, editadas o
 * quitadas, estilo, logo, menús…). La lista sale de `diferenciasDocumento`
 * (borrador frente a la revisión publicada), la misma que usa el editor.
 */
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Dialogo, StatusBadge } from '@/components/kit';
import type { AreaCambio } from '@/lib/website/v2/diferenciasDocumento';
import { CajaIcono } from '../ui/CajaIcono';
import { ICONO_TAREA_SITIO, type TareaSitio } from '../ui/iconosSitio';
import { useTextosResumen } from './textos';

/**
 * Icono de cada área que cambia: el de la tarea donde se edita (estilo = Diseño,
 * logo = Datos del negocio, SEO = SEO y redes…), para que «qué cambia» se lea
 * de un vistazo.
 */
export const TAREA_DE_AREA: Record<AreaCambio['tipo'], TareaSitio> = {
  pagina: 'paginas',
  tema: 'estilo',
  identidad: 'logo',
  seo: 'seo',
  contenido: 'logo', // «datos del negocio»: la misma tarea «Logo y datos del negocio» de la lista y del asistente
  menus: 'menu',
  shell: 'encabezado',
};

export interface DialogoRevisarCambiosProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  areas: readonly AreaCambio[];
  rutaEditor: string | null;
  puedePublicar: boolean;
  publicando: boolean;
  onPublicar: () => void;
}

export function DialogoRevisarCambios({ abierto, onAbiertoChange, areas, rutaEditor, puedePublicar, publicando, onPublicar }: DialogoRevisarCambiosProps) {
  const t = useTextosResumen();
  const router = useRouter();
  const abrirEditor = () => {
    if (rutaEditor) router.push(rutaEditor);
  };
  const hayCambios = areas.length > 0;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('resumen.revisar.titulo')}
      descripcion={t('resumen.revisar.descripcion')}
      icono={Send}
      ancho={520}
      primario={
        puedePublicar
          ? {
              etiqueta: t('resumen.revisar.publicar'),
              onClick: onPublicar,
              cargando: publicando,
              deshabilitada: !hayCambios,
              motivo: hayCambios ? undefined : t('resumen.revisar.vacio'),
            }
          : {
              etiqueta: t('resumen.revisar.abrirEditor'),
              onClick: abrirEditor,
              deshabilitada: !rutaEditor,
              motivo: rutaEditor ? undefined : t('resumen.sinPermisoEditar'),
            }
      }
      secundarios={puedePublicar && rutaEditor ? [{ etiqueta: t('resumen.revisar.abrirEditor'), onClick: abrirEditor }] : undefined}
    >
      {hayCambios ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {areas.map((a) => {
            const nombre = a.tipo === 'pagina' ? a.titulo : t(`resumen.areas.${a.tipo}`);
            const detalle = a.tipo === 'pagina' ? t(`resumen.revisar.${a.accion}`) : t('resumen.revisar.global');
            return (
              <li key={a.tipo === 'pagina' ? `p-${a.id}` : a.tipo} className="flex items-center gap-3 px-3 py-2.5">
                <CajaIcono icono={ICONO_TAREA_SITIO[TAREA_DE_AREA[a.tipo]]} tamano="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium leading-5 text-fg first-letter:uppercase">{nombre}</span>
                  <span className="text-xs leading-4 text-fg-secondary">{detalle}</span>
                </span>
                <StatusBadge estado="guardado en borrador" etiqueta={t('resumen.cambios.guardadoBorrador')} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-fg-secondary">{t('resumen.revisar.vacio')}</p>
      )}
    </Dialogo>
  );
}
