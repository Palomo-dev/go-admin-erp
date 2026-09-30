'use client';

import { useTranslations } from 'next-intl';
import { Eye, MessageSquare, Phone, Tags, TrendingUp, UserPlus, XCircle, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ListCard } from '@/components/kit/ListCard';
import { CargarMas } from '@/components/crm/kit/CargarMas';
import { accionesLead, bandaScore, detalleContacto, diasSinContacto, origenValido, TONO_BANDA, type AccionLead, type LeadFila, type PermisosLead } from '@/components/crm/kit/leadRowLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

/**
 * Lista móvil de leads (Figma 768:6419, 768:7017 «cargando más», 768:7203
 * selección): tarjeta con avatar, contacto, «origen · responsable · último
 * contacto», score y menú «⋮»; «Cargar 25 más» acumula (`CargarMas`).
 * Mantener pulsado entra en modo selección.
 */
export interface LeadsListaMovilProps {
  filas: readonly LeadFila[];
  total: number;
  cargando: boolean;
  error?: string | null;
  seleccion: ReadonlySet<string>;
  modoSeleccion: boolean;
  onModoSeleccion: () => void;
  onSeleccion: (id: string, marcado: boolean) => void;
  onAbrir: (id: string) => void;
  onAccion: (accion: AccionLead, id: string) => void;
  onCalificar: (id: string) => void;
  permisos: PermisosLead;
  onCargarMas: () => void;
  ahora?: Date;
}

const ICONO: Record<AccionLead, LucideIcon> = { ver: Eye, llamar: Phone, whatsapp: MessageSquare, asignar: UserPlus, etiquetar: Tags, descartar: XCircle };

export function LeadsListaMovil(p: LeadsListaMovilProps) {
  const t = useTranslations('crm.kit.leads');
  const { timezone } = useFormatDate();
  const ahora = p.ahora ?? new Date();
  return (
    <div className="flex flex-col gap-2">
      {p.filas.map((lead) => {
        const nombre = lead.full_name?.trim() || t('sinNombre');
        const origen = origenValido(lead.lead_source);
        const banda = bandaScore(lead.lead_score);
        const dias = diasSinContacto(lead, ahora, timezone);
        const meta = [origen ? t(`origen.${origen}`) : null, lead.responsable?.nombre ?? t('sinResponsable'), dias === null ? t('nuncaContactado') : t('haceDias', { dias })].filter(Boolean).join(' · ');
        const acciones = [
          ...(p.permisos.convertir !== false ? [{ id: 'calificar', etiqueta: t('calificar'), icono: TrendingUp, onSelect: () => p.onCalificar(lead.id) }] : []),
          ...accionesLead(lead, p.permisos).map((id) => ({ id, etiqueta: t(`menu.${id}`), icono: ICONO[id], destructiva: id === 'descartar', onSelect: () => p.onAccion(id, lead.id) })),
        ];
        return (
          <ListCard
            key={lead.id}
            avatar={{ nombre, src: lead.avatar_url }}
            titulo={nombre}
            insignia={banda ? <Badge tono={TONO_BANDA[banda]} tamano="sm">{t('score', { score: lead.lead_score ?? 0, banda: t(`banda.${banda}`) })}</Badge> : undefined}
            subtitulo={detalleContacto(lead) || t('sinContacto')}
            meta={meta}
            onClick={() => p.onAbrir(lead.id)}
            acciones={acciones}
            seleccionable={p.modoSeleccion}
            seleccionado={p.seleccion.has(lead.id)}
            onSeleccionChange={(v) => p.onSeleccion(lead.id, v)}
            onMantenerPulsado={p.onModoSeleccion}
          />
        );
      })}
      <CargarMas mostrados={p.filas.length} total={p.total} tamanoPagina={25} cargando={p.cargando} error={p.error} onCargar={p.onCargarMas} entidad="leads" />
    </div>
  );
}
