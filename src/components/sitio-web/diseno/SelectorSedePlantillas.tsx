'use client';

/**
 * «Plantillas para: <sitio>» (Figma «16 Sitio web» › «Plantillas por sede», láminas A y D): el
 * `Select` del ERP con «Sitio principal» y cada sede con sitio; cada opción dice su giro y si
 * hereda el estilo del principal o tiene uno propio. En el celular ocupa todo el ancho.
 */
import { Globe, Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import type { SedeParaPlantillas } from '@/lib/website/v2/plantillaSede';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { useTextosDiseno } from './textos';

/** Valor del sitio principal en el `Select` (`null` no es un valor válido). */
export const SITIO_PRINCIPAL = 'principal';

export interface SelectorSedePlantillasProps {
  sedes: readonly SedeParaPlantillas[];
  /** `SITIO_PRINCIPAL` o el id de la sede como texto. */
  valor: string;
  onValorChange: (valor: string) => void;
  className?: string;
}

export function SelectorSedePlantillas({ sedes, valor, onValorChange, className }: SelectorSedePlantillasProps) {
  const t = useTextosDiseno();
  const elegida = sedes.find((s) => String(s.branchId) === valor) ?? null;
  const giro = (s: SedeParaPlantillas) => (s.giro ? t(`plantillas.giro.${s.giro}`) : null);
  const detalle = (s: SedeParaPlantillas) =>
    [giro(s), s.estiloPropio ? t('plantillas.sede.propio') : t('plantillas.sede.hereda')].filter(Boolean).join(' · ');
  const Icono = elegida ? Store : Globe;
  return (
    <div className={cn('flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3', className)}>
      <span id="plantillas-sede-etiqueta" className="text-[13px] font-medium leading-[18px] text-fg-secondary">
        {t('plantillas.sede.etiqueta')}
      </span>
      <Select value={valor} onValueChange={onValorChange}>
        <SelectTrigger
          aria-labelledby="plantillas-sede-etiqueta"
          className="h-10 w-full gap-2 rounded-lg border-line bg-surface text-[13px] sm:w-[280px]"
          data-selector-sede
        >
          {/* `div`, no `span`: el trigger corta a una línea sus `span` hijos (`[&>span]:line-clamp-1`). */}
          <div className="flex min-w-0 items-center gap-2">
            <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
            <span className="truncate font-medium text-fg">{elegida ? elegida.nombre : t('plantillas.sede.principal')}</span>
            {elegida && giro(elegida) && <span className="truncate text-fg-secondary">· {giro(elegida)}</span>}
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SITIO_PRINCIPAL}>
            <span className="flex flex-col">
              <span className="font-medium">{t('plantillas.sede.principal')}</span>
              <span className="text-xs text-fg-secondary">{t('plantillas.sede.principalDetalle')}</span>
            </span>
          </SelectItem>
          {sedes.map((s) => (
            <SelectItem key={s.branchId} value={String(s.branchId)}>
              <span className="flex flex-col">
                <span className="font-medium">{s.nombre}</span>
                <span className="text-xs text-fg-secondary">{detalle(s)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
