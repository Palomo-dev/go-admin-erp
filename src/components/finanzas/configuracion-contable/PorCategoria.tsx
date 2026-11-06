'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { CampoCuentaAutomatica } from '@/components/kit/CampoCuentaAutomatica';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { Dialogo } from '@/components/kit/Dialogo';
import { Pagination } from '@/components/kit/Pagination';
import { SearchInput } from '@/components/kit/SearchInput';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { ROLES_CUENTA, type ConsultaCuenta, type RolCuenta } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { ContabilidadService } from '@/components/finanzas/contabilidad/ContabilidadService';
import { buscarCuentas, CuentasAutomaticasService, type CategoriaContable } from '@/components/finanzas/contabilidad/cuentas/CuentasAutomaticasService';
import { useCuentasEfectivas } from '@/components/finanzas/contabilidad/cuentas/useCuentasEfectivas';

const TAMANO = 10;

type Cuentas = Record<RolCuenta, string | null>;

function cuentasDe(c: CategoriaContable): Cuentas {
  return { ingreso: c.cuenta_ingreso, costo: c.cuenta_costo, inventario: c.cuenta_inventario, devolucion: c.cuenta_devolucion };
}

function normalizar(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Figma 2326:125540: se asigna una vez por categoría y sus productos heredan. */
export function PorCategoria() {
  const t = useTranslations('cuentasAutomaticas');
  const sede = useBranchOpcional();
  const branchId = sede?.selectedBranchId ?? null;
  const [categorias, setCategorias] = useState<CategoriaContable[]>([]);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [texto, setTexto] = useState('');
  const [soloPropias, setSoloPropias] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<CategoriaContable | null>(null);

  const cargar = useCallback(() => {
    setEstado('cargando');
    CuentasAutomaticasService.categorias()
      .then((filas) => {
        setCategorias(filas);
        setEstado('listo');
      })
      .catch((error) => {
        console.error(error);
        setEstado('error');
      });
  }, []);

  useEffect(cargar, [cargar]);

  const filtradas = useMemo(() => {
    const q = normalizar(texto.trim());
    return categorias.filter((c) => {
      if (q && !normalizar(c.name).includes(q)) return false;
      return !soloPropias || ROLES_CUENTA.some((rol) => cuentasDe(c)[rol]);
    });
  }, [categorias, texto, soloPropias]);

  const visibles = useMemo(() => filtradas.slice((pagina - 1) * TAMANO, pagina * TAMANO), [filtradas, pagina]);

  // La herencia la resuelve la base: una subcategoría sin cuenta puede traerla de su padre.
  const consultas = useMemo<ConsultaCuenta[]>(
    () => visibles.flatMap((c) => ROLES_CUENTA.map((rol) => ({ clave: `${c.id}:${rol}`, rol, category_id: c.id }))),
    [visibles],
  );
  const { porClave } = useCuentasEfectivas(branchId, 'catalogo', consultas);

  const celda = (c: CategoriaContable, rol: RolCuenta) => {
    const efectiva = porClave.get(`${c.id}:${rol}`);
    if (efectiva?.estado === 'categoria' || efectiva?.estado === 'titulo') {
      const heredada = efectiva.categoriaOrigen && efectiva.categoriaOrigen !== c.name;
      return (
        <span className={heredada ? 'text-fg-secondary' : 'text-fg'}>
          <span className="tabular-nums">{efectiva.cuenta}</span>
          {efectiva.nombre ? ` ${efectiva.nombre}` : ''}
          {heredada ? ` · ${t('config.deCategoria', { nombre: efectiva.categoriaOrigen ?? '' })}` : ''}
        </span>
      );
    }
    return <span className="text-fg-muted">{t('estado.automatica')}</span>;
  };

  const columnas: ColumnaTabla<CategoriaContable>[] = [
    { id: 'nombre', encabezado: t('config.categoria'), celda: (c) => <span className="font-medium text-fg">{c.name}</span> },
    { id: 'productos', encabezado: t('config.productos'), alinear: 'derecha', variante: 'importe', celda: (c) => c.productos, ancho: 96 },
    ...ROLES_CUENTA.map((rol) => ({
      id: rol,
      encabezado: t(`rol.${rol}`),
      celda: (c: CategoriaContable) => celda(c, rol),
      ocultarDebajo: rol === 'ingreso' ? undefined : ('lg' as const),
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={texto}
          onChange={(v) => {
            setTexto(v);
            setPagina(1);
          }}
          placeholder={t('config.buscarCategoria')}
          etiqueta={t('config.buscarCategoria')}
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="solo-cuenta-propia"
            checked={soloPropias}
            onCheckedChange={(v) => {
              setSoloPropias(v);
              setPagina(1);
            }}
          />
          <Label htmlFor="solo-cuenta-propia" className="font-normal">{t('config.soloPropias')}</Label>
        </div>
      </div>
      <DataTable
        columnas={columnas}
        filas={visibles}
        obtenerId={(c) => String(c.id)}
        etiqueta={t('config.pestanaCategoria')}
        estado={estado === 'listo' && filtradas.length === 0 ? (categorias.length === 0 ? 'vacio' : 'sinResultados') : estado}
        onFilaClick={setEditando}
        etiquetaFila={(c) => c.name}
        acciones={(c) => [{ id: 'editar', etiqueta: t('config.editarCuentas'), icono: Pencil, onSelect: () => setEditando(c) }]}
        onReintentar={cargar}
        termino={texto}
        vacio={{ titulo: t('config.sinCategorias') }}
        pie={<Pagination pagina={pagina} tamano={TAMANO} total={filtradas.length} onPaginaChange={setPagina} />}
      />
      {editando && (
        <DialogoCuentasCategoria
          key={editando.id}
          categoria={editando}
          branchId={branchId}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function DialogoCuentasCategoria({
  categoria,
  branchId,
  onCerrar,
  onGuardado,
}: {
  categoria: CategoriaContable;
  branchId: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('cuentasAutomaticas');
  const [cuentas, setCuentas] = useState<Cuentas>(() => cuentasDe(categoria));
  const [guardando, setGuardando] = useState(false);
  const consultas = useMemo<ConsultaCuenta[]>(
    () => ROLES_CUENTA.map((rol) => ({ clave: rol, rol, category_id: categoria.parent_id, cuenta_contable: cuentas[rol] })),
    [categoria.parent_id, cuentas],
  );
  const { porClave, cargando } = useCuentasEfectivas(branchId, 'catalogo', consultas);

  const guardar = async () => {
    setGuardando(true);
    try {
      await ContabilidadService.guardarCuentasCatalogo('categoria', categoria.id, cuentas);
      toast.success(t('config.guardadaCategoria', { nombre: categoria.name }));
      onGuardado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errorGuardar'));
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('config.cuentasDe', { nombre: categoria.name })}
      descripcion={t('config.heredan', { n: categoria.productos })}
      ancho={672}
      primario={{ etiqueta: t('config.guardar'), cargando: guardando, onClick: () => void guardar() }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {ROLES_CUENTA.map((rol) => (
          <CampoCuentaAutomatica
            key={rol}
            etiqueta={t(`rolCuenta.${rol}`)}
            efectiva={porClave.get(rol) ?? null}
            cargando={cargando}
            propia={!!cuentas[rol]}
            onCambiar={(cuenta) => setCuentas((prev) => ({ ...prev, [rol]: cuenta }))}
            buscar={buscarCuentas}
          />
        ))}
      </div>
    </Dialogo>
  );
}
