"use client";

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Copy,
  DollarSign,
  Hash,
  Loader2,
  Power,
  SlidersHorizontal,
  Tags,
  Trash,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { BulkActionBar, FormField, SegmentedControl, type AccionFila, type AccionMasiva } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchSelect } from '@/components/ui/search-select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { avisarCambioCatalogo } from '@/lib/services/website/avisarCambioCatalogo';
import {
  bulkUpdatePrices,
  bulkUpdateStock,
  bulkUpdateStatus,
  bulkDelete,
  bulkAssignCategory,
  bulkCopyPriceToCompare,
  bulkRoundPrices,
  TipoPrecio,
  ModoAjuste,
  ModoStock,
  ModoRedondeo,
} from './bulkService';

/**
 * Acciones masivas del catálogo: la `BulkActionBar` del kit (flota al pie,
 * PATRONES §1) y un diálogo por acción con los mismos campos y servicios de
 * siempre (`bulkService.ts`).
 *
 * Barra: Precios · Stock · Categoría · Estado · Eliminar; en «⋯»: Precio →
 * Comparación y Redondear precios.
 */
interface AccionesMasivasProps {
  selectedIds: number[];
  /** Productos del listado (con los filtros actuales), para «Seleccionar los N». */
  total?: number;
  onSeleccionarTodos?: () => void;
  onClearSelection: () => void;
  onActionComplete: () => void;
}

type DialogType = 'precios' | 'stock' | 'categoria' | 'estado' | 'eliminar' | 'copiarComparacion' | 'redondear' | null;
type EstadoMasivo = 'active' | 'inactive' | 'discontinued';

const SUGERENCIAS_DIGITOS = [
  '0', '5', '9',
  '00', '50', '90', '99',
  '000', '500', '900', '990', '999', '050',
  '0000', '5000', '9000', '9900', '9990', '9999',
  '00000', '50000', '90000', '99000', '99900', '99990', '99999',
];

const MULTIPLOS = ['10', '50', '100', '500', '1000'] as const;

const AccionesMasivas: React.FC<AccionesMasivasProps> = ({
  selectedIds,
  total,
  onSeleccionarTodos,
  onClearSelection,
  onActionComplete,
}) => {
  const { organization } = useOrganization();
  const { selectedBranchId } = useBranch();
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [processing, setProcessing] = useState(false);

  // Estados para precios
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>('venta');
  const [modoAjuste, setModoAjuste] = useState<ModoAjuste>('porcentaje');
  const [direccion, setDireccion] = useState<'aumentar' | 'disminuir'>('aumentar');
  const [cantidadPrecio, setCantidadPrecio] = useState<string>('');

  // Estados para stock
  const [modoStock, setModoStock] = useState<ModoStock>('set');
  const [cantidadStock, setCantidadStock] = useState<string>('');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Estados para categoría
  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');

  // Estado masivo (antes un menú sin confirmación)
  const [estadoNuevo, setEstadoNuevo] = useState<EstadoMasivo>('active');

  // Estado para copiar precio → comparación
  const [sobrescribirComparacion, setSobrescribirComparacion] = useState(false);

  // Estados para redondeo masivo
  const [tipoRedondeo, setTipoRedondeo] = useState<TipoPrecio>('venta');
  const [modoRedondeo, setModoRedondeo] = useState<ModoRedondeo>('multiplo');
  const [multiploRedondeo, setMultiploRedondeo] = useState<string>('100');
  const [digitosCount, setDigitosCount] = useState<string>('3');
  const [digitosValor, setDigitosValor] = useState<string>('000');

  useEffect(() => {
    if (!organization?.id) return;
    const load = async () => {
      const [{ data: br }, { data: cats }] = await Promise.all([
        supabase.from('branches').select('id, name').eq('organization_id', organization.id).order('name'),
        supabase.from('categories').select('id, name').eq('organization_id', organization.id).order('name'),
      ]);
      setBranches(br || []);
      setCategorias(cats || []);
      if (selectedBranchId) setSelectedBranch(String(selectedBranchId));
    };
    load();
  }, [organization?.id, selectedBranchId]);

  const n = selectedIds.length;
  const alcance = `Se aplicará a ${n.toLocaleString('es-CO')} producto${n !== 1 ? 's' : ''}.`;

  // Mientras se procesa, el diálogo no se cierra (ni con Esc ni fuera).
  const cerrar = (abierto: boolean) => {
    if (!abierto && !processing) setActiveDialog(null);
  };

  const mostrarResultado = (accion: string, exitosos: number, fallidos: number, errores: string[]) => {
    // La tienda web cachea el catálogo 30 s: avisarle para que refleje ya
    // los precios, el stock o el estado que acaban de cambiar.
    if (exitosos > 0) avisarCambioCatalogo();
    if (fallidos === 0) {
      toast({ title: accion, description: `${exitosos} productos actualizados correctamente.` });
    } else {
      toast({
        variant: 'destructive',
        title: `${accion} (parcial)`,
        description: `${exitosos} exitosos, ${fallidos} fallidos. ${errores[0] || ''}`,
      });
    }
    onActionComplete();
    onClearSelection();
    setActiveDialog(null);
  };

  const handlePrecios = async () => {
    const cantidadRaw = parseFloat(cantidadPrecio);
    if (isNaN(cantidadRaw) || cantidadRaw < 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingrese una cantidad válida (mayor o igual a 0).' });
      return;
    }
    // Si es "Disminuir", se niega el valor para que el servicio lo reste
    const cantidad = modoAjuste === 'fijo' ? cantidadRaw : (direccion === 'disminuir' ? -cantidadRaw : cantidadRaw);
    setProcessing(true);
    try {
      const r = await bulkUpdatePrices(selectedIds, tipoPrecio, modoAjuste, cantidad);
      mostrarResultado('Precios actualizados', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setCantidadPrecio('');
    }
  };

  const handleStock = async () => {
    const cantidad = parseFloat(cantidadStock);
    if (isNaN(cantidad) || !selectedBranch) {
      toast({ variant: 'destructive', title: 'Error', description: 'Complete todos los campos.' });
      return;
    }
    setProcessing(true);
    try {
      const r = await bulkUpdateStock(selectedIds, parseInt(selectedBranch), cantidad, modoStock);
      mostrarResultado('Stock actualizado', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setCantidadStock('');
    }
  };

  const handleEstado = async (status: EstadoMasivo) => {
    setProcessing(true);
    try {
      const r = await bulkUpdateStatus(selectedIds, status);
      mostrarResultado('Estado actualizado', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleCategoria = async () => {
    if (!selectedCategoria) {
      toast({ variant: 'destructive', title: 'Error', description: 'Seleccione una categoría.' });
      return;
    }
    setProcessing(true);
    try {
      const r = await bulkAssignCategory(selectedIds, parseInt(selectedCategoria));
      mostrarResultado('Categoría asignada', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleEliminar = async () => {
    setProcessing(true);
    try {
      const r = await bulkDelete(selectedIds);
      mostrarResultado('Productos eliminados', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleCopiarComparacion = async () => {
    setProcessing(true);
    try {
      const r = await bulkCopyPriceToCompare(selectedIds, sobrescribirComparacion);
      mostrarResultado('Precio de comparación actualizado', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setSobrescribirComparacion(false);
    }
  };

  const handleRedondear = async () => {
    const multiplo = modoRedondeo === 'multiplo' ? parseFloat(multiploRedondeo) : 0;
    const dCount = modoRedondeo === 'digitos' ? parseInt(digitosCount, 10) : 0;

    if (modoRedondeo === 'multiplo' && (!multiplo || multiplo <= 0)) {
      toast({ variant: 'destructive', title: 'Error', description: 'El múltiplo debe ser mayor a 0' });
      return;
    }
    if (modoRedondeo === 'digitos' && (!dCount || dCount < 1 || dCount > 5)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Los dígitos a reemplazar deben estar entre 1 y 5' });
      return;
    }
    if (modoRedondeo === 'digitos' && digitosValor.length !== dCount) {
      toast({ variant: 'destructive', title: 'Error', description: `El valor debe tener ${dCount} dígitos` });
      return;
    }

    setProcessing(true);
    try {
      const r = await bulkRoundPrices(selectedIds, tipoRedondeo, modoRedondeo, multiplo, dCount, digitosValor);
      mostrarResultado('Precios redondeados', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const acciones: AccionMasiva[] = [
    { id: 'precios', etiqueta: 'Precios', icono: DollarSign, onClick: () => setActiveDialog('precios') },
    { id: 'stock', etiqueta: 'Stock', icono: SlidersHorizontal, onClick: () => setActiveDialog('stock') },
    { id: 'categoria', etiqueta: 'Categoría', icono: Tags, onClick: () => setActiveDialog('categoria') },
    { id: 'estado', etiqueta: 'Estado', icono: Power, onClick: () => setActiveDialog('estado') },
    {
      id: 'eliminar',
      etiqueta: 'Eliminar',
      icono: Trash,
      onClick: () => setActiveDialog('eliminar'),
      destructiva: true,
    },
  ];

  const secundarias: AccionFila[] = [
    { id: 'comparacion', etiqueta: 'Precio → Comparación', icono: Copy, onSelect: () => setActiveDialog('copiarComparacion') },
    { id: 'redondear', etiqueta: 'Redondear precios', icono: Hash, onSelect: () => setActiveDialog('redondear') },
  ];

  const pieDialogo = (textoPrimario: string, onAplicar: () => void, destructiva = false) => (
    <DialogFooter className="gap-2 sm:gap-2">
      <Button variant="outline" className="h-10" onClick={() => setActiveDialog(null)} disabled={processing}>
        Cancelar
      </Button>
      <Button
        variant={destructiva ? 'destructive' : 'default'}
        className="h-10"
        onClick={onAplicar}
        disabled={processing}
        aria-busy={processing || undefined}
      >
        {processing && <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />}
        {textoPrimario}
      </Button>
    </DialogFooter>
  );

  const clasesDialogo = 'border-line bg-surface text-fg sm:max-w-[440px]';
  const nDigitos = parseInt(digitosCount, 10);

  return (
    <>
      <BulkActionBar
        seleccionados={n}
        total={total}
        onSeleccionarTodos={onSeleccionarTodos}
        sustantivo={{ singular: 'producto', plural: 'productos' }}
        acciones={acciones}
        accionesSecundarias={secundarias}
        onLimpiar={onClearSelection}
      />

      {/* Precios */}
      <Dialog open={activeDialog === 'precios'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>Edición masiva de precios</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField etiqueta="Tipo de precio">
              {(campo) => (
                <Select value={tipoPrecio} onValueChange={(v) => setTipoPrecio(v as TipoPrecio)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">Precio de venta</SelectItem>
                    <SelectItem value="compra">Costo de compra</SelectItem>
                    <SelectItem value="comparacion">Precio de comparación</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Modo de ajuste">
              {(campo) => (
                <Select value={modoAjuste} onValueChange={(v) => setModoAjuste(v as ModoAjuste)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fijo">Establecer valor fijo</SelectItem>
                    <SelectItem value="valor">Por valor ($)</SelectItem>
                    <SelectItem value="porcentaje">Por porcentaje (%)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {modoAjuste !== 'fijo' && (
              <FormField etiqueta="Dirección">
                {(campo) => (
                  <SegmentedControl
                    aria-labelledby={campo.idEtiqueta}
                    anchoCompleto
                    valor={direccion}
                    onValorChange={setDireccion}
                    opciones={[
                      { valor: 'aumentar', etiqueta: 'Aumentar', icono: TrendingUp },
                      { valor: 'disminuir', etiqueta: 'Disminuir', icono: TrendingDown },
                    ]}
                  />
                )}
              </FormField>
            )}
            <FormField
              etiqueta={
                modoAjuste === 'fijo'
                  ? 'Nuevo valor'
                  : modoAjuste === 'valor'
                    ? direccion === 'aumentar' ? 'Cantidad a aumentar ($)' : 'Cantidad a disminuir ($)'
                    : direccion === 'aumentar' ? 'Porcentaje a aumentar (%)' : 'Porcentaje a disminuir (%)'
              }
            >
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={cantidadPrecio}
                onChange={(e) => setCantidadPrecio(e.target.value)}
                placeholder={modoAjuste === 'porcentaje' ? 'Ej: 10' : 'Ej: 5000'}
                className="h-10"
              />
            </FormField>
            {tipoPrecio === 'compra' && modoAjuste === 'porcentaje' && (
              <div role="note" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-text">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                <p>
                  Los productos <strong>sin costo previo</strong> no serán afectados (0 × % = 0). Use el modo
                  «Establecer valor fijo» para asignar un costo a productos que no tienen uno.
                </p>
              </div>
            )}
          </div>
          {pieDialogo('Aplicar', handlePrecios)}
        </DialogContent>
      </Dialog>

      {/* Stock */}
      <Dialog open={activeDialog === 'stock'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>Actualización masiva de stock</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField etiqueta="Sucursal" obligatorio>
              {(campo) => (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger id={campo.id} aria-required className="h-10">
                    <SelectValue placeholder="Seleccione sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Modo">
              {(campo) => (
                <Select value={modoStock} onValueChange={(v) => setModoStock(v as ModoStock)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Establecer cantidad exacta</SelectItem>
                    <SelectItem value="add">Sumar/restar a cantidad actual</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Cantidad" obligatorio>
              <Input
                type="number"
                inputMode="decimal"
                value={cantidadStock}
                onChange={(e) => setCantidadStock(e.target.value)}
                placeholder={modoStock === 'add' ? 'Ej: 10 o -5' : 'Ej: 100'}
                className="h-10"
              />
            </FormField>
          </div>
          {pieDialogo('Aplicar', handleStock)}
        </DialogContent>
      </Dialog>

      {/* Categoría */}
      <Dialog open={activeDialog === 'categoria'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>Asignar categoría</DialogTitle>
            <DialogDescription>
              Se asignará a {n.toLocaleString('es-CO')} producto{n !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <FormField etiqueta="Categoría" obligatorio>
            {() => (
              <SearchSelect
                options={categorias.map((c) => ({ value: String(c.id), label: c.name }))}
                value={selectedCategoria}
                onValueChange={setSelectedCategoria}
                placeholder="Seleccione categoría"
                searchPlaceholder="Buscar categoría…"
                emptyText="No se encontraron categorías"
                className="h-10"
              />
            )}
          </FormField>
          {pieDialogo('Asignar', handleCategoria)}
        </DialogContent>
      </Dialog>

      {/* Estado */}
      <Dialog open={activeDialog === 'estado'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>¿Cambiar el estado?</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <FormField etiqueta="Nuevo estado">
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                anchoCompleto
                valor={estadoNuevo}
                onValorChange={setEstadoNuevo}
                opciones={[
                  { valor: 'active', etiqueta: 'Activo' },
                  { valor: 'inactive', etiqueta: 'Inactivo' },
                  { valor: 'discontinued', etiqueta: 'Descontinuado' },
                ]}
              />
            )}
          </FormField>
          {pieDialogo('Cambiar estado', () => handleEstado(estadoNuevo))}
        </DialogContent>
      </Dialog>

      {/* Redondear precios */}
      <Dialog open={activeDialog === 'redondear'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>Redondear precios</DialogTitle>
            <DialogDescription>
              Se aplicará a {n.toLocaleString('es-CO')} producto{n !== 1 ? 's' : ''} (incluye padres e hijos).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField etiqueta="Precio a redondear">
              {(campo) => (
                <Select value={tipoRedondeo} onValueChange={(v) => setTipoRedondeo(v as TipoPrecio)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">Precio de venta</SelectItem>
                    <SelectItem value="compra">Costo de compra</SelectItem>
                    <SelectItem value="comparacion">Precio de comparación</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField etiqueta="Modo de redondeo">
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  anchoCompleto
                  valor={modoRedondeo}
                  onValorChange={setModoRedondeo}
                  opciones={[
                    { valor: 'multiplo', etiqueta: 'A múltiplo de N' },
                    { valor: 'digitos', etiqueta: 'Últimos dígitos' },
                  ]}
                />
              )}
            </FormField>

            {modoRedondeo === 'multiplo' ? (
              <>
                <FormField
                  etiqueta="Redondear al múltiplo más cercano de"
                  ayuda="Ej: $1.234 con múltiplo 100 → $1.200 · $1.267 con múltiplo 100 → $1.300"
                >
                  {(campo) => (
                    <SegmentedControl
                      aria-labelledby={campo.idEtiqueta}
                      anchoCompleto
                      tamano="sm"
                      valor={multiploRedondeo}
                      onValorChange={setMultiploRedondeo}
                      opciones={MULTIPLOS.map((m) => ({ valor: m, etiqueta: Number(m).toLocaleString('es-CO') }))}
                    />
                  )}
                </FormField>
                <FormField etiqueta="O un múltiplo personalizado">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={multiploRedondeo}
                    onChange={(e) => setMultiploRedondeo(e.target.value)}
                    className="h-10 w-32"
                  />
                </FormField>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField etiqueta="Dígitos a reemplazar">
                    {(campo) => (
                      <Select
                        value={digitosCount}
                        onValueChange={(v) => {
                          setDigitosCount(v);
                          // Ajustar el valor para que tenga la misma cantidad de dígitos
                          const padded = digitosValor.padStart(parseInt(v, 10), '0').slice(-parseInt(v, 10));
                          setDigitosValor(padded);
                        }}
                      >
                        <SelectTrigger id={campo.id} className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d} dígito{d > 1 ? 's' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <FormField etiqueta="Valor a poner">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={digitosValor}
                      onChange={(e) => setDigitosValor(e.target.value.replace(/[^0-9]/g, '').slice(0, nDigitos))}
                      placeholder={'0'.repeat(nDigitos)}
                      maxLength={nDigitos}
                      className="h-10 font-mono"
                    />
                  </FormField>
                </div>
                <FormField
                  etiqueta="Valores frecuentes"
                  ayuda='Ej: $1.234 con los últimos 3 = "990" → $1.990 · $5.678 con los últimos 2 = "50" → $5.650'
                >
                  {(campo) => (
                    <SegmentedControl
                      aria-labelledby={campo.idEtiqueta}
                      tamano="sm"
                      valor={digitosValor}
                      onValorChange={setDigitosValor}
                      opciones={SUGERENCIAS_DIGITOS.filter((v) => v.length === nDigitos).map((v) => ({ valor: v, etiqueta: v }))}
                    />
                  )}
                </FormField>
              </>
            )}
          </div>
          {pieDialogo('Aplicar', handleRedondear)}
        </DialogContent>
      </Dialog>

      {/* Precio de venta → precio de comparación */}
      <Dialog open={activeDialog === 'copiarComparacion'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>Precio de venta → Precio de comparación</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-line-brand bg-brand-tint p-3 text-sm text-brand-deep">
              <p className="mb-1 font-medium">Comportamiento por defecto:</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                <li>Productos <strong>sin</strong> precio de comparación: se copia el precio de venta.</li>
                <li>Productos <strong>con</strong> precio de comparación: se dejan igual.</li>
              </ul>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox
                checked={sobrescribirComparacion}
                onCheckedChange={(v) => setSobrescribirComparacion(v === true)}
                className="size-[18px] rounded"
              />
              Sobrescribir también los que ya tienen precio de comparación
            </label>
          </div>
          {pieDialogo('Aplicar', handleCopiarComparacion)}
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <Dialog open={activeDialog === 'eliminar'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>¿Eliminar {n === 1 ? 'el producto' : `${n.toLocaleString('es-CO')} productos`}?</DialogTitle>
            <DialogDescription>
              Se eliminarán {n.toLocaleString('es-CO')} producto{n !== 1 ? 's' : ''}. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {pieDialogo('Eliminar', handleEliminar, true)}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AccionesMasivas;
