'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { scoringService } from '@/lib/services/crm/scoringService';
import type {
  ScoringConfig,
  ScoreAnswer,
  ScoreResult,
  Temperature,
} from '@/lib/services/crm/scoringService';
import { ScoreBadge } from '@/components/crm/pipeline/ScoreBadge';
import { Gauge, Loader2, Save } from 'lucide-react';

interface ScoringSectionProps {
  opportunityId: string;
}

/**
 * Sección de Calificación GOC (Grado de Oportunidad Comercial).
 * Muestra las preguntas del scoring_configs, guarda score_data y score_total
 * en la oportunidad, y muestra un badge con la temperatura.
 */
export function ScoringSection({ opportunityId }: ScoringSectionProps) {
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [currentTemp, setCurrentTemp] = useState<Temperature | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Cargar config de scoring y score existente de la oportunidad
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoringConfig, oppData] = await Promise.all([
        scoringService.getConfig(),
        supabase
          .from('opportunities')
          .select('score_total, score_data, temperature')
          .eq('id', opportunityId)
          .maybeSingle(),
      ]);

      setConfig(scoringConfig);

      const opp = oppData.data as {
        score_total?: number | null;
        score_data?: Record<string, unknown> | null;
        temperature?: string | null;
      } | null;

      if (opp) {
        setCurrentScore(opp.score_total ?? null);
        setCurrentTemp(
          (opp.temperature as Temperature) || null
        );

        // Restaurar respuestas guardadas
        if (opp.score_data && typeof opp.score_data === 'object') {
          const savedAnswers = opp.score_data as Record<string, unknown>;
          const restored: Record<string, string> = {};
          if (Array.isArray(savedAnswers.answers)) {
            for (const ans of savedAnswers.answers as ScoreAnswer[]) {
              restored[ans.key] = ans.value;
            }
          }
          setAnswers(restored);
        }
      }
    } catch (err) {
      console.error('Error cargando scoring:', err);
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnswerChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Construir array de respuestas
      const answerList: ScoreAnswer[] = config?.indicators.map((ind) => ({
        key: ind.key,
        value: answers[ind.key] || '',
      })) || [];

      // Calcular score
      const result: ScoreResult = await scoringService.calculateScore(answerList, config);

      // Guardar en la oportunidad
      const { error } = await supabase
        .from('opportunities')
        .update({
          score_total: result.score_total,
          temperature: result.temperature,
          score_data: {
            answers: answerList,
            details: result.details,
            calculated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', opportunityId);

      if (error) {
        // Si falla el guardado en columnas, intentar guardar en metadata como fallback
        console.warn('Columnas de score no existen, guardando en metadata:', error.message);
        await supabase
          .from('opportunities')
          .update({
            metadata: {
              score_total: result.score_total,
              score_temperature: result.temperature,
              score_data: {
                answers: answerList,
                details: result.details,
                calculated_at: new Date().toISOString(),
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', opportunityId);
      }

      setCurrentScore(result.score_total);
      setCurrentTemp(result.temperature);
      toast({
        title: 'Calificación guardada',
        description: `Score: ${result.score_total} · ${tempLabel(result.temperature)}`,
      });
    } catch (err) {
      console.error('Error guardando scoring:', err);
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-blue-500" />
          Calificación GOC
        </h3>
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  if (!config || config.indicators.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-blue-500" />
          Calificación GOC
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No hay configuración de scoring. Configura los indicadores en Configuración CRM.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-blue-500" />
        Calificación GOC
        {currentScore !== null && (
          <ScoreBadge score={currentScore} temperature={currentTemp} className="ml-1" />
        )}
      </h3>

      <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 space-y-3">
        {config.indicators.map((indicator) => (
          <div key={indicator.key}>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
              {indicator.label}
              <span className="text-gray-400 ml-1">({indicator.weight}%)</span>
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {indicator.options.map((opt) => {
                const isSelected = answers[indicator.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleAnswerChange(indicator.key, opt.value)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="w-full h-8 text-xs"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Guardar Calificación
        </Button>
      </Card>
    </section>
  );
}

function tempLabel(temp: Temperature): string {
  const labels: Record<Temperature, string> = {
    cold: 'Frío',
    warm: 'Tibio',
    hot: 'Caliente',
  };
  return labels[temp];
}
