'use client';

/**
 * Estado del compositor de WhatsApp (FASE-16 §5.2 `useWhatsAppCompose`):
 * canal, ventana (poll 60 s), plantillas aprobadas, variables, preview,
 * adjunto, programación y envío. Sin react-query.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, waApi, type ChannelSummary, type PreviewResult, type SendResult, type WhatsAppTemplate, type WindowInfo } from '../api';

export type ComposeTab = 'text' | 'template';
export interface MediaValue { url: string; mime: string; filename?: string; caption?: string }

export interface ComposeInit {
  customerId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  channelId?: string | null;
  enabled: boolean;
}

export function useWhatsAppCompose(init: ComposeInit) {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [channelId, setChannelId] = useState<string | null>(init.channelId ?? null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  /** Admin de organización: lanzar/pausar campañas y el CRUD de plantillas lo exigen. */
  const [canManage, setCanManage] = useState(false);
  const [window, setWindow] = useState<WindowInfo | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateId, setTemplateIdState] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [tab, setTab] = useState<ComposeTab>('text');
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaValue | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const channel = useMemo(() => channels.find((c) => c.id === channelId) ?? null, [channels, channelId]);
  const capabilities = window?.channel.capabilities ?? channel?.capabilities ?? { templates: true, media: true, free_text: true };

  // Canales
  useEffect(() => {
    if (!init.enabled) return;
    let cancelled = false;
    setLoadingChannels(true);
    waApi.channels().then((r) => {
      if (cancelled) return;
      setChannels(r.data);
      setCanManage(r.can_manage === true);
      setChannelId((cur) => cur && r.data.some((c) => c.id === cur) ? cur : r.default_channel_id);
    }).catch((e) => !cancelled && setError(e instanceof ApiError ? e : new ApiError(String(e), 'ERROR', 500))).finally(() => !cancelled && setLoadingChannels(false));
    return () => { cancelled = true; };
  }, [init.enabled]);

  // Ventana (poll 60 s)
  const refreshWindow = useCallback(async () => {
    if (!init.customerId || !channelId) return;
    try {
      const w = await waApi.window(init.customerId, channelId);
      setWindow(w);
      setWindowError(null);
      setTab((t) => (!w.is_open && !w.channel.capabilities.free_text ? 'template' : t));
    } catch (e) {
      setWindowError(e instanceof Error ? e.message : 'No se pudo consultar la ventana');
    }
  }, [init.customerId, channelId]);

  useEffect(() => {
    if (!init.enabled) return;
    void refreshWindow();
    const t = setInterval(() => void refreshWindow(), 60_000);
    return () => clearInterval(t);
  }, [init.enabled, refreshWindow]);

  // Ventana cerrada → pestaña plantilla por defecto (si el canal las admite)
  useEffect(() => {
    if (window && !window.is_open && window.channel.provider !== 'baileys') setTab('template');
  }, [window]);

  // Plantillas aprobadas
  useEffect(() => {
    if (!init.enabled || !channelId || !capabilities.templates) return;
    let cancelled = false;
    setLoadingTemplates(true);
    waApi.templates({ status: 'APPROVED', channelId }).then((r) => !cancelled && setTemplates(r.data)).catch(() => undefined).finally(() => !cancelled && setLoadingTemplates(false));
    return () => { cancelled = true; };
  }, [init.enabled, channelId, capabilities.templates]);

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);

  const setTemplateId = useCallback((id: string | null) => {
    setTemplateIdState(id);
    setVariables({});
    setPreview(null);
  }, []);

  // Preview con variables resueltas (debounce 300 ms)
  useEffect(() => {
    if (!templateId || !init.enabled) return;
    let cancelled = false;
    setPreviewing(true);
    const t = setTimeout(() => {
      waApi.preview(templateId, { context: { customerId: init.customerId ?? null, opportunityId: init.opportunityId ?? null }, variables, channelId })
        .then((p) => !cancelled && setPreview(p))
        .catch((e) => !cancelled && setError(e instanceof ApiError ? e : null))
        .finally(() => !cancelled && setPreviewing(false));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [templateId, variables, channelId, init.customerId, init.opportunityId, init.enabled]);

  const setVariable = useCallback((k: string, v: string) => setVariables((cur) => ({ ...cur, [k]: v })), []);

  const canSend = useMemo(() => {
    if (sending || !channelId || !channel || channel.status !== 'active') return false;
    if (window && !window.can_contact) return false;
    if (tab === 'template') return !!templateId && !!preview && preview.missing.length === 0 && preview.status === 'APPROVED';
    if (media) return window?.is_open !== false || channel.provider === 'baileys';
    return text.trim().length > 0 && (window?.is_open !== false || channel.provider === 'baileys');
  }, [sending, channelId, channel, window, tab, templateId, preview, media, text]);

  const send = useCallback(async (opts: { force?: boolean } = {}): Promise<SendResult> => {
    setSending(true);
    setError(null);
    try {
      const r = await waApi.send({
        customerId: init.customerId ?? null,
        opportunityId: init.opportunityId ?? null,
        conversationId: init.conversationId ?? null,
        channelId,
        text: tab === 'text' && !media ? text.trim() : null,
        template: tab === 'template' && templateId ? { templateId, variables } : null,
        media: tab === 'text' && media ? { ...media, caption: media.caption ?? (text.trim() || undefined) } : null,
        scheduledAt,
        force: opts.force,
        clientRequestId: requestId.current,
        purpose: preview?.category === 'marketing' ? 'marketing' : 'utility',
      });
      requestId.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return r;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : 'Error', 'ERROR', 500);
      setError(err);
      throw err;
    } finally {
      setSending(false);
    }
  }, [init.customerId, init.opportunityId, init.conversationId, channelId, tab, text, media, templateId, variables, scheduledAt, preview]);

  return {
    channels, channelId, setChannelId, loadingChannels, canManage, channel, capabilities,
    window, windowError, refreshWindow,
    templates, loadingTemplates, template, templateId, setTemplateId, variables, setVariable,
    preview, previewing,
    tab, setTab, text, setText, media, setMedia, scheduledAt, setScheduledAt,
    sending, error, setError, canSend, send,
  };
}

export type ComposeState = ReturnType<typeof useWhatsAppCompose>;
