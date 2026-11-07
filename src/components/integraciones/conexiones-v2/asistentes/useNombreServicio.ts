'use client';

import { useTranslations } from 'next-intl';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';

/** Nombre visible del servicio: el de la base; si no hay, el de i18n; si tampoco, el id. */
export function useNombreServicio(item: Pick<ItemCatalogo, 'id' | 'nombre'>): string {
  const t = useTranslations('integracionesConexiones');
  if (item.nombre) return item.nombre;
  const clave = `servicios.${item.id}.nombre`;
  return t.has(clave) ? t(clave) : item.id;
}
