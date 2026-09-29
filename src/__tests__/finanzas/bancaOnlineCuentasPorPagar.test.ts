// ============================================================================
// Exportación a banca online de cuentas por pagar (F-69)
// ============================================================================
// Dos defectos distintos, el segundo mucho peor que el primero:
//
//   1. `exportarParaBancaOnline` insertaba en `public.bank_files`, una tabla que
//      NUNCA existió. El insert reventaba, el método lanzaba, y el modal lo
//      llamaba ANTES de generar el blob: la exportación no descargaba nada.
//
//   2. `conciliarPagos` era un `setTimeout` + `console.log` que resolvía, y la
//      interfaz remataba con «Conciliación completada — Se conciliaron N pagos
//      correctamente». No se escribía NADA: ni un `payment`, ni un movimiento
//      de cartera. Se le decía al usuario que había conciliado pagos que
//      seguían abiertos.
//
// Este archivo impide que vuelva cualquiera de los dos. El bloque final es el
// que importa a largo plazo: prohíbe que exista un conciliador simulado.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORG = 120;
const USUARIO = '00000000-0000-0000-0000-000000000001';

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async (): Promise<string> => 'America/Bogota',
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ORG,
  getCurrentBranchId: () => null,
  getCurrentUserId: async () => USUARIO,
}));

import { DobleSupabase } from '../timezone/dobleSupabase';

let doble = new DobleSupabase();

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
  createSupabaseClient: () => doble,
}));

import { CuentasPorPagarService } from '@/components/finanzas/cuentas-por-pagar/CuentasPorPagarService';
import {
  FORMATOS_BANCO,
  buscarFormato,
  generarContenidoArchivo,
} from '@/components/finanzas/cuentas-por-pagar/formatosBanca';

const RAIZ = join(__dirname, '..', '..', '..');
const leer = (ruta: string): string => readFileSync(join(RAIZ, ruta), 'utf8');

const MODAL = 'src/components/finanzas/cuentas-por-pagar/ExportarBancaModal.tsx';
const SERVICIO = 'src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts';
const MIGRACION =
  'supabase/migrations/20260924170000_bank_files_rastro_de_exportacion_a_banca.sql';

/** Guion con una cuenta por pagar y un insert de `bank_files` que sale bien. */
function guionFeliz(): DobleSupabase {
  return new DobleSupabase({
    accounts_payable: [{ data: [{ id: 'cta-1', balance: 100 }, { id: 'cta-2', balance: 50 }], error: null }],
    bank_files: [{ data: { id: 'archivo-1', organization_id: ORG }, error: null }],
  });
}

/** Guion en el que la tabla de auditoria rechaza la escritura. */
function guionAuditoriaRota(): DobleSupabase {
  return new DobleSupabase({
    accounts_payable: [{ data: [{ id: 'cta-1', balance: 100 }], error: null }],
    bank_files: [
      {
        data: null,
        error: { code: '42P01', message: 'relation "public.bank_files" does not exist' },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. El rastro: qué se escribe en `bank_files`
// ---------------------------------------------------------------------------

describe('exportarParaBancaOnline deja rastro del lote', () => {
  it('escribe las columnas que la tabla declara, con la organización de la sesión', async () => {
    doble = guionFeliz();

    const resultado = await CuentasPorPagarService.exportarParaBancaOnline(['cta-1', 'cta-2']);

    expect(resultado.registrado).toBe(true);
    expect(resultado.error).toBeNull();

    const payload = doble.ultimaEscritura('bank_files')?.payload as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload.organization_id).toBe(ORG);
    expect(payload.created_by).toBe(USUARIO);
    expect(payload.records_count).toBe(2);
    expect(payload.processed_count).toBe(0);
    expect(payload.status).toBe('pending');
    expect(typeof payload.upload_date).toBe('string');
    // La organización NO viaja en el cuerpo de una petición: sale de la sesión.
    expect(doble.filtro('accounts_payable', 'eq', 'organization_id')).toBe(ORG);
  });

  it('el tipo y la extensión son los del archivo que se descargó de verdad', async () => {
    doble = guionFeliz();

    await CuentasPorPagarService.exportarParaBancaOnline(['cta-1'], {
      extension: '.txt',
      tipo: 'txt',
    });

    const payload = doble.ultimaEscritura('bank_files')?.payload as Record<string, unknown>;
    expect(payload.file_type).toBe('txt');
    expect(payload.file_name).toMatch(/^pagos_\d{4}-\d{2}-\d{2}\.txt$/);
  });

  it('sin formato explícito cae en csv, no en un tipo que el CHECK rechace', async () => {
    doble = guionFeliz();

    await CuentasPorPagarService.exportarParaBancaOnline(['cta-1']);

    const payload = doble.ultimaEscritura('bank_files')?.payload as Record<string, unknown>;
    expect(payload.file_type).toBe('csv');
    expect(['csv', 'excel', 'txt', 'xml']).toContain(payload.file_type);
  });
});

// ---------------------------------------------------------------------------
// 2. La auditoría no puede quitarle el archivo a nadie
// ---------------------------------------------------------------------------

describe('un fallo de auditoría no bloquea la descarga, pero tampoco se calla', () => {
  it('no lanza: devuelve registrado=false con el motivo', async () => {
    doble = guionAuditoriaRota();

    // Antes esto lanzaba, y el modal lo llamaba ANTES de generar el blob: el
    // usuario se quedaba sin archivo y solo veía «Error al exportar».
    const resultado = await CuentasPorPagarService.exportarParaBancaOnline(['cta-1']);

    expect(resultado.registrado).toBe(false);
    expect(resultado.archivo).toBeNull();
    expect(resultado.error).toContain('bank_files');
  });

  it('el modal descarga PRIMERO y registra DESPUÉS', () => {
    const texto = leer(MODAL);
    const posicionDescarga = texto.indexOf('a.click()');
    const posicionRegistro = texto.indexOf('CuentasPorPagarService.exportarParaBancaOnline');
    expect(posicionDescarga).toBeGreaterThan(-1);
    expect(posicionRegistro).toBeGreaterThan(-1);
    expect(posicionDescarga).toBeLessThan(posicionRegistro);
  });

  it('el modal avisa por pantalla cuando el rastro no se pudo guardar', () => {
    const texto = leer(MODAL);
    expect(texto).toContain('!registro.registrado');
    expect(texto).toContain('no quedó registrado');
  });
});

// ---------------------------------------------------------------------------
// 3. Las plantillas de banco: el `switch` no casaba con ningún valor
// ---------------------------------------------------------------------------

describe('cada formato del desplegable produce su propia plantilla', () => {
  const cuentas = [
    {
      balance: 1500,
      due_date: '2026-09-30T05:00:00.000Z',
      supplier: { name: 'Proveedor Uno', nit: '900123456' },
      invoice_purchase: { number_ext: 'FC-77' },
    },
  ];
  const fecha = () => '30/09/2026';

  it('todo valor del desplegable existe como plantilla y trae extensión y tipo', () => {
    for (const formato of FORMATOS_BANCO) {
      expect(buscarFormato(formato.value)).toBe(formato);
      expect(formato.extension).toMatch(/^\.[a-z]+$/);
      expect(['csv', 'excel', 'txt', 'xml']).toContain(formato.tipo);
    }
  });

  it('Bancolombia produce ancho fijo, no el CSV genérico', () => {
    const contenido = generarContenidoArchivo(cuentas, 'bancolombia_txt', fecha);
    expect(contenido).not.toContain('NIT,Nombre,Monto');
    expect(contenido).toContain('000001500.00');
  });

  it('Davivienda produce tres campos separados por punto y coma', () => {
    const contenido = generarContenidoArchivo(cuentas, 'davivienda_csv', fecha);
    expect(contenido).toBe('900123456;Proveedor Uno;1500');
  });

  it('BBVA produce su encabezado con referencia', () => {
    const contenido = generarContenidoArchivo(cuentas, 'bbva_csv', fecha);
    expect(contenido.split('\n')[0]).toBe('NIT;NOMBRE;MONTO;REFERENCIA');
    expect(contenido).toContain('FC-77');
  });

  it('el genérico imprime la fecha con el formateador que se le pasa', () => {
    const contenido = generarContenidoArchivo(cuentas, 'generic_csv', fecha);
    expect(contenido).toContain('"30/09/2026"');
  });

  it('ninguna plantilla anuncia .xlsx sin escribir un libro de Excel', () => {
    // Un `.xlsx` que por dentro es texto separado por `;` es un archivo que
    // Excel abre con una advertencia de formato corrupto.
    expect(FORMATOS_BANCO.some((f) => f.extension === '.xlsx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. LA PANTALLA NO PUEDE AFIRMAR UN ÉXITO QUE NO OCURRIÓ
// ---------------------------------------------------------------------------

/**
 * Quita comentarios de bloque y de línea.
 *
 * Hace falta porque el propio arreglo DOCUMENTA en un comentario lo que había
 * («Conciliación completada», «Conciliar Pagos») para que nadie lo reintroduzca
 * por descuido. Sin esto, el guardarraíl se dispararía contra su propia
 * explicación. Lo que se afirma aquí es sobre el CÓDIGO, no sobre la prosa.
 */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('la conciliación no finge', () => {
  it('no queda el toast de éxito de conciliación', () => {
    const codigo = sinComentarios(leer(MODAL));
    expect(codigo).not.toMatch(/Conciliaci[óo]n completada/);
    expect(codigo).not.toMatch(/Se conciliaron/);
    expect(codigo).not.toMatch(/conciliaron .* correctamente/);
  });

  it('no queda un botón muerto de conciliar ni su manejador', () => {
    const codigo = sinComentarios(leer(MODAL));
    expect(codigo).not.toContain('handleConciliar');
    expect(codigo).not.toContain('conciliarPagos');
    expect(codigo).not.toContain('Conciliar Pagos');
    expect(codigo).not.toContain('Conciliando...');
  });

  it('la vista previa se declara como tal, en la propia pantalla', () => {
    const texto = leer(MODAL);
    expect(texto).toContain('AVISO_SIN_CONCILIAR');
    expect(texto).toContain('Vista previa');
    expect(texto).toContain('La conciliación automática todavía no existe');
  });
});

/**
 * Cuerpo de la función que empieza en `desde`, por conteo de llaves.
 *
 * Aproximación deliberada: no analiza el AST, así que una llave dentro de una
 * cadena o de un comentario puede desplazar el final. Para lo que se usa
 * —decidir si una función toca la base de datos o solo simula— sobra.
 */
function cuerpoDeFuncion(texto: string, desde: number): string {
  const abre = texto.indexOf('{', desde);
  if (abre === -1) return '';
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === '{') nivel += 1;
    else if (texto[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return texto.slice(abre, i + 1);
    }
  }
  return texto.slice(abre);
}

describe('guardarraíl: ningún conciliador puede resolver sin escribir', () => {
  // Módulos donde tendría sentido escribir un conciliador de cuentas por pagar.
  const ARCHIVOS = [
    MODAL,
    SERVICIO,
    'src/components/finanzas/cuentas-por-pagar/formatosBanca.ts',
    'src/components/finanzas/cuentas-por-pagar/CuentasPorPagarPage.tsx',
    'src/components/finanzas/cuentas-por-pagar/CuentasPorPagarTable.tsx',
  ];

  const DECLARACION = /(?:const|function|static\s+async|async)\s+(\w*[cC]onciliar\w*)\s*[=(:]/g;
  // Señales de que la función solo finge trabajo.
  const SIMULA = /setTimeout\s*\(|new Promise\s*\(\s*\(?\s*resolve|Promise\.resolve\s*\(\s*\)/;
  // Señales de que la función escribe de verdad.
  const ESCRIBE = /supabase\s*\.|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|await\s+\w+Service\./;

  it.each(ARCHIVOS)('%s', (ruta) => {
    // Sobre el código, no sobre los comentarios que explican el hallazgo.
    const texto = sinComentarios(leer(ruta));
    DECLARACION.lastIndex = 0;
    let encontrada: RegExpExecArray | null;

    while ((encontrada = DECLARACION.exec(texto)) !== null) {
      const nombre = encontrada[1];
      const cuerpo = cuerpoDeFuncion(texto, encontrada.index);

      if (!SIMULA.test(cuerpo)) continue;

      // Si simula, más le vale escribir en la base. Si no, es el bug de 2026:
      // una promesa que se resuelve sola y una interfaz que canta victoria.
      expect(
        ESCRIBE.test(cuerpo)
          ? 'escribe'
          : `${ruta}: «${nombre}» resuelve sin tocar la base de datos. Un conciliador que no escribe nada no puede anunciar que concilió. Ver docs/hallazgos/F-69.md.`,
      ).toBe('escribe');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. La migración: lo que la tabla promete
// ---------------------------------------------------------------------------

describe('la migración de bank_files cumple el contrato multi-inquilino', () => {
  const sql = () => leer(MIGRACION);

  it('tiene organization_id con FK y RLS activada', () => {
    const texto = sql();
    expect(texto).toMatch(/organization_id integer not null references public\.organizations\(id\)/);
    expect(texto).toContain('alter table public.bank_files enable row level security;');
  });

  it('revoca anon y no deja el ALL por defecto a authenticated', () => {
    const texto = sql();
    expect(texto).toContain('revoke all on public.bank_files from anon;');
    expect(texto).toContain('revoke all on public.bank_files from authenticated;');
    expect(texto).toContain('grant select, insert, update on public.bank_files to authenticated;');
  });

  it('no concede DELETE a authenticated ni define política de borrado', () => {
    const texto = sql();
    expect(texto).not.toMatch(/grant[^;]*delete[^;]*to authenticated/i);
    expect(texto).not.toMatch(/for delete/i);
  });

  it('los CHECK reproducen las uniones de TypeScript', () => {
    const texto = sql();
    expect(texto).toContain("check (file_type in ('csv', 'excel', 'txt', 'xml'))");
    expect(texto).toContain("check (status in ('pending', 'processing', 'completed', 'failed'))");
  });

  it('no lleva branch_id: el lote mezcla cuentas de cualquier sucursal', () => {
    expect(sql()).not.toMatch(/^\s*branch_id\b/m);
  });

  it('existe su reversión', () => {
    const rollback = leer(
      'supabase/rollbacks/20260924170000_bank_files_rastro_de_exportacion_a_banca_rollback.sql',
    );
    expect(rollback).toContain('drop table if exists public.bank_files;');
  });

  it('no lleva credenciales: el repositorio es público', () => {
    const texto = sql();
    expect(texto).not.toMatch(/service_role_key|eyJ[A-Za-z0-9_-]{10,}|anon_key/i);
  });
});
