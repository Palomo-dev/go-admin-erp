'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BookOpen, Plus, Database, FileText, Search, Upload, Bot } from 'lucide-react';
import type { KnowledgeStats } from '@/lib/services/knowledgeService';

interface KnowledgeHeaderProps {
  stats: KnowledgeStats | null;
  loading: boolean;
  onCreateSource: () => void;
  onImport?: () => void;
  onAISettings?: () => void;
}

export default function KnowledgeHeader({ stats, loading, onCreateSource, onImport, onAISettings }: KnowledgeHeaderProps) {
  const statItems = [
    {
      label: 'Fuentes',
      value: stats?.totalSources || 0,
      icon: Database,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      label: 'Activas',
      value: stats?.activeSources || 0,
      icon: BookOpen,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      label: 'Fragmentos',
      value: stats?.totalFragments || 0,
      icon: FileText,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    {
      label: 'Indexados',
      value: stats?.indexedFragments || 0,
      icon: Search,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30'
    }
  ];

  return (
    <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Base de Conocimiento
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona las fuentes de información para el asistente de IA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onAISettings && (
            <Button
              onClick={onAISettings}
              variant="outline"
              className="border-gray-300 dark:border-gray-700 gap-2"
            >
              <Bot className="h-4 w-4" />
              Config. IA
            </Button>
          )}
          {onImport && (
            <Button
              onClick={onImport}
              variant="outline"
              className="border-gray-300 dark:border-gray-700 gap-2"
            >
              <Upload className="h-4 w-4" />
              Importar
            </Button>
          )}
          <Button
            onClick={onCreateSource}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva Fuente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statItems.map((item) => (
          <Card
            key={item.label}
            className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {loading ? '-' : item.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
