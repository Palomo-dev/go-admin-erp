'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatNumeroMoneda } from '@/lib/utils/moneda';

interface FilaRenombre {
  origen: string;
  actual: string;
  propuesto: string;
  lineas: number;
}

interface FilaReclasificacion {
  origen: string;
  destino: string;
  debito: number;
  credito: number;
  neto: number;
  motivo: string;
}

interface FilaRegla {
  id: number;
  nombre: string | null;
  source_type: string;
  event_type: string;
  lado: string;
  actual: string;
  propuesto: string | null;
  editada: boolean;
  motivo: string;
}

interface VistaPrevia {
  organization_id: number;
  type_id: number | null;
  sector: string;
  renombres: FilaRenombre[];
  reclasificaciones: FilaReclasificacion[];
  reglas: FilaRegla[];
}

interface ResultadoAplicar {
  corrida_id: string;
  journal_entry_id: number | null;
  asientos: number[];
  ya_aplicado: boolean;
}

function numero(valor: number | string | null | undefined): number {
  return Number(valor) || 0;
}

export function ActualizarPucPage() {
  const moneda = useMonedaOrganizacion();
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [resultado, setResultado] = useState<ResultadoAplicar | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const cifra = (valor: number) => formatNumeroMoneda(valor, moneda);

  const previsualizar = async () => {
    const org = getOrganizationId();
    if (!org) {
      toast.error('No hay una organización activa');
      return;
    }
    setCargando(true);
    setResultado(null);
    setConfirmado(false);
    const { data, error } = await supabase.rpc('fn_puc_migracion_preview', { p_organization_id: org });
    setCargando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const crudo = (data ?? {}) as VistaPrevia;
    setVista({
      organization_id: crudo.organization_id,
      type_id: crudo.type_id ?? null,
      sector: crudo.sector || 'Comercio',
      renombres: crudo.renombres || [],
      reclasificaciones: (crudo.reclasificaciones || []).map((fila) => ({
        ...fila,
        debito: numero(fila.debito),
        credito: numero(fila.credito),
        neto: numero(fila.neto),
      })),
      reglas: crudo.reglas || [],
    });
  };

  const aplicar = async () => {
    const org = getOrganizationId();
    if (!org || !vista) return;
    setCargando(true);
    const { data, error } = await supabase.rpc('fn_puc_migracion_aplicar', { p_organization_id: org });
    setCargando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const crudo = (data ?? {}) as ResultadoAplicar;
    setResultado({
      corrida_id: crudo.corrida_id,
      journal_entry_id: crudo.journal_entry_id ?? null,
      asientos: crudo.asientos || [],
      ya_aplicado: Boolean(crudo.ya_aplicado),
    });
    toast.success(crudo.ya_aplicado ? 'Esa organización ya tenía el traslado' : 'PUC actualizado');
  };

  const asiento = resultado?.journal_entry_id ?? resultado?.asientos?.[0] ?? null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
          <RefreshCw className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Actualizar PUC</h1>
          <p className="text-gray-500 dark:text-gray-400">
            La vista previa no escribe. Aplicar crea el asiento de traslado y deja inactivas las cuentas de origen.
          </p>
        </div>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4 flex flex-wrap gap-3 items-center">
          <Button onClick={() => { void previsualizar(); }} disabled={cargando} className="bg-blue-600 hover:bg-blue-700">
            Ver vista previa
          </Button>
          {vista && (
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Organización {vista.organization_id} · {vista.sector}
            </span>
          )}
        </CardContent>
      </Card>

      {vista && (
        <>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Renombres sin movimientos</CardTitle>
              <CardDescription className="dark:text-gray-400">{vista.renombres.length} cuentas</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabla
                vacio="No hay nombres por corregir."
                columnas={['Código', 'Nombre actual', 'Nombre del decreto']}
                filas={vista.renombres.map((fila) => [fila.origen, fila.actual, fila.propuesto])}
              />
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Reclasificaciones con movimientos</CardTitle>
              <CardDescription className="dark:text-gray-400">
                El saldo neto pasa al destino con un contra-asiento. La cuenta de origen queda inactiva y conserva su historia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabla
                vacio="No hay saldos por trasladar."
                columnas={['Origen', 'Destino', 'Débito', 'Crédito', 'Neto', 'Motivo']}
                filas={vista.reclasificaciones.map((fila) => [
                  fila.origen, fila.destino, cifra(fila.debito), cifra(fila.credito), cifra(fila.neto), fila.motivo,
                ])}
              />
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Reglas contables</CardTitle>
              <CardDescription className="dark:text-gray-400">
                Solo se cambian las que todavía tienen el código anterior. Las editadas a mano se informan y no se tocan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabla
                vacio="No hay reglas por reasignar."
                columnas={['Regla', 'Origen', 'Lado', 'Actual', 'Propuesto', 'Estado']}
                filas={vista.reglas.map((fila) => [
                  fila.nombre || `${fila.source_type} ${fila.event_type}`,
                  fila.source_type,
                  fila.lado,
                  fila.actual,
                  fila.propuesto || '—',
                  fila.editada ? 'Editada, no se cambia' : 'Se actualiza',
                ])}
              />
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="py-4 space-y-4">
              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                Confirmo el traslado. Se puede revertir con el contra-asiento de la corrida.
              </label>
              <Button onClick={() => { void aplicar(); }} disabled={!confirmado || cargando} className="bg-purple-600 hover:bg-purple-700">
                Aplicar actualización
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {resultado && (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">
              {resultado.ya_aplicado ? 'Ya estaba aplicado' : 'Traslado registrado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>Corrida {resultado.corrida_id}</p>
            {asiento != null && (
              <Link className="text-blue-600 dark:text-blue-400 underline" href={`/app/finanzas/contabilidad/asientos/${asiento}`}>
                Ver asiento de traslado #{asiento}
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tabla({ columnas, filas, vacio }: { columnas: string[]; filas: string[][]; vacio: string }) {
  if (filas.length === 0) return <p className="text-sm text-gray-500">{vacio}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b dark:border-gray-700 text-gray-600 dark:text-gray-400">
            {columnas.map((columna) => (
              <th key={columna} className="text-left py-2 px-3 font-medium">{columna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, indice) => (
            <tr key={indice} className="border-b dark:border-gray-700/50">
              {fila.map((celda, i) => (
                <td key={i} className="py-2 px-3 text-gray-900 dark:text-white">{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
