'use client';

/**
 * «Esta configuración se movió aquí»: se muestra UNA vez a quien llega desde
 * un enlace viejo (las redirecciones de `next.config.js` mandan `?movido=`).
 *
 * Se recuerda por origen en localStorage (con try/catch: en una ventana
 * privada o con el almacenamiento bloqueado simplemente vuelve a salir).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal } from '@/components/kit';

export const CLAVE_AVISO_MOVIDO = 'goadmin:configuracion:movido:';

function yaVisto(origen: string): boolean {
  try {
    return window.localStorage.getItem(CLAVE_AVISO_MOVIDO + origen) === '1';
  } catch {
    return false;
  }
}

function marcarVisto(origen: string): void {
  try {
    window.localStorage.setItem(CLAVE_AVISO_MOVIDO + origen, '1');
  } catch {
    /* almacenamiento no disponible: el aviso puede repetirse, nada más */
  }
}

interface Props {
  origen: string | null;
  /** Quita `?movido=` de la URL (para que recargar no lo vuelva a pedir). */
  onVisto: () => void;
}

export function AvisoMovido({ origen, onVisto }: Props) {
  const t = useTranslations('configuracionUnificada');
  const [visible, setVisible] = useState<string | null>(null);

  useEffect(() => {
    if (!origen || !t.has(`origenes.${origen}`)) return;
    if (!yaVisto(origen)) {
      setVisible(origen);
      marcarVisto(origen);
    }
    onVisto();
  }, [origen, onVisto, t]);

  if (!visible) return null;
  return (
    <AvisoTonal
      tono="informacion"
      rol="status"
      titulo={t('movido.titulo')}
      descripcion={t('movido.descripcion', { desde: t(`origenes.${visible}`) })}
      accion={{ etiqueta: t('movido.entendido'), onClick: () => setVisible(null) }}
    />
  );
}
