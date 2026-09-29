/**
 * Posiciones del cielo del acceso, tomadas de Figma (`Ilustración/Cielo`
 * 1069:665724, marco de 720 × 900). Se pintan en porcentaje para que el cielo
 * se estire a cualquier pantalla como en `EscenaAcceso`.
 *
 * [x, y, lado en px]
 */
export type PuntoCielo = readonly [number, number, number];

export const ANCHO_CIELO = 720;
export const ALTO_CIELO = 900;

/** Día: 26 estrellas pequeñas, blancas al 42 %. */
export const ESTRELLAS_DIA: readonly PuntoCielo[] = [
  [659, 255, 3], [522, 469, 3], [538, 664, 3], [490, 560, 2], [173, 329, 2], [500, 47, 2], [335, 812, 2],
  [88, 451, 2], [493, 567, 2], [653, 799, 2], [240, 737, 3], [109, 262, 3], [211, 825, 2], [522, 773, 2],
  [196, 493, 3], [302, 170, 2], [39, 322, 2], [476, 813, 3], [119, 357, 2], [261, 373, 3], [381, 540, 3],
  [649, 403, 3], [455, 558, 2], [362, 606, 2], [284, 623, 2], [420, 309, 3],
];

/** Noche: 70 estrellas, blancas al 72 %, titilan. */
export const ESTRELLAS_NOCHE: readonly PuntoCielo[] = [
  [508, 737, 3], [606, 548, 1], [108, 883, 1], [322, 623, 1], [72, 882, 1], [664, 588, 2], [0, 762, 3],
  [359, 366, 3], [597, 814, 3], [407, 239, 1], [633, 671, 1], [283, 711, 1], [151, 449, 1], [691, 189, 1],
  [411, 601, 3], [233, 600, 3], [545, 501, 1], [592, 378, 2], [230, 859, 2], [431, 788, 1], [167, 583, 2],
  [545, 564, 2], [206, 165, 1], [711, 494, 2], [703, 505, 3], [714, 320, 1], [286, 883, 1], [525, 285, 3],
  [309, 385, 2], [300, 652, 2], [88, 848, 1], [548, 261, 3], [408, 35, 2], [163, 173, 2], [252, 115, 3],
  [683, 768, 2], [29, 445, 3], [711, 602, 1], [663, 702, 2], [246, 249, 1], [354, 572, 2], [129, 580, 2],
  [315, 199, 2], [44, 575, 3], [390, 758, 1], [505, 460, 2], [78, 828, 3], [542, 162, 2], [630, 463, 1],
  [338, 715, 3], [180, 171, 1], [413, 721, 3], [7, 330, 1], [516, 857, 1], [596, 365, 3], [545, 884, 3],
  [274, 446, 2], [348, 269, 1], [132, 576, 2], [591, 21, 1], [255, 609, 2], [656, 230, 1], [580, 766, 2],
  [572, 94, 1], [513, 70, 2], [537, 886, 1], [9, 7, 2], [38, 408, 3], [308, 782, 3], [625, 194, 1],
];

/** Día: nubes al 35 % [x, y, ancho]. */
export const NUBES: readonly PuntoCielo[] = [
  [250, 40, 90], [600, 470, 70], [580, 640, 110], [20, 560, 80], [60, 820, 70], [600, 812, 100],
];

/** Noche: estrellas de trazo [x, y, lado]. */
export const ESTRELLAS_TRAZO: readonly PuntoCielo[] = [
  [300, 96, 30], [640, 420, 22], [60, 600, 18],
];

/** Posición en porcentaje del marco de Figma. */
export function enPorcentaje([x, y]: PuntoCielo): { left: string; top: string } {
  return { left: `${((x / ANCHO_CIELO) * 100).toFixed(2)}%`, top: `${((y / ALTO_CIELO) * 100).toFixed(2)}%` };
}
