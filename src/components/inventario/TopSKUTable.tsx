import { FC } from 'react';

interface SKU {
  id: string;
  nombre: string;
  stock: number;
  valorUnitario: number;
  rotacion: number;
}

interface TopSKUTableProps {
  skus?: SKU[];
  loading?: boolean;
}

const TopSKUTable: FC<TopSKUTableProps> = ({ 
  skus = [
    { id: 'SKU001', nombre: 'Laptop Dell XPS 13', stock: 24, valorUnitario: 1200000, rotacion: 85 },
    { id: 'SKU002', nombre: 'Monitor Samsung 27"', stock: 45, valorUnitario: 450000, rotacion: 76 },
    { id: 'SKU003', nombre: 'Teclado Mecánico Logitech', stock: 36, valorUnitario: 120000, rotacion: 68 },
    { id: 'SKU004', nombre: 'Mouse Inalámbrico Microsoft', stock: 58, valorUnitario: 65000, rotacion: 92 },
    { id: 'SKU005', nombre: 'Audífonos Sony WH-1000XM4', stock: 19, valorUnitario: 850000, rotacion: 71 },
  ],
  loading = false
}) => {
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
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Top SKUs</h3>
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
              {skus.map((sku) => (
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
        </div>
      )}
    </div>
  );
};

export default TopSKUTable;
