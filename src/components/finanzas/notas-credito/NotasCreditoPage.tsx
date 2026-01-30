'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Download,
  Search,
  RefreshCw,
  ArrowLeft,
  FileText,
  MoreVertical,
  Eye,
  XCircle,
  Loader2,
  Filter,
  Calendar,
  User,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { notasCreditoService, NotaCredito } from '@/lib/services/notasCreditoService';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  voided: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  sent: 'Enviada',
  accepted: 'Aceptada DIAN',
  rejected: 'Rechazada',
  voided: 'Anulada',
  paid: 'Pagada',
};

const statusIcons: Record<string, React.ReactNode> = {
  draft: <FileText className="h-3 w-3" />,
  pending: <Clock className="h-3 w-3" />,
  sent: <CheckCircle className="h-3 w-3" />,
  accepted: <CheckCircle className="h-3 w-3" />,
  rejected: <AlertCircle className="h-3 w-3" />,
  voided: <XCircle className="h-3 w-3" />,
  paid: <CheckCircle className="h-3 w-3" />,
};

export function NotasCreditoPage() {
  const router = useRouter();
  const [notas, setNotas] = useState<NotaCredito[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    total: 0,
    count: 0,
    thisMonth: 0,
    pending: 0,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: { status?: string; search?: string } = {};
      
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }

      const [notasData, statsData] = await Promise.all([
        notasCreditoService.getNotasCredito(filters),
        notasCreditoService.getStats(),
      ]);
      setNotas(notasData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las notas de crédito',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnular = async (id: string) => {
    if (!confirm('¿Está seguro de anular esta nota de crédito?')) return;
    
    const reason = prompt('Motivo de la anulación:');
    try {
      const result = await notasCreditoService.anularNotaCredito(id, reason || undefined);
      if (result.success) {
        toast({ title: 'Éxito', description: 'Nota de crédito anulada correctamente' });
        loadData();
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al anular', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Número', 'Fecha', 'Cliente', 'Factura Origen', 'Total', 'Estado'].join(','),
      ...notas.map(n => 
        [
          n.number,
          formatDate(n.issue_date),
          n.customer ? `${n.customer.first_name || ''} ${n.customer.last_name || ''}`.trim() || 'Sin cliente' : 'Sin cliente',
          n.related_invoice?.number || '-',
          n.total,
          statusLabels[n.status] || n.status
        ].join(',')
      ),
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notas_credito_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Notas de Crédito
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestión de notas crédito emitidas
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} className="dark:border-gray-700">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Emitido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(stats.total)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Este Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.thisMonth)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Notas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.count}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              En Borrador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.pending}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por número o notas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aceptada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
            <SelectItem value="voided">Anulada</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={loadData} className="dark:border-gray-700">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-gray-400">Número</TableHead>
                <TableHead className="dark:text-gray-400">Fecha</TableHead>
                <TableHead className="dark:text-gray-400">Cliente</TableHead>
                <TableHead className="dark:text-gray-400">Factura Origen</TableHead>
                <TableHead className="dark:text-gray-400 text-right">Total</TableHead>
                <TableHead className="dark:text-gray-400">Estado</TableHead>
                <TableHead className="dark:text-gray-400 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No hay notas de crédito registradas
                  </TableCell>
                </TableRow>
              ) : (
                notas.map((nota) => (
                  <TableRow key={nota.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {nota.number}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {formatDate(nota.issue_date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {nota.customer ? `${nota.customer.first_name || ''} ${nota.customer.last_name || ''}`.trim() || 'Sin cliente' : 'Sin cliente'}
                          </p>
                          {nota.customer?.identification_number && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {nota.customer.identification_number}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {nota.related_invoice ? (
                        <Link 
                          href={`/app/finanzas/facturas-venta/${nota.related_invoice_id}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {nota.related_invoice.number}
                        </Link>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">
                      -{formatCurrency(nota.total)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[nota.status]} flex items-center gap-1 w-fit`}>
                        {statusIcons[nota.status]}
                        {statusLabels[nota.status] || nota.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <DropdownMenuItem
                            onClick={() => router.push(`/app/finanzas/notas-credito/${nota.id}`)}
                            className="cursor-pointer"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalle
                          </DropdownMenuItem>
                          {nota.status !== 'voided' && nota.status !== 'accepted' && (
                            <>
                              <DropdownMenuSeparator className="dark:bg-gray-700" />
                              <DropdownMenuItem
                                onClick={() => handleAnular(nota.id)}
                                className="cursor-pointer text-red-600 dark:text-red-400"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Anular
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
