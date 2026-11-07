'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/kit';
import type { ResultadoSincronizacionCliente } from '@/lib/services/tasasCambioCliente';
import type { FuenteTasa } from '@/lib/finanzas/monedas/tasasLogica';

/** «▲ 0,4 %», «▼ 0,2 %» o «—». La flecha y el texto dicen el sentido: no depende solo del color. */
export function Variacion({ valor, formato }: { valor: number | null; formato: (v: number) => string }) {
  const t = useTranslations('finanzasMonedasR2.comun');
  if (valor === null || !Number.isFinite(valor)) {
    return (
      <span className="text-fg-muted" aria-label={t('sinVariacion')}>
        —
      </span>
    );
  }
  const sube = valor > 0;
  const igual = Math.abs(valor) < 0.05;
  if (igual) return <span className="tabular-nums text-fg-secondary">{formato(0)}</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-fg" aria-label={sube ? t('sube', { valor: formato(valor) }) : t('baja', { valor: formato(valor) })}>
      <span aria-hidden="true" className="text-[10px] leading-none">
        {sube ? '▲' : '▼'}
      </span>
      {formato(valor)}
    </span>
  );
}

/** Badge de la fuente de una tasa: «Manual» (marca) o «Automática» (neutro). */
export function BadgeFuente({ fuente }: { fuente: FuenteTasa }) {
  const t = useTranslations('finanzasMonedasR2.comun');
  return (
    <StatusBadge
      estado={fuente}
      etiqueta={fuente === 'manual' ? t('manual') : t('automatica')}
      tono={fuente === 'manual' ? 'marca' : 'neutro'}
      tamano="sm"
    />
  );
}

/**
 * «Sincronizar catálogo»: pide al servidor que traiga las tasas del día
 * (`/api/finanzas/tasas-cambio/sincronizar`, solo administradores de la
 * plataforma; para el resto responde 403 y se muestra su mensaje). Cada
 * pantalla pasa `sincronizarTasasDeCambio` de `tasasCambioCliente`: ninguna
 * escribe el catálogo (guardrails, caso 32).
 */
export function useSincronizarCatalogo(
  sincronizar: () => Promise<ResultadoSincronizacionCliente>,
  alTerminar?: () => void,
): { sincronizando: boolean; sincronizarCatalogo: () => Promise<void> } {
  const t = useTranslations('finanzasMonedasR2.sincronizar');
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizarCatalogo = useCallback(async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const resultado = await sincronizar();
      if (!resultado.success) throw new Error(resultado.message || t('error'));
      toast.success(t('listo', { n: resultado.updated_count ?? 0 }));
      alTerminar?.();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('error'));
    } finally {
      setSincronizando(false);
    }
  }, [sincronizar, alTerminar, sincronizando, t]);
  return { sincronizando, sincronizarCatalogo };
}
