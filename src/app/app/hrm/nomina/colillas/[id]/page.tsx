'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService from '@/lib/services/payrollService';
import type { PayrollSlip, PayrollItem, CreateItemDTO } from '@/lib/services/payrollService';
import { ItemsTable } from '@/components/hrm/nomina/colillas/[id]';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  ArrowLeft,
  FileText,
  RefreshCw,
  CheckCircle,
  DollarSign,
  User,
  Clock,
  Plus,
  Download,
  Printer,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  paid: 'Pagado',
};

export default function ColillaDetallePage() {
  const params = useParams();
  const router = useRouter();
  const slipId = params.id as string;

  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [slip, setSlip] = useState<PayrollSlip | null>(null);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [approveOpen, setApproveOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<PayrollItem | null>(null);
  const [newItem, setNewItem] = useState<Partial<CreateItemDTO>>({
    item_type: 'earning',
    code: '',
    name: '',
    amount: 0,
  });

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new PayrollService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [slipData, itemsData] = await Promise.all([
        service.getSlipById(slipId),
        service.getItems(slipId),
      ]);

      if (!slipData) {
        toast({
          title: 'Error',
          description: 'Colilla no encontrada',
          variant: 'destructive',
        });
        router.push('/app/hrm/nomina/colillas');
        return;
      }

      setSlip(slipData);
      setItems(itemsData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la colilla',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, slipId, router, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && slipId) {
      loadData();
    }
  }, [organization?.id, orgLoading, slipId, loadData]);

  // Handlers
  const handleApprove = async () => {
    const service = getService();
    if (!service || !slip) return;

    try {
      await service.updateSlipStatus(slip.id, 'approved');
      toast({ title: 'Colilla aprobada' });
      setApproveOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo aprobar la colilla',
        variant: 'destructive',
      });
    }
  };

  const handleMarkPaid = async () => {
    const service = getService();
    if (!service || !slip) return;

    try {
      await service.updateSlipStatus(slip.id, 'paid');
      toast({ title: 'Colilla marcada como pagada' });
      setMarkPaidOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo marcar como pagada',
        variant: 'destructive',
      });
    }
  };

  const handleAddItem = async () => {
    if (!newItem.code || !newItem.name || !newItem.amount) return;
    const service = getService();
    if (!service) return;

    try {
      await service.createItem({
        payroll_slip_id: slipId,
        item_type: newItem.item_type || 'earning',
        code: newItem.code,
        name: newItem.name,
        amount: newItem.amount,
      });
      toast({ title: 'Concepto agregado' });
      setAddItemOpen(false);
      setNewItem({ item_type: 'earning', code: '', name: '', amount: 0 });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo agregar el concepto',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItem) return;
    const service = getService();
    if (!service) return;

    try {
      await service.deleteItem(deleteItem.id);
      toast({ title: 'Concepto eliminado' });
      setDeleteItem(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el concepto',
        variant: 'destructive',
      });
    }
  };

  const canEdit = slip?.status === 'draft';
  const itemTypes = getService()?.getItemTypes() || [];

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!slip) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Colilla no encontrada</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm/nomina/colillas">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-600" />
              Colilla de Nómina
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {slip.period_name} - {slip.employee_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
          {slip.status === 'draft' && (
            <Button
              onClick={() => setApproveOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Aprobar
            </Button>
          )}
          {slip.status === 'approved' && (
            <Button
              onClick={() => setMarkPaidOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Registrar Pago
            </Button>
          )}
        </div>
      </div>

      {/* Employee & Period Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">Información</span>
              <Badge className={statusColors[slip.status || 'draft']}>
                {statusLabels[slip.status || 'draft']}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <User className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {slip.employee_name}
                </p>
                {slip.employee_code && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {slip.employee_code}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Periodo</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {slip.period_name || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Run</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  #{slip.run_number || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Salario Base</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(slip.base_salary, slip.currency_code)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Periodo Salario</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {slip.salary_period}
                </p>
              </div>
            </div>

            {/* Hours */}
            {(slip.regular_hours || slip.overtime_day_hours || slip.overtime_night_hours) && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900 dark:text-white">Horas</span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Regulares</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {slip.regular_hours || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Extras Día</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {slip.overtime_day_hours || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Extras Noche</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {slip.overtime_night_hours || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Festivos</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {slip.holiday_hours || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {slip.paid_at && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">Pagado el</p>
                <p className="font-medium text-purple-600 dark:text-purple-400">
                  {formatDate(slip.paid_at)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className="bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">
              Resumen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Devengado</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(slip.gross_pay, slip.currency_code)}
              </p>
            </div>
            <div>
              <p className="text-sm text-red-700 dark:text-red-300">Total Deducciones</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(slip.total_deductions, slip.currency_code)}
              </p>
            </div>
            <div className="pt-4 border-t border-blue-200 dark:border-blue-700">
              <p className="text-sm text-green-700 dark:text-green-300">Neto a Pagar</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(slip.net_pay, slip.currency_code)}
              </p>
            </div>
            {slip.total_employer_cost && (
              <div className="pt-4 border-t border-blue-200 dark:border-blue-700">
                <p className="text-sm text-blue-700 dark:text-blue-300">Costo Empleador</p>
                <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                  {formatCurrency(slip.total_employer_cost, slip.currency_code)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-gray-900 dark:text-white">Conceptos de Nómina</span>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => setAddItemOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="mr-1 h-4 w-4" />
                Agregar Concepto
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsTable
            items={items}
            currencyCode={slip.currency_code}
            onDelete={canEdit ? (item) => setDeleteItem(item) : undefined}
            canEdit={canEdit}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/nomina/colillas">
              <Button variant="outline" size="sm">
                ← Volver a Colillas
              </Button>
            </Link>
            <Link href="/app/hrm/nomina">
              <Button variant="outline" size="sm">
                Ver Periodos
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
              ¿Aprobar colilla?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Una vez aprobada, la colilla estará lista para pago y no podrá ser modificada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Paid Dialog */}
      <AlertDialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Registrar pago?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Se registrará el pago de {formatCurrency(slip.net_pay, slip.currency_code)} para esta colilla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkPaid}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Registrar Pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Agregar Concepto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tipo</Label>
              <Select
                value={newItem.item_type}
                onValueChange={(value) => setNewItem(prev => ({ ...prev, item_type: value }))}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {itemTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Código</Label>
                <Input
                  value={newItem.code}
                  onChange={(e) => setNewItem(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="BONO001"
                  className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Monto</Label>
                <Input
                  type="number"
                  value={newItem.amount || ''}
                  onChange={(e) => setNewItem(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Nombre/Descripción</Label>
              <Input
                value={newItem.name}
                onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Bonificación especial"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddItem}
              disabled={!newItem.code || !newItem.name || !newItem.amount}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Agregar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Item Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar concepto?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Se eliminará &quot;{deleteItem?.name}&quot; de la colilla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
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
