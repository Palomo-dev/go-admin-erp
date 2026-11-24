'use client';

/** KPIs de 7 días y último estado por regla (`GET /api/crm/automation-runs/resumen`). */

import { useCallback, useEffect, useState } from 'react';
import { browserFetch, fetchResumen } from '@/lib/services/crm/automation/ruleMutations';
import { RESUMEN_VACIO, type ResumenAutomatizaciones } from '@/lib/services/crm/automation/automationListaLogica';

export function useResumenAutomatizaciones() {
  const [resumen, setResumen] = useState<ResumenAutomatizaciones>(RESUMEN_VACIO);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  const recargar = useCallback(async () => {
    try {
      setResumen(await fetchResumen(browserFetch));
      setFallo(false);
    } catch {
      // Sin resumen la lista sigue sirviendo: los KPIs muestran «—».
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { resumen, cargando, fallo, recargar };
}
