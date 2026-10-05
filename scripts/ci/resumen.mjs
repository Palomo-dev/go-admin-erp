// El diagnóstico se publica incluso cuando falla la comprobación anterior.
// Este script resume evidencia; el exit code del comando de lint/tsc/Jest
// determina el resultado del job y nunca se sustituye por el del resumen.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [tipo, ruta] = process.argv.slice(2);
if (!['eslint', 'eslint-regresiones', 'typescript', 'jest'].includes(tipo) || !ruta) {
  throw new Error('Uso: node scripts/ci/resumen.mjs eslint|eslint-regresiones|typescript|jest archivo');
}

const escapar = (valor) => String(valor).replace(/[\r\n|`<>]/g, ' ');
const lineas = [`### ${escapar(tipo)} — evidencia de CI`, ''];
lineas.push(`- Runtime: ${process.version}`);
if (process.env.GITHUB_SHA) lineas.push(`- Commit comprobado: \`${escapar(process.env.GITHUB_SHA)}\``);
if (process.env.TZ) lineas.push(`- Zona del runtime: \`${escapar(process.env.TZ)}\``);
if (process.env.CI_SHARD) lineas.push(`- Partición de la suite: ${escapar(process.env.CI_SHARD)}`);

if (!existsSync(ruta)) {
  lineas.push('', 'No se generó el archivo de resultados. Revisa el paso que falló; esto no acredita una comprobación satisfactoria.');
} else if (tipo === 'typescript') {
  const contenido = readFileSync(ruta, 'utf8');
  const errores = contenido.split('\n').filter((linea) => /error TS\d+:/.test(linea));
  lineas.push('', `Errores de TypeScript registrados: **${errores.length}**.`);
  if (errores.length) lineas.push('', ...errores.slice(0, 20).map((linea) => `- ${escapar(linea)}`));
  if (!errores.length && contenido.trim()) {
    lineas.push('', 'El comando dejó otro diagnóstico. Consulta el log completo; el conteo de errores TS no determina si el proceso terminó correctamente.');
  }
} else {
  const resultado = JSON.parse(readFileSync(ruta, 'utf8'));
  if (tipo === 'eslint-regresiones') {
    lineas.push('', `Base comparada: \`${escapar(resultado.baseSha)}\`.`);
    lineas.push(`${resultado.arbolLimpio ? 'Commit comprobado' : 'Snapshot local: HEAD de referencia'}: \`${escapar(resultado.commitSha)}\`.`);
    lineas.push(`Árbol al empezar: **${resultado.arbolLimpio ? 'limpio' : 'con cambios locales'}**.`);
    lineas.push(`Huella de fuentes (SHA-256): \`${escapar(resultado.huellaFuentes)}\`.`);
    lineas.push(`Configuración ESLint (SHA-256): \`${escapar(resultado.configuracionSha)}\`.`);
    lineas.push('', '| Diagnóstico completo | Base | Commit comprobado |', '| --- | ---: | ---: |');
    lineas.push(`| Errores | ${resultado.base.errores} | ${resultado.actual.errores} |`);
    lineas.push(`| Avisos | ${resultado.base.avisos} | ${resultado.actual.avisos} |`);
    lineas.push('', `Errores nuevos que bloquean: **${resultado.erroresNuevos}**. Errores retirados: **${resultado.erroresResueltos}**.`);
    if (!resultado.configuracionSinCambios) lineas.push('', '**La política ESLint cambió: el gate falla aunque no aparezcan errores nuevos.**');
    if (!resultado.fuentesEstables) lineas.push('', '**Las fuentes cambiaron durante la auditoría: la corrida no acredita ausencia de regresiones.**');
    if (resultado.actual.errores) lineas.push('', '**ESLint global sigue con errores.** Este gate exige ausencia de regresiones frente a la base; no acredita que todo el repositorio esté limpio.');
    if (resultado.regresiones.length) lineas.push('', ...resultado.regresiones.slice(0, 20).map((error) => `- ${escapar(error.archivo)}:${error.linea} — ${escapar(error.regla || 'Parseo')}: ${escapar(error.mensaje)} (${error.cantidad})`));
  } else if (tipo === 'eslint') {
    const errores = resultado.reduce((total, archivo) => total + archivo.errorCount, 0);
    const avisos = resultado.reduce((total, archivo) => total + archivo.warningCount, 0);
    const reglas = new Map();
    for (const archivo of resultado) {
      for (const mensaje of archivo.messages.filter((item) => item.severity === 2)) {
        const regla = mensaje.ruleId || 'Error de parseo';
        reglas.set(regla, (reglas.get(regla) || 0) + 1);
      }
    }
    lineas.push('', `Archivos en el diagnóstico: **${resultado.length}**. Errores: **${errores}**. Avisos: **${avisos}**.`);
    if (reglas.size) {
      lineas.push('', '| Regla | Errores |', '| --- | ---: |');
      for (const [regla, cantidad] of [...reglas].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        lineas.push(`| ${escapar(regla)} | ${cantidad} |`);
      }
    }
  } else {
    lineas.push('', '| Resultado | Suites | Pruebas |', '| --- | ---: | ---: |');
    lineas.push(`| Pasaron | ${resultado.numPassedTestSuites} | ${resultado.numPassedTests} |`);
    lineas.push(`| Fallaron | ${resultado.numFailedTestSuites} | ${resultado.numFailedTests} |`);
    lineas.push(`| Omitidas por sus definiciones | ${resultado.numPendingTestSuites} | ${resultado.numPendingTests} |`);
    lineas.push(`| Total de esta corrida | ${resultado.numTotalTestSuites} | ${resultado.numTotalTests} |`);
    if (resultado.numRuntimeErrorTestSuites) lineas.push('', `Suites con errores de ejecución: **${resultado.numRuntimeErrorTestSuites}**.`);
    const fallos = (resultado.testResults || []).flatMap((suite) => (
      (suite.assertionResults || []).filter((prueba) => prueba.status === 'failed').map((prueba) => prueba.fullName)
    ));
    if (fallos.length) lineas.push('', 'Primeras aserciones fallidas:', '', ...fallos.slice(0, 20).map((fallo) => `- ${escapar(fallo)}`));
  }
  lineas.push('', 'El JSON y el log completos están en el artefacto de este job. Los conteos corresponden a esta corrida, no a ejecuciones anteriores.');
}

const resumen = `${lineas.join('\n')}\n`;
console.log(resumen);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen);
