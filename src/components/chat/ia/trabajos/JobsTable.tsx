'use client';

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Eye, 
  RotateCcw, 
  XCircle,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ban,
  Briefcase
} from 'lucide-react';
import { AIJob, JOB_TYPE_OPTIONS } from '@/lib/services/aiJobsService';

interface JobsTableProps {
  jobs: AIJob[];
  loading: boolean;
  onViewDetails: (job: AIJob) => void;
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

export default function JobsTable({
  jobs,
  loading,
  onViewDetails,
  onRetry,
  onCancel
}: JobsTableProps) {
  const getJobTypeLabel = (type: string) => {
    return JOB_TYPE_OPTIONS.find(t => t.value === type)?.label || type;
  };

  const formatDuration = (job: AIJob) => {
    if (!job.started_at) return '-';
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const start = new Date(job.started_at);
    const diffMs = end.getTime() - start.getTime();
    
    if (diffMs < 1000) return `${diffMs}ms`;
    if (diffMs < 60000) return `${(diffMs / 1000).toFixed(1)}s`;
    return `${(diffMs / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="py-12 text-center">
        <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">No hay trabajos para mostrar</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          Los trabajos de IA aparecerán aquí cuando se procesen
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 dark:border-gray-700">
            <TableHead className="text-gray-600 dark:text-gray-400">ID</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400">Tipo</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400">Estado</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400">Duración</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400">Tokens</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400">Confianza</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400">Creado</TableHead>
            <TableHead className="text-gray-600 dark:text-gray-400 w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const status = statusConfig[job.status] || statusConfig.pending;
            return (
              <TableRow 
                key={job.id}
                className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => onViewDetails(job)}
              >
                <TableCell className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  {job.id.substring(0, 8)}...
                </TableCell>
                <TableCell>
                  <span className="text-gray-900 dark:text-white text-sm">
                    {getJobTypeLabel(job.job_type)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={`${status.color} gap-1`}>
                    {status.icon}
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400 text-sm">
                  {formatDuration(job)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400 text-sm">
                  {job.prompt_tokens || job.completion_tokens 
                    ? `${(job.prompt_tokens || 0) + (job.completion_tokens || 0)}`
                    : '-'
                  }
                </TableCell>
                <TableCell>
                  {job.confidence_score !== null ? (
                    <span className={`text-sm font-medium ${
                      job.confidence_score >= 0.7 
                        ? 'text-green-600 dark:text-green-400' 
                        : job.confidence_score >= 0.4 
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}>
                      {(job.confidence_score * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-gray-500 dark:text-gray-400 text-sm">
                  {formatDistanceToNow(new Date(job.created_at), { 
                    addSuffix: true, 
                    locale: es 
                  })}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetails(job)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Detalles
                      </DropdownMenuItem>
                      {job.status === 'failed' && (
                        <DropdownMenuItem onClick={() => onRetry(job)}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reintentar
                        </DropdownMenuItem>
                      )}
                      {(job.status === 'pending' || job.status === 'running') && (
                        <DropdownMenuItem 
                          onClick={() => onCancel(job)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancelar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
