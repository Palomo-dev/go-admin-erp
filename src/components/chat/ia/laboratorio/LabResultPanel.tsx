'use client';

import { Bot, Clock, Coins, Hash, Zap, Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LabTestResult } from '@/lib/services/aiLabService';

interface LabResultPanelProps {
  result: LabTestResult | null;
  loading: boolean;
}

export default function LabResultPanel({
  result,
  loading
}: LabResultPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyResponse = async () => {
    if (result?.response) {
      await navigator.clipboard.writeText(result.response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (score >= 0.6) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (score >= 0.4) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  };

  if (loading) {
    return (
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400 animate-pulse" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">Generando respuesta...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Bot className="h-6 w-6 text-gray-400" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">
                Escribe una consulta para ver cómo responde la IA
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Los fragmentos seleccionados serán usados como contexto
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Respuesta de IA
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={getConfidenceColor(result.metrics.confidenceScore)}>
              {Math.round(result.metrics.confidenceScore * 100)}% confianza
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyResponse}
              className="h-8 w-8 p-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Consulta:</p>
          <p className="text-gray-900 dark:text-white">{result.query}</p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-600 dark:text-blue-400 mb-2 font-medium">Respuesta:</p>
          <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{result.response}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
              <Clock className="h-3 w-3" />
              Tiempo
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {result.metrics.processingTimeMs}ms
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
              <Hash className="h-3 w-3" />
              Tokens
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {result.metrics.totalTokens}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
              <Coins className="h-3 w-3" />
              Costo Est.
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              ${result.metrics.estimatedCost.toFixed(5)}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
              <Zap className="h-3 w-3" />
              Fragmentos
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {result.metrics.retrievedFragments}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Modelo: {result.settings.model} • Temp: {result.settings.temperature} • 
              Tono: {result.settings.tone}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                <ThumbsUp className="h-3 w-3" />
                Útil
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                <ThumbsDown className="h-3 w-3" />
                Mejorar
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {new Date(result.timestamp).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
