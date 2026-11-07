'use client';

/**
 * Pestaña «Extracto» del detalle de conciliación (Figma `2329:129657`), con el
 * kit. La lógica y los servicios no cambian: importar CSV/Excel
 * (`matrizDesdeArchivo` → `parsearMatrizExtracto` → `importarExtracto`),
 * emparejar una línea con un movimiento del libro del mismo valor
 * (`emparejarLinea`) y crear el movimiento desde la línea por categoría
 * (`crearMovimientoDesdeLinea`: GMF, comisión o intereses).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Plus, Upload } from 'lucide-react';
import { DataTable, StatusBadge, Tarjeta, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { ConciliacionService, LineaExtractoGuardada } from './ConciliacionService';
import { BankTransaction } from '../bancos/BancosService';
import {
  CategoriaExtracto,
  LineaExtracto,
  matrizDesdeArchivo,
  parsearMatrizExtracto,
} from '@/lib/finanzas/conciliacion/extracto';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';

const CATEGORIAS: readonly CategoriaExtracto[] = ['gmf', 'comision', 'interes'];

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
  const t = useTranslations('finanzasTesoreriaR3.conciliacion.extracto');
  const { formatPlain } = useFormatDate();
  const [lineas, setLineas] = useState<LineaExtractoGuardada[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [vista, setVista] = useState<LineaExtracto[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [empareje, setEmpareje] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const data = await ConciliacionService.obtenerLineasExtracto(reconciliationId);
    setLineas(data);
  }, [reconciliationId]);

  const recargar = useCallback(() => {
    setEstado('cargando');
    cargar()
      .then(() => setEstado('listo'))
      .catch(() => {
        setEstado('error');
        toast.error(t('errorLeer'));
      });
  }, [cargar, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const elegirArchivo = async (file: File | null) => {
    setArchivo(file);
    setVista([]);
    if (!file) return;
    try {
      const matriz = await matrizDesdeArchivo(file);
      const parseadas = parsearMatrizExtracto(matriz);
      if (parseadas.length === 0) {
        toast.error(t('sinLineas'));
        return;
      }
      setVista(parseadas);
    } catch {
      toast.error(t('ilegible'));
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
      toast.success(t('cargado', { emparejadas: resultado.emparejadas, lineas: resultado.lineas }));
      setVista([]);
      setArchivo(null);
      await cargar();
      await onCambio();
    } catch {
      toast.error(t('errorImportar'));
    } finally {
      setOcupado(false);
    }
  };

  const emparejar = async (lineaId: string) => {
    const tx = Number(empareje[lineaId]);
    if (!tx) {
      toast.error(t('eligeMovimiento'));
      return;
    }
    try {
      setOcupado(true);
      await ConciliacionService.emparejarLinea(lineaId, tx);
      toast.success(t('emparejadaOk'));
      await cargar();
      await onCambio();
    } catch (error) {
      const texto = error instanceof Error ? error.message : '';
      toast.error(texto.includes('valor_distinto') ? t('valorDistinto') : t('errorEmparejar'));
    } finally {
      setOcupado(false);
    }
  };

  const crear = async (lineaId: string, categoria: CategoriaExtracto) => {
    try {
      setOcupado(true);
      await ConciliacionService.crearMovimientoDesdeLinea(lineaId, categoria);
      toast.success(t('creadoOk'));
      await cargar();
      await onCambio();
    } catch (error) {
      const texto = error instanceof Error ? error.message : '';
      toast.error(texto.includes('periodo_cerrado') ? t('periodoCerrado') : t('errorCrear'));
    } finally {
      setOcupado(false);
    }
  };

  // Candidatos del libro: los pendientes del mismo valor (la regla de siempre).
  const candidatosDe = useMemo(
    () => (linea: LineaExtractoGuardada) => pendientes.filter((tx) => Math.abs(tx.amount - Number(linea.valor)) < 0.005),
    [pendientes],
  );
  const nombreTx = (tx: BankTransaction) => tx.description || tx.reference || `#${tx.id}`;
  const categoriaDe = (linea: LineaExtractoGuardada) => (linea.categoria ?? 'comision') as CategoriaExtracto;
  const pendiente = (linea: LineaExtractoGuardada) => linea.estado === 'pendiente' && !cerrada;

  const columnas: ColumnaTabla<LineaExtractoGuardada>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (l) => <span className="whitespace-nowrap text-fg-secondary">{formatPlain(l.fecha)}</span>, ancho: 110 },
    {
      id: 'descripcion',
      encabezado: t('columnas.descripcion'),
      celda: (l) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{l.descripcion || t('sinDescripcion')}</p>
          {l.referencia && <p className="truncate text-xs text-fg-secondary">{l.referencia}</p>}
        </div>
      ),
    },
    {
      id: 'valor',
      encabezado: t('columnas.valor'),
      variante: 'importe',
      celda: (l) => <span className={Number(l.valor) >= 0 ? 'text-success-text' : 'text-danger-text'}>{formatear(Number(l.valor))}</span>,
    },
    {
      id: 'libro',
      encabezado: t('columnas.libro'),
      ocultarDebajo: 'md',
      celda: (l) => {
        if (l.estado === 'emparejada') {
          const tx = pendientes.find((x) => x.id === l.bank_transaction_id);
          return <StatusBadge estado="matched" etiqueta={tx ? nombreTx(tx) : l.bank_transaction_id ? `#${l.bank_transaction_id}` : t('emparejada')} tono="exito" />;
        }
        if (l.estado === 'creada') return <StatusBadge estado="creada" etiqueta={t('creada')} tono="informacion" />;
        const candidatos = candidatosDe(l);
        if (!pendiente(l) || candidatos.length === 0) return <span className="text-fg-tertiary">{t('sinMovimiento')}</span>;
        return (
          <SelectNativo
            aria-label={t('elegirMovimiento')}
            valor={empareje[l.id] ?? ''}
            onCambiar={(v) => setEmpareje((prev) => ({ ...prev, [l.id]: v }))}
            vacio={t('elegirMovimiento')}
            opciones={candidatos.map((tx) => ({ valor: String(tx.id), etiqueta: nombreTx(tx) }))}
          />
        );
      },
    },
    {
      id: 'accion',
      encabezado: t('columnas.accion'),
      celda: (l) => {
        if (l.estado === 'emparejada') return <span className="text-fg-secondary">{t('emparejada')}</span>;
        if (l.estado === 'creada') return <span className="text-fg-secondary">{t('creada')}</span>;
        if (!pendiente(l)) return <span className="text-fg-tertiary">—</span>;
        if (empareje[l.id]) {
          return (
            <button type="button" disabled={ocupado} onClick={() => void emparejar(l.id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-brand' })}>
              {t('emparejar')}
            </button>
          );
        }
        const categoria = categoriaDe(l);
        return (
          <button type="button" disabled={ocupado} onClick={() => void crear(l.id, categoria)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-brand' })}>
            {t(`crear.${categoria}`)}
          </button>
        );
      },
    },
  ];

  // Las otras categorías siguen a mano en el «⋯» de la fila (antes eran tres botones).
  const acciones = (l: LineaExtractoGuardada): AccionFila[] =>
    pendiente(l)
      ? CATEGORIAS.filter((c) => c !== categoriaDe(l)).map((c) => ({
          id: c,
          etiqueta: t(`crear.${c}`),
          icono: Plus,
          onSelect: () => void crear(l.id, c),
          deshabilitada: ocupado,
        }))
      : [];

  return (
    <div className="space-y-4">
      {!cerrada && (
        <Tarjeta titulo={t('importar.titulo')} descripcion={t('importar.descripcion')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-fg hover:bg-subtle">
              <Upload className="h-4 w-4 text-fg-secondary" aria-hidden />
              <span className="truncate">{archivo ? t('importar.leido', { nombre: archivo.name, lineas: vista.length }) : t('importar.elegir')}</span>
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  void elegirArchivo(e.target.files?.[0] ?? null);
                }}
              />
            </label>
            <button type="button" onClick={() => void importar()} disabled={ocupado || vista.length === 0} className={clasesBoton({ variante: 'primario' })}>
              <Upload className="h-4 w-4" aria-hidden />
              {vista.length > 0 ? t('importar.cargarN', { n: vista.length }) : t('importar.cargar')}
            </button>
          </div>
        </Tarjeta>
      )}

      <p className="text-sm text-fg-secondary">{t('ayuda')}</p>

      <DataTable<LineaExtractoGuardada>
        etiqueta={t('titulo', { n: lineas.length })}
        columnas={columnas}
        filas={lineas}
        obtenerId={(l) => l.id}
        estado={estado}
        onReintentar={recargar}
        acciones={acciones}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), compacto: true }}
        tarjetaMovil={(l) => (
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{l.descripcion || t('sinDescripcion')}</p>
                <p className="text-xs text-fg-secondary">
                  {formatPlain(l.fecha)}
                  {l.referencia ? ` · ${l.referencia}` : ''}
                </p>
              </div>
              <span className={Number(l.valor) >= 0 ? 'font-semibold tabular-nums text-success-text' : 'font-semibold tabular-nums text-danger-text'}>
                {formatear(Number(l.valor))}
              </span>
            </div>
            {pendiente(l) && (
              <div className="flex flex-wrap gap-2">
                {candidatosDe(l).length > 0 && (
                  <SelectNativo
                    aria-label={t('elegirMovimiento')}
                    valor={empareje[l.id] ?? ''}
                    onCambiar={(v) => setEmpareje((prev) => ({ ...prev, [l.id]: v }))}
                    vacio={t('elegirMovimiento')}
                    opciones={candidatosDe(l).map((tx) => ({ valor: String(tx.id), etiqueta: nombreTx(tx) }))}
                  />
                )}
                {empareje[l.id] ? (
                  <button type="button" disabled={ocupado} onClick={() => void emparejar(l.id)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                    {t('emparejar')}
                  </button>
                ) : (
                  CATEGORIAS.map((c) => (
                    <button key={c} type="button" disabled={ocupado} onClick={() => void crear(l.id, c)} className={clasesBoton({ variante: c === categoriaDe(l) ? 'secundario' : 'fantasma', tamano: 'sm' })}>
                      {t(`crear.${c}`)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
