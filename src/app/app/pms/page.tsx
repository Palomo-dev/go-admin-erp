import { FC } from 'react';

interface PmsPageProps {}

const PmsPage: FC<PmsPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">PMS</h1>
      <p>Contenido del módulo PMS</p>
    </div>
  );
};

export default PmsPage;
