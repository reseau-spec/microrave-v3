━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — D. Présence et preuve
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§1.1, §2.7.1
    lignes PresenceWindowGuard / PresenceProofGuard, §14.9
    Pierre de Rosette Carte C06)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-075 « 11 conditions », D-093 / D-093-A « faisceau
    d'indices pondérés », PresencePolicyConfig)
  • codeBase44_v3/base44/functions/{createSessionPresence,
    transitionEngagement}/entry.ts
  • codeBase44_v3/base44/entities/{SessionPresence, Event,
    Engagement}.jsonc
  • codeBase44_v3/src/pages/TalentPresence.jsx
  • codeBase44_v3/dataBase/Event_export.csv (24 events)
  • Aucun dataBase/SessionPresence_export.csv en V3 (absent)
  • Référence historique : microrave-v3/codeBase44_v1/dataBase/
    SessionPresence.csv (119 lignes) + codeBase44_v2/dataBase/
    SessionPresence_export.csv (63 lignes)
  • microrave-v3/src/core/guards/PresenceProofGuard.js
  • microrave-v3/src/services/SessionPresenceService.js
    (portable, non branché)
  • microrave-v3/tests/p0/{SESSION-PRESENCE-01, PRESENCEPROOF-01}.js
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE (lecture directe ; absence de
    SessionPresence en base confirmée ; preuve d'antériorité
    via V1/V2 archives)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Le lieu porte ses coordonnées géographiques en base :
     « Un lieu peut être un Checkpoint reconnu dans l'écosystème
     (bar, salle culturelle, studio) ou une simple EventLocation
     ponctuelle (rang privé, gymnase scolaire, résidence). Dans
     les deux cas, le lieu porte une mémoire culturelle attachée
     à ses coordonnées géographiques exactes. »
     — Source : OS V15 §1.1

   • La transition `event_sealed → performed` passe le
     PresenceWindowGuard : « Date event passée · check-in window
     ouverte · SessionPresence initiée. »
     — Source : OS V15 §2.7.1 ligne event_sealed→performed

   • La transition `contestation_window → payable` passe le
     PresenceProofGuard : « Fenêtre de contestation expirée sans
     DisputeRecord ouvert · 11 conditions D-075 vérifiées ·
     payout autorisé. »
     — Source : OS V15 §2.7.1 ligne contestation_window→payable

   • Les 11 conditions D-075 sont évaluées :
       C-01 event_sealed = true · C-02 status admissible
       C-03 SessionPresence.checkedInAt != null
       C-04 géolocalisation cohérente avec maxDistancePolicy
       C-05 présence temporelle cohérente avec minDurationPolicy
       C-06 validation organisateur OU fenêtre contestation expirée
       C-07 SOTSSubmission soumis (« requis, pas optionnel »)
       C-08 aucun DisputeRecord blocking
       C-09 aucun SafetyReport bloquant
       C-10 Ledger invariant vérifié (LOI LEDGER-02)
       C-11 Payment / escrow réellement secured
     — Source : D-075, EXPORT_BRUT §BLOC 8

   • PresenceProofResolver D-093 fait converger les signaux
     (GPS + WIFI + MANUAL) selon faisceau d'indices pondérés :
     « GPS n'est pas obligatoire — signal fort parmi d'autres. »
     Anti-spoofing dans SpoofingDetectionPolicyConfig.
     — Source : D-093 / D-093-A, EXPORT_BRUT §BLOC 11

   • Pour Pierre de Rosette (§14.9 Carte C06) : « GPS ✓ · SOTS ✓
     · Ledger ✓ · Pas de dispute ✓ · 11/11 ». GPS est exigé pour
     la première transaction canonique.
     — Source : OS V15 §14.9

   Ce domaine bloque tout le reste si :

   • Aucune SessionPresence n'est créée → `event_sealed →
     performed` ne peut pas se déclencher → la chaîne s'arrête à
     event_sealed (Moment WORM 3, Niveau 2 — Fraude si touché).
     — Source : OS V15 §2.7.1 PresenceWindowGuard + §2.7 Moment 3

   • Les 11 conditions D-075 ne sont pas évaluables → payout
     automatique impossible → seul un SoloFounderOverride permet
     `performed → payable`, ce qui exige un AdminIncidentRecord
     (D-019-A D-106).
     — Source : OS V15 §2.7.1 ligne performed→payable

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • Authentification correcte : createSessionPresence exige
     `me.id === eng.talentUserId`, sinon 403 FORBIDDEN.
     — Source : createSessionPresence/entry.ts l.37-39

   • Idempotence : si une SessionPresence existe déjà pour
     (engagementId, talentUserId), la fonction renvoie
     `idempotent: true` avec l'ID existant.
     — Source : createSessionPresence/entry.ts l.49-60

   • UX talent : `navigator.geolocation.watchPosition` avec
     `enableHighAccuracy: true` ; gate client-side à
     `pos.coords.accuracy <= 50` avant `setStep('confirming')`.
     — Source : src/pages/TalentPresence.jsx l.97-111

   • PolicyConfig partielle seedée pour les seuils de présence :
       maxDistancePolicy = 500 (m)
       minDurationFloorMinutes = 30
       minDurationRatioPpm = 950 000 (95 %)
       checkInWindowMinutes = 60
     — Source : dataBase/PolicyConfig_export.csv

   • Le guard portable PresenceProofGuard
     (microrave-v3/src/core/guards/) implémente intégralement les
     11 conditions D-075, lit les seuils via
     `repositories.policyConfig.getConfig()` (fail-closed si
     POLICY_CONFIG_MISSING), distingue `SOLO_FOUNDER_OVERRIDE` /
     `CONTESTATION_WINDOW_EXPIRED` dans `transitionReason`.
     — Source : src/core/guards/PresenceProofGuard.js l.53-348

   • Test P0 PRESENCEPROOF-01 couvre les 11 conditions plus le
     chemin nominal et la voie SoloFounderOverride.
     — Source : tests/p0/PRESENCEPROOF-01.js l.1-25

   Ce qui vient de V1 et est encore actif :

   • V1 (microrave.ca) a généré 119 SessionPresence persistées
     dans codeBase44_v1/dataBase/SessionPresence.csv. Le schéma
     V1 portait : checkpointSystemId, distanceMIn,
     coPresenceCountAtCheckin, validationScore (0-100),
     sessionStateAtCheckin, isValidEntry, isValidExit,
     autoClosedAt, role (artist/organizer), durationMin,
     status (auto_closed/active/completed).
     → ACQUIS DOCTRINAL : V1 prouve que la mécanique a tourné
       et a produit de la donnée discriminante (isValidEntry,
       validationScore). Ces concepts existent en doctrine.
     → DETTE : ces champs ont été perdus en V3 (voir §3
       DÉGRADANT).
     — Source : codeBase44_v1/dataBase/SessionPresence.csv

   Ce qui vient de V2 et a survécu :

   • V2 a produit 63 SessionPresence avec le même schéma riche
     (codeBase44_v2/dataBase/SessionPresence_export.csv). Échec
     de l'effort V2 acté (« V2 abandonnée faute de fondations »
     selon le prompt de contexte) : aucun de ces records n'a été
     migré dans V3, et le schéma a été rétréci.
     → DETTE PURE : V3 part d'un schéma plus pauvre que V1/V2,
       sans bénéficier de leur historique.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • L'entité Event Base44 N'A AUCUNE coordonnée géographique :
     8 champs déclarés (systemId, organizerUserId, name, venue,
     scheduledStartAt, status, createdAt) — venue est une string
     simple, pas un objet GPS. Sans coordonnées du lieu en base,
     C-04 D-075 (« géolocalisation cohérente avec
     maxDistancePolicy ») est inévaluable. Loi V15 §1.1 (« le
     lieu porte sa mémoire culturelle attachée à ses coordonnées
     géographiques exactes ») non implémentée.
     — Source : codeBase44_v3/base44/entities/Event.jsonc
     — Confirmé par data : les 24 Event en base ont des `venue`
       comme '123', '120', '300', '06' — placeholders numériques.

   • createSessionPresence ne calcule PAS la distance GPS :
     `distanceMeters: null` est hardcodé dans la réponse
     (l.86). La fonction ne charge même pas l'Event lié pour en
     extraire des coordonnées (qui de toute façon n'existent
     pas en base). gpsDistanceMeters n'est jamais persisté dans
     le SessionPresence.
     — Source : createSessionPresence/entry.ts l.65-89

   • createSessionPresence ne vérifie PAS la fenêtre temporelle
     `checkInWindowMinutes = 60`. N'importe quel timestamp est
     accepté. PresenceWindowGuard de l'OS exige « Date event
     passée · check-in window ouverte. »
     — Source : createSessionPresence/entry.ts (absence) ;
       OS V15 §2.7.1 PresenceWindowGuard

   • createSessionPresence autorise le check-in depuis
     `deposit_secured` (l.41) — alors que la transition d'arrivée
     normative est `event_sealed → performed`. L'OS n'autorise
     pas de SessionPresence avant scellement (Moment WORM 3).
     — Source : createSessionPresence/entry.ts l.41-47 ; OS V15
       §2.7.1

   • Le guard guardPresenceWindow du transitionEngagement Base44
     ne vérifie qu'UNE chose : « SessionPresence existe pour
     (engagementId, talentUserId) ». Aucune vérification de
     fenêtre, de distance, de signal. C'est le degré minimal du
     PresenceWindowGuard exigé par l'OS.
     — Source : codeBase44_v3/.../transitionEngagement/entry.ts
       l.56-66

   • Le guard guardPresenceProof du transitionEngagement Base44
     ne vérifie qu'UNE chose : « SOTSSubmission existe ». Aucune
     des 10 autres conditions D-075 n'est évaluée. Le guard
     portable PresenceProofGuard les couvre toutes, mais n'est
     pas branché.
     — Source : codeBase44_v3/.../transitionEngagement/entry.ts
       l.77-87 vs src/core/guards/PresenceProofGuard.js (non
       appelé)

   • Aucune fonction de check-out dans codeBase44_v3/base44/
     functions/. Le champ SessionPresence.checkOutAt n'est jamais
     écrit, donc finalDurationMinutes reste null, donc C-05
     D-075 (présence temporelle cohérente avec
     minDurationPolicy) est inévaluable.
     — Source : codeBase44_v3/base44/functions/ (absence)

   • Aucune SessionPresence n'a jamais été créée en V3 :
     SessionPresence_export.csv est ABSENT du dossier dataBase/.
     Au moment où l'engagement ENG-WE66GU-AASWFD a été
     « scellé » (event_sealed), aucun check-in n'avait été
     enregistré — ce qui empêchera `event_sealed → performed`
     même si tous les guards étaient correctement branchés.
     — Source : ls dataBase/SessionPresence_export.csv → absent

   • Aucune entité Checkpoint ni EventLocation dans
     codeBase44_v3/base44/entities/. Les deux concepts existent
     dans l'OS V15 §1.1 mais sont sans substrat en base.
     — Source : codeBase44_v3/base44/entities/ (liste exhaustive)

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • Régression de schéma V3 vs V1/V2. Champs perdus :
       — checkpointSystemId (lien lieu reconnu)
       — distanceMIn (distance check-in en mètres)
       — isValidEntry / isValidExit
       — validationScore (0-100)
       — autoClosedAt (clôture automatique par scheduler)
       — coPresenceCountAtCheckin (co-présence pour D-093)
       — role (artist/organizer — pour cross-validation)
     Le V3 ne sait pas, en lisant un SessionPresence, si l'entrée
     a été validée. Tous ces champs sont nécessaires au faisceau
     d'indices D-093.
     — Source : V3 SessionPresence.jsonc vs V1/V2 SessionPresence

   • Stockage `gpsCoordinates` incohérent : le schéma déclare
     `"type": "object"` mais createSessionPresence le persiste
     comme `JSON.stringify({...})` — chaîne. Soit le schéma ment,
     soit la fonction ment. À aligner.
     — Source : SessionPresence.jsonc l.26-29 vs
       createSessionPresence/entry.ts l.70-74

   • Les données Event en base portent des `venue` non-adresses
     ('123', '120', '06', '015', '01'). Même si les coordonnées
     existaient, ces enregistrements seraient inutilisables. Le
     champ `venue` est libre et non validé.
     — Source : dataBase/Event_export.csv

   • Gate client-side `pos.coords.accuracy <= 50` (TalentPresence
     l.101) est trivialement contournable par un client modifié.
     Le serveur doit aussi valider, mais createSessionPresence
     accepte `gpsAccuracyMeters: null` (l.73).

   REPORTABLE (peut attendre l'événement 2+) :

   • D-093 PresenceProofResolver multi-signal (GPS + WIFI +
     MANUAL, faisceau d'indices pondérés, anti-spoofing). Le
     code actuel n'émet que `signalTypes: ['GPS']` en dur.
     Reportable car pour Pierre de Rosette mono-talent, GPS
     suffit si correctement implémenté.
     — Source : createSessionPresence/entry.ts l.75 ; D-093

   • SpoofingDetectionPolicyConfig, PresencePolicyConfig — non
     présentes dans les 36 entrées PolicyConfig actuelles.
     Reportable post-Event 1.

   ANGLE MORT POTENTIEL :

   L'OS V15 §14.9 « Pierre de Rosette » exige « GPS ✓ » pour
   Carte C06 (11 conditions), mais l'OS ne précise pas COMMENT le
   référent géographique est fixé pour un EventLocation
   ponctuelle (rang privé, résidence, gymnase scolaire). Pour un
   Checkpoint, on peut imaginer un référentiel stable (le bar a
   une adresse fixe). Pour une EventLocation ponctuelle, qui
   saisit les coordonnées exactes — l'organisateur au moment de
   créer l'événement ? Le talent au check-in ? Un service de
   géocodage ?
   → INFÉRENCE NON DOCUMENTÉE : la doctrine d'établissement des
     coordonnées d'un lieu n'est pas tranchée dans l'OS V15.
     Pour Pierre de Rosette (Checkpoint CP-PLATEAU-0001), un
     référentiel pré-établi est implicite — mais il faut une
     entité Checkpoint en base. À trancher par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   V1 a généré 119 SessionPresence riches (avec distance,
   validation, durée, co-présence) ; V2 a généré 63 SessionPresence
   du même schéma — soit 182 traces opérationnelles archivées
   dans `microrave-v3/codeBase44_v[12]/dataBase/`. Aucune n'a été
   migrée en V3. Le schéma V3 a régressé. La doctrine
   PresenceProofResolver D-093 (faisceau pondéré) existait en
   V1 (validationScore 0-100, signalTypes implicites) — elle a
   été perdue dans la transition.

   La V3 part de zéro substrat tout en ayant deux générations
   d'expérience opérationnelle accessibles. C'est une dette
   d'ingénierie, pas une dette doctrinale.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) ajouter à l'entité Event
   les champs `venueLatitude`, `venueLongitude`,
   `venueAccuracyMeters` (ou créer une entité Checkpoint /
   EventLocation portant ces champs, référencée par Event), (ii)
   compléter createSessionPresence pour charger l'Event, calculer
   la distance Haversine, persister gpsDistanceMeters, vérifier
   la fenêtre checkInWindowMinutes et l'accuracy minimale, (iii)
   ajouter une fonction de check-out qui persiste checkOutAt et
   calcule finalDurationMinutes, (iv) brancher le PresenceProofGuard
   portable dans la transition Base44 `contestation_window →
   payable` à la place du guardPresenceProof actuel
   (« SOTSSubmission existe »), (v) restaurer dans le schéma
   SessionPresence les champs V1/V2 nécessaires aux signaux
   D-093 (distanceMIn, isValidEntry/Exit, validationScore,
   checkpointSystemId).

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ BLOQUÉ PAR → Domaine A (ontologie) + déficit propre.

   Domaine A bloque la création du ContractSnapshot phase 2 ; or
   PresenceProofGuard C-02 exige `contractSnapshotPhase2` comme
   contexte. Sans CS2, le guard ne peut pas répondre passed.

   Mais Domaine D a aussi un bloqueur autonome : sans coordonnées
   du lieu en base (Event ou Checkpoint), aucun guard ne peut
   évaluer C-04 même si tout le reste était en place. C'est un
   blocage indépendant de A.

   Estimation indicative hors règle 3 :
     — Schéma Event/Checkpoint pour le lieu : 0 % (aucune coord.).
     — createSessionPresence : 30 % (auth + idempotence ✓ ;
       calcul distance, fenêtre, accuracy, check-out absents).
     — guardPresenceWindow Base44 : 10 % (existence-only).
     — guardPresenceProof Base44 : 10 % (SOTS-only sur 11
       conditions).
     — PresenceProofGuard portable : 100 % codé, 0 % branché.
     — UX TalentPresence.jsx : 60 % (watchPosition + accuracy
       gate ✓ ; pas de feedback de distance au lieu).
     — Données opérationnelles V3 : 0 SessionPresence en base.
   Effectif fonctionnel pour première transaction réelle : 0 %.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine A (machine d'état) — la transition `event_sealed →
     performed` exige PresenceWindowGuard PASSED. Tant que
     SessionPresence n'est pas correctement enregistrée et
     vérifiée, A reste bloqué à event_sealed.
     — Source : OS V15 §2.7.1 ligne event_sealed→performed

   • Domaine B (finance et ledger) — le payout `payable → settled`
     ne s'exécute qu'après le passage par contestation_window →
     payable, qui exige PresenceProofGuard PASSED (11 conditions).
     Tant que Domaine D n'évalue pas les 11 conditions, payable
     n'est jamais atteint nominalement.
     — Source : OS V15 §2.7.1 ligne contestation_window→payable

   • Domaine E (SOTS et réputation) — C-08 de D-075 dépend de la
     SOTSSubmission, mais SOTS lui-même dépend du check-in
     (LOI SOTS-CHECKIN, voir Domaine E). Si SessionPresence
     n'existe pas, SOTS ne devrait pas être soumissible.
     — Source : D-075 condition 7 ; OS V15 §16 LOI SOTS-* (à
       confirmer en Domaine E)

   • Domaine F (Scheduler) — la SchedulerDueTask `seal_event` et
     les tâches de clôture de session (autoClosedAt en V1)
     n'ont plus de cible : le scheduler ne peut pas arroser une
     SessionPresence qui n'existe pas.
     — Source : D-100 jobs P0 (EXPORT_BRUT)

   • Domaine J (Acteurs et onboarding) — Checkpoint est un
     acteur central de l'écosystème (OS V15 §1.1 triptyque
     « talent ↔ organisateur ↔ lieu »). L'absence d'entité
     Checkpoint en V3 est un trou commun à D et J.
     — Source : OS V15 §1.1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — D. Présence et preuve
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━