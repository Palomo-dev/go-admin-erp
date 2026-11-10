'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as XLSX from 'xlsx';
import { BookOpen, ChevronsDownUp, ChevronsUpDown, Download, FileUp, Pencil, Plus, Power, ScrollText, Trash2 } from 'lucide-react';
import {
  ConfirmDialog,
  EmptyState,
  FilterPanel,
  FormField,
  PageHeader,
  PanelAdaptable,
  RowActionsMenu,
  SearchInput,
  clasesBoton,
  useEsEscritorio,
  type AccionFila,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { COLUMNAS_PLAN, interpretarFilas } from '@/lib/finanzas/pucExcel';
import { armarArbolPlan, esMovimientoVisible } from '@/lib/finanzas/planCuentasVista';
import {
  filasVisibles,
  indiceAltaEn,
  interpretarErrorAlta,
  nivelHija,
  planConHija,
  puedeCrearDebajo,
  saldosAcumulados,
  saldosConHija,
  siguienteHija,
  situacionPadre,
  validarCodigoHija,
  type SaldoCuenta,
} from '@/lib/finanzas/planCuentasAlta';
import { naturalezaDe, nivelDe, type NaturalezaPuc } from '@/lib/finanzas/pucJerarquia';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ContabilidadService, type ChartAccount } from '../ContabilidadService';
import { AtajosCreacionCuenta, AvisoPadreAlta, FilaAltaCuenta, FilaPlanCuenta } from './FilaPlanCuenta';
import { PanelCuenta } from './PanelCuenta';

const SELECT = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';
const MS_RECIENTE = 2500;

interface EstadoAlta {
  padre: string;
  codigo: string;
  nombre: string;
  nota: string;
  error: string | null;
  guardando: boolean;
}

type Panel = { modo: 'nueva' } | { modo: 'editar'; codigo: string } | null;

export function PlanCuentasPage() {
  const t = useTranslations('planCuentas');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const { formatear } = useMonedaOrganizacion();
  const permisos = usePermisosFinanzas();

  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [saldos, setSaldos] = useState<Map<string, SaldoCuenta>>(new Map());
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [fNivel, setFNivel] = useState('');
  const [fNaturaleza, setFNaturaleza] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fActivas, setFActivas] = useState(false);
  const [alta, setAlta] = useState<EstadoAlta | null>(null);
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>(null);
  const [aBorrar, setABorrar] = useState<ChartAccount | null>(null);
  const refArchivo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [plan, porCuenta] = await Promise.all([
        ContabilidadService.obtenerPlanCuentas(),
        ContabilidadService.obtenerSaldosPlan(),
      ]);
      setCuentas(plan);
      setSaldos(porCuenta);
      setEstado('listo');
    } catch (error) {
      console.error('Error cargando el plan de cuentas:', error);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const codigos = useMemo(() => cuentas.map((c) => c.account_code), [cuentas]);
  const conHijos = useMemo(() => new Set(cuentas.map((c) => c.parent_code).filter(Boolean) as string[]), [cuentas]);
  const acumulados = useMemo(() => saldosAcumulados(saldos), [saldos]);

  const termino = busqueda.trim().toLowerCase();
  const conteoFiltros = [fNivel, fNaturaleza, fTipo].filter(Boolean).length + (fActivas ? 1 : 0);
  const filtrando = !!termino || conteoFiltros > 0;

  const coincide = useCallback(
    (c: ChartAccount) => {
      if (termino && !c.account_code.toLowerCase().includes(termino) && !c.name.toLowerCase().includes(termino)) return false;
      if (fNivel && (c.nivel ?? nivelDe(c.account_code)) !== fNivel) return false;
      if (fNaturaleza && naturalezaDe(c.account_code, c.naturaleza) !== fNaturaleza) return false;
      if (fActivas && c.is_active === false) return false;
      if (fTipo) {
        const movimiento = esMovimientoVisible(c.es_movimiento, conHijos.has(c.account_code));
        if (fTipo === 'movimiento' && !movimiento) return false;
        if (fTipo === 'titulo' && movimiento) return false;
      }
      return true;
    },
    [termino, fNivel, fNaturaleza, fActivas, fTipo, conHijos],
  );

  const arbol = useMemo(() => armarArbolPlan(cuentas, coincide), [cuentas, coincide]);
  const filas = useMemo(() => filasVisibles(arbol, abiertos, filtrando), [arbol, abiertos, filtrando]);
  const coincidencias = useMemo(() => (filtrando ? cuentas.filter(coincide).length : 0), [filtrando, cuentas, coincide]);
  const posicionAlta = alta ? indiceAltaEn(filas, alta.padre) : -1;

  const padreAlta = alta ? cuentas.find((c) => c.account_code === alta.padre) ?? null : null;
  const saldoPadre = alta ? saldos.get(alta.padre)?.saldo ?? 0 : 0;
  const situacion = padreAlta ? situacionPadre(padreAlta, saldoPadre) : 'normal';
  // Nivel de lo que se está creando: cuenta, subcuenta, auxiliar o subauxiliar.
  const nivelAlta = alta ? nivelHija(alta.padre) ?? 'auxiliar' : 'auxiliar';

  const formatoSaldo = useCallback(
    (valor: number) => {
      if (Math.abs(valor) < 0.01) return formatear(0);
      return `${formatear(Math.abs(valor))} ${t(valor > 0 ? 'fila.debito' : 'fila.credito')}`;
    },
    [formatear, t],
  );

  const alternar = (codigo: string) => {
    setAbiertos((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(codigo)) nuevo.delete(codigo);
      else nuevo.add(codigo);
      return nuevo;
    });
  };

  const abrirAlta = (padre: ChartAccount, lista: readonly string[] = codigos) => {
    const codigo = siguienteHija(padre.account_code, lista);
    if (!codigo) {
      toastError(t('alta.sinCodigo'));
      return;
    }
    setAbiertos((previo) => new Set(previo).add(padre.account_code));
    setAlta({ padre: padre.account_code, codigo, nombre: '', nota: '', error: null, guardando: false });
  };

  const mensajeError = (error: unknown): { texto: string; saldo?: number } => {
    const leido = interpretarErrorAlta(error);
    switch (leido.tipo) {
      case 'ocupado':
        return {
          texto: leido.siguiente
            ? t('alta.errores.ocupado', { codigo: leido.siguiente })
            : t('alta.errores.ocupadoSinLibre'),
        };
      case 'saldo':
        return { texto: '', saldo: leido.saldo };
      case 'otro':
        return { texto: leido.texto || t('alta.errores.otro') };
      case 'codigo':
        return { texto: t('alta.errores.codigo', { digitos: (alta?.padre.length ?? 6) + 2, padre: alta?.padre ?? '' }) };
      default:
        return { texto: t(`alta.errores.${leido.tipo}`, { nivel: nivelAlta }) };
    }
  };

  const guardarAlta = async (trasladar: boolean) => {
    if (!alta || !padreAlta) return;
    const nombre = alta.nombre.trim();
    if (!nombre) {
      setAlta({ ...alta, error: t('alta.errores.nombre', { nivel: nivelAlta }) });
      return;
    }
    if (validarCodigoHija(alta.padre, alta.codigo)) {
      setAlta({ ...alta, error: t('alta.errores.codigo', { digitos: alta.padre.length + 2, padre: alta.padre }) });
      return;
    }
    setAlta({ ...alta, guardando: true, error: null });
    try {
      const creado = await ContabilidadService.crearCuentaHija({
        padre: alta.padre,
        nombre,
        codigo: alta.codigo,
        trasladarSaldo: trasladar,
        nota: alta.nota.trim() || null,
      });
      const nueva: ChartAccount = {
        ...padreAlta,
        account_code: creado.account_code,
        name: nombre,
        parent_code: alta.padre,
        es_movimiento: true,
        is_active: true,
        nivel: nivelDe(creado.account_code),
        description: null,
      };
      const plan = planConHija(cuentas, alta.padre, nueva);
      setCuentas(plan);
      setSaldos((previo) => saldosConHija(previo, alta.padre, creado.account_code, creado.saldo_trasladado));
      setRecientes((previo) => new Set(previo).add(creado.account_code));
      window.setTimeout(() => {
        setRecientes((previo) => {
          const nuevo = new Set(previo);
          nuevo.delete(creado.account_code);
          return nuevo;
        });
      }, MS_RECIENTE);
      if (creado.asientos.length > 0) toastSuccess(t('alta.trasladoHecho', { asientos: creado.asientos.length }));
      const actualizado = plan.find((c) => c.account_code === alta.padre);
      if (actualizado) abrirAlta(actualizado, plan.map((c) => c.account_code));
    } catch (error) {
      const { texto, saldo } = mensajeError(error);
      if (saldo != null) {
        // El saldo cambió desde que se cargó el plan: se muestra el aviso de traslado.
        setSaldos((previo) => new Map(previo).set(alta.padre, { saldo, movimientos: previo.get(alta.padre)?.movimientos ?? 1 }));
        setAlta((previo) => (previo ? { ...previo, guardando: false } : previo));
      } else {
        setAlta((previo) => (previo ? { ...previo, guardando: false, error: texto } : previo));
      }
    }
  };

  const exportar = () => {
    const filasExcel = cuentas.map((cuenta) => ({
      codigo: cuenta.account_code,
      nombre: cuenta.name,
      tipo: cuenta.type,
      padre: cuenta.parent_code ?? '',
      naturaleza: naturalezaDe(cuenta.account_code, cuenta.naturaleza) ?? '',
      es_movimiento: esMovimientoVisible(cuenta.es_movimiento, conHijos.has(cuenta.account_code)),
      requiere_tercero: cuenta.requiere_tercero ?? false,
      requiere_centro_costo: cuenta.requiere_centro_costo ?? false,
      activa: cuenta.is_active !== false,
      descripcion: cuenta.description ?? '',
    }));
    const hoja = XLSX.utils.json_to_sheet(filasExcel, { header: [...COLUMNAS_PLAN] });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, t('titulo'));
    const bytes = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([bytes]));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'plan-de-cuentas.xlsx';
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (archivo: File) => {
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
    const padresActuales: Record<string, string | null> = {};
    for (const cuenta of cuentas) padresActuales[cuenta.account_code] = cuenta.parent_code;
    const { filas: filasArchivo, errores } = interpretarFilas(crudas, codigos, padresActuales);
    if (errores.length > 0) {
      toastError(errores.slice(0, 3).join(' '));
      return;
    }
    for (const fila of filasArchivo) {
      const datos: Partial<ChartAccount> = {
        name: fila.nombre,
        type: fila.tipo,
        parent_code: fila.padre,
        description: fila.descripcion,
        naturaleza: fila.naturaleza,
        es_movimiento: fila.esMovimiento,
        requiere_tercero: fila.requiereTercero,
        requiere_centro_costo: fila.requiereCentroCosto,
        is_active: fila.activa,
      };
      const previa = cuentas.find((c) => c.account_code === fila.codigo);
      if (previa) {
        if (previa.es_movimiento == null) delete datos.es_movimiento;
        await ContabilidadService.actualizarCuenta(fila.codigo, datos);
      } else {
        await ContabilidadService.crearCuenta({ ...datos, account_code: fila.codigo });
      }
    }
    toastSuccess(t('importadas', { cuentas: filasArchivo.length }));
    await cargar();
  };

  const cambiarActiva = async (cuenta: ChartAccount) => {
    try {
      const nueva = cuenta.is_active === false;
      await ContabilidadService.actualizarCuenta(cuenta.account_code, { is_active: nueva });
      setCuentas((previo) => previo.map((c) => (c.account_code === cuenta.account_code ? { ...c, is_active: nueva } : c)));
      toastSuccess(t(nueva ? 'fila.activada' : 'fila.desactivada'));
    } catch (error) {
      console.error('Error cambiando el estado de la cuenta:', error);
      toastError(t('errores.guardar'));
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    try {
      await ContabilidadService.eliminarCuenta(aBorrar.account_code);
      setCuentas((previo) => previo.filter((c) => c.account_code !== aBorrar.account_code));
      toastSuccess(t('fila.eliminada'));
    } catch (error) {
      console.error('Error eliminando la cuenta:', error);
      toastError(t('errores.eliminar'));
    } finally {
      setABorrar(null);
    }
  };

  const accionesFila = (cuenta: ChartAccount): AccionFila[] => {
    const tieneMovimientos = (saldos.get(cuenta.account_code)?.movimientos ?? 0) > 0;
    const tieneHijos = conHijos.has(cuenta.account_code);
    return [
      { id: 'editar', etiqueta: t('fila.editar'), icono: Pencil, onSelect: () => setPanel({ modo: 'editar', codigo: cuenta.account_code }) },
      {
        id: 'mayor',
        etiqueta: t('fila.verMayor'),
        icono: ScrollText,
        onSelect: () => router.push(`/app/reportes/contabilidad/mayor-cuenta?periodo=anual&cuenta=${encodeURIComponent(cuenta.account_code)}`),
      },
      {
        id: 'activa',
        etiqueta: t(cuenta.is_active === false ? 'fila.activar' : 'fila.desactivar'),
        icono: Power,
        onSelect: () => void cambiarActiva(cuenta),
        oculta: !permisos.crear,
      },
      {
        id: 'eliminar',
        etiqueta: t('fila.eliminar'),
        icono: Trash2,
        destructiva: true,
        onSelect: () => setABorrar(cuenta),
        oculta: !permisos.crear || tieneMovimientos || tieneHijos,
      },
    ];
  };

  const accionesCabecera: AccionFila[] = [
    { id: 'expandir', etiqueta: t('expandir'), icono: ChevronsUpDown, onSelect: () => setAbiertos(new Set(codigos)) },
    { id: 'colapsar', etiqueta: t('colapsar'), icono: ChevronsDownUp, onSelect: () => setAbiertos(new Set()) },
    { id: 'importar', etiqueta: t('importar'), icono: FileUp, onSelect: () => refArchivo.current?.click(), oculta: !permisos.crear, separadorAntes: true },
  ];

  const limpiarFiltros = () => {
    setFNivel('');
    setFNaturaleza('');
    setFTipo('');
    setFActivas(false);
  };

  const cuentaPanel = panel?.modo === 'editar' ? cuentas.find((c) => c.account_code === panel.codigo) ?? null : null;
  const movimientos = cuentas.filter((c) => esMovimientoVisible(c.es_movimiento, conHijos.has(c.account_code))).length;

  const migas = [
    { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
    { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
    { etiqueta: t('titulo') },
  ];

  const nombreNaturaleza = (codigo: string, explicita?: NaturalezaPuc | null) => {
    const valor = naturalezaDe(codigo, explicita);
    return valor ? t(`naturaleza.${valor}`) : null;
  };

  const altaEnFila = alta && escritorio;

  return (
    <div className="flex min-h-full flex-col gap-4 bg-page p-4 sm:p-6">
      <input
        ref={refArchivo}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        aria-label={t('importar')}
        onChange={(evento) => {
          const archivo = evento.target.files?.[0];
          evento.target.value = '';
          if (archivo) {
            importar(archivo).catch((error) => {
              console.error('Error importando el plan:', error);
              toastError(t('errores.importar'));
            });
          }
        }}
      />

      <PageHeader
        titulo={t('titulo')}
        subtitulo={estado === 'listo' ? t('subtitulo', { cuentas: cuentas.length, movimiento: movimientos }) : t('decreto')}
        icono={BookOpen}
        migas={migas}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <button type="button" onClick={exportar} disabled={estado !== 'listo'} className={clasesBoton({ variante: 'secundario' })}>
              <Download className="size-4" aria-hidden />
              {t('exportar')}
            </button>
            {permisos.crear ? (
              <button type="button" onClick={() => setPanel({ modo: 'nueva' })} className={clasesBoton({ variante: 'primario' })}>
                <Plus className="size-4" aria-hidden />
                {t('nuevaCuenta')}
              </button>
            ) : null}
            <RowActionsMenu acciones={accionesCabecera} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
          </>
        }
      />

      <div className="flex items-center gap-2">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          onValueChange={setBusqueda}
          placeholder={t('buscar')}
          className="flex-1"
        />
        <FilterPanel conteo={conteoFiltros} onLimpiar={limpiarFiltros} textoVerResultados={t('verResultados', { cuentas: coincidencias })}>
          <FormField etiqueta={t('filtros.nivel')}>
            <select className={SELECT} value={fNivel} onChange={(e) => setFNivel(e.target.value)}>
              <option value="">{t('filtros.todos')}</option>
              {(['clase', 'grupo', 'cuenta', 'subcuenta', 'auxiliar', 'subauxiliar', 'legacy'] as const).map((n) => (
                <option key={n} value={n}>{t(`nivel.${n}`)}</option>
              ))}
            </select>
          </FormField>
          <FormField etiqueta={t('filtros.naturaleza')}>
            <select className={SELECT} value={fNaturaleza} onChange={(e) => setFNaturaleza(e.target.value)}>
              <option value="">{t('filtros.todos')}</option>
              {(['debito', 'credito', 'orden'] as const).map((n) => (
                <option key={n} value={n}>{t(`naturaleza.${n}`)}</option>
              ))}
            </select>
          </FormField>
          <FormField etiqueta={t('filtros.tipo')}>
            <select className={SELECT} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="">{t('filtros.titulosYMovimiento')}</option>
              <option value="movimiento">{t('filtros.movimiento')}</option>
              <option value="titulo">{t('filtros.titulo')}</option>
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={fActivas} onChange={(e) => setFActivas(e.target.checked)} />
            {t('filtros.soloActivas')}
          </label>
        </FilterPanel>
      </div>

      {estado === 'error' ? (
        <EmptyState variante="error" titulo={t('errores.cargarTitulo')} descripcion={t('errores.cargar')} onReintentar={() => void cargar()} />
      ) : estado === 'cargando' ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface" aria-busy>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex h-10 items-center gap-4 border-b border-line px-3 last:border-b-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-20 lg:block" />
              <Skeleton className="hidden h-4 w-16 lg:block" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      ) : filas.length === 0 ? (
        filtrando ? (
          <EmptyState
            variante="search"
            termino={busqueda || undefined}
            onLimpiarFiltros={() => {
              setBusqueda('');
              limpiarFiltros();
            }}
          />
        ) : (
          <EmptyState variante="empty" titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
        )
      ) : (
        <div role="table" aria-label={t('titulo')} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div role="row" className="hidden border-b border-line bg-subtle py-2.5 text-xs font-semibold text-fg-secondary lg:flex">
            <div role="columnheader" className="flex-1 px-3">{t('columnas.cuenta')}</div>
            <div role="columnheader" className="w-[110px] shrink-0 px-3">{t('columnas.nivel')}</div>
            <div role="columnheader" className="w-[96px] shrink-0 px-3">{t('columnas.naturaleza')}</div>
            <div role="columnheader" className="w-[170px] shrink-0 px-3 text-right">{t('columnas.saldo')}</div>
            <div role="columnheader" className="w-[190px] shrink-0" aria-label={t('columnas.acciones')} />
          </div>
          {filas.map(({ nodo, nivel }, indice) => {
            const cuenta = nodo.cuenta;
            const codigo = cuenta.account_code;
            const tieneHijos = nodo.children.length > 0;
            const abierta = filtrando || abiertos.has(codigo);
            const nivelPuc = cuenta.nivel ?? nivelDe(codigo);
            return (
              <Fragment key={codigo}>
                <FilaPlanCuenta
                  codigo={codigo}
                  nombre={cuenta.name}
                  nivel={nivel}
                  etiquetaNivel={t(`nivel.${nivelPuc}`)}
                  naturaleza={nombreNaturaleza(codigo, cuenta.naturaleza)}
                  saldo={formatoSaldo(acumulados.get(codigo) ?? 0)}
                  rama={tieneHijos ? (abierta ? 'abierta' : 'cerrada') : 'hoja'}
                  inactiva={cuenta.is_active === false}
                  resaltada={filtrando && coincide(cuenta)}
                  reciente={recientes.has(codigo)}
                  crearDebajo={permisos.crear && puedeCrearDebajo(cuenta) ? t(`nivel.${nivelHija(codigo)}`) : undefined}
                  acciones={accionesFila(cuenta)}
                  onAlternar={() => alternar(codigo)}
                  onAbrir={() => setPanel({ modo: 'editar', codigo })}
                  onCrearDebajo={() => abrirAlta(cuenta)}
                />
                {altaEnFila && padreAlta && indice === posicionAlta ? (
                  <>
                    <FilaAltaCuenta
                      nivel={nivel + (codigo === alta.padre ? 1 : 0)}
                      nivelPuc={nivelAlta}
                      largoCodigo={alta.padre.length + 2}
                      codigo={alta.codigo}
                      nombre={alta.nombre}
                      error={alta.error}
                      guardando={alta.guardando}
                      bloqueada={situacion === 'con_saldo'}
                      onCodigo={(valor) => setAlta({ ...alta, codigo: valor, error: null })}
                      onNombre={(valor) => setAlta({ ...alta, nombre: valor, error: null })}
                      onGuardar={() => void guardarAlta(false)}
                      onCancelar={() => setAlta(null)}
                    />
                    {situacion !== 'normal' ? (
                      <AvisoPadreAlta
                        situacion={situacion}
                        nivel={nivel + (codigo === alta.padre ? 1 : 0)}
                        codigoPadre={padreAlta.account_code}
                        nombrePadre={padreAlta.name}
                        saldo={formatoSaldo(saldoPadre)}
                        nota={alta.nota}
                        guardando={alta.guardando}
                        onNota={(valor) => setAlta({ ...alta, nota: valor })}
                        onTrasladar={() => void guardarAlta(true)}
                      />
                    ) : null}
                  </>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      )}

      {filtrando && estado === 'listo' && filas.length > 0 ? (
        <p className="text-[13px] text-fg-secondary">{t('resultado', { cuentas: coincidencias })}</p>
      ) : null}
      {altaEnFila ? <AtajosCreacionCuenta nivelPuc={nivelAlta} /> : null}

      {!escritorio && alta && padreAlta ? (
        <PanelAdaptable
          abierto
          onAbiertoChange={(abierto) => !abierto && setAlta(null)}
          titulo={t('alta.tituloHoja', { nivel: nivelAlta })}
          descripcion={t('alta.debajoDe', { cuenta: `${padreAlta.account_code} ${padreAlta.name}` })}
          ocupado={alta.guardando}
          pie={
            <div className="flex w-full flex-col gap-2">
              {situacion === 'con_saldo' ? (
                <button type="button" onClick={() => void guardarAlta(true)} disabled={alta.guardando} className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}>
                  {t('alta.trasladar')}
                </button>
              ) : (
                <button type="button" onClick={() => void guardarAlta(false)} disabled={alta.guardando} className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}>
                  {t('alta.guardarYOtro', { nivel: nivelAlta })}
                </button>
              )}
              <button type="button" onClick={() => setAlta(null)} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
                {t('alta.terminar')}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3 pb-2">
            <FormField etiqueta={t('alta.codigo')} error={alta.error ?? undefined}>
              <Input inputMode="numeric" maxLength={alta.padre.length + 2} value={alta.codigo} onChange={(e) => setAlta({ ...alta, codigo: e.target.value.replace(/[^0-9]/g, ''), error: null })} />
            </FormField>
            <FormField etiqueta={t('alta.nombre')} obligatorio>
              <Input maxLength={200} placeholder={t('alta.nombrePlaceholder', { nivel: nivelAlta })} value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value, error: null })} />
            </FormField>
            {situacion !== 'normal' ? (
              <AvisoPadreAlta
                situacion={situacion}
                nivel={-1}
                codigoPadre={padreAlta.account_code}
                nombrePadre={padreAlta.name}
                saldo={formatoSaldo(saldoPadre)}
                nota={alta.nota}
                guardando={alta.guardando}
                onNota={(valor) => setAlta({ ...alta, nota: valor })}
                onTrasladar={() => void guardarAlta(true)}
              />
            ) : null}
          </div>
        </PanelAdaptable>
      ) : null}

      {panel ? (
        <PanelCuenta
          key={panel.modo === 'editar' ? panel.codigo : 'nueva'}
          cuenta={cuentaPanel}
          cuentas={cuentas}
          saldo={cuentaPanel ? saldos.get(cuentaPanel.account_code) ?? null : null}
          textoSaldo={cuentaPanel ? formatoSaldo(saldos.get(cuentaPanel.account_code)?.saldo ?? 0) : ''}
          puedeEditar={permisos.crear}
          onCerrar={() => setPanel(null)}
          onGuardada={(guardada, esNueva) => {
            setCuentas((previo) => {
              const resto = previo.filter((c) => c.account_code !== guardada.account_code);
              return [...resto, guardada].sort((a, b) => a.account_code.localeCompare(b.account_code));
            });
            if (esNueva && guardada.parent_code) {
              setAbiertos((previo) => new Set(previo).add(guardada.parent_code as string));
            }
            setPanel(null);
          }}
          onCambiarActiva={(cuenta) => void cambiarActiva(cuenta)}
        />
      ) : null}

      <ConfirmDialog
        abierto={!!aBorrar}
        onAbiertoChange={(abierto) => !abierto && setABorrar(null)}
        titulo={t('eliminar.titulo', { cuenta: aBorrar ? `${aBorrar.account_code} ${aBorrar.name}` : '' })}
        descripcion={t('eliminar.descripcion')}
        textoConfirmar={t('eliminar.confirmar')}
        tono="peligro"
        onConfirmar={borrar}
      />
    </div>
  );
}
