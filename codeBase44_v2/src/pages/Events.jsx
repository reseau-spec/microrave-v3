import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, MapPin, Users, Plus, DollarSign, Clock, Globe, ExternalLink, Trash2, AlertTriangle, Unlock } from 'lucide-react';
import { formatEventDate, formatEventDateShort, DEFAULT_TIMEZONE } from '../utils/dateUtils';

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return String(v);
}

// formatDate utilise maintenant formatEventDate depuis dateUtils
// Le timezone est résolu depuis ev.checkpointTimezone (futur) ou DEFAULT_TIMEZONE
function formatDate(iso, timezone) {
  return formatEventDate(iso, timezone || DEFAULT_TIMEZONE);
}

const STATUS_CONFIG = {
  draft:      { label: 'Brouillon',  color: 'bg-gray-100 text-gray-600'   },
  published:  { label: 'Publié',     color: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Annulé',     color: 'bg-red-100 text-red-600'     },
  completed:  { label: 'Complété',   color: 'bg-blue-100 text-blue-700'   },
  archived:   { label: 'Archivé',    color: 'bg-gray-100 text-gray-500'   },
};

const ESCROW_CONFIG = {
  none:      { label: '—',                    color: 'text-gray-400'   },
  securing:  { label: '⏳ Dépôt en cours',    color: 'text-yellow-600' },
  secured:   { label: '🔒 Budget sécurisé',   color: 'text-green-600'  },
  released:  { label: '✅ Libéré',            color: 'text-blue-600'   },
  disputed:  { label: '⚠️ Litige',            color: 'text-red-600'    },
};

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [cpMap, setCpMap]           = useState({});
  const [roleMap, setRoleMap]       = useState({});
  const [activeTab, setActiveTab]   = useState('all');
  const [actionLoadingId, setActionLoadingId] = useState(null); // ev.id en cours
  const [confirmCancelId, setConfirmCancelId] = useState(null); // ev.id attendant confirmation

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [user, allEvents, checkpoints, roles] = await Promise.all([
        base44.auth.me(),
        base44.entities.Event.filter({}),
        base44.entities.Checkpoint.filter({}),
        base44.entities.RoleHierarchy.filter({}),
      ]);
      setCurrentUser(user);
      setEvents(allEvents || []);
      setCpMap(Object.fromEntries(
        (checkpoints || []).map(c => [normalizeId(c.systemId || c.id), c])
      ));
      setRoleMap(Object.fromEntries(
        (roles || []).map(r => [normalizeId(r.systemId || r.id), r])
      ));
    } catch (err) {
      console.error('Events loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (ev) => {
    setActionLoadingId(ev.id);
    try {
      await base44.entities.Event.update(ev.id, { status: 'published' });
      await loadData();
    } catch (err) {
      console.error('Publish error:', err);
      alert('Erreur lors de la publication : ' + (err.message || err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenLobby = async (ev) => {
    setActionLoadingId(ev.id);
    try {
      const res = await base44.functions.invoke('openEventLobby', { eventId: ev.id });
      navigate(createPageUrl('EventLobby') + `?eventId=${ev.id}`);
    } catch (err) {
      console.error('Open lobby error:', err);
      alert(`Erreur ouverture lobby : ${err.message || err}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Annulation ou suppression d'un event selon son statut :
  //  - draft      → suppression physique (jamais publié)
  //  - published  → annulation logique (status = 'cancelled')
  //  - in_progress → bloqué côté serveur, message clair
  const handleCancelOrDelete = async (ev) => {
    setConfirmCancelId(null);
    setActionLoadingId(ev.id);
    try {
      await base44.functions.invoke('cancelEvent', { eventId: ev.id });
      await loadData();
    } catch (err) {
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.error || err?.message || 'Erreur inconnue';
      if (code === 'SESSION_IN_PROGRESS') {
        alert('⚠️ Une session est en cours pour cet événement.\nTerminez-la d\'abord depuis la page Jouer.');
      } else {
        alert(`Erreur : ${message}`);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const myEvents = events.filter(e => e.organizerId === currentUser?.id);
  // Séparer actifs (actions possibles) et terminés (lecture seule)
  const myActiveEvents    = myEvents.filter(e => !['completed','archived'].includes(e.status));
  const myCompletedEvents = myEvents.filter(e => ['completed','archived'].includes(e.status));

  const displayed = activeTab === 'mine'
    ? myActiveEvents
    : events.filter(e => ['draft','published'].includes(e.status));

  const sorted = [...displayed].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Événements</h1>
          <p className="text-gray-500 mt-1">{events.length} événement{events.length !== 1 ? 's' : ''} dans le réseau</p>
        </div>
        <Button
          onClick={() => navigate(createPageUrl('CreateEvent'))}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Créer
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'all',  label: 'Tous les événements' },
          { key: 'mine', label: `Mes événements (${myEvents.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun événement pour l'instant</p>
          <p className="text-gray-400 text-sm mt-1">
            {activeTab === 'mine'
              ? "Créez votre premier événement"
              : "Soyez le premier à créer un événement"}
          </p>
          <Button
            onClick={() => navigate(createPageUrl('CreateEvent'))}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer un événement
          </Button>
        </div>
      )}

      {/* Event cards */}
      <div className="space-y-4">
        {sorted.map(ev => {
          const statusCfg  = STATUS_CONFIG[ev.status]  || STATUS_CONFIG.draft;
          const escrowCfg  = ESCROW_CONFIG[ev.escrowStatus] || ESCROW_CONFIG.none;
          const checkpoint = cpMap[normalizeId(ev.checkpointId)];
          const isOrganizer = ev.organizerId === currentUser?.id;
          const rolesNeeded = Array.isArray(ev.rolesNeeded) ? ev.rolesNeeded : [];

          return (
            <Card key={ev.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">

                    {/* Title + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-semibold text-gray-900 truncate">{ev.title || '(Sans titre)'}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      {ev.escrowStatus && ev.escrowStatus !== 'none' && (
                        <span className={`text-xs font-medium ${escrowCfg.color}`}>
                          {escrowCfg.label}
                        </span>
                      )}
                      {isOrganizer && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                          Mon événement
                        </span>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
                      {ev.dateStart && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(ev.dateStart, ev.checkpointTimezone)}
                        </span>
                      )}
                      {checkpoint && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {checkpoint.name}
                        </span>
                      )}
                      {ev.budget > 0 && (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <DollarSign className="w-3.5 h-3.5" />
                          {ev.budget} $ CAD
                        </span>
                      )}
                    </div>

                    {/* Roles needed */}
                    {rolesNeeded.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {rolesNeeded.slice(0, 4).map(roleId => {
                          const role = roleMap[normalizeId(roleId)];
                          return (
                            <Badge key={roleId} variant="outline" className="text-xs">
                              {role?.nameFr || role?.displayName || roleId}
                            </Badge>
                          );
                        })}
                        {rolesNeeded.length > 4 && (
                          <span className="text-xs text-gray-400">+{rolesNeeded.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Description preview */}
                    {ev.description && (
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2">{ev.description}</p>
                    )}

                    {/* Actions organisateur / candidat */}
                    <div className="mt-3 pt-3 border-t flex gap-2 flex-wrap items-center">
                      {/* Bouton Modifier — pour l'organisateur, tous statuts sauf completed */}
                      {isOrganizer && !['completed', 'cancelled', 'archived'].includes(ev.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-700"
                          onClick={() => navigate(createPageUrl('CreateEvent') + `?editEventId=${ev.id}`)}
                        >
                          ✏️ Modifier
                        </Button>
                      )}
                      {isOrganizer && ev.status === 'draft' && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-xs"
                          disabled={actionLoadingId === ev.id}
                          onClick={() => handlePublish(ev)}
                        >
                          {actionLoadingId === ev.id
                            ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            : <Globe className="w-3 h-3 mr-1" />
                          }
                          Publier
                        </Button>
                      )}

                      {/* Bouton Annuler / Supprimer — organisateur uniquement, statuts actifs */}
                      {isOrganizer && ['draft', 'published'].includes(ev.status) && (
                        confirmCancelId === ev.id ? (
                          // Étape de confirmation inline — évite les fenêtres alert()
                          <div className="flex items-center gap-2 ml-auto bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="text-xs text-red-700 font-medium">
                              {ev.status === 'draft' ? 'Supprimer définitivement ?' : 'Annuler l\'événement ?'}
                            </span>
                            <button
                              className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                              disabled={actionLoadingId === ev.id}
                              onClick={() => handleCancelOrDelete(ev)}
                            >
                              {actionLoadingId === ev.id ? 'En cours...' : 'Confirmer'}
                            </button>
                            <button
                              className="text-xs text-gray-500 hover:text-gray-700"
                              onClick={() => setConfirmCancelId(null)}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto"
                            disabled={actionLoadingId === ev.id}
                            onClick={() => setConfirmCancelId(ev.id)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            {ev.status === 'draft' ? 'Supprimer' : 'Annuler'}
                          </Button>
                        )
                      )}

                      {/* Événement terminé ou annulé */}
                      {['completed', 'archived', 'cancelled'].includes(ev.status) ? (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                            ev.status === 'cancelled'
                              ? 'bg-red-50 text-red-500'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {ev.status === 'cancelled' ? '✕ Annulé' : '✓ Terminé'}
                          </span>
                          {/* Escrow secured sur un event complété — l'organisateur doit pouvoir libérer */}
                          {isOrganizer && ev.escrowStatus === 'secured' && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-xs text-white"
                              onClick={() => navigate(createPageUrl('EventLobby') + `?eventId=${ev.id}&tab=payment`)}
                            >
                              <Unlock className="w-3 h-3 mr-1" />
                              Libérer les fonds
                            </Button>
                          )}
                          {/* Accès onglet paiement même pour events complétés avec escrow quelconque */}
                          {isOrganizer && ev.escrowStatus && ev.escrowStatus !== 'none' && ev.escrowStatus !== 'released' && ev.escrowStatus !== 'secured' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => navigate(createPageUrl('EventLobby') + `?eventId=${ev.id}&tab=payment`)}
                            >
                              <DollarSign className="w-3 h-3 mr-1" />
                              Paiements
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
                          {isOrganizer && ev.status === 'published' && (
                            <Button
                              size="sm"
                              className="bg-indigo-600 hover:bg-indigo-700 text-xs"
                              disabled={actionLoadingId === ev.id}
                              onClick={() => handleOpenLobby(ev)}
                            >
                              {actionLoadingId === ev.id
                                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                : <Users className="w-3 h-3 mr-1" />
                              }
                              Ouvrir le lobby
                            </Button>
                          )}
                          {isOrganizer && (ev.status === 'published' || ev.status === 'lobby') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => navigate(createPageUrl('EventLobby') + `?eventId=${ev.id}`)}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Gérer
                            </Button>
                          )}
                          {!isOrganizer && ev.status === 'published' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs"
                              onClick={() => navigate(createPageUrl('EventLobby') + `?eventId=${ev.id}`)}
                            >
                              <Users className="w-3 h-3 mr-1" />
                              Voir les rôles disponibles
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Section événements passés — onglet mine uniquement */}
      {activeTab === 'mine' && myCompletedEvents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">
            Événements passés
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 opacity-60">
            {myCompletedEvents.map(ev => {
              const statusCfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.draft;
              return (
                <Card key={ev.id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-700 truncate">{ev.name || ev.title || 'Événement sans nom'}</p>
                        {ev.dateStart && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatEventDateShort(ev.dateStart, ev.checkpointTimezone)}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}