'use client';

/**
 * Configuración › Chat › IA › Modelo. Textos en `chatConfig.ia.modelo`
 * (es/en/fr/pt) y colores por tokens. El catálogo de modelos, su costo y sus
 * notas vienen del servidor (`fetchCatalogoModelos`).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cpu, Thermometer, Hash, FileText, AlertCircle, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import {
  fetchCatalogoModelos,
  estimarCostoRespuesta,
  type CatalogoModelos,
  type ModeloIA,
  type GamaModelo,
} from '@/lib/services/aiSettingsService';

/**
 * Consumo real promedio de una respuesta del bot, medido sobre las 2.391
 * respuestas ya enviadas (ai_jobs). Sirve para mostrar el costo en dinero, que
 * es lo que el usuario entiende, en vez de precios por millon de tokens.
 */
const TOKENS_ENTRADA_TIPICOS = 2197;
const TOKENS_SALIDA_TIPICOS = 56;

const ESTILO_GAMA: Record<GamaModelo, string> = {
  economico: 'bg-success-subtle text-success-text',
  equilibrado: 'bg-brand-tint text-brand',
  premium: 'bg-warning-subtle text-warning-text',
  legacy: 'bg-subtle text-fg-muted',
};

interface ModelSettingsProps {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxFragmentsContext: number;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onMaxTokensChange: (maxTokens: number) => void;
  onMaxFragmentsChange: (maxFragments: number) => void;
}

export default function ModelSettings({
  provider,
  model,
  temperature,
  maxTokens,
  maxFragmentsContext,
  onProviderChange,
  onModelChange,
  onTemperatureChange,
  onMaxTokensChange,
  onMaxFragmentsChange
}: ModelSettingsProps) {
  const t = useTranslations('chatConfig.ia.modelo');
  const locale = useLocaleIntl();
  const [catalogo, setCatalogo] = useState<CatalogoModelos | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetchCatalogoModelos()
      .then((c) => { if (!cancelado) setCatalogo(c); })
      .catch((e: Error) => { if (!cancelado) setErrorCatalogo(e.message); });
    return () => { cancelado = true; };
  }, []);

  const proveedores = catalogo?.proveedores ?? [];
  const availableModels = (catalogo?.modelos ?? []).filter((m) => m.provider === provider);

  const handleProviderChange = (newProvider: string) => {
    onProviderChange(newProvider);
    const primero = (catalogo?.modelos ?? []).find((m) => m.provider === newProvider);
    if (primero) onModelChange(primero.value);
  };

  /** Costo por cada 1.000 respuestas, que es la unidad que se entiende. */
  const costoPorMil = (m: ModeloIA) => {
    const unitario = estimarCostoRespuesta(m, TOKENS_ENTRADA_TIPICOS, TOKENS_SALIDA_TIPICOS);
    if (unitario === null) return null;
    return (unitario * 1000).toLocaleString(locale, {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  };

  const modeloActual = availableModels.find((m) => m.value === model);

  return (
    <Card className="border-line bg-surface">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-fg">
          <Cpu aria-hidden="true" className="h-4 w-4 text-brand" />
          {t('titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ia-proveedor" className="text-fg-secondary">{t('proveedor')}</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger id="ia-proveedor" className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {proveedores.map((p) => (
                  <SelectItem key={p.value} value={p.value} disabled={!p.usable}>
                    <span className="flex items-center gap-2">
                      {p.label}
                      {!p.usable && <span className="text-xs text-fg-muted">{t('sinCredenciales')}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ia-modelo" className="text-fg-secondary">{t('modelo')}</Label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger id="ia-modelo" className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        {m.recomendado && <Star aria-label={t('recomendado')} className="h-3 w-3 fill-current text-warning" />}
                        {m.label}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs ${ESTILO_GAMA[m.gama]}`}>{t(`gamas.${m.gama}`)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {errorCatalogo && (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger-text">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            {errorCatalogo}
          </p>
        )}

        {proveedores.some((p) => !p.usable) && (
          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {proveedores.find((p) => !p.usable)?.motivo}
          </p>
        )}

        {modeloActual && (
          <div className="space-y-1.5 rounded-md border border-line bg-subtle p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-fg-muted">{t('costoPorMil')}</span>
              <span className="font-mono text-sm font-semibold text-fg">{costoPorMil(modeloActual) ?? t('noCalculable')}</span>
            </div>
            {!modeloActual.tarifaCargada && <p className="text-xs text-warning-text">{t('sinTarifa')}</p>}
            <p className="text-xs text-fg-muted">
              {t('consumo', { entrada: TOKENS_ENTRADA_TIPICOS, salida: TOKENS_SALIDA_TIPICOS })}
              {modeloActual.contextoTokens ? ` ${t('contexto', { n: modeloActual.contextoTokens })}` : ''}
            </p>
            {modeloActual.nota && <p className="text-xs text-fg-muted">{modeloActual.nota}</p>}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-fg-secondary">
                <Thermometer aria-hidden="true" className="h-4 w-4" />
                {t('temperatura')}
              </Label>
              <span className="rounded bg-subtle px-2 py-1 font-mono text-sm text-fg-secondary">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[temperature]}
              min={0}
              max={1}
              step={0.1}
              onValueChange={(value) => onTemperatureChange(value[0])}
              className="w-full"
              aria-label={t('temperatura')}
            />
            <p className="text-xs text-fg-muted">{t('temperaturaAyuda')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ia-max-tokens" className="flex items-center gap-2 text-fg-secondary">
                <Hash aria-hidden="true" className="h-4 w-4" />
                {t('maxTokens')}
              </Label>
              <Input
                id="ia-max-tokens"
                type="number"
                value={maxTokens}
                onChange={(e) => onMaxTokensChange(parseInt(e.target.value) || 500)}
                min={100}
                max={4000}
                className="bg-surface"
              />
              <p className="text-xs text-fg-muted">{t('maxTokensAyuda')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ia-fragmentos" className="flex items-center gap-2 text-fg-secondary">
                <FileText aria-hidden="true" className="h-4 w-4" />
                {t('fragmentos')}
              </Label>
              <Input
                id="ia-fragmentos"
                type="number"
                value={maxFragmentsContext}
                onChange={(e) => onMaxFragmentsChange(parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                className="bg-surface"
              />
              <p className="text-xs text-fg-muted">{t('fragmentosAyuda')}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
