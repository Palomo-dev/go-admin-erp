'use client';

import { ArrowRight } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { estilosTema, TEMA_VISTA_RESPALDO, type TemaVistaSitio } from './temaVistaSitio';
import { useTextosComun } from './textos';

/**
 * Megamenú del sitio armado desde Inventario (Figma D/02 MegaMenuPreview y
 * D/04-09): una columna por categoría con imagen, «12 platos», los primeros
 * productos (con insignia «Nuevo» si aplica) y «Ver todo →», más una tarjeta
 * destacada opcional («Menú del día»). Datos reales de categorías y productos;
 * tema del sitio.
 */
export interface ColumnaMegaMenu {
  titulo: string;
  /** «12 platos», «24 bebidas». */
  detalle?: string;
  imagenUrl?: string | null;
  enlaces: readonly { etiqueta: string; nuevo?: boolean }[];
  verTodo?: boolean;
}

export interface MegaMenuPreviewProps {
  columnas: readonly ColumnaMegaMenu[];
  destacado?: { titulo: string; detalle?: string; imagenUrl?: string | null } | null;
  tema?: TemaVistaSitio;
  className?: string;
}

export function MegaMenuPreview({ columnas, destacado, tema = TEMA_VISTA_RESPALDO, className }: MegaMenuPreviewProps) {
  const tx = useTextosComun();
  const e = estilosTema(tema);
  const Imagen = ({ url, className: c }: { url?: string | null; className: string }) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element -- imagen del inventario en una vista previa a escala
      <img src={url} alt="" className={cn(c, 'object-cover')} />
    ) : (
      <span className={c} style={e.secundario} />
    );

  return (
    <div
      role="img"
      aria-label={columnas.map((c) => c.titulo).join(', ')}
      className={cn('flex w-full gap-6 overflow-hidden rounded-lg border border-line p-5', className)}
      style={e.base}
    >
      <div aria-hidden="true" className="grid flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, columnas.length)}, minmax(0, 1fr))` }}>
        {columnas.map((c) => (
          <div key={c.titulo} className="flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Imagen url={c.imagenUrl} className="size-8 shrink-0 rounded" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold" style={e.titulo}>
                  {c.titulo}
                </span>
                {c.detalle && <span style={e.suave}>{c.detalle}</span>}
              </div>
            </div>
            {c.enlaces.map((l) => (
              <span key={l.etiqueta} className="flex items-center gap-1.5" style={e.suave}>
                <span className="truncate">{l.etiqueta}</span>
                {l.nuevo && (
                  <span className="rounded-full px-1.5 py-px text-[10px] font-medium" style={e.boton}>
                    {tx('sitio.nuevo')}
                  </span>
                )}
              </span>
            ))}
            {c.verTodo !== false && (
              <span className="inline-flex items-center gap-1 font-medium" style={e.acento}>
                {tx('sitio.verTodo')}
                <ArrowRight className="size-3" strokeWidth={1.5} />
              </span>
            )}
          </div>
        ))}
      </div>
      {destacado && (
        <div aria-hidden="true" className="flex w-40 shrink-0 flex-col gap-2 rounded-lg p-2" style={e.secundario}>
          <Imagen url={destacado.imagenUrl} className="aspect-[4/3] w-full rounded" />
          <span className="text-xs font-semibold" style={e.titulo}>
            {destacado.titulo}
          </span>
          {destacado.detalle && (
            <span className="text-[11px]" style={e.suave}>
              {destacado.detalle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
