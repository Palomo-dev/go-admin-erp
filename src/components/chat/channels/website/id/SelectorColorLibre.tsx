'use client';

/**
 * «Color principal» con color libre (Figma «SelectorColorLibre», diseños
 * 94-chat-recuperado-canales 14, 17, 18 y 24): saturación/brillo, tono y
 * hexadecimal (#RRGGBB, se valida al salir del campo). Los 9 colores sugeridos
 * son atajos y viven SOLO aquí dentro (decisión del dueño); el anillo de
 * colores marca «Personalizado» cuando el color no es uno de ellos. El
 * contraste se calcula contra el color del ícono (AA = 4,5:1).
 *
 * Se abre al tocar la muestra o el campo: popover en escritorio, hoja inferior
 * con «Listo» en móvil. Mientras se elige, `onCambio` pinta la vista previa en
 * vivo; al cerrar, `onConfirmar` guarda.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as PointerEventReact } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, TriangleAlert, X } from 'lucide-react';
import { clasesBoton, useEsEscritorio } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/utils/Utils';
import { COLORES_SUGERIDOS, CONTRASTE_AA, contraste, esColorHex, hexAHsv, hsvAHex, normalizarHex, type Hsv } from './widgetLogica';

const ARCOIRIS = 'conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)';
const TONOS = 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)';

export interface SelectorColorLibreProps {
  id?: string;
  etiqueta: string;
  valor: string;
  /** Color del ícono, para el contraste. */
  colorIcono: string;
  onCambio: (hex: string) => void;
  onConfirmar: (hex: string) => void;
}

export function SelectorColorLibre({ id, etiqueta, valor, colorIcono, onCambio, onConfirmar }: SelectorColorLibreProps) {
  const t = useTranslations('chatModulo.canales.widget.color');
  const escritorio = useEsEscritorio();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(valor);
  const envoltorio = useRef<HTMLDivElement>(null);
  useEffect(() => setTexto(valor), [valor]);

  const color = esColorHex(valor) ? valor.toUpperCase() : '#4361EE';

  const cerrar = () => {
    setAbierto(false);
    onConfirmar(color);
  };

  const confirmarTexto = () => {
    const hex = normalizarHex(texto);
    if (hex) {
      onCambio(hex);
      onConfirmar(hex);
    } else setTexto(valor);
  };

  const panel = (
    <PanelColor
      color={color}
      colorIcono={colorIcono}
      onCambio={(hex) => {
        setTexto(hex);
        onCambio(hex);
      }}
      grande={!escritorio}
    />
  );

  const campo = (
    <div ref={envoltorio} className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t('abrir', { etiqueta })}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className="size-10 shrink-0 rounded-lg border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        style={{ backgroundColor: color }}
      />
      <Input
        id={id}
        value={texto}
        readOnly={!escritorio}
        spellCheck={false}
        autoComplete="off"
        onClick={() => setAbierto(true)}
        onFocus={() => escritorio && setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          const hex = normalizarHex(e.target.value);
          if (hex) onCambio(hex);
        }}
        onBlur={confirmarTexto}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmarTexto();
            setAbierto(false);
          }
        }}
        aria-invalid={!normalizarHex(texto) || undefined}
        className="font-mono uppercase"
      />
    </div>
  );

  if (!escritorio) {
    return (
      <>
        {campo}
        <Sheet open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
          <SheetContent side="bottom" className="rounded-t-2xl border-line bg-surface p-0 text-fg [&>button]:hidden">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            <div className="flex items-center justify-between px-4 pb-3 pt-3">
              <SheetTitle className="text-lg font-semibold text-fg">{etiqueta}</SheetTitle>
              <button type="button" aria-label={t('cerrar')} onClick={cerrar} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover">
                <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-4 pb-4">{panel}</div>
            <div className="px-4 pb-6">
              <button type="button" onClick={cerrar} className={clasesBoton({ anchoCompleto: true, tamano: 'lg' })}>
                {t('listo')}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
      <PopoverAnchor asChild>{campo}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        aria-label={etiqueta}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (envoltorio.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="w-[288px] rounded-xl border-line bg-surface p-3 text-fg shadow-lg"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

function PanelColor({ color, colorIcono, onCambio, grande }: { color: string; colorIcono: string; onCambio: (hex: string) => void; grande: boolean }) {
  const t = useTranslations('chatModulo.canales.widget.color');
  const locale = useLocale();
  const [hsv, setHsv] = useState<Hsv>(() => hexAHsv(color));
  const [hex, setHex] = useState(color);
  // Si el color cambia desde fuera (otro campo, un sugerido), se recalcula; no
  // mientras se arrastra (el tono se perdería en grises y negros).
  useEffect(() => {
    if (hsvAHex(hsv) !== color) setHsv(hexAHsv(color));
    setHex(color);
  }, [color]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = (nuevo: Hsv) => {
    setHsv(nuevo);
    const h = hsvAHex(nuevo);
    setHex(h);
    onCambio(h);
  };

  const arrastrar = (e: PointerEventReact<HTMLDivElement>, mover: (x: number, y: number) => void) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const en = (ev: { clientX: number; clientY: number }) =>
      mover(Math.min(1, Math.max(0, (ev.clientX - caja.left) / caja.width)), Math.min(1, Math.max(0, (ev.clientY - caja.top) / caja.height)));
    e.currentTarget.setPointerCapture?.(e.pointerId);
    en(e);
    const el = e.currentTarget;
    const alMover = (ev: PointerEvent) => en(ev);
    const alSoltar = () => {
      el.removeEventListener('pointermove', alMover);
      el.removeEventListener('pointerup', alSoltar);
    };
    el.addEventListener('pointermove', alMover);
    el.addEventListener('pointerup', alSoltar);
  };

  const teclasArea = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] }[e.key];
    if (!d) return;
    e.preventDefault();
    aplicar({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + d[0])), v: Math.min(1, Math.max(0, hsv.v + d[1])) });
  };
  const teclasTono = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.shiftKey ? 10 : 2;
    const d = { ArrowLeft: -paso, ArrowDown: -paso, ArrowRight: paso, ArrowUp: paso }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    aplicar({ ...hsv, h: Math.min(359, Math.max(0, hsv.h + d)) });
  };

  const sugerido = COLORES_SUGERIDOS.find((c) => c.toUpperCase() === color.toUpperCase());
  const ratio = contraste(color, esColorHex(colorIcono) ? colorIcono : '#FFFFFF');
  const cumple = ratio >= CONTRASTE_AA;
  const icono = (colorIcono || '').toUpperCase() === '#FFFFFF' || !esColorHex(colorIcono) ? t('blanco') : colorIcono.toUpperCase();
  const textoRatio = ratio.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="flex flex-col gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('saturacionBrillo')}
        aria-valuetext={hex}
        aria-valuenow={Math.round(hsv.s * 100)}
        onPointerDown={(e) => arrastrar(e, (x, y) => aplicar({ ...hsv, s: x, v: 1 - y }))}
        onKeyDown={teclasArea}
        className={cn('relative w-full cursor-crosshair touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', grande ? 'h-[152px]' : 'h-[148px]')}
        style={{ backgroundColor: hsvAHex({ h: hsv.h, s: 1, v: 1 }), backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('tono')}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(e) => arrastrar(e, (x) => aplicar({ ...hsv, h: Math.min(359, x * 360) }))}
        onKeyDown={teclasTono}
        className="relative h-2.5 w-full cursor-pointer touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={{ backgroundImage: TONOS }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hsvAHex({ h: hsv.h, s: 1, v: 1 }) }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-9 shrink-0 rounded-lg border border-line" style={{ backgroundColor: hex }} />
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-brand bg-surface px-2.5 focus-within:ring-2 focus-within:ring-brand">
          <span className="text-[11px] font-medium text-fg-muted">HEX</span>
          <input
            value={hex}
            aria-label={t('hex')}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setHex(e.target.value);
              const n = normalizarHex(e.target.value);
              if (n) {
                setHsv(hexAHsv(n));
                onCambio(n);
              }
            }}
            onBlur={() => setHex(normalizarHex(hex) ?? color)}
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] uppercase text-fg outline-none"
          />
        </label>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-xs font-medium text-fg-secondary">{t('sugeridos')}</p>
        <div className={cn('flex flex-wrap items-center', grande ? 'gap-2' : 'gap-1.5')}>
          {COLORES_SUGERIDOS.map((c) => {
            const activo = c.toUpperCase() === color.toUpperCase();
            return (
              <button
                key={c}
                type="button"
                aria-label={t('usar', { color: c })}
                aria-pressed={activo}
                onClick={() => {
                  setHsv(hexAHsv(c));
                  setHex(c);
                  onCambio(c);
                }}
                className={cn(
                  'shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                  grande ? 'size-[26px]' : 'size-5',
                  activo && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
                )}
                style={{ backgroundColor: c }}
              />
            );
          })}
          <span
            role="img"
            aria-label={sugerido ? t('sugerido') : t('personalizado')}
            title={sugerido ? undefined : t('personalizado')}
            className={cn('shrink-0 rounded-full p-[3px]', grande ? 'size-[26px]' : 'size-5', !sugerido && 'ring-2 ring-fg ring-offset-1 ring-offset-surface')}
            style={{ backgroundImage: ARCOIRIS }}
          >
            <span className="block size-full rounded-full border-2 border-surface" style={{ backgroundColor: sugerido ? 'transparent' : hex }} />
          </span>
        </div>
        <p className={cn('flex items-start gap-1.5 text-xs leading-4', cumple ? 'text-success-text' : 'text-warning-text')}>
          {cumple ? <Check aria-hidden="true" className="mt-px size-3.5 shrink-0" /> : <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />}
          <span>
            {t(cumple ? 'contrasteAA' : 'contrasteBajo', { origen: sugerido ? t('sugerido') : t('personalizado'), ratio: textoRatio, icono })}
          </span>
        </p>
      </div>
    </div>
  );
}
