━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — D. PRÉSENCE ET PREUVE
Date d'évaluation : 26 mai 2026 14:33 EST
Fait avec Sonnet 4.6 Adaptatif
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • src/services/SessionPresenceService.js
  • src/repositories/SessionPresenceRepository.js
  • src/core/guards/PresenceWindowGuard.js
  • src/core/guards/PresenceProofGuard.js
  • codeBase44_v3/base44/entities/SessionPresence.jsonc
  • codeBase44_v3/base44/functions/createSessionPresence/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/transitionEngagement/entry.ts
    (guardPresenceWindow + guardPresenceProof inline) [DÉPLOYÉ]
  • codeBase44_v3/src/pages/TalentPresence.jsx v3 [MISE À JOUR AUJOURD'HUI]
  • codeBase44_v3/dataBase/PolicyConfig_export.csv (seuils présence)
  • [absence] SessionPresence_export.csv dans V3 DB
  • codeBase44_v1/dataBase/SessionPresence.csv (119 records V1)
  • tests/p0/SESSION-PRESENCE-01.js, PRESENCEPROOF-01.js, GUARDS-CHAIN-01.js
Niveau de confiance : HAUTE sur le code canonique ;
                     HAUTE sur les lacunes du déployé ;
                     INFÉRENCE sur le status de la transition end-to-end
                     (aucun enregistrement V3 en production).
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• Une SessionPresence est créée (check-in talent) avant la transition
  event_sealed→performed — OS V15 §2.7.1 table : "SessionPresence
  initiée". Préfixe IDFactory SPR-*.

• La transition event_sealed→performed est bloquée si la fenêtre de
  check-in n'est pas ouverte (eventScheduledStartAt − checkInWindowMinutes)
  — OS V15 §2.7.1 table (PresenceWindowGuard).

• La transition contestation_window→payable est bloquée si les 11
  conditions D-075 ne sont pas satisfaites, notamment :
  C-04 (GPS distance ≤ maxDistancePolicy),
  C-05 (durée ≥ seuil contractuel),
  C-08 (SOTSSubmission présente) — OS V15 §2.7.1 table :
  "11 conditions D-075 vérifiées · payout autorisé".

• Tous les seuils de présence (maxDistancePolicy, minDurationFloorMinutes,
  minDurationRatioPpm, checkInWindowMinutes) sont en base de données via
  PolicyConfig (Market Pivot) — aucune constante dans le code.

Ce domaine bloque tout le reste si :

• La transition event_sealed→performed est possible sans SessionPresence —
  la chaîne de preuve physique est coupée dès le premier maillon.

• La transition contestation_window→payable est possible sans preuve GPS
  ni durée minimale — le paiement ne serait pas conditionné à la preuve
  de livraison physique, contredisant la promesse fondatrice OS V15 §1.4.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  COUCHE JS CANONIQUE :
  SessionPresenceService.js : create() + recordCheckout() + getByEngagementId()
  implémentés, IDFactory SPR-* respecté, validation entière finalDurationMinutes
  (D-064), zéro logique de validation (séparation service/guard).
  SESSION-PRESENCE-01 : 7/7 PASSED.

  PresenceWindowGuard.js : trois conditions vérifiées séquentiellement :
  (1) fenêtre checkInWindowMinutes ouverte depuis eventScheduledStartAt,
  (2) sessionPresenceId au format SPR-* présent dans context,
  (3) lecture PolicyConfig fail-closed. GUARDS-CHAIN-01 : 19/19 PASSED.

  PresenceProofGuard.js : 11 conditions D-075 complètes — C-01 état source,
  C-02 ContractSnapshot phase 2, C-03 checkedInAt non-null, C-04 GPS ≤ seuil,
  C-05 durée ≥ max(plancher, ratio contrat), C-06 validation organisateur,
  C-07 pas de SafetyReport bloquant, C-08 SOTSSubmission, C-09 pas de litige,
  C-10 montant > 0, C-11 idempotency (pas de SettlementInstruction existant).
  Tous les seuils lus depuis PolicyConfig. PRESENCEPROOF-01 : 25/25 PASSED.

  SEUILS SEEDÉS EN PRODUCTION :
  checkInWindowMinutes : 60 min
  maxDistancePolicy : 500 m
  minDurationFloorMinutes : 30 min
  minDurationRatioPpm : 950 000 (95%)
  contestationWindowDurationHours : 24 h
  Source : PolicyConfig_export.csv.

  COUCHE DÉPLOYÉE BASE44 :
  createSessionPresence/entry.ts : crée un SessionPresence avec
  engagementId, talentUserId, checkInAt (Date.now()), gpsCoordinates
  (lat/lng/accuracy en JSON), signalTypes=['GPS']. Idempotency :
  si SessionPresence existante → retour sans doublon.
  Validations : état valid ['event_sealed','deposit_secured'], acteur = talent.

  TalentPresence.jsx v3 (mise à jour ce jour) : flux en 3 étapes :
  idle → check-in GPS → transition performed → done. Déclenche
  createSessionPresence + transitionEngagement('event_sealed','performed').
  Page opérationnelle selon les sources.

Ce qui vient de V1 et est encore actif :
  V1 a 119 enregistrements SessionPresence réels avec GPS complet
  (geoLatIn, geoLngIn, distanceMIn, durationMin). Le concept de check-in
  GPS est prouvé en V1. Avantage : le problème UX et l'ergonomie du
  check-in sont validés par l'expérience V1. Dette : le schéma V1
  (eventId, role, sessionId) est incompatible avec V3 (engagementId,
  talentUserId, SPR-*). Aucune migration directe possible.

Ce qui vient de V2 et a survécu :
  Aucun. V2 abandonnée avant tout développement présence.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — empêche la première transaction conforme :

• [B-D-01] GPS DISTANCE NON CALCULÉE dans le déployé.
  createSessionPresence/entry.ts retourne `distanceMeters: null` (l.86).
  La fonction stocke les coordonnées GPS brutes du talent (lat/lng)
  mais ne calcule pas la distance haversine par rapport aux coordonnées
  du lieu. Sans `gpsDistanceMeters`, la condition C-04 de PresenceProofGuard
  (GPS ≤ maxDistancePolicy) ne peut être vérifiée par la couche canonique.
  Source : grep distanceMeters dans createSessionPresence/entry.ts l.86.
  Impact sur la première transaction : la couche canonique (PresenceProofGuard)
  BLOQUERAIT la transition contestation_window→payable via C-04_NO_GPS_DATA.
  La couche déployée (`guardPresenceProof`) ne vérifie PAS la distance —
  donc le premier événement PASSE sans validation GPS réelle.
  Constat : la promesse fondatrice "présence prouvée" (OS V15 §1.4) n'est
  pas honorée techniquement sur la première transaction avec le déployé actuel.
  Décision fondateur requise : accepter le bypass GPS pour le pilote, ou
  implémenter le calcul haversine avant Event 1.

• [B-D-02] AUCUN SESSIONPRESENCE EN PRODUCTION V3.
  Pas de SessionPresence_export.csv dans codeBase44_v3/dataBase/.
  L'Engagement archivé ENG-H5V66Q-WBJ7N2 a traversé le cycle complet
  (event_sealed → performed → … → archived) sans SessionPresence formelle.
  Les transitions ont été effectuées via Engagement.update direct (bypass
  LOI TRANSITION-01, confirmé en Domaine A). La TalentPresence.jsx a été
  mise à jour AUJOURD'HUI pour inclure le déclenchement de la transition
  performed — ce flux n'a jamais été testé en production.
  Source : absence de SessionPresence_export.csv + TalentPresence.jsx
  header "CHANGEMENTS v3 (26 mai 2026)".
  Impact : le premier Event 1 commercial sera le PREMIER test end-to-end
  de ce mécanisme en production.

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-D-01] Guards déployés simplifiés vs 11 conditions canoniques.
  guardPresenceWindow déployé : vérifie seulement que SessionPresence
  EXISTS (pas de fenêtre horaire, pas de format SPR-*).
  guardPresenceProof déployé : vérifie seulement que SOTSSubmission
  EXISTS (aucune des 11 conditions D-075 : pas de GPS, pas de durée,
  pas de ContractSnapshot phase 2, pas d'idempotency check).
  Source : transitionEngagement/entry.ts l.55-67 + l.70-78.

• [D-D-02] ContractSnapshot phase 2 (C-02) absent de la production.
  La condition C-02 de PresenceProofGuard canonique exige CS2 complet.
  Puisque CS2 n'est jamais persisté (Domain A B-A-03), la couche
  canonique échouerait systématiquement à C-02 avant même d'atteindre C-04.
  La couche déployée ne vérifie pas CS2. Découplage confirmé.

• [D-D-03] Durée `finalDurationMinutes` non transmise au moment du check-in.
  La durée réelle ne peut être calculée qu'au checkout (checkOutAt - checkInAt).
  recordCheckout() existe dans SessionPresenceService.js mais n'est pas
  appelé par TalentPresence.jsx v3 actuelle (la page gère le check-in,
  pas le check-out). Source : TalentPresence.jsx — aucune mention de
  recordCheckout dans les imports.

REPORTABLE (peut attendre l'événement 2+) :

• Gestion multi-signal (GPS + WIFI) : seul GPS implémenté.
• SafetyReport (C-07) : entité non créée dans V3 — condition C-07 ne
  peut jamais bloquer (activeSafetyReport toujours null).
• Co-présence (V1 avait coPresenceCountAtCheckin) : non implémentée en V3.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : L'OS (§2.7.1) spécifie que
  PresenceWindowGuard requiert "SessionPresence initiée" pour la
  transition event_sealed→performed. Mais il ne spécifie pas QUI
  déclenche cette transition dans le flux actuel — le talent (via
  TalentPresence.jsx) ou l'organisateur ? TalentPresence.jsx v3 montre
  que c'est le talent (me.id === eng.talentUserId dans createSessionPresence).
  Mais le deployed transitionEngagement autorise la transition event_sealed
  →performed uniquement pour `allowedActors: ['talent']`. Si le talent
  ne dispose pas de l'application ou n'effectue pas son check-in, l'event
  reste bloqué en event_sealed. Procédure de déblocage pour Event 1
  (SoloFounderOverride ?) non documentée formellement. À valider.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

V1 a 119 SessionPresence réels (GPS, durée, distance) — concept validé.
La dette est que le schéma V1 est incompatible avec V3 (eventId vs
engagementId, pas de talentUserId comme clé principale, pas de SPR-*).
L'expérience UX V1 (distanceMIn en mètres, durationMin) guide le design
V3 mais aucune donnée ne peut migrer directement. C'est un acquis
conceptuel, pas une dette bloquante.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Deux actions pour que ce domaine soit prêt pour Event 1 commercial :
(1) implémenter le calcul haversine dans createSessionPresence pour
produire `gpsDistanceMeters` depuis les coordonnées talent et les
coordonnées du lieu (venue); (2) tester end-to-end le flux complet
check-in → performed sur un engagement réel en pre-event.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ EN COURS → 55% estimé

  Acquis : SessionPresenceService + repository + guards canoniques
  complets et testés (7+25+19 tests PASSED). Seuils PolicyConfig seedés.
  createSessionPresence déployé. TalentPresence.jsx v3 opérationnelle.

  Ce qui reste : (1) calcul GPS distance dans createSessionPresence ;
  (2) validation end-to-end en pre-event sur un engagement réel.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• E. SOTS et réputation ne peut pas être vérifié sans que D soit
  complété : le SOTS est soumis APRÈS la présence physique — si
  la présence est bypassée (pas de SessionPresence), le SOTS ne
  peut pas être correctement lié à une prestation réelle.
  OS V15 §2.7.1 : sots_window_closed est un moment WORM — mais
  il dépend d'event_completed qui dépend de performed qui dépend
  de la présence.

• A. Ontologie dépend de ce domaine pour la transition
  event_sealed→performed : si le guardPresenceWindow déployé est
  trop permissif (existence seulement), la doctrine WORM en aval
  repose sur une présence non vérifiée. Dépendance qualitative,
  non bloquante pour la mécanique.

  INFÉRENCE : la première transaction commerciale sera le premier
  test de ce mécanisme end-to-end en V3. Le risque opérationnel
  est que le talent ne sache pas utiliser TalentPresence.jsx ou
  qu'un bug GPS bloque la transition performed. Un SoloFounderOverride
  de secours (D-106) est disponible depuis l'état performed mais pas
  depuis event_sealed. À préparer pour Event 1.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — D. PRÉSENCE ET PREUVE
Conserver pour le Prompt de Synthèse.