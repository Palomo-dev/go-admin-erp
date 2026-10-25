'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  BookOpen, Plus, Edit, Trash2, ChevronRight, ChevronDown,
  ArrowLeft, Download, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContabilidadService, ChartAccount, type NaturalezaCuenta, type NivelCuenta } from '../ContabilidadService';
import { presentacionDeCodigo } from '@/lib/finanzas/pucPrefijo';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { SearchInput } from '@/components/kit/SearchInput';
import { COLUMNAS_PLAN, interpretarFilas } from '@/lib/finanzas/pucExcel';
import { armarArbolPlan, esMovimientoVisible, type NodoPlan } from '@/lib/finanzas/planCuentasVista';
import {
  claseDe, esCodigoPuc, naturalezaDe, nivelDe, nombreNivel, siguienteCodigo, tipoDeClase, validarHijo,
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

interface FilaNueva {
  padre: string | null;
  codigo: string;
  nombre: string;
  error: string | null;
}

/** Primera clase libre (1 a 9). La raíz no tiene padre al que aplicarle siguienteCodigo. */
function siguienteClase(existentes: readonly string[]): string | null {
  const usadas = new Set(existentes.filter((codigo) => codigo.length === 1));
  for (let digito = 1; digito <= 9; digito += 1) {
    const codigo = String(digito);
    if (!usadas.has(codigo)) return codigo;
  }
  return null;
}

function errorDeCodigo(padre: string | null, codigo: string, nombre: string, existentes: readonly string[]): string | null {
  if (!nombre.trim()) return 'Escribe el nombre';
  if (!esCodigoPuc(codigo)) return 'El código usa solo dígitos y la longitud del PUC';
  if (existentes.includes(codigo)) return 'Ese código ya existe';
  if (!padre) {
    return nivelDe(codigo) === 'clase' ? null : 'En la raíz solo cabe una clase de un dígito';
  }
  const error = validarHijo(padre, codigo);
  if (error === 'prefijo') return 'El código tiene que empezar por el padre';
  if (error) return 'El código mide el nivel siguiente';
  return null;
}

function teclaFila(evento: React.KeyboardEvent, guardar: () => void, cancelar: () => void) {
  if (evento.key === 'Enter') {
    evento.preventDefault();
    guardar();
  } else if (evento.key === 'Escape') {
    evento.preventDefault();
    cancelar();
  }
}

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
  const [conLineas, setConLineas] = useState<Set<string>>(new Set());
  const [filaNueva, setFilaNueva] = useState<FilaNueva | null>(null);
  const [editando, setEditando] = useState<{ codigo: string; nombre: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterNivel, setFilterNivel] = useState('all');
  const [filterNaturaleza, setFilterNaturaleza] = useState('all');
  const [filterMovimiento, setFilterMovimiento] = useState('all');
  const [filterActivas, setFilterActivas] = useState('all');

  useEffect(() => {
    loadCuentas();
  }, []);

  const loadCuentas = async () => {
    try {
      setIsLoading(true);
      const [data, conMovimiento] = await Promise.all([
        ContabilidadService.obtenerPlanCuentas(),
        ContabilidadService.cuentasConLineas().catch(() => [] as string[]),
      ]);
      setCuentas(data);
      setConLineas(new Set(conMovimiento));
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

  const codigos = cuentas.map((cuenta) => cuenta.account_code);

  const abrirAgregar = (padre: string | null) => {
    const codigo = padre ? siguienteCodigo(padre, codigos) : siguienteClase(codigos);
    if (!codigo) return;
    setEditando(null);
    setFilaNueva({ padre, codigo, nombre: '', error: null });
    if (padre) {
      setExpandedNodes((prev) => {
        const siguiente = new Set(prev);
        siguiente.add(padre);
        return siguiente;
      });
    }
  };

  const guardarNueva = async () => {
    if (!filaNueva) return;
    const codigo = filaNueva.codigo.trim();
    const nombre = filaNueva.nombre.trim();
    const error = errorDeCodigo(filaNueva.padre, codigo, nombre, codigos);
    if (error) {
      setFilaNueva({ ...filaNueva, error });
      return;
    }
    const padre = filaNueva.padre ? cuentas.find((cuenta) => cuenta.account_code === filaNueva.padre) : undefined;
    const nivel = nivelDe(codigo);
    const esTitulo = nivel === 'clase' || nivel === 'grupo';
    const modo = modoCentroDe(codigo, padre?.centro_costo_modo, padre?.requiere_centro_costo);
    try {
      await ContabilidadService.crearCuenta({
        account_code: codigo,
        name: nombre,
        type: padre?.type ?? tipoDeClase(claseDe(codigo) ?? 1),
        parent_code: filaNueva.padre,
        naturaleza: naturalezaDe(codigo, padre?.naturaleza) ?? 'debito',
        es_movimiento: !esTitulo,
        requiere_tercero: padre?.requiere_tercero ?? false,
        centro_costo_modo: modo,
        requiere_centro_costo: modo === 'obligatorio',
        presentacion_niif: presentacionDeCodigo(codigo) ?? null,
      });
      setFilaNueva(null);
      toast.success('Cuenta creada');
      await loadCuentas();
    } catch (errorGuardar) {
      setFilaNueva({ ...filaNueva, codigo, nombre, error: mensajeCuenta(errorGuardar) });
    }
  };

  const guardarNombre = async (codigo: string, nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio) return;
    try {
      await ContabilidadService.actualizarCuenta(codigo, { name: limpio });
      setEditando(null);
      await loadCuentas();
    } catch (error) {
      toast.error(mensajeCuenta(error));
    }
  };

  const handleDelete = async (code: string) => {
    if (hijos.has(code) || conLineas.has(code)) return;
    try {
      await ContabilidadService.eliminarCuenta(code);
      toast.success('Cuenta eliminada');
      await loadCuentas();
    } catch (error) {
      toast.error('No se puede borrar: tiene movimientos o cuentas hijas.');
    }
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

  const filaDeAgregar = (padre: string | null, level: number) => {
    if (!filaNueva || filaNueva.padre !== padre) return null;
    return (
      <div
        className="my-1 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"
        style={{ marginLeft: `${level * 24}px` }}
      >
        <Input
          value={filaNueva.codigo}
          aria-label="Código"
          aria-invalid={filaNueva.error ? true : undefined}
          onChange={(evento) => setFilaNueva({ ...filaNueva, codigo: evento.target.value.trim(), error: null })}
          onKeyDown={(evento) => teclaFila(evento, () => { void guardarNueva(); }, () => setFilaNueva(null))}
          className="h-8 w-28 font-mono"
        />
        <Input
          value={filaNueva.nombre}
          aria-label="Nombre"
          autoFocus
          onChange={(evento) => setFilaNueva({ ...filaNueva, nombre: evento.target.value, error: null })}
          onKeyDown={(evento) => teclaFila(evento, () => { void guardarNueva(); }, () => setFilaNueva(null))}
          className="h-8 min-w-[12rem] flex-1"
        />
        <Button type="button" size="sm" onClick={() => { void guardarNueva(); }}>Guardar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setFilaNueva(null)}>Cancelar</Button>
        {filaNueva.error && (
          <p role="alert" className="w-full text-xs text-danger-text">{filaNueva.error}</p>
        )}
      </div>
    );
  };

  const renderNode = (node: NodoPlan<ChartAccount>, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.cuenta.account_code) || filaNueva?.padre === node.cuenta.account_code;
    const nivel = node.cuenta.nivel ?? nivelDe(node.cuenta.account_code);
    const naturaleza = naturalezaDe(node.cuenta.account_code, node.cuenta.naturaleza);
    const tieneHijas = hijos.has(node.cuenta.account_code) || hasChildren;
    const movimiento = esMovimientoVisible(node.cuenta.es_movimiento, tieneHijas);
    const puedeAgregar = esCodigoPuc(node.cuenta.account_code)
      && siguienteCodigo(node.cuenta.account_code, codigos) != null;
    const bloqueada = tieneHijas || conLineas.has(node.cuenta.account_code);
    const editandoEsta = editando?.codigo === node.cuenta.account_code;

    return (
      <div key={node.cuenta.account_code}>
        <div
          className="flex items-center gap-2 py-2.5 px-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <button
            type="button"
            onClick={() => (hasChildren || filaNueva?.padre === node.cuenta.account_code) && toggleExpand(node.cuenta.account_code)}
            className={`w-5 h-5 flex items-center justify-center shrink-0 ${(hasChildren || filaNueva?.padre === node.cuenta.account_code) ? 'cursor-pointer' : 'invisible'}`}
          >
            {(hasChildren || filaNueva?.padre === node.cuenta.account_code) && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
          </button>
          <span className="font-mono text-sm text-gray-600 dark:text-gray-400 w-28 shrink-0">
            {node.cuenta.account_code}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {editandoEsta ? (
                <Input
                  value={editando.nombre}
                  aria-label={`Nombre de ${node.cuenta.account_code}`}
                  autoFocus
                  onChange={(evento) => setEditando({ codigo: node.cuenta.account_code, nombre: evento.target.value })}
                  onKeyDown={(evento) => teclaFila(
                    evento,
                    () => { void guardarNombre(node.cuenta.account_code, editando.nombre); },
                    () => setEditando(null),
                  )}
                  className="h-8 max-w-sm"
                />
              ) : (
                <span
                  className={`text-gray-900 dark:text-white font-medium break-words ${node.cuenta.is_active === false ? 'line-through opacity-60' : ''}`}
                  onDoubleClick={() => {
                    setFilaNueva(null);
                    setEditando({ codigo: node.cuenta.account_code, nombre: node.cuenta.name });
                  }}
                >
                  {node.cuenta.name}
                </span>
              )}
              <Badge variant="outline">{nombreNivel(nivel)}</Badge>
              {naturaleza && <Badge variant="outline">{NATURALEZAS.find((n) => n.value === naturaleza)?.label}</Badge>}
              {!movimiento && <Badge variant="outline">Título</Badge>}
              {node.cuenta.requiere_tercero && <Badge variant="outline">Tercero</Badge>}
            </div>
          </div>
          {getTypeBadge(node.cuenta.type)}
          <div className="flex gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Editar nombre de ${node.cuenta.account_code}`}
              onClick={() => {
                setFilaNueva(null);
                setEditando({ codigo: node.cuenta.account_code, nombre: node.cuenta.name });
              }}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Eliminar ${node.cuenta.account_code}`}
              disabled={bloqueada}
              title={bloqueada ? 'Tiene movimientos o cuentas hijas' : 'Eliminar'}
              onClick={() => { void handleDelete(node.cuenta.account_code); }}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isExpanded && node.children.map((child) => renderNode(child, level + 1))}
        {isExpanded && puedeAgregar && (
          filaNueva?.padre === node.cuenta.account_code
            ? filaDeAgregar(node.cuenta.account_code, level + 1)
            : (
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-2 text-sm text-fg-secondary"
                style={{ marginLeft: `${(level + 1) * 24}px` }}
                onClick={() => abrirAgregar(node.cuenta.account_code)}
              >
                <Plus className="h-4 w-4" /> Agregar
              </button>
            )
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  const puedeClase = siguienteClase(codigos) != null;

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
            {puedeClase && (
              filaNueva?.padre === null
                ? filaDeAgregar(null, 0)
                : (
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-2 text-sm text-fg-secondary"
                    onClick={() => abrirAgregar(null)}
                  >
                    <Plus className="h-4 w-4" /> Agregar
                  </button>
                )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
