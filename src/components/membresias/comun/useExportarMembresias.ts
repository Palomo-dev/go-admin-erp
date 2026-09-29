'use client';

/**
 * «Exportar CSV» de los listados de Membresías (§12.3): el archivo lo arma el servidor con la
 * organización de la sesión, el permiso de ver y los filtros que tiene la pantalla; aquí solo se
 * pide y se descarga.
 */
import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { guardarArchivo } from '@/lib/documents/cliente';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import { MAX_FILAS_EXPORTACION } from '@/lib/services/membresias/exportarCsv';
import type { TipoExportacion } from '@/lib/services/membresias/tipos';
import { useMensajeError } from './useMensajeError';

export function useExportarMembresias(tipo: TipoExportacion) {
  const locale = useLocale();
  const t = useTranslations('membresias.exportar');
  const mensajeError = useMensajeError();
  const [exportando, setExportando] = useState(false);

  const exportar = useCallback(
    async (filtros: Record<string, string | number | null | undefined>) => {
      setExportando(true);
      try {
        const archivo = await apiMembresias.exportar(tipo, filtros, locale);
        guardarArchivo(archivo.blob, archivo.nombre);
        if (archivo.truncado) toast.warning(t('truncado', { max: MAX_FILAS_EXPORTACION }));
        else toast.success(t('listo'));
      } catch (e) {
        toast.error(mensajeError(e));
      } finally {
        setExportando(false);
      }
    },
    [tipo, locale, t, mensajeError],
  );

  return { exportar, exportando };
}
