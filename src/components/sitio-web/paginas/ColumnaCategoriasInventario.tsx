'use client';

/**
 * Columna «Categorías del Inventario» de Menú y navegación (Figma D/04-09): categorías de primer
 * nivel con productos activos y subcategorías, «En el menú» si ya están en el submenú del
 * enlace elegido o «+» para añadirlas; se pueden arrastrar al árbol. Se leen en el servidor
 * (`GET /api/sitio-web/paginas/menu/categorias`) con `useCategoriasMenu`.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, GripVertical, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CAJA_ICONO, CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import { apiPaginas } from './apiPaginas';
import { ICONO_ZONA_MENU } from './iconosPagina';
import { RUTA_CATEGORIAS_INVENTARIO } from './InspectorEnlace';
import { useTextosPaginas } from './textos';
import { TituloZona } from './TituloZona';
import type { CategoriaInventarioMenu } from './tiposPaginas';
import type { ArrastreMenu } from './useArrastreMenu';

export interface CategoriasMenu {
  categorias: CategoriaInventarioMenu[];
  cargando: boolean;
  error: boolean;
  recargar: () => Promise<void>;
}

/** Categorías del Inventario del sitio (principal o sede). Una sola lectura para la pantalla. */
export function useCategoriasMenu(branchId: number | null, deshabilitado = false): CategoriasMenu {
  const [categorias, setCategorias] = useState<CategoriaInventarioMenu[]>([]);
  const [cargando, setCargando] = useState(!deshabilitado);
  const [error, setError] = useState(false);
  const recargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      setCategorias((await apiPaginas.categorias(branchId)).categorias);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [branchId]);
  useEffect(() => {
    if (!deshabilitado) void recargar();
  }, [recargar, deshabilitado]);
  return { categorias, cargando, error, recargar };
}

export interface ColumnaCategoriasInventarioProps {
  datos: CategoriasMenu;
  /** Ids (texto) de las categorías que ya están en el submenú. */
  enMenu: ReadonlySet<string>;
  onAnadir: (categoriaId: number) => void;
  arrastre?: ArrastreMenu | null;
  soloLectura?: boolean;
  branchId: number | null;
}

export function ColumnaCategoriasInventario({ datos, enMenu, onAnadir, arrastre, soloLectura, branchId }: ColumnaCategoriasInventarioProps) {
  const t = useTextosPaginas();
  const raices = datos.categorias.filter((c) => c.padreId === null);
  const activas = raices.filter((c) => c.activa).length;
  const subDe = (id: number) => datos.categorias.filter((c) => c.padreId === id).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <TituloZona icono={ICONO_ZONA_MENU.categorias}>{t('categorias.titulo')}</TituloZona>
        {!datos.cargando && !datos.error && <span className="text-xs text-fg-secondary">{t('categorias.activas', { n: activas })}</span>}
      </div>
      <p className="text-[13px] leading-[18px] text-fg-secondary">{t('categorias.ayuda')}</p>
      {datos.cargando && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      )}
      {datos.error && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-danger-text">{t('categorias.error')}</p>
          <button type="button" onClick={() => void datos.recargar()} className="text-sm font-medium text-brand-deep hover:underline">
            {t('categorias.reintentar')}
          </button>
        </div>
      )}
      {!datos.cargando && !datos.error && raices.length === 0 && <p className="text-sm text-fg-secondary">{t('categorias.vacio')}</p>}
      <ul className="flex flex-col gap-2">
        {raices.map((c) => {
          const nodo = soloLectura ? undefined : arrastre?.nodoCategoria(c.id);
          const ya = enMenu.has(String(c.id));
          const sub = subDe(c.id);
          const detalle = [
            c.productos === 1 ? t('categorias.productoUno') : t('categorias.productos', { n: c.productos }),
            sub > 0 ? t('categorias.subcategorias', { n: sub }) : null,
            !c.activa ? t('categorias.inactiva') : null,
            branchId !== null && c.branchId === branchId ? t('categorias.soloSede') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={c.id}>
              <div
                {...(ya ? {} : nodo?.props)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border bg-surface px-3 py-2',
                  nodo?.esOrigen ? 'border-line-brand opacity-60' : 'border-line',
                  !c.activa && 'opacity-60',
                )}
              >
                {!soloLectura && !ya && <GripVertical aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 cursor-grab text-fg-muted')} strokeWidth={TRAZO_ICONO} />}
                <span aria-hidden="true" className={cn(CAJA_ICONO.sm.caja, 'flex shrink-0 items-center justify-center bg-subtle text-fg-secondary')}>
                  <ICONO_ZONA_MENU.categorias className={CAJA_ICONO.sm.icono} strokeWidth={TRAZO_ICONO} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{c.nombre}</span>
                  <span className="truncate text-xs tabular-nums text-fg-secondary">{detalle}</span>
                </span>
                {ya ? (
                  <Badge tono="exito" apariencia="suave" tamano="sm" icono={Check}>
                    {t('categorias.enMenu')}
                  </Badge>
                ) : (
                  !soloLectura && (
                    <button
                      type="button"
                      onClick={() => onAnadir(c.id)}
                      aria-label={t('categorias.anadir', { nombre: c.nombre })}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Link href={RUTA_CATEGORIAS_INVENTARIO} className="text-sm font-medium text-brand-deep hover:underline">
        {t('categorias.crearEditar')}
      </Link>
    </div>
  );
}
