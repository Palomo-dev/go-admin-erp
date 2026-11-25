'use client';

import { useParametrosUrl } from '@/components/kit/useParametroUrl';
import { pestanaDesdeUrl, type PestanaEquipo } from './equipoPantallaLogica';
import { EquiposTab, AsignacionTab, DesempenoTab, TerritoriosTab } from './tabs';

/**
 * Equipo comercial (Figma CRM «Red y gestión», 1411:837770 · 1411:838455 ·
 * 1412:837868 · 1412:838392 · 1413:17 · 1413:726 · 1413:1051). Pestañas en
 * `?pestana=` (equipos · territorios · asignacion); `desempeno` es la vista
 * de Desempeño del equipo, que se abre desde el menú ⋯ y en móvil es «Mi
 * desempeño». Toda escritura va por `/api/crm/**`.
 */
export function EquipoPage() {
  const { leer, fijar } = useParametrosUrl();
  const pestana = pestanaDesdeUrl(leer('pestana'));
  const ir = (p: PestanaEquipo) => fijar({ pestana: p === 'equipos' ? null : p });

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      {pestana === 'equipos' && <EquiposTab onPestana={ir} />}
      {pestana === 'territorios' && <TerritoriosTab onPestana={ir} />}
      {pestana === 'asignacion' && <AsignacionTab onPestana={ir} />}
      {pestana === 'desempeno' && <DesempenoTab onPestana={ir} />}
    </div>
  );
}
