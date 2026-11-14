'use client';

/**
 * «Más opciones de estilo» del chat del sitio web, con el lenguaje del diseño
 * aprobado (Figma 91-chat-24) y en 4 idiomas. Reemplaza en esta página a
 * `WidgetStyleSection` (que sigue en Configuración › CRM) y edita los mismos
 * campos de `brand_config.style` que lee el widget público: colores sugeridos,
 * color e ícono del botón (o imagen propia), contorno/relleno, tamaño exacto,
 * redondeo, borde y sombra. Las listas y casillas guardan al elegir; los
 * campos de texto y número, al salir del campo.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Headphones, HelpCircle, Image as ImageIcon, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { CampoNumero, FormField, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import type { WidgetStyle } from '@/lib/services/chatChannelsService';
import { COLORES_SUGERIDOS, LIMITES_WIDGET, entreLimites, esColorHex, esUrlImagenValida } from './widgetLogica';

/** El valor `whatsapp` es histórico: el widget pinta un círculo con «?» (ayuda). */
const ICONOS: { valor: WidgetStyle['iconType']; icono: LucideIcon }[] = [
  { valor: 'chat', icono: MessageCircle },
  { valor: 'message', icono: MessageSquare },
  { valor: 'support', icono: Headphones },
  { valor: 'whatsapp', icono: HelpCircle },
  { valor: 'custom', icono: ImageIcon },
];

type Sombra = 'none' | WidgetStyle['shadowStrength'];

export function EstiloAvanzadoWidget({ estilo, onGuardar }: { estilo: WidgetStyle; onGuardar: (s: WidgetStyle) => Promise<void> }) {
  const t = useTranslations('chatModulo.canales.widget.mas.estilo');
  const [colorIcono, setColorIcono] = useState(estilo.iconColor);
  const [colorBorde, setColorBorde] = useState(estilo.borderColor);
  const [iconoUrl, setIconoUrl] = useState(estilo.iconUrl ?? '');
  const [numeros, setNumeros] = useState({ tamano: estilo.buttonSize, radio: estilo.borderRadius, borde: estilo.borderWidth });

  useEffect(() => {
    setColorIcono(estilo.iconColor);
    setColorBorde(estilo.borderColor);
    setIconoUrl(estilo.iconUrl ?? '');
    setNumeros({ tamano: estilo.buttonSize, radio: estilo.borderRadius, borde: estilo.borderWidth });
  }, [estilo]);

  const guardar = (parcial: Partial<WidgetStyle>) => onGuardar({ ...estilo, ...parcial }).catch(() => undefined);
  const urlInvalida = !esUrlImagenValida(iconoUrl);
  const sombra: Sombra = estilo.shadowEnabled ? estilo.shadowStrength : 'none';

  const guardarColor = (clave: 'iconColor' | 'borderColor', valor: string) => {
    if (esColorHex(valor) && valor.toLowerCase() !== estilo[clave].toLowerCase()) guardar({ [clave]: valor });
  };

  const guardarNumero = (clave: 'tamano' | 'radio' | 'borde') => {
    const limites = { tamano: LIMITES_WIDGET.tamano, radio: LIMITES_WIDGET.radio, borde: LIMITES_WIDGET.borde }[clave];
    const actual = { tamano: estilo.buttonSize, radio: estilo.borderRadius, borde: estilo.borderWidth }[clave];
    const n = entreLimites(numeros[clave], limites, actual);
    setNumeros((x) => ({ ...x, [clave]: n }));
    if (n === actual) return;
    if (clave === 'tamano') guardar({ buttonSize: n });
    if (clave === 'radio') guardar({ borderRadius: n });
    if (clave === 'borde') guardar({ borderWidth: n });
  };

  const campoColor = (etiqueta: string, valor: string, cambiar: (v: string) => void, clave: 'iconColor' | 'borderColor') => (
    <FormField etiqueta={etiqueta} error={valor && !esColorHex(valor) ? t('colorInvalido') : null}>
      {(campo) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={etiqueta}
            value={esColorHex(valor) ? valor : '#ffffff'}
            onChange={(e) => cambiar(e.target.value)}
            onBlur={() => guardarColor(clave, valor)}
            className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
          />
          <Input id={campo.id} value={valor} onChange={(e) => cambiar(e.target.value)} onBlur={() => guardarColor(clave, valor)} className="font-mono uppercase" />
        </div>
      )}
    </FormField>
  );

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-fg">{t('coloresSugeridos')}</span>
        <div className="flex flex-wrap gap-2">
          {COLORES_SUGERIDOS.map((c) => {
            const activo = c.toLowerCase() === estilo.primaryColor.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                aria-label={t('usarColor', { color: c })}
                aria-pressed={activo}
                onClick={() => !activo && guardar({ primaryColor: c })}
                className={cn(
                  'size-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                  activo ? 'scale-110 border-fg' : 'border-transparent hover:scale-105',
                )}
                style={{ backgroundColor: c }}
              />
            );
          })}
        </div>
      </div>

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
                onClick={() => !activo && guardar({ iconType: valor })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activo ? 'border-brand bg-brand-tint font-medium text-brand-deep' : 'border-line text-fg-secondary hover:bg-subtle',
                )}
              >
                <Icono aria-hidden="true" className="size-5" strokeWidth={1.5} />
                {t(`iconos.${valor}`)}
              </button>
            );
          })}
        </div>
      </div>

      {estilo.iconType === 'custom' && (
        <FormField etiqueta={t('iconoUrl')} ayuda={t('iconoUrlAyuda')} error={urlInvalida ? t('urlInvalida') : null}>
          <Input
            value={iconoUrl}
            placeholder="https://…"
            inputMode="url"
            onChange={(e) => setIconoUrl(e.target.value)}
            onBlur={() => {
              const v = iconoUrl.trim();
              if (esUrlImagenValida(v) && v !== (estilo.iconUrl ?? '')) guardar({ iconUrl: v || undefined });
            }}
          />
        </FormField>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {campoColor(t('colorIcono'), colorIcono, setColorIcono, 'iconColor')}
        <FormField etiqueta={t('relleno')} ayuda={estilo.iconType === 'support' ? t('rellenoSoporte') : undefined}>
          {(campo) => (
            <SegmentedControl
              id={campo.id}
              tamano="sm"
              etiqueta={t('relleno')}
              valor={estilo.iconStyle === 'filled' ? 'filled' : 'outline'}
              deshabilitado={estilo.iconType === 'support' || estilo.iconType === 'custom'}
              onValorChange={(v) => v !== estilo.iconStyle && guardar({ iconStyle: v })}
              opciones={[
                { valor: 'outline', etiqueta: t('rellenos.outline') },
                { valor: 'filled', etiqueta: t('rellenos.filled') },
              ]}
            />
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField etiqueta={t('tamanoExacto')} ayuda={t('rango', { min: LIMITES_WIDGET.tamano.min, max: LIMITES_WIDGET.tamano.max })}>
          <CampoNumero
            decimales={0}
            minimo={LIMITES_WIDGET.tamano.min}
            maximo={LIMITES_WIDGET.tamano.max}
            sufijo="px"
            valor={numeros.tamano}
            onValorChange={(v) => setNumeros((x) => ({ ...x, tamano: v ?? x.tamano }))}
            onBlur={() => guardarNumero('tamano')}
          />
        </FormField>
        <FormField etiqueta={t('radio')} ayuda={t('rango', { min: LIMITES_WIDGET.radio.min, max: LIMITES_WIDGET.radio.max })}>
          <CampoNumero
            decimales={0}
            minimo={LIMITES_WIDGET.radio.min}
            maximo={LIMITES_WIDGET.radio.max}
            sufijo="px"
            valor={numeros.radio}
            onValorChange={(v) => setNumeros((x) => ({ ...x, radio: v ?? x.radio }))}
            onBlur={() => guardarNumero('radio')}
          />
        </FormField>
        <FormField etiqueta={t('borde')} ayuda={t('rango', { min: LIMITES_WIDGET.borde.min, max: LIMITES_WIDGET.borde.max })}>
          <CampoNumero
            decimales={0}
            minimo={LIMITES_WIDGET.borde.min}
            maximo={LIMITES_WIDGET.borde.max}
            sufijo="px"
            valor={numeros.borde}
            onValorChange={(v) => setNumeros((x) => ({ ...x, borde: v ?? x.borde }))}
            onBlur={() => guardarNumero('borde')}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {estilo.borderWidth > 0 && campoColor(t('colorBorde'), colorBorde, setColorBorde, 'borderColor')}
        <FormField etiqueta={t('sombra')}>
          {(campo) => (
            <Select
              value={sombra}
              onValueChange={(v) =>
                v !== sombra && guardar(v === 'none' ? { shadowEnabled: false } : { shadowEnabled: true, shadowStrength: v as WidgetStyle['shadowStrength'] })
              }
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
  );
}
