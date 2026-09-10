'use client';

/**
 * Modo masivo del compositor: campaña `manual` (opportunity_ids/customer_ids)
 * → materialize (conteo + exclusiones) → launch (inmediato).
 */
import { useCallback, useEffect, useState } from 'react';
import { campaignsApi, type MaterializeResult } from '../api';
import type { BulkRecipient } from './BulkAudience';

export function useBulkSend(p: { recipients: BulkRecipient[]; channelId: string | null; templateId: string | null; text: string; tab: 'text' | 'template'; purpose: 'utility' | 'marketing'; enabled: boolean }) {
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [result, setResult] = useState<MaterializeResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [throttle, setThrottle] = useState(5);
  const [respectHours, setRespectHours] = useState(true);
  const [optinConfirmed, setOptinConfirmed] = useState(false);

  useEffect(() => { if (!p.enabled) { setCampaignId(null); setResult(null); } }, [p.enabled]);
  // Cambiar plantilla/texto invalida el cálculo
  useEffect(() => { setResult(null); }, [p.templateId, p.tab, p.channelId]);

  const ensureCampaign = useCallback(async (): Promise<string> => {
    const body = {
      name: `Masivo ${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })} (${p.recipients.length})`,
      channel: 'whatsapp' as const,
      channel_id: p.channelId,
      template_id: p.tab === 'template' ? p.templateId : null,
      content: p.tab === 'text' ? p.text : null,
      audience: { source: 'manual' as const, opportunity_ids: p.recipients.map((r) => r.opportunityId).filter((x): x is string => !!x), customer_ids: p.recipients.filter((r) => !r.opportunityId).map((r) => r.customerId) },
      throttle_mps: throttle,
      respect_allowed_hours: respectHours,
      purpose: p.purpose,
      description: 'Creada desde el Kanban (acciones masivas)',
    };
    if (campaignId) {
      await campaignsApi.update(campaignId, body);
      return campaignId;
    }
    const r = await campaignsApi.create(body);
    setCampaignId(r.data.id);
    return r.data.id;
  }, [campaignId, p, throttle, respectHours]);

  const calculate = useCallback(async () => {
    setCalculating(true);
    try {
      const id = await ensureCampaign();
      const r = await campaignsApi.materialize(id);
      setResult(r);
      return r;
    } finally {
      setCalculating(false);
    }
  }, [ensureCampaign]);

  const launch = useCallback(async () => {
    setBusy(true);
    try {
      const id = await ensureCampaign();
      const r = result ?? (await campaignsApi.materialize(id));
      if (r.pending === 0) throw new Error('Nadie cumple los criterios: revisa las exclusiones');
      await campaignsApi.launch(id);
      return { campaign_id: id, pending: r.pending };
    } finally {
      setBusy(false);
    }
  }, [ensureCampaign, result]);

  const canLaunch = p.recipients.length > 0 && !!p.channelId && (p.purpose !== 'marketing' || optinConfirmed) && (!result || result.pending > 0);

  return { campaignId, result, calculating, busy, throttle, setThrottle, respectHours, setRespectHours, optinConfirmed, setOptinConfirmed, calculate, launch, canLaunch };
}
