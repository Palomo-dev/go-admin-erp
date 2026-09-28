/**
 * Avatar de una organización: su logo si lo tiene; si no, sus iniciales sobre
 * el color que le toca por id (el mismo en el header, el selector y la
 * pantalla de arranque).
 *
 * Vive aparte de `OrgSwitcher` para que la pantalla de arranque lo use sin
 * cargar el selector entero (popover, hoja, diálogo de crear organización…).
 */
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getOrganizationLogoUrl } from '@/lib/supabase/imageUtils';
import { colorOrganizacion } from '@/lib/utils/identidadVisual';

const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'sas', 's.a.s.', 'sa', 's.a.', 'ltda', 'ltda.']);

/** «Mi empresa S.A.S.» → «ME»; «Distribuidora del Norte» → «DN». */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => p && !PALABRAS_MENORES.has(p.toLowerCase()));
  const letras = (palabras.length ? palabras : [nombre.trim()]).slice(0, 2).map((p) => p[0] ?? '');
  return letras.join('').toUpperCase() || '?';
}

export function AvatarOrganizacion({
  id,
  nombre,
  logoUrl,
  className,
  px = 24,
}: {
  id: number;
  nombre: string;
  logoUrl?: string | null;
  className?: string;
  /** Lado en píxeles con el que se pinta; solo afina la imagen que se descarga. */
  px?: number;
}) {
  const url = logoUrl ? getOrganizationLogoUrl(logoUrl) : '';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold tracking-tight text-white',
        url ? 'bg-surface ring-1 ring-line' : colorOrganizacion(id),
        className
      )}
    >
      {url ? <Image src={url} alt="" fill sizes={`${px}px`} className="object-cover" /> : iniciales(nombre)}
    </span>
  );
}
