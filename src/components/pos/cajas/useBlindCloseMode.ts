'use client';

import { useState, useEffect } from 'react';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { usePermisosCaja } from './usePermisosCaja';

export interface BlindCloseModeResult {
  isBlindMode: boolean;
  /**
   * Puede ver el esperado aunque haya cierre ciego. Lo decide el servidor
   * (`GET /api/pos/cajas/permisos`), no el nombre del rol (regla dura 6).
   */
  isOrgAdmin: boolean;
  showExpected: boolean;
  loading: boolean;
}

export function useBlindCloseMode(): BlindCloseModeResult {
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const permisos = usePermisosCaja();

  useEffect(() => {
    let vigente = true;
    ConfiguracionService.getBlindCashCountConfig()
      .then((config) => vigente && setIsBlindMode(config.blind_cash_count))
      .catch((err) => console.warn('Error loading blind close mode:', err))
      .finally(() => vigente && setLoadingConfig(false));
    return () => {
      vigente = false;
    };
  }, []);

  const isOrgAdmin = permisos.verEsperadoEnCierreCiego;
  return {
    isBlindMode,
    isOrgAdmin,
    showExpected: !isBlindMode || isOrgAdmin,
    loading: loadingConfig || permisos.cargando,
  };
}
