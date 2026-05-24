/**
 * updateEvent.ts — modification d'un événement existant
 * JS pur — sans annotations TypeScript
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const EDITABLE_FIELDS = ['title', 'description', 'dateStart', 'dateEnd', 'budget', 'rolesNeeded', 'scenes', 'schedule'];

const FIELD_LABELS = {
  title: 'Titre',
  description: 'Description',
  dateStart: 'Date de début',
  dateEnd: 'Date de fin',
  budget: 'Budget',
  rolesNeeded: 'Rôles recherchés',
  scenes: 'Scènes',
  schedule: 'Horaire',
};

function changed(oldVal, newVal) {
  return JSON.stringify(oldVal) !== JSON.stringify(newVal);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { eventId, updates } = body;

    if (!eventId) return Response.json({ error: 'eventId requis' }, { status: 400 });

    const service = base44.asServiceRole;

    const events = await service.entities.Event.filter({ id: eventId });
    if (!events?.length) return Response.json({ error: 'Événement introuvable' }, { status: 404 });
    const event = events[0];

    const organizerId = event.organizerId || event.organizerUserId;
    if (organizerId !== user.id) {
      return Response.json({ error: "Accès refusé — vous n'êtes pas l'organisateur" }, { status: 403 });
    }

    const needsNotification = ['published', 'lobby'].includes(event.status);
    const now = new Date().toISOString();
    const changeEntries = [];
    const cleanUpdates = {};

    for (const field of EDITABLE_FIELDS) {
      if (!(field in updates)) continue;
      const newVal = updates[field];
      const oldVal = event[field];
      if (!changed(oldVal, newVal)) continue;

      changeEntries.push({
        at: now,
        field,
        label: FIELD_LABELS[field] || field,
        oldVal: typeof oldVal === 'object' ? '[voir historique]' : oldVal,
        newVal: typeof newVal === 'object' ? '[voir historique]' : newVal,
      });
      cleanUpdates[field] = newVal;
    }

    if (changeEntries.length === 0) {
      return Response.json({ ok: true, message: 'Aucun changement détecté' });
    }

    const existingChangelog = Array.isArray(event.changelog) ? event.changelog : [];
    const newChangelog = [...existingChangelog, ...changeEntries];

    let pendingNotifications = Array.isArray(event.pendingNotifications)
      ? [...event.pendingNotifications]
      : [];

    if (needsNotification) {
      const sessions = await service.entities.Session.filter({ eventId });
      const session = sessions?.[0];

      if (session) {
        const slots = Array.isArray(session.slots) ? session.slots : [];
        const confirmedUserIds = new Set();

        for (const slot of slots) {
          const candidates = Array.isArray(slot.candidates) ? slot.candidates : [];
          for (const c of candidates) {
            if (c.status === 'confirmed' && c.userId) confirmedUserIds.add(c.userId);
          }
          if (slot.status === 'confirmed' && slot.candidateUserId) {
            confirmedUserIds.add(slot.candidateUserId);
          }
        }

        for (const uid of confirmedUserIds) {
          pendingNotifications.push({
            id: `notif-${uid}-${Date.now()}`,
            userId: uid,
            eventId,
            eventTitle: event.title,
            changes: changeEntries.map(e => e.label),
            at: now,
            read: false,
          });
        }
      }
    }

    await service.entities.Event.update(eventId, {
      ...cleanUpdates,
      changelog: newChangelog,
      pendingNotifications,
      updatedAt: now,
    });

    return Response.json({
      ok: true,
      changes: changeEntries.length,
      changelog: changeEntries,
      notified: needsNotification ? pendingNotifications.length : 0,
    });

  } catch (error) {
    console.error('updateEvent error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});