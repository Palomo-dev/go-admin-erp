#!/usr/bin/env node
/**
 * Genera el favicon, los íconos de la PWA, el badge de notificaciones y los
 * recursos nativos para Capacitor (Android/iOS) a partir del isotipo del
 * manual de marca v2.0 (sept. 2026).
 *
 *     node scripts/brand/generar-iconos.mjs            # genera todo
 *     node scripts/brand/generar-iconos.mjs --verificar # solo comprueba tamaños y formatos
 *
 * Fuente de verdad: la misma que el Desktop (electron/build/brand/generate-assets.py):
 *   - cuadrado de lado x, radio 0,29·x, fondo Azul GO #4361EE;
 *   - «GO» en Inter 700 blanco, ancho del grupo ≈ 0,52·x, centrado y bajado 1 % de x;
 *   - a 16/20/24/32 px el grupo se abre (0,72/0,66/0,62/0,58·x) y se engrosa el
 *     trazo (0,12/0,10/0,06/0 px finales) para que siga legible; documentado en
 *     docs/desktop/MARCA-INSTALADOR.md.
 *
 * El vector maestro se construye aquí: los contornos de «G» y «O» se leen del
 * TTF (electron/build/brand/Inter-700.ttf, tabla glyf) y se escriben como paths
 * SVG, sin depender de que el sistema tenga Inter instalada. Ese SVG queda en
 * public/icon.svg y todos los PNG/ICO salen de él con sharp (web en public/,
 * Android en mobile/android, iOS y entradas de @capacitor/assets en mobile/resources). El .ico se
 * empaqueta con un escritor propio (entradas BMP de 32 bpp + máscara AND, igual
 * que el icon.ico del Desktop) para no sumar dependencias.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import sharp from 'sharp';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(raiz, 'public');
// Proyecto Capacitor: mobile/ (Android generado; iOS aún sin proyecto Xcode).
const RES_ANDROID = 'mobile/android/app/src/main/res';
const RES_MOVIL = 'mobile/resources'; // entradas de @capacitor/assets + AppIcon de iOS listo para copiar
const FUENTE = join(raiz, 'electron', 'build', 'brand', 'Inter-700.ttf');
const FUENTE_ETIQUETA = join(raiz, 'electron', 'build', 'brand', 'Inter-500.ttf');
const HOJA = join(raiz, 'docs', 'design', 'figma', '54-iconos-marca.png');

// ── Paleta (manual de marca v2.0) ──
const AZUL_GO = '#4361EE';
const BLANCO = '#FFFFFF';
const FONDO_SUAVE = '#F8FAFF';
const TINTA = '#0F172A';
const PIZARRA = '#475569';

// ─────────────────────────────────────────────────────────────────────────────
// Lectura mínima de TrueType (cmap 4, head, hhea, hmtx, loca, glyf simple)
// ─────────────────────────────────────────────────────────────────────────────
function leerFuente(ruta) {
  const b = readFileSync(ruta);
  const n = b.readUInt16BE(4);
  const tablas = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + 16 * i;
    tablas[b.toString('latin1', o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) };
  }
  const head = tablas.head.off;
  const unitsPerEm = b.readUInt16BE(head + 18);
  const locLargo = b.readInt16BE(head + 50) === 1;
  const numHMetrics = b.readUInt16BE(tablas.hhea.off + 34);

  // cmap: subtabla formato 4 (Unicode BMP)
  const cmap = tablas.cmap.off;
  let sub = -1;
  for (let i = 0, nt = b.readUInt16BE(cmap + 2); i < nt; i++) {
    const pid = b.readUInt16BE(cmap + 4 + 8 * i);
    const eid = b.readUInt16BE(cmap + 6 + 8 * i);
    const off = cmap + b.readUInt32BE(cmap + 8 + 8 * i);
    if (b.readUInt16BE(off) === 4 && (pid === 3 && eid === 1 || pid === 0)) { sub = off; break; }
  }
  if (sub < 0) throw new Error('La fuente no tiene cmap formato 4');
  const segX2 = b.readUInt16BE(sub + 6);
  const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, rangos = deltas + segX2;
  function glifo(cp) {
    for (let i = 0; i < segX2 / 2; i++) {
      const fin = b.readUInt16BE(ends + 2 * i);
      if (cp > fin) continue;
      const ini = b.readUInt16BE(starts + 2 * i);
      if (cp < ini) return 0;
      const delta = b.readInt16BE(deltas + 2 * i);
      const ro = b.readUInt16BE(rangos + 2 * i);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = b.readUInt16BE(rangos + 2 * i + ro + 2 * (cp - ini));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  }
  function avance(gid) {
    const i = Math.min(gid, numHMetrics - 1);
    return b.readUInt16BE(tablas.hmtx.off + 4 * i);
  }
  function contornos(gid) {
    const loca = tablas.loca.off;
    const ini = locLargo ? b.readUInt32BE(loca + 4 * gid) : b.readUInt16BE(loca + 2 * gid) * 2;
    const p = tablas.glyf.off + ini;
    const nc = b.readInt16BE(p);
    if (nc < 0) throw new Error(`Glifo ${gid} compuesto: no soportado`);
    const bbox = { xMin: b.readInt16BE(p + 2), yMin: b.readInt16BE(p + 4), xMax: b.readInt16BE(p + 6), yMax: b.readInt16BE(p + 8) };
    const finales = [];
    for (let i = 0; i < nc; i++) finales.push(b.readUInt16BE(p + 10 + 2 * i));
    const nPts = finales[nc - 1] + 1;
    let q = p + 10 + 2 * nc;
    q += 2 + b.readUInt16BE(q); // instrucciones
    const flags = [];
    while (flags.length < nPts) {
      const f = b[q++];
      flags.push(f);
      if (f & 8) { let r = b[q++]; while (r--) flags.push(f); }
    }
    const xs = [], ys = [];
    let v = 0;
    for (const f of flags) {
      if (f & 2) { const d = b[q++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += b.readInt16BE(q); q += 2; }
      xs.push(v);
    }
    v = 0;
    for (const f of flags) {
      if (f & 4) { const d = b[q++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += b.readInt16BE(q); q += 2; }
      ys.push(v);
    }
    const lista = [];
    let s = 0;
    for (const e of finales) {
      const c = [];
      for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
      lista.push(c);
      s = e + 1;
    }
    return { contornos: lista, bbox };
  }
  return { unitsPerEm, glifo, avance, contornos };
}

/** Contorno cuadrático TrueType → comandos SVG con la transformación dada. */
function contornoASvg(c, tx) {
  const n = c.length;
  const P = (pt) => tx(pt.x, pt.y);
  const fmt = ([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
  // Punto de arranque: uno on-curve, o el medio de dos off-curve.
  let k = c.findIndex((p) => p.on);
  let inicio;
  if (k < 0) { inicio = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2, on: true }; k = 0; } else { inicio = c[k]; k += 1; }
  let d = `M${fmt(P(inicio))}`;
  let control = null;
  for (let i = 0; i < n; i++) {
    const p = c[(k + i) % n];
    if (p.on) {
      d += control ? `Q${fmt(P(control))} ${fmt(P(p))}` : `L${fmt(P(p))}`;
      control = null;
    } else if (control) {
      const medio = { x: (control.x + p.x) / 2, y: (control.y + p.y) / 2 };
      d += `Q${fmt(P(control))} ${fmt(P(medio))}`;
      control = p;
    } else {
      control = p;
    }
  }
  d += control ? `Q${fmt(P(control))} ${fmt(P(inicio))}Z` : 'Z';
  return d;
}

const fuente = leerFuente(FUENTE);
const G = fuente.contornos(fuente.glifo(0x47));
const O = fuente.contornos(fuente.glifo(0x4f));
const avanceG = fuente.avance(fuente.glifo(0x47));

/**
 * Path del grupo «GO» dentro de un lienzo de `lado` unidades.
 * `ancho`: ancho de tinta objetivo (fracción del lado); `cx`,`cy`: centro de la
 * tinta (fracción del lado). `trazo`: engrosado por lado, en unidades del lienzo.
 */
function pathGO(lado, ancho, cx = 0.5, cy = 0.51, trazo = 0) {
  const inkG = G.bbox.xMax - G.bbox.xMin;
  const inkO = O.bbox.xMax - O.bbox.xMin;
  // Separación natural (como el generador del Desktop): avance de G − tinta de G.
  const hueco = avanceG - inkG;
  const anchoFU = inkG + hueco + inkO;
  const k = (ancho * lado - 2 * trazo) / anchoFU;
  const yMax = Math.max(G.bbox.yMax, O.bbox.yMax);
  const yMin = Math.min(G.bbox.yMin, O.bbox.yMin);
  const alto = (yMax - yMin) * k;
  const x0 = cx * lado - (anchoFU * k) / 2;
  const top = cy * lado - alto / 2;
  const txG = (x, y) => [x0 + (x - G.bbox.xMin) * k, top + (yMax - y) * k];
  const offO = x0 + (inkG + hueco) * k;
  const txO = (x, y) => [offO + (x - O.bbox.xMin) * k, top + (yMax - y) * k];
  return [...G.contornos.map((c) => contornoASvg(c, txG)), ...O.contornos.map((c) => contornoASvg(c, txO))].join('');
}

// Parámetros del manual para íconos de sistema pequeños (idénticos al Desktop).
const PEQUENOS = { 16: [0.72, 0.12], 20: [0.66, 0.10], 24: [0.62, 0.06], 32: [0.58, 0] };

const L = 1024; // lado del lienzo vectorial

/**
 * SVG del isotipo.
 * forma: 'redondeado' (cuadrado 0,29·x con esquinas transparentes),
 *        'completo'   (sangrado total: iOS, maskable, fondos adaptativos),
 *        'circulo'    (ic_launcher_round),
 *        'nada'       (solo «GO», fondo transparente: foreground adaptativo).
 * silueta: true → figura blanca con «GO» calado (badge / ic_stat).
 */
function svgIsotipo({ px = L, forma = 'redondeado', ancho, fondo = AZUL_GO, tinta = BLANCO, silueta = false, escalaForma = 1 } = {}) {
  const [anchoPeq, trazoPx] = PEQUENOS[px] ?? [0.52, 0];
  const w = ancho ?? anchoPeq;
  const trazo = trazoPx * (L / px);
  const go = pathGO(L, w, 0.5, 0.51, trazo);
  const lado = L * escalaForma;
  const m = (L - lado) / 2;
  let figura = '';
  if (forma === 'redondeado') figura = `<rect x="${m}" y="${m}" width="${lado}" height="${lado}" rx="${+(0.29 * lado).toFixed(2)}"`;
  else if (forma === 'completo') figura = `<rect width="${L}" height="${L}"`;
  else if (forma === 'circulo') figura = `<circle cx="${L / 2}" cy="${L / 2}" r="${lado / 2}"`;
  const trazoAttr = trazo > 0 ? ` stroke-width="${+(2 * trazo).toFixed(2)}" stroke-linejoin="round"` : '';
  let cuerpo;
  if (silueta) {
    // Figura blanca con «GO» calado: una máscara recorta las letras.
    cuerpo = `<defs><mask id="m"><rect width="${L}" height="${L}" fill="#fff"/><path d="${go}" fill="#000"${trazo > 0 ? ` stroke="#000"${trazoAttr}` : ''}/></mask></defs>` +
      `${figura} fill="${BLANCO}" mask="url(#m)"/>`;
  } else {
    cuerpo = (figura ? `${figura} fill="${fondo}"/>` : '') + `<path d="${go}" fill="${tinta}"${trazo > 0 ? ` stroke="${tinta}"${trazoAttr}` : ''}/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${L}" width="${L}" height="${L}">${cuerpo}</svg>`;
}

/** Rasteriza un SVG a `px` con sobremuestreo (como el Desktop: ×16 hasta 32 px, ×4 el resto). */
async function raster(svg, px, { alfa = true, fondo } = {}) {
  const ss = px <= 32 ? 16 : px <= 256 ? 4 : 2;
  const grande = Math.min(px * ss, 4096);
  let img = sharp(Buffer.from(svg), { density: (72 * grande) / L }).resize(grande, grande).png();
  let buf = await img.toBuffer();
  img = sharp(buf).resize(px, px, { kernel: 'lanczos3' });
  if (!alfa) img = img.flatten({ background: fondo ?? AZUL_GO }).removeAlpha();
  return img.png({ compressionLevel: 9 }).toBuffer();
}

// ── .ico (entradas BMP 32 bpp + máscara AND, como el icon.ico del Desktop) ──
async function entradaBmp(pngBuf) {
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const cab = Buffer.alloc(40);
  cab.writeUInt32LE(40, 0); cab.writeInt32LE(w, 4); cab.writeInt32LE(h * 2, 8);
  cab.writeUInt16LE(1, 12); cab.writeUInt16LE(32, 14);
  const px = Buffer.alloc(w * h * 4);
  const stride = Math.ceil(w / 32) * 4;
  const mascara = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const fy = h - 1 - y; // de abajo arriba
    for (let x = 0; x < w; x++) {
      const s = (fy * w + x) * 4, d = (y * w + x) * 4;
      px[d] = data[s + 2]; px[d + 1] = data[s + 1]; px[d + 2] = data[s]; px[d + 3] = data[s + 3];
      if (data[s + 3] === 0) mascara[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([cab, px, mascara]);
}

async function escribirIco(ruta, pngs) {
  const datos = [];
  for (const { px, buf } of pngs) datos.push({ px, blob: px >= 256 ? buf : await entradaBmp(buf) });
  const cab = Buffer.alloc(6 + 16 * datos.length);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(datos.length, 4);
  let off = cab.length;
  datos.forEach(({ px, blob }, i) => {
    const o = 6 + 16 * i;
    cab[o] = px >= 256 ? 0 : px; cab[o + 1] = px >= 256 ? 0 : px;
    cab.writeUInt16LE(1, o + 4); cab.writeUInt16LE(32, o + 6);
    cab.writeUInt32LE(blob.length, o + 8); cab.writeUInt32LE(off, o + 12);
    off += blob.length;
  });
  writeFileSync(ruta, Buffer.concat([cab, ...datos.map((d) => d.blob)]));
}

export function leerIco(ruta) {
  const b = readFileSync(ruta);
  const n = b.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = 6 + 16 * i;
    const off = b.readUInt32LE(o + 12);
    out.push({ px: b[o] || 256, bpp: b.readUInt16LE(o + 6), tipo: b.readUInt32BE(off) === 0x89504e47 ? 'PNG' : 'BMP' });
  }
  return out;
}

function guardar(ruta, buf) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, buf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de recursos: ruta → especificación (sirve para generar y verificar)
// ─────────────────────────────────────────────────────────────────────────────
const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// Foreground adaptativo: lienzo 108 dp, zona visible 72 dp, zona segura 66 dp.
// «GO» ocupa 0,52 del cuadrado visible (72 dp) = 0,347 del lienzo: dentro de los 66 dp.
const ANCHO_ADAPTATIVO = (0.52 * 72) / 108;
// Maskable: la zona segura es un círculo del 80 %. «GO» a 0,52 × 0,82 del lado
// para que, con la máscara típica (squircle ≈ 82 %), se vea como el isotipo.
const ANCHO_MASKABLE = 0.52 * 0.82;
const IOS_APPICON = [
  // [idiom, size(pt), escala]
  ['iphone', 20, 2], ['iphone', 20, 3], ['iphone', 29, 2], ['iphone', 29, 3],
  ['iphone', 40, 2], ['iphone', 40, 3], ['iphone', 60, 2], ['iphone', 60, 3],
  ['ipad', 20, 1], ['ipad', 20, 2], ['ipad', 29, 1], ['ipad', 29, 2],
  ['ipad', 40, 1], ['ipad', 40, 2], ['ipad', 76, 1], ['ipad', 76, 2], ['ipad', 83.5, 2],
  ['ios-marketing', 1024, 1],
];
// Mismos tamaños que traía el proyecto Android (mobile/android) antes del cambio.
const SPLASH_ANDROID = {
  'drawable': [480, 800],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [1080, 1920], 'drawable-port-xxxhdpi': [1440, 2560],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1920, 1080], 'drawable-land-xxxhdpi': [2560, 1440],
};

/** Lista de { ruta, w, h, alfa, formato } para verificar. */
function catalogo() {
  const r = [];
  const add = (ruta, w, h = w, alfa = true, formato = 'png') => r.push({ ruta, w, h, alfa, formato });
  add('public/icon.svg', 1024, 1024, true, 'svg');
  add('public/favicon-16x16.png', 16); add('public/favicon-32x32.png', 32);
  add('public/apple-touch-icon.png', 180, 180, false);
  add('public/icon-192x192.png', 192); add('public/icon-512x512.png', 512);
  add('public/icon-maskable-192x192.png', 192, 192, false); add('public/icon-maskable-512x512.png', 512, 512, false);
  add('public/badge-96x96.png', 96);
  const A = RES_ANDROID;
  for (const [d, f] of Object.entries(DENSIDADES)) {
    add(`${A}/mipmap-${d}/ic_launcher.png`, 48 * f);
    add(`${A}/mipmap-${d}/ic_launcher_round.png`, 48 * f);
    add(`${A}/mipmap-${d}/ic_launcher_foreground.png`, 108 * f);
    add(`${A}/mipmap-${d}/ic_launcher_monochrome.png`, 108 * f);
    add(`${A}/drawable-${d}/ic_stat_goadmin.png`, 24 * f);
  }
  for (const [dir, [w, h]] of Object.entries(SPLASH_ANDROID)) add(`${A}/${dir}/splash.png`, w, h, false);
  add('mobile/store/google-play/icon-512.png', 512);
  const I = `${RES_MOVIL}/ios`;
  for (const [, pt, s] of IOS_APPICON) { const px = Math.round(pt * s); add(`${I}/AppIcon.appiconset/AppIcon-${px}.png`, px, px, false); }
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) add(`${I}/Splash.imageset/${n}`, 2732, 2732, false);
  // Entradas de @capacitor/assets (por si se prefiere regenerar con su CLI).
  add(`${RES_MOVIL}/icon-only.png`, 1024, 1024, false);
  add(`${RES_MOVIL}/icon-foreground.png`, 1024);
  add(`${RES_MOVIL}/icon-background.png`, 1024, 1024, false);
  add(`${RES_MOVIL}/splash.png`, 2732, 2732, false);
  add(`${RES_MOVIL}/splash-dark.png`, 2732, 2732, false);
  return r;
}

async function splash(w, h, fondo) {
  const lado = Math.round(Math.min(w, h) * 0.24);
  const iso = await raster(svgIsotipo(), lado);
  return sharp({ create: { width: w, height: h, channels: 3, background: fondo } })
    .composite([{ input: iso, left: Math.round((w - lado) / 2), top: Math.round((h - lado) / 2) }])
    .removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

async function generar() {
  const vistos = {}; // para la hoja de contacto
  const g = (rel, buf) => { guardar(join(raiz, rel), buf); vistos[rel] = buf; };

  // 1. Vector maestro
  const maestro = svgIsotipo();
  writeFileSync(join(PUBLIC, 'icon.svg'), maestro + '\n');

  // 2. Web / PWA
  const peq = {};
  for (const px of [16, 32, 48]) peq[px] = await raster(svgIsotipo({ px }), px);
  g('public/favicon-16x16.png', peq[16]);
  g('public/favicon-32x32.png', peq[32]);
  await escribirIco(join(PUBLIC, 'favicon.ico'), [16, 32, 48].map((px) => ({ px, buf: peq[px] })));
  vistos['public/favicon.ico (48)'] = peq[48];
  g('public/apple-touch-icon.png', await raster(svgIsotipo({ forma: 'completo' }), 180, { alfa: false }));
  g('public/icon-192x192.png', await raster(maestro, 192));
  g('public/icon-512x512.png', await raster(maestro, 512));
  const maskable = svgIsotipo({ forma: 'completo', ancho: ANCHO_MASKABLE });
  g('public/icon-maskable-192x192.png', await raster(maskable, 192, { alfa: false }));
  g('public/icon-maskable-512x512.png', await raster(maskable, 512, { alfa: false }));
  // Badge: Android solo usa el alfa; figura blanca con «GO» calado.
  g('public/badge-96x96.png', await raster(svgIsotipo({ silueta: true, ancho: 0.58, escalaForma: 0.84 }), 96));

  // 3. Android (Capacitor, proyecto nativo en mobile/android)
  const A = RES_ANDROID;
  const fg = svgIsotipo({ forma: 'nada', ancho: ANCHO_ADAPTATIVO });
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${L}" width="${L}" height="${L}"><rect width="${L}" height="${L}" fill="${AZUL_GO}"/></svg>`;
  const redondo = svgIsotipo({ forma: 'circulo', ancho: 0.52 * 0.9 });
  const stat = svgIsotipo({ silueta: true, ancho: 0.58, escalaForma: 0.84 });
  for (const [d, f] of Object.entries(DENSIDADES)) {
    g(`${A}/mipmap-${d}/ic_launcher.png`, await raster(svgIsotipo({ escalaForma: 0.92 }), 48 * f));
    g(`${A}/mipmap-${d}/ic_launcher_round.png`, await raster(redondo, 48 * f));
    g(`${A}/mipmap-${d}/ic_launcher_foreground.png`, await raster(fg, 108 * f));
    g(`${A}/mipmap-${d}/ic_launcher_monochrome.png`, await raster(fg, 108 * f));
    g(`${A}/drawable-${d}/ic_stat_goadmin.png`, await raster(stat, 24 * f));
  }
  const adaptativo = (fore) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/${fore}"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  guardar(join(raiz, A, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptativo('ic_launcher_foreground'));
  guardar(join(raiz, A, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptativo('ic_launcher_foreground'));
  guardar(join(raiz, A, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Azul GO (manual de marca v2.0) -->
    <color name="ic_launcher_background">${AZUL_GO}</color>
</resources>
`);
  for (const [dir, [w, h]] of Object.entries(SPLASH_ANDROID)) g(`${A}/${dir}/splash.png`, await splash(w, h, FONDO_SUAVE));

  // Google Play: 512, cuadrado completo (Play aplica su propia máscara).
  g('mobile/store/google-play/icon-512.png', await raster(svgIsotipo({ forma: 'completo' }), 512));

  // 4. iOS: sangrado total y sin alfa (App Store rechaza el 1024 con alfa). No hay
  // proyecto Xcode todavía: se deja listo para copiar a ios/App/App/Assets.xcassets.
  const I = `${RES_MOVIL}/ios`;
  const completo = svgIsotipo({ forma: 'completo' });
  const hechos = new Set();
  const imagenes = [];
  for (const [idiom, pt, s] of IOS_APPICON) {
    const px = Math.round(pt * s);
    const nombre = `AppIcon-${px}.png`;
    if (!hechos.has(px)) { g(`${I}/AppIcon.appiconset/${nombre}`, await raster(completo, px, { alfa: false })); hechos.add(px); }
    imagenes.push({ filename: nombre, idiom, scale: `${s}x`, size: `${pt}x${pt}` });
  }
  guardar(join(raiz, I, 'AppIcon.appiconset', 'Contents.json'), JSON.stringify({ images: imagenes, info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
  const sp = await splash(2732, 2732, FONDO_SUAVE);
  const spNames = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
  for (const n of spNames) g(`${I}/Splash.imageset/${n}`, sp);
  guardar(join(raiz, I, 'Splash.imageset', 'Contents.json'), JSON.stringify({
    images: spNames.map((filename, i) => ({ idiom: 'universal', filename, scale: `${i + 1}x` })),
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');

  // 5. Entradas de @capacitor/assets (`npx @capacitor/assets generate` desde mobile/)
  const C = RES_MOVIL;
  g(`${C}/icon-only.png`, await raster(completo, 1024, { alfa: false }));
  g(`${C}/icon-foreground.png`, await raster(fg, 1024));
  g(`${C}/icon-background.png`, await raster(bg, 1024, { alfa: false }));
  g(`${C}/splash.png`, sp);
  g(`${C}/splash-dark.png`, await splash(2732, 2732, TINTA));

  await hojaDeContacto(vistos);
}

// ── Hoja de contacto ──
async function etiqueta(texto) {
  return sharp({ text: { text: texto, fontfile: FUENTE_ETIQUETA, font: 'Inter Medium', dpi: 110, rgba: true } }).png().toBuffer()
    .then((b) => sharp(b).tint(PIZARRA).png().toBuffer())
    .catch(async () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="260" height="18"><text x="0" y="14" font-family="Segoe UI, sans-serif" font-size="13" fill="${PIZARRA}">${texto}</text></svg>`)).png().toBuffer());
}

async function hojaDeContacto(vistos) {
  const sel = [
    ['favicon 16', 'public/favicon-16x16.png', 16], ['favicon 32', 'public/favicon-32x32.png', 32], ['favicon.ico 48', 'public/favicon.ico (48)', 48],
    ['favicon 16 ×4', 'public/favicon-16x16.png', 64], ['favicon 32 ×3', 'public/favicon-32x32.png', 96],
    ['apple-touch 180', 'public/apple-touch-icon.png', 180], ['PWA any 192', 'public/icon-192x192.png', 192],
    ['PWA maskable 192', 'public/icon-maskable-192x192.png', 192], ['badge 96 (alfa)', 'public/badge-96x96.png', 96],
    ['Android ic_launcher', `${RES_ANDROID}/mipmap-xxxhdpi/ic_launcher.png`, 192],
    ['Android round', `${RES_ANDROID}/mipmap-xxxhdpi/ic_launcher_round.png`, 192],
    ['Android adaptativo', '__adaptativo', 192],
    ['Android ic_stat', `${RES_ANDROID}/drawable-xxxhdpi/ic_stat_goadmin.png`, 96],
    ['iOS AppIcon 1024', `${RES_MOVIL}/ios/AppIcon.appiconset/AppIcon-1024.png`, 192],
    ['Splash claro', `${RES_MOVIL}/splash.png`, 192], ['Splash oscuro', `${RES_MOVIL}/splash-dark.png`, 192],
  ];
  // Adaptativo simulado: fondo + foreground recortados con la máscara squircle de 72/108.
  const fgBuf = vistos[`${RES_ANDROID}/mipmap-xxxhdpi/ic_launcher_foreground.png`];
  const recorte = Math.round(432 * 72 / 108), m = Math.round((432 - recorte) / 2);
  // sharp solo aplica el último composite() de una cadena: se materializa entre pasos.
  const lleno = await sharp({ create: { width: 432, height: 432, channels: 4, background: AZUL_GO } })
    .composite([{ input: fgBuf }]).png().toBuffer();
  const adapt = await sharp(await sharp(lleno).extract({ left: m, top: m, width: recorte, height: recorte }).png().toBuffer())
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${recorte}" height="${recorte}"><circle cx="${recorte / 2}" cy="${recorte / 2}" r="${recorte / 2}"/></svg>`), blend: 'dest-in' }])
    .png().toBuffer();
  vistos.__adaptativo = adapt;

  const pad = 20, celda = 232;
  const tiles = [];
  for (const [nombre, clave, px] of sel) {
    let buf = vistos[clave];
    const esSilueta = /badge|ic_stat/.test(clave);
    buf = await sharp(buf).resize(px, px, { kernel: px > 48 && /16x16|32x32/.test(clave) ? 'nearest' : 'lanczos3' }).png().toBuffer();
    const fondoTile = esSilueta ? '#1E293B' : FONDO_SUAVE;
    const et = await etiqueta(nombre);
    const meta = await sharp(et).metadata();
    const tile = await sharp({ create: { width: celda, height: celda + 30, channels: 4, background: fondoTile } })
      .composite([
        { input: buf, left: Math.round((celda - px) / 2), top: Math.round((celda - px) / 2) },
        { input: await sharp({ create: { width: celda, height: 30, channels: 4, background: BLANCO } }).composite([{ input: et, left: Math.max(0, Math.round((celda - meta.width) / 2)), top: Math.max(0, Math.round((30 - meta.height) / 2)) }]).png().toBuffer(), left: 0, top: celda },
      ]).png().toBuffer();
    tiles.push(tile);
  }
  const cols = 4, filas = Math.ceil(tiles.length / cols);
  const W = cols * (celda + pad) + pad, H = filas * (celda + 30 + pad) + pad;
  mkdirSync(dirname(HOJA), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#E2E8F0' } })
    .composite(tiles.map((t, i) => ({ input: t, left: pad + (i % cols) * (celda + pad), top: pad + Math.floor(i / cols) * (celda + 30 + pad) })))
    .png({ compressionLevel: 9 }).toFile(HOJA);
}

// ── Verificación ──
async function verificar() {
  let fallos = 0;
  const mal = (m) => { fallos++; console.error('  ✗', m); };
  for (const { ruta, w, h, alfa, formato } of catalogo()) {
    const abs = join(raiz, ruta);
    if (!existsSync(abs)) { mal(`${ruta}: no existe`); continue; }
    const md = await sharp(abs).metadata();
    if (md.format !== formato) mal(`${ruta}: formato ${md.format}, se esperaba ${formato}`);
    if (md.width !== w || md.height !== h) mal(`${ruta}: ${md.width}×${md.height}, se esperaba ${w}×${h}`);
    if (formato === 'png' && !alfa && md.hasAlpha) mal(`${ruta}: tiene canal alfa y no debe`);
    if (formato === 'png' && alfa && !md.hasAlpha) mal(`${ruta}: sin canal alfa`);
  }
  // Silueta monocroma: todos los píxeles visibles son blancos.
  for (const ruta of ['public/badge-96x96.png', `${RES_ANDROID}/drawable-xxxhdpi/ic_stat_goadmin.png`]) {
    const { data } = await sharp(join(raiz, ruta)).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) { mal(`${ruta}: píxel no blanco`); break; }
  }
  const ico = leerIco(join(PUBLIC, 'favicon.ico'));
  const tamanos = ico.map((e) => e.px).join(',');
  if (tamanos !== '16,32,48' || ico.some((e) => e.bpp !== 32)) mal(`public/favicon.ico: ${JSON.stringify(ico)}`);
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8'));
  for (const ic of manifest.icons) if (!existsSync(join(PUBLIC, ic.src))) mal(`manifest: ${ic.src} no existe`);
  console.log(`favicon.ico: ${JSON.stringify(ico)}`);
  console.log(`${catalogo().length} recursos revisados, ${fallos} fallos`);
  if (fallos) process.exit(1);
}

if (process.argv.includes('--verificar')) {
  await verificar();
} else {
  await generar();
  console.log('Generado. Hoja de contacto:', relative(raiz, HOJA));
  await verificar();
}
