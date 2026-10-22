'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { UnifiedMovement } from '@/lib/services/movimientosService';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function DatosContablesMovimiento({ movement }: { movement: UnifiedMovement }) {
  const t = useTranslations('tesoreria');
  const [url, setUrl] = useState<string | null>(null);
  const hayDatos = Boolean(
    movement.categoria_nombre || movement.cuenta_contable || movement.tercero_nit || movement.centro_costo_nombre || movement.soporte_path,
  );

  useEffect(() => {
    if (!movement.soporte_path) return;
    let vivo = true;
    void supabase.storage.from('soportes-tesoreria').createSignedUrl(movement.soporte_path, 120).then(({ data }) => {
      if (vivo) setUrl(data?.signedUrl ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [movement.soporte_path]);

  if (!hayDatos) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {movement.categoria_nombre ? (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('movimiento.categoria')}</p>
          <p className="font-medium text-gray-900 dark:text-white">{movement.categoria_nombre}</p>
        </div>
      ) : null}
      {movement.cuenta_contable ? (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('movimiento.cuenta')}</p>
          <p className="font-medium text-gray-900 dark:text-white">{movement.cuenta_contable}</p>
        </div>
      ) : null}
      {movement.tercero_nit ? (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('movimiento.tercero')}</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {movement.tercero_nit}{movement.tercero_nombre ? ` · ${movement.tercero_nombre}` : ''}
          </p>
        </div>
      ) : null}
      {movement.centro_costo_nombre ? (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('movimiento.centroCosto')}</p>
          <p className="font-medium text-gray-900 dark:text-white">{movement.centro_costo_nombre}</p>
        </div>
      ) : null}
      {movement.soporte_path ? (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('movimiento.soporte')}</p>
          {url ? (
            <Button asChild variant="link" className="h-auto p-0">
              <a href={url} target="_blank" rel="noreferrer">{t('movimiento.verSoporte')}</a>
            </Button>
          ) : (
            <p className="text-sm text-gray-500">{t('movimiento.soporte')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
