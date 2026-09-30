'use client';

import { useTranslations } from 'next-intl';
import { Camera, FileText, Mail, MapPin, Phone, Sparkles } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { QuickActionsBarCrm } from './QuickActionsBarCrm';
import { documento, esClienteNuevo, etapaCicloValida, TONO_CICLO, tonoSalud, ubicacion, type ClienteIdentidad } from './customerIdentityCardLogica';
import type { AccionRapidaCrm, EstadoAccionRapida } from './quickActionLogica';

/**
 * Cabecera de identidad del cliente (Figma `CustomerIdentityCard`
 * 329:108665, sección Clientes; el CRM la reutiliza en la ficha única):
 * avatar (con «cambiar foto»), tipo, etapa del ciclo de vida, salud, nivel,
 * «Nuevo», documento, correo, teléfono y ubicación; empresas vinculadas
 * (persona) o contacto principal (empresa); etiquetas; y la barra de
 * acciones rápidas `Variant=cliente` con «Nueva oportunidad».
 */
export interface CustomerIdentityCardProps {
  cliente: ClienteIdentidad;
  /** Persona: empresas a las que está vinculada. */
  empresas?: readonly { id: string; nombre: string; principal?: boolean }[];
  /** Empresa: su contacto principal. */
  contactoPrincipal?: { id: string; nombre: string } | null;
  /** Nivel del programa de fidelización («Oro»), si la organización lo usa. */
  nivel?: string | null;
  onAbrirCliente?: (id: string) => void;
  onCambiarFoto?: () => void;
  estadosAcciones?: readonly EstadoAccionRapida[];
  onAccion?: (accion: AccionRapidaCrm) => void;
  onNuevaOportunidad?: () => void;
  puedeCrearOportunidad?: boolean;
  cargando?: boolean;
  ahora?: Date;
  className?: string;
}

export function CustomerIdentityCard(p: CustomerIdentityCardProps) {
  const { cliente: c, ahora = new Date() } = p;
  const t = useTranslations('crm.kit.identidad');
  const { timezone } = useFormatDate();
  if (p.cargando) return <div aria-busy="true" aria-label={t('cargando')} className={cn('h-[183px] animate-pulse rounded-xl border border-line bg-subtle', p.className)} />;

  const nombre = c.full_name?.trim() || t('sinNombre');
  const empresa = c.customer_type === 'company';
  const ciclo = etapaCicloValida(c.lifecycle_stage);
  const salud = tonoSalud(c.health_score);
  const lugar = ubicacion(c);
  const dato = (Icono: typeof Phone, texto: string, etiqueta: string) =>
    texto ? (
      <span className="inline-flex items-center gap-1.5">
        <Icono aria-label={etiqueta} className="size-3.5 text-fg-muted" strokeWidth={1.5} />
        {texto}
      </span>
    ) : null;
  const chip = (id: string, texto: string) =>
    p.onAbrirCliente ? (
      <button key={id} type="button" onClick={() => p.onAbrirCliente?.(id)} className="rounded-full bg-subtle px-2.5 py-0.5 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{texto}</button>
    ) : (
      <span key={id} className="rounded-full bg-subtle px-2.5 py-0.5 text-[13px] font-medium text-fg">{texto}</span>
    );

  return (
    <section aria-label={nombre} className={cn('flex flex-col gap-4 rounded-xl border border-line bg-surface p-4', p.className)}>
      <div className="flex items-start gap-4">
        <span className="relative shrink-0">
          <AvatarIniciales nombre={nombre} src={c.avatar_url} tamano="lg" />
          {p.onCambiarFoto && (
            <button type="button" aria-label={t('cambiarFoto')} onClick={p.onCambiarFoto} className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-line bg-surface text-fg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Camera aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="sr-only">{nombre}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tono="neutro" tamano="sm">{t(empresa ? 'empresa' : 'persona')}</Badge>
            {ciclo && <Badge tono={TONO_CICLO[ciclo]} tamano="sm">{t(`ciclo.${ciclo}`)}</Badge>}
            {salud && <Badge tono={salud} apariencia="contorno" tamano="sm">{t('salud', { score: c.health_score ?? 0 })}</Badge>}
            {p.nivel && <Badge tono="advertencia" apariencia="contorno" tamano="sm">{p.nivel}</Badge>}
            {esClienteNuevo(c.created_at, ahora, timezone) && <Badge tono="advertencia" tamano="sm" icono={Sparkles}>{t('nuevo')}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-secondary">
            {dato(FileText, documento(c), t('documento'))}
            {dato(Mail, c.email?.trim() ?? '', t('correo'))}
            {dato(Phone, c.phone?.trim() ?? '', t('telefono'))}
            {dato(MapPin, lugar, t('ubicacion'))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {empresa ? (
              <>
                <span>{t('contactoPrincipal')}</span>
                {p.contactoPrincipal ? chip(p.contactoPrincipal.id, p.contactoPrincipal.nombre) : <span>{t('sinContacto')}</span>}
              </>
            ) : (
              (p.empresas?.length ?? 0) > 0 && (
                <>
                  <span>{t('vinculadoA')}</span>
                  {p.empresas?.map((e) => chip(e.id, e.nombre))}
                </>
              )
            )}
            {(c.tags?.length ?? 0) > 0 && (
              <>
                <span>{t('etiquetas')}</span>
                {c.tags?.map((tag) => <Badge key={tag} tono="neutro" apariencia="contorno" tamano="sm">{tag}</Badge>)}
              </>
            )}
          </div>
        </div>
      </div>
      <QuickActionsBarCrm variante="cliente" estados={p.estadosAcciones} onAccion={p.onAccion} onNuevaOportunidad={p.onNuevaOportunidad} puedeCrearOportunidad={p.puedeCrearOportunidad && !!p.onNuevaOportunidad} className="rounded-lg border border-line p-2" />
    </section>
  );
}
