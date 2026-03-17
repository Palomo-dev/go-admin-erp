'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  ArrowLeft,
  Users,
  Filter,
  Zap,
  FileText,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { SegmentosService } from './SegmentosService';
import { Segment, SegmentStats } from './types';
import { formatDate } from '@/utils/Utils';

export function SegmentosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stats, setStats] = useState<SegmentStats>({ total: 0, dynamic: 0, static: 0, totalCustomers: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [deleteSegment, setDeleteSegment] = useState<Segment | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [segmentsData, statsData] = await Promise.all([
        SegmentosService.getSegments(),
        SegmentosService.getStats(),
      ]);
      setSegments(segmentsData);
      setStats(statsData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los segmentos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDuplicate = async (segment: Segment) => {
    const duplicated = await SegmentosService.duplicateSegment(segment.id);
    if (duplicated) {
      toast({ title: 'Segmento duplicado' });
      loadData();
    }
  };

  const handleDelete = async () => {
    if (!deleteSegment) return;
    const success = await SegmentosService.deleteSegment(deleteSegment.id);
    if (success) {
      toast({ title: 'Segmento eliminado' });
      loadData();
    }
    setDeleteSegment(null);
  };

  const handleRecalculate = async (segment: Segment) => {
    toast({ title: 'Recalculando...', description: 'Esto puede tomar unos segundos' });
    const count = await SegmentosService.recalculateSegment(segment.id);
    toast({ title: 'Recálculo completado', description: `${count} clientes en el segmento` });
    loadData();
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Filter className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
              Segmentos
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              CRM / Segmentos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Link href="/app/crm/segmentos/nuevo">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Segmento
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg shrink-0">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 dark:bg-green-900/40 rounded-lg shrink-0">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.dynamic}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Dinámicos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg shrink-0">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.static}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Estáticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.totalCustomers}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Clientes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold">Nombre</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden sm:table-cell">Tipo</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold text-center">Clientes</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden md:table-cell">Última ejecución</TableHead>
              <TableHead className="w-10 sm:w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                    <span className="text-gray-500">Cargando...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : segments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Filter className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    No hay segmentos
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Crea tu primer segmento para agrupar clientes
                  </p>
                  <Link href="/app/crm/segmentos/nuevo">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      Crear Segmento
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              segments.map((segment) => (
                <TableRow
                  key={segment.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50"
                  onClick={() => router.push(`/app/crm/segmentos/${segment.id}`)}
                >
                  <TableCell className="py-2 sm:py-3">
                    <div>
                      <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate max-w-[150px] sm:max-w-none">
                        {segment.name}
                      </p>
                      {segment.description && (
                        <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                          {segment.description}
                        </p>
                      )}
                      <div className="sm:hidden mt-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            segment.is_dynamic
                              ? 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30'
                              : 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30'
                          }`}
                        >
                          {segment.is_dynamic ? 'Dinámico' : 'Estático'}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-[10px] sm:text-xs ${
                        segment.is_dynamic
                          ? 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30'
                          : 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30'
                      }`}
                    >
                      {segment.is_dynamic ? 'Dinámico' : 'Estático'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 text-center">
                    <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                      {segment.customer_count || 0}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      {segment.last_run_at ? formatDate(segment.last_run_at) : 'Nunca'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/app/crm/segmentos/${segment.id}`); }}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/app/crm/segmentos/${segment.id}?edit=true`); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        {segment.is_dynamic && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRecalculate(segment); }}>
                            <Play className="h-4 w-4 mr-2" />
                            Recalcular
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(segment); }}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setDeleteSegment(segment); }}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!deleteSegment} onOpenChange={() => setDeleteSegment(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">
              ¿Eliminar segmento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El segmento &quot;{deleteSegment?.name}&quot; será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 dark:border-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
