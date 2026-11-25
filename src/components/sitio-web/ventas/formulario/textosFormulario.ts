'use client';

/**
 * Piezas comunes del configurador «Formulario del checkout» (Parte F): el ícono de cada campo y los
 * textos del ERP (namespace `formularioCheckout` de messages/*.json, en es/en/fr/pt).
 */
import { useTranslations } from 'next-intl';
import { Building2, Home, Landmark, Mail, MapPin, MapPinned, MessageSquare, Smartphone, User, type LucideIcon } from 'lucide-react';
import type { ClaveCampoFormulario } from '@/lib/website/formularioCheckout';

export const ICONO_CAMPO: Readonly<Record<ClaveCampoFormulario, LucideIcon>> = {
  email: Mail,
  celular: Smartphone,
  nombre: User,
  factura: Building2,
  direccion: MapPin,
  complemento: Home,
  ciudad: MapPinned,
  barrio: Landmark,
  notas: MessageSquare,
};

export function useTextosFormulario() {
  return useTranslations('formularioCheckout');
}
