'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import {
  CostCenterService,
  type AlcancePlantilla,
  type CostCenter,
  type DistribucionCentro,
  type ResultadoPlantilla,
} from './CostCenterService';

const FORMULARIO_VACIO = { code: '', name: '', parent_id: '', is_active: true };

const PLANTILLAS: { id: AlcancePlantilla; titulo: string; detalle: string }[] = [
  { id: 'base', titulo: 'Base', detalle: '100 Administración, 200 Ventas/Comercial y 300 Operación/Producción.' },
  { id: 'sector', titulo: 'Sector', detalle: 'La base más los centros del tipo de organización.' },
  { id: 'sucursal', titulo: 'Por sucursal', detalle: 'La base y un subcentro de ventas por cada sucursal.' },
];

interface Nodo extends CostCenter {
  hijos: Nodo[];
}

function armarArbol(centros: CostCenter[]): Nodo[] {
  const nodos = new Map<string, Nodo>(centros.map((centro) => [centro.id, { ...centro, hijos: [] }]));
  const raices: Nodo[] = [];
  for (const nodo of nodos.values()) {
    const padre = nodo.parent_id ? nodos.get(nodo.parent_id) : undefined;
    if (padre) padre.hijos.push(nodo);
    else raices.push(nodo);
  }
  const ordenar = (lista: Nodo[]) => {
    lista.sort((a, b) => a.code.localeCompare(b.code, 'es'));
    lista.forEach((nodo) => ordenar(nodo.hijos));
  };
  ordenar(raices);
  return raices;
}

export function CentroCostosPage() {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState(FORMULARIO_VACIO);
  const [plantillaAbierta, setPlantillaAbierta] = useState(false);
  const [alcance, setAlcance] = useState<AlcancePlantilla>('base');
  const [vistaPrevia, setVistaPrevia] = useState<ResultadoPlantilla | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [distribuciones, setDistribuciones] = useState<DistribucionCentro[]>([]);
  const [distAbierta, setDistAbierta] = useState(false);
  const [nombreDist, setNombreDist] = useState('');
  const [lineasDist, setLineasDist] = useState([{ centroId: '', porcentaje: '60' }, { centroId: '', porcentaje: '40' }]);
  const [guardandoDist, setGuardandoDist] = useState(false);

  const arbol = useMemo(() => armarArbol(centers), [centers]);
  const sumaDist = lineasDist.reduce((total, linea) => total + (Number(linea.porcentaje) || 0), 0);
  const centrosActivos = centers.filter((centro) => centro.is_active);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      const [centros, reps] = await Promise.all([
        CostCenterService.getAll(),
        CostCenterService.distribuciones(),
      ]);
      setCenters(centros);
      setDistribuciones(reps);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar centros de costos');
    } finally {
      setIsLoading(false);
    }
  };

  const abrir = (centro?: CostCenter, padreId = '') => {
    setEditing(centro ?? null);
    setFormData(centro
      ? { code: centro.code, name: centro.name, parent_id: centro.parent_id || '', is_active: centro.is_active }
      : { ...FORMULARIO_VACIO, parent_id: padreId });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error('Código y nombre son requeridos');
      return;
    }
    try {
      const input = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        parent_id: formData.parent_id || null,
        is_active: formData.is_active,
      };
      if (editing) {
        await CostCenterService.update(editing.id, input);
        toast.success('Centro de costo actualizado');
      } else {
        await CostCenterService.create(input);
        toast.success('Centro de costo creado');
      }
      setShowDialog(false);
      await load();
    } catch (error) {
      const texto = error instanceof Error ? error.message : '';
      if (texto.includes('CENTRO_CICLO')) toast.error('Ese padre formaría un ciclo');
      else toast.error('Error al guardar');
    }
  };

  const cambiarEstado = async (centro: CostCenter, activo: boolean) => {
    try {
      await CostCenterService.desactivar(centro.id, activo);
      toast.success(activo ? 'Centro activado' : 'Centro desactivado');
      await load();
    } catch {
      toast.error('No se pudo cambiar el estado');
    }
  };

  const previsualizar = async (siguiente: AlcancePlantilla) => {
    setAlcance(siguiente);
    setAplicando(true);
    try {
      setVistaPrevia(await CostCenterService.sembrar(siguiente, false));
    } catch (error) {
      console.error(error);
      toast.error('No se pudo calcular la plantilla');
    } finally {
      setAplicando(false);
    }
  };

  const aplicar = async () => {
    setAplicando(true);
    try {
      const resultado = await CostCenterService.sembrar(alcance, true);
      toast.success(resultado.creados > 0
        ? `Se crearon ${resultado.creados} centros. ${resultado.ya_existian} ya existían.`
        : 'La plantilla ya estaba aplicada. No se crearon duplicados.');
      setPlantillaAbierta(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error('No se pudo aplicar la plantilla');
    } finally {
      setAplicando(false);
    }
  };

  const abrirDistribucion = () => {
    setNombreDist('');
    setLineasDist([{ centroId: '', porcentaje: '60' }, { centroId: '', porcentaje: '40' }]);
    setDistAbierta(true);
  };

  const guardarDistribucion = async () => {
    const nombre = nombreDist.trim();
    if (!nombre) {
      toast.error('El nombre es requerido');
      return;
    }
    const lineas = lineasDist.map((linea) => ({
      cost_center_id: linea.centroId,
      porcentaje: Number(linea.porcentaje),
    }));
    if (lineas.length < 2 || lineas.some((linea) => !linea.cost_center_id || !Number.isFinite(linea.porcentaje) || linea.porcentaje <= 0)) {
      toast.error('Cada línea necesita un centro y un porcentaje mayor que cero');
      return;
    }
    if (new Set(lineas.map((linea) => linea.cost_center_id)).size !== lineas.length) {
      toast.error('Un centro no puede repetirse');
      return;
    }
    if (Math.abs(sumaDist - 100) > 0.001) {
      toast.error('Los porcentajes deben sumar 100');
      return;
    }
    setGuardandoDist(true);
    try {
      await CostCenterService.guardarDistribucion(nombre, lineas);
      toast.success('Distribución guardada');
      setDistAbierta(false);
      await load();
    } catch (error) {
      const texto = error instanceof Error ? error.message : '';
      if (texto.includes('DISTRIBUCION_SUMA')) toast.error('Los porcentajes deben sumar 100');
      else if (texto.includes('CENTRO_REPETIDO')) toast.error('Un centro no puede repetirse');
      else if (texto.includes('NOMBRE_REPETIDO')) toast.error('Ya existe una distribución con ese nombre');
      else if (texto.includes('CENTRO_INVALIDO')) toast.error('Hay un centro inactivo o que no pertenece a la organización');
      else if (texto.includes('NOMBRE_REQUERIDO')) toast.error('El nombre es requerido');
      else toast.error('No se pudo guardar la distribución');
    } finally {
      setGuardandoDist(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen space-y-6 bg-background p-4 sm:p-6 lg:p-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-background p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-muted p-2">
            <Building2 className="h-6 w-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Centros de costo</h1>
            <p className="text-muted-foreground">Árbol por código, sucursal y estado</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setVistaPrevia(null);
              setPlantillaAbierta(true);
              void previsualizar('base');
            }}
          >
            Aplicar plantilla
          </Button>
          <Button variant="outline" onClick={abrirDistribucion}>Nueva distribución</Button>
          <Button onClick={() => abrir()}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{centers.length} centros</CardTitle>
        </CardHeader>
        <CardContent>
          {arbol.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No hay centros de costo registrados</p>
          ) : (
            <div className="space-y-1">
              {arbol.map((nodo) => (
                <FilaCentro key={nodo.id} nodo={nodo} profundidad={0} onEditar={abrir} onEstado={cambiarEstado} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Distribuciones</CardTitle>
        </CardHeader>
        <CardContent>
          {distribuciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay distribuciones. Cada una reparte un movimiento entre centros y la suma de los porcentajes es 100.</p>
          ) : (
            <div className="space-y-2">
              {distribuciones.map((dist) => (
                <p key={dist.id} className="text-sm text-foreground">
                  <span className="font-medium">{dist.nombre}</span>
                  <span className="text-muted-foreground"> · {dist.lineas.map((linea) => {
                    const centro = centers.find((item) => item.id === linea.cost_center_id);
                    return centro ? `${centro.code} ${linea.porcentaje}%` : `${linea.porcentaje}%`;
                  }).join(' / ')}</span>
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Nuevo'} centro de costo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={formData.code}
                onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                disabled={!!editing}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Centro padre</Label>
              <select
                aria-label="Centro padre"
                value={formData.parent_id}
                onChange={(event) => setFormData({ ...formData, parent_id: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Sin padre</option>
                {centers.filter((centro) => centro.id !== editing?.id).map((centro) => (
                  <option key={centro.id} value={centro.id}>{centro.code} — {centro.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => void handleSave()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={plantillaAbierta} onOpenChange={setPlantillaAbierta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {PLANTILLAS.map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                onClick={() => void previsualizar(opcion.id)}
                className={`w-full rounded-md border px-3 py-2 text-left ${alcance === opcion.id ? 'border-primary bg-muted' : 'border-border'}`}
              >
                <span className="block font-medium text-foreground">{opcion.titulo}</span>
                <span className="text-sm text-muted-foreground">{opcion.detalle}</span>
              </button>
            ))}
            {vistaPrevia ? (
              <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-border p-2 text-sm">
                <p className="text-muted-foreground">
                  Se crearían {vistaPrevia.previstos}. {vistaPrevia.ya_existian} ya existen y no se modifican.
                </p>
                {vistaPrevia.centros.map((linea) => (
                  <p key={`${linea.code}-${linea.branch_id ?? ''}`} className="font-mono text-foreground">
                    {linea.code} {linea.name} · {linea.accion === 'crear' ? 'se creará' : 'ya existe'}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlantillaAbierta(false)}>Cancelar</Button>
            <Button onClick={() => void aplicar()} disabled={aplicando || !vistaPrevia}>
              {aplicando ? 'Aplicando…' : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={distAbierta} onOpenChange={setDistAbierta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva distribución</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="nombre-distribucion">Nombre</Label>
              <Input id="nombre-distribucion" value={nombreDist} onChange={(event) => setNombreDist(event.target.value)} />
            </div>
            {lineasDist.map((linea, indice) => (
              <div key={indice} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <div className="space-y-2">
                  <Label>Centro</Label>
                  <select
                    aria-label={`Centro de la línea ${indice + 1}`}
                    value={linea.centroId}
                    onChange={(event) => {
                      const siguientes = [...lineasDist];
                      siguientes[indice] = { ...linea, centroId: event.target.value };
                      setLineasDist(siguientes);
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Elegir centro</option>
                    {centrosActivos.map((centro) => (
                      <option key={centro.id} value={centro.id}>{centro.code} — {centro.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Porcentaje</Label>
                  <Input
                    inputMode="decimal"
                    aria-label={`Porcentaje de la línea ${indice + 1}`}
                    value={linea.porcentaje}
                    onChange={(event) => {
                      const siguientes = [...lineasDist];
                      siguientes[indice] = { ...linea, porcentaje: event.target.value };
                      setLineasDist(siguientes);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={lineasDist.length <= 2}
                  onClick={() => setLineasDist(lineasDist.filter((_, i) => i !== indice))}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 text-sm">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLineasDist([...lineasDist, { centroId: '', porcentaje: '' }])}
              >
                Agregar línea
              </Button>
              <span className={Math.abs(sumaDist - 100) <= 0.001 ? 'text-foreground' : 'text-destructive'}>
                Suma {sumaDist}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDistAbierta(false)}>Cancelar</Button>
            <Button onClick={() => void guardarDistribucion()} disabled={guardandoDist}>
              {guardandoDist ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilaCentro({
  nodo,
  profundidad,
  onEditar,
  onEstado,
}: {
  nodo: Nodo;
  profundidad: number;
  onEditar: (centro?: CostCenter, padreId?: string) => void;
  onEstado: (centro: CostCenter, activo: boolean) => void;
}) {
  return (
    <>
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted"
        style={{ paddingLeft: `${12 + profundidad * 20}px` }}
      >
        {profundidad > 0 ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : null}
        <span className="w-24 font-mono text-sm text-muted-foreground">{nodo.code}</span>
        <span className="flex-1 font-medium text-foreground">{nodo.name}</span>
        <span className="hidden text-sm text-muted-foreground sm:inline">{nodo.sucursal || '—'}</span>
        <span className={nodo.is_active ? 'text-xs text-foreground' : 'text-xs text-destructive'}>
          {nodo.is_active ? 'Activo' : 'Inactivo'}
        </span>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Editar ${nodo.name}`} onClick={() => onEditar(nodo)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onEditar(undefined, nodo.id)}>
          Hijo
        </Button>
        <Switch checked={nodo.is_active} onCheckedChange={(checked) => onEstado(nodo, checked)} aria-label={`Estado de ${nodo.name}`} />
      </div>
      {nodo.hijos.map((hijo) => (
        <FilaCentro key={hijo.id} nodo={hijo} profundidad={profundidad + 1} onEditar={onEditar} onEstado={onEstado} />
      ))}
    </>
  );
}
