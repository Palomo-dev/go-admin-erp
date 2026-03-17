'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  SmilePlus,
  Meh,
  Frown,
  MessageSquareText,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TripAdvisorReview } from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

// --- Análisis de sentimiento simple basado en keywords ---

type Sentiment = 'positive' | 'neutral' | 'negative';

interface SentimentResult {
  sentiment: Sentiment;
  score: number; // -1 a 1
  keywords: string[];
}

const POSITIVE_KEYWORDS = [
  'excelente', 'increíble', 'perfecto', 'maravilloso', 'genial', 'fantástico',
  'hermoso', 'limpio', 'amable', 'recomiendo', 'encantó', 'mejor', 'cómodo',
  'delicioso', 'espectacular', 'bueno', 'agradable', 'bonito', 'tranquilo',
  'excellent', 'amazing', 'perfect', 'wonderful', 'great', 'fantastic',
  'beautiful', 'clean', 'friendly', 'recommend', 'loved', 'best', 'comfortable',
  'awesome', 'outstanding', 'superb', 'nice', 'pleasant',
];

const NEGATIVE_KEYWORDS = [
  'malo', 'terrible', 'horrible', 'sucio', 'ruidoso', 'caro', 'pésimo',
  'decepcionante', 'peor', 'desagradable', 'feo', 'incómodo', 'frío',
  'bad', 'terrible', 'horrible', 'dirty', 'noisy', 'expensive', 'worst',
  'disappointing', 'poor', 'unpleasant', 'ugly', 'uncomfortable', 'cold',
  'awful', 'rude', 'slow',
];

function analyzeSentiment(text: string): SentimentResult {
  const lower = (text || '').toLowerCase();
  const foundPositive: string[] = [];
  const foundNegative: string[] = [];

  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw)) foundPositive.push(kw);
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) foundNegative.push(kw);
  }

  const total = foundPositive.length + foundNegative.length;
  if (total === 0) return { sentiment: 'neutral', score: 0, keywords: [] };

  const score = (foundPositive.length - foundNegative.length) / total;

  if (score > 0.2) return { sentiment: 'positive', score, keywords: foundPositive.slice(0, 3) };
  if (score < -0.2) return { sentiment: 'negative', score, keywords: foundNegative.slice(0, 3) };
  return { sentiment: 'neutral', score, keywords: [...foundPositive.slice(0, 1), ...foundNegative.slice(0, 1)] };
}

function getSentimentIcon(sentiment: Sentiment) {
  switch (sentiment) {
    case 'positive': return <SmilePlus className="h-4 w-4 text-green-500" />;
    case 'negative': return <Frown className="h-4 w-4 text-red-500" />;
    default: return <Meh className="h-4 w-4 text-amber-500" />;
  }
}

function getSentimentLabel(sentiment: Sentiment) {
  switch (sentiment) {
    case 'positive': return 'Positiva';
    case 'negative': return 'Negativa';
    default: return 'Neutral';
  }
}

function getSentimentColor(sentiment: Sentiment) {
  switch (sentiment) {
    case 'positive': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'negative': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }
}

interface TripAdvisorSentimentAnalysisProps {
  locationId: string;
  className?: string;
}

/**
 * TripAdvisorSentimentAnalysis — Análisis de sentimiento de reseñas
 * para integración con módulo CRM. Detecta tendencias y keywords clave.
 */
export function TripAdvisorSentimentAnalysis({
  locationId,
  className,
}: TripAdvisorSentimentAnalysisProps) {
  const [reviews, setReviews] = useState<TripAdvisorReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = async () => {
    if (!locationId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/integrations/tripadvisor/reviews?locationId=${locationId}&language=es_CO`,
      );
      const result = await res.json();

      if (res.ok && result.data) {
        setReviews(result.data);
      } else {
        setError(result.error || 'Error obteniendo reseñas');
      }
    } catch {
      setError('Error de red');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // Analizar sentimiento de cada reseña
  const analyzed = reviews.map((r) => ({
    review: r,
    analysis: analyzeSentiment(`${r.title || ''} ${r.text || ''}`),
    ratingBased: r.rating >= 4 ? 'positive' as Sentiment : r.rating <= 2 ? 'negative' as Sentiment : 'neutral' as Sentiment,
  }));

  const positiveCount = analyzed.filter((a) => a.analysis.sentiment === 'positive' || a.ratingBased === 'positive').length;
  const negativeCount = analyzed.filter((a) => a.analysis.sentiment === 'negative' || a.ratingBased === 'negative').length;
  const neutralCount = analyzed.length - positiveCount - negativeCount;

  // Keywords más frecuentes
  const allKeywords = analyzed.flatMap((a) => a.analysis.keywords);
  const keywordCounts = allKeywords.reduce<Record<string, number>>((acc, kw) => {
    acc[kw] = (acc[kw] || 0) + 1;
    return acc;
  }, {});
  const topKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Score general
  const overallScore = analyzed.length > 0
    ? analyzed.reduce((sum, a) => sum + a.analysis.score, 0) / analyzed.length
    : 0;
  const overallSentiment: Sentiment = overallScore > 0.2 ? 'positive' : overallScore < -0.2 ? 'negative' : 'neutral';

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-[#00AA6C]" />
            Análisis de Sentimiento
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchReviews}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Analizando reseñas...</span>
          </div>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-500 text-center py-4">{error}</p>
        )}

        {!isLoading && !error && reviews.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No hay reseñas para analizar.
          </p>
        )}

        {!isLoading && !error && reviews.length > 0 && (
          <>
            {/* Score general */}
            <div className={cn(
              'flex items-center gap-3 p-3 rounded-lg',
              getSentimentColor(overallSentiment),
            )}>
              {getSentimentIcon(overallSentiment)}
              <div>
                <p className="text-sm font-semibold">
                  Sentimiento general: {getSentimentLabel(overallSentiment)}
                </p>
                <p className="text-xs opacity-75">
                  Basado en {reviews.length} reseña{reviews.length !== 1 ? 's' : ''} recientes
                </p>
              </div>
            </div>

            {/* Distribución */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                <ThumbsUp className="h-4 w-4 text-green-500 mb-1" />
                <span className="text-lg font-bold text-green-700 dark:text-green-300">
                  {positiveCount}
                </span>
                <span className="text-[10px] text-green-600 dark:text-green-400">Positivas</span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <Meh className="h-4 w-4 text-amber-500 mb-1" />
                <span className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  {neutralCount}
                </span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">Neutrales</span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                <ThumbsDown className="h-4 w-4 text-red-500 mb-1" />
                <span className="text-lg font-bold text-red-700 dark:text-red-300">
                  {negativeCount}
                </span>
                <span className="text-[10px] text-red-600 dark:text-red-400">Negativas</span>
              </div>
            </div>

            {/* Barra de sentimiento */}
            {analyzed.length > 0 && (
              <div className="space-y-1">
                <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  {positiveCount > 0 && (
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(positiveCount / analyzed.length) * 100}%` }}
                    />
                  )}
                  {neutralCount > 0 && (
                    <div
                      className="bg-amber-400 transition-all"
                      style={{ width: `${(neutralCount / analyzed.length) * 100}%` }}
                    />
                  )}
                  {negativeCount > 0 && (
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${(negativeCount / analyzed.length) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{Math.round((positiveCount / analyzed.length) * 100)}% positivo</span>
                  <span>{Math.round((negativeCount / analyzed.length) * 100)}% negativo</span>
                </div>
              </div>
            )}

            {/* Keywords frecuentes */}
            {topKeywords.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Palabras clave frecuentes
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {topKeywords.map(([kw, count]) => {
                    const isPositive = POSITIVE_KEYWORDS.includes(kw);
                    return (
                      <Badge
                        key={kw}
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          isPositive
                            ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300'
                            : 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
                        )}
                      >
                        {kw} ({count})
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detalle por reseña */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Detalle por reseña
              </h4>
              {analyzed.map((item) => (
                <div
                  key={item.review.id}
                  className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-800"
                >
                  <div className="mt-0.5 shrink-0">
                    {getSentimentIcon(item.analysis.sentiment !== 'neutral' ? item.analysis.sentiment : item.ratingBased)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {item.review.title || 'Sin título'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">
                        Rating: {item.review.rating}/5
                      </span>
                      {item.analysis.keywords.length > 0 && (
                        <span className="text-[10px] text-gray-400">
                          · {item.analysis.keywords.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('text-[9px] shrink-0', getSentimentColor(
                      item.analysis.sentiment !== 'neutral' ? item.analysis.sentiment : item.ratingBased,
                    ))}
                  >
                    {getSentimentLabel(item.analysis.sentiment !== 'neutral' ? item.analysis.sentiment : item.ratingBased)}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Attribution */}
            <p className="text-[10px] text-gray-400 text-center">
              Análisis basado en reseñas de{' '}
              <a
                href="https://www.tripadvisor.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00AA6C] hover:underline"
              >
                TripAdvisor
              </a>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default TripAdvisorSentimentAnalysis;
