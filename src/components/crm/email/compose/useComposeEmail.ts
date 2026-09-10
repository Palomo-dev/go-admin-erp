'use client';

/**
 * Estado del compositor completo (ComposeEmailDialogFull): destinatarios,
 * asunto, modo bloques/HTML, plantilla, borrador IA, adjuntos, programación,
 * vista previa con debounce y envío por POST /api/email/send.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { emptyDocument, safeParseBlockDocument, type BlockDocument } from '@/lib/services/crm/email/blocks';
import type { EmailMessage, Template } from '@/lib/services/crm/email/types';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import { getVariables, previewEmail, sendEmail, type DocumentOption } from '../emailApi';
import type { EmailPreviewData } from '../EmailPreview';

export interface ComposeInit {
  opportunityId?: string;
  customerId?: string;
  customerEmail?: string | null;
  defaultSubject?: string;
  replyTo?: { email_message_id: string; subject: string };
}

export type ComposeMode = 'blocks' | 'html';

function splitEmails(v: string): string[] {
  return v.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useComposeEmail(init: ComposeInit, open: boolean) {
  const [to, setTo] = useState(init.customerEmail ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(init.replyTo ? (init.replyTo.subject.toLowerCase().startsWith('re:') ? init.replyTo.subject : `Re: ${init.replyTo.subject}`) : init.defaultSubject ?? '');
  const [preheader, setPreheader] = useState('');
  const [mode, setMode] = useState<ComposeMode>('blocks');
  const [doc, setDoc] = useState<BlockDocument>(() => emptyDocument());
  const [html, setHtml] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<DocumentOption[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [context, setContext] = useState<RenderContext | null>(null);
  const [preview, setPreview] = useState<EmailPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getVariables({ opportunity_id: init.opportunityId, customer_id: init.customerId })
      .then((r) => { if (!cancelled) setContext(r.data.values); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, init.opportunityId, init.customerId]);

  useEffect(() => {
    if (init.customerEmail && !to) setTo(init.customerEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init.customerEmail]);

  const contextIds = useCallback(() => ({ opportunity_id: init.opportunityId, customer_id: init.customerId }), [init.opportunityId, init.customerId]);

  useEffect(() => {
    if (!open) return;
    const hasContent = mode === 'blocks' ? doc.blocks.length > 0 : html.trim().length > 0;
    if (!hasContent) { setPreview(null); return; }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const r = await previewEmail({ ...(mode === 'blocks' ? { blocks: doc } : { html }), subject, preheader, context_ids: contextIds() });
        if (mySeq !== seq.current) return;
        setPreview({ html: r.data.html, text: r.data.text, subject: r.data.subject, preheader: r.data.preheader, missing: r.data.missing_variables });
        setPreviewError(null);
      } catch (err) {
        if (mySeq === seq.current) setPreviewError(err instanceof Error ? err.message : 'Error de vista previa');
      } finally {
        if (mySeq === seq.current) setPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [open, mode, doc, html, subject, preheader, contextIds]);

  const applyTemplate = useCallback((t: Template) => {
    setTemplateId(t.id);
    if (t.subject) setSubject(t.subject);
    if (t.preheader) setPreheader(t.preheader);
    if (t.engine === 'blocks' && t.blocks_json) {
      const parsed = safeParseBlockDocument(t.blocks_json);
      if (parsed.ok) { setDoc(parsed.doc); setMode('blocks'); return; }
    }
    setHtml(t.body_html ?? '');
    setMode('html');
  }, []);

  const applyDraft = useCallback((d: { subject: string; preheader: string; blocks: BlockDocument }) => {
    setSubject(d.subject);
    setPreheader(d.preheader);
    setDoc(d.blocks);
    setMode('blocks');
    setTemplateId(null);
  }, []);

  const toList = splitEmails(to);
  const ccList = splitEmails(cc);
  const bccList = splitEmails(bcc);
  const invalid = [...toList, ...ccList, ...bccList].filter((e) => !EMAIL_RE.test(e));
  const hasContent = mode === 'blocks' ? doc.blocks.length > 0 : html.trim().length > 0;
  const valid = toList.length > 0 && invalid.length === 0 && subject.trim().length > 0 && hasContent;

  const send = useCallback(async (): Promise<{ message: EmailMessage; scheduled: boolean } | null> => {
    if (!valid) return null;
    setSending(true);
    try {
      const r = await sendEmail({
        to: toList, cc: ccList.length ? ccList : undefined, bcc: bccList.length ? bccList : undefined,
        subject: subject.trim(), preheader: preheader || undefined,
        content: mode === 'blocks' ? { blocks: doc } : { html },
        attachments: attachments.map((a) => ({ document_id: a.id })),
        scheduled_at: scheduledAt, to_customer_id: init.customerId ?? null,
        related_type: init.opportunityId ? 'opportunity' : init.customerId ? 'customer' : undefined,
        related_id: init.opportunityId ?? init.customerId ?? undefined,
        in_reply_to: init.replyTo?.email_message_id ?? null,
        strict_variables: false,
        metadata: { source: 'compose_full', template_id: templateId ?? undefined },
      });
      toast({ title: r.scheduled ? 'Correo programado' : 'Correo enviado', description: `${toList.join(', ')}${r.warnings.length ? ` · ${r.warnings[0]}` : ''}` });
      return { message: r.data, scheduled: r.scheduled };
    } catch (err) {
      toast({ title: 'No se pudo enviar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      return null;
    } finally {
      setSending(false);
    }
  }, [valid, toList, ccList, bccList, subject, preheader, mode, doc, html, attachments, scheduledAt, init, templateId]);

  return {
    to, setTo, cc, setCc, bcc, setBcc, subject, setSubject, preheader, setPreheader, mode, setMode, doc, setDoc, html, setHtml,
    templateId, attachments, setAttachments, scheduledAt, setScheduledAt, context, preview, previewLoading, previewError,
    sending, valid, invalid, applyTemplate, applyDraft, send,
  };
}

export type ComposeApi = ReturnType<typeof useComposeEmail>;
