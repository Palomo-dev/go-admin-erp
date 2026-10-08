'use client';

/**
 * Configuración › CRM › Agente de voz (Figma «10. Configuración unificada»).
 *
 * Reúne lo que decide si el agente IA de voz llama y cómo trata al cliente,
 * que estaba repartido entre Telefonía y Agentes IA › Ajustes. No reescribe
 * nada: importa los componentes de siempre, con sus mismas rutas y permisos
 * del servidor.
 *
 * - `#interruptor`: `VoiceAgentSwitchSection` (`comm_settings.voice_agent_enabled`,
 *   edita quien la ruta de telefonía deja: `can_edit`).
 * - `#numeros-prueba`: `TestNumbersSection` (la ruta exige admin).
 * - `#desinteres`: `DesinteresVozCard` (la ruta exige «Configurar etapas»).
 */
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTelephonySettings } from '@/components/configuracion/crm/telefonia/useTelephonySettings';
import { VoiceAgentSwitchSection } from '@/components/configuracion/crm/telefonia/VoiceAgentSwitchSection';
import { TestNumbersSection } from '@/components/configuracion/crm/telefonia/TestNumbersSection';
import { DesinteresVozCard } from '@/components/crm/agentes/ajustes/DesinteresVozCard';
import { AnclaAjuste, TarjetaAjuste } from '../../layout/TarjetaAjuste';

export function AgenteVozSeccion() {
  const t = useTranslations('configuracionUnificada');
  const tel = useTelephonySettings();

  return (
    <div className="flex flex-col gap-4">
      <TarjetaAjuste id="interruptor" queHace={t('agenteVoz.interruptorQueHace')}>
        {tel.settings ? (
          <VoiceAgentSwitchSection settings={tel.settings} canEdit={tel.canEdit} onPatchSettings={tel.patchSettings} />
        ) : tel.error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
            <span>{tel.error}</span>
            <Button size="sm" variant="outline" onClick={() => void tel.reload()}>
              <RefreshCw aria-hidden="true" className="mr-1.5 size-3.5" />
              {t('estados.reintentar')}
            </Button>
          </div>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t('estados.cargando')}
          </p>
        )}
      </TarjetaAjuste>
      <TarjetaAjuste id="numeros-prueba" queHace={t('agenteVoz.numerosPruebaQueHace')}>
        <TestNumbersSection />
      </TarjetaAjuste>
      <AnclaAjuste id="desinteres">
        <DesinteresVozCard />
      </AnclaAjuste>
    </div>
  );
}
