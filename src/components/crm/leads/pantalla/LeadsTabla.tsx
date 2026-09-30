'use client';

import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination } from '@/components/kit/Pagination';
import { LeadRow, LeadRowCargando, LeadRowEncabezado } from '@/components/crm/kit/LeadRow';
import type { AccionLead, LeadFila, PermisosLead } from '@/components/crm/kit/leadRowLogica';
import { estadoCasillaPagina } from './leadsPantallaLogica';

/**
 * Tabla de escritorio (Figma 765:446571): `LeadRow` del kit, casilla por
 * página (selección masiva, 765:447453) y paginación en el servidor.
 */
export interface LeadsTablaProps {
  filas: readonly LeadFila[];
  cargando: boolean;
  seleccion: ReadonlySet<string>;
  onSeleccion: (id: string, marcado: boolean) => void;
  onSeleccionPagina: (marcado: boolean) => void;
  onCalificar: (id: string) => void;
  onAccion: (accion: AccionLead, id: string) => void;
  permisos: PermisosLead;
  pagina: number;
  tamano: number;
  total: number;
  onPagina: (p: number) => void;
  onTamano: (n: number) => void;
}

export function LeadsTabla(p: LeadsTablaProps) {
  const t = useTranslations('crm.pantallaLeads');
  const ids = p.filas.map((f) => f.id);
  const casilla = estadoCasillaPagina(p.seleccion, ids);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse" aria-busy={p.cargando || undefined}>
          <thead>
            <LeadRowEncabezado
              casilla={
                <Checkbox
                  checked={casilla}
                  onCheckedChange={(v) => p.onSeleccionPagina(v === true)}
                  aria-label={t('seleccionarPagina')}
                  className="size-[18px] rounded"
                />
              }
            />
          </thead>
          <tbody>
            {p.cargando && p.filas.length === 0
              ? Array.from({ length: 8 }, (_, i) => <LeadRowCargando key={i} />)
              : p.filas.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    seleccionada={p.seleccion.has(lead.id)}
                    onSeleccionChange={(v) => p.onSeleccion(lead.id, v)}
                    onCalificar={p.onCalificar}
                    onAccion={p.onAccion}
                    permisos={p.permisos}
                  />
                ))}
          </tbody>
        </table>
      </div>
      <Pagination
        pagina={p.pagina}
        tamano={p.tamano}
        total={p.total}
        onPaginaChange={p.onPagina}
        onTamanoChange={p.onTamano}
        opcionesTamano={[25, 50, 100]}
        sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
        cargando={p.cargando}
        className="border-t border-line px-4 py-2"
      />
    </div>
  );
}
