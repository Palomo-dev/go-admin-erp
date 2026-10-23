'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConciliacionService, LineaExtractoGuardada } from './ConciliacionService';
import { BankTransaction } from '../bancos/BancosService';
import {
  CategoriaExtracto,
  ETIQUETA_CATEGORIA,
  LineaExtracto,
  matrizDesdeArchivo,
  parsearMatrizExtracto,
} from '@/lib/finanzas/conciliacion/extracto';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

export function ImportarExtracto({
  reconciliationId,
  bankAccountId,
  pendientes,
  cerrada,
  onCambio,
  formatear,
}: {
  reconciliationId: string;
  bankAccountId: number;
  pendientes: BankTransaction[];
  cerrada: boolean;
  onCambio: () => Promise<void>;
  formatear: (valor: number) => string;
}) {
  const { formatPlain } = useFormatDate();
  const [lineas, setLineas] = useState<LineaExtractoGuardada[]>([]);
  const [vista, setVista] = useState<LineaExtracto[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [empareje, setEmpareje] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const data = await ConciliacionService.obtenerLineasExtracto(reconciliationId);
    setLineas(data);
  }, [reconciliationId]);

  useEffect(() => {
    void cargar().catch(() => toast.error('No se pudo leer el extracto'));
  }, [cargar]);

  const elegirArchivo = async (file: File | null) => {
    setArchivo(file);
    setVista([]);
    if (!file) return;
    try {
      const matriz = await matrizDesdeArchivo(file);
      const parseadas = parsearMatrizExtracto(matriz);
      if (parseadas.length === 0) {
        toast.error('El archivo no tiene líneas con fecha y valor');
        return;
      }
      setVista(parseadas);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo leer el archivo');
    }
  };

  const importar = async () => {
    if (!archivo || vista.length === 0) return;
    try {
      setOcupado(true);
      const formato = archivo.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel';
      const resultado = await ConciliacionService.importarExtracto({
        bankAccountId,
        reconciliationId,
        nombre: archivo.name,
        formato,
        lineas: vista,
      });
      toast.success(`Extracto cargado: ${resultado.emparejadas} de ${resultado.lineas} emparejadas`);
      setVista([]);
      setArchivo(null);
      await cargar();
      await onCambio();
    } catch (error) {
      console.error(error);
      toast.error('No se pudo importar el extracto');
    } finally {
      setOcupado(false);
    }
  };

  const emparejar = async (lineaId: string) => {
    const tx = Number(empareje[lineaId]);
    if (!tx) {
      toast.error('Elige el movimiento del libro');
      return;
    }
    try {
      setOcupado(true);
      await ConciliacionService.emparejarLinea(lineaId, tx);
      toast.success('Línea emparejada');
      await cargar();
      await onCambio();
    } catch (error) {
      console.error(error);
      const texto = error instanceof Error ? error.message : '';
      toast.error(texto.includes('valor_distinto') ? 'El valor no coincide' : 'No se pudo emparejar');
    } finally {
      setOcupado(false);
    }
  };

  const crear = async (lineaId: string, categoria: CategoriaExtracto) => {
    try {
      setOcupado(true);
      await ConciliacionService.crearMovimientoDesdeLinea(lineaId, categoria);
      toast.success('Movimiento creado desde el extracto');
      await cargar();
      await onCambio();
    } catch (error) {
      console.error(error);
      const texto = error instanceof Error ? error.message : '';
      toast.error(texto.includes('periodo_cerrado') ? 'El periodo de esa fecha está cerrado' : 'No se pudo crear el movimiento');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4">
      {!cerrada && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Importar extracto</CardTitle>
            <CardDescription className="dark:text-gray-400">
              CSV o Excel. Se empareja por valor, fecha (hasta 3 días) y referencia.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="text-sm text-gray-700 dark:text-gray-300"
              onChange={(e) => { void elegirArchivo(e.target.files?.[0] ?? null); }}
            />
            <Button onClick={() => { void importar(); }} disabled={ocupado || vista.length === 0}>
              <Upload className="h-4 w-4 mr-2" />
              Cargar {vista.length > 0 ? `(${vista.length})` : ''}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Líneas del extracto ({lineas.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineas.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay un extracto en esta conciliación.</p>
          ) : lineas.map((linea) => {
            const valor = Number(linea.valor);
            const candidatos = pendientes.filter((tx) => Math.abs(tx.amount - valor) < 0.005);
            const categoria = (linea.categoria ?? 'comision') as CategoriaExtracto;
            return (
              <div key={linea.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {linea.descripcion || 'Sin descripción'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatPlain(linea.fecha)}
                      {linea.referencia ? ` · ${linea.referencia}` : ''}
                      {linea.estado !== 'pendiente' ? ` · ${linea.estado}` : ''}
                    </p>
                  </div>
                  <span className={valor >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {formatear(valor)}
                  </span>
                </div>
                {linea.estado === 'pendiente' && !cerrada && (
                  <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
                    <select
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:bg-gray-900 dark:border-gray-600"
                      value={empareje[linea.id] ?? ''}
                      onChange={(e) => setEmpareje((prev) => ({ ...prev, [linea.id]: e.target.value }))}
                    >
                      <option value="">Movimiento del libro</option>
                      {candidatos.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {tx.description || tx.reference || `#${tx.id}`}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => { void emparejar(linea.id); }}>
                      Emparejar
                    </Button>
                    {(['gmf', 'comision', 'interes'] as CategoriaExtracto[]).map((opcion) => (
                      <Button
                        key={opcion}
                        size="sm"
                        variant={opcion === categoria ? 'default' : 'outline'}
                        disabled={ocupado}
                        onClick={() => { void crear(linea.id, opcion); }}
                      >
                        Crear {ETIQUETA_CATEGORIA[opcion]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
