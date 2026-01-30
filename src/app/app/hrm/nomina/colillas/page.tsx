'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService from '@/lib/services/payrollService';
import type { PayrollSlip } from '@/lib/services/payrollService';
import { SlipsListTable } from '@/components/hrm/nomina/colillas';
import { formatCurrency } from '@/utils/Utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  RefreshCw,
  FileText,
  Search,
  CheckCircle,
  DollarSign,
  Users,
  ArrowLeft,
  Download,
} from 'lucide-react';

export default function ColillasPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [slips, setSlips] = useState<PayrollSlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSlips, setSelectedSlips] = useState<string[]>([]);

  // Dialog states
  const [approveOpen, setApproveOpen] = useState(false);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new PayrollService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const filters: any = {};
      if (statusFilter && statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      const slipsData = await service.getSlips(filters);

      // Filter by search term
      let filtered = slipsData;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = slipsData.filter(s =>
          s.employee_name?.toLowerCase().includes(term) ||
          s.employee_code?.toLowerCase().includes(term) ||
          s.period_name?.toLowerCase().includes(term)
        );
      }

      setSlips(filtered);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las colillas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, searchTerm, statusFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleApprove = async (slip: PayrollSlip) => {
    const service = getService();
    if (!service) return;

    try {
      await service.updateSlipStatus(slip.id, 'approved');
      toast({ title: 'Colilla aprobada' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo aprobar la colilla',
        variant: 'destructive',
      });
    }
  };

  const handleMarkPaid = async (slip: PayrollSlip) => {
    const service = getService();
    if (!service) return;

    try {
      await service.updateSlipStatus(slip.id, 'paid');
      toast({ title: 'Colilla marcada como pagada' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo marcar como pagada',
        variant: 'destructive',
      });
    }
  };

  const handleApproveSelected = async () => {
    if (selectedSlips.length === 0) return;
    const service = getService();
    if (!service) return;

    try {
      await service.approveSlips(selectedSlips);
      toast({ title: `${selectedSlips.length} colilla(s) aprobada(s)` });
      setSelectedSlips([]);
      setApproveOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron aprobar las colillas',
        variant: 'destructive',
      });
    }
  };

  // Stats
  const totalSlips = slips.length;
  const draftSlips = slips.filter(s => s.status === 'draft').length;
  const approvedSlips = slips.filter(s => s.status === 'approved').length;
  const paidSlips = slips.filter(s => s.status === 'paid').length;
  const totalNet = slips.reduce((sum, s) => sum + s.net_pay, 0);

  const statuses = getService()?.getSlipStatuses() || [];

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm/nomina">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-600" />
              Colillas de Nómina
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Nómina / Colillas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {selectedSlips.length > 0 && (
            <Button
              onClick={() => setApproveOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Aprobar ({selectedSlips.length})
            </Button>
          )}
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{totalSlips}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Borrador</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{draftSlips}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Aprobadas</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{approvedSlips}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pagadas</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{paidSlips}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Neto</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totalNet, 'COP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por empleado o periodo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todos</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <SlipsListTable
            slips={slips}
            selectedIds={selectedSlips}
            onSelectChange={setSelectedSlips}
            onApprove={handleApprove}
            onMarkPaid={handleMarkPaid}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/nomina">
              <Button variant="outline" size="sm">
                ← Volver a Periodos
              </Button>
            </Link>
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← HRM
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Aprobar {selectedSlips.length} colilla(s)?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Las colillas aprobadas estarán listas para pago.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveSelected}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
