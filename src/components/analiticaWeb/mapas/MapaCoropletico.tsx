'use client';

/**
 * Coropleta en SVG (Figma 464:237485, «Visitantes por país» / «Colombia»).
 * Presentacional: recibe los trazos ya proyectados y los valores por código.
 *
 * Accesibilidad:
 *  - El mapa es UNA parada de tabulación (tabindex itinerante): con las flechas
 *    se recorren todas las regiones (primero las que tienen visitas, de más a
 *    menos), Inicio/Fin van a los extremos, Enter/Espacio elige.
 *  - Cada región lleva `aria-label` con nombre, visitantes y % del total; el
 *    tooltip visual aparece igual al pasar el ratón o al enfocar con teclado.
 *  - Sin visitas: gris claro, `aria-disabled`. La tabla vecina tiene los mismos
 *    datos (alternativa no gráfica).
 */
import { useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PASOS_ESCALA, pasoEscala, rellenoPaso, type ValorRegion } from '@/lib/analiticaWeb/mapa';
import type { FormaDibujada, Recuadro } from './proyeccion';

export interface MapaCoropleticoProps {
  formas: FormaDibujada[];
  ancho: number;
  alto: number;
  valores: Map<string, ValorRegion>;
  /** Nombre visible de una región (p. ej. país traducido con Intl.DisplayNames). */
  nombreDe?: (forma: FormaDibujada) => string;
  seleccionado?: string | null;
  onElegir?: (codigo: string) => void;
  /** Nombre accesible del mapa. */
  etiqueta: string;
  recuadro?: Recuadro | null;
  testId?: string;
}

interface Tooltip {
  codigo: string;
  x: number;
  y: number;
}

export function MapaCoropletico({ formas, ancho, alto, valores, nombreDe, seleccionado = null, onElegir, etiqueta, recuadro, testId }: MapaCoropleticoProps) {
  const t = useTranslations('analiticaWeb.geo.mapa');
  const locale = useLocale();
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const pf = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }), [locale]);
  const idAyuda = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  const max = useMemo(() => {
    let m = 0;
    valores.forEach((v) => {
      if (v.visitantes > m) m = v.visitantes;
    });
    return m;
  }, [valores]);

  const nombre = (f: FormaDibujada) => (nombreDe ? nombreDe(f) : f.nombre);

  // Orden del recorrido con teclado: con visitas (de más a menos), luego el resto por nombre.
  const orden = useMemo(() => {
    const conCodigo = formas.filter((f): f is FormaDibujada & { codigo: string } => f.codigo !== null);
    const vistos = new Set<string>();
    const unicos = conCodigo.filter((f) => (vistos.has(f.codigo) ? false : (vistos.add(f.codigo), true)));
    return unicos
      .map((f) => ({ codigo: f.codigo, v: valores.get(f.codigo)?.visitantes ?? 0, n: nombreDe ? nombreDe(f) : f.nombre }))
      .sort((a, b) => b.v - a.v || a.n.localeCompare(b.n, locale))
      .map((x) => x.codigo);
  }, [formas, valores, nombreDe, locale]);

  const [activo, setActivo] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const enfocable = activo && orden.includes(activo) ? activo : seleccionado && orden.includes(seleccionado) ? seleccionado : orden[0] ?? null;

  const etiquetaRegion = (f: FormaDibujada): string => {
    const v = f.codigo ? valores.get(f.codigo) : undefined;
    if (!v || v.visitantes <= 0) return t('regionSinVisitas', { nombre: nombre(f) });
    return t('region', { nombre: nombre(f), n: v.visitantes, v: nf.format(v.visitantes), pct: pf.format(v.pct) });
  };

  const enfocar = (codigo: string) => {
    setActivo(codigo);
    const el = svgRef.current?.querySelector<SVGPathElement>(`[data-codigo="${codigo}"]`);
    el?.focus();
  };

  const alTeclado = (e: React.KeyboardEvent<SVGPathElement>, codigo: string) => {
    const i = orden.indexOf(codigo);
    let destino: string | undefined;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        destino = orden[(i + 1) % orden.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        destino = orden[(i - 1 + orden.length) % orden.length];
        break;
      case 'Home':
        destino = orden[0];
        break;
      case 'End':
        destino = orden[orden.length - 1];
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (onElegir && (valores.get(codigo)?.visitantes ?? 0) > 0) onElegir(codigo);
        return;
      }
      case 'Escape':
        setTooltip(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (destino) enfocar(destino);
  };

  const alMoverRaton = (e: React.MouseEvent<SVGPathElement>, codigo: string) => {
    const svg = svgRef.current;
    const caja = svg?.getBoundingClientRect();
    if (!caja || caja.width === 0) return;
    setTooltip({ codigo, x: ((e.clientX - caja.left) / caja.width) * ancho, y: ((e.clientY - caja.top) / caja.height) * alto });
  };

  const formaTooltip = tooltip ? formas.find((f) => f.codigo === tooltip.codigo) : undefined;
  const valorTooltip = tooltip ? valores.get(tooltip.codigo) : undefined;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="relative">
        <p id={idAyuda} className="sr-only">
          {t('ayudaTeclado')}
        </p>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${ancho} ${alto}`}
          role="group"
          aria-label={etiqueta}
          aria-describedby={idAyuda}
          className="block h-auto w-full"
          onMouseLeave={() => setTooltip(null)}
        >
          {recuadro && (
            <rect
              x={recuadro.x}
              y={recuadro.y}
              width={recuadro.ancho}
              height={recuadro.alto}
              rx={4}
              fill="none"
              stroke="rgb(var(--border-strong))"
              strokeDasharray="3 3"
              aria-hidden="true"
            />
          )}
          {formas.map((f, i) => {
            const v = f.codigo ? valores.get(f.codigo) : undefined;
            const paso = v ? pasoEscala(v.visitantes, max) : 0;
            const conVisitas = paso > 0;
            const elegido = f.codigo !== null && f.codigo === seleccionado;
            if (!f.codigo) {
              return <path key={`sin-codigo-${i}`} d={f.d} fill={rellenoPaso(0)} stroke="rgb(var(--bg-surface))" strokeWidth={0.5} aria-hidden="true" />;
            }
            const codigo = f.codigo;
            const primera = formas.findIndex((g) => g.codigo === codigo) === i;
            return (
              <path
                key={`${codigo}-${i}`}
                d={f.d}
                data-codigo={primera ? codigo : undefined}
                data-paso={paso}
                fill={rellenoPaso(paso)}
                stroke={elegido ? 'rgb(var(--text-primary))' : 'rgb(var(--bg-surface))'}
                strokeWidth={elegido ? 1.5 : 0.5}
                role={primera ? 'button' : undefined}
                aria-hidden={primera ? undefined : true}
                tabIndex={primera ? (codigo === enfocable ? 0 : -1) : undefined}
                aria-label={primera ? etiquetaRegion(f) : undefined}
                aria-pressed={primera && onElegir ? elegido : undefined}
                aria-disabled={primera && !conVisitas ? true : undefined}
                className={`outline-none focus-visible:stroke-[rgb(var(--text-primary))] focus-visible:[stroke-width:2] ${conVisitas && onElegir ? 'cursor-pointer hover:opacity-80' : ''}`}
                onClick={() => {
                  if (onElegir && conVisitas) onElegir(codigo);
                }}
                onKeyDown={(e) => alTeclado(e, codigo)}
                onFocus={() => {
                  setActivo(codigo);
                  setTooltip({ codigo, x: f.centro[0], y: f.centro[1] });
                }}
                onBlur={() => setTooltip(null)}
                onMouseMove={(e) => alMoverRaton(e, codigo)}
              />
            );
          })}
        </svg>
        {tooltip && formaTooltip && (
          <div
            aria-hidden="true"
            data-testid="mapa-tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-tooltip px-2 py-1 text-xs text-fg-on-brand shadow-md"
            style={{ left: `${(tooltip.x / ancho) * 100}%`, top: `${(tooltip.y / alto) * 100}%` }}
          >
            <p className="font-semibold">{nombre(formaTooltip)}</p>
            {valorTooltip && valorTooltip.visitantes > 0 ? (
              <p className="tabular-nums">
                {t('tooltip', { n: valorTooltip.visitantes, v: nf.format(valorTooltip.visitantes), pct: pf.format(valorTooltip.pct) })}
              </p>
            ) : (
              <p>{t('sinVisitas')}</p>
            )}
          </div>
        )}
      </div>
      <Leyenda />
    </div>
  );
}

/** Menos ■■■■■ Más · ■ Sin visitas (Figma: leyenda bajo el mapa). */
export function Leyenda() {
  const t = useTranslations('analiticaWeb.geo.mapa');
  const pasos = Array.from({ length: PASOS_ESCALA }, (_, i) => i + 1);
  return (
    <div role="img" aria-label={t('leyendaAria')} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
      <span className="flex items-center gap-1.5">
        <span>{t('menos')}</span>
        {pasos.map((p) => (
          <span key={p} className="h-2.5 w-5 rounded-sm" style={{ background: rellenoPaso(p) }} />
        ))}
        <span>{t('mas')}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-sm" style={{ background: rellenoPaso(0) }} />
        <span>{t('sinVisitas')}</span>
      </span>
    </div>
  );
}
