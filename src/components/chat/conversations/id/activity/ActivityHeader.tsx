'use client';

import React from 'react';
import { ArrowLeft, Download, Activity, GitBranch, UserCheck, Tag, Bot, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ActivityStats } from '@/lib/services/conversationActivityService';

interface ActivityHeaderProps {
  conversationId: string;
  stats: ActivityStats | null;
  loading?: boolean;
  onExport?: () => void;
  canExport?: boolean;
}

export default function ActivityHeader({ 
  conversationId, 
  stats, 
  loading,
  onExport,
  canExport = false
}: ActivityHeaderProps) {
  const router = useRouter();

  return (
    <div className="border-b dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/app/chat/conversations/${conversationId}`)}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Bitácora de Actividad
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Historial completo de cambios y acciones en la conversación
              </p>
            </div>
          </div>

          {canExport && onExport && (
            <Button
              variant="outline"
              onClick={onExport}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        {!loading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                    <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Total</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                      {stats.totalActivities}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 dark:bg-green-800 rounded-lg">
                    <GitBranch className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-green-600 dark:text-green-400">Estados</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      {stats.statusChanges}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-800 rounded-lg">
                    <UserCheck className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">Asignaciones</p>
                    <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                      {stats.assignments}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                    <Tag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Etiquetas</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                      {stats.tagChanges}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-violet-100 dark:bg-violet-800 rounded-lg">
                    <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-xs text-violet-600 dark:text-violet-400">IA</p>
                    <p className="text-lg font-bold text-violet-700 dark:text-violet-300">
                      {stats.aiJobs}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Auditoría</p>
                    <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                      {stats.auditLogs}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
