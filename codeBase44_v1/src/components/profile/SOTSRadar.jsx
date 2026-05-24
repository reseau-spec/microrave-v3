import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { Star } from 'lucide-react';

export default function SOTSRadar({ sotsData, isFilteredView, hasGlobal, onResetFilters }) {
  if (!sotsData || sotsData.totalVotes === 0) {
    const message = isFilteredView && hasGlobal
      ? "Aucune donnée pour ce filtre" 
      : "Aucune évaluation SOTS disponible";
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Spirit of the Sound
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">{message}</p>
          {isFilteredView && hasGlobal && onResetFilters && (
            <button
              onClick={onResetFilters}
              className="text-xs text-indigo-600 hover:text-indigo-700 underline"
            >
              Réinitialiser les filtres
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          Spirit of the Sound
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-indigo-600">{sotsData.globalScore.toFixed(2)}</p>
            <p className="text-sm text-gray-600">{sotsData.totalVotes} évaluation{sotsData.totalVotes > 1 ? 's' : ''}</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={sotsData.radarData}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis 
              dataKey="dimension" 
              tick={{ fill: '#6b7280', fontSize: 12 }}
            />
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, 5]} 
              tick={{ fill: '#6b7280', fontSize: 10 }}
            />
            <Radar
              name="SOTS"
              dataKey="value"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.5}
            />
          </RadarChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          {sotsData.radarData.map(item => (
            <div key={item.dimension} className="flex justify-between">
              <span>{item.dimension}:</span>
              <span className="font-medium">{item.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}