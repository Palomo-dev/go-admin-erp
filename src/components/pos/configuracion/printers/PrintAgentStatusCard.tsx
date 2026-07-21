'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Radio, Server, Download, MapPin } from 'lucide-react';
import { PrintJobsService, type PrintAgentStatus } from '@/lib/services/printJobsService';
import { DownloadDesktopDialog } from './DownloadDesktopDialog';

interface PrintAgentStatusCardProps {
  branchId: number | null;
}

export function PrintAgentStatusCard({ branchId }: PrintAgentStatusCardProps) {
  const [agents, setAgents] = useState<PrintAgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDownload, setShowDownload] = useState(false);

  const loadAgents = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const data = await PrintJobsService.getAgentsStatus(branchId);
      setAgents(data);
    } catch (error) {
      console.error('Error obteniendo estado de agentes de impresión:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 30_000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-slate-600" />
            Print Agent (Estado)
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Agentes locales que envían las comandas a las impresoras físicas de esta sucursal
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDownload(true)}>
            <Download className="h-4 w-4 mr-2" />
            Descargar Go Admin Desktop
          </Button>
          <Button variant="outline" size="icon" onClick={loadAgents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-sm">
            No se ha registrado ningún agente de impresión para esta sucursal aún. Usa el botón{' '}
            <span className="font-medium">"Descargar Go Admin Desktop"</span> para instalarlo en el
            computador del local.
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{agent.agent_name}</span>
                  {agent.branch_name && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <MapPin className="h-3 w-3" />
                      {agent.branch_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {agent.last_seen_at && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Últ. actividad: {new Date(agent.last_seen_at).toLocaleTimeString('es-CO')}
                    </span>
                  )}
                  <Badge
                    className={
                      agent.isOnline
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }
                  >
                    {agent.isOnline ? 'En línea' : 'Sin conexión'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <DownloadDesktopDialog open={showDownload} onOpenChange={setShowDownload} />
    </Card>
  );
}
