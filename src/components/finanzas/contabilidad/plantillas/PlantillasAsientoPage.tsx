'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Archive, FileText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AvisoTonal,
  CampoFecha,
  CampoNumero,
  ConfirmDialog,
  Dialogo,
  EmptyState,
  FormField,
  PageHeader,
  RowActionsMenu,
  Skeleton,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { ContabilidadService, mensajeErrorAsiento, type ChartAccount, type PlantillaAsiento } from '../ContabilidadService';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';
import {
  hayErroresUso,
  lineasUtiles,
  totalesPlantilla,
  validarPlantilla,
  validarUsoPlantilla,
  type ErroresUsoPlantilla,
} from '@/lib/finanzas/contabilidad/plantillaAsiento';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cn } from '@/utils/Utils';
import { CampoTerceroAsiento } from '../CampoTerceroAsiento';

/**
 * Plantillas de asientos (Figma 36 · F3 «nueva plantilla» y F4 «usar plantilla»).
 * Guardar exige que débitos y créditos cuadren (aquí, en `ContabilidadService.guardarPlantilla`
 * y en `fn_plantilla_asiento_guardar`). Usar crea un BORRADOR (`fn_plantilla_asiento_aplicar`):
 * nunca publica.
 */

interface LineaForm {
  account_code: string;
  description: string;
  debit: number | null;
  credit: number | null;
  tercero_nit: string;
  tercero_nombre: string;
  cost_center_id: string;
}

const vacia = (): LineaForm => ({
  account_code: '',
  description: '',
  debit: null,
  credit: null,
  tercero_nit: '',
  tercero_nombre: '',
  cost_center_id: '',
});

const CLASE_SELECT = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';

interface UsoPlantilla {
  plantilla: PlantillaAsiento;
  fecha: string;
  sucursalId: number | null;
  memo: string;
}

export function PlantillasAsientoPage() {
  const t = useTranslations('finanzasContableR2.plantillas');
  const router = useRouter();
  const { selectedBranchId, branches } = useBranch();
  const { formatear } = useMonedaOrganizacion();
  const [plantillas, setPlantillas] = useState<PlantillaAsiento[]>([]);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [centros, setCentros] = useState<{ id: string; code: string; name: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState(false);
  const [memo, setMemo] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([vacia(), vacia()]);
  const [uso, setUso] = useState<UsoPlantilla | null>(null);
  const [erroresUso, setErroresUso] = useState<ErroresUsoPlantilla>({});
  const [aplicando, setAplicando] = useState(false);
  const [archivar, setArchivar] = useState<PlantillaAsiento | null>(null);
  // El día y el instante del asiento salen de la zona de la sucursal elegida en el diálogo.
  const { toInstant, getToday } = useFormatDate(uso?.sucursalId ?? selectedBranchId);

  const movimiento = useMemo(() => cuentas.filter((c) => esCuentaDeMovimiento(c, cuentas)), [cuentas]);
  const totales = useMemo(() => totalesPlantilla(lineas.map((l) => ({ account_code: l.account_code, debit: l.debit ?? 0, credit: l.credit ?? 0 }))), [lineas]);
  const bloqueo = useMemo(
    () => validarPlantilla(nombre, lineas.map((l) => ({ account_code: l.account_code, debit: l.debit ?? 0, credit: l.credit ?? 0 }))),
    [lineas, nombre],
  );
  // Sin nombre se deja pulsar Guardar para marcar el campo; lo demás desactiva el botón con su motivo.
  const motivoBloqueo = bloqueo && bloqueo !== 'nombre' ? t(`bloqueo.${bloqueo}`) : null;
  const sinImportes = totales.debitos === 0 && totales.creditos === 0;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, plan, cc] = await Promise.all([
        ContabilidadService.listarPlantillas(),
        ContabilidadService.obtenerPlanCuentas(),
        ContabilidadService.listarCentrosCosto().catch(() => []),
      ]);
      setPlantillas(lista);
      setCuentas(plan.filter((c) => c.is_active));
      setCentros(cc);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errores.cargar'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = <K extends keyof LineaForm>(indice: number, campo: K, valor: LineaForm[K]) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  };

  const fijarTercero = (indice: number, nit: string, nombreTercero: string) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, tercero_nit: nit, tercero_nombre: nombreTercero } : l)));
  };

  const quitarLinea = (indice: number) => {
    setLineas((prev) => (prev.length <= 2 ? prev.map((l, i) => (i === indice ? vacia() : l)) : prev.filter((_, i) => i !== indice)));
  };

  const guardar = async () => {
    if (bloqueo === 'nombre') {
      setErrorNombre(true);
      return;
    }
    if (bloqueo) return;
    const utiles = lineasUtiles(lineas.map((l) => ({ ...l, debit: l.debit ?? 0, credit: l.credit ?? 0 })));
    setGuardando(true);
    try {
      await ContabilidadService.guardarPlantilla({
        nombre: nombre.trim(),
        memo: memo.trim() || null,
        lineas: utiles.map((l, orden) => ({
          orden: orden + 1,
          account_code: l.account_code,
          descripcion: l.description || null,
          debito: l.debit,
          credito: l.credit,
          tercero_nit: l.tercero_nit.trim() || null,
          tercero_nombre: l.tercero_nombre.trim() || null,
          cost_center_id: l.cost_center_id || null,
        })),
      });
      toast.success(t('guardada'));
      setNombre('');
      setMemo('');
      setErrorNombre(false);
      setLineas([vacia(), vacia()]);
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : mensajeErrorAsiento(null));
    } finally {
      setGuardando(false);
    }
  };

  const abrirUso = (plantilla: PlantillaAsiento) => {
    setErroresUso({});
    setUso({ plantilla, fecha: getToday(), sucursalId: selectedBranchId ?? null, memo: plantilla.memo ?? '' });
  };

  const aplicar = async () => {
    if (!uso) return;
    const errores = validarUsoPlantilla({ fecha: uso.fecha, sucursalId: uso.sucursalId });
    setErroresUso(errores);
    if (hayErroresUso(errores) || uso.sucursalId == null) return;
    setAplicando(true);
    try {
      const asientoId = await ContabilidadService.aplicarPlantilla(uso.plantilla.id, uso.sucursalId, toInstant(uso.fecha), uso.memo.trim() || null);
      toast.success(t('usar.creado'));
      setUso(null);
      router.push(`/app/finanzas/contabilidad/asientos/${asientoId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errores.aplicar'));
    } finally {
      setAplicando(false);
    }
  };

  const confirmarArchivo = async () => {
    if (!archivar) return;
    try {
      await ContabilidadService.archivarPlantilla(archivar.id);
      setPlantillas((prev) => prev.filter((p) => p.id !== archivar.id));
      toast.success(t('archivar.hecho'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errores.archivar'));
    } finally {
      setArchivar(null);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={FileText}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('migas.plantillas') },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Tarjeta titulo={t('nueva.titulo')}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('nueva.nombre')} obligatorio error={errorNombre ? t('nueva.nombreRequerido') : null}>
                <Input
                  value={nombre}
                  maxLength={120}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    if (e.target.value.trim()) setErrorNombre(false);
                  }}
                />
              </FormField>
              <FormField etiqueta={t('nueva.memo')}>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
              </FormField>
            </div>

            <div className="space-y-3">
              {lineas.map((linea, indice) => {
                const cuenta = cuentas.find((c) => c.account_code === linea.account_code);
                const n = indice + 1;
                return (
                  <div key={indice} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <select
                      aria-label={t('linea.cuenta', { n })}
                      value={linea.account_code}
                      onChange={(e) => cambiar(indice, 'account_code', e.target.value)}
                      className={CLASE_SELECT}
                    >
                      <option value="">{t('linea.cuentaVacia')}</option>
                      {movimiento.map((c) => (
                        <option key={c.account_code} value={c.account_code}>
                          {c.account_code} · {c.name}
                        </option>
                      ))}
                    </select>
                    <CampoNumero
                      aria-label={t('linea.debito', { n })}
                      placeholder={t('linea.debitoCorto')}
                      valor={linea.debit}
                      onValorChange={(v) => cambiar(indice, 'debit', v)}
                      minimo={0}
                      alinear="derecha"
                    />
                    <CampoNumero
                      aria-label={t('linea.credito', { n })}
                      placeholder={t('linea.creditoCorto')}
                      valor={linea.credit}
                      onValorChange={(v) => cambiar(indice, 'credit', v)}
                      minimo={0}
                      alinear="derecha"
                    />
                    <button
                      type="button"
                      onClick={() => quitarLinea(indice)}
                      aria-label={t('linea.quitar', { n })}
                      className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-center' })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                    <Input
                      aria-label={t('linea.descripcion', { n })}
                      value={linea.description}
                      onChange={(e) => cambiar(indice, 'description', e.target.value)}
                      placeholder={t('linea.descripcionCorta')}
                      className="sm:col-span-4"
                    />
                    {linea.account_code && (
                      <>
                        <div className="sm:col-span-2">
                          <CampoTerceroAsiento
                            nit={linea.tercero_nit}
                            nombre={linea.tercero_nombre}
                            obligatorio={!!cuenta?.requiere_tercero}
                            onCambiar={(nit, nombreTercero) => fijarTercero(indice, nit, nombreTercero)}
                          />
                        </div>
                        <select
                          aria-label={t('linea.centro', { n })}
                          value={linea.cost_center_id}
                          onChange={(e) => cambiar(indice, 'cost_center_id', e.target.value)}
                          className={cn(CLASE_SELECT, 'sm:col-span-2')}
                        >
                          <option value="">{cuenta?.requiere_centro_costo ? t('linea.centroObligatorio') : t('linea.centroOpcional')}</option>
                          {centros.map((cc) => (
                            <option key={cc.id} value={cc.id}>
                              {cc.code} · {cc.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              role="status"
              aria-live="polite"
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                sinImportes ? 'border-line bg-subtle text-fg-secondary' : totales.cuadra ? 'border-line-success bg-success-subtle' : 'border-line-danger bg-danger-subtle',
              )}
            >
              <span className={cn('font-semibold', !sinImportes && (totales.cuadra ? 'text-success-text' : 'text-danger-text'))}>
                {sinImportes
                  ? t('cuadre.sinImportes')
                  : totales.cuadra
                    ? t('cuadre.cuadra')
                    : t('cuadre.noCuadra', { diferencia: formatear(Math.abs(totales.diferencia)) })}
              </span>
              <span className="flex gap-4 tabular-nums text-fg">
                <span>{t('cuadre.debitos', { valor: formatear(totales.debitos) })}</span>
                <span>{t('cuadre.creditos', { valor: formatear(totales.creditos) })}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLineas((prev) => [...prev, vacia()])} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Plus className="h-4 w-4" aria-hidden />
                {t('nueva.linea')}
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando || motivoBloqueo !== null}
                aria-describedby={motivoBloqueo ? 'plantilla-motivo-bloqueo' : undefined}
                className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
              >
                {t('nueva.guardar')}
              </button>
              {motivoBloqueo && (
                <span id="plantilla-motivo-bloqueo" className="text-xs text-fg-secondary">
                  {motivoBloqueo}
                </span>
              )}
            </div>
          </div>
        </Tarjeta>

        <Tarjeta titulo={t('guardadas.titulo')} sinRelleno>
          {cargando ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : plantillas.length === 0 ? (
            <EmptyState compacto titulo={t('guardadas.vacio')} />
          ) : (
            <ul className="divide-y divide-line">
              {plantillas.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{p.nombre}</p>
                    <p className="truncate text-xs text-fg-secondary">
                      {t('guardadas.lineas', { n: p.lineas.length })}
                      {p.memo ? ` · ${p.memo}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => abrirUso(p)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                      {t('guardadas.usar')}
                    </button>
                    <RowActionsMenu
                      titulo={p.nombre}
                      acciones={[{ id: 'archivar', etiqueta: t('archivar.accion'), icono: Archive, destructiva: true, onSelect: () => setArchivar(p) }]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <Dialogo
        abierto={uso !== null}
        onAbiertoChange={(a) => !a && !aplicando && setUso(null)}
        titulo={t('usar.titulo')}
        descripcion={uso?.plantilla.nombre}
        ancho={520}
        primario={{ etiqueta: t('usar.crear'), onClick: () => void aplicar(), cargando: aplicando }}
      >
        {uso && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('usar.fecha')} obligatorio error={erroresUso.fecha ? t('usar.fechaRequerida') : null}>
                {(campo) => (
                  <CampoFecha
                    id={campo.id}
                    valor={uso.fecha}
                    onValorChange={(d) => {
                      setUso({ ...uso, fecha: d });
                      setErroresUso((e) => ({ ...e, fecha: undefined }));
                    }}
                    limpiable={false}
                    aria-labelledby={campo.idEtiqueta}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('usar.sucursal')} obligatorio error={erroresUso.sucursal ? t('usar.sucursalRequerida') : null}>
                {(campo) => (
                  <select
                    id={campo.id}
                    value={uso.sucursalId ?? ''}
                    onChange={(e) => {
                      setUso({ ...uso, sucursalId: e.target.value ? Number(e.target.value) : null });
                      setErroresUso((er) => ({ ...er, sucursal: undefined }));
                    }}
                    aria-invalid={erroresUso.sucursal ? true : undefined}
                    className={CLASE_SELECT}
                  >
                    <option value="">{t('usar.elegirSucursal')}</option>
                    {branches
                      .filter((b) => b.id != null)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                )}
              </FormField>
            </div>
            <FormField etiqueta={t('usar.memo')}>
              <Input value={uso.memo} onChange={(e) => setUso({ ...uso, memo: e.target.value })} />
            </FormField>
            <AvisoTonal tono="informacion" titulo={t('usar.avisoTitulo')} descripcion={t('usar.avisoDescripcion')} />
          </div>
        )}
      </Dialogo>

      <ConfirmDialog
        abierto={archivar !== null}
        onAbiertoChange={(a) => !a && setArchivar(null)}
        titulo={t('archivar.titulo', { nombre: archivar?.nombre ?? '' })}
        descripcion={t('archivar.descripcion')}
        textoConfirmar={t('archivar.confirmar')}
        tono="peligro"
        icono={Archive}
        onConfirmar={confirmarArchivo}
      />
    </div>
  );
}
