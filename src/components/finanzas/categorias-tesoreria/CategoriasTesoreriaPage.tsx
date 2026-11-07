'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Power, PowerOff, Tags, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchSelect } from '@/components/ui/search-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AvisoTonal,
  ConfirmDialog,
  Dialogo,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  StatusBadge,
  type AccionFila,
} from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  PREDEFINIDAS,
  codigoErrorCategoria,
  cuentaPermitidaParaRol,
  exigeCuentaAlUsar,
  ordenarConHijas,
  padresValidos,
  rolImpuesto,
  tipoImpuesto,
  type RolImpuesto,
  type TipoCategoria,
} from '@/lib/finanzas/categoriasTesoreria';
import { ICONOS_CATEGORIA, IconoCategoria } from './iconosCategoria';

interface Categoria {
  id: number;
  tipo: TipoCategoria;
  nombre: string;
  icono: string;
  cuenta_sugerida: string | null;
  padre_id: number | null;
  activa: boolean;
  es_predefinida: boolean;
  clave: string | null;
  orden: number;
}

interface Cuenta {
  account_code: string;
  name: string;
  es_movimiento: boolean | null;
}

const VACIO = {
  id: null as number | null,
  tipo: 'egreso' as TipoCategoria,
  nombre: '',
  icono: 'circle',
  cuenta: '',
  padreId: '',
  activa: true,
  esPredefinida: false,
  clave: null as string | null,
};

export function CategoriasTesoreriaPage() {
  const t = useTranslations('tesoreria');
  const [filas, setFilas] = useState<Categoria[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sembrando, setSembrando] = useState(false);
  const [formulario, setFormulario] = useState(VACIO);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [porEliminar, setPorEliminar] = useState<Categoria | null>(null);

  const cargar = useCallback(async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    setCargando(true);
    const [cats, plan] = await Promise.all([
      supabase
        .from('categorias_tesoreria')
        .select('id, tipo, nombre, icono, cuenta_sugerida, padre_id, activa, es_predefinida, clave, orden')
        .eq('organization_id', orgId)
        .order('orden'),
      supabase
        .from('chart_of_accounts')
        .select('account_code, name, es_movimiento')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('account_code'),
    ]);
    if (cats.error || plan.error) {
      toast({ title: t('errorTitulo'), description: t('categorias.errorCarga'), variant: 'destructive' });
    } else {
      setFilas((cats.data ?? []) as Categoria[]);
      setCuentas((plan.data ?? []) as Cuenta[]);
    }
    setCargando(false);
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porId = useMemo(() => new Map(filas.map((fila) => [fila.id, fila])), [filas]);

  const rolDe = useCallback(
    (fila: Pick<Categoria, 'clave' | 'padre_id'>): RolImpuesto | null => (
      rolImpuesto(fila.clave, fila.padre_id ? porId.get(fila.padre_id)?.clave : null)
    ),
    [porId],
  );

  const rolFormulario = rolDe({
    clave: formulario.clave,
    padre_id: formulario.padreId ? Number(formulario.padreId) : null,
  });

  const opcionesCuenta = useMemo(
    () => cuentas
      .filter((cuenta) => cuenta.es_movimiento !== false && cuentaPermitidaParaRol(rolFormulario, cuenta.account_code))
      .map((cuenta) => ({ value: cuenta.account_code, label: `${cuenta.account_code} · ${cuenta.name}` })),
    [cuentas, rolFormulario],
  );

  const nombreCuenta = (codigo: string) => cuentas.find((cuenta) => cuenta.account_code === codigo)?.name ?? '';

  const abrirNueva = (tipo: TipoCategoria) => {
    setFormulario({ ...VACIO, tipo });
    setAbierto(true);
  };

  const abrirEdicion = (fila: Categoria) => {
    setFormulario({
      id: fila.id,
      tipo: fila.tipo,
      nombre: fila.nombre,
      icono: fila.icono,
      cuenta: fila.cuenta_sugerida ?? '',
      padreId: fila.padre_id ? String(fila.padre_id) : '',
      activa: fila.activa,
      esPredefinida: fila.es_predefinida,
      clave: fila.clave,
    });
    setAbierto(true);
  };

  const padres = padresValidos(
    filas.filter((fila) => fila.tipo === formulario.tipo).map((fila) => ({ id: fila.id, padreId: fila.padre_id })),
    formulario.id,
  );
  const opcionesPadre = filas
    .filter((fila) => padres.some((padre) => padre.id === fila.id))
    .map((fila) => ({ value: String(fila.id), label: fila.nombre }));

  const avisarError = (error: { message?: string } | null) => {
    const codigo = codigoErrorCategoria(error);
    toast({
      title: t('errorTitulo'),
      description: codigo ? t(`categorias.errores.${codigo}`) : t('categorias.errorGuardar'),
      variant: 'destructive',
    });
  };

  const guardar = async () => {
    const orgId = getOrganizationId();
    if (!orgId || !formulario.nombre.trim()) return;
    setGuardando(true);
    const payload = {
      nombre: formulario.nombre.trim(),
      icono: formulario.icono,
      cuenta_sugerida: rolFormulario === 'agrupa' ? null : formulario.cuenta || null,
      padre_id: formulario.padreId ? Number(formulario.padreId) : null,
      activa: formulario.activa,
    };
    const consulta = formulario.id
      ? supabase.from('categorias_tesoreria').update(payload).eq('id', formulario.id).eq('organization_id', orgId)
      : supabase.from('categorias_tesoreria').insert({
          ...payload,
          organization_id: orgId,
          tipo: formulario.tipo,
          es_predefinida: false,
          orden: (filas.filter((fila) => fila.tipo === formulario.tipo).at(-1)?.orden ?? 0) + 10,
        });
    const { error } = await consulta;
    setGuardando(false);
    if (error) {
      avisarError(error);
      return;
    }
    setAbierto(false);
    await cargar();
  };

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
    toast({ description: t('categorias.completadas') });
    await cargar();
  };

  const cambiarActiva = async (fila: Categoria, activa: boolean) => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    const { error } = await supabase
      .from('categorias_tesoreria')
      .update({ activa })
      .eq('id', fila.id)
      .eq('organization_id', orgId);
    if (error) {
      avisarError(error);
      return;
    }
    setFilas((actual) => actual.map((item) => (item.id === fila.id ? { ...item, activa } : item)));
  };

  const eliminar = async (fila: Categoria) => {
    if (fila.es_predefinida) return;
    const orgId = getOrganizationId();
    if (!orgId) return;
    const { error } = await supabase
      .from('categorias_tesoreria')
      .delete()
      .eq('id', fila.id)
      .eq('organization_id', orgId)
      .eq('es_predefinida', false);
    if (error) {
      avisarError(error);
      return;
    }
    await cargar();
  };

  const ayuda = (clave: string | null) => PREDEFINIDAS.find((fila) => fila.clave === clave)?.ayuda;

  const accionesDeFila = (fila: Categoria): AccionFila[] => [
    { id: 'editar', etiqueta: t('categorias.editar'), icono: Pencil, onSelect: () => abrirEdicion(fila) },
    {
      id: 'estado',
      etiqueta: fila.activa ? t('categorias.desactivarAccion') : t('categorias.activar'),
      icono: fila.activa ? PowerOff : Power,
      onSelect: () => void cambiarActiva(fila, !fila.activa),
    },
    ...(fila.es_predefinida
      ? []
      : [{ id: 'eliminar', etiqueta: t('categorias.eliminar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setPorEliminar(fila) }]),
  ];

  const textoCuenta = (fila: Categoria, rol: RolImpuesto | null) => {
    if (rol === 'agrupa') return <span className="text-fg-secondary">{t('categorias.cuentaPadre')}</span>;
    if (fila.cuenta_sugerida) {
      return <span className="text-fg">{fila.cuenta_sugerida} {nombreCuenta(fila.cuenta_sugerida) ? `· ${nombreCuenta(fila.cuenta_sugerida)}` : ''}</span>;
    }
    if (exigeCuentaAlUsar(rol, fila.clave)) {
      return <span className="text-warning-text">{t('categorias.cuentaFaltante')}</span>;
    }
    return <span className="text-fg-secondary">—</span>;
  };

  const insigniaTipo = (fila: Categoria, rol: RolImpuesto | null) => {
    const tipo = tipoImpuesto(rol, fila.cuenta_sugerida);
    if (tipo === 'agrupa') return <StatusBadge estado="agrupa" etiqueta={t('categorias.tipoAgrupa')} tono="neutro" apariencia="contorno" />;
    if (tipo === 'cancela_pasivo') return <StatusBadge estado="pasivo" etiqueta={t('categorias.tipoCancelaPasivo')} tono="informacion" apariencia="contorno" />;
    if (tipo === 'gasto') return <StatusBadge estado="gasto" etiqueta={t('categorias.tipoGasto')} tono="advertencia" apariencia="contorno" />;
    return <span className="text-fg-secondary">{fila.tipo === 'ingreso' ? t('categorias.ingresos') : t('categorias.egresos')}</span>;
  };

  const bloque = (tipo: TipoCategoria, titulo: string) => {
    const texto = busqueda.trim().toLowerCase();
    const delTipo = filas.filter((fila) => fila.tipo === tipo);
    const visibles = texto
      ? delTipo.filter((fila) => fila.nombre.toLowerCase().includes(texto) || (fila.cuenta_sugerida ?? '').includes(texto))
      : delTipo;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">{titulo}</h2>
          <Button type="button" variant="outline" onClick={() => abrirNueva(tipo)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('categorias.nueva')}
          </Button>
        </div>
        {visibles.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('categorias.vacio')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="bg-subtle">
                  <TableHead>{t('categorias.nombreColumna')}</TableHead>
                  <TableHead>{t('categorias.cuentaColumna')}</TableHead>
                  <TableHead>{t('categorias.tipoColumna')}</TableHead>
                  <TableHead>{t('categorias.estadoColumna')}</TableHead>
                  <TableHead className="w-12"><span className="sr-only">{t('categorias.accionesColumna')}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenarConHijas(visibles).map(({ fila, nivel }) => {
                  const rol = rolDe(fila);
                  return (
                    <TableRow key={fila.id} className={rol === 'agrupa' ? 'bg-subtle' : undefined}>
                      <TableCell className={nivel === 1 ? 'pl-8' : undefined}>
                        <span className={`flex items-center gap-2 text-fg ${rol === 'agrupa' ? 'font-medium' : ''}`}>
                          <IconoCategoria nombre={fila.icono} className="h-4 w-4 shrink-0 text-fg-secondary" />
                          {fila.nombre}
                        </span>
                        {ayuda(fila.clave) ? <span className="block text-xs text-fg-secondary">{ayuda(fila.clave)}</span> : null}
                      </TableCell>
                      <TableCell>{textoCuenta(fila, rol)}</TableCell>
                      <TableCell>{insigniaTipo(fila, rol)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          estado={fila.activa ? 'active' : 'inactive'}
                          etiqueta={fila.activa ? t('categorias.activa') : t('categorias.desactivar')}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionsMenu acciones={accionesDeFila(fila)} titulo={fila.nombre} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 md:p-6">
      <PageHeader
        titulo={t('categorias.titulo')}
        subtitulo={t('categorias.descripcion')}
        icono={Tags}
        migas={[
          { etiqueta: t('categorias.migaFinanzas'), href: '/app/finanzas' },
          { etiqueta: t('categorias.migaTesoreria'), href: '/app/finanzas/tesoreria/movimientos' },
          { etiqueta: t('categorias.migaCategorias') },
        ]}
        acciones={(
          <Button type="button" variant="outline" onClick={() => void sembrar()} disabled={sembrando}>
            {sembrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('categorias.completar')}
          </Button>
        )}
      />

      <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('categorias.buscar')} />

      {cargando ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="space-y-8">
          {bloque('egreso', t('categorias.egresos'))}
          <AvisoTonal tono="informacion" titulo={t('categorias.avisoTitulo')} descripcion={t('categorias.avisoDetalle')} />
          {bloque('ingreso', t('categorias.ingresos'))}
        </div>
      )}

      <Dialogo
        abierto={abierto}
        onAbiertoChange={setAbierto}
        titulo={formulario.id ? t('categorias.editar') : t('categorias.nueva')}
        ancho={520}
        textoCancelar={t('categorias.cancelar')}
        primario={{
          etiqueta: t('categorias.guardar'),
          onClick: () => void guardar(),
          cargando: guardando,
          deshabilitada: !formulario.nombre.trim(),
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="categoria-nombre">{t('categorias.nombre')}</Label>
          <Input id="categoria-nombre" value={formulario.nombre} onChange={(event) => setFormulario({ ...formulario, nombre: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('categorias.icono')}</Label>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {ICONOS_CATEGORIA.map((icono) => (
              <button
                key={icono}
                type="button"
                aria-label={icono}
                aria-pressed={formulario.icono === icono}
                className={`rounded border p-2 ${formulario.icono === icono ? 'border-brand bg-brand-tint' : 'border-transparent'}`}
                onClick={() => setFormulario({ ...formulario, icono })}
              >
                <IconoCategoria nombre={icono} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
        {rolFormulario === 'agrupa' ? (
          <p className="text-sm text-fg-secondary">{t('categorias.padreAyuda')}</p>
        ) : (
          <div className="space-y-1.5">
            <Label>{t('categorias.cuenta')}</Label>
            <SearchSelect
              options={opcionesCuenta}
              value={formulario.cuenta}
              onValueChange={(cuenta) => setFormulario({ ...formulario, cuenta })}
              placeholder={t('categorias.cuenta')}
              searchPlaceholder={t('categorias.buscarCuenta')}
              noneLabel={t('categorias.sinCuenta')}
              noneValue=""
            />
            {rolFormulario === 'pasivo' ? <p className="text-xs font-medium text-fg-muted">{t('categorias.ayudaPasivo')}</p> : null}
          </div>
        )}
        {rolFormulario === 'agrupa' ? null : (
          <div className="space-y-1.5">
            <Label>{t('categorias.padre')}</Label>
            <SearchSelect
              options={opcionesPadre}
              value={formulario.padreId || 'none'}
              onValueChange={(padreId) => setFormulario({ ...formulario, padreId: padreId === 'none' ? '' : padreId })}
              noneLabel={t('categorias.sinPadre')}
              placeholder={t('categorias.padre')}
              searchPlaceholder={t('categorias.nombre')}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch checked={formulario.activa} onCheckedChange={(activa) => setFormulario({ ...formulario, activa })} />
          <span className="text-sm text-fg">{t('categorias.activa')}</span>
        </div>
      </Dialogo>

      <ConfirmDialog
        abierto={porEliminar !== null}
        onAbiertoChange={(valor) => { if (!valor) setPorEliminar(null); }}
        titulo={t('categorias.eliminarTitulo')}
        descripcion={porEliminar ? t('categorias.eliminarDetalle', { nombre: porEliminar.nombre }) : ''}
        textoConfirmar={t('categorias.eliminar')}
        tono="peligro"
        onConfirmar={() => {
          const fila = porEliminar;
          setPorEliminar(null);
          if (fila) void eliminar(fila);
        }}
      />
    </div>
  );
}
