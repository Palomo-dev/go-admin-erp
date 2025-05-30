import { FC } from 'react';

interface TimelinePageProps {}

const TimelinePage: FC<TimelinePageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Timeline</h1>
      <p>Contenido del módulo Timeline</p>
    </div>
  );
};

export default TimelinePage;
