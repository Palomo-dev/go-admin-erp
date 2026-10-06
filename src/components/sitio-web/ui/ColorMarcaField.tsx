'use client';

import { useEffect, useId, useState } from 'react';
import { CircleCheck, Link2, Palette } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal } from '@/components/kit';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import {
  ajustarHastaContraste,
  contraste,
  CONTRASTE_AA,
  formatearRazon,
  nivelContraste,
  normalizarHex,
} from '@/lib/utils/contrasteColor';
import {
  ROLES_COLOR_MARCA,
  referenciaMarca,
  resolverColorMarca,
  rolDeReferencia,
  type ColoresMarca,
  type RolColorMarca,
} from '@/lib/website/v2/colorMarca';
import { useTextosComun } from './textos';

/**
 * Color de una sección enlazado a la marca (Figma «figma-estilo» 05, variante
 * «colores de la marca» de `ColorField`):
 *
 * - enlazado: muestra + «🔗 Acento · de la marca».
 * - abierto: «Colores de la marca» (Primario, Secundario, Acento, Texto, Fondo,
 *   cada uno con su enlace), la nota «Enlazados: si cambias la marca…», y
 *   «Personalizado» con paleta y #RRGGBB (deja de seguir a la marca). Debajo,
 *   el contraste con el fondo.
 * - personalizado con poco contraste: el mismo aviso AA y «Corregir
 *   automáticamente» que `ColorField`.
 *
 * Valor: `marca:<rol>` o `#RRGGBB` (ver `@/lib/website/v2/colorMarca`). Los
 * colores del cliente pintan solo las muestras, nunca el cromo del ERP.
 */
export interface ColorMarcaFieldProps {
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  /** Colores del tema del sitio (`documento.tema.colores`). */
  colores: ColoresMarca;
  /** Fondo contra el que se mide el contraste; por defecto el `fondo` de la marca. */
  fondo?: string | null;
  minimo?: number;
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}

export function ColorMarcaField({
  etiqueta,
  valor,
  onCambiar,
  colores,
  fondo,
  minimo = CONTRASTE_AA,
  deshabilitado,
  id: idProp,
  className,
}: ColorMarcaFieldProps) {
  const tx = useTextosComun();
  const locale = useLocaleIntl();
  const idAuto = useId();
  const id = idProp ?? idAuto;
  const [abierto, setAbierto] = useState(false);
  const rol = rolDeReferencia(valor);
  const hex = normalizarHex(resolverColorMarca(valor, colores));
  const [texto, setTexto] = useState(rol ? '' : valor);
  useEffect(() => setTexto(rolDeReferencia(valor) ? '' : valor), [valor]);

  const fondoMedida = normalizarHex(fondo === undefined ? colores.fondo : fondo);
  const razon = hex && fondoMedida ? contraste(hex, fondoMedida) : null;
  const insuficiente = razon !== null && razon < minimo;
  const sugerido = insuficiente && hex && fondoMedida ? ajustarHastaContraste(hex, fondoMedida, minimo) : null;
  const nombreRol = (r: RolColorMarca) => tx(`colorMarca.rol.${r}`);

  const escribir = (v: string) => {
    setTexto(v);
    if (/^#?[0-9a-f]{6}$/i.test(v.trim())) {
      const n = normalizarHex(v);
      if (n) onCambiar(n);
    }
  };

  const contrasteOk =
    razon !== null && !insuficiente ? (
      <p className="flex items-center gap-1.5 text-xs font-medium text-success-text">
        <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {tx('color.contrasteBien', { razon: formatearRazon(razon, locale), nivel: nivelContraste(razon) === 'AAA' ? 'AAA' : 'AA' })}
      </p>
    ) : null;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium leading-[18px] text-fg">
        {etiqueta}
      </label>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-10 shrink-0 rounded-lg border border-line-strong"
            style={hex ? { backgroundColor: hex } : undefined}
          />
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              disabled={deshabilitado}
              aria-haspopup="dialog"
              aria-expanded={abierto}
              className={cn(
                'flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm text-fg',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
                abierto ? 'border-brand' : 'border-line-strong',
              )}
            >
              {rol ? (
                <>
                  <Link2 aria-hidden="true" className="size-4 shrink-0 text-link" strokeWidth={1.5} />
                  <span className="truncate">{nombreRol(rol)}</span>
                  <span className="truncate text-xs text-fg-muted">{tx('colorMarca.deLaMarca')}</span>
                  {!hex && <span className="sr-only">· {tx('colorMarca.sinDefinir')}</span>}
                </>
              ) : (
                <span className="truncate font-mono uppercase tabular-nums">{valor || '—'}</span>
              )}
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          align="end"
          aria-label={tx('colorMarca.abrir', { etiqueta })}
          className="flex w-80 max-w-[calc(100vw-32px)] flex-col gap-3 rounded-xl border-line bg-surface p-3"
        >
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-fg-secondary">{tx('colorMarca.titulo')}</p>
            <div role="radiogroup" aria-label={tx('colorMarca.titulo')} className="flex flex-wrap gap-2">
              {ROLES_COLOR_MARCA.map((r) => {
                const c = normalizarHex(colores[r]);
                const activo = rol === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    disabled={!c}
                    onClick={() => {
                      onCambiar(referenciaMarca(r));
                      setAbierto(false);
                    }}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
                      activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
                    )}
                  >
                    <span aria-hidden="true" className="size-4 rounded-full border border-line-strong" style={c ? { backgroundColor: c } : undefined} />
                    {nombreRol(r)}
                    <Link2 aria-hidden="true" className="size-3.5 text-fg-muted" strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-4 text-fg-muted">{tx('colorMarca.enlazados')}</p>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <label htmlFor={`${id}-hex`} className="text-[13px] font-medium text-fg-secondary">
              {tx('colorMarca.personalizado')}
            </label>
            <div className="flex items-center gap-2">
              <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line-strong focus-within:ring-2 focus-within:ring-brand">
                <span className="sr-only">{tx('color.selector', { nombre: etiqueta })}</span>
                <Palette aria-hidden="true" className="absolute inset-0 m-auto size-4 text-fg-secondary" strokeWidth={1.5} />
                <input
                  type="color"
                  value={(hex ?? '#000000').toLowerCase()}
                  onChange={(e) => escribir(e.target.value.toUpperCase())}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
              <input
                id={`${id}-hex`}
                value={texto}
                placeholder={tx('colorMarca.placeholder')}
                onChange={(e) => escribir(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm uppercase tabular-nums text-fg placeholder:font-sans placeholder:normal-case placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>
            {contrasteOk}
          </div>
        </PopoverContent>
      </Popover>
      {insuficiente && razon !== null && (
        <>
          <AvisoTonal
            tono="advertencia"
            compacto
            titulo={
              sugerido
                ? tx('color.aviso', { razon: formatearRazon(razon, locale), minimo: formatearRazon(minimo, locale), sugerido })
                : tx('color.avisoSinSugerido', { razon: formatearRazon(razon, locale), minimo: formatearRazon(minimo, locale) })
            }
          />
          {sugerido && (
            <button
              type="button"
              onClick={() => onCambiar(sugerido)}
              className="self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {tx('color.corregir')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
