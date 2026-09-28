'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { DetailSkeleton } from '@/components/common/PageSkeletons';
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
}

export default function OportunidadesTab({ clienteId, organizationId }: OportunidadesTabProps) {
  const t = useTranslations('clientes.ficha');
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
  }, [clienteId, organizationId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{t('oportunidades.estados.abierta')}</Badge>;
      case 'won':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{t('oportunidades.estados.ganada')}</Badge>;
      case 'lost':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">{t('oportunidades.estados.perdida')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-600 dark:text-red-400">{error.mensaje || t('oportunidades.errorCarga')}</p>
      </div>
    );
  }

  if (oportunidades.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <TrendingUp className="h-8 w-8 text-blue-500" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('oportunidades.vacioTitulo')}</h3>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          {t('oportunidades.vacioDescripcion')}
        </p>
      </div>
    );
  }

  const ganadas = oportunidades.filter(o => o.status === 'won').length;
  const abiertas = oportunidades.filter(o => o.status === 'open').length;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('oportunidades.total')}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{oportunidades.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('oportunidades.abiertas')}</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{abiertas}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('oportunidades.ganadas')}</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{ganadas}</p>
        </div>
      </div>

      {/* Lista de oportunidades */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          {t('oportunidades.titulo', { n: oportunidades.length })}
        </h3>
        <div className="space-y-3">
          {oportunidades.map((opp) => (
            <Link
              key={opp.id}
              href={`/app/crm/oportunidades/${opp.id}`}
              className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 dark:text-white break-words whitespace-normal">
                    {opp.name}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {opp.pipeline && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {opp.pipeline.name}
                      </span>
                    )}
                    {opp.stage && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={opp.stage.color ? { backgroundColor: opp.stage.color + '20', color: opp.stage.color } : undefined}
                      >
                        {opp.stage.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {opp.amount > 0 && (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatMoneda(parseFloat(String(opp.amount)), paraDocumento(opp.currency))}
                    </span>
                  )}
                  {getStatusBadge(opp.status)}
                </div>
              </div>
              {opp.expected_close_date && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('oportunidades.cierreEsperado', { fecha: plana(opp.expected_close_date) })}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
