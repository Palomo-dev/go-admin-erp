'use client';

import { Check, ChevronDown, Globe, Loader2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/Utils';
import type { SitioResumen } from '@/lib/website/v2/tipos';
import { useTranslations } from 'next-intl';

export interface SucursalSelector {
  id: number;
  nombre: string;
  activa: boolean;
}

interface SelectorSitioProps {
  sitios: SitioResumen[];
  sucursales: SucursalSelector[];
  /** Sitio que se edita: `null` = principal; `undefined` = editor legacy sin sitio V2. */
  branchActivo: number | null | undefined;
  cargando?: boolean;
  onElegir: (branchId: number | null) => void;
}

/** `clave`: subclave de `branding.editor.selectorSitio.estado`. */
function estadoTexto(sitio: SitioResumen | undefined, esPrincipal: boolean): { clave: string; clase: string } {
  if (!sitio) {
    return esPrincipal
      ? { clave: 'sitioActual', clase: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' }
      : { clave: 'hereda', clase: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
  }
  if (sitio.v2Adoptado) return { clave: 'v2EnLaWeb', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' };
  if (sitio.revisionPublicadaId) return { clave: 'publicado', clase: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' };
  return {
    clave: esPrincipal ? 'borradorV2' : 'sitioPropio',
    clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  };
}

/**
 * Selector «Editando: Sitio principal / Sede …» (Figma 05-13). Lista el sitio principal y las
 * sucursales de la organización (consultadas con `branchService`). Elegir una sede sin sitio
 * abre la confirmación para crearlo heredando del principal; nada cambia sin esa confirmación.
 */
export function SelectorSitio({ sitios, sucursales, branchActivo, cargando, onElegir }: SelectorSitioProps) {
  const t = useTranslations('branding.editor');
  const porSucursal = new Map(sitios.map((s) => [s.branchId, s]));
  const nombreActivo =
    branchActivo === undefined || branchActivo === null
      ? 'Sitio principal'
      : sucursales.find((s) => s.id === branchActivo)?.nombre ?? `Sede ${branchActivo}`;
  const esSede = typeof branchActivo === 'number';

  const fila = (branchId: number | null, nombre: string, deshabilitada = false) => {
    const sitio = porSucursal.get(branchId);
    const estado = estadoTexto(sitio, branchId === null);
    const activa = branchActivo === branchId || (branchId === null && branchActivo === undefined);
    return (
      <DropdownMenuItem
        key={branchId ?? 'principal'}
        disabled={deshabilitada}
        onSelect={() => onElegir(branchId)}
        className="flex items-start gap-2 py-2"
      >
        {branchId === null ? <Globe className="h-4 w-4 mt-0.5 shrink-0" /> : <Store className="h-4 w-4 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm truncate', activa && 'font-semibold text-blue-700 dark:text-blue-300')}>{nombre}</p>
          {sitio?.cambiosSinPublicar && sitio.versionBorrador ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('selectorSitio.cambiosSinPublicar')}</p>
          ) : null}
          {deshabilitada ? <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('selectorSitio.sucursalInactiva')}</p> : null}
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap', estado.clase)}>{t(`selectorSitio.estado.${estado.clave}`)}</span>
        {activa ? <Check className="h-3.5 w-3.5 mt-0.5 text-blue-600" aria-hidden /> : null}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t('selectorSitio.sitioEdita', { nombreActivo })}
          className={cn(
            'h-8 gap-1.5 text-sm bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white',
            esSede && 'border-amber-300 bg-amber-400/20',
          )}
        >
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : esSede ? <Store className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
          <span className="text-white/70 hidden sm:inline">{t('header.editing')}</span>
          <span className="max-w-[160px] truncate">{nombreActivo}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[340px] max-w-[calc(100vw-32px)]">
        <DropdownMenuLabel className="text-xs text-gray-500">{t('selectorSitio.editarSitio')}</DropdownMenuLabel>
        {fila(null, t('selectorSitio.sitioPrincipal'))}
        {sucursales.length > 0 && <DropdownMenuSeparator />}
        {sucursales.map((s) => fila(s.id, s.nombre, !s.activa && !porSucursal.has(s.id)))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {t('selectorSitio.cadaSedePropioSitio')}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
