'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, FileDown, MessageSquare, BarChart3, Clock } from 'lucide-react';
import { PeriodoSelector } from './PeriodoSelector';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

export type ReportesTab = 'reportes' | 'historial';

interface ReportesHeaderProps {
  periodo: PeriodoCierre;
  onPeriodoChange: (p: PeriodoCierre) => void;
  onRefresh: () => void;
  onExportCierre: () => void;
  onOpenChat: () => void;
  isRefreshing?: boolean;
  isExporting?: boolean;
  activeTab: ReportesTab;
  onTabChange: (tab: ReportesTab) => void;
  historialCount?: number;
}

export function ReportesHeader({
  periodo,
  onPeriodoChange,
  onRefresh,
  onExportCierre,
  onOpenChat,
  isRefreshing,
  isExporting,
  activeTab,
  onTabChange,
  historialCount = 0,
}: ReportesHeaderProps) {
  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reportes</h1>
          {activeTab === 'reportes' && (
            <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'reportes' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-9"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onExportCierre}
                disabled={isExporting}
                className="h-9"
              >
                <FileDown className="h-4 w-4 mr-1" />
                {isExporting ? 'Generando...' : 'PDF Cierre'}
              </Button>
            </>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={onOpenChat}
            className="h-9 bg-blue-600 hover:bg-blue-700"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Chat IA
          </Button>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ReportesTab)}>
          <TabsList className="bg-transparent h-auto p-0 gap-1">
            <TabsTrigger
              value="reportes"
              className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
            >
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
                <BarChart3 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
              </div>
              <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">Reportes</span>
            </TabsTrigger>
            <TabsTrigger
              value="historial"
              className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
            >
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
                <Clock className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
              </div>
              <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">Historial</span>
              {historialCount > 0 && (
                <span className="ml-1 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5">
                  {historialCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
