'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Loader2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        setOportunidades(data || []);
      } catch (err: any) {
        console.error('Error al cargar oportunidades:', err);
        setError(err.message || 'Error al cargar las oportunidades');
      } finally {
        setLoading(false);
      }
    };

    fetchOportunidades();
  }, [clienteId, organizationId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Abierta</Badge>;
      case 'won':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Ganada</Badge>;
      case 'lost':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Perdida</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Cargando oportunidades...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (oportunidades.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <TrendingUp className="h-8 w-8 text-blue-500" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Sin oportunidades</h3>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Este cliente aún no tiene oportunidades en el pipeline.
        </p>
      </div>
    );
  }

  const totalMonto = oportunidades.reduce((sum, o) => sum + (parseFloat(String(o.amount)) || 0), 0);
  const ganadas = oportunidades.filter(o => o.status === 'won').length;
  const abiertas = oportunidades.filter(o => o.status === 'open').length;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{oportunidades.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Abiertas</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{abiertas}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Ganadas</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{ganadas}</p>
        </div>
      </div>

      {/* Lista de oportunidades */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Oportunidades ({oportunidades.length})
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
                  <h4 className="font-medium text-gray-900 dark:text-white truncate">
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
                      {formatCurrency(parseFloat(String(opp.amount)), opp.currency || 'COP')}
                    </span>
                  )}
                  {getStatusBadge(opp.status)}
                </div>
              </div>
              {opp.expected_close_date && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Cierre esperado: {formatDate(new Date(opp.expected_close_date))}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
