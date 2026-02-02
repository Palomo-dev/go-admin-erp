'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { formatDate } from '@/utils/Utils';
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { TopProblem } from '@/lib/services/integrationsService';

interface TopProblemsProps {
  problems: TopProblem[];
  loading: boolean;
  onViewConnection?: (connectionId: string) => void;
  onRetry?: (connectionId: string) => void;
}

export function TopProblems({ problems, loading, onViewConnection, onRetry }: TopProblemsProps) {
  if (loading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Top Problemas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (problems.length === 0) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Top Problemas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              ¡Sin problemas!
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Todas las integraciones funcionan correctamente
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Top Problemas
          <Badge variant="secondary" className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {problems.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {problems.map((problem) => (
            <div
              key={problem.connection_id}
              className={cn(
                'p-3 rounded-lg border transition-colors',
                'border-red-200 dark:border-red-800/50',
                'bg-red-50/50 dark:bg-red-900/10',
                'hover:bg-red-100/50 dark:hover:bg-red-900/20'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {problem.connection_name}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {problem.provider_name}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {problem.last_error}
                  </p>
                  {problem.last_error_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Último error: {formatDate(problem.last_error_at)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge className="bg-red-600 text-white hover:bg-red-700">
                    {problem.error_count} errores
                  </Badge>
                  <div className="flex gap-1">
                    {onRetry && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-gray-500 hover:text-blue-600"
                        onClick={() => onRetry(problem.connection_id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {onViewConnection && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-gray-500 hover:text-blue-600"
                        onClick={() => onViewConnection(problem.connection_id)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default TopProblems;
