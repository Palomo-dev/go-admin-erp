'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeftRight, ListChecks, Loader2, Sparkles } from 'lucide-react';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { Dialogo } from '@/components/kit/Dialogo';
import { EmptyState } from '@/components/kit/EmptyState';
import { PageHeader } from '@/components/kit/PageHeader';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { SeccionPlegable } from '@/components/kit/SeccionPlegable';
import { SelectorCuenta, type OpcionCuenta } from '@/components/kit/SelectorCuenta';
import { TabBar, idPanel, idPestana } from '@/components/kit/TabBar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranch } from '@/lib/context/BranchContext';
import {
  CLAVES_CONTABLES,
  nombreSector,
  propuestaPorSector,
  validarCuentaDeMovimiento,
  type ClaveContable,
  type CuentaContable,
  type DefinicionClave,
  type FilaConfiguracion,
} from '@/lib/finanzas/configuracionContable';
import { GRUPOS_ABIERTOS, definicionesPorGrupo, origenDeClave, type GrupoConfiguracion } from '@/lib/finanzas/configuracionGrupos';
import { buscarCuentas } from '@/components/finanzas/contabilidad/cuentas/CuentasAutomaticasService';
import { useCuentasEfectivas } from '@/components/finanzas/contabilidad/cuentas/useCuentasEfectivas';
import { AlertasFalloContable } from './AlertasFalloContable';
import { ConfiguracionContableService, configuracionesInvalidas, type MapeoSede } from './ConfiguracionContableService';
import { PorCategoria } from './PorCategoria';

const USAR_REGLA = 'regla';
const PESTANAS = 'config-contable';
const GRUPOS = definicionesPorGrupo();
const CONSULTA_INGRESO = [{ clave: 'ingreso', rol: 'ingreso' as const }];

type Pestana = 'defecto' | 'categoria' | 'fallos';
type Elecciones = Record<ClaveContable, string>;

function vacias(): Elecciones {
  return Object.fromEntries(CLAVES_CONTABLES.map((clave) => [clave, USAR_REGLA])) as Elecciones;
}

function eleccionesDe(filas: FilaConfiguracion[], branchId: number | null): Elecciones {
  const base = vacias();
  for (const fila of filas) {
    if (branchId == null ? fila.branch_id == null : fila.branch_id === branchId) {
      base[fila.clave] = fila.account_code;
    }
  }
  return base;
}

export function ConfiguracionContablePage() {
  const t = useTranslations('cuentasAutomaticas');
  const { branches } = useBranch();
  const [pestana, setPestana] = useState<Pestana>('defecto');
  const [filas, setFilas] = useState<FilaConfiguracion[]>([]);
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [mapeos, setMapeos] = useState<MapeoSede[]>([]);
  const [alcance, setAlcance] = useState('org');
  const [elecciones, setElecciones] = useState<Elecciones>(vacias);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const [reclasificarAbierto, setReclasificarAbierto] = useState(false);
  const [reclasificando, setReclasificando] = useState(false);
  const [tipo, setTipo] = useState<number | null>(null);
  const [editando, setEditando] = useState<ClaveContable | null>(null);
  const [nuevaCuenta, setNuevaCuenta] = useState<OpcionCuenta | null>(null);
  const [fallos, setFallos] = useState(0);

  const branchId = alcance === 'org' ? null : Number(alcance);
  const sedes = branches.filter((sede) => typeof sede.id === 'number');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([
      ConfiguracionContableService.listar(),
      ConfiguracionContableService.cuentas(),
      ConfiguracionContableService.mapeosInventario().catch((error) => {
        console.error(error);
        return [] as MapeoSede[];
      }),
      ConfiguracionContableService.tipoNegocio().catch(() => null),
      ConfiguracionContableService.fallosPendientes(1).catch(() => ({ total: 0, filas: [] })),
    ]).then(([guardadas, plan, mapeosSede, tipoNegocio, pendientes]) => {
      if (!vivo) return;
      setFilas(guardadas);
      setCuentas(plan);
      setMapeos(mapeosSede);
      setTipo(tipoNegocio);
      setFallos(pendientes.total);
    }).catch((error) => {
      console.error(error);
      if (vivo) toast.error(t('config.errorCargar'));
    }).finally(() => {
      if (vivo) setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [t]);

  useEffect(() => {
    if (!cargando) setElecciones(eleccionesDe(filas, branchId));
  }, [alcance, filas, cargando, branchId]);

  // La venta hoy puede tomar la cuenta de la regla, no estas claves. La pantalla lo dice.
  const { porClave: ingreso } = useCuentasEfectivas(branchId, 'catalogo', CONSULTA_INGRESO, pestana === 'defecto');
  const ingresoEfectivo = ingreso.get('ingreso');

  const nombreCuenta = (codigo: string) => cuentas.find((c) => c.account_code === codigo)?.name ?? '';
  const propuesta = propuestaPorSector(tipo);
  const sedePrincipalId = (sedes.find((sede) => sede.is_main === true) ?? sedes[0])?.id ?? null;
  const invalidas = useMemo(
    () => configuracionesInvalidas(filas, cuentas, mapeos, sedePrincipalId)
      .filter((item) => (branchId == null ? item.branch_id == null : item.branch_id === branchId)),
    [filas, cuentas, mapeos, sedePrincipalId, branchId],
  );
  const invalidaDe = (clave: ClaveContable) => invalidas.find((item) => item.clave === clave && elecciones[clave] === item.account_code);

  const guardar = async (siguientes: Elecciones) => {
    for (const clave of CLAVES_CONTABLES) {
      const cuenta = siguientes[clave];
      if (cuenta === USAR_REGLA) continue;
      const mensaje = validarCuentaDeMovimiento(cuenta, cuentas);
      if (mensaje) {
        toast.error(mensaje);
        return;
      }
    }

    const payload = Object.fromEntries(
      CLAVES_CONTABLES.map((clave) => [clave, siguientes[clave] === USAR_REGLA ? null : siguientes[clave]]),
    ) as Partial<Record<ClaveContable, string | null>>;

    setGuardando(true);
    try {
      await ConfiguracionContableService.guardar(branchId, payload);
      toast.success(branchId == null ? t('config.guardadaOrganizacion') : t('config.guardadaSede'));
      setFilas(await ConfiguracionContableService.listar());
    } catch (error) {
      console.error(error);
      toast.error(t('config.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const filasPropuesta = CLAVES_CONTABLES.map((clave) => {
    const codigo = clave === 'inventario'
      ? cuentas.find((c) => /^143501\d{2}$/.test(c.account_code) && c.es_movimiento !== false && c.is_active !== false)?.account_code ?? propuesta[clave]
      : propuesta[clave];
    const cuenta = cuentas.find((item) => item.account_code === codigo);
    const sirve = !!cuenta && cuenta.es_movimiento !== false && cuenta.is_active !== false;
    return { clave, codigo, sirve, nombreCuenta: cuenta?.name };
  });

  const aplicarAsistente = async () => {
    const siguientes = vacias();
    for (const fila of filasPropuesta) {
      if (fila.sirve) siguientes[fila.clave] = fila.codigo;
    }
    setElecciones(siguientes);
    setAsistenteAbierto(false);
    await guardar(siguientes);
  };

  const reclasificar = () => {
    setReclasificando(true);
    void ConfiguracionContableService.reclasificarIvaGenerado()
      .then((r) => {
        if (r.repetida) toast.message(t('config.reclasificar.repetida'));
        else if (!r.journal_entry_id || r.monto <= 0.01) toast.message(t('config.reclasificar.sinSaldo'));
        else toast.success(t('config.reclasificar.creado'));
        setReclasificarAbierto(false);
      })
      .catch(() => toast.error(t('config.reclasificar.error')))
      .finally(() => setReclasificando(false));
  };

  const textoOrigen = (clave: ClaveContable) => {
    const valor = elecciones[clave] === USAR_REGLA ? null : elecciones[clave];
    return t(`config.origen.${origenDeClave({ clave, valor, branchId, filas, propuesta })}`);
  };

  const textoCuenta = (clave: ClaveContable) => {
    const valor = elecciones[clave];
    if (valor !== USAR_REGLA) return `${valor} · ${nombreCuenta(valor)}`;
    const deLaEmpresa = branchId != null ? filas.find((f) => f.clave === clave && f.branch_id == null)?.account_code : null;
    return deLaEmpresa ? `${deLaEmpresa} · ${nombreCuenta(deLaEmpresa)}` : t('config.usaRegla');
  };

  const columnasDe = (grupo: GrupoConfiguracion): ColumnaTabla<DefinicionClave>[] => [
    {
      id: 'clave',
      encabezado: t(`config.grupo.${grupo}`),
      celda: (d) => (
        <span title={t(`claves.${d.clave}.ayuda`)} className="font-medium text-fg">{t(`claves.${d.clave}.nombre`)}</span>
      ),
    },
    {
      id: 'cuenta',
      encabezado: t('config.cuenta'),
      celda: (d) => {
        const invalida = invalidaDe(d.clave);
        return (
          <span className={invalida ? 'text-warning-text' : elecciones[d.clave] === USAR_REGLA ? 'text-fg-secondary' : 'text-fg'}>
            {textoCuenta(d.clave)}
          </span>
        );
      },
    },
    { id: 'origen', encabezado: t('config.origenColumna'), celda: (d) => <span className="text-fg-secondary">{textoOrigen(d.clave)}</span>, ocultarDebajo: 'sm' },
    {
      id: 'cambiar',
      encabezado: '',
      alinear: 'derecha',
      ancho: 96,
      celda: (d) => (
        <button
          type="button"
          onClick={() => {
            setNuevaCuenta(null);
            setEditando(d.clave);
          }}
          className="text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('accion.cambiar')}
        </button>
      ),
    },
  ];

  const tablaGrupo = (grupo: GrupoConfiguracion, definiciones: DefinicionClave[]) => (
    <DataTable
      columnas={columnasDe(grupo)}
      filas={definiciones}
      obtenerId={(d) => d.clave}
      etiqueta={t(`config.grupo.${grupo}`)}
      densidad="compacta"
      tonoFila={(d) => (invalidaDe(d.clave) ? 'advertencia' : undefined)}
    />
  );

  const aviso = invalidas[0];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('config.titulo')}
        subtitulo={pestana === 'categoria' ? t('config.subtituloCategoria') : t('config.subtitulo')}
        icono={ListChecks}
        migas={[{ etiqueta: t('config.migaFinanzas'), href: '/app/finanzas' }, { etiqueta: t('config.migaContabilidad'), href: '/app/finanzas/contabilidad' }, { etiqueta: t('config.titulo') }]}
        acciones={
          pestana === 'defecto' ? (
            <>
              <Button variant="outline" onClick={() => setAsistenteAbierto(true)} disabled={cargando}>
                <Sparkles className="mr-2 size-4" strokeWidth={1.5} />
                {t('config.proponer')}
              </Button>
              <Button onClick={() => void guardar(elecciones)} disabled={guardando || cargando}>
                {guardando && <Loader2 className="mr-2 size-4 animate-spin" strokeWidth={1.5} />}
                {t('config.guardar')}
              </Button>
              <RowActionsMenu
                orientacion="horizontal"
                tamano="md"
                titulo={t('config.titulo')}
                acciones={[{ id: 'reclasificar', etiqueta: t('config.reclasificar.accion'), icono: ArrowLeftRight, onSelect: () => setReclasificarAbierto(true) }]}
              />
            </>
          ) : undefined
        }
      />

      <TabBar<Pestana>
        id={PESTANAS}
        etiqueta={t('config.titulo')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'defecto', etiqueta: t('config.pestanaDefecto') },
          { valor: 'categoria', etiqueta: t('config.pestanaCategoria') },
          { valor: 'fallos', etiqueta: t('config.pestanaFallos'), contador: fallos },
        ]}
      />

      <div role="tabpanel" id={idPanel(PESTANAS, pestana)} aria-labelledby={idPestana(PESTANAS, pestana)} className="flex flex-col gap-4">
        {pestana === 'defecto' && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <div className="w-full max-w-xs space-y-1.5">
                <Label htmlFor="config-alcance">{t('config.aplicarA')}</Label>
                <Select value={alcance} onValueChange={setAlcance}>
                  <SelectTrigger id="config-alcance">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">{t('config.todaOrganizacion')}</SelectItem>
                    {sedes.map((sede) => (
                      <SelectItem key={sede.id} value={String(sede.id)}>{sede.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-fg-secondary sm:pb-2">{t('config.ayudaAlcance')}</p>
            </div>

            {aviso && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('config.revisar.titulo', { n: invalidas.length })}
                descripcion={
                  aviso.sugerida
                    ? t('config.revisar.conSugerida', { clave: t(`claves.${aviso.clave}.nombre`), cuenta: aviso.account_code, sugerida: aviso.sugerida })
                    : t('config.revisar.sinSugerida', { clave: t(`claves.${aviso.clave}.nombre`), cuenta: aviso.account_code })
                }
                accion={
                  aviso.sugerida
                    ? { etiqueta: t('config.revisar.usar'), onClick: () => setElecciones((prev) => ({ ...prev, [aviso.clave]: aviso.sugerida as string })) }
                    : undefined
                }
              />
            )}

            {cargando ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              GRUPOS.map(({ grupo, definiciones }) => {
                const avisoVentas = grupo === 'ventas' && ingresoEfectivo?.origen === 'regla' && ingresoEfectivo.cuenta ? (
                  <AvisoTonal compacto tono="informacion" titulo={t('config.ventasPorRegla', { cuenta: ingresoEfectivo.cuenta })} />
                ) : null;
                return GRUPOS_ABIERTOS.includes(grupo) ? (
                  <div key={grupo} className="flex flex-col gap-2">
                    {avisoVentas}
                    {tablaGrupo(grupo, definiciones)}
                  </div>
                ) : (
                  <SeccionPlegable key={grupo} titulo={t(`config.grupo.${grupo}`)} resumen={t('config.nClaves', { n: definiciones.length })}>
                    {tablaGrupo(grupo, definiciones)}
                  </SeccionPlegable>
                );
              })
            )}
          </>
        )}

        {pestana === 'categoria' && <PorCategoria />}

        {pestana === 'fallos' && (
          <>
            <AlertasFalloContable />
            {fallos === 0 && <EmptyState titulo={t('config.sinFallos')} descripcion={t('config.sinFallosAyuda')} />}
          </>
        )}
      </div>

      <Dialogo
        abierto={!!editando}
        onAbiertoChange={(v) => !v && setEditando(null)}
        titulo={editando ? t(`claves.${editando}.nombre`) : ''}
        descripcion={editando ? t(`claves.${editando}.ayuda`) : undefined}
        ancho={520}
        secundarios={[{
          etiqueta: t('config.usarRegla'),
          onClick: () => {
            if (editando) setElecciones((prev) => ({ ...prev, [editando]: USAR_REGLA }));
            setEditando(null);
          },
        }]}
        primario={{
          etiqueta: t('dialogo.aplicar'),
          deshabilitada: !nuevaCuenta,
          motivo: nuevaCuenta ? undefined : t('dialogo.eligeCuenta'),
          onClick: () => {
            if (editando && nuevaCuenta) setElecciones((prev) => ({ ...prev, [editando]: nuevaCuenta.account_code }));
            setEditando(null);
          },
        }}
      >
        <SelectorCuenta valor={nuevaCuenta} onCambiar={setNuevaCuenta} buscar={buscarCuentas} etiqueta={t('dialogo.cambiarPor')} />
      </Dialogo>

      <Dialogo
        abierto={reclasificarAbierto}
        onAbiertoChange={setReclasificarAbierto}
        titulo={t('config.reclasificar.titulo')}
        descripcion={t('config.reclasificar.descripcion')}
        primario={{ etiqueta: t('config.reclasificar.crear'), cargando: reclasificando, onClick: reclasificar }}
      />

      <Dialogo
        abierto={asistenteAbierto}
        onAbiertoChange={setAsistenteAbierto}
        titulo={t('config.asistente.titulo', { sector: nombreSector(tipo) })}
        descripcion={t('config.asistente.descripcion')}
        ancho={672}
        primario={{ etiqueta: t('config.asistente.aplicar'), cargando: guardando, onClick: () => void aplicarAsistente() }}
      >
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {filasPropuesta.map((fila) => (
            <div key={fila.clave} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-fg-secondary">{t(`claves.${fila.clave}.nombre`)}</span>
              <span className={fila.sirve ? 'text-fg' : 'text-warning-text'}>
                {fila.codigo}{fila.nombreCuenta ? ` · ${fila.nombreCuenta}` : ''}
                {fila.sirve ? '' : ` · ${t('config.asistente.noEnPlan')}`}
              </span>
            </div>
          ))}
        </div>
      </Dialogo>
    </div>
  );
}
