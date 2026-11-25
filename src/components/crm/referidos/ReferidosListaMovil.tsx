'use client';

import { XCircle } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { ReferralStatusBadge } from './referralMeta';
import { esMonetaria, puedeRechazar } from './referidosLogica';
import { SiguientePasoBoton, type AccionPaso } from './SiguientePasoBoton';
import { useReferidosFormato } from './useReferidosFormato';

/**
 * Lista móvil (Figma 1313:88789): tarjeta con avatar, «Por {referidor} ·
 * fecha», estado, una línea de programa o recompensa y, a todo lo ancho, el
 * botón de la siguiente transición válida. «Rechazar» en el «⋯».
 */
export function ReferidosListaMovil({
  filas,
  total,
  ocupadoId,
  onPaso,
  onRechazar,
  onCargarMas,
}: {
  filas: readonly ReferralView[];
  total: number;
  ocupadoId: string | null;
  onPaso: (r: ReferralView, paso: AccionPaso) => void;
  onRechazar: (r: ReferralView) => void;
  onCargarMas: () => void;
}) {
  const { t, fecha, recompensa, dinero, valor } = useReferidosFormato();

  const linea = (r: ReferralView) => {
    const p = r.program;
    if (!p) return t('programa.sinRecompensa');
    if (r.status === 'converted') {
      const monto = esMonetaria(p) ? dinero(p.reward_amount) : valor(p);
      return r.reward_paid ? t('movil.recompensaPagada', { monto }) : t('movil.recompensaPendiente', { monto });
    }
    return `${p.name} · ${recompensa(p)}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label={t('titulo')}>
        {filas.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-start gap-3">
              <AvatarIniciales nombre={r.referred_name} tamano="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-fg">{r.referred_name}</p>
                <p className="truncate text-[13px] text-fg-secondary">{t('movil.por', { nombre: r.referrer?.full_name ?? t('sinNombre'), fecha: fecha(r.created_at) })}</p>
              </div>
              <ReferralStatusBadge status={r.status} className="shrink-0" />
              {puedeRechazar(r) && (
                <RowActionsMenu
                  tamano="sm"
                  titulo={t('menu.titulo', { nombre: r.referred_name })}
                  acciones={[{ id: 'rechazar', etiqueta: t('menu.rechazar'), icono: XCircle, destructiva: true, onSelect: () => onRechazar(r) }]}
                />
              )}
            </div>
            <p className="text-[13px] text-fg-secondary">{linea(r)}</p>
            <SiguientePasoBoton referido={r} ocupado={ocupadoId === r.id} onPaso={onPaso} anchoCompleto />
          </li>
        ))}
      </ul>
      {filas.length < total && (
        <div className="flex flex-col items-center gap-2 py-3">
          <p aria-live="polite" className="text-[13px] text-fg-secondary">{t('movil.mostrando', { n: filas.length, total })}</p>
          <button type="button" onClick={onCargarMas} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {t('movil.cargarMas')}
          </button>
        </div>
      )}
    </div>
  );
}
