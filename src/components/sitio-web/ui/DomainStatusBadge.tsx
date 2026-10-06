'use client';

import { CircleX, Clock, Loader2, Lock, TimerReset, TriangleAlert, type LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { useTextosComun } from './textos';
import { DIAS_AVISO_VENCIMIENTO, resolverEstadoDominio, type EstadoDominio } from './estadoDominio';

/**
 * Estado de un dominio (Figma B/02): Verificando DNS (giro, información) ·
 * Activo · SSL (candado, éxito) · Mal configurado (triángulo, peligro) · Vence
 * pronto / Vence en N días (reloj, advertencia) · Vencido (X, peligro) ·
 * Pendiente (reloj, neutro). Siempre icono + texto; tono de `estadoTono.ts`.
 */
export { DIAS_AVISO_VENCIMIENTO, resolverEstadoDominio, type EstadoDominio };

const ESTADO: Record<EstadoDominio, { clave: string; icono: LucideIcon; texto: string }> = {
  verificando: { clave: 'verificando dns', icono: Loader2, texto: 'dominio.verificando' },
  activo: { clave: 'activo ssl', icono: Lock, texto: 'dominio.activo' },
  mal_configurado: { clave: 'mal configurado', icono: TriangleAlert, texto: 'dominio.malConfigurado' },
  vence_pronto: { clave: 'vence pronto', icono: TimerReset, texto: 'dominio.vencePronto' },
  vencido: { clave: 'vencido', icono: CircleX, texto: 'dominio.vencido' },
  pendiente: { clave: 'dns pendiente', icono: Clock, texto: 'dominio.pendiente' },
};

export interface DomainStatusBadgeProps {
  estado: EstadoDominio;
  /** Con `vence_pronto`, cambia el texto a «Vence en N días». */
  diasParaVencer?: number | null;
  tamano?: 'sm' | 'md';
  className?: string;
}

export function DomainStatusBadge({ estado, diasParaVencer, tamano = 'sm', className }: DomainStatusBadgeProps) {
  const tx = useTextosComun();
  const e = ESTADO[estado];
  let etiqueta = tx(e.texto);
  if (estado === 'vence_pronto' && typeof diasParaVencer === 'number' && diasParaVencer >= 0) {
    etiqueta = diasParaVencer === 1 ? tx('dominio.venceEnUno') : tx('dominio.venceEn', { n: diasParaVencer });
  }
  return (
    <StatusBadge
      estado={e.clave}
      etiqueta={etiqueta}
      icono={e.icono}
      tamano={tamano}
      className={estado === 'verificando' ? `[&_svg]:animate-spin [&_svg]:motion-reduce:animate-none ${className ?? ''}` : className}
    />
  );
}
