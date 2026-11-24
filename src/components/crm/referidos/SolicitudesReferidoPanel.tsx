'use client';

/**
 * «Ver solicitudes» del aviso azul (Figma 1298:768716): tareas «pedir
 * referido» (`tasks.type='referido'`) que F10 crea al ganar una oportunidad.
 * Cada una abre «Registrar referido» con el cliente ganado ya elegido.
 * Datos: `GET /api/crm/referrals/requests`.
 */

import { HandHeart, Plus } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ReferralRequest } from '@/lib/services/crm/referralsService';
import { useReferidosFormato } from './useReferidosFormato';

export function SolicitudesReferidoPanel({ abierto, onAbiertoChange, solicitudes, onRegistrar }: { abierto: boolean; onAbiertoChange: (v: boolean) => void; solicitudes: readonly ReferralRequest[]; onRegistrar: (r: ReferralRequest) => void }) {
  const { t, fecha } = useReferidosFormato();
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('solicitudes.titulo')}
      descripcion={t('solicitudes.descripcion')}
      icono={HandHeart}
      tonoIcono="informacion"
      ancho={560}
      pie={
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario' })}>
          {t('solicitudes.cerrar')}
        </button>
      }
    >
      <ul className="flex flex-col gap-2" aria-label={t('solicitudes.titulo')}>
        {solicitudes.map((r) => {
          const nombre = r.customer?.full_name ?? r.title;
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{nombre}</p>
                <p className="truncate text-[13px] text-fg-secondary">{r.due_date ? t('solicitudes.vence', { fecha: fecha(r.due_date) }) : t('solicitudes.sinFecha')}</p>
              </div>
              <button
                type="button"
                disabled={!r.customer}
                aria-label={t('solicitudes.registrarDe', { nombre })}
                onClick={() => onRegistrar(r)}
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('solicitudes.registrar')}
              </button>
            </li>
          );
        })}
      </ul>
    </PanelAdaptable>
  );
}
