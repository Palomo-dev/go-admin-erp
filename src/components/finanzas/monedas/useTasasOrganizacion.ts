'use client';

import { useCallback, useEffect, useState } from 'react';
import { indexarCatalogo, type CatalogoPorDia, type TasaManualFila } from '@/lib/finanzas/monedas/tasasLogica';
import { leerNombresAutores, leerTasasCatalogo, leerTasasManuales } from '@/lib/services/monedasTasasService';

export interface DatosTasas {
  estado: 'cargando' | 'listo' | 'error';
  catalogo: CatalogoPorDia;
  manuales: TasaManualFila[];
  /** id de perfil → nombre. */
  autores: Map<string, string>;
  recargar: () => void;
}

/**
 * Lee catálogo global y tasas manuales de la organización entre dos días.
 * `version` sube cuando se registra una tasa para volver a leer.
 */
export function useTasasOrganizacion(
  organizationId: number | null,
  codigos: readonly string[],
  desde: string | null,
  hasta: string | null,
  version = 0,
): DatosTasas {
  const [estado, setEstado] = useState<DatosTasas['estado']>('cargando');
  const [catalogo, setCatalogo] = useState<CatalogoPorDia>(new Map());
  const [manuales, setManuales] = useState<TasaManualFila[]>([]);
  const [autores, setAutores] = useState<Map<string, string>>(new Map());
  const [recargas, setRecargas] = useState(0);
  const clave = codigos.join(',');

  useEffect(() => {
    if (!organizationId || !desde || !hasta) return;
    if (!clave) {
      // Solo la moneda base: no hay tasas que leer.
      setCatalogo(new Map());
      setManuales([]);
      setEstado('listo');
      return;
    }
    let cancelado = false;
    setEstado('cargando');
    (async () => {
      try {
        const [filasCatalogo, filasManuales] = await Promise.all([
          leerTasasCatalogo(clave.split(','), desde, hasta),
          leerTasasManuales(organizationId, desde, hasta),
        ]);
        const nombres = await leerNombresAutores(filasManuales.map((f) => f.created_by ?? '').filter(Boolean));
        if (cancelado) return;
        setCatalogo(indexarCatalogo(filasCatalogo));
        setManuales(filasManuales);
        setAutores(nombres);
        setEstado('listo');
      } catch (error) {
        console.error('Monedas y tasas: no se pudieron leer las tasas', error);
        if (!cancelado) setEstado('error');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [organizationId, clave, desde, hasta, version, recargas]);

  const recargar = useCallback(() => setRecargas((n) => n + 1), []);
  return { estado, catalogo, manuales, autores, recargar };
}
