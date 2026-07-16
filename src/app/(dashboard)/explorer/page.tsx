'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import DetailsModal from '@/components/DetailsModal';
import { Survey } from '@/types';
import { Loader2 } from 'lucide-react';

// Dynamically import MapExplorer with SSR disabled to prevent Node compilation errors
const MapExplorer = dynamic(() => import('@/components/MapExplorer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
        <p className="text-sm font-semibold text-slate-400">Loading Map Component...</p>
      </div>
    </div>
  ),
});

export default function ExplorerPage() {
  const [selectedRecord, setSelectedRecord] = useState<Survey | null>(null);

  return (
    <div className="relative w-full h-screen">
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
