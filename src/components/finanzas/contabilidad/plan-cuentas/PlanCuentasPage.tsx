'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BookOpen, Plus, Loader2, Edit, Trash2, Copy, ChevronRight, ChevronDown, Search, ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContabilidadService, ChartAccount } from '../ContabilidadService';

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Activo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'liability', label: 'Pasivo', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'equity', label: 'Patrimonio', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'income', label: 'Ingreso', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'expense', label: 'Gasto', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' }
];

interface AccountNode extends ChartAccount {
  children: AccountNode[];
  expanded?: boolean;
}

export function PlanCuentasPage() {
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [tree, setTree] = useState<AccountNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    account_code: '',
    name: '',
    type: 'asset' as ChartAccount['type'],
    parent_code: '',
    description: ''
  });

  useEffect(() => {
    loadCuentas();
  }, []);

  useEffect(() => {
    buildTree();
  }, [cuentas, searchTerm, filterType]);

  const loadCuentas = async () => {
    try {
      setIsLoading(true);
      const data = await ContabilidadService.obtenerPlanCuentas();
      setCuentas(data);
    } catch (error) {
      console.error('Error cargando cuentas:', error);
      toast.error('Error al cargar el plan de cuentas');
    } finally {
      setIsLoading(false);
    }
  };

  const buildTree = () => {
    let filtered = cuentas;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = cuentas.filter(c => 
        c.account_code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term)
      );
    }

    if (filterType) {
      filtered = filtered.filter(c => c.type === filterType);
    }

    // Construir árbol jerárquico
    const nodeMap = new Map<string, AccountNode>();
    const roots: AccountNode[] = [];

    // Crear nodos
    filtered.forEach(cuenta => {
      nodeMap.set(cuenta.account_code, { ...cuenta, children: [] });
    });

    // Establecer relaciones padre-hijo
    filtered.forEach(cuenta => {
      const node = nodeMap.get(cuenta.account_code)!;
      if (cuenta.parent_code && nodeMap.has(cuenta.parent_code)) {
        nodeMap.get(cuenta.parent_code)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Ordenar por código
    const sortNodes = (nodes: AccountNode[]) => {
      nodes.sort((a, b) => a.account_code.localeCompare(b.account_code));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);

    setTree(roots);
  };

  const toggleExpand = (code: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = () => {
    const allCodes = new Set(cuentas.filter(c => c.parent_code === null || cuentas.some(p => p.parent_code === c.account_code)).map(c => c.account_code));
    setExpandedNodes(allCodes);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const resetForm = () => {
    setFormData({
      account_code: '',
      name: '',
      type: 'asset',
      parent_code: '',
      description: ''
    });
    setEditingAccount(null);
  };

  const handleOpenDialog = (account?: ChartAccount) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        account_code: account.account_code,
        name: account.name,
        type: account.type,
        parent_code: account.parent_code || '',
        description: account.description || ''
      });
    } else {
      resetForm();
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.account_code || !formData.name) {
      toast.error('El código y nombre son requeridos');
      return;
    }

    try {
      setIsProcessing(true);
      if (editingAccount) {
        await ContabilidadService.actualizarCuenta(editingAccount.account_code, {
          name: formData.name,
          type: formData.type,
          parent_code: formData.parent_code || null,
          description: formData.description || null
        });
        toast.success('Cuenta actualizada exitosamente');
      } else {
        await ContabilidadService.crearCuenta(formData);
        toast.success('Cuenta creada exitosamente');
      }
      setShowDialog(false);
      resetForm();
      loadCuentas();
    } catch (error) {
      console.error('Error guardando cuenta:', error);
      toast.error('Error al guardar la cuenta');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cuenta?')) return;
    try {
      await ContabilidadService.eliminarCuenta(code);
      toast.success('Cuenta eliminada exitosamente');
      loadCuentas();
    } catch (error) {
      toast.error('Error al eliminar. Puede tener cuentas hijas o movimientos.');
    }
  };

  const getTypeBadge = (type: string) => {
    const t = ACCOUNT_TYPES.find(at => at.value === type);
    return <Badge className={t?.color || ''}>{t?.label || type}</Badge>;
  };

  const renderNode = (node: AccountNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.account_code);

    return (
      <div key={node.account_code}>
        <div 
          className={`flex items-center gap-2 py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${level > 0 ? 'ml-6' : ''}`}
        >
          <button
            onClick={() => hasChildren && toggleExpand(node.account_code)}
            className={`w-5 h-5 flex items-center justify-center ${hasChildren ? 'cursor-pointer' : 'invisible'}`}
          >
            {hasChildren && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
          </button>
          
          <span className="font-mono text-sm text-gray-600 dark:text-gray-400 w-24">
            {node.account_code}
          </span>
          
          <span className="flex-1 text-gray-900 dark:text-white font-medium">
            {node.name}
          </span>
          
          {getTypeBadge(node.type)}
          
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100">
            <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(node)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(node.account_code)} className="text-red-600">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {isExpanded && node.children.map(child => renderNode(child, level + 1))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/contabilidad">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <BookOpen className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Plan de Cuentas
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Gestión del catálogo contable
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={expandAll} className="dark:border-gray-600">
            Expandir Todo
          </Button>
          <Button variant="outline" onClick={collapseAll} className="dark:border-gray-600">
            Colapsar Todo
          </Button>
          <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por código o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <Select value={filterType || 'all'} onValueChange={(v) => setFilterType(v === 'all' ? null : v)}>
              <SelectTrigger className="w-[180px] dark:bg-gray-900 dark:border-gray-600">
                <SelectValue placeholder="Tipo de cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {ACCOUNT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {ACCOUNT_TYPES.map(t => (
          <Card key={t.value} className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="py-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">{t.label}</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {cuentas.filter(c => c.type === t.value).length}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Árbol de cuentas */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Estructura de Cuentas</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {cuentas.length} cuentas en total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 group">
            {tree.length > 0 ? (
              tree.map(node => renderNode(node))
            ) : (
              <p className="text-center text-gray-500 py-8">
                {searchTerm || filterType ? 'No se encontraron cuentas' : 'No hay cuentas registradas'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Contable'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editingAccount ? 'Modifica los datos de la cuenta' : 'Agrega una nueva cuenta al plan'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Código *</Label>
                <Input
                  value={formData.account_code}
                  onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                  placeholder="Ej: 1105"
                  disabled={!!editingAccount}
                  className="dark:bg-gray-900 dark:border-gray-600 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Tipo *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as ChartAccount['type'] })}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la cuenta"
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Cuenta Padre (opcional)</Label>
              <Select
                value={formData.parent_code || 'none'}
                onValueChange={(value) => setFormData({ ...formData, parent_code: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Sin cuenta padre" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">Sin cuenta padre</SelectItem>
                  {cuentas
                    .filter(c => c.account_code !== formData.account_code)
                    .map(c => (
                      <SelectItem key={c.account_code} value={c.account_code}>
                        {c.account_code} - {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción opcional"
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAccount ? 'Guardar Cambios' : 'Crear Cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
