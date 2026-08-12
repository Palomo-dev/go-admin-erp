'use client';

import { Bot, User } from 'lucide-react';
import type { ReportData } from '@/lib/services/reportes/types';
import { ReporteKPIs } from '../ReporteKPIs';
import { ReporteTabla } from '../ReporteTabla';
import { ReporteChart } from '../ReporteChart';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  reportData?: ReportData;
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Bubble + contenido */}
      <div className={`flex-1 min-w-0 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        <div className={`rounded-lg px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
        }`}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Reporte embebido */}
        {message.reportData && (
          <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {message.reportData.titulo}
              </h4>
              <span className="text-xs text-gray-400">
                {message.reportData.periodo.etiqueta}
              </span>
            </div>

            {message.reportData.kpis.length > 0 && (
              <ReporteKPIs kpis={message.reportData.kpis} />
            )}

            <ReporteTabla data={message.reportData} />

            {message.reportData.filas.length > 0 && (
              <ReporteChart data={message.reportData} />
            )}
          </div>
        )}

        <span className="text-xs text-gray-400 dark:text-gray-500 px-1">
          {new Date(message.timestamp).toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
