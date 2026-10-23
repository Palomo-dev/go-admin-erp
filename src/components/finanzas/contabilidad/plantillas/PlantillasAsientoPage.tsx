'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContabilidadService, mensajeErrorAsiento, type ChartAccount, type PlantillaAsiento } from '../ContabilidadService';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CampoTerceroAsiento } from '../CampoTerceroAsiento';

interface LineaForm {
  account_code: string;
  description: string;
  debit: string;
  credit: string;
  tercero_nit: string;
  tercero_nombre: string;
  cost_center_id: string;
}

const vacia = (): LineaForm => ({
  account_code: '',
  description: '',
  debit: '',
  credit: '',
  tercero_nit: '',
  tercero_nombre: '',
  cost_center_id: '',
});

export function PlantillasAsientoPage() {
  const router = useRouter();
  const { selectedBranchId } = useBranch();
  const { toInstant, getToday, formatDate } = useFormatDate(selectedBranchId);
  const [plantillas, setPlantillas] = useState<PlantillaAsiento[]>([]);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [centros, setCentros] = useState<{ id: string; code: string; name: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [memo, setMemo] = useState('');
  const [fecha, setFecha] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([vacia(), vacia()]);

  const movimiento = useMemo(() => cuentas.filter((c) => esCuentaDeMovimiento(c, cuentas)), [cuentas]);

  const cargar = async () => {
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
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las plantillas');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setFecha((prev) => prev || getToday());
    cargar();
    // La lista se carga una vez; la fecha espera la zona de la sucursal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToday]);

  const cambiar = (indice: number, campo: keyof LineaForm, valor: string) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  };

  const fijarTercero = (indice: number, nit: string, nombre: string) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, tercero_nit: nit, tercero_nombre: nombre } : l)));
  };

  const guardar = async () => {
    const utiles = lineas.filter((l) => l.account_code && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0));
    if (!nombre.trim() || utiles.length < 2) {
      toast.error('La plantilla necesita nombre y al menos dos líneas');
      return;
    }
    setGuardando(true);
    try {
      await ContabilidadService.guardarPlantilla({
        nombre: nombre.trim(),
        memo: memo.trim() || null,
        lineas: utiles.map((l, orden) => ({
          orden: orden + 1,
          account_code: l.account_code,
          descripcion: l.description || null,
          debito: parseFloat(l.debit) || 0,
          credito: parseFloat(l.credit) || 0,
          tercero_nit: l.tercero_nit.trim() || null,
          tercero_nombre: l.tercero_nombre.trim() || null,
          cost_center_id: l.cost_center_id || null,
        })),
      });
      toast.success('Plantilla guardada');
      setNombre('');
      setMemo('');
      setLineas([vacia(), vacia()]);
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : mensajeErrorAsiento(null));
    } finally {
      setGuardando(false);
    }
  };

  const aplicar = async (id: string) => {
    if (!selectedBranchId || !fecha) {
      toast.error('Elige la sucursal y la fecha del asiento');
      return;
    }
    try {
      const asientoId = await ContabilidadService.aplicarPlantilla(id, selectedBranchId, toInstant(fecha));
      toast.success('Borrador creado. Revísalo antes de publicarlo.');
      router.push(`/app/finanzas/contabilidad/asientos/${asientoId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo aplicar la plantilla');
    }
  };

  const archivar = async (id: string) => {
    try {
      await ContabilidadService.archivarPlantilla(id);
      setPlantillas((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo archivar');
    }
  };

  return (
    <div className="min-h-screen space-y-6 bg-gray-50 p-4 dark:bg-gray-900 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link href="/app/finanzas/contabilidad">
          <Button variant="ghost" size="icon" aria-label="Volver a contabilidad">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-900/30">
          <FileText className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plantillas de asientos</h1>
          <p className="text-sm text-gray-500">Asientos recurrentes. Aplicar crea un borrador, no lo publica.</p>
        </div>
      </div>

      <Card className="dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Nueva plantilla</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Memo</Label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>
          {lineas.map((linea, indice) => {
            const cuenta = cuentas.find((c) => c.account_code === linea.account_code);
            return (
              <div key={indice} className="grid gap-2 rounded-lg border p-3 dark:border-gray-700 sm:grid-cols-4">
                <select
                  aria-label={`Cuenta ${indice + 1}`}
                  value={linea.account_code}
                  onChange={(e) => cambiar(indice, 'account_code', e.target.value)}
                  className="h-10 rounded-md border px-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  <option value="">Cuenta de movimiento</option>
                  {movimiento.map((c) => (
                    <option key={c.account_code} value={c.account_code}>{c.account_code} — {c.name}</option>
                  ))}
                </select>
                <Input value={linea.description} onChange={(e) => cambiar(indice, 'description', e.target.value)} placeholder="Descripción" />
                <Input type="number" value={linea.debit} onChange={(e) => cambiar(indice, 'debit', e.target.value)} placeholder="Débito" />
                <Input type="number" value={linea.credit} onChange={(e) => cambiar(indice, 'credit', e.target.value)} placeholder="Crédito" />
                {linea.account_code && (
                  <>
                    <CampoTerceroAsiento
                      nit={linea.tercero_nit}
                      nombre={linea.tercero_nombre}
                      obligatorio={!!cuenta?.requiere_tercero}
                      onCambiar={(nit, nombre) => fijarTercero(indice, nit, nombre)}
                    />
                    <select
                      aria-label="Centro de costo"
                      value={linea.cost_center_id}
                      onChange={(e) => cambiar(indice, 'cost_center_id', e.target.value)}
                      className="h-10 rounded-md border px-2 text-sm dark:border-gray-600 dark:bg-gray-900 sm:col-span-2"
                    >
                      <option value="">{cuenta?.requiere_centro_costo ? 'Centro de costo *' : 'Centro de costo'}</option>
                      {centros.map((cc) => (
                        <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            );
          })}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setLineas((prev) => [...prev, vacia()])}>
              <Plus className="mr-1 h-4 w-4" /> Línea
            </Button>
            <Button type="button" onClick={() => void guardar()} disabled={guardando}>
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar plantilla
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Guardadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs space-y-2">
            <Label>Fecha del borrador</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {fecha && <p className="text-xs text-gray-500">Se aplicará el {formatDate(toInstant(fecha))}.</p>}
          </div>
          {cargando ? <p className="text-sm text-gray-500">Cargando…</p> : null}
          {!cargando && plantillas.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay plantillas.</p> : null}
          {plantillas.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 dark:border-gray-700">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{p.nombre}</p>
                <p className="text-sm text-gray-500">{p.memo || `${p.lineas.length} líneas`}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void aplicar(p.id)}>Usar</Button>
                <Button type="button" variant="ghost" className="text-red-600" onClick={() => void archivar(p.id)} aria-label={`Archivar ${p.nombre}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
