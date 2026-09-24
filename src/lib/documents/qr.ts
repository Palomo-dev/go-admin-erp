/**
 * Código QR local para los documentos (modo byte, corrección M o L).
 *
 * Por qué no `api.qrserver.com`: las plantillas viejas pedían la imagen a un
 * tercero con el número, el total y el nombre del comercio en la URL (fuga de
 * datos), y sin red el documento salía sin QR. Por qué no `qrcode.react`: es un
 * componente React y en un route handler (`react-server`) no hay
 * `react-dom/server` para pintarlo. Así que el motor lleva su propio
 * codificador, puro y sin dependencias, que devuelve un `<svg>`.
 *
 * Implementación del estándar ISO/IEC 18004 siguiendo el algoritmo de
 * referencia de Project Nayuki (MIT): segmento de bytes UTF-8, Reed-Solomon
 * sobre GF(256) con el polinomio 0x11D, patrones de función, máscara con la
 * menor penalización. Los tests lo decodifican con `jsqr` para comprobarlo.
 */

type NivelCorreccion = 'L' | 'M';

/** Índice de las tablas y bits de formato por nivel. */
const NIVEL: Record<NivelCorreccion, { indice: number; bitsFormato: number }> = {
  L: { indice: 0, bitsFormato: 1 },
  M: { indice: 1, bitsFormato: 0 },
};

// Tablas del estándar (versión 1..40; el índice 0 no se usa).
const ECC_POR_BLOQUE: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
];
const BLOQUES: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
];

/** Texto más largo que se acepta (bytes UTF-8). Un QR de documento no necesita más. */
export const QR_MAX_BYTES = 1200;

export interface MatrizQr {
  tamano: number;
  /** `modulos[y][x]` = true si el módulo es oscuro. */
  modulos: boolean[][];
}

function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function modulosCrudos(version: number): number {
  let resultado = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alineacion = Math.floor(version / 7) + 2;
    resultado -= (25 * alineacion - 10) * alineacion - 55;
    if (version >= 7) resultado -= 36;
  }
  return resultado;
}

function codewordsDeDatos(version: number, nivel: number): number {
  return Math.floor(modulosCrudos(version) / 8) - ECC_POR_BLOQUE[nivel][version] * BLOQUES[nivel][version];
}

function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisorRs(grado: number): number[] {
  const resultado = new Array<number>(grado).fill(0);
  resultado[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < resultado.length; j++) {
      resultado[j] = multiplicar(resultado[j], raiz);
      if (j + 1 < resultado.length) resultado[j] ^= resultado[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return resultado;
}

function restoRs(datos: number[], divisor: number[]): number[] {
  const resultado = new Array<number>(divisor.length).fill(0);
  for (const b of datos) {
    const factor = b ^ (resultado.shift() as number);
    resultado.push(0);
    divisor.forEach((coef, i) => {
      resultado[i] ^= multiplicar(coef, factor);
    });
  }
  return resultado;
}

function utf8(texto: string): number[] {
  return Array.from(new TextEncoder().encode(texto));
}

class ConstructorQr {
  readonly tamano: number;
  readonly modulos: boolean[][];
  private readonly esFuncion: boolean[][];

  constructor(private readonly version: number, private readonly nivel: NivelCorreccion, codewords: number[]) {
    this.tamano = version * 4 + 17;
    this.modulos = Array.from({ length: this.tamano }, () => new Array<boolean>(this.tamano).fill(false));
    this.esFuncion = Array.from({ length: this.tamano }, () => new Array<boolean>(this.tamano).fill(false));

    this.dibujarPatronesDeFuncion();
    this.dibujarCodewords(this.agregarEccEIntercalar(codewords));

    let mejor = 0;
    let menor = Infinity;
    for (let mascara = 0; mascara < 8; mascara++) {
      this.aplicarMascara(mascara);
      this.dibujarBitsDeFormato(mascara);
      const penalizacion = this.penalizacion();
      if (penalizacion < menor) {
        menor = penalizacion;
        mejor = mascara;
      }
      this.aplicarMascara(mascara); // deshace (XOR)
    }
    this.aplicarMascara(mejor);
    this.dibujarBitsDeFormato(mejor);
  }

  private poner(x: number, y: number, oscuro: boolean): void {
    this.modulos[y][x] = oscuro;
    this.esFuncion[y][x] = true;
  }

  private dibujarPatronesDeFuncion(): void {
    for (let i = 0; i < this.tamano; i++) {
      this.poner(6, i, i % 2 === 0);
      this.poner(i, 6, i % 2 === 0);
    }
    this.dibujarBuscador(3, 3);
    this.dibujarBuscador(this.tamano - 4, 3);
    this.dibujarBuscador(3, this.tamano - 4);

    const posiciones = this.posicionesDeAlineacion();
    const n = posiciones.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.dibujarAlineacion(posiciones[i], posiciones[j]);
      }
    }
    this.dibujarBitsDeFormato(0);
    this.dibujarVersion();
  }

  private dibujarBuscador(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distancia = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.tamano && yy >= 0 && yy < this.tamano) {
          this.poner(xx, yy, distancia !== 2 && distancia !== 4);
        }
      }
    }
  }

  private dibujarAlineacion(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.poner(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private posicionesDeAlineacion(): number[] {
    if (this.version === 1) return [];
    const cantidad = Math.floor(this.version / 7) + 2;
    const paso = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (cantidad * 2 - 2)) * 2;
    const resultado = [6];
    for (let pos = this.tamano - 7; resultado.length < cantidad; pos -= paso) resultado.splice(1, 0, pos);
    return resultado;
  }

  private dibujarBitsDeFormato(mascara: number): void {
    const datos = (NIVEL[this.nivel].bitsFormato << 3) | mascara;
    let resto = datos;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const bits = ((datos << 10) | resto) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.poner(8, i, bit(bits, i));
    this.poner(8, 7, bit(bits, 6));
    this.poner(8, 8, bit(bits, 7));
    this.poner(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.poner(14 - i, 8, bit(bits, i));

    for (let i = 0; i < 8; i++) this.poner(this.tamano - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.poner(8, this.tamano - 15 + i, bit(bits, i));
    this.poner(8, this.tamano - 8, true);
  }

  private dibujarVersion(): void {
    if (this.version < 7) return;
    let resto = this.version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (this.version << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const oscuro = bit(bits, i);
      const a = this.tamano - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.poner(a, b, oscuro);
      this.poner(b, a, oscuro);
    }
  }

  private agregarEccEIntercalar(datos: number[]): number[] {
    const nivel = NIVEL[this.nivel].indice;
    const cantidadBloques = BLOQUES[nivel][this.version];
    const eccPorBloque = ECC_POR_BLOQUE[nivel][this.version];
    const crudos = Math.floor(modulosCrudos(this.version) / 8);
    const cortos = cantidadBloques - (crudos % cantidadBloques);
    const largoCorto = Math.floor(crudos / cantidadBloques);

    const bloques: number[][] = [];
    const divisor = divisorRs(eccPorBloque);
    for (let i = 0, k = 0; i < cantidadBloques; i++) {
      const dat = datos.slice(k, k + largoCorto - eccPorBloque + (i < cortos ? 0 : 1));
      k += dat.length;
      const ecc = restoRs(dat, divisor);
      if (i < cortos) dat.push(0);
      bloques.push(dat.concat(ecc));
    }

    const resultado: number[] = [];
    for (let i = 0; i < bloques[0].length; i++) {
      bloques.forEach((bloque, j) => {
        if (i !== largoCorto - eccPorBloque || j >= cortos) resultado.push(bloque[i]);
      });
    }
    return resultado;
  }

  private dibujarCodewords(datos: number[]): void {
    let i = 0;
    for (let derecha = this.tamano - 1; derecha >= 1; derecha -= 2) {
      if (derecha === 6) derecha = 5;
      for (let vertical = 0; vertical < this.tamano; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = derecha - j;
          const haciaArriba = ((derecha + 1) & 2) === 0;
          const y = haciaArriba ? this.tamano - 1 - vertical : vertical;
          if (!this.esFuncion[y][x] && i < datos.length * 8) {
            this.modulos[y][x] = bit(datos[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private aplicarMascara(mascara: number): void {
    for (let y = 0; y < this.tamano; y++) {
      for (let x = 0; x < this.tamano; x++) {
        let invertir: boolean;
        switch (mascara) {
          case 0: invertir = (x + y) % 2 === 0; break;
          case 1: invertir = y % 2 === 0; break;
          case 2: invertir = x % 3 === 0; break;
          case 3: invertir = (x + y) % 3 === 0; break;
          case 4: invertir = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invertir = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invertir = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invertir = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!this.esFuncion[y][x] && invertir) this.modulos[y][x] = !this.modulos[y][x];
      }
    }
  }

  private penalizacion(): number {
    const n = this.tamano;
    let resultado = 0;
    const contarPatrones = (h: number[]): number => {
      const m = h[1];
      const nucleo = m > 0 && h[2] === m && h[3] === m * 3 && h[4] === m && h[5] === m;
      return (nucleo && h[0] >= m * 4 && h[6] >= m ? 1 : 0) + (nucleo && h[6] >= m * 4 && h[0] >= m ? 1 : 0);
    };
    const agregar = (largo: number, h: number[]): void => {
      if (h[0] === 0) largo += n;
      h.pop();
      h.unshift(largo);
    };
    const terminar = (color: boolean, largo: number, h: number[]): number => {
      if (color) {
        agregar(largo, h);
        largo = 0;
      }
      agregar(largo + n, h);
      return contarPatrones(h);
    };
    const recorrer = (leer: (a: number, b: number) => boolean): void => {
      for (let a = 0; a < n; a++) {
        let color = false;
        let largo = 0;
        const historia = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < n; b++) {
          if (leer(a, b) === color) {
            largo++;
            if (largo === 5) resultado += 3;
            else if (largo > 5) resultado++;
          } else {
            agregar(largo, historia);
            if (!color) resultado += contarPatrones(historia) * 40;
            color = leer(a, b);
            largo = 1;
          }
        }
        resultado += terminar(color, largo, historia) * 40;
      }
    };
    recorrer((y, x) => this.modulos[y][x]);
    recorrer((x, y) => this.modulos[y][x]);

    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = this.modulos[y][x];
        if (c === this.modulos[y][x + 1] && c === this.modulos[y + 1][x] && c === this.modulos[y + 1][x + 1]) resultado += 3;
      }
    }
    let oscuros = 0;
    for (const fila of this.modulos) for (const m of fila) if (m) oscuros++;
    const total = n * n;
    const k = Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1;
    resultado += k * 10;
    return resultado;
  }
}

/** Codifica `texto` (UTF-8, modo byte) en la versión más pequeña que lo admite. */
export function codificarQr(texto: string, nivel: NivelCorreccion = 'M'): MatrizQr {
  const bytes = utf8(texto);
  if (bytes.length > QR_MAX_BYTES) throw new Error('Texto demasiado largo para el QR del documento');
  const indice = NIVEL[nivel].indice;

  let version = 1;
  for (; version <= 40; version++) {
    const bitsConteo = version <= 9 ? 8 : 16;
    if (4 + bitsConteo + bytes.length * 8 <= codewordsDeDatos(version, indice) * 8) break;
  }
  if (version > 40) throw new Error('Texto demasiado largo para el QR del documento');

  const capacidad = codewordsDeDatos(version, indice) * 8;
  const bits: number[] = [];
  const agregar = (valor: number, largo: number) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  agregar(0b0100, 4);
  agregar(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) agregar(b, 8);
  agregar(0, Math.min(4, capacidad - bits.length));
  agregar(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) agregar(relleno, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  const qr = new ConstructorQr(version, nivel, codewords);
  return { tamano: qr.tamano, modulos: qr.modulos };
}

/**
 * `<svg>` del QR con zona silenciosa de 4 módulos, negro sobre blanco. El
 * tamaño en pantalla lo da el CSS (`width`/`height` del contenedor).
 */
export function qrSvg(texto: string, opciones: { titulo?: string; nivel?: NivelCorreccion } = {}): string {
  const { tamano, modulos } = codificarQr(texto, opciones.nivel ?? 'M');
  const borde = 4;
  const lado = tamano + borde * 2;
  let camino = '';
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      if (modulos[y][x]) camino += `M${x + borde} ${y + borde}h1v1h-1z`;
    }
  }
  const titulo = opciones.titulo
    ? `<title>${opciones.titulo.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)}</title>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img">${titulo}<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${camino}" fill="#000"/></svg>`;
}
