'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AvisoTonal,
  CampoFecha,
  CampoNumero,
  ConfirmDialog,
  DataTable,
  Dialogo,
  FormField,
  PageHeader,
  clasesBoton,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoCuentaContable } from '@/components/finanzas/contabilidad/CampoCuentaContable';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  FixedAssetService,
  METODO_DEPRECIACION,
  TIPOS_ACTIVO,
  type EstadoDepreciacion,
  type FixedAsset,
  type FixedAssetInput,
  type ResultadoDepreciacion,
} from './FixedAssetService';

const VACIO: FixedAssetInput = {
  code: '',
  name: '',
  description: '',
  asset_type: 'equipment',
  acquisition_date: '',
  acquisition_cost: 0,
  salvage_value: 0,
  useful_life_months: 12,
  depreciation_method: METODO_DEPRECIACION,
  account_asset_code: null,
  account_depreciation_code: null,
  account_expense_code: null,
};

const MOTIVOS = ['metodo_no_disponible', 'faltan_cuentas', 'cuenta_no_es_de_movimiento', 'acumulada_sin_detalle', 'period_closed'];

export function ActivosFijosPage() {
  const t = useTranslations('activosFijos');
  const fecha = useFormatter();
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();

  const [hoy, setHoy] = useState('');
  const [activos, setActivos] = useState<FixedAsset[]>([]);
  const [estadoProceso, setEstadoProceso] = useState<EstadoDepreciacion | null>(null);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [edicion, setEdicion] = useState<FixedAsset | 'nuevo' | null>(null);
  const [form, setForm] = useState<FixedAssetInput>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDepreciacion | null>(null);
  const [borrar, setBorrar] = useState<FixedAsset | null>(null);
  const cargado = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const [lista, proceso] = await Promise.all([FixedAssetService.getAll(), FixedAssetService.estado()]);
      setActivos(lista);
      setEstadoProceso(proceso);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (cargado.current) return;
    cargado.current = true;
    void cargar();
  }, [cargar]);

  // El día de la organización: antes de conocer su zona, el contexto da el fallback.
  useEffect(() => {
    if (tzLoading) return;
    setHoy(getToday());
  }, [tzLoading, getToday]);

  const nombreMes = hoy ? fecha.dateTime(new Date(`${hoy.slice(0, 7)}-15T12:00:00Z`), { month: 'long', timeZone: 'UTC' }) : '';

  const motivoDe = useCallback(
    (motivo: string) => t(`motivos.${MOTIVOS.includes(motivo) ? motivo : 'otro'}`),
    [t],
  );

  const bloqueos = useMemo(() => {
    const mapa = new Map<string, string>();
    (estadoProceso?.bloqueos ?? []).forEach((b) => mapa.set(b.activo_id, b.motivo));
    return mapa;
  }, [estadoProceso]);

  const abrirNuevo = () => {
    setForm({ ...VACIO, acquisition_date: hoy });
    setEdicion('nuevo');
  };

  const abrirEdicion = (a: FixedAsset) => {
    setForm({
      code: a.code,
      name: a.name,
      description: a.description ?? '',
      asset_type: a.asset_type,
      acquisition_date: a.acquisition_date,
      acquisition_cost: a.acquisition_cost,
      salvage_value: a.salvage_value,
      useful_life_months: a.useful_life_months,
      depreciation_method: a.depreciation_method,
      account_asset_code: a.account_asset_code,
      account_depreciation_code: a.account_depreciation_code,
      account_expense_code: a.account_expense_code,
    });
    setEdicion(a);
  };

  const guardar = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error(t('form.requeridos'));
      return;
    }
    setGuardando(true);
    try {
      const datos = { ...form, description: form.description || null };
      if (edicion && edicion !== 'nuevo') await FixedAssetService.update(edicion.id, datos);
      else await FixedAssetService.create(datos);
      setEdicion(null);
      await cargar();
    } catch {
      toast.error(t('errores.guardar'));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    try {
      await FixedAssetService.delete(borrar.id);
      await cargar();
    } catch {
      toast.error(t('errores.borrar'));
    } finally {
      setBorrar(null);
    }
  };

  const depreciar = async () => {
    setProcesando(true);
    try {
      const r = await FixedAssetService.depreciarMes(hoy);
      setResultado(r);
      await cargar();
    } catch (e) {
      const permiso = (e as { code?: string } | null)?.code === '42501';
      toast.error(permiso ? t('errores.sinPermiso') : t('errores.depreciar'));
    } finally {
      setProcesando(false);
    }
  };

  const columnas = useMemo<ColumnaTabla<FixedAsset>[]>(
    () => [
      {
        id: 'activo',
        encabezado: t('columnas.activo'),
        celda: (a) => (
          <div className="min-w-0">
            <p className="font-medium text-fg">{a.name}</p>
            {bloqueos.has(a.id) && <p className="text-xs text-warning-text">{motivoDe(bloqueos.get(a.id) ?? '')}</p>}
          </div>
        ),
      },
      { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', celda: (a) => formatear(a.acquisition_cost) },
      { id: 'vida', encabezado: t('columnas.vidaUtil'), variante: 'importe', celda: (a) => t('meses', { n: a.useful_life_months }) },
      { id: 'acumulada', encabezado: t('columnas.acumulada'), variante: 'importe', celda: (a) => formatear(a.accumulated_depreciation) },
      { id: 'libros', encabezado: t('columnas.libros'), variante: 'importe', celda: (a) => formatear(a.current_value) },
      {
        id: 'metodo',
        encabezado: t('columnas.metodo'),
        celda: (a) => (a.depreciation_method === METODO_DEPRECIACION ? t('lineaRecta') : t('metodoNoDisponible')),
      },
    ],
    [bloqueos, formatear, motivoDe, t],
  );

  const actualizar = <K extends keyof FixedAssetInput>(campo: K, valor: FixedAssetInput[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const conDepreciacion = edicion !== null && edicion !== 'nuevo' && edicion.accumulated_depreciation > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            <button type="button" onClick={abrirNuevo} className={clasesBoton({ variante: 'secundario' })}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('nuevo')}
            </button>
            <button
              type="button"
              onClick={() => void depreciar()}
              disabled={!hoy || procesando || activos.length === 0}
              className={clasesBoton({ variante: 'primario' })}
            >
              {t('depreciar', { mes: nombreMes })}
            </button>
          </>
        }
      />

      {resultado && (
        <AvisoTonal
          tono={resultado.pendientes.length > 0 ? 'advertencia' : 'exito'}
          titulo={t('resultado.titulo', { n: resultado.asientos, total: formatear(resultado.total) })}
          descripcion={
            resultado.pendientes.length > 0 ? (
              <ul className="list-disc pl-4">
                {resultado.pendientes.map((p) => (
                  <li key={`${p.activo_id}-${p.mes ?? ''}`}>
                    {p.codigo} · {motivoDe(p.motivo)}
                  </li>
                ))}
              </ul>
            ) : (
              t('resultado.sinPendientes')
            )
          }
        />
      )}

      <DataTable<FixedAsset>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={activos}
        obtenerId={(a) => a.id}
        estado={estado}
        onReintentar={() => void cargar()}
        onFilaClick={abrirEdicion}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        accionesRapidas={(a) => (
          <>
            <button type="button" aria-label={t('editar', { nombre: a.name })} onClick={() => abrirEdicion(a)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            {a.accumulated_depreciation <= 0 && (
              <button type="button" aria-label={t('borrar', { nombre: a.name })} onClick={() => setBorrar(a)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </>
        )}
        tarjetaMovil={(a) => (
          <div className="flex flex-col gap-1 p-4">
            <span className="font-medium text-fg">{a.name}</span>
            <span className="text-sm text-fg-secondary">{t('tarjeta.libros', { valor: formatear(a.current_value) })}</span>
            <span className="text-xs text-fg-tertiary">
              {t('tarjeta.acumulada', { valor: formatear(a.accumulated_depreciation) })} · {t('meses', { n: a.useful_life_months })}
            </span>
            {bloqueos.has(a.id) && <span className="text-xs text-warning-text">{motivoDe(bloqueos.get(a.id) ?? '')}</span>}
          </div>
        )}
      />

      <AvisoTonal tono="informacion" titulo={t('otrosMetodos.titulo')} descripcion={t('otrosMetodos.descripcion')} />

      <Dialogo
        abierto={edicion !== null}
        onAbiertoChange={(a) => !a && setEdicion(null)}
        titulo={edicion === 'nuevo' ? t('form.tituloNuevo') : t('form.tituloEditar')}
        ancho={672}
        primario={{ etiqueta: t('form.guardar'), onClick: () => void guardar(), cargando: guardando }}
      >
        <div className="space-y-4">
          {conDepreciacion && <AvisoTonal tono="informacion" titulo={t('form.conDepreciacion')} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('form.codigo')} obligatorio>
              <Input value={form.code} disabled={edicion !== 'nuevo'} onChange={(e) => actualizar('code', e.target.value)} />
            </FormField>
            <FormField etiqueta={t('form.tipo')}>
              {(campo) => (
                <select
                  id={campo.id}
                  value={form.asset_type}
                  onChange={(e) => actualizar('asset_type', e.target.value)}
                  className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg"
                >
                  {TIPOS_ACTIVO.map((v) => (
                    <option key={v} value={v}>{t(`tipos.${v}`)}</option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
          <FormField etiqueta={t('form.nombre')} obligatorio>
            <Input value={form.name} onChange={(e) => actualizar('name', e.target.value)} />
          </FormField>
          <FormField etiqueta={t('form.descripcion')}>
            <Input value={form.description ?? ''} onChange={(e) => actualizar('description', e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('form.fecha')} obligatorio>
              {(campo) => (
                <CampoFecha id={campo.id} valor={form.acquisition_date} onValorChange={(d) => actualizar('acquisition_date', d)} disabled={conDepreciacion} limpiable={false} aria-labelledby={campo.idEtiqueta} />
              )}
            </FormField>
            <FormField etiqueta={t('form.costo')} obligatorio>
              {(campo) => <CampoNumero id={campo.id} valor={form.acquisition_cost} onValorChange={(v) => actualizar('acquisition_cost', v ?? 0)} minimo={0} disabled={conDepreciacion} alinear="derecha" />}
            </FormField>
            <FormField etiqueta={t('form.residual')}>
              {(campo) => <CampoNumero id={campo.id} valor={form.salvage_value} onValorChange={(v) => actualizar('salvage_value', v ?? 0)} minimo={0} disabled={conDepreciacion} alinear="derecha" />}
            </FormField>
            <FormField etiqueta={t('form.vida')} obligatorio>
              {(campo) => <CampoNumero id={campo.id} valor={form.useful_life_months} onValorChange={(v) => actualizar('useful_life_months', v ?? 1)} minimo={1} decimales={0} disabled={conDepreciacion} alinear="derecha" />}
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField etiqueta={t('form.cuentaActivo')}>
              {(campo) => <CampoCuentaContable id={campo.id} value={form.account_asset_code} onChange={(c) => actualizar('account_asset_code', c)} vacio={t('form.sinCuenta')} />}
            </FormField>
            <FormField etiqueta={t('form.cuentaGasto')} ayuda={t('form.ayudaCuentas')}>
              {(campo) => <CampoCuentaContable id={campo.id} value={form.account_expense_code} onChange={(c) => actualizar('account_expense_code', c)} vacio={t('form.sinCuenta')} />}
            </FormField>
            <FormField etiqueta={t('form.cuentaDepreciacion')}>
              {(campo) => <CampoCuentaContable id={campo.id} value={form.account_depreciation_code} onChange={(c) => actualizar('account_depreciation_code', c)} vacio={t('form.sinCuenta')} />}
            </FormField>
          </div>
        </div>
      </Dialogo>

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('borrado.titulo', { nombre: borrar?.name ?? '' })}
        descripcion={t('borrado.descripcion')}
        textoConfirmar={t('borrado.confirmar')}
        tono="peligro"
        onConfirmar={confirmarBorrado}
      />
    </div>
  );
}
