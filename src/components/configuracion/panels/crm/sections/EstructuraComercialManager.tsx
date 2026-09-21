'use client';

import { useState } from 'react';
import { MapPin, UserCog, Users } from 'lucide-react';
import { RolesSection } from './estructura-comercial/RolesSection';
import { TeamsSection } from './estructura-comercial/TeamsSection';
import { TerritoriesSection } from './estructura-comercial/TerritoriesSection';
import type { SubSection } from './estructura-comercial/types';

/**
 * Estructura comercial (F1): roles, equipos y territorios de la organización.
 *
 * Hasta el cierre de F1 este archivo tenía 1.308 líneas con las tres
 * secciones, sus diálogos y la capa de datos. Ahora solo monta las pestañas;
 * cada pieza vive en `./estructura-comercial/` (tipos, `db*`, hooks
 * `use*`, diálogos y secciones), ninguna por encima de 300 líneas. El
 * contrato con `CRMConfigPanel` no cambia: sigue exportando
 * `EstructuraComercialManager` sin props.
 */
export function EstructuraComercialManager() {
  const [subSection, setSubSection] = useState<SubSection>('roles');

  const subTabs: { key: SubSection; label: string; icon: typeof Users }[] = [
    { key: 'roles', label: 'Roles', icon: UserCog },
    { key: 'teams', label: 'Equipos', icon: Users },
    { key: 'territories', label: 'Territorios', icon: MapPin },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = subSection === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubSection(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {subSection === 'roles' && <RolesSection />}
      {subSection === 'teams' && <TeamsSection />}
      {subSection === 'territories' && <TerritoriesSection />}
    </div>
  );
}
