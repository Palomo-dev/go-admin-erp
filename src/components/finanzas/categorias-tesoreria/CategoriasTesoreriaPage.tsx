'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { PREDEFINIDAS, padresValidos, type TipoCategoria } from '@/lib/finanzas/categoriasTesoreria';
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

  const opcionesCuenta = useMemo(
    () => cuentas
      .filter((cuenta) => cuenta.es_movimiento !== false)
      .map((cuenta) => ({ value: cuenta.account_code, label: `${cuenta.account_code} · ${cuenta.name}` })),
    [cuentas],
  );

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

  const guardar = async () => {
    const orgId = getOrganizationId();
    if (!orgId || !formulario.nombre.trim()) return;
    setGuardando(true);
    const payload = {
      nombre: formulario.nombre.trim(),
      icono: formulario.icono,
      cuenta_sugerida: formulario.cuenta || null,
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
      toast({ title: t('errorTitulo'), description: t('categorias.errorGuardar'), variant: 'destructive' });
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
      toast({ title: t('errorTitulo'), description: t('categorias.errorGuardar'), variant: 'destructive' });
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
      toast({ title: t('errorTitulo'), description: t('categorias.errorGuardar'), variant: 'destructive' });
      return;
    }
    await cargar();
  };

  const ayuda = (clave: string | null) => PREDEFINIDAS.find((fila) => fila.clave === clave)?.ayuda;

  const bloque = (tipo: TipoCategoria, titulo: string) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{titulo}</h2>
        <Button type="button" variant="outline" onClick={() => abrirNueva(tipo)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('categorias.nueva')}
        </Button>
      </div>
      {filas.filter((fila) => fila.tipo === tipo).length === 0 ? (
        <p className="text-sm text-gray-500">{t('categorias.vacio')}</p>
      ) : (
        filas.filter((fila) => fila.tipo === tipo).map((fila) => (
          <Card key={fila.id} className={fila.activa ? '' : 'opacity-60'}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <IconoCategoria nombre={fila.icono} className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white">{fila.nombre}</p>
                <p className="text-sm text-gray-500">
                  {fila.cuenta_sugerida || '—'}
                  {ayuda(fila.clave) ? ` · ${ayuda(fila.clave)}` : ''}
                </p>
              </div>
              {fila.es_predefinida ? <Badge variant="secondary">{t('categorias.predefinida')}</Badge> : null}
              <div className="flex items-center gap-2">
                <Switch checked={fila.activa} onCheckedChange={(valor) => void cambiarActiva(fila, valor)} />
                <span className="text-xs text-gray-500">{fila.activa ? t('categorias.activa') : t('categorias.desactivar')}</span>
              </div>
              <Button type="button" variant="outline" onClick={() => abrirEdicion(fila)}>{t('categorias.editar')}</Button>
              {!fila.es_predefinida ? (
                <Button type="button" variant="ghost" onClick={() => void eliminar(fila)}>{t('categorias.eliminar')}</Button>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );

  return (
    <div className="min-h-screen space-y-6 bg-gray-50 p-4 dark:bg-gray-900 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/bancos">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-900/30">
            <Tags className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('categorias.titulo')}</h1>
            <p className="text-gray-500">{t('categorias.descripcion')}</p>
          </div>
        </div>
        <Button type="button" onClick={() => void sembrar()} disabled={sembrando}>
          {sembrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('categorias.completar')}
        </Button>
      </div>

      {cargando ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="space-y-8">
          {bloque('ingreso', t('categorias.ingresos'))}
          {bloque('egreso', t('categorias.egresos'))}
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{formulario.id ? t('categorias.editar') : t('categorias.nueva')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('categorias.nombre')}</Label>
              <Input value={formulario.nombre} onChange={(event) => setFormulario({ ...formulario, nombre: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('categorias.icono')}</Label>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {ICONOS_CATEGORIA.map((icono) => (
                  <button
                    key={icono}
                    type="button"
                    className={`rounded border p-2 ${formulario.icono === icono ? 'border-blue-600 bg-blue-50' : 'border-transparent'}`}
                    onClick={() => setFormulario({ ...formulario, icono })}
                  >
                    <IconoCategoria nombre={icono} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
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
            </div>
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
            <div className="flex items-center gap-2">
              <Switch checked={formulario.activa} onCheckedChange={(activa) => setFormulario({ ...formulario, activa })} />
              <span>{t('categorias.activa')}</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>{t('categorias.cancelar')}</Button>
            <Button type="button" onClick={() => void guardar()} disabled={guardando || !formulario.nombre.trim()}>
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('categorias.guardar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
