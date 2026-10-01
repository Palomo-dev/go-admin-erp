'use client';
import { useCallback, useRef, useState } from 'react';
import { ApiError, type Campaign, type CreateCampaignBody, type MaterializeResult } from '@/components/crm/whatsapp/api';
import type { CampaignRneCheck } from '@/lib/services/crm/whatsapp/campaignRneService';
import { campaignNeedsMaterialization } from '@/lib/services/crm/whatsapp/campaignStoreLogica';
import { CampanasService } from '../CampanasService';

function versionPropia(version: string | undefined): string {
  if (!version || !Number.isFinite(Date.parse(version))) throw new ApiError('No se recibió la versión de la operación', 'INVALID_VERSION', 500);
  return version;
}

/** Cada acción continúa con la versión de su propia respuesta, sin adoptar lecturas posteriores. */
export function useBorradorCampana(body: CreateCampaignBody) {
  const savedRef = useRef<Campaign | null>(null);
  const inFlight = useRef(false);
  const [saved, setSaved] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState<'save' | 'mat' | 'launch' | null>(null);
  const [calculated, setCalculated] = useState<{ source: Campaign; result: MaterializeResult } | null>(null);
  const [calculationKey, setCalculationKey] = useState(0);
  const mat = calculated && !campaignNeedsMaterialization(calculated.source, body) ? calculated.result : null;
  const accept = (campaign: Campaign) => { savedRef.current = campaign; setSaved(campaign); };
  const save = async () => {
    const current = savedRef.current;
    const result = current
      ? await CampanasService.updateCampaign(current.id, { ...body, expected_updated_at: current.updated_at })
      : await CampanasService.createCampaign(body);
    accept(result);
    return result;
  };
  const run = async <T,>(kind: NonNullable<typeof busy>, action: () => Promise<T>): Promise<T> => {
    if (inFlight.current) throw new ApiError('Hay una operación en curso', 'BUSY', 409);
    inFlight.current = true; setBusy(kind);
    try { return await action(); }
    finally { inFlight.current = false; setBusy(null); }
  };
  const guardar = () => run('save', save);
  const calcular = () => run('mat', async () => {
    const campaign = await save();
    const result = await CampanasService.materialize(campaign.id, { expected_updated_at: campaign.updated_at });
    const updated = { ...campaign, updated_at: versionPropia(result.campaign_updated_at) };
    accept(updated); setCalculated({ source: updated, result });
    setCalculationKey(key => key + 1);
    return result;
  });
  const lanzar = () => run('launch', async () => {
    if (!mat?.pending) throw new ApiError('Calcula la audiencia actual antes de activar', 'NOT_MATERIALIZED', 409);
    const campaign = await save();
    const result = await CampanasService.launch(campaign.id, {
      scheduled_at: body.scheduled_at, expected_updated_at: campaign.updated_at,
    });
    accept(result.data);
    return result.data;
  });
  const actualizarRne = useCallback(async (check: CampaignRneCheck) => {
    const current = savedRef.current;
    if (!current) throw new ApiError('Borrador no encontrado', 'NOT_FOUND', 404);
    accept({ ...current, updated_at: versionPropia(check.campaign_updated_at) });
    setCalculated(null);
    const stats = await CampanasService.stats(current.id);
    // Los contactos excluidos por RNE y los contadores proceden del servidor.
    setCalculated({ source: current, result: {
      campaign_updated_at: check.campaign_updated_at,
      total: stats.counts.total, pending: stats.counts.pending, skipped: stats.counts.skipped,
      skipped_by_reason: stats.by_skip_reason, estimated_cost: stats.estimated_cost,
    } });
  }, []);
  return { saved, mat, busy, calculationKey, guardar, calcular, lanzar, actualizarRne };
}
