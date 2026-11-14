'use client';

/**
 * Piezas de las secciones de Configuración que enlazan a otro lugar y de los
 * grupos de filas (Figma pág. 10, 12.7 CRM y 12.8 Chat):
 *
 * - `TarjetaEnlace`: «esto se administra en otro lado» con su icono, el texto y
 *   los botones que llevan allá (Canales, Etiquetas, Llaves de API).
 * - `BotonEnlace`: el botón «↗ Ir a …». Si el destino es otra sección de
 *   Configuración (`/app/configuracion?modulo=&seccion=`), el diálogo lo
 *   intercepta y cambia de sección sin cerrarse; si es otra pantalla y hay
 *   `onAbrir`, el diálogo se cierra y navega. Ctrl/⌘-clic abre otra pestaña.
 * - `GrupoAjustes`: título, descripción y acción a la derecha; debajo, filas
 *   separadas por una línea.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';

export function BotonEnlace({ href, onAbrir, flecha = true, children }: { href: string; onAbrir?: (href: string) => void; flecha?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
      onClick={(e) => {
        if (!onAbrir || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onAbrir(href);
      }}
    >
      {flecha && <ArrowUpRight aria-hidden="true" className="size-4" />}
      {children}
    </Link>
  );
}

export function TarjetaEnlace({ icono: Icono, texto, children }: { icono: LucideIcon; texto: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-surface p-4">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
        <Icono className="size-4" />
      </span>
      <p className="min-w-0 flex-1 basis-60 text-sm text-fg-secondary">{texto}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

interface GrupoAjustesProps {
  id: string;
  titulo: string;
  descripcion?: ReactNode;
  /** Botón a la derecha del título («Nueva etiqueta»). */
  accion?: ReactNode;
  /** Sin filas (solo una tarjeta debajo): no se pinta la línea de separación. */
  sinFilas?: boolean;
  children: ReactNode;
  className?: string;
}

export function GrupoAjustes({ id, titulo, descripcion, accion, sinFilas, children, className }: GrupoAjustesProps) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col', sinFilas ? 'gap-3' : 'gap-2', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h3 id={id} className="text-base font-medium text-fg">
            {titulo}
          </h3>
          {descripcion && <p className="mt-0.5 text-sm text-fg-muted">{descripcion}</p>}
        </div>
        {accion}
      </div>
      {sinFilas ? children : <div className="divide-y divide-line border-t border-line">{children}</div>}
    </section>
  );
}
