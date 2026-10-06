'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  referenciaFuenteTema,
  resolverFuenteTema,
  rolFuenteDeReferencia,
  sigueAlTema,
  type FuentesTema,
  type RolFuenteTema,
} from '@/lib/website/v2/fuenteTema';
import { FontOption } from './FontOption';
import { useTextosComun } from './textos';

/**
 * Campo de fuente de una sección (Figma «figma-estilo» 06): disparador con
 * «Aa», la familia y «Del sitio» si sigue al tema; al abrir, lista con dos
 * grupos: «Fuentes del tema» (títulos y texto del sitio, enlazadas) y «Otras
 * del catálogo del tema». Teclado: ↑/↓, Inicio/Fin, Intro y Esc.
 *
 * Valor: `null` (fuente por defecto del campo), `tema:titulos`/`tema:cuerpo`
 * (enlazada) o una familia del catálogo. Ver `@/lib/website/v2/fuenteTema`.
 */
export interface FontFieldProps {
  etiqueta: string;
  valor: string | null;
  onCambiar: (valor: string | null) => void;
  /** Fuentes del tema (`documento.tema.tipografia`). */
  fuentesTema: FuentesTema;
  /** Rol que toma `null` («Fuente del título» → `titulos`). */
  porDefecto: RolFuenteTema;
  /** Otras familias del catálogo del tema; se omiten las que ya son del tema. */
  catalogo?: readonly string[];
  /** `font-family` CSS de cada familia; por defecto `'<familia>', sans-serif`. */
  familiaCss?: (familia: string) => string;
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}

interface Opcion {
  valor: string;
  familia: string;
  descripcion?: string;
  grupo: 'tema' | 'catalogo';
}

export function FontField({
  etiqueta,
  valor,
  onCambiar,
  fuentesTema,
  porDefecto,
  catalogo = [],
  familiaCss,
  deshabilitado,
  id: idProp,
  className,
}: FontFieldProps) {
  const tx = useTextosComun();
  const idAuto = useId();
  const id = idProp ?? idAuto;
  const idLista = `${id}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const opciones = useMemo<Opcion[]>(() => {
    const delTema: Opcion[] = [];
    if (fuentesTema.titulos)
      delTema.push({ valor: referenciaFuenteTema('titulos'), familia: fuentesTema.titulos, descripcion: tx('fuentes.titulosSitio'), grupo: 'tema' });
    if (fuentesTema.cuerpo)
      delTema.push({ valor: referenciaFuenteTema('cuerpo'), familia: fuentesTema.cuerpo, descripcion: tx('fuentes.textoSitio'), grupo: 'tema' });
    const usadas = new Set(delTema.map((o) => o.familia.toLowerCase()));
    const otras = catalogo
      .filter((f, i, arr) => f && !usadas.has(f.toLowerCase()) && arr.indexOf(f) === i)
      .map<Opcion>((f) => ({ valor: f, familia: f, grupo: 'catalogo' }));
    return [...delTema, ...otras];
  }, [fuentesTema.titulos, fuentesTema.cuerpo, catalogo, tx]);

  // `null` equivale a la referencia del rol por defecto.
  const valorEfectivo = valor === null || valor === '' ? referenciaFuenteTema(porDefecto) : valor;
  const familia = resolverFuenteTema(valor, fuentesTema, porDefecto);
  const delSitio = sigueAlTema(valor);
  const css = (f: string) => (familiaCss ? familiaCss(f) : `'${f}', sans-serif`);
  const indiceSeleccionado = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valorEfectivo || (!rolFuenteDeReferencia(valorEfectivo) && o.familia === valorEfectivo)),
  );

  const enfocar = (i: number) => {
    const n = (i + opciones.length) % opciones.length;
    setActiva(n);
    refs.current[n]?.focus();
  };
  const elegir = (o: Opcion) => {
    onCambiar(o.valor === referenciaFuenteTema(porDefecto) ? null : o.valor);
    setAbierto(false);
  };
  const alPulsar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      enfocar(activa + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      enfocar(activa - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      enfocar(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      enfocar(opciones.length - 1);
    }
  };

  const grupo = (g: Opcion['grupo'], titulo: string) => {
    const lista = opciones.map((o, i) => ({ o, i })).filter(({ o }) => o.grupo === g);
    if (lista.length === 0) return null;
    const idTitulo = `${id}-${g}`;
    return (
      <div role="group" aria-labelledby={idTitulo} className="flex flex-col gap-0.5">
        <p id={idTitulo} className="px-3 pb-1 pt-2 text-xs font-medium text-fg-secondary">
          {titulo}
        </p>
        {lista.map(({ o, i }) => (
          <FontOption
            key={o.valor}
            ref={(el) => {
              refs.current[i] = el;
            }}
            familia={o.familia}
            descripcion={o.descripcion}
            familiaMuestra={css(o.familia)}
            seleccionada={i === indiceSeleccionado}
            activa={i === activa}
            tabIndex={i === activa ? 0 : -1}
            onClick={() => elegir(o)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium leading-[18px] text-fg">
        {etiqueta}
      </label>
      <Popover
        open={abierto}
        onOpenChange={(v) => {
          setAbierto(v);
          if (v) setActiva(indiceSeleccionado);
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={deshabilitado}
            aria-haspopup="listbox"
            aria-expanded={abierto}
            aria-controls={abierto ? idLista : undefined}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
              abierto ? 'border-brand' : 'border-line-strong',
            )}
          >
            <span aria-hidden="true" className="w-7 shrink-0 text-lg leading-none" style={familia ? { fontFamily: css(familia) } : undefined}>
              Aa
            </span>
            <span className="min-w-0 flex-1 truncate">{familia ?? '—'}</span>
            {delSitio && <span className="shrink-0 text-xs text-fg-muted">{tx('fuentes.delSitio')}</span>}
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-64 rounded-xl border-line bg-surface p-1.5"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            refs.current[indiceSeleccionado]?.focus();
          }}
        >
          <div id={idLista} role="listbox" aria-label={etiqueta} onKeyDown={alPulsar} className="flex max-h-80 flex-col overflow-y-auto">
            {grupo('tema', tx('fuentes.delTema'))}
            {grupo('catalogo', tx('fuentes.catalogo'))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
