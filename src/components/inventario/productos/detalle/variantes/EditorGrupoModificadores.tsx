'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';

/**
 * Editor presentacional de un grupo de modificadores (Figma «Producto —
 * Modificadores»): nombre, modo Única/Múltiple, Obligatorio, mín./máx. de
 * selecciones, opciones con precio extra («Gratis» si es 0), activa,
 * reordenar con ↑/↓ y quitar; sugerencias con los valores de las variantes.
 * No sabe de la base: el detalle persiste cada cambio al instante
 * (`ProductModifiersService`) y el formulario lo guarda en su estado.
 *
 * Los textos y números se confirman al salir del campo (o con Enter), para
 * que el detalle no escriba en cada tecla.
 */
export type ModoSeleccion = 'single' | 'multiple';

export interface OpcionEditable {
  clave: string;
  name: string;
  extra_price: number | null;
  is_active: boolean;
}

export interface GrupoEditable {
  clave: string;
  name: string;
  selection_mode: ModoSeleccion;
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  opciones: OpcionEditable[];
}

export type CambioGrupo = Partial<Pick<GrupoEditable, 'name' | 'selection_mode' | 'min_selections' | 'max_selections' | 'required'>>;
export type CambioOpcion = Partial<Pick<OpcionEditable, 'name' | 'extra_price' | 'is_active'>>;

export interface MonedaEditor {
  simbolo: string;
  decimales: number;
  formatear: (valor: number | string | null | undefined) => string;
}

/** Cambio de modo: Única deja máx. 1 (y mín. ≤ 1); Múltiple quita el tope de 1. */
export function cambioPorModo(grupo: Pick<GrupoEditable, 'min_selections' | 'max_selections'>, modo: ModoSeleccion): CambioGrupo {
  if (modo === 'single') return { selection_mode: 'single', max_selections: 1, min_selections: Math.min(grupo.min_selections, 1) };
  return { selection_mode: 'multiple', max_selections: grupo.max_selections === 1 ? null : grupo.max_selections };
}

/** Mueve un elemento una posición (−1 arriba, +1 abajo); devuelve la lista nueva o null si no se puede. */
export function mover<T>(lista: readonly T[], indice: number, dir: -1 | 1): T[] | null {
  const destino = indice + dir;
  if (indice < 0 || destino < 0 || destino >= lista.length) return null;
  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

// ── Campos con confirmación al salir ─────────────────────────────────────

function TextoDiferido({
  valor,
  onConfirmar,
  permitirVacio = false,
  className,
  ...resto
}: {
  valor: string;
  onConfirmar: (valor: string) => void;
  permitirVacio?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const confirmar = () => {
    const limpio = texto.trim();
    if (!limpio && !permitirVacio) {
      setTexto(valor);
      return;
    }
    if (limpio !== valor.trim()) onConfirmar(limpio);
  };
  return (
    <Input
      {...resto}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') setTexto(valor);
      }}
      className={className}
    />
  );
}

function NumeroDiferido({
  valor,
  onConfirmar,
  validar,
  ...resto
}: {
  valor: number | null;
  onConfirmar: (valor: number | null) => void;
  /** Devuelve un mensaje si el valor no sirve (no se confirma). */
  validar?: (valor: number | null) => string | null;
  prefijo?: string;
  decimales?: number;
  minimo?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [borrador, setBorrador] = useState<number | null>(valor);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setBorrador(valor), [valor]);
  return (
    <div className="flex flex-col gap-1">
      <CampoNumero
        {...resto}
        tamano="sm"
        valor={borrador}
        onValorChange={setBorrador}
        aria-invalid={error ? true : undefined}
        onBlur={() => {
          const e = validar?.(borrador) ?? null;
          setError(e);
          if (e) return;
          if (borrador !== valor) onConfirmar(borrador);
        }}
      />
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </div>
  );
}

const BOTON_ICONO =
  'flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40';

// ── Grupo ──────────────────────────────────────────────────────────────────

export interface EditorGrupoModificadoresProps {
  grupo: GrupoEditable;
  indice: number;
  total: number;
  moneda: MonedaEditor;
  /** Valores de variantes para reutilizar como opción. */
  sugerencias: readonly string[];
  deshabilitado?: boolean;
  /** Por qué está deshabilitado (sin permiso). */
  motivo?: string;
  /** Operación en curso sobre este grupo. */
  ocupado?: boolean;
  /** Error de validación del grupo (formulario). */
  error?: string | null;
  onCambiarGrupo: (cambio: CambioGrupo) => void;
  onMoverGrupo?: (dir: -1 | 1) => void;
  onEliminarGrupo: () => void;
  /** Devuelve true si la opción quedó agregada (limpia los campos). */
  onAgregarOpcion: (nombre: string, precio: number) => boolean | Promise<boolean>;
  onCambiarOpcion: (clave: string, cambio: CambioOpcion) => void;
  onMoverOpcion: (clave: string, dir: -1 | 1) => void;
  onEliminarOpcion: (clave: string) => void;
}

export function EditorGrupoModificadores({
  grupo,
  indice,
  total,
  moneda,
  sugerencias,
  deshabilitado,
  motivo,
  ocupado,
  error,
  onCambiarGrupo,
  onMoverGrupo,
  onEliminarGrupo,
  onAgregarOpcion,
  onCambiarOpcion,
  onMoverOpcion,
  onEliminarOpcion,
}: EditorGrupoModificadoresProps) {
  const t = useTranslations('productoDetalle.modificadores.editor');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState<number | null>(null);
  const [agregando, setAgregando] = useState(false);
  const bloqueado = !!deshabilitado || !!ocupado;
  const titulo = deshabilitado ? motivo : undefined;

  const libres = sugerencias.filter(
    (s) => !grupo.opciones.some((o) => o.name.trim().toLowerCase() === s.trim().toLowerCase()),
  );

  const agregar = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setAgregando(true);
    try {
      const ok = await onAgregarOpcion(nombre, nuevoPrecio ?? 0);
      if (ok) {
        setNuevoNombre('');
        setNuevoPrecio(null);
      }
    } finally {
      setAgregando(false);
    }
  };

  const validarMax = (v: number | null) => (v !== null && v < grupo.min_selections ? t('errorMinMax') : null);
  const validarMin = (v: number | null) =>
    v !== null && grupo.max_selections !== null && v > grupo.max_selections ? t('errorMinMax') : null;

  return (
    <section
      className={cn('flex flex-col gap-3 rounded-xl border bg-surface p-4', error ? 'border-danger' : 'border-line')}
      aria-label={t('grupoDe', { nombre: grupo.name })}
    >
      {/* Cabecera del grupo */}
      <div className="flex flex-wrap items-center gap-2">
        {onMoverGrupo && (
          <div className="flex shrink-0">
            <button type="button" className={BOTON_ICONO} disabled={bloqueado || indice === 0} onClick={() => onMoverGrupo(-1)} aria-label={t('subirGrupo')} title={t('subirGrupo')}>
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
            <button type="button" className={BOTON_ICONO} disabled={bloqueado || indice === total - 1} onClick={() => onMoverGrupo(1)} aria-label={t('bajarGrupo')} title={t('bajarGrupo')}>
              <ArrowDown aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
        <TextoDiferido
          valor={grupo.name}
          onConfirmar={(name) => onCambiarGrupo({ name })}
          permitirVacio={false}
          disabled={bloqueado}
          aria-label={t('nombreGrupo')}
          placeholder={t('nombreGrupoPlaceholder')}
          className="h-9 min-w-0 flex-1 basis-40 font-semibold"
        />
        <Select value={grupo.selection_mode} onValueChange={(v) => onCambiarGrupo(cambioPorModo(grupo, v as ModoSeleccion))} disabled={bloqueado}>
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t('modo')} title={titulo}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">{t('modoUnica')}</SelectItem>
            <SelectItem value="multiple">{t('modoMultiple')}</SelectItem>
          </SelectContent>
        </Select>
        <label className="inline-flex items-center gap-2 text-sm text-fg-secondary" title={titulo}>
          <Switch checked={grupo.required} onCheckedChange={(required) => onCambiarGrupo({ required })} disabled={bloqueado} />
          {t('obligatorio')}
        </label>
        <div className="flex items-start gap-2">
          <span className="pt-2 text-xs text-fg-secondary">{t('min')}</span>
          <NumeroDiferido
            valor={grupo.min_selections}
            onConfirmar={(v) => onCambiarGrupo({ min_selections: v ?? 0 })}
            validar={validarMin}
            decimales={0}
            minimo={0}
            disabled={bloqueado}
            aria-label={t('minSelecciones')}
            className="w-16"
          />
          <span className="pt-2 text-xs text-fg-secondary">{t('max')}</span>
          <NumeroDiferido
            valor={grupo.max_selections}
            onConfirmar={(v) => onCambiarGrupo({ max_selections: v })}
            validar={validarMax}
            decimales={0}
            minimo={0}
            placeholder="∞"
            disabled={bloqueado || grupo.selection_mode === 'single'}
            aria-label={t('maxSelecciones')}
            className="w-16"
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          {ocupado && <Loader2 aria-label={t('guardando')} className="size-4 animate-spin text-fg-muted" />}
          <button
            type="button"
            className={cn(BOTON_ICONO, 'text-danger-text hover:text-danger-text')}
            disabled={bloqueado}
            onClick={onEliminarGrupo}
            aria-label={t('eliminarGrupo', { nombre: grupo.name })}
            title={titulo ?? t('eliminarGrupo', { nombre: grupo.name })}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}

      {/* Opciones */}
      {grupo.opciones.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('sinOpciones')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {grupo.opciones.map((o, i) => {
            const gratis = !o.extra_price;
            return (
              <li key={o.clave} className="flex flex-wrap items-center gap-2 py-2">
                <TextoDiferido
                  valor={o.name}
                  onConfirmar={(name) => onCambiarOpcion(o.clave, { name })}
                  disabled={bloqueado}
                  aria-label={t('nombreOpcion')}
                  className={cn('h-9 min-w-0 flex-1 basis-40', !o.is_active && 'text-fg-muted line-through')}
                />
                <NumeroDiferido
                  valor={o.extra_price}
                  onConfirmar={(v) => onCambiarOpcion(o.clave, { extra_price: v ?? 0 })}
                  prefijo={moneda.simbolo}
                  decimales={moneda.decimales}
                  minimo={0}
                  placeholder="0"
                  disabled={bloqueado}
                  aria-label={t('precioOpcion', { nombre: o.name })}
                  className="w-32"
                />
                <span className={cn('w-20 text-xs', gratis ? 'text-fg-muted' : 'font-medium text-success-text')}>
                  {gratis ? t('gratis') : t('extra', { precio: moneda.formatear(o.extra_price) })}
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs text-fg-secondary">
                  <Switch
                    checked={o.is_active}
                    onCheckedChange={(is_active) => onCambiarOpcion(o.clave, { is_active })}
                    disabled={bloqueado}
                    aria-label={t('activaDe', { nombre: o.name })}
                  />
                  <span className="sr-only sm:not-sr-only">{o.is_active ? t('activa') : t('inactiva')}</span>
                </label>
                <div className="ml-auto flex">
                  <button type="button" className={BOTON_ICONO} disabled={bloqueado || i === 0} onClick={() => onMoverOpcion(o.clave, -1)} aria-label={t('subirOpcion', { nombre: o.name })} title={t('subir')}>
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={BOTON_ICONO}
                    disabled={bloqueado || i === grupo.opciones.length - 1}
                    onClick={() => onMoverOpcion(o.clave, 1)}
                    aria-label={t('bajarOpcion', { nombre: o.name })}
                    title={t('bajar')}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={cn(BOTON_ICONO, 'text-danger-text hover:text-danger-text')}
                    disabled={bloqueado}
                    onClick={() => onEliminarOpcion(o.clave)}
                    aria-label={t('eliminarOpcion', { nombre: o.name })}
                    title={titulo ?? t('eliminarOpcion', { nombre: o.name })}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {libres.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{t('sugerencias')}</span>
          <div className="flex flex-wrap gap-1.5">
            {libres.map((s) => (
              <button
                key={s}
                type="button"
                disabled={bloqueado}
                aria-pressed={nuevoNombre === s}
                onClick={() => setNuevoNombre(s)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
                  nuevoNombre === s ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-subtle text-fg-secondary hover:bg-hover',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nueva opción */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void agregar();
            }
          }}
          placeholder={t('nuevaOpcion')}
          aria-label={t('nuevaOpcion')}
          disabled={bloqueado || agregando}
          className="h-9 min-w-0 flex-1 basis-40"
        />
        <div className="w-32">
          <CampoNumero
            tamano="sm"
            valor={nuevoPrecio}
            onValorChange={setNuevoPrecio}
            prefijo={moneda.simbolo}
            decimales={moneda.decimales}
            minimo={0}
            placeholder={t('precioExtra')}
            aria-label={t('precioExtra')}
            disabled={bloqueado || agregando}
          />
        </div>
        <Button type="button" size="sm" className="h-9" onClick={() => void agregar()} disabled={bloqueado || agregando || !nuevoNombre.trim()} title={titulo}>
          {agregando ? <Loader2 aria-hidden="true" className="mr-1 size-4 animate-spin" /> : <Plus aria-hidden="true" className="mr-1 size-4" />}
          {t('anadir')}
        </Button>
      </div>
    </section>
  );
}

// ── Nuevo grupo ────────────────────────────────────────────────────────────

export interface NuevoGrupoModificadoresProps {
  /** Nombres de grupos de la organización para reutilizar (ya filtrados). */
  existentes: readonly string[];
  /** Devuelve true si el grupo quedó creado (limpia los campos). */
  onCrear: (nombre: string, modo: ModoSeleccion) => boolean | Promise<boolean>;
  deshabilitado?: boolean;
  motivo?: string;
}

export function NuevoGrupoModificadores({ existentes, onCrear, deshabilitado, motivo }: NuevoGrupoModificadoresProps) {
  const t = useTranslations('productoDetalle.modificadores.editor');
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState<ModoSeleccion>('multiple');
  const [creando, setCreando] = useState(false);

  const crear = async () => {
    const limpio = nombre.trim();
    if (!limpio) return;
    setCreando(true);
    try {
      if (await onCrear(limpio, modo)) {
        setNombre('');
        setModo('multiple');
      }
    } finally {
      setCreando(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-surface p-4" aria-labelledby="nuevo-grupo-mod">
      <h3 id="nuevo-grupo-mod" className="text-sm font-semibold text-fg">
        {t('nuevoGrupo')}
      </h3>
      {existentes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{t('gruposExistentes')}</span>
          <div className="flex flex-wrap gap-1.5">
            {existentes.map((n) => (
              <button
                key={n}
                type="button"
                disabled={deshabilitado || creando}
                aria-pressed={nombre === n}
                onClick={() => setNombre(n)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
                  nombre === n ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-subtle text-fg-secondary hover:bg-hover',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void crear();
            }
          }}
          placeholder={t('nombreNuevoGrupo')}
          aria-label={t('nombreNuevoGrupo')}
          disabled={deshabilitado || creando}
          className="h-10 min-w-0 flex-1"
        />
        <Select value={modo} onValueChange={(v) => setModo(v as ModoSeleccion)} disabled={deshabilitado || creando}>
          <SelectTrigger className="h-10 w-full sm:w-48" aria-label={t('modo')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">{t('modoUnica')}</SelectItem>
            <SelectItem value="multiple">{t('modoMultiple')}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" onClick={() => void crear()} disabled={deshabilitado || creando || !nombre.trim()} title={deshabilitado ? motivo : undefined} className="h-10">
          {creando ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : <Plus aria-hidden="true" className="mr-2 size-4" />}
          {t('agregarGrupo')}
        </Button>
      </div>
    </section>
  );
}
