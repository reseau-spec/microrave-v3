import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Network() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Réseau</h1>
        <p className="text-gray-600">Suivez et connectez avec d'autres talents</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>W4 — En développement</CardTitle>
          <CardDescription>
            Cette fonctionnalité sera activée lors de la vague 4 du MVP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-gray-600">
            <p>Le réseau permettra de:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Suivre d'autres talents</li>
              <li>Accepter ou refuser des demandes de suivi</li>
              <li>Voir l'activité de votre réseau dans le Feed</li>
              <li>Consulter les revenus certifiés des autres</li>
            </ul>
          </div>
          <Button className="w-full mt-6" disabled>
            Parcourir le réseau (W4)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}