'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Users, Clock, Save, Lock, Unlock, ZoomIn, ZoomOut, Maximize2, Crosshair, User as UserIcon, DollarSign, ChefHat } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { TableWithSession } from './types';

interface MesasFloorMapProps {
  mesas: TableWithSession[];
  onSavePositions: (positions: { id: string; position_x: number; position_y: number }[]) => Promise<void>;
  onMesaClick: (mesa: TableWithSession) => void;
}

const TABLE_W = 120;
const TABLE_H = 80;
const GRID_SIZE = 20;
// Tamaño base del plano: amplio de entrada y se expande automáticamente
// si se posicionan mesas cerca del borde (efecto "plano ilimitado").
const BASE_CANVAS_W = 3000;
const BASE_CANVAS_H = 2000;
const CANVAS_GROWTH_MARGIN = 400;

// Paleta para distinguir zonas visualmente en el plano
const ZONE_COLORS = ['#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EC4899', '#EAB308', '#06B6D4', '#84CC16'];

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function hashZoneColor(zone: string): string {
  let hash = 0;
  for (let i = 0; i < zone.length; i++) hash = (hash * 31 + zone.charCodeAt(i)) >>> 0;
  return ZONE_COLORS[hash % ZONE_COLORS.length];
}

// Forma y tamaño proporcional a la capacidad de la mesa: mesas chicas y
// redondas para 2 personas, rectángulos que crecen con la capacidad.
type MesaShape = 'circle' | 'rect';
function getMesaSize(capacity: number): { w: number; h: number; shape: MesaShape } {
  if (capacity <= 2) return { w: 70, h: 70, shape: 'circle' };
  if (capacity <= 4) return { w: 110, h: 80, shape: 'rect' };
  if (capacity <= 6) return { w: 130, h: 90, shape: 'rect' };
  return { w: 150, h: 100, shape: 'rect' };
}

const VIEW_STORAGE_KEY = 'pos_mesas_floor_map_view';

function loadStoredView(): { zoom: number; panOffset: { x: number; y: number } } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.zoom === 'number' && parsed.panOffset) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function MesasFloorMap({ mesas, onSavePositions, onMesaClick }: MesasFloorMapProps) {
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredMesaId, setHoveredMesaId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Zoom y pan persistidos en localStorage para no perder la vista al recargar
  const storedView = useRef(loadStoredView());
  const [zoom, setZoom] = useState(storedView.current?.zoom ?? 1);
  const [panOffset, setPanOffset] = useState(storedView.current?.panOffset ?? { x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ zoom, panOffset }));
    } catch {
      // localStorage no disponible; se ignora
    }
  }, [zoom, panOffset]);

  // Inicializar posiciones desde las mesas
  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    mesas.forEach((mesa, idx) => {
      pos[mesa.id] = {
        x: mesa.position_x ?? (60 + (idx % 6) * (TABLE_W + 30)),
        y: mesa.position_y ?? (60 + Math.floor(idx / 6) * (TABLE_H + 40)),
      };
    });
    setPositions(pos);
    setHasChanges(false);
  }, [mesas]);

  const getPos = (id: string) => positions[id] || { x: 0, y: 0 };

  // El plano crece automáticamente si hay mesas cerca del borde actual,
  // dando la sensación de un lienzo ilimitado en vez de uno fijo.
  const canvasSize = useMemo(() => {
    let maxX = BASE_CANVAS_W;
    let maxY = BASE_CANVAS_H;
    mesas.forEach((m) => {
      const p = getPos(m.id);
      const size = getMesaSize(m.capacity);
      maxX = Math.max(maxX, p.x + size.w + CANVAS_GROWTH_MARGIN);
      maxY = Math.max(maxY, p.y + size.h + CANVAS_GROWTH_MARGIN);
    });
    return { w: maxX, h: maxY };
  }, [positions, mesas]);

  // Bounding box de cada zona (para encerrarlas visualmente en el plano)
  const zoneBounds = useMemo(() => {
    const zonas = Array.from(new Set(mesas.map((m) => m.zone).filter(Boolean))) as string[];
    const PADDING = 24;
    return zonas
      .map((zone) => {
        const mesasZona = mesas.filter((m) => m.zone === zone);
        const pts = mesasZona
          .map((m) => ({ id: m.id, pos: getPos(m.id), size: getMesaSize(m.capacity) }))
          .filter((p) => positions[p.id] !== undefined);
        if (pts.length === 0) return null;
        const minX = Math.min(...pts.map((p) => p.pos.x)) - PADDING;
        const minY = Math.min(...pts.map((p) => p.pos.y)) - PADDING - 24; // espacio para etiqueta
        const maxX = Math.max(...pts.map((p) => p.pos.x + p.size.w)) + PADDING;
        const maxY = Math.max(...pts.map((p) => p.pos.y + p.size.h)) + PADDING;
        return {
          zone,
          color: hashZoneColor(zone),
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
        };
      })
      .filter((z): z is { zone: string; color: string; x: number; y: number; w: number; h: number } => z !== null);
  }, [mesas, positions]);

  // --- Drag handlers ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mesaId: string) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = getPos(mesaId);
      setDragging(mesaId);
      setDragOffset({
        x: (e.clientX - rect.left) / zoom - pos.x,
        y: (e.clientY - rect.top) / zoom - pos.y,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [editMode, positions, zoom],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      let newX = (e.clientX - rect.left) / zoom - dragOffset.x;
      let newY = (e.clientY - rect.top) / zoom - dragOffset.y;
      // Sin límites: se permiten coordenadas negativas y el canvas crece
      // dinámicamente (ver canvasSize) para un plano verdaderamente infinito
      // en todas direcciones.
      newX = snapToGrid(newX);
      newY = snapToGrid(newY);
      setPositions((prev) => ({ ...prev, [dragging]: { x: newX, y: newY } }));
      setHasChanges(true);
    },
    [dragging, dragOffset, zoom],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  // Pan handlers (mover canvas cuando no está en modo edición)
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editMode) return;
      // Solo iniciar pan si el click fue en el viewport o el canvas vacío, no en una mesa
      if (e.target === e.currentTarget || e.target === canvasRef.current) {
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: panOffset.x,
          panY: panOffset.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [editMode, panOffset],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    },
    [isPanning],
  );

  const handleMesaClick = (mesa: TableWithSession) => {
    if (editMode) return; // en modo edición solo se arrastra
    onMesaClick(mesa);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const batch = Object.entries(positions).map(([id, pos]) => ({
        id,
        position_x: Math.round(pos.x),
        position_y: Math.round(pos.y),
      }));
      await onSavePositions(batch);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetZoom = () => setZoom(1);

  // Centrar vista donde hay más mesas (calcula el centroide)
  const handleCenterOnTables = () => {
    if (mesas.length === 0) return;
    const validPositions = mesas
      .filter(m => positions[m.id] !== undefined)
      .map(m => getPos(m.id));
    if (validPositions.length === 0) {
      setPanOffset({ x: 0, y: 0 });
      return;
    }
    // Calcular centroide de las posiciones
    const avgX = validPositions.reduce((sum, p) => sum + p.x, 0) / validPositions.length;
    const avgY = validPositions.reduce((sum, p) => sum + p.y, 0) / validPositions.length;
    // Calcular offset para centrar el centroide en el viewport
    const wrapperEl = wrapperRef.current;
    if (!wrapperEl) return;
    const wrapperRect = wrapperEl.getBoundingClientRect();
    const targetX = wrapperRect.width / 2 - (avgX + TABLE_W / 2) * zoom;
    const targetY = 150 - avgY * zoom; // 150px approx para considerar toolbar/leyenda
    setPanOffset({ x: targetX, y: targetY });
  };

  // Color por estado
  const getTableColors = (mesa: TableWithSession) => {
    if (mesa.session?.status === 'bill_requested') {
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/40',
        border: 'border-orange-400 dark:border-orange-600',
        text: 'text-orange-700 dark:text-orange-300',
      };
    }
    if (mesa.state === 'occupied') {
      return {
        bg: 'bg-red-100 dark:bg-red-900/40',
        border: 'border-red-400 dark:border-red-600',
        text: 'text-red-700 dark:text-red-300',
      };
    }
    if (mesa.state === 'reserved') {
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/40',
        border: 'border-yellow-400 dark:border-yellow-600',
        text: 'text-yellow-700 dark:text-yellow-300',
      };
    }
    return {
      bg: 'bg-green-100 dark:bg-green-900/40',
      border: 'border-green-400 dark:border-green-600',
      text: 'text-green-700 dark:text-green-300',
    };
  };

  // Calcular tiempo sesión
  const getTiempo = (mesa: TableWithSession) => {
    if (!mesa.session?.opened_at) return null;
    const diff = Math.floor((Date.now() - new Date(mesa.session.opened_at).getTime()) / 60000);
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h${diff % 60}m`;
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditMode(!editMode)}
            className={editMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
          >
            {editMode ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
            {editMode ? 'Editando plano' : 'Editar plano'}
          </Button>
          {editMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanOffset({ x: 0, y: 0 })}
              className="text-xs"
            >
              <Maximize2 className="h-3.5 w-3.5 mr-1" />
              Centrar
            </Button>
          )}
          {hasChanges && editMode && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Guardando...' : 'Guardar posiciones'}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleResetZoom} title="Reset zoom">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleCenterOnTables} className="text-xs h-8" title="Centrar donde hay más mesas">
            <Crosshair className="h-3.5 w-3.5 mr-1" />
            Centrar mesas
          </Button>
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500" /> Libre</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Ocupada</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> Cuenta</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" /> Reservada</span>
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapperRef} className="w-full">
      <Card className="relative overflow-hidden bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-[calc(100vh-260px)] min-h-[500px]">
        {/* Fondo de puntos infinito: independiente del tamaño del canvas, se desplaza con el pan
            para dar la sensación de un plano sin límites al hacer scroll/pan. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(156,163,175,0.3) 1px, transparent 1px)`,
            backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
            backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
          }}
        />
        <div
          className={cn(
            'absolute inset-0 select-none',
            editMode ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ touchAction: 'none' }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={(e) => {
            handlePointerMove(e);
            handleCanvasPointerMove(e);
          }}
          onPointerUp={handlePointerUp}
        >
        <div
          ref={canvasRef}
          className="relative"
          style={{
            height: canvasSize.h,
            width: canvasSize.w,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
        >
          {/* Encierro visual de zonas */}
          {zoneBounds.map((zb) => (
            <div
              key={zb.zone}
              className="absolute rounded-2xl border-2 border-dashed pointer-events-none"
              style={{
                left: zb.x * zoom,
                top: zb.y * zoom,
                width: zb.w * zoom,
                height: zb.h * zoom,
                borderColor: `${zb.color}80`,
                backgroundColor: `${zb.color}0d`,
              }}
            >
              <span
                className="absolute -top-3 left-3 px-2 rounded text-[11px] font-semibold shadow-sm"
                style={{ backgroundColor: zb.color, color: '#fff', fontSize: 11 * Math.max(zoom, 0.6) }}
              >
                {zb.zone}
              </span>
            </div>
          ))}

          {mesas.map((mesa) => {
            const pos = getPos(mesa.id);
            const size = getMesaSize(mesa.capacity);
            const colors = getTableColors(mesa);
            const tiempo = getTiempo(mesa);
            const isDragging = dragging === mesa.id;

            return (
              <div
                key={mesa.id}
                className={cn(
                  'absolute border-2 shadow-md transition-shadow select-none flex flex-col items-center justify-center',
                  size.shape === 'circle' ? 'rounded-full' : 'rounded-xl',
                  colors.bg,
                  colors.border,
                  isDragging && 'shadow-xl ring-2 ring-blue-500 z-50 opacity-90',
                  editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:shadow-lg',
                )}
                style={{
                  left: pos.x * zoom,
                  top: pos.y * zoom,
                  width: size.w * zoom,
                  height: size.h * zoom,
                  touchAction: editMode ? 'none' : 'auto',
                }}
                onPointerDown={(e) => handlePointerDown(e, mesa.id)}
                onClick={() => handleMesaClick(mesa)}
                onMouseEnter={() => setHoveredMesaId(mesa.id)}
                onMouseLeave={() => setHoveredMesaId((prev) => (prev === mesa.id ? null : prev))}
              >
                {/* Tooltip con detalle al hacer hover (solo mesas con sesión) */}
                {hoveredMesaId === mesa.id && mesa.session && !editMode && (
                  <div
                    className="absolute z-50 left-1/2 -translate-x-1/2 -top-2 -translate-y-full bg-gray-900 text-white text-xs rounded-lg shadow-lg px-3 py-2 pointer-events-none whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <UserIcon className="h-3 w-3" />
                      <span>{mesa.session.serverName || 'Sin mesero asignado'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-3 w-3" />
                      <span>{tiempo || '0m'} abierta</span>
                    </div>
                    {mesa.totalAmount ? (
                      <div className="flex items-center gap-1.5 mb-1">
                        <DollarSign className="h-3 w-3" />
                        <span>${mesa.totalAmount.toLocaleString()}</span>
                      </div>
                    ) : null}
                    {(mesa.session.pendingKitchenItems || 0) > 0 && (
                      <div className="flex items-center gap-1.5 text-orange-300">
                        <ChefHat className="h-3 w-3" />
                        <span>{mesa.session.pendingKitchenItems} en cocina</span>
                      </div>
                    )}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}

                {/* Nombre */}
                <span
                  className={cn('font-bold leading-tight text-center', colors.text)}
                  style={{ fontSize: 14 * zoom }}
                >
                  {mesa.name}
                </span>

                {/* Info compacta */}
                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 10 * zoom }}>
                  <Users style={{ width: 10 * zoom, height: 10 * zoom }} className={colors.text} />
                  <span className={colors.text}>
                    {mesa.session?.customers || 0}/{mesa.capacity}
                  </span>
                  {tiempo && (
                    <>
                      <Clock style={{ width: 10 * zoom, height: 10 * zoom }} className={cn(colors.text, 'ml-1')} />
                      <span className={colors.text}>{tiempo}</span>
                    </>
                  )}
                </div>

                {/* Zona badge */}
                {mesa.zone && (
                  <span
                    className="text-gray-500 dark:text-gray-400 truncate max-w-full px-1"
                    style={{ fontSize: 9 * zoom }}
                  >
                    {mesa.zone}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </Card>
      </div>

      {editMode && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Arrastra las mesas para reorganizar el plano. Las posiciones se ajustan a una cuadrícula de {GRID_SIZE}px. Haz clic en &quot;Guardar posiciones&quot; cuando termines.
        </p>
      )}
    </div>
  );
}
