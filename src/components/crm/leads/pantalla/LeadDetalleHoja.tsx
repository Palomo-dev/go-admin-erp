'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Hash, Mail, MapPin, Phone, TrendingUp, User, UserPlus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import { bandaScore, origenValido, TONO_BANDA, type LeadFila } from '@/components/crm/kit/leadRowLogica';
import { diasDesde, fechaCortaInstante } from '@/components/crm/kit/fechasCrm';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { EntradaActividad } from '@/components/crm/actividades/pantalla/EntradaActividad';
import { TimelineEntry } from '@/components/crm/kit/TimelineEntry';
import type { EntradaFeed } from '@/components/crm/actividades/pantalla/actividadesPantallaLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { DatosImportadosLead } from '@/components/crm/leads/DatosImportadosLead';
import { contactoImportado, tieneDatosImportados } from '@/lib/crm/importacionLeads/datosFicha';
import { eventoPrivadoDeLead, solicitudSinAtender, type ContextoEventoLead } from '@/lib/crm/eventoPrivadoLead';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePaginasModulo } from '@/lib/navigation/NavegacionVisible';
import type { LeadApi } from './leadsPantallaLogica';
import { EventoPrivadoTarjeta } from './EventoPrivadoTarjeta';
import { ReservaGrupoLeadDialog } from './ReservaGrupoLeadDialog';

/** Página de POS que aloja «Reservas de mesas»: si el menú no la deja ver, no hay botón. */
const PAGINA_RESERVAS = '/app/pos/reservas-mesas';

/** El instante `a` es posterior a `b` (ambos ISO; la actividad va antes que la solicitud). */
function posterior(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a ? Date.parse(a) : NaN;
  const y = b ? Date.parse(b) : NaN;
  return !Number.isNaN(x) && !Number.isNaN(y) && x > y;
}

/**
 * Detalle rápido del lead (Figma 767:2873 escritorio, 768:7837 móvil): hoja
 * lateral con las acciones rápidas, datos de contacto, calificación,
 * etiquetas y actividad reciente (`GET /api/crm/activities?customer_id=…`).
 * Pie: «Abrir ficha», «Calificar → crear oportunidad» y «⋯».
 *
 * Lead de evento privado del sitio (Figma 1951:941568): tarjeta «Evento
 * privado» con la última solicitud del formulario (`metadata.lead.capturas`),
 * «Crear reserva de grupo en <sede>», la fila «Inasistencias» en Calificación
 * y «Solicitud de evento privado» en la actividad. Sede e inasistencias salen
 * de `GET /api/crm/leads/[id]/evento`.
 */
export interface LeadDetalleHojaProps {
  lead: (LeadFila & { documento: string | null }) | null;
  api: LeadApi | null;
  onCerrar: () => void;
  onCalificar: (id: string) => void;
  onAsignar: (id: string) => void;
  onDescartar: (id: string) => void;
  permisos: { convertir: boolean; asignar: boolean; editar: boolean };
}

export function LeadDetalleHoja({ lead, api, onCerrar, onCalificar, onAsignar, onDescartar, permisos }: LeadDetalleHojaProps) {
  const t = useTranslations('crm.pantallaLeads.detalle');
  const tl = useTranslations('crm.kit.leads');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const [recientes, setRecientes] = useState<EntradaFeed[] | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [contexto, setContexto] = useState<{ estado: 'cargando' | 'listo' | 'error'; datos: ContextoEventoLead | null }>({ estado: 'cargando', datos: null });
  const [reservaAbierta, setReservaAbierta] = useState(false);
  const moneda = useMonedaOrganizacion();
  const paginasPos = usePaginasModulo('pos');
  const puedeReservar = !!paginasPos?.some((p) => p.href === PAGINA_RESERVAS);
  const id = lead?.id ?? null;
  const metadataLead = api?.metadata_lead;
  const evento = useMemo(() => eventoPrivadoDeLead(metadataLead), [metadataLead]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setRecientes(null);
    pedirCrm<EntradaFeed[]>(`/api/crm/activities?customer_id=${id}&limit=3`)
      .then(({ data }) => vivo && setRecientes(data))
      .catch(() => vivo && setRecientes([]));
    return () => {
      vivo = false;
    };
  }, [id, recarga]);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setContexto({ estado: 'cargando', datos: null });
    pedirCrm<ContextoEventoLead>(`/api/crm/leads/${id}/evento`)
      .then(({ data }) => vivo && setContexto({ estado: 'listo', datos: data }))
      .catch(() => vivo && setContexto({ estado: 'error', datos: null }));
    return () => {
      vivo = false;
    };
  }, [id, recarga]);
  useEffect(() => setReservaAbierta(false), [id]);
  useEffect(() => {
    const oir = () => setRecarga((n) => n + 1);
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, []);

  if (!lead || !api) return null;
  const nombre = lead.full_name?.trim() || tl('sinNombre');
  const contacto = lead.contacto?.trim() || contactoImportado(api.metadata_importacion, api.metadata_lead);
  const otrosTelefonos = lead.telefonosExtra ?? [];
  const origen = origenValido(lead.lead_source);
  const banda = bandaScore(lead.lead_score);
  const dias = diasDesde(lead.last_contact_at, new Date(), timezone);
  const menu = [
    ...(permisos.asignar ? [{ id: 'asignar', etiqueta: tl('menu.asignar'), icono: UserPlus, onSelect: () => onAsignar(lead.id) }] : []),
    ...(permisos.editar ? [{ id: 'descartar', etiqueta: tl('menu.descartar'), icono: XCircle, destructiva: true, onSelect: () => onDescartar(lead.id) }] : []),
  ];
  const fila = (etiqueta: string, valor: string) => (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
      <dt className="text-fg-muted">{etiqueta}</dt>
      <dd className="text-fg">{valor}</dd>
    </div>
  );
  const seccion = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';
  const sede = contexto.datos?.sede ?? null;
  const inasistencias = contexto.datos?.inasistencias ?? null;
  const textoInasistencias =
    inasistencias && inasistencias.total > 0
      ? inasistencias.ultima
        ? t(inasistencias.ultima.sede ? 'inasistenciasUltimaSede' : 'inasistenciasUltima', {
            n: inasistencias.total,
            fecha: formatPlainDate(inasistencias.ultima.fecha, { day: 'numeric', month: 'short' }),
            sede: inasistencias.ultima.sede ?? '',
          })
        : t('inasistenciasValor', { n: inasistencias.total })
      : null;
  const solicitud = evento
    ? {
        id: `solicitud-evento-${lead.id}`,
        tipo: 'pedido' as const,
        titulo: t('evento.solicitud'),
        detalle: [evento.tipo, evento.invitados ? t('evento.invitadosN', { n: evento.invitados }) : null, evento.branchId == null ? t('evento.sinSede') : sede?.nombre].filter(Boolean).join(' · ') || null,
        ocurrioEn: evento.capturadoEn,
        autor: t('evento.sitioWeb'),
        estado: solicitudSinAtender(evento.capturadoEn, lead.last_contact_at) ? { etiqueta: t('evento.nuevo'), tono: 'exito' as const } : null,
      }
    : null;

  return (
    <HojaDetalle
      abierto
      onAbiertoChange={(x) => !x && onCerrar()}
      titulo={nombre}
      subtitulo={
        <span className="flex flex-wrap gap-1">
          <Badge tono="marca" tamano="sm">{t('lead')}</Badge>
          {origen && <Badge tono="informacion" apariencia="contorno" tamano="sm">{tl(`origen.${origen}`)}</Badge>}
          {banda && <Badge tono={TONO_BANDA[banda]} tamano="sm">{tl('score', { score: lead.lead_score ?? 0, banda: tl(`banda.${banda}`) })}</Badge>}
        </span>
      }
      pie={
        <>
          <Link href={`/app/clientes/${lead.id}`} className={clasesBoton({ variante: 'secundario' })}>
            <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('abrirFicha')}
          </Link>
          {permisos.convertir && (
            <button type="button" onClick={() => onCalificar(lead.id)} className={clasesBoton({ className: 'flex-1' })}>
              <TrendingUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('calificar')}
            </button>
          )}
          {menu.length > 0 && <RowActionsMenu acciones={menu} titulo={nombre} orientacion="horizontal" tamano="md" />}
        </>
      }
    >
      <AccionesRapidasCrm variante="drawer" clienteId={lead.id} cliente={{ id: lead.id, full_name: api.full_name, email: api.email, phone: api.phone, do_not_call: api.do_not_call }} />
      <section className="flex flex-col gap-2">
        <h3 className={seccion}>{t('contacto')}</h3>
        <ul className="flex flex-col gap-1.5 text-[13px] text-fg">
          {contacto && <li className="flex items-center gap-2"><User aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />{contacto}</li>}
          {api.email && <li className="flex items-center gap-2"><Mail aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />{api.email}</li>}
          {api.phone && <li className="flex items-center gap-2"><Phone aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />{api.phone}</li>}
          {otrosTelefonos.map((tel) => (
            <li key={tel} className="flex items-center gap-2"><Phone aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />{tel}</li>
          ))}
          {lead.documento && <li className="flex items-center gap-2"><Hash aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />{lead.documento}</li>}
          {(api.address || api.city) && (
            <li className="flex items-start gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
              <span>{[api.address, api.city].filter(Boolean).join(' · ')}</span>
            </li>
          )}
          {!api.email && !api.phone && !lead.documento && <li className="text-fg-muted">{tl('sinContacto')}</li>}
        </ul>
      </section>
      {tieneDatosImportados(api.metadata_importacion, api.metadata_lead) && (
        <section className="flex flex-col gap-2">
          <h3 className={seccion}>{t('datosArchivo')}</h3>
          <DatosImportadosLead importacion={api.metadata_importacion} lead={api.metadata_lead} compacto />
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className={seccion}>{t('calificacion')}</h3>
        <dl className="flex flex-col gap-1.5">
          {fila(t('responsable'), lead.responsable?.nombre ?? tl('sinResponsable'))}
          {fila(t('capturado'), fechaCortaInstante(api.created_at, timezone, idioma) || '—')}
          {fila(t('ultimoContacto'), dias === null ? tl('nuncaContactado') : tl('haceDias', { dias }))}
          {textoInasistencias && fila(t('inasistencias'), textoInasistencias)}
        </dl>
      </section>
      {evento && (
        <EventoPrivadoTarjeta
          evento={evento}
          sede={sede?.nombre ?? null}
          estadoSede={contexto.estado}
          formatearMonto={(v) => moneda.formatear(v)}
          onCrearReserva={puedeReservar && sede ? () => setReservaAbierta(true) : undefined}
        />
      )}
      <section className="flex flex-col gap-2">
        <h3 className={seccion}>{t('etiquetas')}</h3>
        <span className="flex flex-wrap gap-1">
          {(lead.tags ?? []).length ? (lead.tags ?? []).map((tag) => <Badge key={tag} tono="neutro" apariencia="contorno" tamano="sm">{tag}</Badge>) : <span className="text-[13px] text-fg-muted">{t('sinEtiquetas')}</span>}
        </span>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className={seccion}>{t('actividad')}</h3>
        {recientes === null ? (
          <div aria-busy="true" className="h-16 animate-pulse rounded-xl bg-subtle" />
        ) : recientes.length === 0 && !solicitud ? (
          <p className="text-[13px] text-fg-muted">{t('sinActividad')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {solicitud && !recientes.some((e) => posterior(e.ocurrio_en, solicitud.ocurrioEn)) && <TimelineEntry entrada={solicitud} />}
            {recientes.map((e, i) => (
              <Fragment key={`${e.fuente}-${e.id}`}>
                <EntradaActividad entrada={e} />
                {solicitud && posterior(e.ocurrio_en, solicitud.ocurrioEn) && !posterior(recientes[i + 1]?.ocurrio_en, solicitud.ocurrioEn) && <TimelineEntry entrada={solicitud} />}
              </Fragment>
            ))}
          </div>
        )}
      </section>
      {evento && sede && puedeReservar && (
        <ReservaGrupoLeadDialog
          abierto={reservaAbierta}
          onAbiertoChange={setReservaAbierta}
          sede={sede}
          lead={{ id: lead.id, nombre, correo: api.email, telefono: api.phone }}
          evento={evento}
        />
      )}
    </HojaDetalle>
  );
}
