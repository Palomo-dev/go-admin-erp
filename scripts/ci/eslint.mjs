// Audita todo src tanto en el commit comprobado como en su base real. La
// deuda global se conserva en JSON/logs; sólo el incremento de diagnósticos
// bloquea una contribución que no intenta cerrar todo el legado del ERP.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function indexar(reporte, raiz) {
  if (!Array.isArray(reporte)) throw new Error('El diagnóstico de ESLint no es un arreglo.');
  const indice = new Map();
  let errores = 0;
  let avisos = 0;
  for (const archivo of reporte) {
    if (!Array.isArray(archivo.messages) || typeof archivo.errorCount !== 'number' || typeof archivo.warningCount !== 'number') {
      throw new Error('El diagnóstico de ESLint está incompleto.');
    }
    const ruta = relative(raiz, archivo.filePath);
    if (ruta.startsWith('..') || isAbsolute(ruta)) throw new Error('El diagnóstico contiene un archivo fuera de su raíz.');
    const mensajes = archivo.messages.filter((mensaje) => mensaje.severity === 2);
    if (mensajes.length !== archivo.errorCount) throw new Error(`Conteo de errores incoherente en ${ruta}.`);
    errores += archivo.errorCount;
    avisos += archivo.warningCount;
    for (const mensaje of mensajes) {
      // El source del JSON pertenece exactamente a esa corrida. No se lee el
      // working tree, que podría haber cambiado después del diagnóstico.
      if (typeof archivo.source !== 'string' || !Number.isInteger(mensaje.line)) {
        throw new Error(`No se puede localizar el error de ${ruta}.`);
      }
      const fuente = archivo.source.split(/\r?\n/)[mensaje.line - 1]?.trim();
      if (fuente === undefined) throw new Error(`Línea de diagnóstico inexistente en ${ruta}.`);
      // Se cuenta cada aparición. Un error retirado en una declaración no
      // compensa otro nuevo en una declaración distinta del mismo archivo.
      // La posición absoluta se excluye para permitir mover código intacto.
      const clave = JSON.stringify([ruta, mensaje.ruleId, mensaje.message, fuente]);
      const entrada = indice.get(clave) || {
        archivo: ruta, regla: mensaje.ruleId, mensaje: mensaje.message,
        fuente, linea: mensaje.line, columna: mensaje.column, cantidad: 0,
      };
      entrada.cantidad++;
      indice.set(clave, entrada);
    }
  }
  return { indice, errores, avisos, archivosConDiagnostico: reporte.length };
}

export function compararDiagnosticos(actual, base, raizActual, raizBase) {
  const a = indexar(actual, raizActual);
  const b = indexar(base, raizBase);
  const regresiones = [];
  let resueltos = 0;
  for (const [clave, entrada] of a.indice) {
    const incremento = entrada.cantidad - (b.indice.get(clave)?.cantidad || 0);
    if (incremento > 0) regresiones.push({ ...entrada, cantidad: incremento });
  }
  for (const [clave, entrada] of b.indice) resueltos += Math.max(0, entrada.cantidad - (a.indice.get(clave)?.cantidad || 0));
  const contar = ({ errores, avisos, archivosConDiagnostico }) => ({ errores, avisos, archivosConDiagnostico });
  return {
    actual: contar(a), base: contar(b),
    erroresNuevos: regresiones.reduce((total, entrada) => total + entrada.cantidad, 0),
    erroresResueltos: resueltos, regresiones,
  };
}

function comprobar() {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const salida = resolve(process.env.CI_OUTPUT_DIR || join(raiz, 'evidencias/ci'));
  const raizBase = join(process.env.RUNNER_TEMP || tmpdir(), `erp-eslint-base-${process.pid}`);
  const git = (argumentos) => execFileSync('git', argumentos, { cwd: raiz, encoding: 'utf8' }).trim();
  // En una ejecución manual de una rama, comparar contra main; comparar
  // contra el propio HEAD convertiría cualquier regresión en un falso pase.
  const basePedida = process.env.CI_BASE_SHA || git(['rev-parse', 'refs/remotes/origin/main']);
  if (!basePedida || !/^[a-f0-9]{40}$/.test(basePedida)) throw new Error('CI_BASE_SHA debe identificar el commit completo de la base.');
  const baseSha = git(['rev-parse', '--verify', `${basePedida}^{commit}`]);
  const commitSha = git(['rev-parse', 'HEAD']);
  const arbolLimpio = git(['status', '--porcelain', '--untracked-files=normal']) === '';
  if (process.env.GITHUB_ACTIONS === 'true' && !arbolLimpio) {
    throw new Error('CI exige un checkout limpio para acreditar el commit comprobado.');
  }
  const config = join(raiz, '.eslintrc.json');
  const hash = (ruta) => createHash('sha256').update(readFileSync(ruta)).digest('hex');
  const huellaFuentes = () => {
    const archivos = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/**']).split('\n').filter(Boolean).sort();
    const huella = createHash('sha256');
    for (const archivo of archivos) {
      const ruta = join(raiz, archivo);
      huella.update(`${archivo}\0`);
      huella.update(existsSync(ruta) ? readFileSync(ruta) : '<eliminado>');
      huella.update('\0');
    }
    return huella.digest('hex');
  };
  mkdirSync(salida, { recursive: true });
  let preparado = false;
  try {
    git(['worktree', 'add', '--detach', raizBase, baseSha]);
    preparado = true;
    symlinkSync(join(raiz, 'node_modules'), join(raizBase, 'node_modules'), 'junction');
    const auditar = (directorio, nombre) => {
      const ruta = join(salida, `${nombre}.json`);
      const proceso = spawnSync(process.execPath, [
        join(raiz, 'node_modules/next/dist/bin/next'), 'lint',
        '--dir', 'src', '--no-cache', '--config', config,
        '--resolve-plugins-relative-to', raiz,
        '--format', 'json', '--output-file', ruta,
      ], { cwd: directorio, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
      writeFileSync(join(salida, `${nombre}.log`), `${proceso.stdout || ''}${proceso.stderr || ''}`);
      if (proceso.error || ![0, 1].includes(proceso.status) || !existsSync(ruta)) {
        throw new Error(`No se pudo completar ESLint (${nombre}); revisa su log.`);
      }
      const reporte = JSON.parse(readFileSync(ruta, 'utf8'));
      const diagnostico = indexar(reporte, directorio);
      if ((proceso.status === 0) !== (diagnostico.errores === 0)) throw new Error(`Exit code y diagnóstico incoherentes (${nombre}).`);
      return reporte;
    };
    // Mismas dependencias, configuración y comandos en ambas corridas.
    const base = auditar(raizBase, 'eslint-base');
    const huellaAntes = huellaFuentes();
    const configuracionAntes = hash(config);
    const actual = auditar(raiz, 'eslint-actual');
    const configuracionSha = hash(config);
    const configuracionBaseSha = hash(join(raizBase, '.eslintrc.json'));
    const comparacion = {
      baseSha, commitSha, node: process.version, configuracionSha, configuracionBaseSha,
      arbolLimpio, huellaFuentes: huellaAntes,
      fuentesEstables: huellaAntes === huellaFuentes() && configuracionAntes === configuracionSha,
      configuracionSinCambios: configuracionSha === configuracionBaseSha,
      ...compararDiagnosticos(actual, base, raiz, raizBase),
    };
    writeFileSync(join(salida, 'eslint-comparacion.json'), JSON.stringify(comparacion, null, 2));
    console.log(`Base ${baseSha}: ${comparacion.base.errores} errores, ${comparacion.base.avisos} avisos.`);
    console.log(`${arbolLimpio ? 'Commit' : 'Snapshot local con HEAD de referencia'} ${commitSha}: ${comparacion.actual.errores} errores, ${comparacion.actual.avisos} avisos.`);
    console.log(`Errores nuevos: ${comparacion.erroresNuevos}. Errores retirados: ${comparacion.erroresResueltos}.`);
    if (!comparacion.fuentesEstables) throw new Error('Las fuentes cambiaron durante la auditoría; esta corrida no acredita ausencia de regresiones.');
    if (!comparacion.configuracionSinCambios) {
      throw new Error('Cambió la política ESLint: esta comparación no acredita ausencia de regresiones. Revisa la configuración explícitamente.');
    }
    if (comparacion.erroresNuevos) process.exitCode = 1;
  } finally {
    if (preparado) git(['worktree', 'remove', '--force', raizBase]);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) comprobar();
