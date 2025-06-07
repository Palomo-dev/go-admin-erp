import { FC, useState } from 'react';

interface Sucursal {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface FiltrosInventarioProps {
  sucursales?: Sucursal[];
  categorias?: Categoria[];
  onFilterChange?: (filtros: { sucursal: string; categoria: string }) => void;
}

const FiltrosInventario: FC<FiltrosInventarioProps> = ({
  sucursales = [
    { id: 'SUC001', nombre: 'Sede Principal' },
    { id: 'SUC002', nombre: 'Sucursal Norte' },
    { id: 'SUC003', nombre: 'Sucursal Sur' },
    { id: 'SUC004', nombre: 'Sucursal Este' },
  ],
  categorias = [
    { id: 'CAT001', nombre: 'Electrónicos' },
    { id: 'CAT002', nombre: 'Periféricos' },
    { id: 'CAT003', nombre: 'Accesorios' },
    { id: 'CAT004', nombre: 'Mobiliario' },
  ],
  onFilterChange,
}) => {
  const [filtros, setFiltros] = useState({
    sucursal: '',
    categoria: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    const nuevosFiltros = {
      ...filtros,
      [name]: value,
    };
    
    setFiltros(nuevosFiltros);
    
    if (onFilterChange) {
      onFilterChange(nuevosFiltros);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="sucursal" className="block text-sm font-medium text-gray-700 mb-1">
            Sucursal
          </label>
          <select
            id="sucursal"
            name="sucursal"
            value={filtros.sucursal}
            onChange={handleChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base text-gray-900 border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex-1">
          <label htmlFor="categoria" className="block text-sm font-medium text-gray-700 mb-1">
            Categoría
          </label>
          <select
            id="categoria"
            name="categoria"
            value={filtros.categoria}
            onChange={handleChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base text-gray-900 border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default FiltrosInventario;
