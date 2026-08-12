'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import DetailsModal from '@/components/DetailsModal';
import { Survey } from '@/types';

// Dynamically import MapExplorer with SSR disabled to prevent Node compilation errors
const MapExplorer = dynamic(() => import('@/components/MapExplorer'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-100" />,
});

export default function ExplorerPage() {
  const [selectedRecord, setSelectedRecord] = useState<Survey | null>(null);

  return (
    <div className="relative w-full h-full">
      <MapExplorer onViewDetails={setSelectedRecord} />
      
      {selectedRecord && (
        <DetailsModal 
          record={selectedRecord} 
          onClose={() => setSelectedRecord(null)} 
        />
      )}
    </div>
  );
}
