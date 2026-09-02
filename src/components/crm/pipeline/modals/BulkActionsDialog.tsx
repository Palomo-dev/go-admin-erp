'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Users, GitBranch, Check, ChevronRight, Plus, Trash2, User, Percent } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { Pipeline, Stage, Customer, Opportunity } from '@/components/crm/oportunidades/types';
import { SpaceSearchSelect } from '@/components/crm/oportunidades/SpaceSearchSelect';
import { ProductSearchDialog, type UnifiedProduct, type SelectedModifier } from '@/components/shared/product-search';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';

interface ProductLine {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}
interface SpaceLine {
  space_id: string;
  space_name: string;
  nights: number;
  unit_price: number;
}
interface CustomLine {
  concept: string;
  quantity: number;
  unit_price: number;
}

interface BulkActionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId?: string;
  onSuccess?: () => void;
}

type TabMode = 'assign' | 'move';

export default function BulkActionsDialog({
  isOpen,
  onClose,
  pipelineId,
  onSuccess,
}: BulkActionsDialogProps) {
  const [tab, setTab] = useState<TabMode>('assign');

  // Datos compartidos
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [products, setProducts] = useState<{ id: number; name: string; sku: string; price: number }[]>([]);
  const [spaces, setSpaces] = useState<{ id: string; label: string; base_rate: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Tab 1: Asignar oportunidad a clientes
  const [selectedPipelineId, setSelectedPipelineId] = useState(pipelineId || '');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [oppName, setOppName] = useState('');
  const [oppAmount, setOppAmount] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [nextContactAt, setNextContactAt] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [spaceLines, setSpaceLines] = useState<SpaceLine[]>([]);
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [salespersonId, setSalespersonId] = useState('');
  const [commissionRate, setCommissionRate] = useState(0);
  const [organizationMembers, setOrganizationMembers] = useState<{ id: string; name: string }[]>([]);

  // Tab 2: Mover oportunidades de etapa
  const [filterStageId, setFilterStageId] = useState('all');
  const [targetStageId, setTargetStageId] = useState('');
  const [selectedOppIds, setSelectedOppIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSelectedPipelineId(pipelineId || '');
      setTab('assign');
      setSelectedCustomerIds(new Set());
      setSelectedOppIds(new Set());
    }
  }, [isOpen, pipelineId]);

  useEffect(() => {
    if (selectedPipelineId) {
      loadStages(selectedPipelineId);
      loadOpportunities(selectedPipelineId);
    }
  }, [selectedPipelineId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [p, c] = await Promise.all([
        opportunitiesService.getPipelines(),
        opportunitiesService.getCustomers(),
      ]);
      setPipelines(p);
      setCustomers(c);
      if (p.length > 0 && !selectedPipelineId) {
        const def = p.find((x) => x.is_default) || p[0];
        setSelectedPipelineId(def.id);
      }
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
    // Cargar productos y espacios en segundo plano (no bloquean la UI)
    Promise.allSettled([
      opportunitiesService.getProducts(),
      opportunitiesService.getSpaces(),
    ]).then(([pr, sr]) => {
      if (pr.status === 'fulfilled') setProducts(pr.value);
      if (sr.status === 'fulfilled') setSpaces(sr.value as any);
    });
    // Cargar miembros para comisionista
    try {
      const agents = await opportunitiesService.getAgents();
      setOrganizationMembers(agents.map((a) => ({ id: a.id, name: a.full_name })));
    } catch {
      // silencioso
    }
  };

  const loadStages = async (pid: string) => {
    try {
      const data = await opportunitiesService.getStages(pid);
      setStages(data);
      if (data.length > 0) {
        const first = data.sort((a, b) => a.position - b.position)[0];
        setSelectedStageId(first.id);
        setTargetStageId(first.id);
      }
    } catch {
      // silencioso
    }
  };

  const loadOpportunities = async (pid: string) => {
    try {
      const data = await opportunitiesService.getOpportunities({ pipelineId: pid });
      setOpportunities(data);
    } catch {
      setOpportunities([]);
    }
  };

  // === Líneas de productos / espacios / conceptos ===
  const handleProductSelect = (product: UnifiedProduct, modifiers: SelectedModifier[] = []) => {
    const modifiersExtra = modifiers.reduce((sum, m) => sum + (m.extraPrice || 0), 0);
    const productName = modifiers.length > 0
      ? `${product.name} (${modifiers.map((m) => m.name).join(', ')})`
      : product.name;
    setProductLines([
      ...productLines,
      {
        product_id: product.id,
        product_name: productName,
        quantity: 1,
        unit_price: (product.price || 0) + modifiersExtra,
      },
    ]);
  };

  const removeProductLine = (index: number) => setProductLines(productLines.filter((_, i) => i !== index));

  const addSpaceLine = () => {
    setSpaceLines([...spaceLines, { space_id: '', space_name: '', nights: 1, unit_price: 0 }]);
  };
  const updateSpaceLine = (index: number, field: keyof SpaceLine, value: any) => {
    const updated = [...spaceLines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'space_id') {
      const space = spaces.find((s) => s.id === value);
      if (space) {
        updated[index].space_name = space.label;
        updated[index].unit_price = space.base_rate;
      }
    }
    setSpaceLines(updated);
  };
  const removeSpaceLine = (index: number) => setSpaceLines(spaceLines.filter((_, i) => i !== index));

  const addCustomLine = () => {
    setCustomLines([...customLines, { concept: '', quantity: 1, unit_price: 0 }]);
  };
  const updateCustomLine = (index: number, field: keyof CustomLine, value: any) => {
    const updated = [...customLines];
    updated[index] = { ...updated[index], [field]: value };
    setCustomLines(updated);
  };
  const removeCustomLine = (index: number) => setCustomLines(customLines.filter((_, i) => i !== index));

  const calculateItemsTotal = () => {
    const pTotal = productLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
    const sTotal = spaceLines.reduce((sum, l) => sum + l.nights * l.unit_price, 0);
    const cTotal = customLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
    return pTotal + sTotal + cTotal;
  };

  const hasItems = productLines.length > 0 || spaceLines.length > 0 || customLines.length > 0;

  // === Tab 1: Asignar ===
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch) return true;
    const t = customerSearch.toLowerCase();
    return c.full_name?.toLowerCase().includes(t) || c.email?.toLowerCase().includes(t);
  });

  const toggleCustomer = (id: string) => {
    const next = new Set(selectedCustomerIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCustomerIds(next);
  };

  const selectAllCustomers = () => {
    if (selectedCustomerIds.size === filteredCustomers.length) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  const handleAssign = async () => {
    if (!oppName.trim() || !selectedPipelineId || !selectedStageId) {
      toast({ title: 'Error', description: 'Completa nombre, pipeline y etapa', variant: 'destructive' });
      return;
    }
    if (selectedCustomerIds.size === 0) {
      toast({ title: 'Error', description: 'Selecciona al menos un cliente', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    let created = 0;
    let failed = 0;

    const totalAmount = hasItems ? calculateItemsTotal() : (parseFloat(oppAmount) || 0);
    const productsPayload = productLines
      .filter((l) => l.product_id > 0)
      .map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price }));
    const spacesPayload = spaceLines
      .filter((l) => l.space_id)
      .map((l) => ({ space_id: l.space_id, nights: l.nights, unit_price: l.unit_price }));
    const customPayload = customLines
      .filter((l) => l.concept.trim())
      .map((l) => ({ concept: l.concept, quantity: l.quantity, unit_price: l.unit_price }));
    const commissionPayload = salespersonId && salespersonId !== '__none__' && commissionRate > 0
      ? { salesperson_id: salespersonId, commission_rate: commissionRate, commission_type: 'salesperson' as const }
      : {};

    try {
      for (const customerId of selectedCustomerIds) {
        try {
          await opportunitiesService.createOpportunity({
            pipeline_id: selectedPipelineId,
            stage_id: selectedStageId,
            customer_id: customerId,
            name: oppName.trim(),
            amount: totalAmount,
            currency,
            next_contact_at: nextContactAt || undefined,
            expected_close_date: expectedCloseDate || undefined,
            products: productsPayload.length > 0 ? productsPayload : undefined,
            spaces: spacesPayload.length > 0 ? spacesPayload : undefined,
            customLines: customPayload.length > 0 ? customPayload : undefined,
            ...commissionPayload,
          });
          created++;
        } catch {
          failed++;
        }
      }

      toast({
        title: 'Oportunidades asignadas',
        description: `${created} creadas${failed > 0 ? `, ${failed} fallidas` : ''}`,
      });

      if (created > 0) {
        onSuccess?.();
        onClose();
        setOppName('');
        setOppAmount('');
        setNextContactAt('');
        setExpectedCloseDate('');
        setSelectedCustomerIds(new Set());
        setProductLines([]);
        setSpaceLines([]);
        setCustomLines([]);
        setSalespersonId('');
        setCommissionRate(0);
      }
    } catch {
      toast({ title: 'Error', description: 'Error inesperado', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // === Tab 2: Mover etapas ===
  const filteredOpps = opportunities.filter((o) => {
    if (filterStageId === 'all') return true;
    if (filterStageId === 'none') return !o.stage_id;
    return o.stage_id === filterStageId;
  });

  const toggleOpp = (id: string) => {
    const next = new Set(selectedOppIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOppIds(next);
  };

  const selectAllOpps = () => {
    if (selectedOppIds.size === filteredOpps.length) {
      setSelectedOppIds(new Set());
    } else {
      setSelectedOppIds(new Set(filteredOpps.map((o) => o.id)));
    }
  };

  const handleMove = async () => {
    if (selectedOppIds.size === 0) {
      toast({ title: 'Error', description: 'Selecciona al menos una oportunidad', variant: 'destructive' });
      return;
    }
    if (!targetStageId) {
      toast({ title: 'Error', description: 'Selecciona la etapa destino', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    let moved = 0;
    let failed = 0;

    try {
      for (const oppId of selectedOppIds) {
        try {
          await opportunitiesService.moveToStage(oppId, targetStageId);
          moved++;
        } catch {
          failed++;
        }
      }

      toast({
        title: 'Oportunidades movidas',
        description: `${moved} movidas${failed > 0 ? `, ${failed} fallidas` : ''}`,
      });

      if (moved > 0) {
        await loadOpportunities(selectedPipelineId);
        onSuccess?.();
        setSelectedOppIds(new Set());
      }
    } catch {
      toast({ title: 'Error', description: 'Error inesperado', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const stageName = (id: string | null | undefined) => {
    if (!id) return 'Sin etapa';
    const s = stages.find((x) => x.id === id);
    return s?.name || 'Sin etapa';
  };

  const handleClose = () => {
    onClose();
    setSelectedCustomerIds(new Set());
    setSelectedOppIds(new Set());
    setProductLines([]);
    setSpaceLines([]);
    setCustomLines([]);
    setSalespersonId('');
    setCommissionRate(0);
    setNextContactAt('');
    setExpectedCloseDate('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-5xl w-[94vw] max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 p-0">
        <DialogHeader className="p-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
            Asignación Masiva
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            Asigna oportunidades a múltiples clientes o mueve oportunidades entre etapas.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab('assign')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'assign'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <Users className="h-4 w-4" />
            Asignar a clientes
          </button>
          <button
            onClick={() => setTab('move')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'move'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <GitBranch className="h-4 w-4" />
            Mover de etapa
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : tab === 'assign' ? (
            /* === TAB 1: ASIGNAR === */
            <div className="space-y-4">
              {/* Configuracion de la oportunidad */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Nombre oportunidad *</Label>
                  <Input
                    value={oppName}
                    onChange={(e) => setOppName(e.target.value)}
                    placeholder="Ej: Cotización producto X"
                    className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Monto</Label>
                  <Input
                    type="number"
                    value={oppAmount}
                    onChange={(e) => setOppAmount(e.target.value)}
                    placeholder="0"
                    className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Moneda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COP">COP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Próximo contacto</Label>
                  <Input
                    type="date"
                    value={nextContactAt}
                    onChange={(e) => setNextContactAt(e.target.value)}
                    className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Fecha esperada de cierre</Label>
                  <Input
                    type="date"
                    value={expectedCloseDate}
                    onChange={(e) => setExpectedCloseDate(e.target.value)}
                    className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Pipeline *</Label>
                  <Select value={selectedPipelineId} onValueChange={(v) => { setSelectedPipelineId(v); setSelectedStageId(''); }}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Etapa inicial *</Label>
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({Math.round(Number(s.probability))}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Items: Productos, Espacios, Conceptos, Comisión */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Comisión */}
                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Comisión (opcional)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Comisionista</Label>
                      <Select value={salespersonId || '__none__'} onValueChange={setSalespersonId}>
                        <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                          <SelectValue placeholder="Sin asignar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin asignar</SelectItem>
                          {organizationMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block flex items-center gap-1.5">
                        <Percent className="h-3.5 w-3.5" />
                        Porcentaje de Comisión
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={commissionRate || ''}
                        onChange={(e) => setCommissionRate(Number(e.target.value))}
                        placeholder="0"
                        className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Productos */}
                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-gray-900 dark:text-white">Productos</CardTitle>
                    <ProductSearchDialog
                      mode="sale"
                      currency={currency}
                      onProductSelect={handleProductSelect}
                    />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {productLines.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">Sin productos</p>
                    ) : (
                      productLines.map((line, index) => (
                        <div key={index} className="p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                              {line.product_name || 'Producto sin seleccionar'}
                            </p>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeProductLine(index)}
                              className="h-7 w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-gray-500">Cantidad</Label>
                              <Input type="number" value={line.quantity} min={1}
                                onChange={(e) => {
                                  const updated = [...productLines];
                                  updated[index] = { ...updated[index], quantity: Number(e.target.value) };
                                  setProductLines(updated);
                                }}
                                className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700" />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Precio unit.</Label>
                              <Input type="number" value={line.unit_price}
                                onChange={(e) => {
                                  const updated = [...productLines];
                                  updated[index] = { ...updated[index], unit_price: Number(e.target.value) };
                                  setProductLines(updated);
                                }}
                                className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700" />
                            </div>
                          </div>
                          <div className="text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                            Subtotal: {formatCurrency(line.quantity * line.unit_price)}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Espacios (PMS) */}
                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-gray-900 dark:text-white">Espacios (PMS)</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={addSpaceLine}
                      className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 h-8 text-xs">
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {spaceLines.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">Sin espacios</p>
                    ) : (
                      spaceLines.map((line, index) => (
                        <div key={index} className="p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg space-y-2 border border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <SpaceSearchSelect
                                spaces={spaces as any}
                                selectedSpaceId={line.space_id}
                                onSelect={(spaceId) => updateSpaceLine(index, 'space_id', spaceId)}
                                placeholder="Seleccionar espacio"
                              />
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSpaceLine(index)}
                              className="h-7 w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-gray-500">Noches</Label>
                              <Input type="number" value={line.nights} min={1}
                                onChange={(e) => updateSpaceLine(index, 'nights', Number(e.target.value))}
                                className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700" />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Tarifa/noche</Label>
                              <Input type="number" value={line.unit_price}
                                onChange={(e) => updateSpaceLine(index, 'unit_price', Number(e.target.value))}
                                className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700" />
                            </div>
                          </div>
                          <div className="text-right text-xs font-medium text-purple-700 dark:text-purple-300">
                            Subtotal: {formatCurrency(line.nights * line.unit_price)}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Conceptos Personalizados */}
                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-gray-900 dark:text-white">Otros Conceptos</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={addCustomLine}
                      className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 h-8 text-xs">
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {customLines.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">Sin conceptos adicionales</p>
                    ) : (
                      customLines.map((line, index) => (
                        <div key={index} className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg space-y-2 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-2">
                            <Input
                              value={line.concept}
                              onChange={(e) => updateCustomLine(index, 'concept', e.target.value)}
                              placeholder="Descripción del concepto..."
                              className="flex-1 h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                            />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeCustomLine(index)}
                              className="h-7 w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-gray-500">Cantidad</Label>
                              <Input type="number" value={line.quantity} min={1}
                                onChange={(e) => updateCustomLine(index, 'quantity', Number(e.target.value))}
                                className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700" />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Precio unit.</Label>
                              <Input type="number" value={line.unit_price}
                                onChange={(e) => updateCustomLine(index, 'unit_price', Number(e.target.value))}
                                className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700" />
                            </div>
                          </div>
                          <div className="text-right text-xs font-medium text-amber-700 dark:text-amber-300">
                            Subtotal: {formatCurrency(line.quantity * line.unit_price)}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {hasItems && (
                <div className="text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                  Total items: {formatCurrency(calculateItemsTotal())} {currency}
                </div>
              )}

              {/* Selector de clientes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm text-gray-700 dark:text-gray-300">
                    Clientes ({selectedCustomerIds.size} seleccionados)
                  </Label>
                  <button
                    onClick={selectAllCustomers}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {selectedCustomerIds.size === filteredCustomers.length && filteredCustomers.length > 0
                      ? 'Deseleccionar todos'
                      : 'Seleccionar todos'}
                  </button>
                </div>
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="mb-2 bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                />
                <div className="max-h-[280px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No hay clientes
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => toggleCustomer(c.id)}
                        className={`flex items-center gap-3 p-2.5 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 ${
                          selectedCustomerIds.has(c.id)
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                          selectedCustomerIds.has(c.id)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {selectedCustomerIds.has(c.id) && <Check className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.full_name}</p>
                          {c.email && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.email}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" onClick={handleClose} disabled={isSaving}
                  className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  Cancelar
                </Button>
                <Button onClick={handleAssign} disabled={isSaving || selectedCustomerIds.size === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSaving ? 'Asignando...' : `Asignar a ${selectedCustomerIds.size} cliente(s)`}
                </Button>
              </div>
            </div>
          ) : (
            /* === TAB 2: MOVER ETAPAS === */
            <div className="space-y-4">
              {/* Filtros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Filtrar por etapa actual</Label>
                  <Select value={filterStageId} onValueChange={setFilterStageId}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las etapas</SelectItem>
                      <SelectItem value="none">Sin etapa</SelectItem>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Mover a etapa *</Label>
                  <Select value={targetStageId} onValueChange={setTargetStageId}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({Math.round(Number(s.probability))}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Lista de oportunidades */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm text-gray-700 dark:text-gray-300">
                    Oportunidades ({selectedOppIds.size} seleccionadas de {filteredOpps.length})
                  </Label>
                  <button
                    onClick={selectAllOpps}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {selectedOppIds.size === filteredOpps.length && filteredOpps.length > 0
                      ? 'Deseleccionar todas'
                      : 'Seleccionar todas'}
                  </button>
                </div>
                <div className="max-h-[320px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  {filteredOpps.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No hay oportunidades con este filtro
                    </div>
                  ) : (
                    filteredOpps.map((o) => (
                      <div
                        key={o.id}
                        onClick={() => toggleOpp(o.id)}
                        className={`flex items-center gap-3 p-2.5 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 ${
                          selectedOppIds.has(o.id)
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                          selectedOppIds.has(o.id)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {selectedOppIds.has(o.id) && <Check className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{o.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {o.customer?.full_name || 'Sin cliente'} — {o.amount ? o.amount.toLocaleString('es-CO') : '0'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{stageName(o.stage_id)}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400" />
                          <span className="font-medium text-blue-600 dark:text-blue-400">{stageName(targetStageId)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" onClick={handleClose} disabled={isSaving}
                  className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  Cancelar
                </Button>
                <Button onClick={handleMove} disabled={isSaving || selectedOppIds.size === 0 || !targetStageId}
                  className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSaving ? 'Moviendo...' : `Mover ${selectedOppIds.size} a ${stageName(targetStageId)}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
