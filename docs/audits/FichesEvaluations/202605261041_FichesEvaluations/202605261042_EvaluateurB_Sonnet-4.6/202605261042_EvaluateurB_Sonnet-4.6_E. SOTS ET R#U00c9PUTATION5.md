━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — E. SOTS ET RÉPUTATION
Date d'évaluation : 26 mai 2026

Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • src/services/SOTSSubmissionService.js
  • src/repositories/SOTSRepository.js
  • src/repositories/ReputationRepository.js
  • src/core/guards/SOTSWindowGuard.js
  • src/core/guards/ContestationWindowGuard.js (referenced)
  • codeBase44_v3/base44/entities/SOTSSubmission.jsonc
  • codeBase44_v3/base44/entities/SOTSScoreSnapshot.jsonc
  • codeBase44_v3/base44/entities/SOTSDimensionConfig.jsonc
  • codeBase44_v3/base44/entities/ReputationLedger.jsonc
  • codeBase44_v3/base44/functions/submitSOTSRating/entry.ts v4 [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/transitionEngagement/entry.ts
    (table de transitions SOTS + guardPresenceProof inline) [DÉPLOYÉ]
  • codeBase44_v3/dataBase/SOTSDimensionConfig_export.csv (7 dimensions)
  • codeBase44_v3/dataBase/PolicyConfig_export.csv (sots_window: 24h)
  • codeBase44_v3/dataBase/SOTSSubmission_export.csv (0 enregistrements)
  • codeBase44_v3/dataBase/ReputationLedger_export.csv (0 enregistrements)
  • tests/p0/SOTS-SELF-01.js, GUARDS-CHAIN-01.js
Niveau de confiance : HAUTE sur le code déployé et canonique ;
                     HAUTE sur les lacunes de production.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• D-094 pattern 6 (SOTS_SELF_BENEFICIAL) bloque toute auto-note directe
  ou indirecte — OS V15 §2.7.1 table : "SOTSSubmissions consolidées".
  Aucun contournement possible, pas de SoloFounderOverride pour ce pattern.

• Les dimensions SOTS viennent de SOTSDimensionConfig (DB), jamais du code
  — D-079 : "Aucune dimension hardcodée. Calculé depuis dimensions internes."
  Fail-hard si SOTSDimensionConfig non seedé.

• Le ReputationLedger est append-only — chaque soumission SOTS crée une
  entrée immuable REP-* — OS V15 §16.0 LOI GREFFIER-01 + D-077 :
  "Chaque soumission SOTS = ReputationLedgerEntry immuable."

• La transition event_completed→sots_window_closed est dans la table
  de transitions déployée (allowedActors: organizer/system) —
  OS V15 §2.7.1 : "Fenêtre 24h écoulée · SOTSSubmissions consolidées."

• La transition contestation_window→payable est bloquée si aucun
  SOTSSubmission n'existe pour l'engagement — deployed `guardPresenceProof`
  lit `SOTSSubmission.filter({engagementId})` → passed: false si vide.
  OS V15 §2.7.1 D-019-B + D-075 C-08.

Ce domaine bloque tout le reste si :

• Une auto-note passe (D-094 pattern 6 contourné) — intégrité
  réputationnelle compromise définitivement en append-only. Pas de rollback.

• ReputationLedger est modifié ou supprimé (LOI GREFFIER-01 violée) —
  tout score peut être falsifié rétroactivement.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  COUCHE DÉPLOYÉE — submitSOTSRating v4 :
  Déployée et opérationnelle. Protections complètes :
  — D-094 pattern 6 : me.id === eng.talentUserId → HTTP 422 SOTS_SELF_BENEFICIAL,
    aucune persistance. Testé dans SOTS-SELF-01.
  — D-078 : seul l'organisateur peut noter (MVP). Vérification explicite.
  — D-079 : dimensions chargées depuis SOTSDimensionConfig (isActive:true).
    Fail-hard DIMENSIONS_NOT_SEEDED si entité vide. Aucun fallback hardcodé.
  — ReputationLedger append-only : create() après chaque SOTSSubmission.create().
    Si ReputationLedger.create() échoue : ok:true + warning (SOTSSubmission persiste).
  — Idempotency : soumission déjà existante par même évaluateur → retourné
    sans doublon (HTTP 200 idempotent:true).
  — score_units = score × 1000 (D-079 format 0-5000).
  Source : submitSOTSRating/entry.ts.

  SOTSDimensionConfig seeded : 7 dimensions actives en production.
  { reference, non_toxicite, adequation_mandat, experience_generee,
    professionnalisme_relationnel, fiabilite_operationnelle,
    performance_artistique }.
  sum(weight_ppm) = 1 000 000 exact. Source : analyse Python sur export.

  PolicyConfig sots_window_duration_hours : 24h ✓
  PolicyConfig contestationWindowDurationHours : 24h ✓

  CHEMIN NOMINAL DANS LE DÉPLOYÉ (transitionEngagement/entry.ts) :
  event_completed → sots_window_closed   [organizer/system, pas de guard spécifique]
  sots_window_closed → contestation_window [organizer/system, pas de guard spécifique]
  contestation_window → payable           [organizer/system, guardPresenceProof :
                                            SOTSSubmission.exists]
  Toutes ces transitions sont dans la table déployée. Source : entry.ts l.36-39.

  COUCHE JS CANONIQUE :
  SOTSSubmissionService.js : submit() + consolidate() + isConsolidated()
  complets. D-094 p6 hardened. Fenêtre close détectée via SOTSScoreSnapshot.
  SOTS-SELF-01 : 6/6 PASSED.
  SOTSWindowGuard.js : chemins A (scheduler), B (calcul depuis ouverture),
  admin override avec AdminIncidentRecord. Génère SchedulerDueTask quand
  fenêtre non close. GUARDS-CHAIN-01 : 19/19 PASSED (inclut
  event_completed→sots_window_closed).

Ce qui vient de V1 et est encore actif :
  V1 avait un système de scoring (validationScore, coPresenceCountAtCheckin)
  mais sans doctrine D-094 ni append-only formalisé. V3 est une
  reconstruction doctrinale — aucune donnée V1 ne peut migrer directement.
  Acquis conceptuel : la notation post-event est une pratique validée en V1.

Ce qui vient de V2 et a survécu :
  Aucun.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — aucun absolu pour le premier événement

  Les protections critiques (D-094, D-079, append-only) sont toutes
  opérationnelles dans le déployé. La première transaction peut être
  notée par l'organisateur sans risque de violation doctrinale.

  CONDITION OPÉRATIONNELLE (non technique) : l'organisateur DOIT
  soumettre une note SOTS avant que la transition
  contestation_window→payable soit déclenchée. Si l'organisateur ne
  note pas, la transition sera bloquée par guardPresenceProof
  (SOTSSubmission absent). Pour Event 1, ceci est gérable manuellement
  (SoloFounderOverride ou relance organisateur).
  Source : transitionEngagement/entry.ts guardPresenceProof l.79-84.

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-E-01] Interface UI à curseur unique pour Event 1.
  submitSOTSRating v4 envoie le même scoreUnits pour TOUTES les dimensions
  (pilot mode : single cursor). Le code contient explicitement :
  "// TODO Event 1 : exposer chaque dimension dans le formulaire UI."
  Les 7 dimensions sont correctement seedées mais toutes reçoivent le même
  score — la granularité réputationnelle est perdue pour Event 1.
  Source : submitSOTSRating/entry.ts l.142-148.

• [D-E-02] SOTS-WINDOW-01 test absent.
  Le fichier tests/p0/SOTS-WINDOW-01.js n'existe pas (`No such file`).
  SOTSWindowGuard est couvert via GUARDS-CHAIN-01 (hook présent) mais
  aucun test dédié aux chemins A/B/override/SchedulerDueTask du guard.
  Source : `head: cannot open tests/p0/SOTS-WINDOW-01.js`.

• [D-E-03] event_completed→sots_window_closed et sots_window_closed→
  contestation_window sans guard spécifique dans le déployé.
  Ces deux transitions n'ont que la vérification d'acteur (organizer/system)
  dans le deployed transitionEngagement. Le SOTSWindowGuard canonique
  (vérification fenêtre 24h, sotsConsolidated) n'est pas câblé.
  Conséquence pratique : l'organiser peut forcer sots_window_closed
  à tout moment sans attendre les 24h. Pour Event 1 piloté, acceptable.
  Source : transitionEngagement/entry.ts dispatch l.220+ (pas de case
  pour event_completed→sots_window_closed).

• [D-E-04] EMA non implémentée.
  L'OS (D-082) mentionne "EMA scores snapshotés à WORM Moment 5".
  La fonction computeAggregatedScore() du service utilise une moyenne
  arithmétique simple (pas EMA). Aucun module de calcul EMA détecté
  dans le codebase. Pour le premier événement (une seule donnée), la
  distinction moyenne/EMA est sans objet. Requis pour Event 2+ (historique).

• [D-E-05] Aucune donnée SOTS en production.
  SOTSSubmission_export.csv : 0 enregistrements (header seul).
  ReputationLedger_export.csv : 0 enregistrements.
  Le pilote ENG-H5V66Q-WBJ7N2 archivé n'a pas de SOTS associé —
  la transition contestation_window→payable a été bypassée.
  Event 1 commercial sera le premier test end-to-end réel.

REPORTABLE (peut attendre l'événement 2+) :

• SOTS modulation de commission (SOTS > 4.5 → ×0.90 mentionné en
  contexte mais absent de la doctrine OS V15 active — non documenté
  formellement comme décision en vigueur. À clarifier si applicable à Event 1).
• Scoring multi-dimensionnel (UI par curseur par dimension).
• EMA long-terme (requis à partir de l'historique multi-événements).
• Fenêtre SOTS auto-déclenchée par scheduler (Domain F dépendant).

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : Le chemin nominal dit que la
  transition contestation_window→payable est déclenchée soit par
  l'organisateur (validation explicite) soit par le scheduler
  (expiration de la fenêtre de contestation). Mais si l'organisateur
  ne soumet PAS de SOTS et que le scheduler n'est pas opérationnel
  (Domain F), la transition est bloquée indéfiniment.
  L'OS ne documente pas de procédure de déblocage manuel pour ce cas
  sur Event 1. SoloFounderOverride (D-106) couvre performed→payable mais
  pas contestation_window→payable explicitement. À clarifier avant Event 1.
  INFÉRENCE NON DOCUMENTÉE — à valider par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Aucune dette V1/V2 bloquante. V1 avait un scoring simple non formalisé —
il constitue une preuve de concept, pas une dette technique.

Dette interne V3 : la transition sots_window_closed sans garde temporelle
dans le déployé (D-E-03) est une simplification délibérée du pilote qui
devra être durcie avant de mettre la plateforme en production autonome.
C'est la même dette architecturale que dans les Domaines A, B, C, D :
la couche canonique JS est complète mais les guards déployés sont simplifiés.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour Event 1 commercial : câbler le guardSOTSWindow dans la fonction
transitionEngagement déployée (vérification 24h écoulées) et tester
la soumission d'une note réelle end-to-end en pré-event. Le cœur
doctrinal (D-094, D-079, append-only) est déjà en place.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ PRÊT SOUS CONDITIONS

  Conditions : (1) L'organisateur soumet une note SOTS après l'event,
  OU le scheduler déclenche automatiquement la consolidation et la
  transition après 24h (Domain F dépendant). (2) La fenêtre sots_window
  est clôturée (manuellement ou automatiquement) avant que la contestation
  window ne commence.
  Ces conditions sont opérationnelles (procédures), pas techniques.
  Le code de protection (D-094, D-079) est en place et testé.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• F. Scheduler est la dépendance directe pour que la fenêtre SOTS se
  ferme automatiquement après 24h et déclenche event_completed →
  sots_window_closed → contestation_window → payable sans intervention
  manuelle — OS V15 §2.7.1 table : transitions déclenchées par scheduler.
  Sans scheduler opérationnel pour Event 1, l'organisateur ou le fondateur
  doit déclencher ces transitions manuellement.

• D. Présence dépend de E pour la condition C-08 (SOTSSubmission requise
  dans PresenceProofGuard D-075) — OS V15 §2.7.1 D-075 C-08. Si E n'est
  pas complété (pas de SOTSSubmission), D est bloqué en aval.

  INFÉRENCE : Le fait que la première transaction commerciale sera aussi
  le premier test SOTS end-to-end en production constitue un risque
  opérationnel. Un exercice de dry-run sur un engagement test (distinct
  de Event 1) est recommandé avant le jour J. À valider par le fondateur.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — E. SOTS ET RÉPUTATION
Conserver pour le Prompt de Synthèse.