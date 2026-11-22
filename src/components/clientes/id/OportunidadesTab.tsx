'use client';

/**
 * Pestaña «Oportunidades» de la ficha (Figma 06 Clientes 332:114792 y CRM
 * 772:19838): cuatro cifras (Total · Abiertas · Ganadas · Perdidas) y la lista
 * con etapa, importe y estado; «Nueva oportunidad» abre la hoja del CRM.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Plus, TrendingUp } from 'lucide-react';
import { EmptyState, StatCard, clasesBoton, type TonoBadge } from '@/components/kit';
import { mensajeError, useFechasFicha } from './useFechasFicha';

interface Oportunidad {
  id: string;
  name: string;
  amount: number;
  currency: string;
  status: string;
  expected_close_date: string | null;
  created_at: string;
  stage: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  pipeline: {
    id: string;
    name: string;
  } | null;
}

interface OportunidadesTabProps {
  clienteId: string;
  organizationId: number;
  /**
   * CRM ola 3A (Figma 772:19838): «Nueva oportunidad» en la pestaña y en su
   * vacío → `OpportunityForm Layout=sheet Origen=cliente`. Sin permiso, no se pasa.
   */
  onNuevaOportunidad?: () => void;
  /** Cambia tras crear una oportunidad: se vuelve a leer. */
  recarga?: number;
}

const DIA_MES_ANIO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export default function OportunidadesTab({ clienteId, organizationId, onNuevaOportunidad, recarga }: OportunidadesTabProps) {
  const t = useTranslations('clientes.ficha');
  const tc = useTranslations('crm.fichaCliente.oportunidades');
  const { paraDocumento } = useMonedaOrganizacion();
  const { plana } = useFechasFicha();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null } | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);

  useEffect(() => {
    const fetchOportunidades = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from('opportunities')
          .select(`
            id, name, amount, currency, status, expected_close_date, created_at,
            stage:stages(id, name, color),
            pipeline:pipelines(id, name)
          `)
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        // supabase-js tipa stage/pipeline como arreglo aunque sean relaciones a-uno
        setOportunidades((data || []) as unknown as Oportunidad[]);
      } catch (err) {
        console.error('Error al cargar oportunidades:', err);
        setError({ mensaje: mensajeError(err) });
      } finally {
        setLoading(false);
      }
    };

    fetchOportunidades();
  }, [clienteId, organizationId, recarga]);

  const ESTADOS: Record<string, { clave: string; tono: TonoBadge }> = {
    open: { clave: 'abierta', tono: 'informacion' },
    won: { clave: 'ganada', tono: 'exito' },
    lost: { clave: 'perdida', tono: 'peligro' },
  };

  const kpis = (valores: { total: number; abiertas: number; ganadas: number; perdidas: number } | null) => (
    <section aria-label={t('oportunidades.kpisAria')} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <StatCard etiqueta={t('oportunidades.total')} valor={valores?.total ?? 0} cargando={!valores} tamano="sm" />
      <StatCard etiqueta={t('oportunidades.abiertas')} valor={valores?.abiertas ?? 0} cargando={!valores} tamano="sm" />
      <StatCard etiqueta={t('oportunidades.ganadas')} valor={valores?.ganadas ?? 0} cargando={!valores} tamano="sm" />
      <StatCard etiqueta={tc('perdidas')} valor={valores?.perdidas ?? 0} cargando={!valores} tamano="sm" />
    </section>
  );

  const botonNueva = onNuevaOportunidad ? (
    <button type="button" onClick={onNuevaOportunidad} className={clasesBoton({ tamano: 'sm' })}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {tc('nueva')}
    </button>
  ) : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {kpis(null)}
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" compacto descripcion={error.mensaje || t('oportunidades.errorCarga')} />
      </div>
    );
  }

  if (oportunidades.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          icono={TrendingUp}
          titulo={t('oportunidades.vacioTitulo')}
          descripcion={t('oportunidades.vacioDescripcion')}
          accion={onNuevaOportunidad ? { etiqueta: tc('nueva'), onClick: onNuevaOportunidad, icono: Plus } : undefined}
        />
      </div>
    );
  }

  const ganadas = oportunidades.filter((o) => o.status === 'won').length;
  const abiertas = oportunidades.filter((o) => o.status === 'open').length;
  const perdidas = oportunidades.filter((o) => o.status === 'lost').length;

  return (
    <div className="flex flex-col gap-3">
      {kpis({ total: oportunidades.length, abiertas, ganadas, perdidas })}

      <section aria-labelledby="oportunidades-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="oportunidades-titulo" className="text-[13px] font-semibold leading-[19px] text-fg">
            {t('oportunidades.titulo', { n: oportunidades.length })}
          </h3>
          {botonNueva}
        </div>
        <ul className="flex flex-col gap-2">
          {oportunidades.map((opp) => {
            const estado = ESTADOS[opp.status];
            return (
              <li key={opp.id}>
                <Link
                  href={`/app/crm/oportunidades/${opp.id}`}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="break-words text-[13px] font-semibold leading-[18px] text-fg">{opp.name}</p>
                    <p className="text-[11px] leading-4 text-fg-muted">
                      {[opp.pipeline?.name, opp.expected_close_date ? t('oportunidades.cierreEsperado', { fecha: plana(opp.expected_close_date, DIA_MES_ANIO) }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {opp.stage && (
                        <Badge tono="marca" apariencia="contorno" tamano="sm">
                          {opp.stage.name}
                        </Badge>
                      )}
                      {Number(opp.amount) > 0 && (
                        <span className="text-sm font-semibold tabular-nums text-fg">
                          {formatMoneda(parseFloat(String(opp.amount)), paraDocumento(opp.currency))}
                        </span>
                      )}
                    </div>
                    {estado ? (
                      <Badge tono={estado.tono} tamano="sm">
                        {t(`oportunidades.estados.${estado.clave}`)}
                      </Badge>
                    ) : (
                      <Badge tono="neutro" tamano="sm">
                        {opp.status}
                      </Badge>
                    )}
                  </div>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
