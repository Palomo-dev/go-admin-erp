'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChefHat, ChevronDown, CircleAlert, History, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SegmentedControl } from '@/components/kit';
import {
  EditorReceta,
  SelectorAlcanceReceta,
  copiarReceta,
  estadoVariante,
  limpiarRecetasHuerfanas,
  recetaVacia,
  type ModoReceta,
  type RecetaBorrador,
  type RecetaForm,
} from '@/components/kit/receta';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { recipeService, type IngredienteOpcion } from '@/lib/services/recipeService';
import { cn } from '@/utils/Utils';
import { idsPropios } from '../../logica/formularioProducto';
import type { PropsSeccionFormulario } from '../tipos';

// Import diferido: el diálogo contiene el mismo ProductoForm (ciclo de módulos).
const ProductoFormDialog = dynamic(() => import('@/components/shared/form-dialogs/ProductoFormDialog'), { ssr: false });

/**
 * «Avanzado › Receta» (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2;
 * Figma F1–F9, 959-585580 … 963-174038): interruptor, cómo se descuenta el
 * inventario, alcance con variantes, editor de ingredientes y costo en vivo.
 *
 * La receta vive en el estado del formulario hasta «Guardar»; la de una
 * variante que aún no existe se indexa por su clave. Nada se escribe en la base
 * desde aquí, salvo lo que el usuario crea aparte a propósito (un ingrediente
 * nuevo o una conversión de unidades).
 */
const COMPARTIDA = '__compartida__';

export function SeccionReceta({
  estado,
  actualizar,
  errores,
  modo,
  catalogos,
  organizacionId,
  productId,
  moneda,
  ordenesAbiertasReceta = 0,
}: PropsSeccionFormulario) {
  const t = useTranslations('receta.formulario');
  const tErr = useTranslations('productoForm.errores');
  const { selectedBranchId } = useBranch();
  const fechas = useFormatDate();
  const r = estado.receta;
  const unidadProducto = estado.unit_code || 'UN';
  const rastrea = estado.track_stock && estado.product_type !== 'service';
  const variantes = useMemo(() => (estado.tiene_variantes ? estado.variantes : []), [estado.tiene_variantes, estado.variantes]);
  const clavesVariantes = useMemo(() => variantes.map((v) => v.clave), [variantes]);
  const excluirIds = useMemo(() => idsPropios(estado, productId), [estado, productId]);
  const [seleccion, setSeleccion] = useState<string>(COMPARTIDA);
  const [quitadas, setQuitadas] = useState(0);
  const [crearIngrediente, setCrearIngrediente] = useState<((op: IngredienteOpcion) => void) | null>(null);
  const recetaRef = useRef(r);
  recetaRef.current = r;

  const setReceta = useCallback((nueva: RecetaForm) => actualizar({ receta: nueva }), [actualizar]);

  const sucursal = useMemo(() => {
    const elegida = catalogos.sucursales.find((s) => s.branch_id === selectedBranchId);
    const s = elegida ?? catalogos.sucursales.find((x) => x.principal) ?? catalogos.sucursales[0];
    return { id: s?.branch_id ?? null, nombre: s?.nombre ?? null };
  }, [catalogos.sucursales, selectedBranchId]);

  // Variantes regeneradas: la receta de una clave que ya no existe se descarta con aviso.
  const firmaClaves = clavesVariantes.join('|');
  useEffect(() => {
    if (!estado.tiene_variantes) return;
    const { receta, quitadas: n } = limpiarRecetasHuerfanas(recetaRef.current, firmaClaves ? firmaClaves.split('|') : []);
    if (n > 0) {
      setReceta(receta);
      setQuitadas((q) => q + n);
    }
  }, [firmaClaves, estado.tiene_variantes, setReceta]);

  const porVariante = estado.tiene_variantes && r.alcance === 'por_variante';
  const seleccionValida = porVariante && seleccion !== COMPARTIDA && clavesVariantes.includes(seleccion) ? seleccion : COMPARTIDA;
  const varianteSel = variantes.find((v) => v.clave === seleccionValida) ?? null;
  const propiaSel = varianteSel ? r.porVariante[varianteSel.clave] ?? null : null;
  const nombreVariante = (clave: string) => variantes.find((v) => v.clave === clave)?.name || clave;

  const activar = (activa: boolean) => {
    const sinRecetas = !r.compartida && Object.keys(r.porVariante).length === 0;
    setReceta({ ...r, activa, compartida: activa && sinRecetas ? recetaVacia(unidadProducto) : r.compartida });
  };

  const cambiarCompartida = (b: RecetaBorrador) => setReceta({ ...r, compartida: b });
  const cambiarPropia = (clave: string, b: RecetaBorrador | null) => {
    const siguiente = { ...r.porVariante };
    if (b) siguiente[clave] = b;
    else delete siguiente[clave];
    setReceta({ ...r, porVariante: siguiente });
  };

  const fuentesCopia = useMemo(() => {
    const out: { clave: string; etiqueta: string; receta: RecetaBorrador }[] = [];
    if (r.compartida && r.compartida.ingredientes.length > 0) out.push({ clave: COMPARTIDA, etiqueta: t('laCompartida'), receta: r.compartida });
    for (const v of variantes) {
      const propia = r.porVariante[v.clave];
      if (propia && v.clave !== seleccionValida && propia.ingredientes.length > 0) out.push({ clave: v.clave, etiqueta: v.name || v.clave, receta: propia });
    }
    return out;
  }, [r.compartida, r.porVariante, variantes, seleccionValida, t]);

  const onCrearIngrediente = useCallback((_texto: string, agregar: (op: IngredienteOpcion) => void) => {
    setCrearIngrediente(() => agregar);
  }, []);

  const alCrearProducto = async (p: { id: number }) => {
    const agregar = crearIngrediente;
    setCrearIngrediente(null);
    if (!agregar) return;
    try {
      const op = await recipeService.ingredientePorId(organizacionId, p.id);
      if (op) agregar(op);
    } catch {
      // El producto ya quedó creado; se puede agregar desde el buscador.
    }
  };

  // Versión activa de la receta que se está editando (solo en editar).
  const borradorVisible = varianteSel ? propiaSel : r.compartida;
  const version = modo === 'editar' && borradorVisible?.version ? borradorVisible : null;

  const editor = (valor: RecetaBorrador, onCambio: (b: RecetaBorrador) => void, precio: number | null, titulo?: string) => (
    <EditorReceta
      idBase={`receta-${varianteSel?.clave ?? 'compartida'}`}
      valor={valor}
      onCambio={onCambio}
      organizacionId={organizacionId}
      sucursal={sucursal}
      unidades={catalogos.unidades}
      excluirIds={excluirIds}
      precioVenta={precio}
      formatearMoneda={(n) => moneda.formatear(n)}
      tituloIngredientes={titulo}
      onCrearIngrediente={onCrearIngrediente}
      lateral={<ComoSeGuarda modo={modo} porVariante={porVariante} />}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor="producto-receta" className="min-w-0 text-sm text-fg">
          {t('interruptor')}
          <span className="mt-0.5 block text-xs text-fg-muted">{t('interruptorAyuda')}</span>
        </label>
        <Switch
          id="producto-receta"
          checked={r.activa}
          onCheckedChange={activar}
          aria-invalid={errores.receta ? true : undefined}
          aria-describedby={errores.receta ? 'producto-receta-error' : undefined}
        />
      </div>

      {errores.receta && (
        <p id="producto-receta-error" role="alert" className="flex items-start gap-2 text-xs text-danger-text">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
          {tErr(errores.receta, { detalle: '' })}
        </p>
      )}

      {!r.activa ? null : (
        <>
          {version && (
            <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-xs text-info-text">
              <History aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              <span>
                {t('version', {
                  version: version.version ?? 1,
                  siguiente: (version.version ?? 1) + 1,
                  desde: version.desde ? fechas.formatDate(version.desde) : '—',
                })}{' '}
                {ordenesAbiertasReceta > 0 && t('ordenesAbiertas', { count: ordenesAbiertasReceta, version: version.version ?? 1 })}
              </span>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <p id="receta-modo-etiqueta" className="text-xs font-medium text-fg">
              {t('modoTitulo')}
            </p>
            <SegmentedControl<ModoReceta>
              aria-labelledby="receta-modo-etiqueta"
              opciones={[
                { valor: 'al_vender', etiqueta: t('alVender') },
                { valor: 'al_producir', etiqueta: t('alProducir') },
              ]}
              valor={r.modo}
              onValorChange={(modoReceta) => setReceta({ ...r, modo: modoReceta })}
              className="self-start"
            />
            <p className="flex items-start gap-2 rounded-lg bg-subtle p-3 text-xs text-fg-secondary">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {r.modo === 'al_vender' ? t('alVenderAyuda') : t('alProducirAyuda')}
            </p>
            {r.modo === 'al_producir' && !rastrea && (
              <p role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-warning-subtle p-3 text-xs text-warning-text">
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span>{estado.product_type === 'service' ? t('alProducirServicio') : t('alProducirSinInventario')}</span>
                {estado.product_type !== 'service' && (
                  <button type="button" onClick={() => actualizar({ track_stock: true })} className="font-medium text-link hover:underline">
                    {t('activarInventario')}
                  </button>
                )}
              </p>
            )}
          </div>

          {estado.tiene_variantes && (
            <SelectorAlcanceReceta
              alcance={r.alcance}
              onAlcanceChange={(alcance) => setReceta({ ...r, alcance })}
              variantes={variantes.map((v) => ({ clave: v.clave, nombre: v.name || v.clave, estado: estadoVariante(r, v.clave, excluirIds) }))}
            />
          )}
          {estado.tiene_variantes && r.alcance === 'compartida' && Object.keys(r.porVariante).length > 0 && (
            <p className="flex items-start gap-2 text-xs text-warning-text">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {t('propiasSeDesactivan', { count: Object.keys(r.porVariante).length })}
            </p>
          )}
          {quitadas > 0 && (
            <p role="status" className="flex items-start gap-2 text-xs text-warning-text">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {t('huerfanasQuitadas', { count: quitadas })}
            </p>
          )}

          {porVariante && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('recetaDe')}>
              <span className="mr-1 text-xs font-medium text-fg">{t('recetaDe')}</span>
              {[{ clave: COMPARTIDA, etiqueta: t('compartida') }, ...variantes.map((v) => ({ clave: v.clave, etiqueta: v.name || v.clave }))].map((op) => {
                const estadoV = op.clave === COMPARTIDA ? null : estadoVariante(r, op.clave, excluirIds);
                const activa = seleccionValida === op.clave;
                return (
                  <button
                    key={op.clave}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => setSeleccion(op.clave)}
                    className={cn(
                      'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      activa ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                      estadoV === 'con_errores' && !activa && 'text-danger-text',
                    )}
                  >
                    {estadoV ? t('chipVariante', { nombre: op.etiqueta, estado: t(`estadoVariante.${estadoV}`) }) : op.etiqueta}
                  </button>
                );
              })}
            </div>
          )}

          {!varianteSel ? (
            editor(r.compartida ?? recetaVacia(unidadProducto), cambiarCompartida, estado.price, porVariante ? t('ingredientesCompartida') : undefined)
          ) : propiaSel ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => cambiarPropia(varianteSel.clave, null)}
                  className="h-8 rounded-lg px-3 text-xs font-medium text-fg-secondary hover:bg-hover hover:text-fg"
                >
                  {t('usarCompartida')}
                </button>
                <MenuCopiar
                  fuentes={fuentesCopia}
                  etiqueta={t('copiarDe')}
                  onElegir={(b) => cambiarPropia(varianteSel.clave, copiarReceta(b))}
                />
              </div>
              {editor(
                propiaSel,
                (b) => cambiarPropia(varianteSel.clave, b),
                varianteSel.price ?? estado.price,
                t('ingredientesDe', { nombre: nombreVariante(varianteSel.clave), count: propiaSel.ingredientes.length }),
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-4">
              <p className="flex items-center gap-2 text-sm text-fg">
                <ChefHat aria-hidden className="size-4 text-fg-muted" strokeWidth={1.5} />
                {r.compartida && r.compartida.ingredientes.length > 0
                  ? t('usaLaCompartida', { nombre: nombreVariante(varianteSel.clave) })
                  : t('sinRecetaVariante', { nombre: nombreVariante(varianteSel.clave) })}
              </p>
              <div className="flex flex-wrap gap-2">
                {r.compartida && r.compartida.ingredientes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => cambiarPropia(varianteSel.clave, copiarReceta(r.compartida as RecetaBorrador))}
                    className="h-9 rounded-lg bg-brand-tint px-3 text-sm font-medium text-brand-deep hover:bg-brand-tint-hover"
                  >
                    {t('copiarCompartida')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => cambiarPropia(varianteSel.clave, recetaVacia(unidadProducto))}
                  className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover"
                >
                  {t('crearPropia')}
                </button>
                <MenuCopiar
                  fuentes={fuentesCopia.filter((f) => f.clave !== COMPARTIDA)}
                  etiqueta={t('copiarDe')}
                  onElegir={(b) => cambiarPropia(varianteSel.clave, copiarReceta(b))}
                />
              </div>
            </div>
          )}
        </>
      )}

      {crearIngrediente && (
        <ProductoFormDialog
          open
          onOpenChange={(abierto) => !abierto && setCrearIngrediente(null)}
          onCreated={(p) => void alCrearProducto(p)}
        />
      )}
    </div>
  );
}

function MenuCopiar({
  fuentes,
  etiqueta,
  onElegir,
}: {
  fuentes: { clave: string; etiqueta: string; receta: RecetaBorrador }[];
  etiqueta: string;
  onElegir: (b: RecetaBorrador) => void;
}) {
  if (fuentes.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {etiqueta}
          <ChevronDown aria-hidden className="size-3.5" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {fuentes.map((f) => (
          <DropdownMenuItem key={f.clave} onSelect={() => onElegir(f.receta)}>
            {f.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComoSeGuarda({ modo, porVariante }: { modo: PropsSeccionFormulario['modo']; porVariante: boolean }) {
  const t = useTranslations('receta.formulario.comoSeGuarda');
  const puntos =
    modo === 'editar'
      ? [t('editarSinCambio'), t('editarAlProducir'), t('editarVersiones')]
      : [t('crearBorrador'), ...(porVariante ? [t('crearVariantes')] : []), t('crearUnaOperacion'), t('crearReintento')];
  return (
    <aside className="flex flex-col gap-2 rounded-xl bg-subtle p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <ShieldCheck aria-hidden className="size-4 text-fg-muted" strokeWidth={1.5} />
        {t('titulo')}
      </h4>
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs text-fg-secondary">
        {puntos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </aside>
  );
}
