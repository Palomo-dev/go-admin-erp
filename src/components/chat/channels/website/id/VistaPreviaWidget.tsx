'use client';

/**
 * Vista previa en vivo del chat del sitio web (Figma 91-chat-24): ventana
 * abierta con logo, título, bienvenida, botones rápidos y el formulario
 * «Antes de empezar» según los datos que se piden; el botón flotante debajo.
 *
 * Reproduce lo que pinta el widget público (`supabase/functions/chat-widget/
 * cliente.ts`): esquina y márgenes horizontal y vertical en px reales, tamaño,
 * redondeo, borde, sombra, color e ícono del botón (o imagen propia), logo de
 * la cabecera (o el de la organización), vista inicial (chat, formulario
 * primero o preguntas frecuentes) y botones que abren un enlace. Es solo
 * dibujo: no envía nada.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Headphones, HelpCircle, MessageCircle, MessageSquare, RotateCcw, Send, X, type LucideIcon } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { BrandConfig, CollectIdentity, WidgetStyle } from '@/lib/services/chatChannelsService';
import { botonAbreEnlace, esColorHex, esUrlImagenValida, sombraDelBoton } from './widgetLogica';

const ICONOS: Record<Exclude<WidgetStyle['iconType'], 'custom'>, LucideIcon> = {
  chat: MessageCircle,
  message: MessageSquare,
  support: Headphones,
  whatsapp: HelpCircle,
};

export function VistaPreviaWidget({ config, datos, logoOrganizacion }: { config: BrandConfig; datos: CollectIdentity; logoOrganizacion?: string | null }) {
  const t = useTranslations('chatModulo.canales.widget.vistaPrevia');
  const tm = useTranslations('chatModulo.canales.widget.mas.vistaPrevia');
  const [abierto, setAbierto] = useState(true);
  const [datosEnviados, setDatosEnviados] = useState(false);
  const [clave, setClave] = useState(0);

  const { style, position, behavior } = config;
  const color = esColorHex(style.primaryColor) ? style.primaryColor : '#3B82F6';
  const lado = position.side === 'left' ? 'left' : 'right';
  const vertical = position.vertical === 'top' ? 'top' : 'bottom';
  const tamano = style.buttonSize;
  const pide = (['name', 'phone', 'email'] as const).filter((c) => datos[c]);
  const botones = behavior.showQuickActions ? (behavior.quickActions ?? []) : [];
  const formularioPrimero = behavior.openDefaultView === 'form' && pide.length > 0 && !datosEnviados;
  const enLista = behavior.openDefaultView === 'faq';
  const logoGuardado = config.logo_url && esUrlImagenValida(config.logo_url) ? config.logo_url : null;
  const logo = logoGuardado ?? (logoOrganizacion && esUrlImagenValida(logoOrganizacion) ? logoOrganizacion : null);
  const iconoUrl = style.iconType === 'custom' && style.iconUrl && esUrlImagenValida(style.iconUrl) ? style.iconUrl : null;
  const Icono = style.iconType === 'custom' ? MessageCircle : ICONOS[style.iconType] ?? MessageCircle;
  const relleno = style.iconStyle === 'filled' && style.iconType !== 'support';
  const titulo = behavior.title || t('tituloPorDefecto');

  const formulario = pide.length > 0 && (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <p className="text-xs font-semibold text-fg">{t('antesDeEmpezar')}</p>
      {pide.map((c) => (
        <div key={c} className="rounded-md border border-line px-2.5 py-1.5 text-xs text-fg-muted">
          {t(`campos.${c}`)}
        </div>
      ))}
      <button type="button" onClick={() => setDatosEnviados(true)} className="rounded-md py-2 text-center text-xs font-medium text-white" style={{ backgroundColor: color }}>
        {t('empezar')}
      </button>
    </div>
  );

  const ventana = abierto && (
    <div
      className="absolute z-10 flex max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg"
      style={{
        [lado]: position.offsetX,
        [vertical]: position.offsetY + tamano + 14,
        width: 320,
        maxWidth: `calc(100% - ${position.offsetX * 2}px)`,
        maxHeight: `calc(100% - ${position.offsetY + tamano + 24}px)`,
      }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ backgroundColor: color }}>
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 text-sm font-bold">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen externa elegida por la organización
            <img src={logo} alt="" className="size-full bg-white object-cover" />
          ) : (
            titulo.charAt(0).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="text-xs opacity-90">{t('enLinea')}</p>
        </div>
        <button type="button" aria-label={t('cerrar')} onClick={() => setAbierto(false)} className="rounded p-0.5 hover:bg-white/15">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-canvas p-3">
        {formularioPrimero ? (
          formulario
        ) : (
          <>
            {behavior.welcomeMessage && (
              <div className="max-w-[85%] rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg">
                {behavior.welcomeMessage}
                <span className="mt-1 block text-right text-[11px] text-fg-muted">{t('ahora')}</span>
              </div>
            )}
            {botones.length > 0 && (
              <div className={cn('flex gap-1.5', enLista ? 'flex-col' : 'flex-wrap')}>
                {botones.map((b) => (
                  <span
                    key={b.label}
                    className={cn('inline-flex items-center gap-1 border bg-surface px-2.5 py-1 text-xs font-medium', enLista ? 'rounded-lg' : 'rounded-full')}
                    style={{ borderColor: color, color }}
                  >
                    {b.label}
                    {botonAbreEnlace(b.action) && <ExternalLink aria-label={tm('abreEnlace')} className="size-3" />}
                  </span>
                ))}
              </div>
            )}
            {!datosEnviados && behavior.openDefaultView !== 'form' && formulario}
          </>
        )}
      </div>
      {!formularioPrimero && (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
          <span className="flex-1 truncate rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-muted">{tm('escribe')}</span>
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg text-white" style={{ backgroundColor: color }}>
            <Send className="size-3.5" />
          </span>
        </div>
      )}
    </div>
  );

  const lanzador = (
    <button
      type="button"
      aria-label={abierto ? t('cerrar') : t('abrir')}
      onClick={() => setAbierto((a) => !a)}
      className="absolute flex items-center justify-center overflow-hidden"
      style={{
        [lado]: position.offsetX,
        [vertical]: position.offsetY,
        width: tamano,
        height: tamano,
        borderRadius: style.borderRadius,
        border: `${style.borderWidth}px solid ${esColorHex(style.borderColor) ? style.borderColor : '#FFFFFF'}`,
        boxShadow: sombraDelBoton(style),
        backgroundColor: color,
        color: esColorHex(style.iconColor) ? style.iconColor : '#FFFFFF',
      }}
    >
      {iconoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen externa elegida por la organización
        <img src={iconoUrl} alt="" className="size-3/5 object-contain" />
      ) : (
        <Icono aria-hidden="true" className="size-6" strokeWidth={1.75} fill={relleno ? 'currentColor' : 'none'} />
      )}
    </button>
  );

  return (
    <section aria-label={t('titulo')} className="flex flex-col gap-3">
      <p className="text-xs font-medium text-fg-muted">{t('titulo')}</p>
      <div key={clave} className="relative min-h-[560px] overflow-hidden rounded-xl border border-line bg-subtle p-4">
        <div aria-hidden="true" className="flex flex-col gap-2">
          <span className="h-2 w-3/5 rounded-full bg-line" />
          <span className="h-2 w-4/5 rounded-full bg-line" />
          <span className="h-2 w-2/5 rounded-full bg-line" />
        </div>
        {ventana}
        {lanzador}
      </div>
      <p className="text-xs text-fg-muted">{tm('escalaReal')}</p>
      <button
        type="button"
        onClick={() => {
          setAbierto(true);
          setDatosEnviados(false);
          setClave((k) => k + 1);
        }}
        className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start' })}
      >
        <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('reiniciar')}
      </button>
    </section>
  );
}
