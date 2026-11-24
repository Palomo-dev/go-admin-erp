'use client';

import { useMemo, useState } from 'react';
import { HandCoins, TicketPercent } from 'lucide-react';
import { StatCard } from '@/components/kit/StatCard';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { esMonetaria, fechaConversion, filasRecompensas, type ResumenReferidos, type VistaRecompensas } from './referidosLogica';
import { useReferidosFormato } from './useReferidosFormato';

const TH = 'h-11 whitespace-nowrap px-3 text-left text-xs font-medium text-fg-secondary';
const TD = 'px-3 py-3 align-middle';

/** Texto del beneficiario: referidor, «y {referido} · ambos» o «Solo el referido». */
export function useBeneficiario() {
  const { t } = useReferidosFormato();
  return (r: ReferralView): { principal: string; detalle: string } => {
    const referidor = r.referrer?.full_name ?? t('sinNombre');
    const para = r.program?.reward_to;
    if (para === 'referred') return { principal: r.referred_name, detalle: t('recompensas.beneficiario.referred') };
    if (para === 'both') return { principal: referidor, detalle: t('recompensas.beneficiario.both', { nombre: r.referred_name }) };
    return { principal: referidor, detalle: t('recompensas.beneficiario.referrer') };
  };
}

/**
 * Vista «Recompensas» (Figma 1311:771575): pendientes de registrar, pagadas
 * en el año y no monetarias; chips Pendientes / Pagadas; tabla con «Registrar
 * pago» (o «Registrar como aplicado» si no es dinero) y la nota de que
 * registrar no mueve dinero. Escribe por `POST /api/crm/referrals/[id]/reward`.
 */
export function ReferidosRecompensas({ referidos, resumen, ocupadoId, onRegistrar }: { referidos: readonly ReferralView[]; resumen: ResumenReferidos; ocupadoId: string | null; onRegistrar: (r: ReferralView) => void }) {
  const { t, dinero, porcentaje, valor, fecha, hoy } = useReferidosFormato();
  const beneficiario = useBeneficiario();
  const [vista, setVista] = useState<VistaRecompensas>('pendientes');
  const filas = useMemo(() => filasRecompensas(referidos, vista), [referidos, vista]);
  const pagadasTotal = useMemo(() => filasRecompensas(referidos, 'pagadas').length, [referidos]);
  const anio = hoy().slice(0, 4);

  const celdaValor = (r: ReferralView) => {
    const p = r.program!;
    if (p.reward_type === 'discount') return { valor: porcentaje(p.reward_amount), detalle: t('recompensas.detalle.descuento') };
    if (!esMonetaria(p)) return { valor: valor(p), detalle: t('recompensas.detalle.noMonetaria') };
    return { valor: dinero(p.reward_amount), detalle: p.reward_to === 'both' ? t('recompensas.detalle.porPersona') : t('recompensas.detalle.unaPersona') };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3" role="group" aria-label={t('recompensas.kpi.grupo')}>
        <StatCard
          etiqueta={t('recompensas.kpi.pendientes')}
          valor={dinero(resumen.pendientesMonto)}
          detalle={t('recompensas.kpi.convertidos', { n: resumen.pendientesN })}
          tono={resumen.pendientesN ? 'advertencia' : 'neutro'}
        />
        <StatCard
          etiqueta={t('recompensas.kpi.pagadasEn', { anio })}
          valor={dinero(resumen.pagadasMonto)}
          detalle={t('recompensas.kpi.recompensasN', { n: resumen.pagadasN })}
          tono={resumen.pagadasN ? 'exito' : 'neutro'}
          tendencia={resumen.pagadasN ? 'sube' : undefined}
        />
        <StatCard etiqueta={t('recompensas.kpi.noMonetarias')} valor={String(resumen.noMonetariasPendientes)} detalle={t('recompensas.kpi.noMonetariasAyuda')} />
      </div>

      <ChipsOpcion<VistaRecompensas>
        etiqueta={t('recompensas.chips.etiqueta')}
        valor={vista}
        onValorChange={setVista}
        opciones={[
          { valor: 'pendientes', etiqueta: t('recompensas.chips.pendientes', { n: resumen.pendientesN }) },
          { valor: 'pagadas', etiqueta: t('recompensas.chips.pagadas', { n: pagadasTotal }) },
        ]}
      />

      {filas.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="empty"
            icono={HandCoins}
            titulo={t(vista === 'pendientes' ? 'recompensas.vacioPendientes.titulo' : 'recompensas.vacioPagadas.titulo')}
            descripcion={t(vista === 'pendientes' ? 'recompensas.vacioPendientes.descripcion' : 'recompensas.vacioPagadas.descripcion')}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-subtle">
                  <th scope="col" className={TH}>{t('recompensas.tabla.referido')}</th>
                  <th scope="col" className={TH}>{t('recompensas.tabla.beneficiario')}</th>
                  <th scope="col" className={TH}>{t('recompensas.tabla.programa')}</th>
                  <th scope="col" className={TH}>{t('recompensas.tabla.recompensa')}</th>
                  <th scope="col" className={TH}>{t(vista === 'pendientes' ? 'recompensas.tabla.convertido' : 'recompensas.tabla.pagada')}</th>
                  <th scope="col" className={TH}><span className="sr-only">{t('tabla.acciones')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => {
                  const b = beneficiario(r);
                  const v = celdaValor(r);
                  const alta = fechaConversion(r);
                  const monetaria = esMonetaria(r.program);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className={TD}>
                        <p className="text-sm font-medium text-fg">{r.referred_name}</p>
                        <p className="text-xs text-fg-secondary">{alta ? t('recompensas.leadCreado', { fecha: fecha(alta) }) : t('recompensas.sinAlta')}</p>
                      </td>
                      <td className={TD}>
                        <p className="text-sm text-fg">{b.principal}</p>
                        <p className="text-xs text-fg-secondary">{b.detalle}</p>
                      </td>
                      <td className={TD}>
                        <p className="text-sm text-fg">{r.program?.name}</p>
                        <p className="text-xs text-fg-secondary">{r.program ? t(`tipo.${r.program.reward_type}`) : ''}</p>
                      </td>
                      <td className={TD}>
                        <p className="text-sm tabular-nums text-fg">{v.valor}</p>
                        <p className="text-xs text-fg-secondary">{v.detalle}</p>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-sm text-fg`}>{vista === 'pendientes' ? (alta ? fecha(alta) : '—') : fecha(r.reward_paid_at)}</td>
                      <td className={`${TD} text-right`}>
                        {vista === 'pendientes' && (
                          <button
                            type="button"
                            disabled={ocupadoId === r.id}
                            aria-busy={ocupadoId === r.id || undefined}
                            onClick={() => onRegistrar(r)}
                            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                          >
                            {monetaria ? <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <TicketPercent aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                            {t(monetaria ? 'recompensas.registrarPago' : 'recompensas.registrarAplicado')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="rounded-xl bg-subtle px-3 py-2.5 text-[13px] text-fg-secondary">{t('recompensas.nota')}</p>
    </div>
  );
}
