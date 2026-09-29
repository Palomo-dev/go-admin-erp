/**
 * Cuerpos de `POST /api/membresias/importar/{clases,reservas}` (§13). El navegador envía las filas
 * ya normalizadas por `importacionCsv.ts`; aquí solo se acota la forma y el tamaño (la RPC vuelve a
 * validar cada valor). Nunca llevan organización: sale de la sesión.
 */
import { z } from 'zod';
import { MAX_FILAS_IMPORTACION } from './importacionCsv';

const txt = (max: number) => z.string().trim().max(max).nullable().optional();
const entero = z.number().int().min(0).max(100000).nullable().optional();
const fila = z.number().int().min(1).max(1_000_000);

export const esquemaFilaClase = z
  .object({
    fila,
    titulo: txt(200),
    tipo: txt(60),
    sede: txt(120),
    instructor: txt(254),
    fecha: txt(10),
    hora: txt(5),
    duracion: entero,
    capacidad: entero,
    sala: txt(120),
    nivel: txt(20),
    estado: txt(20),
    descripcion: txt(2000),
    equipo: txt(500),
  })
  .strict();

export const esquemaFilaReserva = z
  .object({
    fila,
    documento: txt(40),
    correo: txt(254),
    clase: txt(200),
    fecha: txt(10),
    hora: txt(5),
    sede: txt(120),
    estado: txt(20),
    origen: txt(20),
    notas: txt(1000),
  })
  .strict();

export const esquemaImportarClases = z.object({
  filas: z.array(esquemaFilaClase).min(1).max(MAX_FILAS_IMPORTACION),
  soloValidar: z.boolean().optional().default(false),
});

export const esquemaImportarReservas = z.object({
  filas: z.array(esquemaFilaReserva).min(1).max(MAX_FILAS_IMPORTACION),
  soloValidar: z.boolean().optional().default(false),
});
