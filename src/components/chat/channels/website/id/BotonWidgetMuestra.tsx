'use client';

/**
 * Botón flotante del chat tal como lo ve el visitante (Figma «BotonWidgetMuestra»,
 * página 02 Componentes › Chat — Widget): tamaño, redondeo, borde, sombra,
 * color, ícono en contorno o relleno, o la imagen propia que llena el botón.
 * Lo usan la vista previa del widget y «Vista previa del botón»: un solo dibujo.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Headphones, HelpCircle, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { WidgetStyle } from '@/lib/services/chatChannelsService';
import { esColorHex, esUrlImagenValida, sombraDelBoton } from './widgetLogica';

const ICONOS: Record<Exclude<WidgetStyle['iconType'], 'custom'>, LucideIcon> = {
  chat: MessageCircle,
  message: MessageSquare,
  support: Headphones,
  whatsapp: HelpCircle,
};

export function estiloBotonWidget(style: WidgetStyle): CSSProperties {
  return {
    width: style.buttonSize,
    height: style.buttonSize,
    borderRadius: style.borderRadius,
    border: `${style.borderWidth}px solid ${esColorHex(style.borderColor) ? style.borderColor : '#FFFFFF'}`,
    boxShadow: sombraDelBoton(style),
    backgroundColor: esColorHex(style.primaryColor) ? style.primaryColor : '#3B82F6',
    color: esColorHex(style.iconColor) ? style.iconColor : '#FFFFFF',
  };
}

/** Contenido del botón: la imagen propia (en círculo, llenando el botón) o el ícono. */
export function IconoBotonWidget({ style }: { style: WidgetStyle }): ReactNode {
  const iconoUrl = style.iconType === 'custom' && style.iconUrl && esUrlImagenValida(style.iconUrl) ? style.iconUrl : null;
  if (iconoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- imagen subida o enlazada por la organización
    return <img src={iconoUrl} alt="" className="size-full object-cover" />;
  }
  const Icono = style.iconType === 'custom' ? MessageCircle : (ICONOS[style.iconType] ?? MessageCircle);
  const relleno = style.iconStyle === 'filled' && style.iconType !== 'support' && style.iconType !== 'custom';
  return <Icono aria-hidden="true" className="size-[45%]" strokeWidth={1.75} fill={relleno ? 'currentColor' : 'none'} />;
}

/** Muestra estática del botón (sin posición): la usa «Vista previa del botón». */
export function BotonWidgetMuestra({ style, className }: { style: WidgetStyle; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center overflow-hidden', className)} style={estiloBotonWidget(style)}>
      <IconoBotonWidget style={style} />
    </span>
  );
}
