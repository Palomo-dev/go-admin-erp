'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/Utils';
import {
  GitCompare,
  Copy,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { TimelineEvent } from '@/lib/services/timelineService';

interface EventDiffPanelProps {
  event: TimelineEvent;
  hasSensitiveAccess?: boolean;
}

export function EventDiffPanel({ event, hasSensitiveAccess = true }: EventDiffPanelProps) {
  const [copied, setCopied] = useState<'before' | 'after' | 'full' | null>(null);
  const [showSensitive, setShowSensitive] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const payload = event.payload as Record<string, unknown>;
  const oldData = payload?.old_data as Record<string, unknown> | undefined;
  const newData = payload?.new_data as Record<string, unknown> | undefined;

  const handleCopy = (data: unknown, type: 'before' | 'after' | 'full') => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedKeys);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedKeys(newExpanded);
  };

  const sensitiveFields = ['password', 'token', 'secret', 'api_key', 'credit_card', 'ssn'];

  const isSensitive = (key: string): boolean => {
    return sensitiveFields.some(sf => key.toLowerCase().includes(sf));
  };

  const maskValue = (value: unknown): string => {
    if (!hasSensitiveAccess || !showSensitive) {
      return '••••••••';
    }
    return JSON.stringify(value);
  };

  const renderValue = (value: unknown, key: string, depth: number = 0): React.ReactNode => {
    if (isSensitive(key) && (!hasSensitiveAccess || !showSensitive)) {
      return <span className="text-gray-400 italic">{maskValue(value)}</span>;
    }

    if (value === null) {
      return <span className="text-gray-400 italic">null</span>;
    }

    if (value === undefined) {
      return <span className="text-gray-400 italic">undefined</span>;
    }

    if (typeof value === 'boolean') {
      return <span className={value ? 'text-green-600' : 'text-red-600'}>{String(value)}</span>;
    }

    if (typeof value === 'number') {
      return <span className="text-purple-600 dark:text-purple-400">{value}</span>;
    }

    if (typeof value === 'string') {
      if (value.length > 100) {
        return (
          <span className="text-amber-600 dark:text-amber-400">
            "{value.substring(0, 100)}..."
          </span>
        );
      }
      return <span className="text-amber-600 dark:text-amber-400">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      const arrayKey = `${key}-array`;
      const isExpanded = expandedKeys.has(arrayKey);
      
      return (
        <div>
          <button
            onClick={() => toggleExpand(arrayKey)}
            className="flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="text-cyan-600 dark:text-cyan-400">Array[{value.length}]</span>
          </button>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1">
              {value.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-gray-400">[{idx}]:</span>
                  {renderValue(item, `${key}[${idx}]`, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'object') {
      const objKey = `${key}-obj`;
      const isExpanded = expandedKeys.has(objKey) || depth === 0;
      const entries = Object.entries(value as Record<string, unknown>);
      
      return (
        <div>
          {depth > 0 && (
            <button
              onClick={() => toggleExpand(objKey)}
              className="flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span className="text-gray-500">{`{${entries.length} keys}`}</span>
            </button>
          )}
          {isExpanded && (
            <div className={cn('space-y-1', depth > 0 && 'ml-4 mt-1')}>
              {entries.map(([k, v]) => (
                <div key={k} className="flex items-start gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-medium">"{k}":</span>
                  {renderValue(v, k, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  const renderDiff = () => {
    if (!oldData && !newData) {
      return (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No hay datos de antes/después disponibles para este evento.
        </div>
      );
    }

    const allKeys = new Set([
      ...Object.keys(oldData || {}),
      ...Object.keys(newData || {}),
    ]);

    return (
      <div className="space-y-2">
        {Array.from(allKeys).map((key) => {
          const oldVal = oldData?.[key];
          const newVal = newData?.[key];
          const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
          
          return (
            <div
              key={key}
              className={cn(
                'p-3 rounded-lg border',
                hasChanged
                  ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                  : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
              )}
            >
              <div className="font-medium text-sm text-gray-900 dark:text-white mb-2">
                {key}
                {hasChanged && (
                  <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">(modificado)</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div className={cn(
                  'p-2 rounded',
                  hasChanged ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-gray-800'
                )}>
                  <div className="text-gray-500 dark:text-gray-400 mb-1 text-xs font-sans">Antes:</div>
                  {renderValue(oldVal, key)}
                </div>
                <div className={cn(
                  'p-2 rounded',
                  hasChanged ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-800'
                )}>
                  <div className="text-gray-500 dark:text-gray-400 mb-1 text-xs font-sans">Después:</div>
                  {renderValue(newVal, key)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-blue-500" />
            Antes / Después
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasSensitiveAccess && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSensitive(!showSensitive)}
                className="text-xs"
              >
                {showSensitive ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5 mr-1" />
                    Ocultar sensibles
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Mostrar sensibles
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="diff" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="diff">Vista Diff</TabsTrigger>
            <TabsTrigger value="before">Antes (JSON)</TabsTrigger>
            <TabsTrigger value="after">Después (JSON)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="diff">
            <ScrollArea className="h-[400px] pr-4">
              {renderDiff()}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="before">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(oldData, 'before')}
                className="absolute top-2 right-2 z-10"
              >
                {copied === 'before' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <ScrollArea className="h-[400px]">
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {oldData ? JSON.stringify(oldData, null, 2) : 'No hay datos anteriores'}
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
          
          <TabsContent value="after">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(newData, 'after')}
                className="absolute top-2 right-2 z-10"
              >
                {copied === 'after' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <ScrollArea className="h-[400px]">
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {newData ? JSON.stringify(newData, null, 2) : 'No hay datos nuevos'}
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
