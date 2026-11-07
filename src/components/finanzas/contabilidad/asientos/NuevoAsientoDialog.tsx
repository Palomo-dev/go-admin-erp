'use client';

/**
 * «Nuevo asiento» (Figma `983:66317` cuadra · `983:66555` no cuadra ·
 * `983:66763` periodo cerrado · `983:66972` vacío · `983:67167` publicado;
 * móvil `989:75546` y `989:75770`).
 *
 * Guarda por `ContabilidadService.crearAsiento` → `fn_asiento_manual_crear`,
 * que vuelve a validar en la base partida doble, cuentas de detalle, periodo
 * y permiso. «Guardar borrador» crea con `publicar=false`; «Publicar», con
 * `publicar=true` en la misma transacción. Las validaciones de pantalla son las
 * que ya tenía la página anterior (`asientosLogica.validarAlta`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { AvisoTonal, CampoFecha, CampoNumero, Dialogo, FormField, SelectorCuenta, clasesBoton, type OpcionCuenta } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { esCuentaDeTitulo } from '@/lib/finanzas/cuentasTitulo';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';
import {
  cambiarCentro,
  cambiarCuenta,
  cambiarImporte,
  cuadreFormulario,
  lineaVacia,
  lineasParaGuardar,
  modoCentro,
  validarAlta,
  type ErrorAlta,
  type LineaFormulario,
} from '@/lib/finanzas/contabilidad/asientosLogica';
import { cn } from '@/lib/utils';
import { BarraCuadre, EstadoPeriodo } from '../piezas';
import { CampoTerceroAsiento } from '../CampoTerceroAsiento';
import {
  ContabilidadService,
  cuentaRetencionExigeNit,
  lineasSinTerceroParaContabilizar,
  type ChartAccount,
  type JournalEntry,
} from '../ContabilidadService';

const CLASE_SELECT = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';

export interface NuevoAsientoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Plan activo de la organización (el diálogo ofrece solo las de movimiento). */
  cuentas: readonly ChartAccount[];
  centros: readonly { id: string; code: string; name: string }[];
  distribuciones: readonly { id: string; nombre: string }[];
  onCreado: (asiento: JournalEntry, publicado: boolean) => void;
}

interface FormData {
  entry_date: string;
  memo: string;
  sucursalId: number | null;
  lines: LineaFormulario[];
}

export function NuevoAsientoDialog({ abierto, onAbiertoChange, cuentas, centros, distribuciones, onCreado }: NuevoAsientoDialogProps) {
  const t = useTranslations('finanzasContabilidadR3.asientos.nuevo');
  const locale = useLocale();
  const { formatear, decimals } = useMonedaOrganizacion();
  const { branches, selectedBranchId } = useBranch();
  const [formData, setFormData] = useState<FormData>(() => ({
    entry_date: '',
    memo: '',
    sucursalId: selectedBranchId ?? null,
    lines: [lineaVacia(), lineaVacia()],
  }));
  // El día del asiento es el de SU sucursal: con la sucursal elegida cambia la zona.
  const { getToday, toInstant } = useFormatDate(formData.sucursalId);
  const [centroDefecto, setCentroDefecto] = useState('');
  const [periodoAbierto, setPeriodoAbierto] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState<'borrador' | 'publicar' | null>(null);
  const [intentado, setIntentado] = useState(false);

  // Al abrir: fecha de hoy de la sucursal, y la sucursal activa del header si la hay.
  const unicaSucursal = branches.length === 1 ? branches[0].id : null;
  const hoy = getToday();
  useEffect(() => {
    if (!abierto) return;
    setIntentado(false);
    setFormData((prev) => {
      const entry_date = prev.entry_date || hoy;
      const sucursalId: number | null = prev.sucursalId ?? selectedBranchId ?? unicaSucursal ?? null;
      return entry_date === prev.entry_date && sucursalId === prev.sucursalId ? prev : { ...prev, entry_date, sucursalId };
    });
  }, [abierto, hoy, selectedBranchId, unicaSucursal]);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    ContabilidadService.defectoCentroSucursal(formData.sucursalId)
      .then((c) => vigente && setCentroDefecto(c ?? ''))
      .catch(() => vigente && setCentroDefecto(''));
    return () => {
      vigente = false;
    };
  }, [abierto, formData.sucursalId]);

  useEffect(() => {
    if (!abierto || !formData.entry_date) return;
    let vigente = true;
    setPeriodoAbierto(null);
    ContabilidadService.periodoAbierto(formData.entry_date)
      .then((v) => vigente && setPeriodoAbierto(v))
      .catch(() => vigente && setPeriodoAbierto(null));
    return () => {
      vigente = false;
    };
  }, [abierto, formData.entry_date]);

  const cuentasMovimiento = useMemo(() => cuentas.filter((c) => esCuentaDeMovimiento(c, cuentas)), [cuentas]);
  const buscarCuenta = useMemo(
    () => async (texto: string, desde: number) => {
      const q = texto.trim().toLowerCase();
      const todas = q
        ? cuentasMovimiento.filter((c) => c.account_code.startsWith(q) || c.name.toLowerCase().includes(q))
        : cuentasMovimiento;
      return { items: todas.slice(desde, desde + 50).map((c) => ({ account_code: c.account_code, name: c.name })), total: todas.length };
    },
    [cuentasMovimiento],
  );

  const cuentaDe = (codigo: string) => cuentas.find((c) => c.account_code === codigo);
  const validacion = validarAlta({
    fecha: formData.entry_date,
    sucursalId: formData.sucursalId,
    descripcion: formData.memo,
    lineas: formData.lines,
    cuentas,
    hayCentros: centros.length > 0,
    esTitulo: (codigo) => esCuentaDeTitulo({ account_code: codigo }, cuentas),
    sinTercero: (lineas) => lineasSinTerceroParaContabilizar(lineas, (codigo) => !!cuentaDe(codigo)?.requiere_tercero),
    periodoAbierto,
  });
  const cuadre = cuadreFormulario(formData.lines);

  const textoError = (e: ErrorAlta): string => {
    switch (e.codigo) {
      case 'cuentaTitulo':
        return t('errores.cuentaTitulo', { cuenta: e.cuenta });
      case 'centroObligatorio':
        return t('errores.centroObligatorio', { cuenta: e.cuenta });
      default:
        return t(`errores.${e.codigo}`);
    }
  };

  const reiniciar = () => {
    setFormData({ entry_date: getToday(), memo: '', sucursalId: formData.sucursalId, lines: [lineaVacia(), lineaVacia()] });
    setIntentado(false);
  };

  const cambiarLinea = (indice: number, cambio: (l: LineaFormulario) => LineaFormulario) =>
    setFormData((prev) => ({ ...prev, lines: prev.lines.map((l, i) => (i === indice ? cambio(l) : l)) }));
  const agregarLinea = () => setFormData((prev) => ({ ...prev, lines: [...prev.lines, lineaVacia()] }));
  const quitarLinea = (indice: number) =>
    setFormData((prev) => (prev.lines.length <= 2 ? prev : { ...prev, lines: prev.lines.filter((_, i) => i !== indice) }));

  const guardar = async (publicar: boolean) => {
    setIntentado(true);
    // La base exige partida doble y periodo abierto también al borrador; el
    // tercero, solo al publicar (como antes: el borrador se guarda con aviso).
    if (validacion.error) {
      toast.error(textoError(validacion.error));
      return;
    }
    if (publicar && validacion.faltaTercero.length > 0) {
      toast.error(t('errores.faltaTercero', { cuentas: validacion.faltaTercero.join(', ') }));
      return;
    }
    if (!publicar && validacion.faltaTercero.length > 0) {
      toast.warning(t('avisoTercero', { cuentas: validacion.faltaTercero.join(', ') }));
    }
    setGuardando(publicar ? 'publicar' : 'borrador');
    try {
      const creado = await ContabilidadService.crearAsiento(
        {
          // Día calendario de la sucursal → instante con su offset real.
          entry_date: toInstant(formData.entry_date),
          memo: formData.memo,
          lines: lineasParaGuardar(validacion.lineasValidas),
        },
        formData.sucursalId,
        publicar,
      );
      reiniciar();
      onCreado(creado, publicar);
    } catch (error) {
      console.error('Error creando asiento:', error);
      toast.error(error instanceof Error ? error.message : t('errores.guardar'));
    } finally {
      setGuardando(null);
    }
  };

  const motivoPublicar = cuadre.vacio || !cuadre.cuadra ? t('pie.publicarSiCuadra') : periodoAbierto === false ? t('errores.periodoCerrado') : undefined;
  const mesPeriodo = formData.entry_date
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${formData.entry_date.slice(0, 7)}-15T12:00:00Z`))
    : '';
  const errorVisible = intentado && validacion.error ? textoError(validacion.error) : null;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={BookOpen}
      ancho={1024}
      pie={t('pie.nota')}
      secundarios={[
        {
          etiqueta: t('pie.borrador'),
          onClick: () => void guardar(false),
          cargando: guardando === 'borrador',
          deshabilitada: !!guardando,
        },
      ]}
      primario={{
        etiqueta: t('pie.publicar'),
        onClick: () => void guardar(true),
        cargando: guardando === 'publicar',
        deshabilitada: !!motivoPublicar || !!guardando,
        motivo: motivoPublicar,
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <FormField etiqueta={t('fecha')} obligatorio>
          <CampoFecha valor={formData.entry_date} hoy={getToday()} onValorChange={(dia) => setFormData((p) => ({ ...p, entry_date: dia }))} required />
        </FormField>
        <FormField etiqueta={t('sucursal')} obligatorio error={intentado && !formData.sucursalId ? t('errores.sucursalRequerida') : null}>
          <select
            value={formData.sucursalId ?? ''}
            onChange={(e) => setFormData((p) => ({ ...p, sucursalId: e.target.value ? Number(e.target.value) : null }))}
            className={CLASE_SELECT}
          >
            <option value="">{t('sucursalElegir')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-secondary">{t('periodo')}</span>
          <span className="flex h-10 items-center gap-2 rounded-lg border border-line bg-subtle px-3 text-sm text-fg">
            <span className="capitalize">{mesPeriodo || '—'}</span>
            {periodoAbierto !== null && <EstadoPeriodo status={periodoAbierto ? 'open' : 'closed'} />}
          </span>
        </div>
      </div>

      {periodoAbierto === false && (
        <AvisoTonal tono="peligro" rol="alert" titulo={t('periodoCerrado.titulo', { mes: mesPeriodo })} descripcion={t('periodoCerrado.descripcion')} />
      )}

      <FormField etiqueta={t('descripcionCampo')} obligatorio error={intentado && !formData.memo.trim() ? t('errores.descripcionRequerida') : null}>
        <Input value={formData.memo} maxLength={300} placeholder={t('descripcionPlaceholder')} onChange={(e) => setFormData((p) => ({ ...p, memo: e.target.value }))} />
      </FormField>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">{t('lineas')}</h3>
        <span className="text-xs text-fg-secondary">{t('lineasAyuda')}</span>
      </div>

      <div className="rounded-xl border border-line">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_8rem_8rem_2.5rem] gap-2 bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary lg:grid">
          <span>{t('columnas.cuenta')}</span>
          <span>{t('columnas.descripcion')}</span>
          <span>{t('columnas.centro')}</span>
          <span className="text-right">{t('columnas.debito')}</span>
          <span className="text-right">{t('columnas.credito')}</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {formData.lines.map((linea, indice) => {
            const n = indice + 1;
            const cuenta = cuentaDe(linea.account_code);
            const modo = modoCentro(cuenta);
            const valorCuenta: OpcionCuenta | null = cuenta ? { account_code: cuenta.account_code, name: cuenta.name } : null;
            return (
              <li key={linea.clave} className="space-y-2 p-3" aria-label={t('lineaN', { n })}>
                <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_8rem_8rem_2.5rem] lg:items-start">
                  <SelectorCuenta
                    etiqueta={t('linea.cuenta', { n })}
                    valor={valorCuenta}
                    buscar={buscarCuenta}
                    onCambiar={(c) => cambiarLinea(indice, (l) => cambiarCuenta(l, cuentaDe(c.account_code), centroDefecto))}
                  />
                  <Input
                    aria-label={t('linea.descripcion', { n })}
                    placeholder={t('columnas.descripcion')}
                    value={linea.description}
                    onChange={(e) => cambiarLinea(indice, (l) => ({ ...l, description: e.target.value }))}
                  />
                  <select
                    aria-label={t('linea.centro', { n })}
                    value={linea.cost_center_id}
                    disabled={modo === 'no_aplica' || centros.length === 0}
                    onChange={(e) => cambiarLinea(indice, (l) => cambiarCentro(l, 'cost_center_id', e.target.value))}
                    className={cn(CLASE_SELECT, 'disabled:opacity-60')}
                  >
                    <option value="">{modo === 'obligatorio' ? t('linea.centroObligatorio') : t('linea.centroOpcional')}</option>
                    {centros.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} · {cc.name}
                      </option>
                    ))}
                  </select>
                  <CampoNumero
                    aria-label={t('linea.debito', { n })}
                    placeholder="0"
                    valor={linea.debit}
                    decimales={decimals}
                    minimo={0}
                    alinear="derecha"
                    onValorChange={(v) => cambiarLinea(indice, (l) => cambiarImporte(l, 'debit', v))}
                  />
                  <CampoNumero
                    aria-label={t('linea.credito', { n })}
                    placeholder="0"
                    valor={linea.credit}
                    decimales={decimals}
                    minimo={0}
                    alinear="derecha"
                    onValorChange={(v) => cambiarLinea(indice, (l) => cambiarImporte(l, 'credit', v))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && indice === formData.lines.length - 1) {
                        e.preventDefault();
                        agregarLinea();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => quitarLinea(indice)}
                    disabled={formData.lines.length <= 2}
                    aria-label={t('linea.quitar', { n })}
                    className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'justify-self-end disabled:opacity-40 lg:mt-1' })}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                {linea.account_code && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)]">
                    <CampoTerceroAsiento
                      nit={linea.tercero_nit}
                      nombre={linea.tercero_nombre}
                      obligatorio={cuentaRetencionExigeNit(linea.account_code) || !!cuenta?.requiere_tercero}
                      onCambiar={(nit, nombre) => cambiarLinea(indice, (l) => ({ ...l, tercero_nit: nit, tercero_nombre: nombre }))}
                    />
                    {modo !== 'no_aplica' && distribuciones.length > 0 && (
                      <select
                        aria-label={t('linea.distribucion', { n })}
                        value={linea.distribucion_id}
                        onChange={(e) => cambiarLinea(indice, (l) => cambiarCentro(l, 'distribucion_id', e.target.value))}
                        className={CLASE_SELECT}
                      >
                        <option value="">{t('linea.sinDistribucion')}</option>
                        {distribuciones.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle px-3 py-2">
          <button type="button" onClick={agregarLinea} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            <Plus className="size-4" aria-hidden="true" />
            {t('agregarLinea')}
            <span className="hidden text-fg-secondary lg:inline">· {t('enterUltimaFila')}</span>
          </button>
        </div>
      </div>

      <BarraCuadre cuadre={cuadre} formatear={(v) => formatear(v)} />
      {errorVisible && <p role="alert" className="text-sm text-danger-text">{errorVisible}</p>}
    </Dialogo>
  );
}
