'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useBranch } from '@/lib/context/BranchContext';
import {
  CLAVES_CONTABLES,
  DEFINICIONES_CLAVE,
  nombreSector,
  propuestaPorSector,
  validarCuentaDeMovimiento,
  type ClaveContable,
  type CuentaContable,
  type FilaConfiguracion,
} from '@/lib/finanzas/configuracionContable';
import { AlertasFalloContable } from './AlertasFalloContable';
import { ConfiguracionContableService } from './ConfiguracionContableService';

const USAR_REGLA = 'regla';

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
  const { branches } = useBranch();
  const [filas, setFilas] = useState<FilaConfiguracion[]>([]);
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [alcance, setAlcance] = useState('org');
  const [elecciones, setElecciones] = useState<Elecciones>(vacias);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const [tipo, setTipo] = useState<number | null>(null);

  const branchId = alcance === 'org' ? null : Number(alcance);
  const sedes = branches.filter((sede) => typeof sede.id === 'number');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([
      ConfiguracionContableService.listar(),
      ConfiguracionContableService.cuentas(),
    ]).then(([guardadas, plan]) => {
      if (!vivo) return;
      setFilas(guardadas);
      setCuentas(plan);
    }).catch((error) => {
      console.error(error);
      if (vivo) toast.error('No se pudo cargar la configuración contable');
    }).finally(() => {
      if (vivo) setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!cargando) setElecciones(eleccionesDe(filas, branchId));
  }, [alcance, filas, cargando, branchId]);

  const cuentasDeMovimiento = useMemo(
    () => cuentas.filter((cuenta) => cuenta.is_active !== false && cuenta.es_movimiento !== false),
    [cuentas],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof DEFINICIONES_CLAVE>();
    for (const definicion of DEFINICIONES_CLAVE) {
      const lista = mapa.get(definicion.grupo) ?? [];
      lista.push(definicion);
      mapa.set(definicion.grupo, lista);
    }
    return Array.from(mapa.entries());
  }, []);

  const heredada = (clave: ClaveContable): string | null => {
    if (branchId == null) return null;
    return filas.find((fila) => fila.clave === clave && fila.branch_id == null)?.account_code ?? null;
  };

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
      toast.success(branchId == null ? 'Configuración de la organización guardada' : 'Configuración de la sede guardada');
      const guardadas = await ConfiguracionContableService.listar();
      setFilas(guardadas);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo guardar. La cuenta tiene que existir y ser de movimiento.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirAsistente = async () => {
    try {
      const tipoNegocio = await ConfiguracionContableService.tipoNegocio();
      setTipo(tipoNegocio);
      setAsistenteAbierto(true);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo leer el sector del negocio');
    }
  };

  const propuesta = propuestaPorSector(tipo);
  const filasPropuesta = CLAVES_CONTABLES.map((clave) => {
    const codigo = propuesta[clave];
    const cuenta = cuentas.find((item) => item.account_code === codigo);
    const sirve = !!cuenta && cuenta.es_movimiento !== false && cuenta.is_active !== false;
    return { clave, codigo, nombre: DEFINICIONES_CLAVE.find((item) => item.clave === clave)?.nombre ?? clave, sirve, nombreCuenta: cuenta?.name };
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

  if (cargando) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración contable
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Settings className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración contable</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Cuentas por defecto que usan los asientos automáticos
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void abrirAsistente()} className="dark:border-gray-600">
            <Sparkles className="h-4 w-4 mr-2" />
            Proponer según el sector
          </Button>
          <Button onClick={() => void guardar(elecciones)} disabled={guardando} className="bg-blue-600 hover:bg-blue-700">
            {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>

      <AlertasFalloContable />

      <Alert variant="info">
        <AlertTitle>Si no eliges cuenta, se usa la de la regla</AlertTitle>
        <AlertDescription>
          Una clave vacía no detiene el documento. Si eliges una cuenta y después deja de ser de movimiento, el documento queda con fallo contable y se avisa aquí. La sede solo reemplaza las claves que guardes en ella.
        </AlertDescription>
      </Alert>

      <div className="max-w-md space-y-2">
        <Label>Alcance</Label>
        <Select value={alcance} onValueChange={setAlcance}>
          <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="org">Toda la organización</SelectItem>
            {sedes.map((sede) => (
              <SelectItem key={sede.id} value={String(sede.id)}>{sede.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {grupos.map(([grupo, definiciones]) => (
        <Card key={grupo} className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">{grupo}</CardTitle>
            <CardDescription className="dark:text-gray-400">
              {branchId == null ? 'Valor de la organización' : 'Reemplazo de esta sede'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {definiciones.map((definicion) => {
              const valor = elecciones[definicion.clave] || USAR_REGLA;
              const deLaOrganizacion = heredada(definicion.clave);
              const opciones = cuentasDeMovimiento.some((cuenta) => cuenta.account_code === valor) || valor === USAR_REGLA
                ? cuentasDeMovimiento
                : [...cuentasDeMovimiento, ...cuentas.filter((cuenta) => cuenta.account_code === valor)];
              return (
                <div key={definicion.clave} className="grid gap-2 md:grid-cols-[16rem_1fr] md:items-center">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{definicion.nombre}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{definicion.ayuda}</p>
                    {deLaOrganizacion && valor === USAR_REGLA && (
                      <p className="text-xs text-blue-600 dark:text-blue-400">Hereda {deLaOrganizacion} de la organización</p>
                    )}
                  </div>
                  <Select
                    value={valor}
                    onValueChange={(cuenta) => setElecciones((prev) => ({ ...prev, [definicion.clave]: cuenta }))}
                  >
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value={USAR_REGLA}>Usar la cuenta de la regla</SelectItem>
                      {opciones.map((cuenta) => (
                        <SelectItem key={cuenta.account_code} value={cuenta.account_code}>
                          {cuenta.account_code}{cuenta.name ? ` - ${cuenta.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Dialog open={asistenteAbierto} onOpenChange={setAsistenteAbierto}>
        <DialogContent className="max-w-2xl dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Propuesta para {nombreSector(tipo)}</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Sale de la plantilla PUC y del sector. Se guarda en el alcance elegido arriba, la organización o la sede. Solo se guardan las cuentas que ya están en el plan y son de movimiento. El resto sigue con la regla.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2 py-2">
            {filasPropuesta.map((fila) => (
              <div key={fila.clave} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-gray-700 dark:text-gray-300">{fila.nombre}</span>
                <span className={fila.sirve ? 'text-gray-900 dark:text-white' : 'text-amber-700 dark:text-amber-300'}>
                  {fila.codigo}{fila.nombreCuenta ? ` - ${fila.nombreCuenta}` : ''}
                  {fila.sirve ? '' : ' · no se guardará: no está en el plan'}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsistenteAbierto(false)} className="dark:border-gray-600">Cancelar</Button>
            <Button onClick={() => void aplicarAsistente()} disabled={guardando} className="bg-blue-600 hover:bg-blue-700">
              Aplicar esta propuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
