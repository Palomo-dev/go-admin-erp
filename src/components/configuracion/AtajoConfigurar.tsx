'use client';

/**
 * Atajo «Configurar» (engranaje) de las pantallas de los módulos (Figma «10.
 * Configuración unificada», lámina de Agentes IA). Los módulos ya no tienen
 * páginas de ajustes propias: este botón abre el diálogo de Configuración
 * (Figma pág. 10, sección 12) directo en su sección, sobre la pantalla actual.
 * El `href` sigue siendo el deep link estable: abrir en otra pestaña también
 * lleva a la sección.
 */
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit/botonClases';
import { rutaSeccion, seccionPorId } from './config/configSectionsRegistry';
import { abrirConfiguracion } from './dialogo/abrirConfiguracion';

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
      onClick={(e) => {
        // `defaultPrevented`: el diálogo ya interceptó el enlace (ver `ConfiguracionDialogoRaiz`).
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        abrirConfiguracion({ seccionId: s ? seccion : null, ancla });
      }}
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
