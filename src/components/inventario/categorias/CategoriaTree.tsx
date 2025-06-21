"use client";

import React, { useState } from 'react';
import { Categoria } from './types';
import { ChevronDown, ChevronRight, Edit, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface CategoriaNodeProps {
  categoria: Categoria;
  level: number;
  onSelect: (categoria: Categoria) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
  onDrop: (id: number, targetId: number, position: 'before' | 'after' | 'inside') => void;
  isExpanded: boolean;
}

// Tipo para los elementos arrastrables
interface DragItem {
  type: string;
  id: number;
  level: number;
}

// Componente para un nodo individual de categoría
const CategoriaNode: React.FC<CategoriaNodeProps> = ({ 
  categoria, 
  level, 
  onSelect, 
  onDelete,
  onToggle,
  onDrop,
  isExpanded
}) => {
  const [isDragOver, setIsDragOver] = useState<string | null>(null);
  
  // Configuración para drag-and-drop
  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: 'CATEGORIA',
    item: { type: 'CATEGORIA', id: categoria.id, level },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const [, drop] = useDrop({
    accept: 'CATEGORIA',
    hover(item: DragItem, monitor) {
      if (item.id === categoria.id) {
        return; // No permitir soltar sobre sí mismo
      }
      
      // Determinar posición del cursor
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      if (!hoverBoundingRect) return;
      
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      
      // Determinar zona de drop
      if (hoverClientY < hoverMiddleY / 2) {
        setIsDragOver('before');
      } else if (hoverClientY > hoverMiddleY * 1.5) {
        setIsDragOver('after');
      } else {
        setIsDragOver('inside');
      }
    },
    drop(item: DragItem, monitor) {
      if (item.id === categoria.id) return;
      if (!isDragOver) return;
      
      onDrop(item.id, categoria.id, isDragOver as 'before' | 'after' | 'inside');
      setIsDragOver(null);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });
  
  const ref = React.useRef<HTMLDivElement>(null);
  drag(drop(ref));
  
  // Clases para indicar la zona de drop
  const dropLineClasses = {
    before: isDragOver === 'before' ? 'border-t-2 border-blue-500 -mt-px' : '',
    after: isDragOver === 'after' ? 'border-b-2 border-blue-500 -mb-px' : '',
    inside: isDragOver === 'inside' ? 'bg-blue-100 dark:bg-blue-900/20' : '',
  };

  const hasChildren = categoria.children && categoria.children.length > 0;

  return (
    <div className={cn("transition-all", isDragging ? 'opacity-50' : 'opacity-100')}>
      <div className={dropLineClasses.before}></div>
      
      <div 
        ref={ref}
        className={cn(
          "flex items-center py-2 px-1 rounded-md my-1 group",
          "transition-colors duration-200",
          "hover:bg-gray-100 dark:hover:bg-gray-700/50",
          dropLineClasses.inside
        )}
      >
        {/* Espacio para indentación */}
        <div style={{ width: `${level * 20}px` }} />
        
        {/* Icono de expansión */}
        <div 
          className="w-6 flex justify-center cursor-pointer"
          onClick={() => onToggle(categoria.id)}
        >
          {hasChildren && (
            isExpanded 
              ? <ChevronDown className="h-4 w-4 text-gray-500" /> 
              : <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
        </div>
        
        {/* Icono de arrastrar */}
        <div className="mr-2 opacity-0 group-hover:opacity-100 cursor-grab">
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
        
        {/* Nombre de la categoría */}
        <div 
          className="flex-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
          onClick={() => onSelect(categoria)}
        >
          {categoria.name}
        </div>
        
        {/* Acciones */}
        <div className="flex space-x-2 opacity-0 group-hover:opacity-100">
          <button 
            className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
            onClick={() => onSelect(categoria)}
          >
            <Edit className="h-4 w-4" />
          </button>
          <button 
            className="text-gray-500 hover:text-red-600 dark:hover:text-red-400"
            onClick={() => onDelete(categoria.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      <div className={dropLineClasses.after}></div>
      
      {/* Renderizar hijos */}
      {hasChildren && isExpanded && (
        <div className="pl-4">
          {categoria.children!.map(child => (
            <CategoriaNodeWithState
              key={child.id}
              categoria={child}
              level={level + 1}
              onSelect={onSelect}
              onDelete={onDelete}
              onToggle={onToggle}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Componente wrapper para mantener el estado de expansión
const CategoriaNodeWithState: React.FC<Omit<CategoriaNodeProps, 'isExpanded'>> = (props) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const handleToggle = (id: number) => {
    if (props.categoria.id === id) {
      setIsExpanded(!isExpanded);
    }
    props.onToggle(id);
  };
  
  return (
    <CategoriaNode
      {...props}
      onToggle={handleToggle}
      isExpanded={isExpanded}
    />
  );
};

// Interfaz para el componente principal
interface CategoriaTreeProps {
  categorias: Categoria[];
  onSelect: (categoria: Categoria) => void;
  onUpdateOrder: (categoriaId: number, nuevoParentId: number | null, nuevoRank: number) => void;
  onDelete: (id: number) => void;
}

// Componente principal de árbol
const CategoriaTree: React.FC<CategoriaTreeProps> = ({ 
  categorias, 
  onSelect, 
  onUpdateOrder,
  onDelete
}) => {
  // Manejar el drop de una categoría
  const handleDrop = (dragId: number, dropId: number, position: 'before' | 'after' | 'inside') => {
    // Encontrar las categorías involucradas
    const findCategoria = (list: Categoria[], id: number): [Categoria | undefined, Categoria[] | undefined, number] => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          return [list[i], list, i];
        }
        if (list[i].children?.length) {
          const [found, parent, index] = findCategoria(list[i].children!, id);
          if (found) return [found, parent, index];
        }
      }
      return [undefined, undefined, -1];
    };
    
    const [draggedCat] = findCategoria(categorias, dragId);
    const [dropCat, dropParent, dropIndex] = findCategoria(categorias, dropId);
    
    if (!draggedCat || !dropCat || !dropParent) return;
    
    // Calcular nuevo parent_id y rank según la posición
    let newParentId: number | null;
    let newRank: number;
    
    switch (position) {
      case 'inside':
        // Convertir en hijo de la categoría destino
        newParentId = dropCat.id;
        newRank = dropCat.children?.length ? Math.max(...dropCat.children.map(c => c.rank)) + 1 : 1;
        break;
        
      case 'before':
        // Insertar antes de la categoría destino
        newParentId = dropCat.parent_id;
        newRank = dropCat.rank;
        // Actualizar ranks de otros elementos
        dropParent.forEach(cat => {
          if (cat.rank >= dropCat.rank && cat.id !== draggedCat.id) {
            cat.rank += 1;
          }
        });
        break;
        
      case 'after':
        // Insertar después de la categoría destino
        newParentId = dropCat.parent_id;
        newRank = dropCat.rank + 1;
        // Actualizar ranks de otros elementos
        dropParent.forEach(cat => {
          if (cat.rank > dropCat.rank && cat.id !== draggedCat.id) {
            cat.rank += 1;
          }
        });
        break;
    }
    
    // Actualizar en base de datos
    onUpdateOrder(dragId, newParentId, newRank);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="border border-gray-200 dark:border-gray-700 rounded-md p-2 overflow-auto max-h-[calc(100vh-300px)]">
        {categorias.map(categoria => (
          <CategoriaNodeWithState
            key={categoria.id}
            categoria={categoria}
            level={0}
            onSelect={onSelect}
            onDelete={onDelete}
            onToggle={() => {}} // Se maneja internamente en CategoriaNodeWithState
            onDrop={handleDrop}
          />
        ))}
      </div>
    </DndProvider>
  );
};

export default CategoriaTree;
