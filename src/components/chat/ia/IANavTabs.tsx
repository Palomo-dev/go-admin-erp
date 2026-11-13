'use client';

/**
 * Sub-pestañas de IA del chat (Figma 91-chat-34/35): Laboratorio · Trabajos ·
 * Configuración. La configuración vive en Configuración › Chat › IA del chat
 * desde 2026-10-07; la pestaña es un atajo a esa sección.
 */
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { PestanasEnlace } from '../PestanasEnlace';

export function IANavTabs({ className }: { className?: string }) {
  const pathname = usePathname() ?? '';
  const t = useTranslations('chatModulo.ia.pestanas');
  return (
    <PestanasEnlace
      etiqueta={t('etiqueta')}
      className={className}
      pestanas={[
        { href: '/app/chat/ia/laboratorio', etiqueta: t('laboratorio'), activa: pathname.startsWith('/app/chat/ia/laboratorio') },
        { href: '/app/chat/ia/trabajos', etiqueta: t('trabajos'), activa: pathname.startsWith('/app/chat/ia/trabajos') },
        { href: rutaSeccion('chat.ia'), etiqueta: t('configuracion'), activa: false },
      ]}
    />
  );
}

export default IANavTabs;
