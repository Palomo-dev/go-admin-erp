'use client';

/**
 * Nómina › Préstamos y embargos (Figma 20.21): todo lo que se descuenta por nómina
 * que no es de ley. Préstamos y anticipos de la empresa (`employee_loans`, con su
 * RLS y el servicio de préstamos que ya existía) y embargos judiciales
 * (`hr_garnishments`, grupo `salario_pago`, leídos por el servidor con registro de
 * accesos). El orden y el tope legal de los embargos los aplica el motor (ADR-003 §2.7).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, BanknoteArrowDown, Eye, Pause, Play, Plus, Scale } from 'lucide-react';
import {
  ConfirmDialog,
  DataTable,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  StatCard,
  StatusBadge,
  calcularRango,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmployeeLoansService, { type EmployeeLoan } from '@/lib/services/employeeLoansService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CeldaPersona } from '../ausencias/piezasAusencias';
import { pedir } from '../personas/apiPersonas';
import { RUTA_NUEVO_PRESTAMO, codigoDeError, rutaPrestamo, useEmbargos, usePersonasNomina, type ResumenNomina } from './apiNomina';
import {
  FILTROS_DEDUCCIONES_VACIOS,
  TONO_DEDUCCION,
  filaDeEmbargo,
  filaDePrestamo,
  filtrarDeducciones,
  totalesDeducciones,
  type ClaseDeduccion,
  type EmbargoFuente,
  type EstadoDeduccion,
  type FilaDeduccion,
  type FiltrosDeducciones,
} from './nominaLogica';
import { useDinero, useErrorNomina, useFechas } from './piezasNomina';
import { DialogoEmbargo } from './DialogoEmbargo';

const CLASES: readonly ClaseDeduccion[] = ['prestamo', 'anticipo', 'embargo_alimentos', 'embargo_cooperativa', 'embargo_ordinario'];
const ESTADOS: readonly EstadoDeduccion[] = ['al_dia', 'programado', 'por_aprobar', 'activo', 'suspendido', 'en_mora', 'pagado', 'terminado', 'anulado'];

type CargaPrestamos = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; datos: EmployeeLoan[] };

export function VistaPrestamos({ resumen }: { resumen: ResumenNomina }) {
  const t = useTranslations('hrmNomina.prestamos');
  const router = useRouter();
  const f = useFechas();
  const dinero = useDinero();
  const mensajeError = useErrorNomina();
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [prestamos, setPrestamos] = useState<CargaPrestamos>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);
  const { carga: cargaEmbargos, recargar: recargarEmbargos } = useEmbargos(resumen.permisos.salario);
  const { carga: cargaPersonas } = usePersonasNomina();
  const [filtros, setFiltros] = useState<FiltrosDeducciones>(FILTROS_DEDUCCIONES_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [embargo, setEmbargo] = useState<EmbargoFuente | null>(null);
  const [cambio, setCambio] = useState<{ e: EmbargoFuente; estado: 'activo' | 'suspendido' | 'terminado' } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let vigente = true;
    setPrestamos((p) => (p.estado === 'listo' ? p : { estado: 'cargando' }));
    new EmployeeLoansService(orgId)
      .getAll()
      .then((d) => vigente && setPrestamos({ estado: 'listo', datos: d }))
      .catch(() => vigente && setPrestamos({ estado: 'error' }));
    return () => {
      vigente = false;
    };
  }, [orgId, intento]);

  const personas = useMemo(
    () => new Map((cargaPersonas.estado === 'listo' ? cargaPersonas.datos.personas : []).map((x) => [x.vinculo_id, x])),
    [cargaPersonas]
  );
  const embargos = useMemo(() => (cargaEmbargos.estado === 'listo' ? cargaEmbargos.datos.embargos : []), [cargaEmbargos]);
  const todas = useMemo<FilaDeduccion[]>(() => {
    const l = prestamos.estado === 'listo' ? prestamos.datos : [];
    return [
      ...l.map((x) => filaDePrestamo(x, hoy, personas.get(x.employment_id)?.nombre ?? null)),
      ...embargos.map((e) => filaDeEmbargo(e, personas.get(e.vinculo_id)?.nombre ?? null)),
    ];
  }, [prestamos, embargos, personas, hoy]);
  const filas = useMemo(() => filtrarDeducciones(todas, filtros), [todas, filtros]);
  const totales = useMemo(() => totalesDeducciones(todas), [todas]);
  const rango = calcularRango(pagina, tamano, filas.length);
  const visibles = filas.slice(rango.desde ? rango.desde - 1 : 0, rango.hasta);

  const cambiar = (p: Partial<FiltrosDeducciones>) => {
    setFiltros((x) => ({ ...x, ...p }));
    setPagina(1);
  };
  const limpiar = () => cambiar({ clases: [], estados: [] });

  const abrir = (x: FilaDeduccion) => {
    if (x.origen === 'prestamo') router.push(rutaPrestamo(x.id));
    else setEmbargo(embargos.find((e) => e.id === x.id) ?? null);
  };

  const accionesDe = (x: FilaDeduccion): AccionFila[] => {
    const e = x.origen === 'embargo' ? embargos.find((y) => y.id === x.id) : undefined;
    const puede = resumen.permisos.procesar && !!e;
    return [
      { id: 'ver', etiqueta: t('menu.ver'), icono: Eye, onSelect: () => abrir(x) },
      { id: 'suspender', etiqueta: t('menu.suspender'), icono: Pause, onSelect: () => e && setCambio({ e, estado: 'suspendido' }), oculta: !puede || e?.estado !== 'activo' },
      { id: 'reactivar', etiqueta: t('menu.reactivar'), icono: Play, onSelect: () => e && setCambio({ e, estado: 'activo' }), oculta: !puede || e?.estado !== 'suspendido' },
      {
        id: 'terminar',
        etiqueta: t('menu.terminar'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => e && setCambio({ e, estado: 'terminado' }),
        oculta: !puede || e?.estado === 'terminado',
      },
    ];
  };

  const origen = (x: FilaDeduccion) =>
    x.origen === 'prestamo' ? (
      <div className="min-w-0">
        <p className="truncate text-fg">{t('empresa')}</p>
        <p className="truncate text-xs text-fg-secondary">{[x.numero, x.cuotas ? t('nCuotas', { n: x.cuotas }) : null].filter(Boolean).join(' · ')}</p>
      </div>
    ) : (
      <div className="min-w-0">
        <p className="truncate text-fg">{x.acreedor ?? t('sinBeneficiario')}</p>
        <p className="truncate text-xs text-fg-secondary">
          {[x.numero, x.porcentaje !== null ? t('porcentajeSalario', { pct: Math.round(x.porcentaje * 1000) / 10 }) : x.cuota !== null ? t('ordena', { valor: dinero(x.cuota) }) : null, x.desde ? t('desde', { fecha: f.sinAnio(x.desde) }) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    );

  const tipoCelda = (x: FilaDeduccion) => <StatusBadge estado={x.clase} etiqueta={t(`clases.${x.clase}`)} tono="neutro" apariencia="contorno" />;
  const estadoCelda = (x: FilaDeduccion) => <StatusBadge estado={x.estado} etiqueta={t(`estados.${x.estado}`)} tono={TONO_DEDUCCION[x.estado]} />;

  const columnas: ColumnaTabla<FilaDeduccion>[] = [
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: tipoCelda, ocultarDebajo: 'md' },
    { id: 'empleado', encabezado: t('columnas.empleado'), celda: (x) => <CeldaPersona fila={{ nombre: x.nombre, cargo: personas.get(x.vinculo_id)?.cargo ?? null, area: personas.get(x.vinculo_id)?.area ?? null }} /> },
    { id: 'origen', encabezado: t('columnas.origen'), celda: origen, ocultarDebajo: 'lg' },
    {
      id: 'monto',
      encabezado: t('columnas.monto'),
      variante: 'importe',
      celda: (x) => (x.porcentaje !== null ? `${Math.round(x.porcentaje * 1000) / 10} %` : dinero(x.monto)),
    },
    { id: 'cuota', encabezado: t('columnas.cuota'), variante: 'importe', ocultarDebajo: 'md', celda: (x) => (x.cuota === null ? '—' : dinero(x.cuota)) },
    { id: 'saldo', encabezado: t('columnas.saldo'), variante: 'importe', ocultarDebajo: 'lg', celda: (x) => (x.saldo === null ? '—' : dinero(x.saldo)) },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoCelda },
  ];

  const chips: ChipFiltro[] = [
    ...(filtros.clases.length ? [{ clave: 'clases', etiqueta: filtros.clases.map((c) => t(`clases.${c}`)).join(', ') }] : []),
    ...(filtros.estados.length ? [{ clave: 'estados', etiqueta: filtros.estados.map((c) => t(`estados.${c}`)).join(', ') }] : []),
  ];

  const cargando = prestamos.estado === 'cargando' || (resumen.permisos.salario && cargaEmbargos.estado === 'cargando');
  const error = prestamos.estado === 'error' || (resumen.permisos.salario && (cargaEmbargos.estado === 'error' || cargaEmbargos.estado === 'noExiste'));
  const estadoTabla = cargando ? 'cargando' : error ? 'error' : filas.length === 0 ? (todas.length === 0 ? 'vacio' : 'sinResultados') : 'listo';

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          etiqueta={t('kpi.prestamos')}
          valor={cargando ? '—' : dinero(totales.prestamos.saldo)}
          detalle={t('kpi.prestamosDetalle', { n: totales.prestamos.n, cuotas: dinero(totales.prestamos.cuotas) })}
          cargando={cargando}
          icono={BanknoteArrowDown}
        />
        <StatCard
          etiqueta={t('kpi.embargos')}
          valor={!resumen.permisos.salario ? '—' : cargando ? '—' : dinero(totales.embargos.saldo)}
          detalle={!resumen.permisos.salario ? t('kpi.embargosSinPermiso') : t('kpi.embargosDetalle', { n: totales.embargos.activos })}
          tono={totales.embargos.activos > 0 ? 'advertencia' : undefined}
          cargando={cargando}
          icono={Scale}
        />
      </div>

      {(todas.length > 0 || cargando || filtros.texto || chips.length > 0) && !error ? (
        <ListToolbar
          busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiar({ texto: v })} placeholder={t('buscar')} etiqueta={t('buscar')} />}
          filtros={
            <FilterPanel conteo={(filtros.clases.length ? 1 : 0) + (filtros.estados.length ? 1 : 0)} onLimpiar={limpiar} textoVerResultados={t('verN', { n: filas.length })}>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.tipo')}</legend>
                {CLASES.map((c) => (
                  <label key={c} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                    <Checkbox checked={filtros.clases.includes(c)} onCheckedChange={(v) => cambiar({ clases: v === true ? [...filtros.clases, c] : filtros.clases.filter((x) => x !== c) })} />
                    {t(`clases.${c}`)}
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
                {ESTADOS.map((c) => (
                  <label key={c} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                    <Checkbox checked={filtros.estados.includes(c)} onCheckedChange={(v) => cambiar({ estados: v === true ? [...filtros.estados, c] : filtros.estados.filter((x) => x !== c) })} />
                    {t(`estados.${c}`)}
                  </label>
                ))}
              </fieldset>
            </FilterPanel>
          }
          chips={chips.length ? <FilterChips chips={chips} onQuitar={(c) => cambiar(c === 'clases' ? { clases: [] } : { estados: [] })} onLimpiarTodo={limpiar} /> : undefined}
        />
      ) : null}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(x) => `${x.origen}-${x.id}`}
        estado={estadoTabla}
        onFilaClick={abrir}
        etiquetaFila={(x) => x.nombre ?? '—'}
        acciones={accionesDe}
        tarjetaMovil={(x) => (
          <ListCard
            avatar={{ nombre: x.nombre ?? '?' }}
            titulo={x.nombre ?? '—'}
            subtitulo={t(`clases.${x.clase}`)}
            meta={x.origen === 'prestamo' ? x.numero ?? undefined : x.acreedor ?? undefined}
            valor={x.saldo === null ? undefined : dinero(x.saldo)}
            estado={estadoCelda(x)}
            onClick={() => abrir(x)}
            acciones={accionesDe(x)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: BanknoteArrowDown,
          accion: resumen.permisos.procesar ? { etiqueta: t('nuevo'), href: RUTA_NUEVO_PRESTAMO, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        onLimpiarFiltros={() => {
          setFiltros(FILTROS_DEDUCCIONES_VACIOS);
          setPagina(1);
        }}
        termino={filtros.texto}
        error={{ titulo: t('error') }}
        onReintentar={() => {
          setIntento((n) => n + 1);
          void recargarEmbargos();
        }}
        pie={
          filas.length > 0 ? (
            <Pagination
              pagina={rango.pagina}
              tamano={tamano}
              total={filas.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              opcionesTamano={[10, 25, 50]}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'femenino' }}
            />
          ) : undefined
        }
      />

      <DialogoEmbargo embargo={embargo} nombre={embargo ? personas.get(embargo.vinculo_id)?.nombre ?? null : null} onCerrar={() => setEmbargo(null)} />

      <ConfirmDialog
        abierto={cambio !== null}
        onAbiertoChange={(v) => !v && setCambio(null)}
        tono={cambio?.estado === 'terminado' ? 'peligro' : 'advertencia'}
        icono={cambio?.estado === 'terminado' ? Ban : cambio?.estado === 'suspendido' ? Pause : Play}
        titulo={cambio ? t(`cambio.${cambio.estado}.titulo`) : ''}
        descripcion={cambio ? t(`cambio.${cambio.estado}.descripcion`, { nombre: personas.get(cambio.e.vinculo_id)?.nombre ?? '—' }) : ''}
        textoConfirmar={cambio ? t(`cambio.${cambio.estado}.confirmar`) : ''}
        cargando={ocupado}
        onConfirmar={async () => {
          if (!cambio) return;
          setOcupado(true);
          try {
            await pedir('/api/hrm/nomina/embargos', { metodo: 'POST', cuerpo: { id: cambio.e.id, vinculo_id: cambio.e.vinculo_id, estado: cambio.estado } });
            toast.success(t('cambio.hecho'));
            setCambio(null);
            void recargarEmbargos();
          } catch (e) {
            toast.error(mensajeError(codigoDeError(e)));
          } finally {
            setOcupado(false);
          }
        }}
      />
    </>
  );
}
