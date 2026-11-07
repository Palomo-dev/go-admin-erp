'use client';

/**
 * Nuevo ingreso / egreso — UNA sola pieza para Ingresos, Egresos y
 * Movimientos (requisito del dueño; se importa desde
 * `@/components/finanzas/tesoreria/compartido/formularios`).
 *
 * Diseño: Tesorería v2 `1004:82085` (ingreso en caja con «Efecto en la
 * cuenta»), `1004:82267` (egreso que supera el disponible), `1004:82618` (sin
 * caja abierta) y «Nuevo egreso — pago de impuesto» `2334:134963` (la
 * categoría trae la cuenta; un impuesto cancela el pasivo).
 *
 * Lógica que se conserva del formulario de la ronda 2 (sin cambiar el
 * servicio): categorías imputables con su cuenta sugerida, rol de impuesto y
 * cuenta obligatoria, vista previa del asiento (`fn_vista_previa_asiento_tesoreria`),
 * tercero, centro de costo o distribución, soporte en `soportes-tesoreria`,
 * caja abierta de la sucursal por `fn_caja_abierta_para` (nunca la última de
 * la organización) y banco por su cuenta. Nuevo: selector de cuenta de dinero
 * con opciones deshabilitadas y su motivo, «Efecto en la cuenta» (el esperado
 * de la caja viene del servidor con el cierre ciego aplicado), y la regla del
 * dueño: superar el disponible BLOQUEA en bancos y AVISA en caja.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Paperclip } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchSelect } from '@/components/ui/search-select';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import {
  AvisoTonal,
  CampoNumero,
  Dialogo,
  FormField,
  TarjetaSeleccionable,
  ThirdPartyPicker,
  clasesBoton,
  useAtajos,
  type TerceroElegido,
} from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { getCurrentUserId, getOrganizationId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { movimientosService, type BankAccount } from '@/lib/services/movimientosService';
import {
  cuentaPermitidaParaRol,
  esImputable,
  exigeCuentaAlUsar,
  rolImpuesto,
  type RolImpuesto,
} from '@/lib/finanzas/categoriasTesoreria';
import { efectoEnCuenta } from '@/lib/finanzas/tesoreria/efectoEnCuenta';
import { opcionesCuentaDinero, type ValorCuentaDinero } from '@/lib/finanzas/tesoreria/cuentaDineroSelector';
import { EfectoEnCuentaTarjeta, SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { useCajasDinero } from '@/components/finanzas/tesoreria/compartido/useCajasDinero';
import { SelectorCategoria, type OpcionCategoria } from './SelectorCategoria';

type TipoFormulario = 'ingreso' | 'egreso';

interface CuentaPlan {
  account_code: string;
  name: string;
  es_movimiento: boolean | null;
  requiere_centro_costo: boolean | null;
  centro_costo_modo: 'obligatorio' | 'opcional' | 'no_aplica' | null;
  requiere_tercero: boolean | null;
}

interface CentroCosto {
  id: string;
  code: string;
  name: string;
}

interface Distribucion {
  id: string;
  nombre: string;
}

interface Vista {
  debito: string | null;
  credito: string | null;
  fallo: string | null;
  cuentaTesoreria: string | null;
}

interface CategoriaFormulario extends OpcionCategoria {
  rol: RolImpuesto | null;
  clave: string | null;
}

const MAX_SOPORTE = 5 * 1024 * 1024;
const MIME_SOPORTE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface FormularioMovimientoTesoreriaProps {
  tipo: TipoFormulario;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Movimientos: el diálogo deja cambiar entre Ingreso · Egreso · Traslado. */
  permitirCambiarTipo?: boolean;
  /** «Traslado» abre el diálogo de transferencia (solo con `permitirCambiarTipo`). */
  onTraslado?: () => void;
}

export function FormularioMovimientoTesoreria({
  tipo: tipoInicial,
  open,
  onOpenChange,
  onSuccess,
  permitirCambiarTipo = false,
  onTraslado,
}: FormularioMovimientoTesoreriaProps) {
  const t = useTranslations('tesoreria');
  const tf = useTranslations('finanzasTesoreriaR3.formulario');
  const { formatear } = useMonedaOrganizacion();
  const { selectedBranchId } = useBranch();
  const [tipo, setTipo] = useState<TipoFormulario>(tipoInicial);
  const { cajas, estado: estadoCajas, modo } = useCajasDinero(open);
  const [branchId, setBranchId] = useState<number | null>(selectedBranchId);
  const [categorias, setCategorias] = useState<CategoriaFormulario[]>([]);
  const [cuentas, setCuentas] = useState<CuentaPlan[]>([]);
  const [centros, setCentros] = useState<CentroCosto[]>([]);
  const [defectoPorSede, setDefectoPorSede] = useState<Record<number, string>>({});
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [bancos, setBancos] = useState<BankAccount[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [cuenta, setCuenta] = useState('');
  const [cuentaDinero, setCuentaDinero] = useState<ValorCuentaDinero>('');
  const [sesionSucursal, setSesionSucursal] = useState<number | null | undefined>(undefined);
  const [tercero, setTercero] = useState<TerceroElegido | null>(null);
  const [terceroAbierto, setTerceroAbierto] = useState(false);
  const [centroId, setCentroId] = useState('');
  const [distribucionId, setDistribucionId] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [concepto, setConcepto] = useState('');
  const [conceptoTocado, setConceptoTocado] = useState(false);
  const [notas, setNotas] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [vistaCargando, setVistaCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sembrando, setSembrando] = useState(false);
  const [intento, setIntento] = useState(false);

  const origen: 'cash' | 'bank' = cuentaDinero.startsWith('banco:') ? 'bank' : 'cash';
  const bancoId = origen === 'bank' ? cuentaDinero.slice('banco:'.length) : '';

  const categoriaElegida = categorias.find((fila) => fila.id === categoriaId);
  const rolElegido = categoriaElegida?.rol ?? null;
  const cuentaElegida = cuentas.find((fila) => fila.account_code === cuenta);
  const modoCentro = cuentaElegida?.centro_costo_modo
    ?? (cuentaElegida?.requiere_centro_costo ? 'obligatorio' : null);
  const exigeCentro = modoCentro === 'obligatorio' && centros.length > 0 && !distribucionId;
  const exigeTercero = cuentaElegida?.requiere_tercero === true;

  useAtajos(
    [{ tecla: 'F2', descripcion: t('movimiento.tercero'), accion: () => setTerceroAbierto(true), permitirEnCampo: true }],
    { activo: open },
  );

  const cargar = useCallback(async (sede: number | null | undefined, tipoCarga: TipoFormulario) => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    const [cats, plan, costos, sedes, cuentasBanco, dists] = await Promise.all([
      supabase
        .from('categorias_tesoreria')
        .select('id, nombre, icono, cuenta_sugerida, clave, padre_id')
        .eq('organization_id', orgId)
        .eq('tipo', tipoCarga)
        .eq('activa', true)
        .order('orden'),
      supabase
        .from('chart_of_accounts')
        .select('account_code, name, es_movimiento, requiere_centro_costo, centro_costo_modo, requiere_tercero')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('account_code'),
      supabase
        .from('cost_centers')
        .select('id, code, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('branches')
        .select('id, default_cost_center_id')
        .eq('organization_id', orgId),
      movimientosService.getBankAccounts(),
      supabase
        .from('cost_center_distributions')
        .select('id, nombre')
        .eq('organization_id', orgId)
        .eq('activo', true)
        .order('nombre'),
    ]);
    if (cats.error) throw cats.error;
    if (plan.error) throw plan.error;
    if (costos.error) throw costos.error;
    if (sedes.error) throw sedes.error;
    const filasCategoria = cats.data ?? [];
    const porId = new Map(filasCategoria.map((fila) => [Number(fila.id), fila]));
    setCategorias(
      filasCategoria
        .map((fila) => {
          const padre = fila.padre_id ? porId.get(Number(fila.padre_id)) : undefined;
          const nombre = String(fila.nombre);
          return {
            id: Number(fila.id),
            nombre,
            etiqueta: padre ? `${padre.nombre} › ${nombre}` : nombre,
            icono: String(fila.icono || 'circle'),
            cuenta: fila.cuenta_sugerida ? String(fila.cuenta_sugerida) : null,
            clave: fila.clave ? String(fila.clave) : null,
            rol: rolImpuesto(fila.clave, padre?.clave),
          };
        })
        // El padre organiza: no se elige en un movimiento.
        .filter((fila) => esImputable(fila.rol)),
    );
    setCuentas((plan.data ?? []) as CuentaPlan[]);
    const listaCentros = (costos.data ?? []) as CentroCosto[];
    setCentros(listaCentros);
    const mapa: Record<number, string> = {};
    for (const sedeFila of sedes.data ?? []) {
      if (sedeFila.default_cost_center_id) mapa[Number(sedeFila.id)] = String(sedeFila.default_cost_center_id);
    }
    setDefectoPorSede(mapa);
    const administracion = listaCentros.find((fila) => fila.code === '100')?.id ?? '';
    setCentroId((sede != null ? mapa[sede] : null) || administracion);
    setDistribuciones(dists.error ? [] : (dists.data ?? []) as Distribucion[]);
    setBancos(cuentasBanco);
  }, []);

  // Al abrir: todo en blanco y el tipo que pidió la pantalla.
  useEffect(() => {
    if (!open) return;
    setTipo(tipoInicial);
    setBranchId(selectedBranchId);
    setCategoriaId(null);
    setCuenta('');
    setCuentaDinero('');
    setSesionSucursal(undefined);
    setTercero(null);
    setTerceroAbierto(false);
    setCentroId('');
    setDistribucionId('');
    setMonto(null);
    setConcepto('');
    setConceptoTocado(false);
    setNotas('');
    setArchivo(null);
    setVista(null);
    setIntento(false);
  }, [open, tipoInicial, selectedBranchId]);

  // Categorías del tipo elegido (cambiar Ingreso ↔ Egreso las recarga).
  useEffect(() => {
    if (!open) return;
    setCategoriaId(null);
    void cargar(selectedBranchId, tipo).catch(() => {
      toast({ title: t('errorTitulo'), description: t('errorCarga.cuentasBancarias'), variant: 'destructive' });
    });
  }, [open, tipo, selectedBranchId, cargar, t]);

  // La caja donde escribe el servidor: la abierta de la sucursal (modo de caja incluido).
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setSesionSucursal(undefined);
    movimientosService
      .getOpenSessionIdForBranch(branchId)
      .then((id) => vivo && setSesionSucursal(id))
      .catch(() => vivo && setSesionSucursal(null));
    return () => {
      vivo = false;
    };
  }, [open, branchId]);

  const opciones = useMemo(
    () =>
      opcionesCuentaDinero({
        sesionSucursal: sesionSucursal ?? null,
        cajas,
        bancos: bancos.map((b) => ({ id: b.id, nombre: b.name, saldo: Number(b.balance) })),
        modo,
      }),
    [sesionSucursal, cajas, bancos, modo],
  );
  const sinCajaAbierta = sesionSucursal === null;

  // Elección por defecto: la caja abierta de la sucursal; si no hay, nada (el aviso lo dice).
  useEffect(() => {
    if (!open || cuentaDinero || sesionSucursal === undefined) return;
    if (sesionSucursal !== null) setCuentaDinero('caja');
  }, [open, cuentaDinero, sesionSucursal]);
  useEffect(() => {
    if (cuentaDinero === 'caja' && sinCajaAbierta) setCuentaDinero('');
  }, [cuentaDinero, sinCajaAbierta]);

  const elegirCategoria = (id: number) => {
    setCategoriaId(id);
    const categoria = categorias.find((fila) => fila.id === id);
    if (!categoria) return;
    // Un impuesto sin cuenta no hereda la de la categoría anterior: se elige a conciencia.
    if (categoria.cuenta) setCuenta(categoria.cuenta);
    else if (categoria.rol) setCuenta('');
    if (!conceptoTocado) setConcepto(categoria.nombre);
  };

  useEffect(() => {
    if (!open || !cuenta) {
      setVista(null);
      return;
    }
    const orgId = getOrganizationId();
    if (!orgId) return;
    let vivo = true;
    const timer = setTimeout(() => {
      setVistaCargando(true);
      void Promise.resolve(supabase
        .rpc('fn_vista_previa_asiento_tesoreria', {
          p_organization_id: orgId,
          p_tipo: tipo === 'ingreso' ? 'in' : 'out',
          p_fuente: origen,
          p_bank_account_id: origen === 'bank' && bancoId ? Number(bancoId) : null,
          p_cuenta: cuenta,
        }))
        .then(({ data, error }) => {
          if (!vivo) return;
          if (error) {
            setVista({ debito: null, credito: null, fallo: t('errores.desconocido'), cuentaTesoreria: null });
            return;
          }
          const fila = Array.isArray(data) ? data[0] : data;
          setVista({
            debito: fila?.debito ?? null,
            credito: fila?.credito ?? null,
            fallo: fila?.fallo ?? null,
            cuentaTesoreria: fila?.cuenta_tesoreria ?? null,
          });
        })
        .finally(() => {
          if (vivo) setVistaCargando(false);
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [open, cuenta, origen, bancoId, tipo, t]);

  const opcionesCuenta = useMemo(
    () => cuentas
      .filter((fila) => fila.es_movimiento !== false && cuentaPermitidaParaRol(rolElegido, fila.account_code))
      .map((fila) => ({ value: fila.account_code, label: `${fila.account_code} · ${fila.name}` })),
    [cuentas, rolElegido],
  );
  const opcionesCentro = useMemo(
    () => centros.map((fila) => ({ value: fila.id, label: `${fila.code} · ${fila.name}` })),
    [centros],
  );

  const opcionElegida = opciones.find((o) => o.valor === cuentaDinero) ?? null;
  const efecto = efectoEnCuenta({
    saldo: opcionElegida ? opcionElegida.saldo : null,
    importe: monto,
    sentido: tipo === 'ingreso' ? 'entrada' : 'salida',
    cuenta: origen === 'bank' ? 'banco' : 'caja',
  });

  const sembrar = async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    setSembrando(true);
    const { error } = await supabase.rpc('fn_sembrar_categorias_tesoreria', { p_org: orgId });
    setSembrando(false);
    if (error) {
      toast({ title: t('errorTitulo'), description: t('categorias.errorGuardar'), variant: 'destructive' });
      return;
    }
    await cargar(branchId, tipo);
  };

  const subirSoporte = async (orgId: number): Promise<string | null> => {
    if (!archivo) return null;
    const extension = MIME_SOPORTE[archivo.type];
    if (!extension || archivo.size > MAX_SOPORTE) {
      toast({
        title: t('errorTitulo'),
        description: !extension ? t('movimiento.soporteTipo') : t('movimiento.soportePeso'),
        variant: 'destructive',
      });
      throw new Error('soporte_invalido');
    }
    const path = `${orgId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('soportes-tesoreria').upload(path, archivo, {
      contentType: archivo.type,
      upsert: false,
    });
    if (error) throw error;
    return path;
  };

  const guardar = async () => {
    setIntento(true);
    const orgId = getOrganizationId();
    const valor = monto ?? 0;
    const fallo = (descripcion: string) => toast({ title: t('errorTitulo'), description: descripcion, variant: 'destructive' });
    if (!orgId) return fallo(t('errores.sin_organizacion'));
    if (!cuentaDinero) return fallo(tf('errores.cuentaDinero'));
    if (!categoriaId) return fallo(t('movimiento.faltaCategoria'));
    if (!cuenta || vista?.fallo) return fallo(vista?.fallo || t('movimiento.faltaCuenta'));
    if (!concepto.trim()) return fallo(t('movimiento.faltaConcepto'));
    if (!Number.isFinite(valor) || valor <= 0) return fallo(t('movimiento.faltaMonto'));
    if (origen === 'bank' && !bancoId) return fallo(t('movimiento.faltaBanco'));
    if (efecto.bloquea) return fallo(tf('superaBanco'));
    if (exigeCentro && !centroId) return fallo(t('movimiento.faltaCentro'));
    if (exigeTercero && !tercero) return fallo(t('movimiento.faltaTercero'));

    setGuardando(true);
    let soporte: string | null = null;
    try {
      soporte = await subirSoporte(orgId);
      const userId = await getCurrentUserId();
      const payload = {
        type: tipo === 'ingreso' ? 'income' as const : 'expense' as const,
        concept: concepto.trim(),
        amount: Math.round(valor * 100) / 100,
        notes: notas.trim() || undefined,
        source: origen,
        branch_id: branchId,
        bank_account_id: origen === 'bank' ? Number(bancoId) : undefined,
        categoria_id: categoriaId,
        cuenta_contable: cuenta,
        centro_costo_id: modoCentro === 'no_aplica' || distribucionId ? null : (centroId || null),
        distribucion_id: modoCentro === 'no_aplica' ? null : (distribucionId || null),
        tercero_tipo: tercero?.tipo ?? null,
        tercero_id: tercero?.id ?? null,
        tercero_nit: tercero?.nit ?? null,
        tercero_dv: tercero?.dv ?? null,
        tercero_nombre: tercero?.nombre.trim() || null,
        soporte_path: soporte,
      };
      const resultado = origen === 'cash'
        ? await movimientosService.createCashMovement(payload, userId || '')
        : await movimientosService.createBankTransaction(payload);
      if (!resultado.success) {
        if (soporte) await supabase.storage.from('soportes-tesoreria').remove([soporte]);
        fallo(t(`errores.${resultado.codigo ?? 'desconocido'}`));
        return;
      }
      toast({ description: tipo === 'ingreso' ? t('movimiento.exitoIngreso') : t('movimiento.exitoEgreso') });
      onSuccess();
    } catch (error) {
      if (soporte) await supabase.storage.from('soportes-tesoreria').remove([soporte]);
      const codigo = error instanceof Error && error.message === 'soporte_invalido' ? null : 'desconocido';
      if (codigo) fallo(t('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const nombreCuenta = (codigo: string | null) => {
    if (!codigo) return '';
    const fila = cuentas.find((cuentaPlan) => cuentaPlan.account_code === codigo);
    return fila ? `${codigo} · ${fila.name}` : codigo;
  };

  const etiquetaPrimario = efecto.avisa
    ? tf('registrarDeTodosModos', { tipo })
    : tf('registrar', { tipo });
  const deshabilitado = guardando || vistaCargando || !vista || !!vista.fallo || efecto.bloquea || !cuentaDinero;

  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={(a) => !guardando && onOpenChange(a)}
      titulo={permitirCambiarTipo ? tf('tituloMovimiento') : tipo === 'ingreso' ? t('movimiento.tituloIngreso') : t('movimiento.tituloEgreso')}
      descripcion={tf('descripcion')}
      icono={tipo === 'ingreso' ? ArrowDownCircle : ArrowUpCircle}
      ancho={1024}
      textoCancelar={t('movimiento.cancelar')}
      primario={{
        etiqueta: guardando ? t('movimiento.guardando') : etiquetaPrimario,
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: deshabilitado,
        destructiva: efecto.avisa,
        motivo: efecto.bloquea ? tf('superaBanco') : !cuentaDinero ? tf('errores.cuentaDinero') : undefined,
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {permitirCambiarTipo && (
            <div role="radiogroup" aria-label={tf('tipo.etiqueta')} className="grid grid-cols-3 gap-2">
              <TarjetaSeleccionable titulo={tf('tipo.ingreso')} descripcion={tf('tipo.ingresoAyuda')} icono={ArrowDownCircle} seleccionada={tipo === 'ingreso'} onSeleccionar={() => setTipo('ingreso')} />
              <TarjetaSeleccionable titulo={tf('tipo.egreso')} descripcion={tf('tipo.egresoAyuda')} icono={ArrowUpCircle} seleccionada={tipo === 'egreso'} onSeleccionar={() => setTipo('egreso')} />
              <TarjetaSeleccionable
                titulo={tf('tipo.traslado')}
                descripcion={tf('tipo.trasladoAyuda')}
                icono={ArrowLeftRight}
                seleccionada={false}
                onSeleccionar={() => onTraslado?.()}
                deshabilitada={!onTraslado}
              />
            </div>
          )}

          <BranchSelectorField
            value={branchId}
            onChange={(id) => {
              setBranchId(id);
              const administracion = centros.find((fila) => fila.code === '100')?.id ?? '';
              setCentroId((id != null ? defectoPorSede[id] : null) || administracion);
              setDistribucionId('');
            }}
          />

          {sinCajaAbierta && (
            <AvisoTonal
              tono="advertencia"
              titulo={tf('sinCaja.titulo')}
              acciones={[
                { etiqueta: tf('sinCaja.abrir'), href: '/app/pos/cajas' },
                ...(opciones.some((o) => o.tipo === 'banco' && !o.motivo)
                  ? [{ etiqueta: tf('sinCaja.banco'), onClick: () => setCuentaDinero(opciones.find((o) => o.tipo === 'banco' && !o.motivo)?.valor ?? '') }]
                  : []),
              ]}
            />
          )}

          <FormField
            etiqueta={tf('cuentaDinero')}
            obligatorio
            error={intento && !cuentaDinero ? tf('errores.cuentaDinero') : null}
            ayuda={estadoCajas === 'error' ? tf('cajasError') : undefined}
          >
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={cuentaDinero}
                onCambiar={(v) => setCuentaDinero(v as ValorCuentaDinero)}
                vacio={tf('elegirCuenta')}
                aria-invalid={c['aria-invalid']}
                aria-describedby={c['aria-describedby']}
                opciones={opciones.map((o) => ({
                  valor: o.valor,
                  deshabilitada: !!o.motivo,
                  etiqueta: [
                    o.tipo === 'caja'
                      ? tf(o.propia ? 'opcion.miCaja' : 'opcion.caja', { nombre: o.nombre ?? tf('opcion.todas') })
                      : o.nombre,
                    o.saldo === null ? (o.tipo === 'caja' ? tf('opcion.oculto') : null) : formatear(o.saldo),
                    o.motivo ? tf(`motivos.${o.motivo}`) : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }))}
              />
            )}
          </FormField>

          {categorias.length === 0 ? (
            <AvisoTonal
              tono="informacion"
              titulo={t('movimiento.sinCategorias')}
              accion={{ etiqueta: t('movimiento.completarPredefinidas'), onClick: () => void sembrar(), cargando: sembrando }}
            />
          ) : (
            <FormField etiqueta={t('movimiento.categoria')} obligatorio>
              <SelectorCategoria
                categorias={categorias}
                value={categoriaId}
                onChange={elegirCategoria}
                placeholder={t('movimiento.categoria')}
                buscar={t('movimiento.buscarCategoria')}
                vacio={t('movimiento.sinCategorias')}
              />
            </FormField>
          )}

          <FormField
            etiqueta={t('movimiento.cuenta')}
            obligatorio
            ayuda={
              rolElegido === 'pasivo'
                ? t('movimiento.ayudaPasivo')
                : rolElegido === 'gasto'
                  ? t('movimiento.ayudaGasto')
                  : tf('cuentaAyuda')
            }
            error={exigeCuentaAlUsar(rolElegido, categoriaElegida?.clave) && !categoriaElegida?.cuenta ? t('movimiento.ayudaSinCuenta') : null}
          >
            <SearchSelect
              options={opcionesCuenta}
              value={cuenta}
              onValueChange={setCuenta}
              placeholder={t('movimiento.cuenta')}
              searchPlaceholder={t('movimiento.buscarCuenta')}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              etiqueta={tf('importe')}
              obligatorio
              error={efecto.bloquea ? tf('superaBanco') : efecto.avisa && efecto.antes !== null ? tf('superaCaja', { disponible: formatear(efecto.antes) }) : null}
            >
              {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} minimo={0} alinear="derecha" aria-invalid={c['aria-invalid']} aria-describedby={c['aria-describedby']} />}
            </FormField>
            <FormField etiqueta={t('movimiento.concepto')} obligatorio>
              <Input
                value={concepto}
                maxLength={200}
                onChange={(event) => {
                  setConceptoTocado(true);
                  setConcepto(event.target.value);
                }}
              />
            </FormField>
          </div>

          <FormField etiqueta={tf('tercero')} ayuda={tf('terceroAyuda')}>
            {(c) => (
              <div id={c.id}>
                <ThirdPartyPicker
                  valor={tercero}
                  onCambiar={setTercero}
                  onQuitar={() => setTercero(null)}
                  sucursal={branchId}
                  abierto={terceroAbierto}
                  onAbiertoChange={setTerceroAbierto}
                />
              </div>
            )}
          </FormField>

          {modoCentro === 'no_aplica' ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('movimiento.centroCosto')} obligatorio={exigeCentro}>
                <SearchSelect
                  options={opcionesCentro}
                  value={centroId || 'none'}
                  onValueChange={(valor) => {
                    setCentroId(valor === 'none' ? '' : valor);
                    if (valor !== 'none') setDistribucionId('');
                  }}
                  noneLabel={t('movimiento.sinCentro')}
                  placeholder={t('movimiento.centroCosto')}
                  searchPlaceholder={t('movimiento.buscarCuenta')}
                />
              </FormField>
              <FormField etiqueta={t('movimiento.distribucion')}>
                <SearchSelect
                  options={distribuciones.map((fila) => ({ value: fila.id, label: fila.nombre }))}
                  value={distribucionId || 'none'}
                  onValueChange={(valor) => {
                    setDistribucionId(valor === 'none' ? '' : valor);
                    if (valor !== 'none') setCentroId('');
                  }}
                  noneLabel={t('movimiento.sinDistribucion')}
                  placeholder={t('movimiento.distribucion')}
                  searchPlaceholder={t('movimiento.buscarCuenta')}
                />
              </FormField>
            </div>
          )}

          <FormField etiqueta={tf('referencia')}>
            <Textarea value={notas} onChange={(event) => setNotas(event.target.value)} rows={2} />
          </FormField>

          <div className="space-y-1">
            <label className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'cursor-pointer text-brand' })}>
              <Paperclip className="h-4 w-4" aria-hidden />
              {archivo ? archivo.name : tf('adjuntar')}
              <input
                type="file"
                className="sr-only"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-fg-tertiary">{t('movimiento.soporteAyuda')}</p>
            {archivo ? (
              <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setArchivo(null)}>
                {t('movimiento.quitarSoporte')}
              </button>
            ) : null}
          </div>

          {efecto.avisa && <AvisoTonal tono="advertencia" titulo={tf('avisoArqueo')} compacto />}
        </div>

        <div className="space-y-3">
          {opcionElegida ? (
            <EfectoEnCuentaTarjeta
              cuenta={opcionElegida.tipo === 'caja' ? tf('opcion.caja', { nombre: opcionElegida.nombre ?? tf('opcion.todas') }) : opcionElegida.nombre ?? ''}
              efecto={efecto}
              formatear={formatear}
              cargando={estadoCajas === 'cargando' && opcionElegida.tipo === 'caja'}
            />
          ) : (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold text-fg">{tf('efectoTitulo')}</h3>
              <p className="mt-2 text-xs text-fg-secondary">{tf('efectoVacio')}</p>
            </section>
          )}
          <section aria-label={t('movimiento.vistaPrevia')} className="overflow-hidden rounded-xl border border-line text-sm">
            <div className="flex items-center bg-subtle px-3 py-2 text-xs font-semibold text-fg-secondary">
              <span className="min-w-0 flex-1">{t('movimiento.vistaPrevia')}</span>
              <span className="w-24 text-right">{t('movimiento.debito')}</span>
              <span className="w-24 text-right">{t('movimiento.credito')}</span>
            </div>
            {vistaCargando ? <p className="px-3 py-2 text-xs text-fg-secondary">…</p> : null}
            {vista?.fallo ? <p className="px-3 py-2 text-danger-text">{vista.fallo}</p> : null}
            {!vista && !vistaCargando ? <p className="px-3 py-2 text-xs text-fg-secondary">{tf('vistaVacia')}</p> : null}
            {vista && !vista.fallo ? (
              <>
                <div className="flex items-center border-t border-line px-3 py-2 text-fg">
                  <span className="min-w-0 flex-1 truncate">{nombreCuenta(vista.debito)}</span>
                  <span className="w-24 text-right tabular-nums">{monto ? formatear(monto) : '—'}</span>
                  <span className="w-24" />
                </div>
                <div className="flex items-center border-t border-line px-3 py-2 text-fg">
                  <span className="min-w-0 flex-1 truncate">{nombreCuenta(vista.credito)}</span>
                  <span className="w-24" />
                  <span className="w-24 text-right tabular-nums">{monto ? formatear(monto) : '—'}</span>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </Dialogo>
  );
}
