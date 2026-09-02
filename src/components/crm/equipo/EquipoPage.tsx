'use client';

import { useState } from 'react';
import { Users, Target, Gauge, MapPin } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EquipoSidebar } from './EquipoSidebar';
import { EquiposTab, AsignarTab, PerformanceTab, TerritoriosTab } from './tabs';

type Tab = 'equipos' | 'asignar' | 'performance' | 'territorios';

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'equipos', label: 'Equipos', icon: Users },
  { key: 'asignar', label: 'Asignar Oportunidades', icon: Target },
  { key: 'performance', label: 'Performance', icon: Gauge },
  { key: 'territorios', label: 'Territorios', icon: MapPin },
];

export function EquipoPage() {
  const [tab, setTab] = useState<Tab>('equipos');

  return (
    <div className="space-y-6 p-6">
      {/* Header estilo OpportunityDetail */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Equipo Comercial
                </h1>
                <div className="inline-flex items-center rounded-full border border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-0.5 text-xs font-semibold">
                  RevOps
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Gestión comercial
                </span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />
                  Equipos, oportunidades y territorios
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid principal 2/3 + 1/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs estilo Configuracion */}
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <div className="overflow-x-auto">
                <TabsList className="bg-transparent h-auto p-0 gap-1">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    return (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
                      >
                        <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
                          <Icon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
                        </div>
                        <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">
                          {t.label}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
            </Tabs>
          </div>

          {/* Contenido del tab activo */}
          {tab === 'equipos' && <EquiposTab />}
          {tab === 'asignar' && <AsignarTab />}
          {tab === 'performance' && <PerformanceTab />}
          {tab === 'territorios' && <TerritoriosTab />}
        </div>

        {/* Sidebar derecho - 1/3 */}
        <EquipoSidebar />
      </div>
    </div>
  );
}
