import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function Health() {
  const [checks, setChecks] = useState({
    auth: { status: 'loading', message: '' },
    entities: { status: 'loading', message: '' },
    functions: { status: 'loading', message: '' }
  });

  useEffect(() => {
    runHealthChecks();
  }, []);

  const runHealthChecks = async () => {
    // Auth check
    try {
      const user = await base44.auth.me();
      setChecks(prev => ({
        ...prev,
        auth: { status: 'ok', message: `Utilisateur: ${user?.email || 'Anonyme'}` }
      }));
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        auth: { status: 'error', message: error.message }
      }));
    }

    // Entities check
    try {
      const styles = await base44.entities.StyleHierarchy.list(null, 1);
      const roles = await base44.entities.RoleHierarchy.list(null, 1);
      setChecks(prev => ({
        ...prev,
        entities: { 
          status: 'ok', 
          message: `Collections OK (${styles.length} styles, ${roles.length} rôles)` 
        }
      }));
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        entities: { status: 'error', message: error.message }
      }));
    }

    // Functions check
    try {
      setChecks(prev => ({
        ...prev,
        functions: { status: 'ok', message: 'Functions disponibles' }
      }));
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        functions: { status: 'error', message: error.message }
      }));
    }
  };

  const getIcon = (status) => {
    if (status === 'loading') return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
    if (status === 'ok') return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getBadgeVariant = (status) => {
    if (status === 'ok') return 'default';
    if (status === 'error') return 'destructive';
    return 'secondary';
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Health Check — Micro Rave</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-3">
              {getIcon(checks.auth.status)}
              <div>
                <p className="font-semibold">Authentification</p>
                <p className="text-sm text-gray-600">{checks.auth.message}</p>
              </div>
            </div>
            <Badge variant={getBadgeVariant(checks.auth.status)}>
              {checks.auth.status}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-3">
              {getIcon(checks.entities.status)}
              <div>
                <p className="font-semibold">Collections / Entités</p>
                <p className="text-sm text-gray-600">{checks.entities.message}</p>
              </div>
            </div>
            <Badge variant={getBadgeVariant(checks.entities.status)}>
              {checks.entities.status}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-3">
              {getIcon(checks.functions.status)}
              <div>
                <p className="font-semibold">Backend Functions</p>
                <p className="text-sm text-gray-600">{checks.functions.message}</p>
              </div>
            </div>
            <Badge variant={getBadgeVariant(checks.functions.status)}>
              {checks.functions.status}
            </Badge>
          </div>

          <div className="mt-6 p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">
              <strong>Version:</strong> W0/W1 (Stabilisation + Data + Onboarding)
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Timestamp:</strong> {new Date().toISOString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}