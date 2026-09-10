'use client';

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

  const estiloGama = (gama: GamaModelo) => {
    switch (gama) {
      case 'economico':   return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'equilibrado': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'premium':     return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'legacy':      return 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const etiquetaGama = (gama: GamaModelo) =>
    gama === 'economico' ? 'económico'
    : gama === 'equilibrado' ? 'equilibrado'
    : gama === 'premium' ? 'premium'
    : 'legacy';

  /** Costo por cada 1.000 respuestas, que es la unidad que se entiende. */
  const costoPorMil = (m: ModeloIA) => {
    const unitario = estimarCostoRespuesta(m, TOKENS_ENTRADA_TIPICOS, TOKENS_SALIDA_TIPICOS);
    if (unitario === null) return null;
    return (unitario * 1000).toLocaleString('es-CO', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  };

  const modeloActual = availableModels.find((m) => m.value === model);

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Modelo de IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Proveedor</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {proveedores.map((p) => (
                  <SelectItem key={p.value} value={p.value} disabled={!p.usable}>
                    <span className="flex items-center gap-2">
                      {p.label}
                      {!p.usable && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          sin credenciales
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Modelo</Label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        {m.recomendado && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        {m.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${estiloGama(m.gama)}`}>
                        {etiquetaGama(m.gama)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {errorCatalogo && (
          <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errorCatalogo}
          </p>
        )}

        {proveedores.some((p) => !p.usable) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {proveedores.find((p) => !p.usable)?.motivo}
          </p>
        )}

        {modeloActual && (
          <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Costo estimado por cada 1.000 respuestas
              </span>
              <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                {costoPorMil(modeloActual) ?? 'No calculable'}
              </span>
            </div>
            {!modeloActual.tarifaCargada && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Este modelo no tiene tarifa cargada, así que su gasto real no se puede medir.
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Calculado con el consumo real de tu chat: {TOKENS_ENTRADA_TIPICOS.toLocaleString('es-CO')} tokens
              de entrada y {TOKENS_SALIDA_TIPICOS} de salida por respuesta.
              {modeloActual.contextoTokens
                ? ` Contexto máximo: ${modeloActual.contextoTokens.toLocaleString('es-CO')} tokens.`
                : ''}
            </p>
            {modeloActual.nota && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{modeloActual.nota}</p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Thermometer className="h-4 w-4" />
                Temperatura
              </Label>
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {temperature.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[temperature]}
              min={0}
              max={1}
              step={0.1}
              onValueChange={(value) => onTemperatureChange(value[0])}
              className="w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Valores bajos = respuestas más precisas. Valores altos = respuestas más creativas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Máximo de Tokens
              </Label>
              <Input
                type="number"
                value={maxTokens}
                onChange={(e) => onMaxTokensChange(parseInt(e.target.value) || 500)}
                min={100}
                max={4000}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Longitud máxima de las respuestas (100-4000)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Fragmentos de Contexto
              </Label>
              <Input
                type="number"
                value={maxFragmentsContext}
                onChange={(e) => onMaxFragmentsChange(parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Fragmentos de conocimiento a usar (1-20)
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
