'use client';

import { useTranslations } from 'next-intl';
import { Users, Target } from 'lucide-react';
import { idPanel, idPestana, TabBar } from '@/components/kit/TabBar';
import { useOpcionUrl } from '@/components/kit/useParametroUrl';
import { EquipoSidebar } from './EquipoSidebar';
import { EquiposTab, AsignarTab, PerformanceTab, TerritoriosTab } from './tabs';

/** Secciones de Equipo → `TabBar` con `?pestana=` (regla de pestañas 2026-10-06). */
const TABS = ['equipos', 'asignar', 'performance', 'territorios'] as const;

export function EquipoPage() {
  const t = useTranslations('crm.equipo');
  const [tab, setTab] = useOpcionUrl('pestana', TABS, 'equipos');

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
                  {t('equipoPage.equipoComercial')}
                </h1>
                <div className="inline-flex items-center rounded-full border border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-0.5 text-xs font-semibold">
                  {t('equipoPage.revops')}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {t('equipoPage.gestionComercial')}
                </span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />
                  {t('equipoPage.equiposOportunidadesTerritorios')}
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
          <TabBar id="equipo" etiqueta={t('pestanas.aria')} valor={tab} onValorChange={setTab} pestanas={TABS.map((v) => ({ valor: v, etiqueta: t(`pestanas.${v}`) }))} />

          <div role="tabpanel" id={idPanel('equipo', tab)} aria-labelledby={idPestana('equipo', tab)}>
            {tab === 'equipos' && <EquiposTab />}
            {tab === 'asignar' && <AsignarTab />}
            {tab === 'performance' && <PerformanceTab />}
            {tab === 'territorios' && <TerritoriosTab />}
          </div>
        </div>

        {/* Sidebar derecho - 1/3 */}
        <EquipoSidebar />
      </div>
    </div>
  );
}
