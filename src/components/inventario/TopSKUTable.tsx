import { FC, useState, useEffect } from 'react';

interface SKU {
  id: string;
  nombre: string;
  stock: number;
  valorUnitario: number;
  rotacion: number;
}

type OrdenamientoCriterio = 'rotacion' | 'stock' | 'valor';

interface TopSKUTableProps {
  skus?: SKU[];
  loading?: boolean;
  itemsPorPagina?: number;
}

const TopSKUTable: FC<TopSKUTableProps> = ({ 
  skus = [
    { id: 'SKU001', nombre: 'Laptop Dell XPS 13', stock: 24, valorUnitario: 1200000, rotacion: 85 },
    { id: 'SKU002', nombre: 'Monitor Samsung 27"', stock: 45, valorUnitario: 450000, rotacion: 76 },
    { id: 'SKU003', nombre: 'Teclado Mecánico Logitech', stock: 36, valorUnitario: 120000, rotacion: 68 },
    { id: 'SKU004', nombre: 'Mouse Inalámbrico Microsoft', stock: 58, valorUnitario: 65000, rotacion: 92 },
    { id: 'SKU005', nombre: 'Audífonos Sony WH-1000XM4', stock: 19, valorUnitario: 850000, rotacion: 71 },
    { id: 'SKU006', nombre: 'Tablet Samsung Galaxy', stock: 22, valorUnitario: 750000, rotacion: 78 },
    { id: 'SKU007', nombre: 'Smart TV LG 50"', stock: 8, valorUnitario: 1800000, rotacion: 62 },
    { id: 'SKU008', nombre: 'Impresora HP LaserJet', stock: 12, valorUnitario: 520000, rotacion: 65 },
    { id: 'SKU009', nombre: 'Cámara Sony Alpha', stock: 6, valorUnitario: 2500000, rotacion: 58 },
    { id: 'SKU010', nombre: 'Router TP-Link', stock: 18, valorUnitario: 180000, rotacion: 72 },
  ],
  loading = false,
  itemsPorPagina = 5
}) => {
  // Estado para el criterio de ordenamiento
  const [criterioPrincipal, setCriterioPrincipal] = useState<OrdenamientoCriterio>('rotacion');
  
  // Estado para paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [skusOrdenados, setSkusOrdenados] = useState<SKU[]>([]);
  
  // Ordenar y paginar los SKUs
  useEffect(() => {
    const resultado = [...skus];
    
    // Ordenar por el criterio seleccionado
    if (criterioPrincipal === 'rotacion') {
      resultado.sort((a, b) => b.rotacion - a.rotacion);
    } else if (criterioPrincipal === 'stock') {
      resultado.sort((a, b) => b.stock - a.stock);
    } else if (criterioPrincipal === 'valor') {
      resultado.sort((a, b) => b.valorUnitario - a.valorUnitario);
    }
    
    setSkusOrdenados(resultado);
  }, [skus, criterioPrincipal]);
  
  // Obtener SKUs para la página actual
  const indiceInicial = (paginaActual - 1) * itemsPorPagina;
  const indiceFinal = indiceInicial + itemsPorPagina;
  const skusPaginados = skusOrdenados.slice(indiceInicial, indiceFinal);
  
  // Calcular número total de páginas
  const totalPaginas = Math.ceil(skusOrdenados.length / itemsPorPagina);
  
  // Cambiar de página
  const cambiarPagina = (numeroPagina: number) => {
    setPaginaActual(numeroPagina);
  };
  
  // Exportar a CSV
  const exportarCSV = () => {
    // Encabezados del CSV
    const encabezados = ['SKU', 'Producto', 'Stock', 'Valor Unitario', 'Rotación'];
    
    // Convertir los datos a formato CSV
    const filas = skusOrdenados.map(sku => [
      sku.id,
      sku.nombre,
      sku.stock.toString(),
      sku.valorUnitario.toString(),
      `${sku.rotacion}%`
    ]);
    
    // Combinar encabezados y filas
    const contenidoCSV = [
      encabezados.join(','),
      ...filas.map(fila => fila.join(','))
    ].join('\n');
    
    // Crear Blob y descargar
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `top_skus_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Top SKUs</h3>
        
        <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4 mt-2 md:mt-0">
          {/* Selector de criterio */}
          <div className="flex items-center">
            <label htmlFor="criterio" className="mr-2 text-sm text-gray-600">Ordenar por:</label>
            <select
              id="criterio"
              value={criterioPrincipal}
              onChange={(e) => setCriterioPrincipal(e.target.value as OrdenamientoCriterio)}
              className="text-sm text-gray-800 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="rotacion">Rotación</option>
              <option value="stock">Stock</option>
              <option value="valor">Valor</option>
            </select>
          </div>
          
          {/* Botón de exportación */}
          <button
            onClick={exportarCSV}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Exportar CSV
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-40">
          <p>Cargando...</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Producto
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valor Unitario
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rotación
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {skusPaginados.map((sku) => (
                <tr key={sku.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sku.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku.stock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(sku.valorUnitario)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <span className="mr-2">{sku.rotacion}%</span>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${sku.rotacion}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex justify-center mt-4">
              <nav className="inline-flex rounded-md shadow">
                <button
                  onClick={() => cambiarPagina(paginaActual - 1)}
                  disabled={paginaActual === 1}
                  className={`px-3 py-1 rounded-l-md text-sm font-medium ${paginaActual === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'} border border-gray-300`}
                >
                  Anterior
                </button>
                
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((pagina) => (
                  <button
                    key={pagina}
                    onClick={() => cambiarPagina(pagina)}
                    className={`px-3 py-1 text-sm font-medium ${pagina === paginaActual ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} border-t border-b border-gray-300`}
                  >
                    {pagina}
                  </button>
                ))}
                
                <button
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas}
                  className={`px-3 py-1 rounded-r-md text-sm font-medium ${paginaActual === totalPaginas ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'} border border-gray-300`}
                >
                  Siguiente
                </button>
              </nav>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TopSKUTable;
