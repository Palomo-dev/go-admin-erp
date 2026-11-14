'use client';

/**
 * «Más opciones de estilo» del chat del sitio web (diseños aprobados
 * 94-chat-recuperado-canales 01, 14 a 16, 19 a 21): ícono del botón (o imagen
 * propia subida o enlazada), color y estilo del ícono, tamaño exacto,
 * redondeo, borde y sombra, con «Vista previa del botón» siempre a la vista
 * (columna fija en escritorio, barra fija en móvil) y en vivo antes de guardar.
 *
 * Es controlado: `estilo` es el borrador que lleva `AparienciaWidget`;
 * `onCambio` lo actualiza (vista previa en vivo) y `onGuardar` lo guarda en
 * `brand_config.style`, el mismo formato que lee el widget público. Listas y
 * botones guardan al elegir; números y colores, al salir del campo. Los
 * colores sugeridos viven solo en el selector de «Color principal».
 */
import { useTranslations } from 'next-intl';
import { Headphones, HelpCircle, Image as ImageIcon, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { CampoNumero, FormField, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import type { WidgetStyle } from '@/lib/services/chatChannelsService';
import { LIMITES_WIDGET, MAX_MB_IMAGEN_WIDGET, entreLimites, esColorHex, normalizarHex } from './widgetLogica';
import { SubidaImagenUnica } from './SubidaImagenUnica';
import { VistaPreviaBoton } from './VistaPreviaBoton';

/** El valor `whatsapp` es histórico: el widget pinta un círculo con «?» (ayuda). */
const ICONOS: { valor: WidgetStyle['iconType']; icono: LucideIcon }[] = [
  { valor: 'chat', icono: MessageCircle },
  { valor: 'message', icono: MessageSquare },
  { valor: 'support', icono: Headphones },
  { valor: 'whatsapp', icono: HelpCircle },
  { valor: 'custom', icono: ImageIcon },
];

type Sombra = 'none' | WidgetStyle['shadowStrength'];

export interface EstiloAvanzadoWidgetProps {
  /** Borrador en vivo (lo que se ve en las vistas previas). */
  estilo: WidgetStyle;
  /** Lo guardado: para no guardar sin cambios. */
  guardado: WidgetStyle;
  onCambio: (parcial: Partial<WidgetStyle>) => void;
  onGuardar: (parcial?: Partial<WidgetStyle>) => Promise<void>;
  /** Carpeta de subidas del widget (`<org>/chat-widget/<canal>`). */
  carpeta: string | null;
  organizacionId: number | string | null | undefined;
}

export function EstiloAvanzadoWidget({ estilo, guardado, onCambio, onGuardar, carpeta, organizacionId }: EstiloAvanzadoWidgetProps) {
  const t = useTranslations('chatModulo.canales.widget.mas.estilo');
  const tn = useTranslations('chatModulo.canales.widget.subida');
  const guardar = (parcial?: Partial<WidgetStyle>) => onGuardar(parcial).catch(() => undefined);
  const sombra: Sombra = estilo.shadowEnabled ? estilo.shadowStrength : 'none';
  const imagenPropia = estilo.iconType === 'custom';

  const confirmarColor = (clave: 'iconColor' | 'borderColor') => {
    const hex = normalizarHex(estilo[clave]);
    if (!hex) return onCambio({ [clave]: guardado[clave] });
    if (hex !== guardado[clave].toUpperCase()) guardar({ [clave]: hex });
  };

  const confirmarNumero = (clave: 'buttonSize' | 'borderRadius' | 'borderWidth', limites: { min: number; max: number }) => {
    const n = entreLimites(estilo[clave], limites, guardado[clave]);
    if (n !== estilo[clave]) onCambio({ [clave]: n });
    if (n !== guardado[clave]) guardar({ [clave]: n });
  };

  const campoColor = (etiqueta: string, clave: 'iconColor' | 'borderColor', deshabilitado = false) => (
    <FormField
      etiqueta={etiqueta}
      error={!deshabilitado && estilo[clave] && !esColorHex(estilo[clave]) ? t('colorInvalido') : null}
      className={cn(deshabilitado && '[&_label]:text-fg-muted')}
    >
      {(campo) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={etiqueta}
            disabled={deshabilitado}
            value={esColorHex(estilo[clave]) ? estilo[clave].toLowerCase() : '#ffffff'}
            onChange={(e) => onCambio({ [clave]: e.target.value.toUpperCase() })}
            onBlur={() => confirmarColor(clave)}
            className="size-10 shrink-0 cursor-pointer appearance-none rounded-lg border border-line bg-surface p-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[7px] [&::-webkit-color-swatch]:border-0"
          />
          <Input
            id={campo.id}
            value={estilo[clave]}
            disabled={deshabilitado}
            spellCheck={false}
            onChange={(e) => onCambio({ [clave]: e.target.value })}
            onBlur={() => confirmarColor(clave)}
            className="font-mono uppercase"
          />
        </div>
      )}
    </FormField>
  );

  const numero = (etiqueta: string, clave: 'buttonSize' | 'borderRadius' | 'borderWidth', limites: { min: number; max: number }) => (
    <FormField etiqueta={etiqueta} ayuda={t('rango', { min: limites.min, max: limites.max })}>
      <CampoNumero
        decimales={0}
        minimo={limites.min}
        maximo={limites.max}
        sufijo="px"
        valor={estilo[clave]}
        onValorChange={(v) => v !== null && v !== undefined && onCambio({ [clave]: v })}
        onBlur={() => confirmarNumero(clave, limites)}
      />
    </FormField>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_232px] lg:gap-6">
      {/* Móvil: barra fija mientras se baja por estas opciones. */}
      <VistaPreviaBoton variante="barra" style={estilo} className="sticky top-0 z-10 -mx-4 rounded-none sm:-mx-5 lg:hidden" />

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span id="icono-boton-widget" className="text-[13px] font-medium text-fg">
            {t('icono')}
          </span>
          <div role="radiogroup" aria-labelledby="icono-boton-widget" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ICONOS.map(({ valor, icono: Icono }) => {
              const activo = estilo.iconType === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => {
                    if (activo) return;
                    onCambio({ iconType: valor });
                    guardar({ iconType: valor });
                  }}
                  className={cn(
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    activo ? 'border-line-brand bg-brand-tint font-medium text-brand-deep' : 'border-line text-fg-secondary hover:bg-hover',
                  )}
                >
                  <Icono aria-hidden="true" className="size-5" strokeWidth={1.5} />
                  {t(`iconos.${valor}`)}
                </button>
              );
            })}
          </div>
        </div>

        {imagenPropia && (
          <FormField etiqueta={tn('imagenBoton')}>
            {(campo) => (
              <SubidaImagenUnica
                clase="icono"
                recorteCirculo
                idCampo={campo.id}
                ayuda={tn('imagenBotonAyuda', { mb: MAX_MB_IMAGEN_WIDGET })}
                valor={estilo.iconUrl ?? ''}
                carpeta={carpeta}
                organizacionId={organizacionId}
                onGuardar={async (url) => {
                  onCambio({ iconUrl: url || undefined });
                  await onGuardar({ iconUrl: url || undefined });
                }}
              />
            )}
          </FormField>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {campoColor(t('colorIcono'), 'iconColor', imagenPropia)}
          <FormField
            etiqueta={t('relleno')}
            ayuda={estilo.iconType === 'support' ? t('rellenoSoporte') : undefined}
            className={cn(imagenPropia && '[&_label]:text-fg-muted')}
          >
            {(campo) => (
              <SegmentedControl
                id={campo.id}
                tamano="sm"
                etiqueta={t('relleno')}
                valor={estilo.iconStyle === 'filled' ? 'filled' : 'outline'}
                deshabilitado={estilo.iconType === 'support' || imagenPropia}
                onValorChange={(v) => {
                  if (v === estilo.iconStyle) return;
                  onCambio({ iconStyle: v });
                  guardar({ iconStyle: v });
                }}
                opciones={[
                  { valor: 'outline', etiqueta: t('rellenos.outline') },
                  { valor: 'filled', etiqueta: t('rellenos.filled') },
                ]}
              />
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {numero(t('tamanoExacto'), 'buttonSize', LIMITES_WIDGET.tamano)}
          {numero(t('radio'), 'borderRadius', LIMITES_WIDGET.radio)}
          {numero(t('borde'), 'borderWidth', LIMITES_WIDGET.borde)}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {campoColor(t('colorBorde'), 'borderColor')}
          <FormField etiqueta={t('sombra')}>
            {(campo) => (
              <Select
                value={sombra}
                onValueChange={(v) => {
                  if (v === sombra) return;
                  const parcial: Partial<WidgetStyle> = v === 'none' ? { shadowEnabled: false } : { shadowEnabled: true, shadowStrength: v as WidgetStyle['shadowStrength'] };
                  onCambio(parcial);
                  guardar(parcial);
                }}
              >
                <SelectTrigger id={campo.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['none', 'light', 'medium', 'strong'] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`sombras.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      </div>

      {/* Escritorio: columna fija (16 px) mientras se baja. */}
      <div className="hidden lg:block">
        <VistaPreviaBoton variante="tarjeta" style={estilo} className="sticky top-4" />
      </div>
    </div>
  );
}
