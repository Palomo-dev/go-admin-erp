'use client';

import * as React from 'react';
import { Facebook, Globe, Instagram, Mail, MessageCircle, Send, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { FONDO_CANAL, type Canal } from './canal';

export type { Canal } from './canal';
export { canalDeTipo, CANALES } from './canal';

export interface CanalIconoProps {
  canal: Canal;
  /** Lado del cuadro en píxeles (el ícono ocupa ~60 %). Por defecto 20. */
  size?: number;
  className?: string;
}

const ICONO: Record<Canal, LucideIcon> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  web: Globe,
  telegram: Send,
  correo: Mail,
};

/**
 * Ícono del canal (Figma `91-chat-00`): cuadro redondeado del color del canal
 * con el ícono en blanco. Lo usan la bandeja, la vista completa, Canales y
 * cualquier pantalla del Chat que muestre un canal.
 */
export function CanalIcono({ canal, size = 20, className }: CanalIconoProps) {
  const t = useTranslations('chatUi.canales');
  const Icono = ICONO[canal] ?? Globe;
  const lado = Math.max(10, Math.round(size));
  const icono = Math.max(8, Math.round(lado * 0.6));
  return (
    <span
      role="img"
      aria-label={t(canal)}
      title={t(canal)}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md text-white', FONDO_CANAL[canal] ?? FONDO_CANAL.web, className)}
      style={{ width: lado, height: lado }}
    >
      <Icono aria-hidden="true" style={{ width: icono, height: icono }} strokeWidth={2.25} />
    </span>
  );
}
