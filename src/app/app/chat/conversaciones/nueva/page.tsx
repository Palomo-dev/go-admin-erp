'use client';

/**
 * Chat › Nueva conversación (Figma 91-chat-13).
 *
 * 1. Canal y cliente (buscar o «crear cliente rápido»).
 * 2. Mensaje inicial:
 *    - WhatsApp: plantilla aprobada + variables + vista previa, con el mismo
 *      hook y selector del CRM (`useWhatsAppCompose`, `TemplatePicker`) y envío
 *      por `/api/crm/whatsapp/send`, que crea la conversación.
 *    - Los demás canales: se crea la conversación y el primer mensaje sale por
 *      el camino único `enviarMensajeConversacion`.
 * 3. Organización (opcional): prioridad, asignación (por el servidor) y etiquetas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvisoTonal, CustomerPicker, EmptyState, Skeleton, clasesBoton } from '@/components/kit';
import type { ClientePicker } from '@/components/kit';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import NewConversationService, { type Channel, type ConversationTag, type Customer, type QuickCustomerData } from '@/lib/services/newConversationService';
import ConversationDetailService from '@/lib/services/conversationDetailService';
import { enviarMensajeConversacion, ErrorEnvio, motivoErrorEnvio } from '@/lib/services/chat/envioMensaje';
import { chatApi } from '@/lib/services/chat/chatApi';
import { CanalIcono } from '@/components/chat/ui/CanalIcono';
import { canalDeTipo } from '@/components/chat/ui/canal';
import { useAgentesChat, type Etiqueta } from '@/components/chat/conversations/useConversacion';
import { SelectorAgente } from '@/components/chat/conversations/panel/SelectorAgente';
import { EtiquetasConversacion } from '@/components/chat/conversations/panel/EtiquetasConversacion';
import QuickCustomerDialog from '@/components/chat/conversations/nuevo/QuickCustomerDialog';
import { useWhatsAppCompose } from '@/components/crm/whatsapp/compose/useWhatsAppCompose';
import { TemplatePicker } from '@/components/crm/whatsapp/compose/TemplatePicker';
import { BubblePreview } from '@/components/crm/whatsapp/compose/BubblePreview';
import { ApiError } from '@/components/crm/whatsapp/api';

type Prioridad = 'low' | 'normal' | 'high' | 'urgent';

function aPicker(c: Customer): ClientePicker {
  return { id: c.id, nombre: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.phone || '—', documento: c.doc_number, correo: c.email, telefono: c.phone };
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-fg">{titulo}</h2>
        {descripcion ? <p className="text-sm text-fg-secondary">{descripcion}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function NuevaConversacionPage() {
  const t = useTranslations('chatBandeja.nueva');
  const tp = useTranslations('chatUi.prioridad');
  const te = useTranslations('chatUi.composer.errores');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id as number | undefined;
  const { agentes } = useAgentesChat();
  const yo = agentes.find((a) => a.esYo) ?? null;

  const [canales, setCanales] = useState<Channel[] | null>(null);
  const [etiquetas, setEtiquetas] = useState<ConversationTag[]>([]);
  const [canalId, setCanalId] = useState('');
  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('normal');
  const [asignado, setAsignado] = useState<number | null | undefined>(undefined);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [crearCliente, setCrearCliente] = useState(false);
  const [creando, setCreando] = useState(false);

  const servicio = useMemo(() => (organizationId ? new NewConversationService(organizationId) : null), [organizationId]);
  const canal = canales?.find((c) => c.id === canalId) ?? null;
  const esWhatsApp = canal?.type === 'whatsapp';
  const asignadoFinal = asignado === undefined ? yo?.memberId ?? null : asignado;

  useCabeceraMovil({ modo: 'page', titulo: t('titulo'), subtitulo: '', volverA: '/app/chat/bandeja' });

  useEffect(() => {
    if (!servicio) return;
    Promise.all([servicio.getActiveChannels(), servicio.getConversationTags().catch(() => [])])
      .then(([ch, tags]) => {
        setCanales(ch);
        setEtiquetas(tags);
        setCanalId((cur) => cur || ch.find((c) => c.type === 'whatsapp')?.id || ch[0]?.id || '');
      })
      .catch(() => setCanales([]));
  }, [servicio]);

  // WhatsApp: plantillas, variables y vista previa con el hook del CRM.
  const wa = useWhatsAppCompose({ customerId: esWhatsApp ? cliente?.id ?? null : null, channelId: esWhatsApp ? canalId : null, enabled: esWhatsApp });
  const { setChannelId: fijarCanalWa, setTab: fijarPestanaWa } = wa;
  useEffect(() => {
    if (!esWhatsApp) return;
    fijarCanalWa(canalId);
    fijarPestanaWa('template');
  }, [esWhatsApp, canalId, fijarCanalWa, fijarPestanaWa]);

  const puedeCrear = !!canal && !!cliente && !creando && (esWhatsApp ? wa.canSend && wa.tab === 'template' : mensaje.trim().length > 0);

  const organizar = async (conversationId: string) => {
    if (!organizationId) return;
    const detalle = new ConversationDetailService(organizationId);
    const tareas: Promise<unknown>[] = [];
    if (esWhatsApp && prioridad !== 'normal') tareas.push(detalle.updateConversationPriority(conversationId, prioridad));
    if (esWhatsApp) tareas.push(...tagIds.map((id) => detalle.addTag(conversationId, id).catch(() => undefined)));
    if (asignadoFinal != null) tareas.push(chatApi.asignar(conversationId, asignadoFinal));
    const r = await Promise.allSettled(tareas);
    if (r.some((x) => x.status === 'rejected')) toast({ title: t('avisos.organizarParcial'), variant: 'destructive' });
  };

  const crear = async () => {
    if (!organizationId || !servicio || !canal || !cliente) return;
    setCreando(true);
    try {
      let conversationId: string;
      if (esWhatsApp) {
        const r = await wa.send();
        conversationId = r.conversation_id;
      } else {
        const { data } = await supabase.auth.getUser();
        const memberId = yo?.memberId ?? (data.user ? await servicio.getCurrentMemberId(data.user.id) : null);
        if (!memberId) {
          toast({ title: t('avisos.sinPermiso'), variant: 'destructive' });
          return;
        }
        conversationId = await servicio.createConversation({ channel_id: canal.id, customer_id: cliente.id, priority: prioridad, tag_ids: tagIds }, data.user?.id ?? '', memberId);
        await enviarMensajeConversacion({ organizationId, conversacion: { id: conversationId, channel_id: canal.id, tipoCanal: canal.type }, mensaje: { texto: mensaje }, supabase });
      }
      await organizar(conversationId);
      toast({ title: t('avisos.creada') });
      router.push(`/app/chat/conversaciones/${conversationId}`);
    } catch (e) {
      const codigo = e instanceof ErrorEnvio ? e.codigo : e instanceof ApiError ? e.code : null;
      const motivo = motivoErrorEnvio(codigo);
      toast({ title: t('avisos.error'), description: motivo === 'generico' && e instanceof Error ? e.message : te(motivo), variant: 'destructive' });
    } finally {
      setCreando(false);
    }
  };

  const crearRapido = async (datos: QuickCustomerData) => {
    if (!servicio) return;
    const c = await servicio.createQuickCustomer(datos);
    setCliente(aPicker(c));
    toast({ title: t('avisos.clienteCreado', { nombre: c.full_name }) });
  };

  const etiquetasSel: Etiqueta[] = etiquetas.filter((e) => tagIds.includes(e.id));

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-6xl px-4 py-5 lg:px-6">
        <div className="mb-5 hidden items-start gap-3 lg:flex">
          <Link href="/app/chat/bandeja" aria-label={t('volver')} className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-secondary hover:bg-hover">
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
          <div>
            <p className="text-xs text-fg-muted">{t('migas')}</p>
            <h1 className="text-xl font-semibold text-fg">{t('titulo')}</h1>
            <p className="text-sm text-fg-secondary">{t('subtitulo')}</p>
          </div>
        </div>

        {canales === null ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ) : canales.length === 0 ? (
          <EmptyState titulo={t('sinCanalesTitulo')} descripcion={t('sinCanalesDescripcion')} accion={{ etiqueta: t('conectar'), href: '/app/chat/canales' }} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <Seccion titulo={t('paso1')} descripcion={t('paso1Ayuda')}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium text-fg">
                    <span className="block">{t('canal')} *</span>
                    <Select value={canalId} onValueChange={setCanalId}>
                      <SelectTrigger aria-label={t('canal')}>
                        <SelectValue placeholder={t('elegirCanal')} />
                      </SelectTrigger>
                      <SelectContent>
                        {canales.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-2">
                              <CanalIcono canal={canalDeTipo(c.type)} size={16} />
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="space-y-1.5">
                    <CustomerPicker
                      layout="campo"
                      etiqueta={`${t('cliente')} *`}
                      cliente={cliente}
                      buscar={async (texto) => (servicio ? (await servicio.searchCustomers(texto)).map(aPicker) : [])}
                      onCambiar={setCliente}
                      onQuitar={() => setCliente(null)}
                      onCrear={() => setCrearCliente(true)}
                    />
                    <p className="text-xs text-fg-muted">{t('clienteAyuda')}</p>
                  </div>
                </div>
              </Seccion>

              <Seccion titulo={t('paso2')} descripcion={esWhatsApp ? t('paso2WhatsApp') : t('paso2Ayuda')}>
                {esWhatsApp ? (
                  !cliente ? (
                    <p className="text-sm text-fg-muted">{t('elegirClientePrimero')}</p>
                  ) : (
                    <div className="space-y-4">
                      {wa.window && !wa.window.can_contact ? <AvisoTonal tono="peligro" titulo={t('sinConsentimiento')} compacto /> : null}
                      <TemplatePicker
                        templates={wa.templates}
                        loading={wa.loadingTemplates}
                        value={wa.templateId}
                        onChange={wa.setTemplateId}
                        variables={wa.variables}
                        onVariable={wa.setVariable}
                        preview={wa.preview}
                        previewing={wa.previewing}
                      />
                      {!wa.loadingTemplates && wa.templates.length === 0 ? <AvisoTonal tono="advertencia" titulo={t('sinPlantillas')} compacto /> : null}
                      {wa.preview ? (
                        <div className="rounded-xl bg-subtle p-4">
                          <p className="mb-2 text-xs font-medium text-fg-muted">{t('asiLoRecibira')}</p>
                          <BubblePreview header={wa.preview.header} body={wa.preview.body} footer={wa.preview.footer} buttons={wa.preview.buttons} />
                        </div>
                      ) : null}
                    </div>
                  )
                ) : (
                  <label className="block space-y-1.5 text-sm font-medium text-fg">
                    <span className="block">{t('mensaje')} *</span>
                    <textarea
                      rows={4}
                      value={mensaje}
                      onChange={(e) => setMensaje(e.target.value)}
                      placeholder={t('mensajePlaceholder')}
                      className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </label>
                )}
              </Seccion>

              <Seccion titulo={t('paso3')}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium text-fg">
                    <span className="block">{t('prioridad')}</span>
                    <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
                      <SelectTrigger aria-label={t('prioridad')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                          <SelectItem key={p} value={p}>
                            {tp(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="space-y-1.5 text-sm font-medium text-fg">
                    <span className="block">{t('asignarA')}</span>
                    <SelectorAgente agentes={agentes} asignado={asignadoFinal} onAsignar={(id) => setAsignado(id)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-fg">{t('etiquetas')}</span>
                  <EtiquetasConversacion
                    actuales={etiquetasSel}
                    disponibles={etiquetas}
                    onAgregar={(id) => setTagIds((v) => [...v, id])}
                    onQuitar={(id) => setTagIds((v) => v.filter((x) => x !== id))}
                    textoAgregar={t('agregarEtiqueta')}
                  />
                </div>
              </Seccion>

              <div className="flex justify-end gap-3 pb-6">
                <Link href="/app/chat/bandeja" className={clasesBoton({ variante: 'secundario' })}>
                  {t('cancelar')}
                </Link>
                <button type="button" onClick={() => void crear()} disabled={!puedeCrear} aria-busy={creando} className={clasesBoton()}>
                  <Send aria-hidden="true" className="size-4" />
                  {creando ? t('creando') : t('crear')}
                </button>
              </div>
            </div>

            <aside className="h-fit space-y-3 rounded-xl border border-line-info bg-info-subtle p-4 text-sm text-info-text">
              <h2 className="font-semibold">{t('antesTitulo')}</h2>
              <ul className="list-disc space-y-2 pl-4">
                <li>{t('antes1')}</li>
                <li>{t('antes2')}</li>
                <li>{t('antes3')}</li>
                <li>{t('antes4')}</li>
              </ul>
            </aside>
          </div>
        )}
      </div>

      <QuickCustomerDialog isOpen={crearCliente} onClose={() => setCrearCliente(false)} onSave={crearRapido} />
    </div>
  );
}
