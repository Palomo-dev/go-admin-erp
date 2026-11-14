'use client';

/**
 * «Ajustes de la prueba» del Laboratorio de IA (auditoría 2026-11-14, Agente 3):
 * canal, modelo, creatividad, largo, máximo de fragmentos y reglas del sistema.
 * Solo valen para la prueba: no cambian la configuración real.
 *
 * Tono e idioma NO vuelven: la IA que atiende a los clientes (`ai-auto-response`)
 * no los usa —responde en el idioma en que le escriben—, así que probarlos aquí
 * prometería algo que el cliente nunca recibe. Se dice en pantalla.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { FormField, Tarjeta } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchCatalogoModelos, type ModeloIA } from '@/lib/services/aiSettingsService';
import type { LabSettings } from '@/lib/services/aiLabService';

/** Valor del selector cuando la prueba usa el modelo de la configuración. */
const MODELO_CONFIG = '__config__';

interface Props {
  ajustes: LabSettings;
  onChange: (ajustes: LabSettings) => void;
  canales: Array<{ valor: string; etiqueta: string }>;
  /** Modelo de la configuración real (para nombrarlo). */
  modeloConfig: string;
  /** Reglas de la configuración real (para volver a ellas). */
  reglasConfig: string;
}

export function AjustesPrueba({ ajustes, onChange, canales, modeloConfig, reglasConfig }: Props) {
  const t = useTranslations('chatModulo.ia.laboratorio');
  const [modelos, setModelos] = useState<ModeloIA[]>([]);

  useEffect(() => {
    let vivo = true;
    fetchCatalogoModelos()
      .then((c) => vivo && setModelos(c.modelos))
      .catch(() => vivo && setModelos([]));
    return () => {
      vivo = false;
    };
  }, []);

  const cambiar = <K extends keyof LabSettings>(clave: K, valor: LabSettings[K]) => onChange({ ...ajustes, [clave]: valor });
  const etiquetaModeloConfig = modeloConfig ? t('modeloConfigCon', { modelo: modelos.find((m) => m.value === modeloConfig)?.label ?? modeloConfig }) : t('modeloConfig');

  return (
    <Tarjeta titulo={t('ajustes')} descripcion={t('ajustesDescripcion')}>
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('canal')}>
          {(campo) => (
            <Select value={ajustes.simulatedChannel} onValueChange={(v) => cambiar('simulatedChannel', v)}>
              <SelectTrigger id={campo.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {canales.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField etiqueta={t('modelo')}>
          {(campo) => (
            <Select value={ajustes.model || MODELO_CONFIG} onValueChange={(v) => cambiar('model', v === MODELO_CONFIG ? '' : v)}>
              <SelectTrigger id={campo.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MODELO_CONFIG}>{etiquetaModeloConfig}</SelectItem>
                {modelos
                  .filter((m) => m.value !== modeloConfig)
                  .map((m) => (
                    <SelectItem key={`${m.provider}:${m.value}`} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField etiqueta={t('creatividad')} ayuda={t('creatividadAyuda')} extra={<span className="font-mono text-xs tabular-nums text-fg-secondary">{ajustes.temperature.toFixed(1)}</span>}>
          {(campo) => (
            <Slider
              id={campo.id}
              aria-label={t('creatividad')}
              value={[ajustes.temperature]}
              min={0}
              max={1}
              step={0.1}
              onValueChange={(v) => cambiar('temperature', v[0])}
            />
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField etiqueta={t('largoTokens')} ayuda={t('largoAyuda')}>
            {(campo) => (
              <Input
                id={campo.id}
                type="number"
                min={100}
                max={2000}
                step={50}
                value={ajustes.maxTokens}
                onChange={(e) => cambiar('maxTokens', Math.min(2000, Math.max(100, parseInt(e.target.value) || 500)))}
              />
            )}
          </FormField>
          <FormField etiqueta={t('maxFragmentos')} ayuda={t('maxFragmentosAyuda')}>
            {(campo) => (
              <Input
                id={campo.id}
                type="number"
                min={1}
                max={20}
                value={ajustes.maxFragments}
                onChange={(e) => cambiar('maxFragments', Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
              />
            )}
          </FormField>
        </div>

        <FormField
          etiqueta={t('reglas')}
          ayuda={t('reglasAyuda')}
          extra={
            ajustes.systemRules !== reglasConfig ? (
              <button
                type="button"
                onClick={() => cambiar('systemRules', reglasConfig)}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <RotateCcw aria-hidden="true" className="size-3" />
                {t('reglasRestaurar')}
              </button>
            ) : null
          }
        >
          {(campo) => (
            <Textarea id={campo.id} rows={4} value={ajustes.systemRules} onChange={(e) => cambiar('systemRules', e.target.value)} className="resize-y text-sm" />
          )}
        </FormField>

        <p className="text-xs text-fg-muted">{t('sinTonoIdioma')}</p>
      </div>
    </Tarjeta>
  );
}
