'use client';

import { Facebook, Globe, Instagram, MessageCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { estilosTema, TEMA_VISTA_RESPALDO, type TemaVistaSitio } from './temaVistaSitio';
import { useTextosComun } from './textos';

/**
 * Vista del pie de página del sitio (Figma D/02 SiteFooterPreview; Diseño ›
 * Encabezado y pie D/06, editor D/05-18) en sus cinco disposiciones:
 *
 * - `columnas`: marca y descripción + Contacto, Horario y Enlaces.
 * - `marca_redes`: marca, descripción y redes + dos columnas.
 * - `centrado`: marca, enlaces y redes centrados.
 * - `una_linea`: marca, enlaces y redes en una fila.
 * - `boletin`: marca y «Tu correo · Suscribirme» + dos columnas.
 *
 * Siempre cierra con «© <año> <marca> · Términos · Privacidad» y «Hecho con GO
 * Admin». Tema del sitio (dato), nunca el del ERP.
 */
export type DisposicionPie = 'columnas' | 'marca_redes' | 'centrado' | 'una_linea' | 'boletin';

export type RedSocialVista = 'instagram' | 'facebook' | 'whatsapp' | 'web';

const ICONO_RED: Record<RedSocialVista, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  whatsapp: MessageCircle,
  web: Globe,
};

export interface ColumnaPie {
  titulo: string;
  lineas: readonly string[];
}

export interface SiteFooterPreviewProps {
  disposicion: DisposicionPie;
  marca: { nombre: string; logoUrl?: string | null };
  descripcion?: string | null;
  /** Columnas en el orden en que se pintan (las disposiciones con dos columnas usan las dos primeras). */
  columnas: readonly ColumnaPie[];
  /** Enlaces en línea (centrado, una línea). */
  enlaces?: readonly string[];
  redes?: readonly RedSocialVista[];
  /** Año del copyright (de `todayInTz` de la organización). */
  anio: number;
  /** «Hecho con GO Admin» (se puede quitar en planes que lo permitan). */
  hechoConGoAdmin?: boolean;
  tema?: TemaVistaSitio;
  className?: string;
}

export function SiteFooterPreview({
  disposicion,
  marca,
  descripcion,
  columnas,
  enlaces = [],
  redes = [],
  anio,
  hechoConGoAdmin = true,
  tema = TEMA_VISTA_RESPALDO,
  className,
}: SiteFooterPreviewProps) {
  const tx = useTextosComun();
  const e = estilosTema(tema);

  const Marca = (
    <span className="flex items-center gap-2">
      {marca.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo del cliente en una vista previa a escala
        <img src={marca.logoUrl} alt="" className="size-6 rounded object-contain" />
      ) : (
        <span className="flex size-6 items-center justify-center rounded text-[11px] font-semibold" style={e.logo}>
          {marca.nombre.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-semibold" style={e.titulo}>
        {marca.nombre}
      </span>
    </span>
  );
  const Descripcion = descripcion ? (
    <p className="max-w-[220px] truncate text-xs" style={e.suave}>
      {descripcion}
    </p>
  ) : null;
  const Redes =
    redes.length > 0 ? (
      <span className="flex items-center gap-3" style={e.suave}>
        {redes.map((r) => {
          const I = ICONO_RED[r];
          return <I key={r} className="size-4" strokeWidth={1.5} />;
        })}
      </span>
    ) : null;
  const Enlaces = (
    <span className="flex flex-wrap items-center gap-4 text-xs" style={e.suave}>
      {enlaces.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </span>
  );
  const Columna = ({ c }: { c: ColumnaPie }) => (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs">
      <span className="font-semibold">{c.titulo}</span>
      {c.lineas.map((l) => (
        <span key={l} className="truncate" style={e.suave}>
          {l}
        </span>
      ))}
    </div>
  );

  let cuerpo;
  if (disposicion === 'centrado') {
    cuerpo = (
      <div className="flex flex-col items-center gap-3">
        {Marca}
        {Enlaces}
        {Redes}
      </div>
    );
  } else if (disposicion === 'una_linea') {
    cuerpo = (
      <div className="flex items-center justify-between gap-4">
        {Marca}
        {Enlaces}
        {Redes}
      </div>
    );
  } else if (disposicion === 'columnas') {
    cuerpo = (
      <div className="grid grid-cols-4 gap-6">
        <div className="flex flex-col gap-2">
          {Marca}
          {Descripcion}
        </div>
        {columnas.slice(0, 3).map((c) => (
          <Columna key={c.titulo} c={c} />
        ))}
      </div>
    );
  } else {
    cuerpo = (
      <div className="grid grid-cols-3 gap-6">
        <div className="flex flex-col gap-2">
          {Marca}
          {Descripcion}
          {disposicion === 'boletin' ? (
            <span className="flex gap-2">
              <span className="flex-1 rounded border px-2 py-1.5 text-xs" style={{ ...e.linea, ...e.suave }}>
                {tx('sitio.tuCorreo')}
              </span>
              <span className="px-3 py-1.5 text-xs font-medium" style={e.boton}>
                {tx('sitio.suscribirme')}
              </span>
            </span>
          ) : (
            Redes
          )}
        </div>
        {columnas.slice(0, 2).map((c) => (
          <Columna key={c.titulo} c={c} />
        ))}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${marca.nombre} · ${columnas.map((c) => c.titulo).join(', ')}`}
      className={cn('w-full overflow-hidden rounded-lg border border-line px-5 pt-5', className)}
      style={e.secundario}
    >
      <div aria-hidden="true" className="flex flex-col gap-5" style={{ fontFamily: tema.fuenteTexto ?? tema.fuenteTitulos }}>
        {cuerpo}
        <div className="flex items-center justify-between border-t py-3 text-[11px]" style={{ ...e.linea, ...e.suave }}>
          <span>
            © {anio} {marca.nombre} · {tx('sitio.terminos')} · {tx('sitio.privacidad')}
          </span>
          {hechoConGoAdmin && <span>{tx('sitio.hechoCon')}</span>}
        </div>
      </div>
    </div>
  );
}
