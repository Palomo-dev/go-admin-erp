'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  BookOpen, Plus, Loader2, Edit, Trash2, ChevronRight, ChevronDown,
  ArrowLeft, Download, Upload, GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { ContabilidadService, ChartAccount, type NaturalezaCuenta, type NivelCuenta } from '../ContabilidadService';
import { presentacionDeCodigo, type PresentacionNiif } from '@/lib/finanzas/pucPrefijo';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { SearchInput } from '@/components/kit/SearchInput';
import { COLUMNAS_PLAN, interpretarFilas } from '@/lib/finanzas/pucExcel';
import { armarArbolPlan, esMovimientoVisible, type NodoPlan } from '@/lib/finanzas/planCuentasVista';
import {
  esCodigoPuc, naturalezaDe, nivelDe, nombreNivel, siguienteCodigo, validarHijo,
} from '@/lib/finanzas/pucJerarquia';

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Activo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'liability', label: 'Pasivo', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'equity', label: 'Patrimonio', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'income', label: 'Ingreso', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'expense', label: 'Gasto', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'order', label: 'Orden', color: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300' },
];

const NATURALEZAS: { value: NaturalezaCuenta; label: string }[] = [
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'orden', label: 'Orden' },
];

const NIVELES: NivelCuenta[] = ['clase', 'grupo', 'cuenta', 'subcuenta', 'auxiliar', 'subauxiliar', 'legacy'];

type ModoCentroCosto = 'obligatorio' | 'opcional' | 'no_aplica';

function modoCentroDe(codigo: string, modo?: string | null, requiere?: boolean | null): ModoCentroCosto {
  if (modo === 'obligatorio' || modo === 'opcional' || modo === 'no_aplica') return modo;
  if (requiere === true) return 'obligatorio';
  return ['4', '5', '6', '7'].includes(codigo[0] ?? '') ? 'obligatorio' : 'no_aplica';
}

const PRESENTACIONES: { value: PresentacionNiif | 'heredar'; label: string }[] = [
  { value: 'heredar', label: 'Según el grupo' },
  { value: 'corriente', label: 'Corriente' },
  { value: 'no_corriente', label: 'No corriente' },
  { value: 'segun_plazo', label: 'Según plazo' },
];

interface Formulario {
  account_code: string;
  name: string;
  type: ChartAccount['type'];
  parent_code: string;
  description: string;
  naturaleza: NaturalezaCuenta;
  presentacion_niif: PresentacionNiif | '';
  requiere_tercero: boolean;
  centro_costo_modo: ModoCentroCosto;
}

const FORMULARIO_VACIO: Formulario = {
  account_code: '',
  name: '',
  type: 'asset',
  parent_code: '',
  description: '',
  naturaleza: 'debito',
  presentacion_niif: '',
  requiere_tercero: false,
  centro_costo_modo: 'no_aplica',
};

function mensajeCuenta(error: unknown): string {
  const texto = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (texto.includes('cuenta_con_movimientos')) return 'La cuenta tiene movimientos. Solo se puede desactivar.';
  if (texto.includes('padre_invalido')) return 'El código tiene que empezar por el padre y medir el nivel siguiente.';
  if (texto.includes('codigo_puc_invalido')) return 'El código no tiene la forma del PUC.';
  if (texto.includes('cuenta_no_es_de_movimiento')) return 'Esa cuenta es de título y no recibe asientos.';
  return texto || 'No se pudo guardar la cuenta.';
}

export function PlanCuentasPage() {
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [padreFijo, setPadreFijo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterNivel, setFilterNivel] = useState('all');
  const [filterNaturaleza, setFilterNaturaleza] = useState('all');
  const [filterMovimiento, setFilterMovimiento] = useState('all');
  const [filterActivas, setFilterActivas] = useState('all');
  const [formData, setFormData] = useState<Formulario>(FORMULARIO_VACIO);

  useEffect(() => {
    loadCuentas();
  }, []);

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

  const hijos = useMemo(() => {
    const set = new Set<string>();
    for (const cuenta of cuentas) {
      if (cuenta.parent_code) set.add(cuenta.parent_code);
    }
    return set;
  }, [cuentas]);

  const tree = useMemo(() => {
    const termino = searchTerm.toLowerCase();
    return armarArbolPlan(cuentas, (cuenta) => {
      if (termino && !cuenta.account_code.toLowerCase().includes(termino) && !cuenta.name.toLowerCase().includes(termino)) {
        return false;
      }
      if (filterType !== 'all' && cuenta.type !== filterType) return false;
      if (filterNivel !== 'all' && (cuenta.nivel ?? nivelDe(cuenta.account_code)) !== filterNivel) return false;
      if (filterNaturaleza !== 'all' && naturalezaDe(cuenta.account_code, cuenta.naturaleza) !== filterNaturaleza) return false;
      if (filterActivas === 'activas' && cuenta.is_active === false) return false;
      if (filterMovimiento !== 'all') {
        const movimiento = esMovimientoVisible(cuenta.es_movimiento, hijos.has(cuenta.account_code));
        if (filterMovimiento === 'movimiento' && !movimiento) return false;
        if (filterMovimiento === 'titulo' && movimiento) return false;
      }
      return true;
    });
  }, [cuentas, searchTerm, filterType, filterNivel, filterNaturaleza, filterMovimiento, filterActivas, hijos]);

  const toggleExpand = (code: string) => {
    const nuevo = new Set(expandedNodes);
    if (nuevo.has(code)) nuevo.delete(code);
    else nuevo.add(code);
    setExpandedNodes(nuevo);
  };

  const expandAll = () => setExpandedNodes(new Set(cuentas.map((c) => c.account_code)));
  const collapseAll = () => setExpandedNodes(new Set());

  const resetForm = () => {
    setFormData(FORMULARIO_VACIO);
    setEditingAccount(null);
    setPadreFijo(false);
  };

  const handleOpenDialog = (account?: ChartAccount) => {
    setPadreFijo(false);
    if (account) {
      setEditingAccount(account);
      setFormData({
        account_code: account.account_code,
        name: account.name,
        type: account.type,
        parent_code: account.parent_code || '',
        description: account.description || '',
        naturaleza: naturalezaDe(account.account_code, account.naturaleza) ?? 'debito',
        presentacion_niif: account.presentacion_niif ?? '',
        requiere_tercero: account.requiere_tercero ?? false,
        centro_costo_modo: modoCentroDe(account.account_code, account.centro_costo_modo, account.requiere_centro_costo),
      });
    } else {
      resetForm();
    }
    setShowDialog(true);
  };

  const abrirSiguienteNivel = (padre: ChartAccount) => {
    const codigo = siguienteCodigo(padre.account_code, cuentas.map((c) => c.account_code));
    if (!codigo) {
      toast.error('No hay un código libre en el nivel siguiente');
      return;
    }
    setEditingAccount(null);
    setPadreFijo(true);
    setFormData({
      account_code: codigo,
      name: '',
      type: padre.type,
      parent_code: padre.account_code,
      description: '',
      naturaleza: naturalezaDe(codigo, null) ?? 'debito',
      presentacion_niif: presentacionDeCodigo(codigo) ?? '',
      requiere_tercero: padre.requiere_tercero ?? false,
      centro_costo_modo: modoCentroDe(codigo),
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.account_code || !formData.name) {
      toast.error('El código y el nombre son requeridos');
      return;
    }
    const codigo = formData.account_code.trim();
    if (!editingAccount && !esCodigoPuc(codigo)) {
      toast.error('El código nuevo usa solo dígitos y la longitud del PUC');
      return;
    }
    if (!editingAccount && nivelDe(codigo) !== 'clase' && !formData.parent_code) {
      toast.error('Indica la cuenta padre');
      return;
    }
    const padreNuevo = formData.parent_code || null;
    const padreCambio = !editingAccount || padreNuevo !== (editingAccount.parent_code || null);
    if (padreCambio && formData.parent_code && esCodigoPuc(codigo)) {
      const error = validarHijo(formData.parent_code, codigo);
      if (error) {
        toast.error('El código tiene que empezar por el padre y medir el nivel siguiente');
        return;
      }
    }

    try {
      setIsProcessing(true);
      const payload = {
        name: formData.name,
        type: formData.type,
        parent_code: formData.parent_code || null,
        description: formData.description || null,
        naturaleza: formData.naturaleza,
        presentacion_niif: formData.presentacion_niif || null,
        requiere_tercero: formData.requiere_tercero,
        centro_costo_modo: formData.centro_costo_modo,
        requiere_centro_costo: formData.centro_costo_modo === 'obligatorio',
      };
      const esTitulo = nivelDe(codigo) === 'clase' || nivelDe(codigo) === 'grupo';
      if (editingAccount) {
        await ContabilidadService.actualizarCuenta(editingAccount.account_code, {
          ...payload,
          ...(esTitulo ? { es_movimiento: false } : {}),
        });
        toast.success('Cuenta actualizada');
      } else {
        await ContabilidadService.crearCuenta({
          ...payload,
          account_code: codigo,
          es_movimiento: esTitulo ? false : true,
        });
        toast.success('Cuenta creada');
      }
      setShowDialog(false);
      resetForm();
      loadCuentas();
    } catch (error) {
      console.error('Error guardando cuenta:', error);
      toast.error(mensajeCuenta(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm('Si la cuenta no tiene movimientos se elimina. Si los tiene, queda inactiva.')) return;
    try {
      await ContabilidadService.eliminarCuenta(code);
      toast.success('Cuenta eliminada');
    } catch (error) {
      const texto = mensajeCuenta(error);
      if (texto.includes('movimientos')) {
        try {
          await ContabilidadService.actualizarCuenta(code, { is_active: false });
          toast.success('La cuenta tiene movimientos. Quedó inactiva.');
        } catch (deactivateError) {
          toast.error(mensajeCuenta(deactivateError));
        }
      } else {
        toast.error('No se pudo eliminar. Puede tener cuentas hijas.');
      }
    }
    loadCuentas();
  };

  const exportar = () => {
    const filas = cuentas.map((cuenta) => ({
      codigo: cuenta.account_code,
      nombre: cuenta.name,
      tipo: cuenta.type,
      padre: cuenta.parent_code ?? '',
      naturaleza: naturalezaDe(cuenta.account_code, cuenta.naturaleza) ?? '',
      es_movimiento: esMovimientoVisible(cuenta.es_movimiento, hijos.has(cuenta.account_code)),
      requiere_tercero: cuenta.requiere_tercero ?? false,
      requiere_centro_costo: cuenta.requiere_centro_costo ?? false,
      activa: cuenta.is_active !== false,
      descripcion: cuenta.description ?? '',
    }));
    const hoja = XLSX.utils.json_to_sheet(filas, { header: [...COLUMNAS_PLAN] });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Plan de cuentas');
    const bytes = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([bytes]));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'plan-de-cuentas.xlsx';
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (archivo: File) => {
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
    const padresActuales: Record<string, string | null> = {};
    for (const cuenta of cuentas) padresActuales[cuenta.account_code] = cuenta.parent_code;
    const { filas, errores } = interpretarFilas(
      crudas,
      cuentas.map((c) => c.account_code),
      padresActuales,
    );
    if (errores.length > 0) {
      toast.error(errores.slice(0, 3).join(' '));
      return;
    }
    let hechas = 0;
    for (const fila of filas) {
      const payload: Partial<ChartAccount> = {
        name: fila.nombre,
        type: fila.tipo,
        parent_code: fila.padre,
        description: fila.descripcion,
        naturaleza: fila.naturaleza,
        es_movimiento: fila.esMovimiento,
        requiere_tercero: fila.requiereTercero,
        requiere_centro_costo: fila.requiereCentroCosto,
        is_active: fila.activa,
      };
      const previa = cuentas.find((c) => c.account_code === fila.codigo);
      if (previa) {
        if (previa.es_movimiento == null) delete payload.es_movimiento;
        await ContabilidadService.actualizarCuenta(fila.codigo, payload);
      } else {
        await ContabilidadService.crearCuenta({ ...payload, account_code: fila.codigo });
      }
      hechas += 1;
    }
    toast.success(`${hechas} cuentas importadas`);
    loadCuentas();
  };

  const getTypeBadge = (type: string) => {
    const t = ACCOUNT_TYPES.find((at) => at.value === type);
    return <Badge className={t?.color || ''}>{t?.label || type}</Badge>;
  };

  const renderNode = (node: NodoPlan<ChartAccount>, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.cuenta.account_code);
    const nivel = node.cuenta.nivel ?? nivelDe(node.cuenta.account_code);
    const naturaleza = naturalezaDe(node.cuenta.account_code, node.cuenta.naturaleza);
    const movimiento = esMovimientoVisible(node.cuenta.es_movimiento, hijos.has(node.cuenta.account_code) || hasChildren);
    const siguiente = esCodigoPuc(node.cuenta.account_code)
      ? siguienteCodigo(node.cuenta.account_code, cuentas.map((c) => c.account_code))
      : null;

    return (
      <div key={node.cuenta.account_code}>
        <div
          className="flex items-center gap-2 py-2.5 px-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <button
            onClick={() => hasChildren && toggleExpand(node.cuenta.account_code)}
            className={`w-5 h-5 flex items-center justify-center shrink-0 ${hasChildren ? 'cursor-pointer' : 'invisible'}`}
          >
            {hasChildren && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
          </button>
          <span className="font-mono text-sm text-gray-600 dark:text-gray-400 w-28 shrink-0">
            {node.cuenta.account_code}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-gray-900 dark:text-white font-medium break-words ${node.cuenta.is_active === false ? 'line-through opacity-60' : ''}`}>
                {node.cuenta.name}
              </span>
              <Badge variant="outline">{nombreNivel(nivel)}</Badge>
              {naturaleza && <Badge variant="outline">{NATURALEZAS.find((n) => n.value === naturaleza)?.label}</Badge>}
              {!movimiento && <Badge variant="outline">Título</Badge>}
              {node.cuenta.requiere_tercero && <Badge variant="outline">Tercero</Badge>}
            </div>
          </div>
          {getTypeBadge(node.cuenta.type)}
          <div className="flex gap-1 shrink-0">
            {siguiente && (
              <Button variant="ghost" size="sm" onClick={() => abrirSiguienteNivel(node.cuenta)} className="h-8 px-2" title={nombreNivel(nivelDe(siguiente))}>
                <GitBranch className="h-4 w-4 mr-1" />
                {nombreNivel(nivelDe(siguiente))}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(node.cuenta)} className="h-8 w-8 p-0">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(node.cuenta.account_code)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isExpanded && node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  if (isLoading && !showDialog) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  const nivelSugerido = esCodigoPuc(formData.account_code) ? nombreNivel(nivelDe(formData.account_code)) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plan de Cuentas</h1>
            <p className="text-gray-500 dark:text-gray-400">PUC comercial, Decreto 2650 de 1993</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={expandAll} className="dark:border-gray-600">Expandir todo</Button>
          <Button variant="outline" onClick={collapseAll} className="dark:border-gray-600">Colapsar todo</Button>
          <Button variant="outline" onClick={exportar} className="dark:border-gray-600">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" className="dark:border-gray-600" asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              Importar
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  const archivo = event.target.files?.[0];
                  event.target.value = '';
                  if (archivo) importar(archivo).catch((error) => toast.error(mensajeCuenta(error)));
                }}
              />
            </label>
          </Button>
          <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva cuenta
          </Button>
        </div>
      </div>

      <BranchBadge className="mb-3" />

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col xl:flex-row gap-3">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              onValueChange={setSearchTerm}
              placeholder="Buscar por código o nombre..."
              className="flex-1"
            />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px] dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterNivel} onValueChange={setFilterNivel}>
              <SelectTrigger className="w-[160px] dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Nivel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los niveles</SelectItem>
                {NIVELES.map((nivel) => <SelectItem key={nivel} value={nivel}>{nombreNivel(nivel)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterNaturaleza} onValueChange={setFilterNaturaleza}>
              <SelectTrigger className="w-[150px] dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Naturaleza" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Naturalezas</SelectItem>
                {NATURALEZAS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMovimiento} onValueChange={setFilterMovimiento}>
              <SelectTrigger className="w-[170px] dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Movimiento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Títulos y movimiento</SelectItem>
                <SelectItem value="movimiento">Solo movimiento</SelectItem>
                <SelectItem value="titulo">Solo título</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterActivas} onValueChange={setFilterActivas}>
              <SelectTrigger className="w-[150px] dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Activas e inactivas</SelectItem>
                <SelectItem value="activas">Solo activas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {ACCOUNT_TYPES.map((t) => (
          <Card key={t.value} className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="py-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">{t.label}</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {cuentas.filter((c) => c.type === t.value).length}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Estructura de cuentas</CardTitle>
          <CardDescription className="dark:text-gray-400">{cuentas.length} cuentas en total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {tree.length > 0 ? tree.map((node) => renderNode(node)) : (
              <p className="text-center text-gray-500 py-8">No se encontraron cuentas</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              {editingAccount ? 'Editar cuenta' : padreFijo ? `Nueva ${nivelSugerido?.toLowerCase() ?? 'cuenta'}` : 'Nueva cuenta contable'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {nivelSugerido ? `Nivel: ${nivelSugerido}. ` : ''}
              El código del hijo empieza por el del padre y tiene la longitud del nivel siguiente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código</Label>
                <Input
                  value={formData.account_code}
                  onChange={(e) => setFormData({ ...formData, account_code: e.target.value.trim() })}
                  placeholder="14350501"
                  disabled={!!editingAccount}
                  className="dark:bg-gray-900 dark:border-gray-600 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as ChartAccount['type'] })}>
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cuenta padre</Label>
                <Select
                  value={formData.parent_code || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, parent_code: value === 'none' ? '' : value })}
                  disabled={padreFijo}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Sin cuenta padre" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">Sin cuenta padre</SelectItem>
                    {cuentas.filter((c) => c.account_code !== formData.account_code).map((c) => (
                      <SelectItem key={c.account_code} value={c.account_code}>{c.account_code} - {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Naturaleza</Label>
                <Select value={formData.naturaleza} onValueChange={(value) => setFormData({ ...formData, naturaleza: value as NaturalezaCuenta })}>
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NATURALEZAS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Presentación NIIF</Label>
              <Select
                value={formData.presentacion_niif || 'heredar'}
                onValueChange={(value) => setFormData({
                  ...formData,
                  presentacion_niif: value === 'heredar' ? '' : value as PresentacionNiif,
                })}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESENTACIONES.map((opcion) => (
                    <SelectItem key={opcion.value} value={opcion.value}>{opcion.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No cambia el nombre del grupo. 11 sigue siendo Disponible.
              </p>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={formData.requiere_tercero} onChange={(e) => setFormData({ ...formData, requiere_tercero: e.target.checked })} />
                Requiere tercero
              </label>
              <div className="space-y-2">
                <Label>Centro de costo</Label>
                <Select
                  value={formData.centro_costo_modo}
                  onValueChange={(value) => setFormData({ ...formData, centro_costo_modo: value as ModoCentroCosto })}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="obligatorio">Obligatorio</SelectItem>
                    <SelectItem value="opcional">Opcional</SelectItem>
                    <SelectItem value="no_aplica">No aplica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <RichTextEditor
                value={formData.description}
                onChange={(html) => setFormData({ ...formData, description: html })}
                placeholder="Descripción opcional"
                className="dark:bg-gray-900 dark:border-gray-600"
                minHeight={60}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="dark:border-gray-600">Cancelar</Button>
            <Button onClick={handleSave} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
