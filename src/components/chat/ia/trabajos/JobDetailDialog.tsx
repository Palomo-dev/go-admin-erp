'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ban,
  Copy,
  RotateCcw,
  XCircle,
  Terminal,
  FileText,
  Info
} from 'lucide-react';
import { AIJob, JOB_TYPE_OPTIONS } from '@/lib/services/aiJobsService';

interface JobDetailDialogProps {
  job: AIJob | null;
  logs: string[];
  open: boolean;
  onClose: () => void;
  onRetry: (job: AIJob) => void;
  onCancel: (job: AIJob) => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { 
    icon: <Clock className="h-4 w-4" />, 
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    label: 'Pendiente'
  },
  running: { 
    icon: <Loader2 className="h-4 w-4 animate-spin" />, 
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Ejecutando'
  },
  completed: { 
    icon: <CheckCircle2 className="h-4 w-4" />, 
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'Completado'
  },
  failed: { 
    icon: <AlertCircle className="h-4 w-4" />, 
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Fallido'
  },
  cancelled: { 
    icon: <Ban className="h-4 w-4" />, 
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    label: 'Cancelado'
  }
};

export default function JobDetailDialog({
  job,
  logs,
  open,
  onClose,
  onRetry,
  onCancel
}: JobDetailDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!job) return null;

  const status = statusConfig[job.status] || statusConfig.pending;
  const jobTypeLabel = JOB_TYPE_OPTIONS.find(t => t.value === job.job_type)?.label || job.job_type;

  const handleCopyId = () => {
    navigator.clipboard.writeText(job.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm:ss", { locale: es });
  };

  const calculateDuration = () => {
    if (!job.started_at) return '-';
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const start = new Date(job.started_at);
    const diffMs = end.getTime() - start.getTime();
    
    if (diffMs < 1000) return `${diffMs}ms`;
    if (diffMs < 60000) return `${(diffMs / 1000).toFixed(2)}s`;
    return `${(diffMs / 60000).toFixed(2)}min`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl">Detalle del Trabajo</DialogTitle>
              <Badge className={`${status.color} gap-1`}>
                {status.icon}
                {status.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="bg-gray-100 dark:bg-gray-800">
            <TabsTrigger value="info" className="gap-2">
              <Info className="h-4 w-4" />
              Información
            </TabsTrigger>
            <TabsTrigger value="response" className="gap-2">
              <FileText className="h-4 w-4" />
              Respuesta
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Terminal className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="info" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">ID del Job</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm font-mono text-gray-900 dark:text-white">
                      {job.id}
                    </code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyId}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    {copied && <span className="text-xs text-green-500">Copiado!</span>}
                  </div>
                </Card>

                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tipo</p>
                  <p className="text-gray-900 dark:text-white mt-1 font-medium">{jobTypeLabel}</p>
                </Card>

                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Creado</p>
                  <p className="text-gray-900 dark:text-white mt-1">{formatDate(job.created_at)}</p>
                </Card>

                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Duración</p>
                  <p className="text-gray-900 dark:text-white mt-1 font-mono">{calculateDuration()}</p>
                </Card>

                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Iniciado</p>
                  <p className="text-gray-900 dark:text-white mt-1">{formatDate(job.started_at)}</p>
                </Card>

                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Completado</p>
                  <p className="text-gray-900 dark:text-white mt-1">{formatDate(job.completed_at)}</p>
                </Card>
              </div>

              {(job.prompt_tokens || job.completion_tokens || job.total_cost) && (
                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Uso de Recursos</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tokens Prompt</p>
                      <p className="text-lg font-mono text-gray-900 dark:text-white">{job.prompt_tokens || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tokens Completion</p>
                      <p className="text-lg font-mono text-gray-900 dark:text-white">{job.completion_tokens || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Costo Total</p>
                      <p className="text-lg font-mono text-gray-900 dark:text-white">
                        ${(job.total_cost || 0).toFixed(4)}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {job.confidence_score !== null && (
                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Confianza</p>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-lg font-bold ${
                        job.confidence_score >= 0.7 
                          ? 'text-green-600 dark:text-green-400' 
                          : job.confidence_score >= 0.4 
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}>
                        {(job.confidence_score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          job.confidence_score >= 0.7 
                            ? 'bg-green-500' 
                            : job.confidence_score >= 0.4 
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${job.confidence_score * 100}%` }}
                      />
                    </div>
                  </div>
                </Card>
              )}

              {job.error_message && (
                <Card className="p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Error
                  </p>
                  <p className="text-red-600 dark:text-red-400 mt-2 text-sm">
                    {job.error_code && <span className="font-mono">[{job.error_code}] </span>}
                    {job.error_message}
                  </p>
                </Card>
              )}

              {job.fragments_used && job.fragments_used.length > 0 && (
                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Fragmentos Usados ({job.fragments_used.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.fragments_used.map((id, idx) => (
                      <Badge key={idx} variant="outline" className="font-mono text-xs">
                        {id.substring(0, 8)}...
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="response" className="mt-0">
              {job.response_text ? (
                <Card className="p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Respuesta Generada</p>
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                    {job.response_text}
                  </p>
                </Card>
              ) : (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                  No hay respuesta generada
                </div>
              )}
            </TabsContent>

            <TabsContent value="logs" className="mt-0">
              <Card className="p-4 bg-gray-900 dark:bg-black border-gray-700 font-mono text-sm">
                {logs.length > 0 ? (
                  <div className="space-y-1">
                    {logs.map((log, idx) => (
                      <p 
                        key={idx} 
                        className={`${
                          log.includes('[ERROR]') 
                            ? 'text-red-400' 
                            : log.includes('[INFO]')
                              ? 'text-blue-400'
                              : 'text-green-400'
                        }`}
                      >
                        {log}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No hay logs disponibles</p>
                )}
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
          {job.status === 'failed' && (
            <Button
              onClick={() => onRetry(job)}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reintentar
            </Button>
          )}
          {(job.status === 'pending' || job.status === 'running') && (
            <Button
              variant="destructive"
              onClick={() => onCancel(job)}
              className="gap-2"
            >
              <XCircle className="h-4 w-4" />
              Cancelar
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
