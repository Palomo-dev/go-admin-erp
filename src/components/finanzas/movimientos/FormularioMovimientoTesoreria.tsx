'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchSelect } from '@/components/ui/search-select';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import { supabase } from '@/lib/supabase/config';
import { getCurrentUserId, getOrganizationId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { movimientosService, type BankAccount } from '@/lib/services/movimientosService';
import { SelectorCategoria, type OpcionCategoria } from './SelectorCategoria';
import { SelectorTercero } from './SelectorTercero';

type TipoFormulario = 'ingreso' | 'egreso';

interface CuentaPlan {
  account_code: string;
  name: string;
  es_movimiento: boolean | null;
  requiere_centro_costo: boolean | null;
  requiere_tercero: boolean | null;
}

interface CentroCosto {
  id: string;
  code: string;
  name: string;
}

interface Vista {
  debito: string | null;
  credito: string | null;
  fallo: string | null;
  cuentaTesoreria: string | null;
}

const MAX_SOPORTE = 5 * 1024 * 1024;
const MIME_SOPORTE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function FormularioMovimientoTesoreria({
  tipo,
  open,
  onOpenChange,
  onSuccess,
}: {
  tipo: TipoFormulario;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const t = useTranslations('tesoreria');
  const { selectedBranchId } = useBranch();
  const [branchId, setBranchId] = useState<number | null>(selectedBranchId);
  const [categorias, setCategorias] = useState<OpcionCategoria[]>([]);
  const [cuentas, setCuentas] = useState<CuentaPlan[]>([]);
  const [centros, setCentros] = useState<CentroCosto[]>([]);
  const [bancos, setBancos] = useState<BankAccount[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [cuenta, setCuenta] = useState('');
  const [origen, setOrigen] = useState<'cash' | 'bank'>('cash');
  const [bancoId, setBancoId] = useState('');
  const [nit, setNit] = useState('');
  const [nombreTercero, setNombreTercero] = useState('');
  const [centroId, setCentroId] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [conceptoTocado, setConceptoTocado] = useState(false);
  const [notas, setNotas] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [vistaCargando, setVistaCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sembrando, setSembrando] = useState(false);

  const cuentaElegida = cuentas.find((fila) => fila.account_code === cuenta);
  const exigeCentro = cuentaElegida?.requiere_centro_costo === true;
  const exigeTercero = cuentaElegida?.requiere_tercero === true;

  const cargar = useCallback(async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    const [cats, plan, costos, cuentasBanco] = await Promise.all([
      supabase
        .from('categorias_tesoreria')
        .select('id, nombre, icono, cuenta_sugerida')
        .eq('organization_id', orgId)
        .eq('tipo', tipo)
        .eq('activa', true)
        .order('orden'),
      supabase
        .from('chart_of_accounts')
        .select('account_code, name, es_movimiento, requiere_centro_costo, requiere_tercero')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('account_code'),
      supabase
        .from('cost_centers')
        .select('id, code, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('code'),
      movimientosService.getBankAccounts(),
    ]);
    if (cats.error) throw cats.error;
    if (plan.error) throw plan.error;
    if (costos.error) throw costos.error;
    setCategorias(
      (cats.data ?? []).map((fila) => ({
        id: Number(fila.id),
        nombre: String(fila.nombre),
        icono: String(fila.icono || 'circle'),
        cuenta: fila.cuenta_sugerida ? String(fila.cuenta_sugerida) : null,
      })),
    );
    setCuentas((plan.data ?? []) as CuentaPlan[]);
    setCentros((costos.data ?? []) as CentroCosto[]);
    setBancos(cuentasBanco);
  }, [tipo]);

  useEffect(() => {
    if (!open) return;
    setBranchId(selectedBranchId);
    setCategoriaId(null);
    setCuenta('');
    setOrigen('cash');
    setBancoId('');
    setNit('');
    setNombreTercero('');
    setCentroId('');
    setMonto('');
    setConcepto('');
    setConceptoTocado(false);
    setNotas('');
    setArchivo(null);
    setVista(null);
    void cargar().catch(() => {
      toast({ title: t('errorTitulo'), description: t('errorCarga.cuentasBancarias'), variant: 'destructive' });
    });
  }, [open, selectedBranchId, cargar, t]);

  const elegirCategoria = (id: number) => {
    setCategoriaId(id);
    const categoria = categorias.find((fila) => fila.id === id);
    if (!categoria) return;
    if (categoria.cuenta) setCuenta(categoria.cuenta);
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
      void supabase
        .rpc('fn_vista_previa_asiento_tesoreria', {
          p_organization_id: orgId,
          p_tipo: tipo === 'ingreso' ? 'in' : 'out',
          p_fuente: origen,
          p_bank_account_id: origen === 'bank' && bancoId ? Number(bancoId) : null,
          p_cuenta: cuenta,
        })
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
      .filter((fila) => fila.es_movimiento !== false)
      .map((fila) => ({ value: fila.account_code, label: `${fila.account_code} · ${fila.name}` })),
    [cuentas],
  );
  const opcionesBanco = useMemo(
    () => bancos.map((fila) => ({ value: String(fila.id), label: fila.name })),
    [bancos],
  );
  const opcionesCentro = useMemo(
    () => centros.map((fila) => ({ value: fila.id, label: `${fila.code} · ${fila.name}` })),
    [centros],
  );

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
    await cargar();
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

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    const orgId = getOrganizationId();
    const valor = Number(monto.replace(',', '.'));
    if (!orgId) {
      toast({ title: t('errorTitulo'), description: t('errores.sin_organizacion'), variant: 'destructive' });
      return;
    }
    if (!categoriaId) {
      toast({ title: t('errorTitulo'), description: t('movimiento.faltaCategoria'), variant: 'destructive' });
      return;
    }
    if (!cuenta || vista?.fallo) {
      toast({ title: t('errorTitulo'), description: vista?.fallo || t('movimiento.faltaCuenta'), variant: 'destructive' });
      return;
    }
    if (!concepto.trim()) {
      toast({ title: t('errorTitulo'), description: t('movimiento.faltaConcepto'), variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      toast({ title: t('errorTitulo'), description: t('movimiento.faltaMonto'), variant: 'destructive' });
      return;
    }
    if (origen === 'bank' && !bancoId) {
      toast({ title: t('errorTitulo'), description: t('movimiento.faltaBanco'), variant: 'destructive' });
      return;
    }
    if (exigeCentro && !centroId) {
      toast({ title: t('errorTitulo'), description: t('movimiento.faltaCentro'), variant: 'destructive' });
      return;
    }
    if (exigeTercero && !nit.trim()) {
      toast({ title: t('errorTitulo'), description: t('movimiento.faltaTercero'), variant: 'destructive' });
      return;
    }

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
        centro_costo_id: centroId || null,
        tercero_nit: nit.trim() || null,
        tercero_nombre: nombreTercero.trim() || null,
        soporte_path: soporte,
      };
      const resultado = origen === 'cash'
        ? await movimientosService.createCashMovement(payload, userId || '')
        : await movimientosService.createBankTransaction(payload);
      if (!resultado.success) {
        if (soporte) await supabase.storage.from('soportes-tesoreria').remove([soporte]);
        toast({
          title: t('errorTitulo'),
          description: t(`errores.${resultado.codigo ?? 'desconocido'}`),
          variant: 'destructive',
        });
        return;
      }
      toast({ description: tipo === 'ingreso' ? t('movimiento.exitoIngreso') : t('movimiento.exitoEgreso') });
      onSuccess();
    } catch (error) {
      if (soporte) await supabase.storage.from('soportes-tesoreria').remove([soporte]);
      const codigo = error instanceof Error && error.message === 'soporte_invalido' ? null : 'desconocido';
      if (codigo) {
        toast({ title: t('errorTitulo'), description: t('errores.desconocido'), variant: 'destructive' });
      }
    } finally {
      setGuardando(false);
    }
  };

  const nombreCuenta = (codigo: string | null) => {
    if (!codigo) return '';
    const fila = cuentas.find((cuentaPlan) => cuentaPlan.account_code === codigo);
    return fila ? `${codigo} · ${fila.name}` : codigo;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tipo === 'ingreso' ? t('movimiento.tituloIngreso') : t('movimiento.tituloEgreso')}</DialogTitle>
          <DialogDescription>
            {tipo === 'ingreso' ? t('movimiento.descripcionIngreso') : t('movimiento.descripcionEgreso')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void guardar(event)} className="space-y-4">
          <BranchSelectorField value={branchId} onChange={setBranchId} />

          {categorias.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="mb-2">{t('movimiento.sinCategorias')}</p>
              <Button type="button" variant="outline" onClick={() => void sembrar()} disabled={sembrando}>
                {sembrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('movimiento.completarPredefinidas')}
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('movimiento.categoria')}</Label>
              <SelectorCategoria
                categorias={categorias}
                value={categoriaId}
                onChange={elegirCategoria}
                placeholder={t('movimiento.categoria')}
                buscar={t('movimiento.buscarCategoria')}
                vacio={t('movimiento.sinCategorias')}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('movimiento.cuenta')}</Label>
            <SearchSelect
              options={opcionesCuenta}
              value={cuenta}
              onValueChange={setCuenta}
              placeholder={t('movimiento.cuenta')}
              searchPlaceholder={t('movimiento.buscarCuenta')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('movimiento.origen')}</Label>
            <RadioGroup value={origen} onValueChange={(valor) => setOrigen(valor as 'cash' | 'bank')} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cash" id="origen-caja" />
                <Label htmlFor="origen-caja" className="flex items-center gap-1 font-normal">
                  <Wallet className="h-4 w-4" /> {t('movimiento.caja')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="bank" id="origen-banco" />
                <Label htmlFor="origen-banco" className="flex items-center gap-1 font-normal">
                  <Building2 className="h-4 w-4" /> {t('movimiento.banco')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {origen === 'bank' ? (
            <div className="space-y-1.5">
              <Label>{t('movimiento.cuentaBancaria')}</Label>
              <SearchSelect
                options={opcionesBanco}
                value={bancoId}
                onValueChange={setBancoId}
                placeholder={t('movimiento.cuentaBancaria')}
                searchPlaceholder={t('movimiento.buscarCuenta')}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>{t('movimiento.tercero')}</Label>
            <SelectorTercero
              nit={nit}
              nombre={nombreTercero}
              onChange={(tercero) => {
                setNit(tercero.nit);
                setNombreTercero(tercero.nombre);
              }}
              placeholder={t('movimiento.buscarTercero')}
              usarNit={(documento) => t('movimiento.usarNit', { nit: documento })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('movimiento.centroCosto')}</Label>
            <SearchSelect
              options={opcionesCentro}
              value={centroId || 'none'}
              onValueChange={(valor) => setCentroId(valor === 'none' ? '' : valor)}
              noneLabel={t('movimiento.sinCentro')}
              placeholder={t('movimiento.centroCosto')}
              searchPlaceholder={t('movimiento.buscarCuenta')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="monto-tesoreria">{t('movimiento.monto')}</Label>
              <Input id="monto-tesoreria" inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concepto-tesoreria">{t('movimiento.concepto')}</Label>
              <Input
                id="concepto-tesoreria"
                value={concepto}
                onChange={(event) => {
                  setConceptoTocado(true);
                  setConcepto(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas-tesoreria">{t('movimiento.notas')}</Label>
            <Textarea id="notas-tesoreria" value={notas} onChange={(event) => setNotas(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="soporte-tesoreria">{t('movimiento.soporte')}</Label>
            <Input
              id="soporte-tesoreria"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-gray-500">{t('movimiento.soporteAyuda')}</p>
            {archivo ? (
              <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setArchivo(null)}>
                {t('movimiento.quitarSoporte')}
              </Button>
            ) : null}
          </div>

          <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700">
            <p className="mb-1 font-medium">{t('movimiento.vistaPrevia')}</p>
            {vistaCargando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {vista?.fallo ? <p className="text-red-600">{vista.fallo}</p> : null}
            {vista && !vista.fallo ? (
              <ul className="space-y-1 text-gray-700 dark:text-gray-300">
                <li>{t('movimiento.debito')}: {nombreCuenta(vista.debito)}</li>
                <li>{t('movimiento.credito')}: {nombreCuenta(vista.credito)}</li>
              </ul>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('movimiento.cancelar')}
            </Button>
            <Button type="submit" disabled={guardando || vistaCargando || !vista || !!vista.fallo}>
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {guardando ? t('movimiento.guardando') : t('movimiento.guardar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
