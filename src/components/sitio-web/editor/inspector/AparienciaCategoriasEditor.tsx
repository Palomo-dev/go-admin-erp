'use client';

/**
 * Imagen e ícono de cada categoría desde la sección «Categorías» del editor
 * (paquete 5-nov, D1). Reutiliza los mismos controles de Inventario ›
 * Categorías › Apariencia (`IconSelector` + `ImageUploader`, bucket
 * `categories/images`) y el mismo guardado (`categoryService.update`, RLS de
 * `categories`). Los permisos son los del catálogo (`fn_productos_permisos`,
 * `usePermisosCatalogo`): sin `editar` el botón queda deshabilitado.
 */
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Dialogo } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import ImageUploader from '@/components/common/ImageUploader';
import IconSelector from '@/components/common/IconSelector';
import { iconoCategoria } from '@/components/inventario/categorias/iconoCategoria';
import { usePermisosCatalogo } from '@/components/inventario/categorias/usePermisosCatalogo';
import type { CategoriaInventarioMenu } from '@/components/sitio-web/paginas/tiposPaginas';
import { useTextosEditor } from '../textos';

const MAX_SIN_ELEGIR = 12;

export interface AparienciaCategoriasEditorProps {
  lista: readonly CategoriaInventarioMenu[];
  /** Ids elegidos en la sección; si está vacío se muestran las de primer nivel activas. */
  elegidas: readonly string[];
  onGuardado?: () => void | Promise<void>;
  deshabilitado?: boolean;
}

export function AparienciaCategoriasEditor({ lista, elegidas, onGuardado, deshabilitado }: AparienciaCategoriasEditorProps) {
  const t = useTextosEditor();
  const permisos = usePermisosCatalogo();
  const [editando, setEditando] = useState<CategoriaInventarioMenu | null>(null);

  const visibles =
    elegidas.length > 0
      ? elegidas.map((id) => lista.find((c) => String(c.id) === id)).filter((c): c is CategoriaInventarioMenu => !!c)
      : lista.filter((c) => c.activa && c.padreId === null).slice(0, MAX_SIN_ELEGIR);
  if (visibles.length === 0) return null;
  const puedeEditar = permisos.resueltos && permisos.editar && !deshabilitado;

  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="text-[13px] font-medium leading-[18px] text-fg">{t('contenido.aparienciaTitulo')}</p>
      <p className="text-xs leading-4 text-fg-secondary">{t('contenido.aparienciaAyuda')}</p>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {visibles.map((c) => {
          const Icono = iconoCategoria(c.icono);
          return (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted text-fg-secondary">
                {c.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imagenUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{c.nombre}</span>
              <button
                type="button"
                onClick={() => setEditando(c)}
                disabled={!puedeEditar}
                title={permisos.resueltos && !permisos.editar ? t('contenido.aparienciaSinPermiso') : undefined}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ImageIcon aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                {t('contenido.aparienciaEditar')}
              </button>
            </li>
          );
        })}
      </ul>
      {permisos.resueltos && !permisos.editar && <p className="text-xs leading-4 text-fg-secondary">{t('contenido.aparienciaSinPermiso')}</p>}
      {editando && <DialogoApariencia key={editando.id} categoria={editando} onCerrar={() => setEditando(null)} onGuardado={onGuardado} />}
    </div>
  );
}

function DialogoApariencia({
  categoria,
  onCerrar,
  onGuardado,
}: {
  categoria: CategoriaInventarioMenu;
  onCerrar: () => void;
  onGuardado?: () => void | Promise<void>;
}) {
  const t = useTextosEditor();
  const { toast } = useToast();
  const [icono, setIcono] = useState(categoria.icono || 'Package');
  const [imagen, setImagen] = useState(categoria.imagenUrl || '');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      // Import diferido: categoryService arrastra xlsx/jspdf (exportaciones) y
      // no debe entrar en el chunk del editor.
      const { default: categoryService } = await import('@/lib/services/categoryService');
      await categoryService.update(categoria.id, { icon: icono, image_url: imagen });
      toast({ title: t('contenido.aparienciaGuardada') });
      await onGuardado?.();
      onCerrar();
    } catch (e) {
      toast({ title: t('contenido.aparienciaError'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('contenido.aparienciaDialogo', { nombre: categoria.nombre })}
      descripcion={t('contenido.aparienciaAyuda')}
      ancho={560}
      primario={{ etiqueta: t('contenido.aparienciaGuardar'), onClick: () => void guardar(), cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        <IconSelector value={icono} onChange={setIcono} label={t('contenido.aparienciaIcono')} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('contenido.aparienciaImagen')}</span>
          <ImageUploader currentImageUrl={imagen} onImageUploaded={setImagen} onImageRemoved={() => setImagen('')} bucket="categories" folder="images" label="" />
        </div>
      </div>
    </Dialogo>
  );
}
