'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, Loader2, Package, Plus, Save, Trash2, Wand2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormSection } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import {
  applyRules,
  evaluateRules,
  getRules,
  getSuppliersForSelect,
  getTagsForSelect,
  saveRules,
  type CategoryRule,
  type CategoryRuleInput,
  type LogicCombiner,
  type RuleField,
  type RuleOperator,
  FIELD_LABELS,
  FIELD_OPTIONS,
  FIELD_TYPES,
  OPERATORS_BY_TYPE,
} from '@/lib/services/categoryRulesService';
import { cn } from '@/utils/Utils';

/**
 * Reglas de asignación automática (Figma: tarjeta «Reglas de asignación
 * automática (N)» del detalle, con resumen, «Editar reglas» y el aviso «12
 * productos asignados…» con «Ver productos»).
 *
 * Conserva todo el constructor anterior (campo · operador · valor, Y/O,
 * sugerencias reales de marca/referencia/estación, vista previa, guardar y
 * aplicar) y añade lo que faltaba: **retroalimentación** de cada acción. La
 * lógica vive en `categoryRulesService`; aquí no se reimplementa.
 */
interface CategoryRulesCardProps {
  categoryId: number;
  categoryName: string;
  organizationId: number;
  /** Tras aplicar: cuántos productos se asignaron y cuántos se retiraron. */
  onProductsAssigned?: (resultado: { assigned: number; removed: number }) => void;
  onVerProductos?: () => void;
}

interface Opcion {
  id: number;
  name: string;
}

/** Campos de regla en el orden del servicio; su etiqueta sale de `categorias.reglas.campos.*`. */
const CAMPOS = Object.keys(FIELD_LABELS) as RuleField[];

function aEntrada(r: CategoryRule): CategoryRuleInput {
  return {
    field: r.field,
    operator: r.operator,
    value: r.value,
    value_array: r.value_array || [],
    logic_combiner: r.logic_combiner,
    display_order: r.display_order,
    is_active: r.is_active,
  };
}

function reglaIncompleta(r: CategoryRuleInput): boolean {
  return !r.value && r.operator !== 'in' && r.operator !== 'not_in';
}

export default function CategoryRulesCard({
  categoryId,
  categoryName,
  organizationId,
  onProductsAssigned,
  onVerProductos,
}: CategoryRulesCardProps) {
  const t = useTranslations('categorias');
  const n = useFormatoEntero();
  const { toast } = useToast();
  const [rules, setRules] = useState<CategoryRuleInput[]>([]);
  const [guardadas, setGuardadas] = useState<CategoryRule[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [editando, setEditando] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [evaluando, setEvaluando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState<{ id: number; name: string; sku: string }[] | null>(null);
  const [resultado, setResultado] = useState<{ assigned: number; removed: number; reglas: number } | null>(null);
  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [etiquetas, setEtiquetas] = useState<Opcion[]>([]);
  const [sugerencias, setSugerencias] = useState<Record<string, string[]>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const [reglas, provs, tags] = await Promise.all([
        getRules(categoryId),
        getSuppliersForSelect(organizationId),
        getTagsForSelect(organizationId),
      ]);
      setGuardadas(reglas);
      setRules(reglas.map(aEntrada));
      setProveedores(provs);
      setEtiquetas(tags);
      setDirty(false);
    } catch {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }, [categoryId, organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Sugerencias reales (marcas, referencias, estaciones) solo al editar.
  useEffect(() => {
    if (!editando || Object.keys(sugerencias).length) return;
    const distintos = async (columna: 'brand' | 'reference' | 'station') => {
      const { data } = await supabase
        .from('products')
        .select(columna)
        .eq('organization_id', organizationId)
        .not(columna, 'is', null)
        .neq(columna, '')
        .limit(2000);
      const valores = (data ?? []).map((r) => (r as Record<string, string>)[columna]);
      return [...new Set(valores)].sort();
    };
    void Promise.all([distintos('brand'), distintos('reference'), distintos('station')])
      .then(([brand, reference, station]) => setSugerencias({ brand, reference, station }))
      .catch(() => undefined);
  }, [editando, organizationId, sugerencias]);

  const nombreValor = useCallback(
    (r: { field: RuleField; value: string | null }) => {
      if (!r.value) return '—';
      if (r.field === 'supplier') return proveedores.find((p) => String(p.id) === r.value)?.name ?? r.value;
      if (r.field === 'tag') return etiquetas.find((e) => String(e.id) === r.value)?.name ?? r.value;
      const opcion = FIELD_OPTIONS[r.field]?.find((o) => o.value === r.value);
      return opcion ? t(`reglas.opciones.${r.field}.${opcion.value}`) : r.value;
    },
    [proveedores, etiquetas, t],
  );

  const reglasTemporales = (): CategoryRule[] =>
    rules.map((r, i) => ({
      id: 0,
      category_id: categoryId,
      organization_id: organizationId,
      field: r.field,
      operator: r.operator,
      value: r.value,
      value_array: r.value_array || [],
      logic_combiner: (i === 0 ? 'AND' : r.logic_combiner) as LogicCombiner,
      display_order: i,
      is_active: true,
      created_at: '',
      updated_at: '',
    }));

  const actualizar = (index: number, cambios: Partial<CategoryRuleInput>) => {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const nueva = { ...r, ...cambios };
        if (cambios.field && cambios.field !== r.field) {
          const validos = OPERATORS_BY_TYPE[FIELD_TYPES[nueva.field]] || [];
          if (!validos.includes(nueva.operator)) nueva.operator = validos[0] as RuleOperator;
          nueva.value = '';
          nueva.value_array = [];
        }
        return nueva;
      }),
    );
    setDirty(true);
    setVistaPrevia(null);
  };

  const agregar = () => {
    setRules((prev) => [
      ...prev,
      { field: 'name', operator: 'contains', value: '', value_array: [], logic_combiner: 'AND', display_order: prev.length, is_active: true },
    ]);
    setDirty(true);
    setEditando(true);
  };

  const quitar = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setVistaPrevia(null);
  };

  const guardar = async (silencioso = false): Promise<CategoryRule[] | null> => {
    setGuardando(true);
    try {
      const nuevas = await saveRules(categoryId, organizationId, rules);
      setGuardadas(nuevas);
      setDirty(false);
      if (!silencioso) {
        toast({
          title: t('reglas.toasts.guardadas'),
          description: nuevas.length
            ? t('reglas.toasts.guardadasDesc', { count: nuevas.length, n: n(nuevas.length), nombre: categoryName })
            : t('reglas.toasts.sinReglasDesc', { nombre: categoryName }),
        });
      }
      return nuevas;
    } catch (e) {
      toast({ title: t('reglas.toasts.noGuardar'), description: e instanceof Error ? e.message : t('comun.intentaDeNuevo'), variant: 'destructive' });
      return null;
    } finally {
      setGuardando(false);
    }
  };

  const previsualizar = async () => {
    setEvaluando(true);
    try {
      setVistaPrevia(await evaluateRules(organizationId, reglasTemporales()));
    } catch (e) {
      toast({ title: t('reglas.toasts.noVistaPrevia'), description: e instanceof Error ? e.message : t('comun.intentaDeNuevo'), variant: 'destructive' });
    } finally {
      setEvaluando(false);
    }
  };

  const aplicar = async () => {
    setAplicando(true);
    try {
      const nuevas = dirty ? await guardar(true) : guardadas;
      if (!nuevas) return;
      if (!nuevas.length) {
        toast({ title: t('reglas.toasts.sinReglas'), description: t('reglas.toasts.agregaUna') });
        return;
      }
      const r = await applyRules(categoryId, organizationId, nuevas);
      setResultado({ ...r, reglas: nuevas.length });
      onProductsAssigned?.(r);
      toast({
        title: t('reglas.asignados', { count: r.assigned, n: n(r.assigned), nombre: categoryName }),
        description: r.removed
          ? t('reglas.toasts.retirados', { n: n(r.removed) })
          : t('reglas.toasts.aplicadas', { count: nuevas.length, n: n(nuevas.length) }),
      });
      setEditando(false);
    } catch (e) {
      toast({ title: t('reglas.toasts.noAplicar'), description: e instanceof Error ? e.message : t('comun.intentaDeNuevo'), variant: 'destructive' });
    } finally {
      setAplicando(false);
    }
  };

  const opcionesValor = (campo: RuleField): { value: string; label: string }[] => {
    if (campo === 'supplier') return proveedores.map((s) => ({ value: String(s.id), label: s.name }));
    if (campo === 'tag') return etiquetas.map((e) => ({ value: String(e.id), label: e.name }));
    return (FIELD_OPTIONS[campo] || []).map((o) => ({ value: o.value, label: t(`reglas.opciones.${campo}.${o.value}`) }));
  };

  const incompletas = useMemo(() => rules.some(reglaIncompleta), [rules]);
  const titulo = guardadas.length ? t('reglas.tituloN', { n: n(guardadas.length) }) : t('reglas.titulo');

  const botonTexto = 'text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md';
  const boton = (primario?: boolean) =>
    cn(
      'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
      primario ? 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover' : 'border border-line-strong bg-surface text-fg hover:bg-hover',
    );

  return (
    <FormSection
      titulo={titulo}
      descripcion={t('reglas.descripcion')}
      accion={
        !cargando && !errorCarga && guardadas.length > 0 && !editando ? (
          <button type="button" className={botonTexto} onClick={() => setEditando(true)}>
            {t('reglas.editar')}
          </button>
        ) : editando && guardadas.length > 0 ? (
          <button
            type="button"
            className={botonTexto}
            onClick={() => {
              setRules(guardadas.map(aEntrada));
              setDirty(false);
              setVistaPrevia(null);
              setEditando(false);
            }}
          >
            {t('reglas.descartar')}
          </button>
        ) : undefined
      }
    >
      {cargando ? (
        <Skeleton className="h-20 w-full" />
      ) : errorCarga ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
          {t('reglas.errorCarga')}
          <button type="button" className={botonTexto} onClick={() => void cargar()}>
            {t('reglas.reintentar')}
          </button>
        </div>
      ) : !editando && guardadas.length > 0 ? (
        <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-sm">
          {guardadas.map((r, i) => (
            <div key={r.id} className="contents">
              <dt className="text-fg-secondary">
                {i === 0
                  ? t('reglas.primera')
                  : t('reglas.siguiente', { combinador: t(`reglas.combinador.${r.logic_combiner}`), n: i + 1 })}
              </dt>
              <dd className="text-fg">
                {t('reglas.resumen', {
                  campo: t(`reglas.campos.${r.field}`),
                  operador: t(`reglas.operadores.${r.operator}`).toLowerCase(),
                  valor: nombreValor(r),
                })}
              </dd>
            </div>
          ))}
          {resultado && (
            <>
              <dt className="text-fg-secondary">{t('reglas.ultimaAplicacion')}</dt>
              <dd className="text-fg">
                {t('reglas.nAsignados', { count: resultado.assigned, n: n(resultado.assigned) })}
                {resultado.removed ? ` · ${t('reglas.nRetirados', { n: n(resultado.removed) })}` : ''}
              </dd>
            </>
          )}
        </dl>
      ) : !editando ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line py-6 text-center">
          <Wand2 aria-hidden="true" className="size-6 text-fg-muted" strokeWidth={1.5} />
          <p className="text-sm text-fg-secondary">{t('reglas.vacio')}</p>
          <button type="button" onClick={agregar} className={cn(boton(), 'flex-none')}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reglas.agregarPrimera')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((regla, index) => {
            const tipo = FIELD_TYPES[regla.field];
            const operadores = OPERATORS_BY_TYPE[tipo] || [];
            const opciones = opcionesValor(regla.field);
            const idLista = `sugerencias-${regla.field}-${index}`;
            return (
              <div key={index} className="flex flex-col gap-2">
                {index > 0 && (
                  <div className="flex items-center gap-2 pl-1">
                    <Select value={regla.logic_combiner} onValueChange={(v) => actualizar(index, { logic_combiner: v as LogicCombiner })}>
                      <SelectTrigger className="h-8 w-20 text-xs" aria-label={t('reglas.comoSeUne', { n: index + 1 })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">{t('reglas.combinador.AND')}</SelectItem>
                        <SelectItem value="OR">{t('reglas.combinador.OR')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div className="grid grid-cols-1 items-end gap-2 rounded-lg border border-line bg-subtle p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <label className="flex flex-col gap-1 text-xs text-fg-secondary">
                    {t('reglas.campo')}
                    <Select value={regla.field} onValueChange={(v) => actualizar(index, { field: v as RuleField })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPOS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {t(`reglas.campos.${k}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-secondary">
                    {t('reglas.operador')}
                    <Select value={regla.operator} onValueChange={(v) => actualizar(index, { operator: v as RuleOperator })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operadores.map((op) => (
                          <SelectItem key={op} value={op}>
                            {t(`reglas.operadores.${op}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-secondary">
                    {t('reglas.valor')}
                    {tipo === 'select' && opciones.length > 0 ? (
                      <Select value={regla.value || ''} onValueChange={(v) => actualizar(index, { value: v })}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder={t('reglas.seleccionar')} />
                        </SelectTrigger>
                        <SelectContent>
                          {opciones.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <Input
                          type={tipo === 'number' ? 'number' : 'text'}
                          value={regla.value || ''}
                          onChange={(e) => actualizar(index, { value: e.target.value })}
                          placeholder={tipo === 'number' ? '0' : t('reglas.escribirOSeleccionar')}
                          className="h-9 text-sm"
                          list={sugerencias[regla.field]?.length ? idLista : undefined}
                        />
                        {sugerencias[regla.field]?.length ? (
                          <datalist id={idLista}>
                            {sugerencias[regla.field].slice(0, 50).map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        ) : null}
                      </>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => quitar(index)}
                    aria-label={t('reglas.quitar', { n: index + 1 })}
                    className="flex size-9 items-center justify-center rounded-lg text-fg-secondary hover:bg-danger-subtle hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}

          <button type="button" onClick={agregar} className={cn(boton(), 'w-full flex-none border-dashed')}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reglas.agregar')}
          </button>

          {vistaPrevia && (
            <div className="flex flex-col gap-2 rounded-lg border border-line-info bg-info-subtle p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-info-text">
                  <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('reglas.vistaPrevia')}
                </span>
                <span className="text-xs font-medium text-info-text">
                  {t('comun.nProductos', { count: vistaPrevia.length, n: n(vistaPrevia.length) })}
                </span>
              </div>
              {vistaPrevia.length > 0 ? (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {vistaPrevia.slice(0, 50).map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-xs text-fg-secondary">
                      <Package aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-fg-muted">{p.sku}</span>
                    </li>
                  ))}
                  {vistaPrevia.length > 50 && (
                    <li className="pt-1 text-xs text-fg-muted">{t('reglas.yMas', { n: n(vistaPrevia.length - 50) })}</li>
                  )}
                </ul>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-fg-secondary">
                  <AlertCircle aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  {t('reglas.ninguno')}
                </p>
              )}
            </div>
          )}

          {rules.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void previsualizar()}
                disabled={evaluando || incompletas}
                title={incompletas ? t('reglas.completaValores') : undefined}
                className={boton()}
              >
                {evaluando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                {t('reglas.vistaPrevia')}
              </button>
              <button type="button" onClick={() => void guardar()} disabled={guardando || !dirty} className={boton()}>
                {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                {t('reglas.guardar')}
              </button>
              <button
                type="button"
                onClick={() => void aplicar()}
                disabled={aplicando || incompletas}
                title={incompletas ? t('reglas.completaValores') : undefined}
                className={boton(true)}
              >
                {aplicando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                {t('reglas.aplicar')}
              </button>
            </div>
          )}
          {rules.length === 0 && dirty && (
            <button type="button" onClick={() => void guardar()} disabled={guardando} className={cn(boton(), 'flex-none')}>
              <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('reglas.guardarSinReglas')}
            </button>
          )}
        </div>
      )}

      {resultado && !editando && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-text" strokeWidth={1.5} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-medium text-fg">
              {t('reglas.asignados', { count: resultado.assigned, n: n(resultado.assigned), nombre: categoryName })}
            </p>
            <p className="text-[13px] text-fg-secondary">
              {t('reglas.toasts.aplicadas', { count: resultado.reglas, n: n(resultado.reglas) })}
              {resultado.removed ? ` ${t('reglas.yaNoCumplian', { n: n(resultado.removed) })}` : ''}
            </p>
            {onVerProductos && (
              <button type="button" className={cn(botonTexto, 'self-start text-[13px]')} onClick={onVerProductos}>
                {t('acciones.verProductos')}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label={t('reglas.cerrarAviso')}
            onClick={() => setResultado(null)}
            className="flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </FormSection>
  );
}
