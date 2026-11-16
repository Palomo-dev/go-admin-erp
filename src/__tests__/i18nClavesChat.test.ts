/**
 * Claves de next-intl del módulo Chat y de Configuración en los 4 idiomas.
 *
 * El proveedor de idiomas (src/i18n/provider.tsx) no tiene respaldo: si una
 * clave no existe en el idioma activo, next-intl pinta su ruta cruda
 * («chatModulo.conocimiento.importar»). Lo mismo pasa cuando la clave existe
 * pero es un grupo de claves y no un texto: ese fue el botón «Importar» de
 * Conocimiento, que pedía `t('importar')` cuando `importar` ya era el
 * namespace de la página de importación.
 *
 * Cómo se leen las claves (con el AST de TypeScript, no con expresiones
 * regulares):
 * - Un traductor es una variable declarada con `useTranslations('ns')`,
 *   `useTranslations()`, `getTranslations('ns')` o
 *   `getTranslations({ namespace: 'ns' })`, con cualquier nombre (`t`, `tc`,
 *   `ti`…).
 * - Cada llamada `t('clave')`, `t.rich`, `t.markup` y `t.raw` se resuelve por
 *   alcance léxico: si `t` es un parámetro, una prop o sale de otro hook, la
 *   llamada se ignora (no es de este archivo y no se puede saber su namespace).
 *   `t.has('clave')` se ignora: preguntar por una clave que falta es su uso.
 * - `t('a')`, `t(cond ? 'a' : 'b')`: cada literal debe ser un texto en
 *   es, en, fr y pt (`t.raw` admite también un grupo).
 * - `t(\`tonos.${x}\`)`: se exige que el prefijo fijo exista en los 4 idiomas.
 * - `t(variable)`: no se puede verificar; se lista en `CLAVES_DINAMICAS` con
 *   el motivo. Una clave dinámica nueva sin documentar hace fallar la prueba.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
type Idioma = (typeof IDIOMAS)[number];

/**
 * Chat, Configuración y lo que el Chat monta de otros módulos: el kit
 * compartido sin sus subcarpetas de inventario y recetas (`useKitT()` =
 * namespace `kit`) y el redactor de WhatsApp del CRM.
 */
const CARPETAS = [
  'src/app/app/chat',
  'src/components/chat',
  'src/components/configuracion',
  'src/components/kit/*',
  'src/components/crm/whatsapp',
  // RR. HH. › Ausencias (fase 2): claves por plantilla (`estados.${e}`, `errores.${codigo}`) verificadas.
  'src/app/app/hrm/ausencias',
  'src/components/hrm/ausencias',
  // Asistencia, Horas extra y recargos y Novedades (fase 2, Figma 20.10–20.12).
  'src/app/app/hrm/asistencia',
  'src/app/app/hrm/novedades',
  'src/components/hrm/asistencia',
  'src/components/hrm/novedades',
  // Turnos, Marcación y Mi equipo (fase 2, Figma 20.8, 20.9 y 20.15).
  'src/app/app/hrm/turnos',
  'src/components/hrm/turnos',
  'src/app/app/hrm/mi-equipo',
  'src/components/hrm/equipo',
  'src/components/marcar',
];

/**
 * Archivos de lógica pura que reciben el traductor ya armado (no llaman a
 * `useTranslations`): su namespace lo fija el componente que los usa.
 * `accesos` son las llamadas tipo `ctx.t('…')` y `nombres` las variables
 * sacadas con `const { t } = ctx`.
 */
const TRADUCTORES_INYECTADOS: Record<string, { ns: string; accesos: string[]; nombres: string[] }> = {
  // ActivityList.tsx: `describirActividad(a, { t: (clave, valores) => t(clave, valores) })` con `useTranslations('chatHilo.actividad')`.
  'src/components/chat/conversations/id/activity/actividadLogica.ts': { ns: 'chatHilo.actividad', accesos: ['ctx.t'], nombres: ['t'] },
};

/**
 * Claves que se arman en tiempo de ejecución y que el verificador no puede
 * deducir del archivo (vienen de un tipo, de la BD o de otra función).
 * `valores` es el dominio completo, comprobado contra su origen; la prueba
 * exige que cada valor sea un texto en los 4 idiomas.
 * Formato de la clave: `ruta/archivo.tsx: ns ← expresión`.
 */
const ESTADOS_CONVERSACION = ['open', 'pending', 'closed', 'archived'];
const PRIORIDADES = ['low', 'normal', 'high', 'urgent'];
const CANALES = ['whatsapp', 'instagram', 'facebook', 'web', 'telegram', 'correo'];
const MOTIVOS_ENVIO = ['ventanaCerrada', 'sinConsentimiento', 'sinCreditos', 'demasiados', 'sinPlantilla', 'generico'];
const ORIGEN_ESTADO = 'conversations.status: CHECK open|pending|closed|archived en la BD (= TONO_ESTADO de CabeceraHilo.tsx)';
const ORIGEN_PRIORIDAD = 'PrioridadChat de ConversacionFila.tsx (= CHECK de conversations.priority en la BD)';
const ORIGEN_CANAL = 'Canal de chat/ui/canal.ts: canalDeTipo() siempre devuelve uno de CANALES';
const ORIGEN_MOTIVO = 'MotivoErrorEnvio de lib/services/chat/envioMensaje.ts (motivoErrorEnvio)';

const CLAVES_DINAMICAS: Record<string, { valores: string[]; origen: string }> = {
  'src/app/app/chat/conversaciones/nueva/page.tsx: chatUi.composer.errores ← motivo': { valores: MOTIVOS_ENVIO, origen: ORIGEN_MOTIVO },
  'src/components/chat/conversations/useConversacion.ts: chatUi.composer.errores ← motivo': { valores: MOTIVOS_ENVIO, origen: ORIGEN_MOTIVO },
  'src/components/chat/conversations/CabeceraConversacion.tsx: chatBandeja.ia.modo ← modoIa': {
    valores: ['auto', 'hybrid', 'manual'],
    origen: 'channels.ai_mode: CHECK auto|hybrid|manual en la BD',
  },
  'src/components/chat/conversations/CabeceraConversacion.tsx: chatUi.canales ← canal': { valores: CANALES, origen: ORIGEN_CANAL },
  'src/components/chat/conversations/CabeceraHilo.tsx: chatUi.canales ← canal': { valores: CANALES, origen: ORIGEN_CANAL },
  'src/components/chat/ui/CanalIcono.tsx: chatUi.canales ← canal': { valores: CANALES, origen: ORIGEN_CANAL },
  'src/components/chat/conversations/CabeceraConversacion.tsx: chatUi.estado ← estado': { valores: ESTADOS_CONVERSACION, origen: ORIGEN_ESTADO },
  'src/components/chat/conversations/CabeceraHilo.tsx: chatUi.estado ← estado': { valores: ESTADOS_CONVERSACION, origen: ORIGEN_ESTADO },
  'src/components/chat/conversations/HojaDetalles.tsx: chatUi.estado ← estado': { valores: ESTADOS_CONVERSACION, origen: ORIGEN_ESTADO },
  'src/components/chat/conversations/HojaDetalles.tsx: chatUi.prioridad ← prioridad': { valores: PRIORIDADES, origen: ORIGEN_PRIORIDAD },
  'src/components/chat/ui/ConversacionFila.tsx: chatUi.prioridad ← prioridad': {
    valores: ['high', 'urgent'],
    origen: 'solo se pinta cuando prioridadVisibleEnFila(prioridad) (high|urgent)',
  },
  'src/components/chat/conversations/HiloConversacion.tsx: chatBandeja.hilo ← rel': {
    valores: ['hoy', 'ayer'],
    origen: "relacionDia() de hiloLogica.ts devuelve hoy|ayer|otro, y 'otro' no se traduce",
  },
  'src/components/chat/ui/Burbuja.tsx: chatUi.burbuja ← entrega': {
    valores: ['enviado', 'entregado', 'leido', 'fallido'],
    origen: 'prop entrega de BurbujaProps',
  },
  'src/components/chat/conversations/id/activity/ActivityList.tsx: chatHilo.actividad ← clave': {
    valores: [],
    origen: 'reenvío a describirActividad(): sus claves se verifican con TRADUCTORES_INYECTADOS (actividadLogica.ts)',
  },
  // Configuración › Recursos humanos (fase 0).
  'src/components/configuracion/panels/hrm/AprobacionesPanel.tsx: hrmConfig.aprobaciones.aprobador ← p.tipo': {
    valores: ['jefe_directo', 'jefe_area', 'rrhh', 'rol'],
    origen: "PasoRegla.tipo (TipoAprobador, src/lib/hrm/configuracion/tipos.ts); 'cargo' y 'persona' se traducen con clave fija",
  },
  'src/components/configuracion/panels/hrm/ParametrosLegalesPanel.tsx: hrmConfig.parametros.estado ← estado': {
    valores: ['vigente', 'transitorio', 'litigio', 'suspendido', 'por_confirmar', 'sin_valor', 'cerrada', 'programada'],
    origen: 'claves de TONO_ESTADO en ParametrosLegalesPanel.tsx (estado de hr_legal_parameters + cerrada/programada)',
  },
  'src/components/configuracion/panels/hrm/ParametrosLegalesPanel.tsx: hrmConfig.parametros.valor ← l.clave': {
    valores: [
      'simple.pct', 'simple.numero', 'simple.dinero', 'simple.texto', 'simple.smmlv', 'hastaSmmlv', 'vecesSmmlv', 'integral',
      'jornada', 'horas', 'nocturnoHasta', 'trio', 'recargos', 'horasExtra', 'par', 'empleadorTrabajador', 'rango', 'segunIbc',
      'sobreIbc', 'clasesArl', 'menosDeSmmlv', 'rangos', 'enUvt', 'licencias', 'porTramos', 'monetizacion', 'embargos',
      'deducciones', 'topeUvt',
    ],
    origen: 'Lectura.clave y detalle.clave que arma src/lib/hrm/configuracion/parametrosCatalogo.ts',
  },
  'src/components/configuracion/panels/hrm/RegistroAccesosPanel.tsx: hrmConfig.registro.accion ← accion': {
    valores: ['ver', 'editar', 'exportar', 'sin_permiso'],
    origen: 'AccionRegistro (acción de hr_access_log)',
  },
};

type Arbol = { [clave: string]: string | Arbol };

const mensajes = Object.fromEntries(
  IDIOMAS.map((l) => [l, JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf-8')) as Arbol]),
) as Record<Idioma, Arbol>;

/** Valor en una ruta con puntos: texto, grupo o `undefined`. */
function valorEn(arbol: Arbol, ruta: string): string | Arbol | undefined {
  let actual: string | Arbol | undefined = arbol;
  for (const parte of ruta.split('.').filter(Boolean)) {
    if (typeof actual !== 'object' || actual === null) return undefined;
    actual = actual[parte];
  }
  return actual;
}

function hayTextoConPrefijo(arbol: Arbol, prefijo: string): boolean {
  // `tonos.` → algún texto bajo el grupo «tonos»; `estado_` → alguna clave hermana que empiece así.
  const corte = prefijo.lastIndexOf('.');
  const padre = corte === -1 ? '' : prefijo.slice(0, corte);
  const inicio = prefijo.slice(corte + 1);
  const grupo = padre ? valorEn(arbol, padre) : arbol;
  if (typeof grupo !== 'object' || grupo === null) return false;
  return Object.keys(grupo).some((k) => k.startsWith(inicio));
}

/** Archivos .ts/.tsx de una carpeta; con `/*` al final, sin bajar a subcarpetas. */
function archivos(carpeta: string): string[] {
  const plana = carpeta.endsWith('/*');
  const base = plana ? carpeta.slice(0, -2) : carpeta;
  const ruta = join(process.cwd(), base);
  return readdirSync(ruta).flatMap((nombre) => {
    const completo = join(ruta, nombre);
    if (statSync(completo).isDirectory()) return nombre === '__tests__' || plana ? [] : archivos(join(base, nombre));
    return /\.tsx?$/.test(nombre) && !/\.d\.ts$/.test(nombre) ? [completo] : [];
  });
}

type Uso = { ns: string; clave: string; tipo: 'texto' | 'raw' | 'prefijo'; linea: number };
type Dinamica = { ns: string; expresion: string; linea: number };
type Traductor = { ns: string } | { desconocido: string };

const HOOKS = new Set(['useTranslations', 'getTranslations']);
const METODOS = new Set(['rich', 'markup', 'raw', 'has']);

function sinEnvoltorio(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isAwaitExpression(x) || ts.isSatisfiesExpression(x)) {
    x = x.expression;
  }
  return x;
}

/** `useTranslations('ns')` → { ns }; cualquier otro inicializador → null. */
function traductorDe(inicial: ts.Expression | undefined): Traductor | null {
  if (!inicial) return null;
  const e = sinEnvoltorio(inicial);
  if (!ts.isCallExpression(e) || !ts.isIdentifier(e.expression)) return null;
  if (e.expression.text === 'useKitT') return { ns: 'kit' };
  if (!HOOKS.has(e.expression.text)) return null;
  const arg = e.arguments[0];
  if (!arg) return { ns: '' };
  if (ts.isStringLiteralLike(arg)) return { ns: arg.text };
  if (ts.isObjectLiteralExpression(arg)) {
    const prop = arg.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'namespace');
    if (!prop) return { ns: '' };
    if (ts.isPropertyAssignment(prop) && ts.isStringLiteralLike(prop.initializer)) return { ns: prop.initializer.text };
  }
  return { desconocido: arg.getText() };
}

function esAlcance(n: ts.Node): boolean {
  return ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) || ts.isCaseBlock(n) || ts.isFunctionLike(n) || ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isCatchClause(n) || ts.isClassLike(n);
}

function alcanceDeBloque(n: ts.Node): ts.Node {
  let p = n.parent;
  while (p && !esAlcance(p)) p = p.parent;
  return p;
}

function alcanceDeFuncion(n: ts.Node): ts.Node {
  let p = n.parent;
  while (p && !ts.isFunctionLike(p) && !ts.isSourceFile(p)) p = p.parent;
  return p;
}

function nombresDe(nombre: ts.BindingName): string[] {
  if (ts.isIdentifier(nombre)) return [nombre.text];
  return nombre.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : nombresDe(el.name)));
}

/** Declaración vista en un alcance: si es un traductor, su namespace; y el nodo que la declara. */
type Declaracion = { traductor: Traductor | null; nodo: ts.Node };

const ITERADORES = new Set(['map', 'forEach', 'flatMap', 'filter', 'some', 'every', 'find']);

/** Analiza un archivo: claves verificables, claves dinámicas y llamadas protegidas con `t.has`. */
function analizar(archivo: string, codigo: string): { usos: Uso[]; dinamicas: Dinamica[] } {
  const fuente = ts.createSourceFile(archivo, codigo, ts.ScriptTarget.Latest, true, archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const inyectado = TRADUCTORES_INYECTADOS[archivo];
  // Alcance → nombre → declaración (el traductor es null si el nombre es otra cosa: prop, parámetro, import…).
  const alcances = new Map<ts.Node, Map<string, Declaracion>>();
  const declarar = (alcance: ts.Node, nombre: string, traductor: Traductor | null, nodo: ts.Node) => {
    if (!alcances.has(alcance)) alcances.set(alcance, new Map());
    alcances.get(alcance)!.set(nombre, { traductor, nodo });
  };

  const recolectar = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n)) {
      const lista = n.parent;
      const esVar = ts.isVariableDeclarationList(lista) && (lista.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
      const alcance = esVar ? alcanceDeFuncion(lista) : alcanceDeBloque(lista);
      const traductor = ts.isIdentifier(n.name) ? traductorDe(n.initializer) : null;
      if (ts.isIdentifier(n.name)) declarar(alcance, n.name.text, traductor, n);
      else {
        for (const nombre of nombresDe(n.name)) {
          // `const { t } = ctx` en un archivo que recibe el traductor inyectado.
          const delInyectado = inyectado && inyectado.nombres.includes(nombre) && ts.isObjectBindingPattern(n.name);
          declarar(alcance, nombre, delInyectado ? { ns: inyectado.ns } : null, n);
        }
      }
    } else if (ts.isParameter(n)) {
      for (const nombre of nombresDe(n.name)) declarar(n.parent, nombre, null, n);
    } else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) {
      declarar(alcanceDeBloque(n), n.name.text, null, n);
    } else if ((ts.isFunctionExpression(n) || ts.isClassExpression(n)) && n.name) {
      declarar(n, n.name.text, null, n);
    } else if (ts.isImportSpecifier(n) || ts.isImportClause(n) || ts.isNamespaceImport(n)) {
      if (n.name) declarar(fuente, n.name.text, null, n);
    } else if (ts.isCatchClause(n) && n.variableDeclaration) {
      for (const nombre of nombresDe(n.variableDeclaration.name)) declarar(n, nombre, null, n);
    }
    ts.forEachChild(n, recolectar);
  };
  recolectar(fuente);

  const resolver = (desde: ts.Node, nombre: string): Declaracion | null => {
    for (let p: ts.Node | undefined = desde; p; p = p.parent) {
      const mapa = alcances.get(p);
      if (mapa?.has(nombre)) return mapa.get(nombre) ?? null;
    }
    return null;
  };

  /**
   * Valores posibles de una expresión cuando se pueden leer del mismo archivo:
   * literales, ternarios, plantillas, una `const` con esos valores, el
   * parámetro de `LISTA.map((x) => …)` sobre un arreglo literal, o el
   * parámetro de una función local cuyas llamadas pasan literales.
   */
  const valoresDe = (expr: ts.Expression, vistos = new Set<ts.Node>(), filtros = new Map<string, (v: string) => boolean>()): string[] | null => {
    const e = sinEnvoltorio(expr);
    if (vistos.has(e)) return null;
    vistos.add(e);
    if (ts.isStringLiteralLike(e)) return [e.text];
    if (ts.isConditionalExpression(e)) {
      // `v === 'never' ? 'never' : 'd' + v`: en cada rama, v queda acotada por la condición.
      const enVerdadero = new Map(filtros);
      const enFalso = new Map(filtros);
      const c = sinEnvoltorio(e.condition);
      if (ts.isBinaryExpression(c) && ts.isIdentifier(c.left) && ts.isStringLiteralLike(c.right)) {
        const nombre = c.left.text;
        const literal = c.right.text;
        const igual = c.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || c.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken;
        const distinto = c.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || c.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken;
        if (igual || distinto) {
          (igual ? enVerdadero : enFalso).set(nombre, (v) => v === literal);
          (igual ? enFalso : enVerdadero).set(nombre, (v) => v !== literal);
        }
      }
      const a = valoresDe(e.whenTrue, new Set(vistos), enVerdadero);
      const b = valoresDe(e.whenFalse, new Set(vistos), enFalso);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isTemplateExpression(e)) {
      let actuales = [e.head.text];
      for (const tramo of e.templateSpans) {
        const vals = valoresDe(tramo.expression, vistos, filtros);
        if (!vals) return null;
        actuales = actuales.flatMap((pre) => vals.map((v) => pre + v + tramo.literal.text));
      }
      return actuales;
    }
    if (ts.isArrayLiteralExpression(e)) {
      const partes = e.elements.map((el) => valoresDe(el, new Set(vistos)));
      return partes.every(Boolean) ? (partes as string[][]).flat() : null;
    }
    // `item.label` con `item` sacado de un arreglo constante de objetos literales (`LISTA.map((item) => …)`, `LISTA.find(…)`).
    if (ts.isPropertyAccessExpression(e)) {
      const objetos = elementos(e.expression, vistos);
      if (!objetos?.length) return null;
      const partes = objetos.map((o) => {
        const prop = o.properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText() === e.name.text);
        return prop && ts.isPropertyAssignment(prop) ? valoresDe(prop.initializer, new Set(vistos)) : null;
      });
      return partes.every(Boolean) ? (partes as string[][]).flat() : null;
    }
    if (!ts.isIdentifier(e)) return null;
    const filtro = filtros.get(e.text);
    if (filtro) {
      const sinFiltro = new Map(filtros);
      sinFiltro.delete(e.text);
      const otrosVistos = new Set(vistos);
      otrosVistos.delete(e);
      const todos = valoresDe(e, otrosVistos, sinFiltro);
      return todos ? todos.filter(filtro) : null;
    }
    const decl = resolver(e, e.text)?.nodo;
    if (!decl) return null;
    if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.initializer && (decl.parent.flags & ts.NodeFlags.Const) !== 0) {
      return valoresDe(decl.initializer, vistos);
    }
    // `(clave: 'registro' | 'elemento') => …`: el tipo del parámetro es el dominio.
    if (ts.isParameter(decl) && decl.type) {
      const tipos = ts.isUnionTypeNode(decl.type) ? decl.type.types : [decl.type];
      const literales = tipos.map((x) => (ts.isLiteralTypeNode(x) && ts.isStringLiteral(x.literal) ? x.literal.text : null));
      if (literales.every((x): x is string => x !== null)) return literales;
    }
    if (ts.isParameter(decl) && ts.isIdentifier(decl.name)) {
      const funcion = decl.parent;
      const indice = funcion.parameters.indexOf(decl);
      const llamada = funcion.parent;
      // `LISTA.map((x) => …)`: x toma los valores del arreglo.
      if (
        indice === 0 &&
        ts.isCallExpression(llamada) &&
        llamada.arguments[0] === funcion &&
        ts.isPropertyAccessExpression(llamada.expression) &&
        ITERADORES.has(llamada.expression.name.text)
      ) {
        return valoresDe(llamada.expression.expression, vistos);
      }
      // `const cupo = (…, clave) => t(clave)` y luego `cupo(…, 'a.b')`.
      if ((ts.isArrowFunction(funcion) || ts.isFunctionExpression(funcion)) && ts.isVariableDeclaration(funcion.parent) && ts.isIdentifier(funcion.parent.name)) {
        const nombre = funcion.parent.name.text;
        const valores: string[] = [];
        let completo = true;
        const buscar = (n: ts.Node) => {
          if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === nombre && resolver(n, nombre)?.nodo === funcion.parent) {
            const v = n.arguments[indice] ? valoresDe(n.arguments[indice], vistos) : null;
            if (v) valores.push(...v);
            else completo = false;
          }
          ts.forEachChild(n, buscar);
        };
        buscar(fuente);
        return completo && valores.length > 0 ? valores : null;
      }
    }
    return null;
  };

  /** Objetos literales que puede valer una expresión que es un elemento de un arreglo constante del archivo. */
  const elementos = (expr: ts.Expression, vistos: Set<ts.Node>): ts.ObjectLiteralExpression[] | null => {
    const e = sinEnvoltorio(expr);
    if (ts.isObjectLiteralExpression(e)) return [e];
    if (ts.isConditionalExpression(e)) {
      const a = elementos(e.whenTrue, vistos);
      const b = elementos(e.whenFalse, vistos);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'find') return deArreglo(e.expression.expression, vistos);
    if (!ts.isIdentifier(e)) return null;
    const decl = resolver(e, e.text)?.nodo;
    if (!decl || vistos.has(decl)) return null;
    if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.initializer && (decl.parent.flags & ts.NodeFlags.Const) !== 0) {
      return elementos(decl.initializer, new Set(vistos).add(decl));
    }
    if (ts.isParameter(decl) && decl.parent.parameters[0] === decl) {
      const llamada = decl.parent.parent;
      if (ts.isCallExpression(llamada) && llamada.arguments[0] === decl.parent && ts.isPropertyAccessExpression(llamada.expression) && ITERADORES.has(llamada.expression.name.text)) {
        return deArreglo(llamada.expression.expression, new Set(vistos).add(decl));
      }
    }
    return null;
  };
  const deArreglo = (expr: ts.Expression, vistos: Set<ts.Node>): ts.ObjectLiteralExpression[] | null => {
    const e = sinEnvoltorio(expr);
    if (ts.isArrayLiteralExpression(e)) {
      const partes = e.elements.map((el) => elementos(el, vistos));
      return partes.every(Boolean) ? (partes as ts.ObjectLiteralExpression[][]).flat() : null;
    }
    if (!ts.isIdentifier(e)) return null;
    const decl = resolver(e, e.text)?.nodo;
    if (!decl || vistos.has(decl) || !ts.isVariableDeclaration(decl) || !decl.initializer || (decl.parent.flags & ts.NodeFlags.Const) === 0) return null;
    return deArreglo(decl.initializer, new Set(vistos).add(decl));
  };

  /** `t.has(x) ? t(x) : respaldo` o `x === 'otro' ? … : t(x)`: la llamada no puede pedir una clave que falte. */
  const protegida = (llamada: ts.CallExpression, variable: string, arg: ts.Expression): boolean => {
    const texto = sinEnvoltorio(arg).getText();
    /** `t.has(x)` (o `!t.has(x)` si `negada`) dentro de la condición, sola o en una cadena de `&&` / `||`. */
    const preguntaPor = (cond: ts.Expression, negada: boolean): boolean => {
      const c = sinEnvoltorio(cond);
      if (ts.isBinaryExpression(c) && c.operatorToken.kind === (negada ? ts.SyntaxKind.BarBarToken : ts.SyntaxKind.AmpersandAmpersandToken)) {
        return preguntaPor(c.left, negada) || preguntaPor(c.right, negada);
      }
      let x: ts.Expression = c;
      if (negada) {
        if (!ts.isPrefixUnaryExpression(c) || c.operator !== ts.SyntaxKind.ExclamationToken) return false;
        x = sinEnvoltorio(c.operand);
      }
      return (
        ts.isCallExpression(x) &&
        ts.isPropertyAccessExpression(x.expression) &&
        x.expression.name.text === 'has' &&
        x.expression.expression.getText() === variable &&
        !!x.arguments[0] &&
        sinEnvoltorio(x.arguments[0]).getText() === texto
      );
    };
    const sale = (n: ts.Statement): boolean =>
      ts.isReturnStatement(n) || ts.isThrowStatement(n) || (ts.isBlock(n) && n.statements.some((x) => ts.isReturnStatement(x) || ts.isThrowStatement(x)));
    for (let hijo: ts.Node = llamada, p = llamada.parent; p; hijo = p, p = p.parent) {
      // `t.has(x) ? t(x) : respaldo` y `if (t.has(x)) … t(x)`.
      if (ts.isConditionalExpression(p) && p.whenTrue === hijo && preguntaPor(p.condition, false)) return true;
      if (ts.isIfStatement(p) && p.thenStatement === hijo && preguntaPor(p.expression, false)) return true;
      // `if (!t.has(x)) return respaldo;` antes, en el mismo bloque.
      if (ts.isBlock(p)) {
        const indice = p.statements.indexOf(hijo as ts.Statement);
        if (p.statements.slice(0, Math.max(indice, 0)).some((st) => ts.isIfStatement(st) && sale(st.thenStatement) && preguntaPor(st.expression, true))) return true;
      }
      if (ts.isFunctionLike(p)) return false;
    }
    return false;
  };

  const usos: Uso[] = [];
  const dinamicas: Dinamica[] = [];
  const lineaDe = (n: ts.Node) => fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1;

  const claves = (llamada: ts.CallExpression, variable: string, ns: string, tipo: 'texto' | 'raw') => {
    const arg = llamada.arguments[0];
    const e = sinEnvoltorio(arg);
    const valores = valoresDe(e);
    if (valores) {
      for (const clave of valores) usos.push({ ns, clave, tipo, linea: lineaDe(e) });
      return;
    }
    if (ts.isConditionalExpression(e)) {
      // Una rama literal y otra dinámica: la literal se verifica y la otra se reporta.
      for (const rama of [e.whenTrue, e.whenFalse]) {
        const v = valoresDe(rama);
        if (v) v.forEach((clave) => usos.push({ ns, clave, tipo, linea: lineaDe(rama) }));
        else dinamicas.push({ ns, expresion: rama.getText().replace(/\s+/g, ' '), linea: lineaDe(rama) });
      }
      return;
    }
    if (protegida(llamada, variable, arg)) return;
    if (ts.isTemplateExpression(e) && e.head.text) usos.push({ ns, clave: e.head.text, tipo: 'prefijo', linea: lineaDe(e) });
    else dinamicas.push({ ns, expresion: e.getText().replace(/\s+/g, ' '), linea: lineaDe(e) });
  };

  const visitar = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.arguments.length > 0) {
      let variable: ts.Expression | null = null;
      let metodo = '';
      if (ts.isIdentifier(n.expression)) variable = n.expression;
      else if (ts.isPropertyAccessExpression(n.expression) && METODOS.has(n.expression.name.text)) {
        variable = n.expression.expression;
        metodo = n.expression.name.text;
      }
      if (inyectado && ts.isPropertyAccessExpression(n.expression) && inyectado.accesos.includes(n.expression.getText())) {
        claves(n, n.expression.getText(), inyectado.ns, 'texto');
      } else if (variable && ts.isIdentifier(variable)) {
        const traductor = resolver(n, variable.text)?.traductor ?? null;
        if (traductor && metodo !== 'has') {
          if ('desconocido' in traductor) dinamicas.push({ ns: `?${traductor.desconocido}`, expresion: n.arguments[0].getText(), linea: lineaDe(n) });
          else claves(n, variable.text, traductor.ns, metodo === 'raw' ? 'raw' : 'texto');
        }
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  return { usos, dinamicas };
}

const RUTAS = CARPETAS.flatMap(archivos);
const ANALISIS = RUTAS.map((ruta) => {
  const archivo = relative(process.cwd(), ruta).replace(/\\/g, '/');
  return { archivo, ...analizar(archivo, readFileSync(ruta, 'utf-8')) };
});

describe('el analizador de claves', () => {
  const codigo = `
    import { useTranslations } from 'next-intl';
    const PASOS = ['paso1', 'paso2'] as const;
    const NIVELES = [{ v: 'a', etiqueta: 'niveles.a' }, { v: 'b', etiqueta: 'niveles.b' }];
    function Prop({ t }: { t: (k: string) => string }) { return t('deProps'); }
    export function A({ x, y }: { x: string; y: string }) {
      const tc = useTranslations('ns.a');
      const etiqueta = (t: (k: string) => string) => t('sombreada');
      const cupo = (n: number, clave: string) => tc(clave, { n });
      return [
        tc('literal'), tc.rich('rica'), tc(x ? 'si' : 'no'), tc(\`tonos.\${x}\`), tc.has(y) ? tc(y) : y,
        PASOS.map((p) => tc(p)), tc(y === 'never' ? 'never' : \`d\${y}\`), cupo(1, 'cupo.uno'), cupo(2, 'cupo.dos'),
        tc.has('noSeExige'), tc(x), etiqueta, tc.raw('grupo'), NIVELES.map((n) => tc(n.etiqueta)),
      ];
    }`;
  const { usos, dinamicas } = analizar('src/prueba.tsx', codigo);

  test('lee las claves del traductor local con su namespace y sigue los valores del archivo', () => {
    expect(usos.map((u) => `${u.ns}:${u.clave}:${u.tipo}`).sort()).toEqual(
      [
        'ns.a:literal:texto', 'ns.a:rica:texto', 'ns.a:si:texto', 'ns.a:no:texto', 'ns.a:tonos.:prefijo', 'ns.a:paso1:texto',
        'ns.a:paso2:texto', 'ns.a:never:texto', 'ns.a:cupo.uno:texto', 'ns.a:cupo.dos:texto', 'ns.a:grupo:raw',
        'ns.a:niveles.a:texto', 'ns.a:niveles.b:texto',
      ].sort(),
    );
  });

  test('ignora traductores de props o sombreados, y reporta lo que no puede deducir', () => {
    expect(dinamicas.map((d) => `${d.ns} ← ${d.expresion}`)).toEqual(['ns.a ← `d${y}`', 'ns.a ← x']);
  });
});

describe('claves de next-intl de Chat y Configuración', () => {
  test('el verificador encuentra los traductores (no está mirando a la nada)', () => {
    expect(ANALISIS.reduce((n, a) => n + a.usos.length, 0)).toBeGreaterThan(2000);
  });

  test.each(IDIOMAS)('%s: toda clave literal existe y es un texto (no un grupo)', (idioma) => {
    const malas = ANALISIS.flatMap(({ archivo, usos }) =>
      usos
        .filter((u) => u.tipo !== 'prefijo')
        .flatMap((u) => {
          const ruta = [u.ns, u.clave].filter(Boolean).join('.');
          const valor = valorEn(mensajes[idioma], ruta);
          if (valor === undefined) return [`${archivo}:${u.linea} falta ${ruta}`];
          if (u.tipo === 'texto' && typeof valor !== 'string') return [`${archivo}:${u.linea} ${ruta} es un grupo, no un texto`];
          return [];
        }),
    );
    expect(Array.from(new Set(malas))).toEqual([]);
  });

  test.each(IDIOMAS)('%s: todo prefijo fijo de una clave armada existe', (idioma) => {
    const malas = ANALISIS.flatMap(({ archivo, usos }) =>
      usos
        .filter((u) => u.tipo === 'prefijo')
        .filter((u) => !hayTextoConPrefijo(mensajes[idioma], [u.ns, u.clave].filter(Boolean).join('.')))
        .map((u) => `${archivo}:${u.linea} ${[u.ns, u.clave].filter(Boolean).join('.')}…`),
    );
    expect(malas).toEqual([]);
  });

  test('toda clave dinámica (sin prefijo fijo) está documentada en CLAVES_DINAMICAS', () => {
    const encontradas = ANALISIS.flatMap(({ archivo, dinamicas }) => dinamicas.map((d) => `${archivo}: ${d.ns} ← ${d.expresion}`));
    const sinDocumentar = Array.from(new Set(encontradas)).filter((d) => !(d in CLAVES_DINAMICAS));
    const sobran = Object.keys(CLAVES_DINAMICAS).filter((d) => !encontradas.includes(d));
    expect({ sinDocumentar, sobran }).toEqual({ sinDocumentar: [], sobran: [] });
  });

  test.each(IDIOMAS)('%s: todo valor documentado de una clave dinámica es un texto', (idioma) => {
    const malas = Object.entries(CLAVES_DINAMICAS).flatMap(([id, { valores }]) => {
      const ns = id.slice(id.indexOf(': ') + 2, id.indexOf(' ← '));
      return valores
        .map((v) => [ns, v].filter(Boolean).join('.'))
        .filter((ruta) => typeof valorEn(mensajes[idioma], ruta) !== 'string')
        .map((ruta) => `${id}: ${ruta}`);
    });
    expect(malas).toEqual([]);
  });

  test('todo archivo con traductor inyectado existe y pide claves', () => {
    const vacios = Object.keys(TRADUCTORES_INYECTADOS).filter((archivo) => !ANALISIS.find((a) => a.archivo === archivo)?.usos.length);
    expect(vacios).toEqual([]);
  });
});
