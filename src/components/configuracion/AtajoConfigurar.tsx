'use client';

/**
 * Atajo «Configurar» (engranaje) de las pantallas de los módulos (Figma «10.
 * Configuración unificada», lámina de Agentes IA). Los módulos ya no tienen
 * páginas de ajustes propias: este botón abre la sección exacta de
 * Configuración por su deep link estable.
 */
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit/botonClases';
import { rutaSeccion, seccionPorId } from './config/configSectionsRegistry';

interface Props {
  /** Id estable de la sección (`crm.agente-voz`). */
  seccion: string;
  ancla?: string;
  /** Solo el engranaje (cabecera del celular); el nombre accesible no cambia. */
  soloIcono?: boolean;
  className?: string;
}

export function AtajoConfigurar({ seccion, ancla, soloIcono, className }: Props) {
  const t = useTranslations('configuracionUnificada');
  const s = seccionPorId(seccion);
  const nombre = s ? t('configurar.aria', { seccion: `${t(`modulos.${s.modulo}`)} › ${t(`secciones.${s.clave}.titulo`)}` }) : t('configurar.etiqueta');
  return (
    <Link
      href={rutaSeccion(seccion, { ancla })}
      aria-label={nombre}
      title={nombre}
      className={
        soloIcono
          ? `flex size-10 items-center justify-center rounded-lg text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand ${className ?? ''}`
          : clasesBoton({ variante: 'secundario', className })
      }
    >
      <Settings aria-hidden="true" className={soloIcono ? 'size-5' : 'size-4'} strokeWidth={1.5} />
      {!soloIcono && t('configurar.etiqueta')}
    </Link>
  );
}
