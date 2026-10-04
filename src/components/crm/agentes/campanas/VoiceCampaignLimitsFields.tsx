'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit/FormField';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { MAX_VOICE_CAMPAIGN_LIMITS, type VoiceCampaignLimits } from '@/lib/crm/voiceCampaignLimits';

interface Props {
  limits: VoiceCampaignLimits;
  onChange: (limits: VoiceCampaignLimits) => void;
  orgConcurrencyLimit: number | null;
  disabled?: boolean;
}

/** Los dos formularios comparten campos, traducciones y el cupo real de la organización. */
export function VoiceCampaignLimitsFields({ limits, onChange, orgConcurrencyLimit, disabled }: Props) {
  const t = useTranslations('crm.campanasVisual');
  const fields = [
    ['max_calls_per_day', 'daily'],
    ['max_calls_per_hour', 'hourly'],
    ['max_concurrent', 'concurrent'],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {fields.map(([key, label]) => (
        <FormField key={key} etiqueta={t(label)} tamanoEtiqueta="sm"
          ayuda={key === 'max_concurrent'
            ? t(orgConcurrencyLimit === null ? 'concurrentUnknown' : 'concurrentMax', { n: orgConcurrencyLimit ?? 0 })
            : undefined}>
          <input type="number" min={1} step={1}
            max={key === 'max_concurrent' && orgConcurrencyLimit !== null
              ? Math.min(orgConcurrencyLimit, MAX_VOICE_CAMPAIGN_LIMITS[key])
              : MAX_VOICE_CAMPAIGN_LIMITS[key]}
            className={`${CLASE_CAMPO} text-right tabular-nums`}
            value={limits[key]} disabled={disabled}
            onChange={event => onChange({ ...limits, [key]: Number(event.target.value) })} />
        </FormField>
      ))}
    </div>
  );
}
