'use client';

/**
 * Atajos a la configuración del Chat. Las páginas viejas
 * `/app/chat/configuracion/{etiquetas,respuestas-rapidas,llaves-api}` ya no
 * existen: etiquetas, respuestas rápidas y llaves de API viven en
 * Configuración › Chat › General, y la IA en Configuración › Chat › IA del chat.
 */
import { useTranslations } from 'next-intl';
import { Bot, Settings } from 'lucide-react';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { PestanasEnlace } from '../PestanasEnlace';

export function ConfigNavTabs({ activa, className }: { activa?: 'general' | 'ia'; className?: string }) {
  const t = useTranslations('chatModulo.configuracion');
  return (
    <PestanasEnlace
      etiqueta={t('etiqueta')}
      className={className}
      pestanas={[
        { href: rutaSeccion('chat.general'), etiqueta: t('general'), icono: Settings, activa: activa === 'general' },
        { href: rutaSeccion('chat.ia'), etiqueta: t('ia'), icono: Bot, activa: activa === 'ia' },
      ]}
    />
  );
}

export default ConfigNavTabs;
