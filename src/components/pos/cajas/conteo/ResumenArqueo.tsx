'use client';

/**
 * «Resumen del arqueo» (Figma `359:58439`): efectivo contado, otros métodos,
 * total contado, total esperado y diferencia, con el aviso de faltante o
 * sobrante que exige una observación. Lo usan el nuevo arqueo y el cierre.
 *
 * Las cifras vienen de `totalesConteo` (lógica pura, probada); con cierre
 * ciego el esperado y la diferencia salen «Oculto» porque el servidor no los
 * mandó.
 */
import { useTranslations } from 'next-intl';
import { Calculator } from 'lucide-react';
import { FilaDato, ListaDatos, Tarjeta } from '@/components/kit';
import type { TotalesConteo } from '@/lib/pos/cajas/arqueo';

export interface ResumenArqueoProps {
  totales: TotalesConteo;
  formatear: (valor: number) => string;
  visible: boolean;
  titulo?: string;
  /** Contenido extra al pie (botones en el arqueo). */
  pie?: React.ReactNode;
  className?: string;
}

export function ResumenArqueo({ totales, formatear, visible, titulo, pie, className }: ResumenArqueoProps) {
  const t = useTranslations('cajas.conteo');
  const d = totales.diferenciaTotal;
  const signo = d !== null && d > 0 ? '+' : '';
  const tono = d === null ? 'neutro' : d <= -0.5 ? 'peligro' : d >= 0.5 ? 'exito' : 'neutro';
  return (
    <Tarjeta titulo={titulo ?? t('resumen')} icono={Calculator} pie={pie} className={className}>
      <ListaDatos etiqueta={titulo ?? t('resumen')}>
        <FilaDato etiqueta={t('efectivoContado')} valor={formatear(totales.efectivoContado)} />
        <FilaDato etiqueta={t('otrosMetodos')} valor={formatear(totales.otrosContado)} />
        <FilaDato etiqueta={t('totalContado')} valor={formatear(totales.totalContado)} tono="fuerte" />
        <FilaDato
          etiqueta={t('totalEsperado')}
          valor={totales.totalEsperado === null ? null : formatear(totales.totalEsperado)}
          oculto={!visible}
          separadorAntes
        />
        <FilaDato
          etiqueta={t('diferencia')}
          valor={d === null ? null : `${signo}${formatear(d)}`}
          oculto={!visible}
          tono={tono}
          tamano="lg"
        />
        {visible && totales.diferenciaEfectivo !== null && totales.diferenciaEfectivo !== d && (
          <FilaDato
            etiqueta={t('diferenciaEfectivo')}
            valor={`${totales.diferenciaEfectivo > 0 ? '+' : ''}${formatear(totales.diferenciaEfectivo)}`}
            sangria={1}
            tamano="sm"
          />
        )}
      </ListaDatos>
      {visible && d !== null && Math.abs(d) >= 0.5 && (
        <p
          role="status"
          className={
            d < 0
              ? 'mt-3 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text'
              : 'mt-3 rounded-lg border border-line bg-success-subtle px-3 py-2 text-sm text-success-text'
          }
        >
          {d < 0 ? t('avisoFaltante', { monto: formatear(Math.abs(d)) }) : t('avisoSobrante', { monto: formatear(d) })}
        </p>
      )}
      {!visible && <p className="mt-3 text-sm text-fg-secondary">{t('cierreCiegoNota')}</p>}
    </Tarjeta>
  );
}
