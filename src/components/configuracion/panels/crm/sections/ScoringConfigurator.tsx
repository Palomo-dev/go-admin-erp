'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Save, RefreshCw, Gauge, TrendingUp } from 'lucide-react';
import { scoringService, type ScoringConfig, type ScoringIndicator, type ScoringBands } from '@/lib/services/crm/scoringService';

const DEFAULT_INDICATORS: ScoringIndicator[] = [
  {
    key: 'engagement',
    label: 'Engagement',
    weight: 30,
    options: [
      { value: 'low', label: 'Bajo', score: 1 },
      { value: 'medium', label: 'Medio', score: 2 },
      { value: 'high', label: 'Alto', score: 3 },
    ],
  },
  {
    key: 'budget',
    label: 'Presupuesto',
    weight: 40,
    options: [
      { value: 'none', label: 'Sin presupuesto', score: 0 },
      { value: 'limited', label: 'Limitado', score: 1 },
      { value: 'confirmed', label: 'Confirmado', score: 3 },
    ],
  },
  {
    key: 'timeline',
    label: 'Timeline',
    weight: 30,
    options: [
      { value: 'distant', label: 'Lejano', score: 1 },
      { value: 'near', label: 'Cercano', score: 2 },
      { value: 'immediate', label: 'Inmediato', score: 3 },
    ],
  },
];

const DEFAULT_BANDS: ScoringBands = {
  cold: { min: 0, max: 33 },
  warm: { min: 34, max: 66 },
  hot: { min: 67, max: 100 },
};

export function ScoringConfigurator() {
  const { toast } = useToast();

  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [indicators, setIndicators] = useState<ScoringIndicator[]>(DEFAULT_INDICATORS);
  const [bands, setBands] = useState<ScoringBands>(DEFAULT_BANDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await scoringService.getConfig();
      if (data) {
        setConfig(data);
        setIndicators(data.indicators?.length ? data.indicators : DEFAULT_INDICATORS);
        setBands(data.bands || DEFAULT_BANDS);
      }
    } catch (error) {
      console.error('Error cargando configuracion de scoring:', error);
      toast({ title: 'Error', description: 'No se pudo cargar la configuracion de scoring', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const totalWeight = indicators.reduce((sum, ind) => sum + (Number(ind.weight) || 0), 0);

  const handleSave = async () => {
    if (totalWeight !== 100) {
      toast({
        title: 'Validacion',
        description: `La suma de pesos debe ser 100% (actual: ${totalWeight}%)`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await scoringService.saveConfig({
        id: config?.id,
        organization_id: config?.organization_id,
        indicators,
        bands,
      });
      if (saved) setConfig(saved);
      toast({ title: 'Configuracion guardada', description: 'El scoring GOC se guardo correctamente' });
      loadConfig();
    } catch (error) {
      console.error('Error guardando scoring:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la configuracion', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateIndicator = (index: number, updates: Partial<ScoringIndicator>) => {
    setIndicators((prev) => prev.map((ind, i) => (i === index ? { ...ind, ...updates } : ind)));
  };

  const addIndicator = () => {
    setIndicators((prev) => [
      ...prev,
      {
        key: `indicator_${Date.now()}`,
        label: 'Nuevo indicador',
        weight: 0,
        options: [
          { value: 'low', label: 'Bajo', score: 1 },
          { value: 'high', label: 'Alto', score: 3 },
        ],
      },
    ]);
  };

  const removeIndicator = (index: number) => {
    setIndicators((prev) => prev.filter((_, i) => i !== index));
  };

  const updateOption = (indIndex: number, optIndex: number, field: 'label' | 'score' | 'value', value: string | number) => {
    setIndicators((prev) =>
      prev.map((ind, i) => {
        if (i !== indIndex) return ind;
        const newOptions = ind.options.map((opt, oi) =>
          oi === optIndex ? { ...opt, [field]: value } : opt
        );
        return { ...ind, options: newOptions };
      })
    );
  };

  const addOption = (indIndex: number) => {
    setIndicators((prev) =>
      prev.map((ind, i) => {
        if (i !== indIndex) return ind;
        return {
          ...ind,
          options: [...ind.options, { value: `opt_${Date.now()}`, label: 'Nueva opcion', score: 1 }],
        };
      })
    );
  };

  const removeOption = (indIndex: number, optIndex: number) => {
    setIndicators((prev) =>
      prev.map((ind, i) => {
        if (i !== indIndex) return ind;
        return { ...ind, options: ind.options.filter((_, oi) => oi !== optIndex) };
      })
    );
  };

  const updateBand = (band: keyof ScoringBands, field: 'min' | 'max', value: number) => {
    setBands((prev) => ({
      ...prev,
      [band]: { ...prev[band], [field]: value },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Scoring GOC</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Configura indicadores, pesos y umbrales (Cold / Warm / Hot)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadConfig} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Indicadores</h4>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${totalWeight === 100 ? 'text-green-600' : 'text-red-500'}`}>
              Total: {totalWeight}%
            </span>
            <Button variant="outline" size="sm" onClick={addIndicator}>
              <Plus className="h-4 w-4 mr-1" />
              Indicador
            </Button>
          </div>
        </div>

        {indicators.map((indicator, indIndex) => (
          <Card key={indIndex} className="border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Input
                  value={indicator.label}
                  onChange={(e) => updateIndicator(indIndex, { label: e.target.value })}
                  className="font-medium"
                  placeholder="Nombre del indicador"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    value={indicator.weight}
                    onChange={(e) => updateIndicator(indIndex, { weight: Number(e.target.value) })}
                    className="w-20 text-center"
                    min={0}
                    max={100}
                  />
                  <span className="text-sm text-gray-500">%</span>
                  <Button variant="ghost" size="icon" onClick={() => removeIndicator(indIndex)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Separator className="mb-2" />
              {indicator.options.map((option, optIndex) => (
                <div key={optIndex} className="flex items-center gap-2">
                  <Input
                    value={option.label}
                    onChange={(e) => updateOption(indIndex, optIndex, 'label', e.target.value)}
                    className="flex-1"
                    placeholder="Etiqueta de opcion"
                  />
                  <Input
                    type="number"
                    value={option.score}
                    onChange={(e) => updateOption(indIndex, optIndex, 'score', Number(e.target.value))}
                    className="w-20 text-center"
                    min={0}
                    max={10}
                    placeholder="Score"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeOption(indIndex, optIndex)}>
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addOption(indIndex)} className="text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Agregar opcion
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Umbrales / Bandas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Umbrales (Bandas)</h4>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['cold', 'warm', 'hot'] as const).map((bandKey) => {
            const bandColors: Record<string, string> = {
              cold: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30',
              warm: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30',
              hot: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30',
            };
            const bandLabels: Record<string, string> = { cold: 'Frio', warm: 'Tibio', hot: 'Caliente' };
            return (
              <Card key={bandKey} className={`border-2 ${bandColors[bandKey]}`}>
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{bandLabels[bandKey]}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500">Min</Label>
                      <Input
                        type="number"
                        value={bands[bandKey].min}
                        onChange={(e) => updateBand(bandKey, 'min', Number(e.target.value))}
                        min={0}
                        max={100}
                        className="text-center"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500">Max</Label>
                      <Input
                        type="number"
                        value={bands[bandKey].max}
                        onChange={(e) => updateBand(bandKey, 'max', Number(e.target.value))}
                        min={0}
                        max={100}
                        className="text-center"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar Configuracion'}
        </Button>
      </div>
    </div>
  );
}
