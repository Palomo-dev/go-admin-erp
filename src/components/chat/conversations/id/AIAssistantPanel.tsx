'use client';

import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Send, 
  Edit3, 
  RefreshCw, 
  ThumbsUp, 
  ThumbsDown,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AIJob, ConversationSummary } from '@/lib/services/conversationDetailService';

interface AIAssistantPanelProps {
  summary: ConversationSummary | null;
  activeJob: AIJob | null;
  aiMode: string;
  loading?: boolean;
  onRequestResponse: () => Promise<void>;
  onSendSuggestion: (content: string) => void;
}

export default function AIAssistantPanel({
  summary,
  activeJob,
  aiMode,
  loading,
  onRequestResponse,
  onSendSuggestion
}: AIAssistantPanelProps) {
  const [editedResponse, setEditedResponse] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const handleRequestResponse = async () => {
    try {
      setIsRequesting(true);
      await onRequestResponse();
    } catch (error) {
      console.error('Error solicitando respuesta IA:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleEditResponse = () => {
    setEditedResponse(activeJob?.response_text || '');
    setIsEditing(true);
  };

  const handleSendSuggestion = () => {
    const content = isEditing ? editedResponse : activeJob?.response_text;
    if (content) {
      onSendSuggestion(content);
      setIsEditing(false);
      setEditedResponse('');
    }
  };

  const handleCopy = () => {
    const content = activeJob?.response_text;
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getSentimentColor = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-600 dark:text-green-400';
      case 'negative':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getSentimentLabel = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return 'Positivo';
      case 'negative':
        return 'Negativo';
      default:
        return 'Neutral';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-500" />
            Asistente IA
            {aiMode && (
              <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                {aiMode === 'auto' ? 'Automático' : aiMode === 'hybrid' ? 'Híbrido' : 'Manual'}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto space-y-4">
        {/* Resumen de la conversación */}
        {summary && (
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Resumen de Conversación
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {summary.summary}
            </p>
            {summary.key_points && summary.key_points.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Puntos clave:
                </span>
                <ul className="mt-1 space-y-1">
                  {summary.key_points.map((point, index) => (
                    <li key={index} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                      <span className="text-purple-500">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.sentiment && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Sentimiento:</span>
                <span className={`text-xs font-medium ${getSentimentColor(summary.sentiment)}`}>
                  {getSentimentLabel(summary.sentiment)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Job activo */}
        {activeJob && activeJob.status !== 'completed' && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {activeJob.status === 'pending' ? 'Esperando...' : 'Generando respuesta...'}
              </span>
            </div>
            <Progress value={activeJob.status === 'pending' ? 30 : 70} className="h-1" />
          </div>
        )}

        {/* Respuesta sugerida */}
        {activeJob?.status === 'completed' && activeJob.response_text && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Respuesta Sugerida
                </span>
              </div>
              {activeJob.confidence_score && (
                <Badge variant="outline" className="text-xs">
                  {Math.round(activeJob.confidence_score * 100)}% confianza
                </Badge>
              )}
            </div>

            {isEditing ? (
              <Textarea
                value={editedResponse}
                onChange={(e) => setEditedResponse(e.target.value)}
                className="min-h-[100px] mb-2"
              />
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-3">
                {activeJob.response_text}
              </p>
            )}

            {/* Acciones */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleEditResponse}
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <ThumbsUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <ThumbsDown className="h-3 w-3" />
                </Button>
              </div>
              <Button
                size="sm"
                onClick={handleSendSuggestion}
                className="h-7 bg-green-600 hover:bg-green-700"
              >
                <Send className="h-3 w-3 mr-1" />
                {isEditing ? 'Enviar editado' : 'Enviar'}
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {activeJob?.status === 'failed' && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                Error al generar respuesta
              </span>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              {activeJob.error_message || 'Ocurrió un error inesperado'}
            </p>
          </div>
        )}

        {/* Botón generar respuesta */}
        {(!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestResponse}
            disabled={isRequesting || loading}
            className="w-full"
          >
            {isRequesting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {activeJob?.status === 'completed' ? 'Generar otra respuesta' : 'Generar respuesta IA'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
