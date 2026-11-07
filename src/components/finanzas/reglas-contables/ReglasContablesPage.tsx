'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CircleAlert, Copy, Download, ListChecks, Pencil, Plus, Power, PowerOff, Settings, Trash2, Wrench } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  Dialogo,
  FilterButton,
  ListCard,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  StatusBadge,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { CardListSkeleton, PageHeaderSkeleton } from '@/components/common/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchSelect } from '@/components/ui/search-select';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { ConfiguracionContableService } from '@/components/finanzas/configuracion-contable/ConfiguracionContableService';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  etiquetaEvento,
  etiquetaOrigen,
  resolverLado,
  type FilaConfiguracion,
} from '@/lib/finanzas/configuracionContable';
import {
  COLUMNA_LADO,
  agruparPorRegla,
  coincideBusqueda,
  cuentaBloqueada,
  falloCuentaEnRegla,
  filasInventario,
  type CodigoFalloCuenta,
  type CuentaInvalida,
} from '@/lib/finanzas/reglasContables';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { vistaPreviaRegla } from '@/lib/finanzas/contabilidad/vistaPreviaRegla';
import { TablaContable } from '@/components/finanzas/contabilidad/piezas';
import { cn } from '@/lib/utils';
import {
  ErrorReglaContable,
  EVENT_TYPES,
  ReglasContablesService,
  SOURCE_TYPES,
  type AccountingRule,
  type ChartAccount,
} from './ReglasContablesService';

const PLAN_DE_CUENTAS = '/app/finanzas/contabilidad/plan-cuentas';

const FORMULARIO_VACIO = {
  name: '',
  description: '',
  source_type: '',
  event_type: '',
  debit_account_code: '',
  credit_account_code: '',
  tax_account_code: '',
  use_tax_from_document: false,
  priority: 0,
};

interface Bloqueo {
  regla: string;
  cuenta: string;
  codigo: CodigoFalloCuenta;
}

interface Correccion {
  regla: AccountingRule;
  invalida: CuentaInvalida;
  cuenta: string;
}

export function ReglasContablesPage() {
  const t = useTranslations('reglasContables');
  const tv = useTranslations('finanzasContabilidadR3.reglas');
  const router = useRouter();
  const { formatear } = useMonedaOrganizacion();
  const { crear: puedeEscribir } = usePermisosFinanzas();
  const [reglas, setReglas] = useState<AccountingRule[]>([]);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [configuracion, setConfiguracion] = useState<FilaConfiguracion[]>([]);
  const [invalidas, setInvalidas] = useState<CuentaInvalida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [origen, setOrigen] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [soloInvalidas, setSoloInvalidas] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<AccountingRule | null>(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [correccion, setCorreccion] = useState<Correccion | null>(null);
  const [bloqueo, setBloqueo] = useState<Bloqueo | null>(null);
  const [porEliminar, setPorEliminar] = useState<AccountingRule | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      const [reglasData, cuentasData, configData, diagnostico] = await Promise.all([
        ReglasContablesService.obtenerReglas(),
        ReglasContablesService.obtenerCuentasContables(),
        ConfiguracionContableService.listar().catch(() => [] as FilaConfiguracion[]),
        ReglasContablesService.obtenerDiagnostico().catch(() => [] as CuentaInvalida[]),
      ]);
      setReglas(reglasData);
      setCuentas(cuentasData);
      setConfiguracion(configData);
      setInvalidas(diagnostico);
    } catch {
      toast.error(t('errores.carga'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porRegla = useMemo(() => agruparPorRegla(invalidas), [invalidas]);
  const reglasInvalidas = useMemo(
    () => reglas.filter((regla) => regla.is_active && porRegla.has(regla.id)).length,
    [reglas, porRegla],
  );
  const filas = useMemo(
    () => reglas.filter((regla) => (
      (!origen || regla.source_type === origen)
      && (!soloInvalidas || porRegla.has(regla.id))
      && coincideBusqueda(regla, busqueda)
    )),
    [reglas, origen, soloInvalidas, porRegla, busqueda],
  );

  const opcionesCuenta = useMemo(
    () => cuentas
      .filter((cuenta) => falloCuentaEnRegla(cuenta.account_code, cuentas) === null)
      .map((cuenta) => ({ value: cuenta.account_code, label: `${cuenta.account_code} · ${cuenta.name}` })),
    [cuentas],
  );

  /** Una cuenta inválida ya guardada sigue visible en el formulario, marcada. */
  const opcionesCon = (codigo: string) => {
    if (!codigo || opcionesCuenta.some((opcion) => opcion.value === codigo)) return opcionesCuenta;
    return [{ value: codigo, label: `${codigo} · ${t(`estadoCuenta.${estadoDe(codigo)}`)}` }, ...opcionesCuenta];
  };

  const estadoDe = (codigo: string): 'inexistente' | 'inactiva' | 'titulo' => {
    const fallo = falloCuentaEnRegla(codigo, cuentas);
    if (fallo === 'cuenta_de_titulo') return 'titulo';
    return fallo === 'cuenta_inactiva' ? 'inactiva' : 'inexistente';
  };

  const nombreCuenta = (codigo: string) => cuentas.find((cuenta) => cuenta.account_code === codigo)?.name ?? '';

  const abrirFormulario = (regla?: AccountingRule) => {
    setEditando(regla ?? null);
    setFormulario(regla
      ? {
          name: regla.name,
          description: regla.description ?? '',
          source_type: regla.source_type,
          event_type: regla.event_type,
          debit_account_code: regla.debit_account_code,
          credit_account_code: regla.credit_account_code,
          tax_account_code: regla.tax_account_code ?? '',
          use_tax_from_document: regla.use_tax_from_document,
          priority: regla.priority,
        }
      : FORMULARIO_VACIO);
    setDialogoAbierto(true);
  };

  const mostrarError = (error: unknown, regla: string) => {
    if (error instanceof ErrorReglaContable) {
      const { codigo, cuenta } = error.fallo;
      if (cuenta && (codigo === 'cuenta_no_existe' || codigo === 'cuenta_inactiva' || codigo === 'cuenta_de_titulo')) {
        setBloqueo({ regla, cuenta, codigo });
        return;
      }
      if (codigo !== 'cuenta_no_existe' && codigo !== 'cuenta_inactiva' && codigo !== 'cuenta_de_titulo') {
        toast.error(t(`errores.${codigo}`));
        return;
      }
    }
    toast.error(t('errores.desconocido'));
  };

  const guardar = async () => {
    if (!formulario.name.trim() || !formulario.source_type || !formulario.event_type
      || !formulario.debit_account_code || !formulario.credit_account_code) {
      toast.error(t('formulario.faltanDatos'));
      return;
    }
    const rechazada = cuentaBloqueada(formulario, editando, cuentas);
    if (rechazada) {
      setBloqueo({ regla: formulario.name, cuenta: rechazada.cuenta, codigo: rechazada.codigo });
      return;
    }
    try {
      setGuardando(true);
      if (editando) {
        await ReglasContablesService.actualizarRegla(editando.id, formulario);
        toast.success(t('exito.actualizada'));
      } else {
        await ReglasContablesService.crearRegla(formulario);
        toast.success(t('exito.creada'));
      }
      setDialogoAbierto(false);
      await cargar();
    } catch (error) {
      mostrarError(error, formulario.name);
    } finally {
      setGuardando(false);
    }
  };

  const guardarCorreccion = async () => {
    if (!correccion?.cuenta) return;
    try {
      setGuardando(true);
      await ReglasContablesService.actualizarRegla(correccion.regla.id, {
        [COLUMNA_LADO[correccion.invalida.lado]]: correccion.cuenta,
      });
      toast.success(t('corregir.exito'));
      setCorreccion(null);
      await cargar();
    } catch (error) {
      mostrarError(error, correccion.regla.name);
    } finally {
      setGuardando(false);
    }
  };

  const ejecutar = async (accion: () => Promise<unknown>, exito: string, regla: string) => {
    try {
      await accion();
      toast.success(exito);
      await cargar();
    } catch (error) {
      mostrarError(error, regla);
    }
  };

  const exportar = () => {
    descargarCsv('reglas-cuentas-invalidas.csv', aCsv([
      [t('csv.origen'), t('csv.evento'), t('csv.regla'), t('csv.lado'), t('csv.cuenta'), t('csv.estado'), t('csv.propuesta'), t('csv.evidencia'), t('csv.usos')],
      ...filasInventario(reglas, invalidas),
    ]));
  };

  const accionesDeFila = (regla: AccountingRule): AccionFila[] => {
    const invalidasRegla = porRegla.get(regla.id) ?? [];
    const acciones: AccionFila[] = invalidasRegla.map((invalida) => ({
      id: `corregir-${invalida.lado}`,
      etiqueta: invalidasRegla.length > 1 ? `${t('acciones.corregir')} (${t(`lado.${invalida.lado}`)})` : t('acciones.corregir'),
      icono: Wrench,
      onSelect: () => setCorreccion({ regla, invalida, cuenta: invalida.propuesta ?? '' }),
    }));
    return [
      ...acciones,
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => abrirFormulario(regla) },
      {
        id: 'duplicar',
        etiqueta: t('acciones.duplicar'),
        icono: Copy,
        onSelect: () => void ejecutar(() => ReglasContablesService.duplicarRegla(regla, t('copia')), t('exito.duplicada'), regla.name),
      },
      {
        id: 'estado',
        etiqueta: regla.is_active ? t('acciones.desactivar') : t('acciones.activar'),
        icono: regla.is_active ? PowerOff : Power,
        onSelect: () => void ejecutar(
          () => ReglasContablesService.toggleActivo(regla.id, !regla.is_active),
          regla.is_active ? t('exito.desactivada') : t('exito.activada'),
          regla.name,
        ),
      },
      { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setPorEliminar(regla) },
    ];
  };

  const celdaCuenta = (regla: AccountingRule, lado: 'debito' | 'credito') => {
    const codigo = regla[COLUMNA_LADO[lado]] ?? '';
    const invalida = porRegla.get(regla.id)?.find((fila) => fila.lado === lado);
    if (invalida) {
      return <span className="text-danger-text">{codigo} · {t(`estadoCuenta.${invalida.estado}`)}</span>;
    }
    const resuelto = resolverLado({ source: regla.source_type, lado, codigo, branchId: null, filas: configuracion, plan: cuentas });
    return (
      <>
        <span className="block truncate text-fg">{codigo} {nombreCuenta(codigo)}</span>
        {resuelto.cuenta && resuelto.cuenta !== codigo ? (
          <span className="block text-xs text-fg-secondary">{t('seContabiliza', { cuenta: resuelto.cuenta })}</span>
        ) : null}
      </>
    );
  };

  const celdaPropuesta = (regla: AccountingRule) => (porRegla.get(regla.id) ?? []).map((invalida) => {
    if (!invalida.propuesta) {
      return <span key={invalida.lado} className="block text-warning-text">{t('propuesta.pendiente')}</span>;
    }
    return (
      <span key={invalida.lado} className="block text-success-text">
        {invalida.usos_propuesta > 0
          ? t('propuesta.usada', { cuenta: invalida.propuesta, n: invalida.usos_propuesta })
          : t('propuesta.vigente', { cuenta: invalida.propuesta })}
      </span>
    );
  });

  const columnas: ColumnaTabla<AccountingRule>[] = [
    {
      id: 'regla',
      encabezado: t('columnas.regla'),
      celda: (regla) => (
        <span className={cn('block', !regla.is_active && 'opacity-60')}>
          <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
            {regla.name}
            {regla.is_active ? null : <StatusBadge estado="inactive" etiqueta={t('inactiva')} />}
          </span>
          <span className="block text-xs font-normal text-fg-secondary">{etiquetaOrigen(regla.source_type)}</span>
        </span>
      ),
    },
    { id: 'evento', encabezado: t('columnas.evento'), ocultarDebajo: 'xl', celda: (regla) => <span className="text-fg">{etiquetaEvento(regla.event_type)}</span> },
    { id: 'debito', encabezado: t('columnas.debito'), className: 'max-w-56', celda: (regla) => celdaCuenta(regla, 'debito') },
    { id: 'credito', encabezado: t('columnas.credito'), className: 'max-w-56', celda: (regla) => celdaCuenta(regla, 'credito') },
    { id: 'propuesta', encabezado: t('columnas.propuesta'), celda: (regla) => celdaPropuesta(regla) },
  ];

  // Vista previa del asiento con lo que hay en el formulario (no escribe nada).
  const vista = vistaPreviaRegla(formulario, cuentas);
  const bloqueoFormulario = dialogoAbierto ? cuentaBloqueada(formulario, editando, cuentas) : null;
  const avisoCuenta = (codigo: string) => {
    if (!codigo) return null;
    const fallo = falloCuentaEnRegla(codigo, cuentas);
    if (!fallo) return null;
    const subcuenta = fallo === 'cuenta_de_titulo'
      ? cuentas.find((c) => c.parent_code === codigo && falloCuentaEnRegla(c.account_code, cuentas) === null)
      : undefined;
    return (
      <p className="flex items-start gap-1.5 text-xs text-danger-text">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
        {fallo === 'cuenta_de_titulo'
          ? subcuenta
            ? tv('campo.agrupadoraCon', { cuenta: codigo, subcuenta: `${subcuenta.account_code} · ${subcuenta.name}` })
            : tv('campo.agrupadora', { cuenta: codigo })
          : fallo === 'cuenta_inactiva'
            ? tv('campo.inactiva', { cuenta: codigo })
            : tv('campo.inexistente', { cuenta: codigo })}
      </p>
    );
  };

  if (cargando) {
    return (
      <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  const corregida = correccion?.invalida;
  const claveAviso = corregida?.estado === 'titulo' ? 'avisoTitulo' : corregida?.estado === 'inactiva' ? 'avisoInactiva' : 'avisoInexistente';
  const claveAyuda = corregida
    ? { configuracion: 'ayudaConfiguracion', plan: 'ayudaPlan', uso: 'ayudaUso', conflicto: 'ayudaConflicto', ninguna: 'ayudaNinguna' }[corregida.evidencia]
    : 'ayudaNinguna';
  const textoBloqueo = bloqueo?.codigo === 'cuenta_de_titulo'
    ? { titulo: 'bloqueo.titulocuenta', detalle: 'bloqueo.tituloDetalle' }
    : bloqueo?.codigo === 'cuenta_inactiva'
      ? { titulo: 'bloqueo.inactiva', detalle: 'bloqueo.inactivaDetalle' }
      : { titulo: 'bloqueo.noExiste', detalle: 'bloqueo.noExisteDetalle' };

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('descripcion')}
        icono={ListChecks}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('titulo') },
        ]}
        acciones={(
          <>
            <Button type="button" variant="outline" onClick={exportar} disabled={invalidas.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t('exportar')}
            </Button>
            {puedeEscribir ? (
              <Button type="button" onClick={() => abrirFormulario()}>
                <Plus className="mr-2 h-4 w-4" />
                {t('nueva')}
              </Button>
            ) : null}
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{
                id: 'configuracion',
                etiqueta: t('configuracion'),
                icono: Settings,
                onSelect: () => router.push('/app/finanzas/configuracion-contable'),
              }]}
            />
          </>
        )}
      />

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('buscar')} />
        </div>
        <Popover open={filtrosAbiertos} onOpenChange={setFiltrosAbiertos}>
          <PopoverTrigger asChild>
            <FilterButton conteo={origen ? 1 : 0} abierto={filtrosAbiertos} />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2 p-3">
            <Label>{t('filtros.titulo')}</Label>
            <SearchSelect
              options={SOURCE_TYPES.map((fuente) => ({ value: fuente.value, label: fuente.label }))}
              value={origen || 'todos'}
              onValueChange={(valor) => setOrigen(valor === 'todos' ? '' : valor)}
              noneLabel={t('filtros.todos')}
              noneValue="todos"
              placeholder={t('filtros.etiqueta')}
              searchPlaceholder={t('filtros.etiqueta')}
            />
          </PopoverContent>
        </Popover>
      </div>

      {reglasInvalidas > 0 ? (
        <AvisoTonal
          tono="peligro"
          titulo={t('aviso.titulo', { n: reglasInvalidas })}
          descripcion={t('aviso.detalle')}
          accion={{
            etiqueta: soloInvalidas ? t('aviso.verTodas') : t('aviso.verSolo'),
            onClick: () => setSoloInvalidas((valor) => !valor),
          }}
        />
      ) : null}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(regla) => regla.id}
        estado={reglas.length === 0 ? 'vacio' : filas.length === 0 ? 'sinResultados' : 'listo'}
        termino={busqueda}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: ListChecks }}
        sinResultados={{ titulo: t('sinResultados') }}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setOrigen('');
          setSoloInvalidas(false);
        }}
        acciones={puedeEscribir ? accionesDeFila : undefined}
        etiquetaFila={(regla) => regla.name}
        atributosFila={(regla) => ({ 'data-inactiva': regla.is_active ? undefined : 'true' })}
        tarjetaMovil={(regla) => (
          <ListCard
            titulo={regla.name}
            insignia={regla.is_active ? undefined : <StatusBadge estado="inactive" etiqueta={t('inactiva')} />}
            subtitulo={`${etiquetaOrigen(regla.source_type)} · ${etiquetaEvento(regla.event_type)}`}
            meta={(
              <span className="grid gap-1 text-xs">
                <span><span className="text-fg-muted">{t('columnas.debito')}:</span> {celdaCuenta(regla, 'debito')}</span>
                <span><span className="text-fg-muted">{t('columnas.credito')}:</span> {celdaCuenta(regla, 'credito')}</span>
                {porRegla.has(regla.id) ? celdaPropuesta(regla) : null}
              </span>
            )}
            acciones={puedeEscribir ? accionesDeFila(regla) : undefined}
            className={regla.is_active ? undefined : 'opacity-60'}
          />
        )}
      />

      <Dialogo
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
        titulo={editando ? t('formulario.tituloEditar') : t('formulario.tituloNueva')}
        descripcion={t('formulario.descripcion')}
        ancho={1024}
        pie={<p className="text-xs text-fg-muted">{tv('permiso')}</p>}
        primario={{
          etiqueta: editando ? t('formulario.guardar') : t('formulario.crear'),
          onClick: () => void guardar(),
          cargando: guardando,
          deshabilitada: bloqueoFormulario !== null,
          motivo: bloqueoFormulario ? tv('noSePuedeGuardar') : undefined,
        }}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="regla-nombre">{t('formulario.nombre')} *</Label>
          <Input
            id="regla-nombre"
            value={formulario.name}
            onChange={(event) => setFormulario({ ...formulario, name: event.target.value })}
            placeholder={t('formulario.nombreEjemplo')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('formulario.descripcionCampo')}</Label>
          <RichTextEditor
            value={formulario.description}
            onChange={(html) => setFormulario({ ...formulario, description: html })}
            placeholder={t('formulario.descripcionEjemplo')}
            minHeight={60}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('formulario.origen')} *</Label>
            <SearchSelect
              options={SOURCE_TYPES.map((fuente) => ({ value: fuente.value, label: fuente.label }))}
              value={formulario.source_type}
              onValueChange={(source_type) => setFormulario({ ...formulario, source_type })}
              placeholder={t('formulario.seleccionar')}
              searchPlaceholder={t('formulario.origen')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('formulario.evento')} *</Label>
            <SearchSelect
              options={EVENT_TYPES.map((evento) => ({ value: evento.value, label: evento.label }))}
              value={formulario.event_type}
              onValueChange={(event_type) => setFormulario({ ...formulario, event_type })}
              placeholder={t('formulario.seleccionar')}
              searchPlaceholder={t('formulario.evento')}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('formulario.cuentaDebito')} *</Label>
            <SearchSelect
              options={opcionesCon(formulario.debit_account_code)}
              value={formulario.debit_account_code}
              onValueChange={(debit_account_code) => setFormulario({ ...formulario, debit_account_code })}
              placeholder={t('formulario.seleccionar')}
              searchPlaceholder={t('corregir.buscarCuenta')}
            />
            {avisoCuenta(formulario.debit_account_code)}
          </div>
          <div className="space-y-1.5">
            <Label>{t('formulario.cuentaCredito')} *</Label>
            <SearchSelect
              options={opcionesCon(formulario.credit_account_code)}
              value={formulario.credit_account_code}
              onValueChange={(credit_account_code) => setFormulario({ ...formulario, credit_account_code })}
              placeholder={t('formulario.seleccionar')}
              searchPlaceholder={t('corregir.buscarCuenta')}
            />
            {avisoCuenta(formulario.credit_account_code)}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t('formulario.cuentaIva')}</Label>
          <SearchSelect
            options={opcionesCon(formulario.tax_account_code)}
            value={formulario.tax_account_code}
            onValueChange={(tax_account_code) => setFormulario({ ...formulario, tax_account_code })}
            noneLabel={t('formulario.sinIva')}
            noneValue=""
            placeholder={t('formulario.sinIva')}
            searchPlaceholder={t('corregir.buscarCuenta')}
          />
          {avisoCuenta(formulario.tax_account_code)}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={formulario.use_tax_from_document}
            onCheckedChange={(use_tax_from_document) => setFormulario({ ...formulario, use_tax_from_document })}
          />
          <Label>{t('formulario.usarIva')}</Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regla-prioridad">{t('formulario.prioridad')}</Label>
          <Input
            id="regla-prioridad"
            type="number"
            value={formulario.priority}
            onChange={(event) => setFormulario({ ...formulario, priority: parseInt(event.target.value, 10) || 0 })}
          />
          <p className="text-xs text-fg-muted">{t('formulario.prioridadAyuda')}</p>
        </div>
        </div>
        <section
          aria-labelledby="vista-previa-regla"
          className="h-fit space-y-3 rounded-xl border border-line bg-subtle p-4"
        >
          <h3 id="vista-previa-regla" className="text-base font-semibold text-fg">{tv('vista.titulo')}</h3>
          {vista.estado === 'sinDatos' ? (
            <p className="text-sm text-fg-secondary">{tv('vista.sinDatos')}</p>
          ) : (
            <>
              <p className="text-sm text-fg-secondary">
                {tv('vista.ejemplo', {
                  documento: formulario.source_type ? etiquetaOrigen(formulario.source_type) : tv('vista.documento'),
                  total: formatear(vista.total),
                })}
              </p>
              <TablaContable
                lineas={vista.lineas.map((l) => ({
                  id: l.lado,
                  cuenta: l.cuenta,
                  nombreCuenta: l.nombre,
                  descripcion: tv(`vista.lado.${l.lado}`),
                  debito: l.debito,
                  credito: l.credito,
                  aviso: l.estado === 'agrupadora' ? tv('vista.agrupadora') : l.estado === 'inexistente' ? tv('vista.inexistente') : null,
                }))}
                formatear={formatear}
                enlazarMayor={false}
                etiqueta={tv('vista.titulo')}
              />
              <p
                role="status"
                className={cn(
                  'flex items-start gap-1.5 text-sm',
                  vista.estado === 'cuadra' ? 'text-success-text' : 'text-danger-text',
                )}
              >
                {vista.estado === 'cuadra' ? null : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />}
                {vista.estado === 'cuadra' || bloqueoFormulario
                  ? tv(`vista.estado.${vista.estado}`)
                  : tv(`vista.aviso.${vista.estado === 'agrupadora' ? 'agrupadora' : 'inexistente'}`)}
              </p>
            </>
          )}
        </section>
        </div>
      </Dialogo>

      <Dialogo
        abierto={correccion !== null}
        onAbiertoChange={(abierto) => { if (!abierto) setCorreccion(null); }}
        titulo={t('corregir.titulo')}
        descripcion={correccion ? `${correccion.regla.name} · ${t(`lado.${correccion.invalida.lado}`)}` : undefined}
        ancho={560}
        primario={{
          etiqueta: t('corregir.guardar'),
          onClick: () => void guardarCorreccion(),
          cargando: guardando,
          deshabilitada: !correccion?.cuenta,
        }}
      >
        {corregida ? (
          <>
            <AvisoTonal
              tono="peligro"
              titulo={t(`corregir.${claveAviso}`, { cuenta: corregida.cuenta })}
              descripcion={t('corregir.avisoDetalle')}
            />
            <div className="space-y-1.5">
              <Label>{t('corregir.cuenta')} *</Label>
              <SearchSelect
                options={opcionesCuenta}
                value={correccion?.cuenta ?? ''}
                onValueChange={(cuenta) => setCorreccion((actual) => (actual ? { ...actual, cuenta } : actual))}
                placeholder={t('corregir.cuenta')}
                searchPlaceholder={t('corregir.buscarCuenta')}
              />
              <p className="text-xs font-medium text-fg-muted">{t(`corregir.${claveAyuda}`)}</p>
            </div>
            <p className="text-sm text-fg-secondary">{t('corregir.alcance')}</p>
          </>
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={bloqueo !== null}
        onAbiertoChange={(abierto) => { if (!abierto) setBloqueo(null); }}
        titulo={t('bloqueo.titulo')}
        descripcion={bloqueo ? t('bloqueo.regla', { nombre: bloqueo.regla }) : undefined}
        ancho={560}
        textoCancelar={t('bloqueo.irAlPlan')}
        onCancelar={() => router.push(PLAN_DE_CUENTAS)}
        primario={{ etiqueta: t('bloqueo.elegirOtra'), onClick: () => setBloqueo(null) }}
      >
        {bloqueo ? (
          <AvisoTonal
            tono="peligro"
            rol="alert"
            titulo={t(textoBloqueo.titulo, { cuenta: bloqueo.cuenta })}
            descripcion={t(textoBloqueo.detalle)}
          />
        ) : null}
      </Dialogo>

      <ConfirmDialog
        abierto={porEliminar !== null}
        onAbiertoChange={(abierto) => { if (!abierto) setPorEliminar(null); }}
        titulo={t('eliminar.titulo')}
        descripcion={porEliminar ? t('eliminar.descripcion', { nombre: porEliminar.name }) : ''}
        textoConfirmar={t('eliminar.confirmar')}
        tono="peligro"
        onConfirmar={() => {
          const regla = porEliminar;
          setPorEliminar(null);
          if (regla) void ejecutar(() => ReglasContablesService.eliminarRegla(regla.id), t('exito.eliminada'), regla.name);
        }}
      />
    </div>
  );
}
