"use client";

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Barcode,
  Copy,
  DollarSign,
  Hash,
  Info,
  Loader2,
  Power,
  Printer,
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
import { Textarea } from '@/components/ui/textarea';
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
import { useTranslations } from 'next-intl';
import { AltaRapidaCategoria } from '../nuevo/AltaRapidaCategoria';
import { useFormatoEntero, useKitT } from '@/components/kit/useIdiomaKit';
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
  type ErrorMasivo,
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
  /** «⋯ › Imprimir etiquetas» de los seleccionados. */
  onImprimirEtiquetas?: (ids: number[]) => void;
  /** «⋯ › Generar códigos de barras» de los seleccionados que no tienen. */
  onGenerarCodigos?: (ids: number[]) => void;
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
  onImprimirEtiquetas,
  onGenerarCodigos,
}) => {
  const tEtq = useTranslations('inventarioEtiquetas.catalogo');
  const tCat = useTranslations('inventarioEtiquetas.categoria');
  const t = useTranslations('productos.masivas');
  const tk = useKitT();
  const entero = useFormatoEntero();
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
  const [motivoStock, setMotivoStock] = useState<string>('');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Estados para categoría
  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  // Alta rápida desde el selector («Crear “…”»): el nombre escrito.
  const [nuevaCategoria, setNuevaCategoria] = useState<string | null>(null);

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
  // La organización sale del contexto de la sesión; el servidor vuelve a validarla.
  const orgId = organization?.id ?? 0;
  const alcance = t('alcance', { count: n, n: entero(n) });

  // Mientras se procesa, el diálogo no se cierra (ni con Esc ni fuera).
  const cerrar = (abierto: boolean) => {
    if (!abierto && !processing) setActiveDialog(null);
  };

  // Los fallos del servicio llegan como código (`productos.masivas.errores`) o como texto ya listo.
  const textoError = (e: string | ErrorMasivo) => (typeof e === 'string' ? e : t(`errores.${e.codigo}`, e.valores));

  const mostrarResultado = (accion: string, exitosos: number, fallidos: number, errores: readonly (string | ErrorMasivo)[]) => {
    // La tienda web cachea el catálogo 30 s: avisarle para que refleje ya
    // los precios, el stock o el estado que acaban de cambiar.
    if (exitosos > 0) avisarCambioCatalogo();
    if (fallidos === 0) {
      toast({ title: accion, description: t('resultado.ok', { count: exitosos, n: entero(exitosos) }) });
    } else {
      toast({
        variant: 'destructive',
        title: t('resultado.parcialTitulo', { accion }),
        description: t('resultado.parcial', { exitosos: entero(exitosos), fallidos: entero(fallidos), error: errores[0] ? textoError(errores[0]) : '' }),
      });
    }
    onActionComplete();
    onClearSelection();
    setActiveDialog(null);
  };

  const handlePrecios = async () => {
    const cantidadRaw = parseFloat(cantidadPrecio);
    if (isNaN(cantidadRaw) || cantidadRaw < 0) {
      toast({ variant: 'destructive', title: t('error'), description: t('validacion.cantidad') });
      return;
    }
    // Si es "Disminuir", se niega el valor para que el servicio lo reste
    const cantidad = modoAjuste === 'fijo' ? cantidadRaw : (direccion === 'disminuir' ? -cantidadRaw : cantidadRaw);
    setProcessing(true);
    try {
      const r = await bulkUpdatePrices(orgId, selectedIds, tipoPrecio, modoAjuste, cantidad);
      mostrarResultado(t('resultado.precios'), r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setCantidadPrecio('');
    }
  };

  const handleStock = async () => {
    const cantidad = parseFloat(cantidadStock);
    if (isNaN(cantidad) || !selectedBranch || !organization?.id) {
      toast({ variant: 'destructive', title: t('error'), description: t('validacion.campos') });
      return;
    }
    setProcessing(true);
    try {
      // Por el kardex: cada producto genera su movimiento de ajuste y su asiento (en el servidor).
      const r = await bulkUpdateStock(organization.id, selectedIds, parseInt(selectedBranch), cantidad, modoStock, motivoStock);
      const errores = r.errores.map((e) => (e.includes('sin_permiso') ? t('stock.sinPermiso') : e));
      mostrarResultado(t('resultado.stock'), r.exitosos, r.fallidos, errores);
      if (r.resumen.sin_costo > 0) {
        toast({ title: t('resultado.stock'), description: t('stock.sinCosto', { count: r.resumen.sin_costo, n: entero(r.resumen.sin_costo) }) });
      }
    } finally {
      setProcessing(false);
      setCantidadStock('');
      setMotivoStock('');
    }
  };

  const handleEstado = async (status: EstadoMasivo) => {
    setProcessing(true);
    try {
      const r = await bulkUpdateStatus(orgId, selectedIds, status);
      mostrarResultado(t('resultado.estado'), r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleCategoria = async () => {
    if (!selectedCategoria) {
      toast({ variant: 'destructive', title: t('error'), description: t('validacion.categoria') });
      return;
    }
    setProcessing(true);
    try {
      const r = await bulkAssignCategory(orgId, selectedIds, parseInt(selectedCategoria));
      mostrarResultado(t('resultado.categoria'), r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleEliminar = async () => {
    setProcessing(true);
    try {
      const r = await bulkDelete(orgId, selectedIds);
      mostrarResultado(t('resultado.eliminados'), r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleCopiarComparacion = async () => {
    setProcessing(true);
    try {
      const r = await bulkCopyPriceToCompare(orgId, selectedIds, sobrescribirComparacion);
      mostrarResultado(t('resultado.comparacion'), r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setSobrescribirComparacion(false);
    }
  };

  const handleRedondear = async () => {
    const multiplo = modoRedondeo === 'multiplo' ? parseFloat(multiploRedondeo) : 0;
    const dCount = modoRedondeo === 'digitos' ? parseInt(digitosCount, 10) : 0;

    if (modoRedondeo === 'multiplo' && (!multiplo || multiplo <= 0)) {
      toast({ variant: 'destructive', title: t('error'), description: t('validacion.multiplo') });
      return;
    }
    if (modoRedondeo === 'digitos' && (!dCount || dCount < 1 || dCount > 5)) {
      toast({ variant: 'destructive', title: t('error'), description: t('validacion.digitosRango') });
      return;
    }
    if (modoRedondeo === 'digitos' && digitosValor.length !== dCount) {
      toast({ variant: 'destructive', title: t('error'), description: t('validacion.digitosValor', { count: dCount }) });
      return;
    }

    setProcessing(true);
    try {
      const r = await bulkRoundPrices(orgId, selectedIds, tipoRedondeo, modoRedondeo, multiplo, dCount, digitosValor);
      mostrarResultado(t('resultado.redondeados'), r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const acciones: AccionMasiva[] = [
    { id: 'precios', etiqueta: t('acciones.precios'), icono: DollarSign, onClick: () => setActiveDialog('precios') },
    { id: 'stock', etiqueta: t('acciones.stock'), icono: SlidersHorizontal, onClick: () => setActiveDialog('stock') },
    { id: 'categoria', etiqueta: t('acciones.categoria'), icono: Tags, onClick: () => setActiveDialog('categoria') },
    { id: 'estado', etiqueta: t('acciones.estado'), icono: Power, onClick: () => setActiveDialog('estado') },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash,
      onClick: () => setActiveDialog('eliminar'),
      destructiva: true,
    },
  ];

  const secundarias: AccionFila[] = [
    // Figma «Catálogo — barra masiva · menú «⋯»»: entran por el «⋯», no como sexto botón.
    ...(onImprimirEtiquetas
      ? [{ id: 'imprimir-etiquetas', etiqueta: tEtq('imprimirEtiquetas'), icono: Printer, onSelect: () => onImprimirEtiquetas(selectedIds) }]
      : []),
    ...(onGenerarCodigos
      ? [{ id: 'generar-codigos', etiqueta: tEtq('generarCodigos'), icono: Barcode, onSelect: () => onGenerarCodigos(selectedIds) }]
      : []),
    { id: 'comparacion', etiqueta: t('acciones.comparacion'), icono: Copy, onSelect: () => setActiveDialog('copiarComparacion'), separadorAntes: !!(onImprimirEtiquetas || onGenerarCodigos) },
    { id: 'redondear', etiqueta: t('acciones.redondear'), icono: Hash, onSelect: () => setActiveDialog('redondear') },
  ];

  const pieDialogo = (textoPrimario: string, onAplicar: () => void, destructiva = false) => (
    <DialogFooter className="gap-2 sm:gap-2">
      <Button variant="outline" className="h-10" onClick={() => setActiveDialog(null)} disabled={processing}>
        {tk('comun.cancelar')}
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
        sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
        acciones={acciones}
        accionesSecundarias={secundarias}
        onLimpiar={onClearSelection}
      />

      {/* Precios */}
      <Dialog open={activeDialog === 'precios'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('precios.titulo')}</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('precios.tipo')}>
              {(campo) => (
                <Select value={tipoPrecio} onValueChange={(v) => setTipoPrecio(v as TipoPrecio)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">{t('tipos.venta')}</SelectItem>
                    <SelectItem value="compra">{t('tipos.compra')}</SelectItem>
                    <SelectItem value="comparacion">{t('tipos.comparacion')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('precios.modo')}>
              {(campo) => (
                <Select value={modoAjuste} onValueChange={(v) => setModoAjuste(v as ModoAjuste)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fijo">{t('precios.modos.fijo')}</SelectItem>
                    <SelectItem value="valor">{t('precios.modos.valor')}</SelectItem>
                    <SelectItem value="porcentaje">{t('precios.modos.porcentaje')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {modoAjuste !== 'fijo' && (
              <FormField etiqueta={t('precios.direccion')}>
                {(campo) => (
                  <SegmentedControl
                    aria-labelledby={campo.idEtiqueta}
                    anchoCompleto
                    valor={direccion}
                    onValorChange={setDireccion}
                    opciones={[
                      { valor: 'aumentar', etiqueta: t('precios.aumentar'), icono: TrendingUp },
                      { valor: 'disminuir', etiqueta: t('precios.disminuir'), icono: TrendingDown },
                    ]}
                  />
                )}
              </FormField>
            )}
            <FormField
              etiqueta={
                modoAjuste === 'fijo'
                  ? t('precios.nuevoValor')
                  : modoAjuste === 'valor'
                    ? direccion === 'aumentar' ? t('precios.valorAumentar') : t('precios.valorDisminuir')
                    : direccion === 'aumentar' ? t('precios.porcentajeAumentar') : t('precios.porcentajeDisminuir')
              }
            >
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={cantidadPrecio}
                onChange={(e) => setCantidadPrecio(e.target.value)}
                placeholder={modoAjuste === 'porcentaje' ? t('precios.ejemploPorcentaje') : t('precios.ejemploValor')}
                className="h-10"
              />
            </FormField>
            {tipoPrecio === 'compra' && modoAjuste === 'porcentaje' && (
              <div role="note" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-text">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                <p>{t.rich('precios.avisoCosto', { b: (c) => <strong>{c}</strong> })}</p>
              </div>
            )}
          </div>
          {pieDialogo(tk('comun.aplicar'), handlePrecios)}
        </DialogContent>
      </Dialog>

      {/* Stock */}
      <Dialog open={activeDialog === 'stock'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('stock.titulo')}</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('stock.sucursal')} obligatorio>
              {(campo) => (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger id={campo.id} aria-required className="h-10">
                    <SelectValue placeholder={t('stock.seleccioneSucursal')} />
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
            <FormField etiqueta={t('stock.modo')}>
              {(campo) => (
                <Select value={modoStock} onValueChange={(v) => setModoStock(v as ModoStock)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">{t('stock.modos.set')}</SelectItem>
                    <SelectItem value="add">{t('stock.modos.add')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('stock.cantidad')} obligatorio>
              <Input
                type="number"
                inputMode="decimal"
                value={cantidadStock}
                onChange={(e) => setCantidadStock(e.target.value)}
                placeholder={modoStock === 'add' ? t('stock.ejemploSumar') : t('stock.ejemploExacto')}
                className="h-10"
              />
            </FormField>
            <FormField etiqueta={t('stock.motivo')}>
              <Textarea
                value={motivoStock}
                onChange={(e) => setMotivoStock(e.target.value)}
                placeholder={t('stock.motivoPlaceholder')}
                maxLength={500}
                rows={2}
              />
            </FormField>
            <div role="note" className="flex items-start gap-2 rounded-lg border border-line-brand bg-brand-tint p-3 text-xs text-brand-deep">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <p>{t('stock.avisoKardex')}</p>
            </div>
          </div>
          {pieDialogo(tk('comun.aplicar'), handleStock)}
        </DialogContent>
      </Dialog>

      {/* Categoría */}
      <Dialog open={activeDialog === 'categoria'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('categoria.titulo')}</DialogTitle>
            <DialogDescription>
              {t('categoria.alcance', { count: n, n: entero(n) })}
            </DialogDescription>
          </DialogHeader>
          <FormField etiqueta={t('categoria.campo')} obligatorio>
            {() => (
              <SearchSelect
                options={categorias.map((c) => ({ value: String(c.id), label: c.name }))}
                value={selectedCategoria}
                onValueChange={setSelectedCategoria}
                placeholder={t('categoria.seleccione')}
                searchPlaceholder={t('categoria.buscar')}
                emptyText={t('categoria.vacio')}
                className="h-10"
                onCreate={(texto) => setNuevaCategoria(texto)}
                createLabel={(texto) => tCat('crearCon', { nombre: texto })}
                createEmptyLabel={tCat('crear')}
              />
            )}
          </FormField>
          {pieDialogo(t('categoria.asignar'), handleCategoria)}
        </DialogContent>
      </Dialog>

      <AltaRapidaCategoria
        abierto={nuevaCategoria !== null}
        onAbiertoChange={(v) => !v && setNuevaCategoria(null)}
        nombreInicial={nuevaCategoria ?? undefined}
        onCreada={(categoria) => {
          setCategorias((prev) => [...prev, { id: categoria.id, name: categoria.name }].sort((a, b) => a.name.localeCompare(b.name)));
          setSelectedCategoria(String(categoria.id));
        }}
      />

      {/* Estado */}
      <Dialog open={activeDialog === 'estado'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('estado.titulo')}</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <FormField etiqueta={t('estado.nuevo')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                anchoCompleto
                valor={estadoNuevo}
                onValorChange={setEstadoNuevo}
                opciones={[
                  { valor: 'active', etiqueta: t('estado.active') },
                  { valor: 'inactive', etiqueta: t('estado.inactive') },
                  { valor: 'discontinued', etiqueta: t('estado.discontinued') },
                ]}
              />
            )}
          </FormField>
          {pieDialogo(t('estado.cambiar'), () => handleEstado(estadoNuevo))}
        </DialogContent>
      </Dialog>

      {/* Redondear precios */}
      <Dialog open={activeDialog === 'redondear'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('redondear.titulo')}</DialogTitle>
            <DialogDescription>
              {t('redondear.alcance', { count: n, n: entero(n) })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('redondear.precio')}>
              {(campo) => (
                <Select value={tipoRedondeo} onValueChange={(v) => setTipoRedondeo(v as TipoPrecio)}>
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">{t('tipos.venta')}</SelectItem>
                    <SelectItem value="compra">{t('tipos.compra')}</SelectItem>
                    <SelectItem value="comparacion">{t('tipos.comparacion')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField etiqueta={t('redondear.modo')}>
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  anchoCompleto
                  valor={modoRedondeo}
                  onValorChange={setModoRedondeo}
                  opciones={[
                    { valor: 'multiplo', etiqueta: t('redondear.modoMultiplo') },
                    { valor: 'digitos', etiqueta: t('redondear.modoDigitos') },
                  ]}
                />
              )}
            </FormField>

            {modoRedondeo === 'multiplo' ? (
              <>
                <FormField
                  etiqueta={t('redondear.multiplo')}
                  ayuda={t('redondear.multiploAyuda')}
                >
                  {(campo) => (
                    <SegmentedControl
                      aria-labelledby={campo.idEtiqueta}
                      anchoCompleto
                      tamano="sm"
                      valor={multiploRedondeo}
                      onValorChange={setMultiploRedondeo}
                      opciones={MULTIPLOS.map((m) => ({ valor: m, etiqueta: entero(Number(m)) }))}
                    />
                  )}
                </FormField>
                <FormField etiqueta={t('redondear.multiploPersonalizado')}>
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
                  <FormField etiqueta={t('redondear.digitos')}>
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
                              {t('redondear.nDigitos', { count: d })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <FormField etiqueta={t('redondear.valor')}>
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
                  etiqueta={t('redondear.frecuentes')}
                  ayuda={t('redondear.frecuentesAyuda')}
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
          {pieDialogo(tk('comun.aplicar'), handleRedondear)}
        </DialogContent>
      </Dialog>

      {/* Precio de venta → precio de comparación */}
      <Dialog open={activeDialog === 'copiarComparacion'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('comparacion.titulo')}</DialogTitle>
            <DialogDescription>{alcance}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-line-brand bg-brand-tint p-3 text-sm text-brand-deep">
              <p className="mb-1 font-medium">{t('comparacion.porDefecto')}</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                <li>{t.rich('comparacion.sin', { b: (c) => <strong>{c}</strong> })}</li>
                <li>{t.rich('comparacion.con', { b: (c) => <strong>{c}</strong> })}</li>
              </ul>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox
                checked={sobrescribirComparacion}
                onCheckedChange={(v) => setSobrescribirComparacion(v === true)}
                className="size-[18px] rounded"
              />
              {t('comparacion.sobrescribir')}
            </label>
          </div>
          {pieDialogo(tk('comun.aplicar'), handleCopiarComparacion)}
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <Dialog open={activeDialog === 'eliminar'} onOpenChange={cerrar}>
        <DialogContent className={clasesDialogo}>
          <DialogHeader>
            <DialogTitle>{t('eliminar.titulo', { count: n, n: entero(n) })}</DialogTitle>
            <DialogDescription>
              {t('eliminar.descripcion', { count: n, n: entero(n) })}
            </DialogDescription>
          </DialogHeader>
          {pieDialogo(t('acciones.eliminar'), handleEliminar, true)}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AccionesMasivas;
