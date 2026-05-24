import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const GlobalActionContext = createContext({
  pendingPayments:   [],
  activeEscrows:     [],
  activeSessions:    [],
  expiringEscrows:   [],
  balanceDueEvents:  [], // NOUVEAU : events avec balance due dans ≤ 14 jours
  totalPending:      0,
  isLoading:         false,
  refresh:           () => {},
  dismiss:           () => {},
  dismissedIds:      new Set(),
});

export const useGlobalActions = () => useContext(GlobalActionContext);

const POLL_INTERVAL_MS = 30_000;

function hoursUntil(dateStr) {
  if (!dateStr) return Infinity;
  return (new Date(dateStr) - Date.now()) / (1000 * 60 * 60);
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  return (new Date(dateStr) - Date.now()) / (1000 * 60 * 60 * 24);
}

function isExpiringSoon(event) {
  if (!['securing', 'secured'].includes(event.escrowStatus)) return false;
  if (!event.stripePaymentIntentId) return false;
  const h = hoursUntil(event.stripePaymentIntentCreatedAt || event.updated_date);
  return h < 72;
}

// Un event a sa balance due dans 14 jours ou moins (rappel actif)
function isBalanceDueSoon(event) {
  if (event.escrowStatus !== 'secured') return false;
  if (event.stripeBalancePaymentIntentId) return false; // déjà payée
  if (!event.balanceDueDate) return false;
  const d = daysUntil(event.balanceDueDate);
  return d >= 0 && d <= 14; // entre maintenant et J-7 (window de rappel = J-14 à J-7)
}

export function GlobalActionProvider({ children }) {
  const { user } = useAuth();

  const [pendingPayments,  setPendingPayments]  = useState([]);
  const [activeEscrows,    setActiveEscrows]    = useState([]);
  const [activeSessions,   setActiveSessions]   = useState([]);
  const [expiringEscrows,  setExpiringEscrows]  = useState([]);
  const [balanceDueEvents, setBalanceDueEvents] = useState([]); // NOUVEAU
  const [isLoading,        setIsLoading]        = useState(false);
  const [dismissedIds,     setDismissedIds]     = useState(new Set());

  const intervalRef = useRef(null);

  const fetchActions = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const [paymentReqs, myEvents, mySessions] = await Promise.allSettled([
        base44.entities.EventPaymentRequest.filter({ payerUserId: user.id }),
        base44.entities.Event.filter({ organizerId: user.id }),
        base44.entities.Session.filter({ status: 'in_progress' }),
      ]);

      // Demandes de paiement en attente
      if (paymentReqs.status === 'fulfilled') {
        const active = (paymentReqs.value || []).filter(r =>
          ['sent', 'viewed'].includes(r.requestStatus)
        );
        const enriched = await Promise.all(
          active.map(async (req) => {
            try {
              if (!req.eventId) return req;
              const evRows = await base44.entities.Event.filter({ id: req.eventId }).catch(() => []);
              const ev = evRows?.[0] || null;
              return { ...req, eventTitle: ev?.title || 'Événement', eventDate: ev?.dateStart };
            } catch { return req; }
          })
        );
        setPendingPayments(enriched);
      }

      // Escrows actifs + balance due
      if (myEvents.status === 'fulfilled') {
        const events = myEvents.value || [];

        const escrows = events.filter(ev =>
          ['securing', 'secured'].includes(ev.escrowStatus)
        );
        setActiveEscrows(escrows);

        const expiring = escrows.filter(isExpiringSoon);
        setExpiringEscrows(expiring);

        // Events avec balance due dans ≤ 14 jours (rappel actif J-14 à J-7)
        const balanceDue = events.filter(isBalanceDueSoon);
        setBalanceDueEvents(balanceDue);
      }

      // Sessions actives
      if (mySessions.status === 'fulfilled') {
        const sessions = (mySessions.value || []).filter(s => {
          if (!s.slots) return false;
          return s.slots.some(slot =>
            slot.candidateUserId === user.id ||
            slot.candidates?.some(c => c.userId === user.id)
          );
        });
        setActiveSessions(sessions);
      }

    } catch (err) {
      console.warn('[GlobalActionContext] fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchActions();
    intervalRef.current = setInterval(fetchActions, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [user?.id, fetchActions]);

  const dismiss = useCallback((id) => {
    setDismissedIds(prev => new Set([...prev, id]));
  }, []);

  const totalPending =
    pendingPayments.length +
    expiringEscrows.filter(e => !dismissedIds.has(e.id)).length +
    balanceDueEvents.filter(e => !dismissedIds.has(`balance_${e.id}`)).length;

  return (
    <GlobalActionContext.Provider value={{
      pendingPayments,
      activeEscrows,
      activeSessions,
      expiringEscrows,
      balanceDueEvents,
      totalPending,
      isLoading,
      refresh: fetchActions,
      dismiss,
      dismissedIds,
    }}>
      {children}
    </GlobalActionContext.Provider>
  );
}