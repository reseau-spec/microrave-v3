/**
 * OpenEventLobbies.jsx
 * Rail "Événements ouverts" affiché dans Play.jsx en mode idle.
 * Affiche les events published, avec statut du lobby et bouton Rejoindre.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../../utils';
import { formatEventDate, DEFAULT_TIMEZONE } from '../../utils/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, MapPin, Users, Clock } from 'lucide-react';

export default function OpenEventLobbies({ talentProfile }) {
  const navigate = useNavigate();
  const [events, setEvents]   = useState([]);
  const [lobbies, setLobbies] = useState({});
  const [roleMap, setRoleMap] = useState({});
  const [cpMap, setCpMap]     = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [evs, roles, cps] = await Promise.all([
        base44.entities.Event.filter({ status: 'published' }),
        base44.entities.RoleHierarchy.filter({}),
        base44.entities.Checkpoint.filter({}),
      ]);
      const talentRoles = talentProfile?.activeRoles || [];
      const filtered = (evs || []).filter(ev => {
        if (!talentRoles.length) return true;
        const needed = Array.isArray(ev.rolesNeeded) ? ev.rolesNeeded : [];
        if (!needed.length) return true;
        return needed.some(r => talentRoles.includes(r));
      });
      const publishedEvents = filtered.slice(0, 10);
      setEvents(publishedEvents);
      setRoleMap(Object.fromEntries((roles || []).map(r => [r.systemId || r.id, r])));
      setCpMap(Object.fromEntries((cps || []).map(c => [c.systemId || c.id, c])));

      const lobbyResults = await Promise.all(
        publishedEvents.map(ev =>
          base44.functions.invoke('getEventLobby', { eventId: ev.id })
            .then(res => ({ eventId: ev.id, ok: res?.data?.ok, session: res?.data?.session }))
            .catch(() => ({ eventId: ev.id, ok: false }))
        )
      );
      const lobbyMap = {};
      lobbyResults.forEach(r => { lobbyMap[r.eventId] = r; });
      setLobbies(lobbyMap);
    } catch (err) {
      console.error('[OpenEventLobbies]', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" />Événements ouverts</CardTitle></CardHeader>
        <CardContent><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></CardContent>
      </Card>
    );
  }

  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          Événements ouverts ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map(ev => {
          const lobby     = lobbies[ev.id];
          const lobbyOpen = lobby?.ok === true;
          const slots     = lobby?.session?.slots || [];
          const openSlots = slots.filter(s => s.status === 'open').length;
          const checkpoint  = cpMap[ev.checkpointId];
          const rolesNeeded = Array.isArray(ev.rolesNeeded) ? ev.rolesNeeded : [];

          return (
            <div key={ev.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{ev.title}</span>
                  {lobbyOpen ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">🟢 Lobby ouvert</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-500 text-xs">⬜ Lobby fermé</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                  {ev.dateStart && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatEventDate(ev.dateStart, ev.checkpointTimezone || checkpoint?.timezone || DEFAULT_TIMEZONE)}
                    </span>
                  )}
                  {checkpoint && (
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{checkpoint.name}</span>
                  )}
                  {lobbyOpen && openSlots > 0 && (
                    <span className="flex items-center gap-1 text-indigo-600 font-medium">
                      <Users className="w-3 h-3" />{openSlots} slot{openSlots > 1 ? 's' : ''} disponible{openSlots > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {rolesNeeded.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rolesNeeded.slice(0, 3).map(rid => (
                      <Badge key={rid} variant="outline" className="text-xs">
                        {roleMap[rid]?.nameFr || roleMap[rid]?.displayName || rid}
                      </Badge>
                    ))}
                    {rolesNeeded.length > 3 && <span className="text-xs text-gray-400">+{rolesNeeded.length - 3}</span>}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                disabled={!lobbyOpen}
                className={lobbyOpen
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white shrink-0'
                  : 'bg-gray-200 text-gray-500 shrink-0 cursor-not-allowed'
                }
                onClick={() => lobbyOpen && navigate(`${createPageUrl('EventLobby')}?eventId=${ev.id}`)}
              >
                {lobbyOpen ? 'Rejoindre' : 'Indisponible'}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}