━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — E. SOTS et réputation
(check-in requis, auto-note bloquée, append-only, EMA)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-026, D-075, D-077, D-078, D-079, D-080, D-081,
     D-082, D-083, D-094, TEST_REGISTRY Catégorie 4)
  • SOTSWindowGuard.js · ContestationWindowGuard.js
  • PresenceProofGuard.js (C-08) · NoShowGuard.js
  • IDFactory.js · config/policy-config-schema.js
  • tests/p0/ : GUARDS-CHAIN-01 (crash Linux hérité),
    PRESENCEPROOF-01 (C-08 passé)
    (exécutés en direct ou en isolation)
Niveau de confiance : HAUTE sur les guards de fenêtre
                        (SOTSWindowGuard, ContestationWindowGuard)
                      INFÉRENCE sur ReputationLedger, SOTSSubmission,
                        SOTSScoreSnapshot, EMA — aucun service visible
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- SOTSSubmission du talent soumise pendant la fenêtre SOTS 24h
  (condition C-08 de D-075) — D-075 condition 7, EXPORT_BRUT
  section D-075 : "SOTSSubmission du talent soumis ← requis,
  pas optionnel"
- ReputationLedger entry créée (append-only) pour chaque
  soumission — D-077 : "Chaque soumission SOTS =
  ReputationLedgerEntry immuable", EXPORT_BRUT section D-077
- SOTSWindowGuard PASSED : fenêtre 24h écoulée et
  sotsConsolidated=true avant sots_window_closed — OS V15
  section 2.7.1, SOTSWindowGuard.js
- ContestationWindowGuard PASSED à sots_window_closed→
  contestation_window : SchedulerDueTask créée — OS V15
  section 2.7.1
- SOTS actif dès MVP : score par défaut 3/5 = 3000 units
  pour tout nouveau talent sans historique — D-026, EXPORT_BRUT
  section D-026
- isSelfOrganized=false pour SC-01 Pierre de Rosette (DJ Alex
  ≠ Le Trèfle) → auto-notation bloquée par design — OS V15
  section 2.7.1, PlacementGuard.js
- sots_window_duration_hours en database — EXPORT_BRUT
  POLICYCONFIG_REGISTER, config/policy-config-schema.js
- SOTS-SELF-01 (P0, requiredBeforeEvent=1) PASSED —
  EXPORT_BRUT TEST_REGISTRY Catégorie 4

Ce domaine bloque tout le reste si :

- SOTSSubmission du talent absente à contestation_window→payable
  — C-08_NO_SOTS bloque PresenceProofGuard → payout impossible
  — D-075 condition 7
- ReputationLedger non append-only (modification ou suppression
  d'une entrée) — D-077 : immuabilité institutionnelle
- SOTS_SELF-01 (auto-note) non bloquée — D-094 pattern 6 :
  "SOTS_SELF_BENEFICIAL — auto-note directe ou indirecte →
  blocage absolu"

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

SOTSWindowGuard.js — Opérationnel et testé en isolation.
  • Deux chemins : A (sotsWindowClosedAt fourni par scheduler),
    B (sotsWindowOpenedAt + calcul depuis DB) — source :
    SOTSWindowGuard.js.
  • sots_window_duration_hours lu depuis PolicyConfigRepository
    — jamais hardcodé — source : SOTSWindowGuard.js.
  • Retourne une SchedulerDueTask si fenêtre pas encore close —
    pattern identique à ContestationWindowGuard — source :
    SOTSWindowGuard.js.
  • Admin override avec adminIncidentRecordId obligatoire —
    source : SOTSWindowGuard.js.
  • Testé en isolation (node -e) : chemin A PASSED, chemin B
    PASSED (24h écoulées), fenêtre ouverte → passed:false +
    schedulerTask retourné — source : exécution directe.
  • GUARDS-CHAIN-01 T-11 à T-16 couvrent ce guard mais
    crashent sur casse Linux (hérité Domaine A).

ContestationWindowGuard.js — Opérationnel.
  • Lit contestationWindowDurationHours depuis DB, calcule
    dueAt, construit la SchedulerDueTask pour
    contestation_window→payable — source :
    ContestationWindowGuard.js.
  • CONTESTATION-WINDOW-01 : PASSED — source : exécution
    directe session.

PresenceProofGuard C-08 — PASSED.
  • Vérifie sotsSubmission présente avant payout automatique —
    source : PresenceProofGuard.js lignes 271–280.
  • 25/25 PASSED sur PRESENCEPROOF-01 incluant C-08 — source :
    exécution directe.

NoShowGuard — Opérationnel.
  • sots_window_closed→no_show déclenché si SOTSSubmission du
    talent absente à l'expiration de la fenêtre — source :
    NoShowGuard.js (sotsSubmission null = no-show confirmé).
  • NO-SHOW-PRE-01 : PASSED — source : exécution directe.

isSelfOrganized calculé dans PlacementGuard.
  • isSelfOrganized = (talentUserId === organizerUserId).
    Conséquence documentée : "auto-notation bloquée" —
    source : PlacementGuard.js lignes 123–130.
  • Pour SC-01 Pierre de Rosette : DJ Alex ≠ Le Trèfle →
    isSelfOrganized=false, donc C-06 exige validation
    organisateur ou expiration fenêtre — nominal.

IDFactory — SOTSRecord préfixe 'SOT' défini — source :
  IDFactory.js ligne 39.

sots_window_duration_hours dans policy-config-schema.js :
  INTEGER, STANDARD, description complète — source :
  policy-config-schema.js lignes 122–133.

Ce qui vient de V1 et est encore actif :
  V1 n'a pas de système SOTS formel. Les notes et
  recommandations de V1 sont informelles (réseaux sociaux,
  bouche-à-oreille). ACQUIS : la culture de feedback existe
  dans le réseau. DETTE : aucune donnée de réputation
  structurée à migrer.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-E1 — SOTSSubmission entity : aucun service de
  création ni persistance visible.
  ReputationLedger, SOTSSubmission, SOTSScoreSnapshot sont
  définis dans l'OBJECT_REGISTRY (EXPORT_BRUT lignes 2578–
  2580 : statut MVP) mais aucun fichier dans src/ ne crée
  ou persiste ces objets — source : grep -rn
  'ReputationLedger\|SOTSSubmission\|SOTSScoreSnapshot'
  sur src/ retourne uniquement les guards.
  CONSÉQUENCE DIRECTE : le talent ne peut pas soumettre sa
  SOTSSubmission (C-08). SOTSWindowGuard exige
  sotsConsolidated=true, mais aucun mécanisme ne produit
  cette consolidation. La chaîne event_completed →
  sots_window_closed → contestation_window → payable est
  architecturalement gardée mais fonctionnellement vide
  côté persistence SOTS.

- BLOQUANT-E2 — SOTS-SELF-01 non implémenté ni testé.
  Le test P0 SOTS-SELF-01 (requiredBeforeEvent=1 —
  EXPORT_BRUT TEST_REGISTRY Catégorie 4) vérifie que
  l'auto-note directe ou indirecte est bloquée — D-094
  pattern 6 : "SOTS_SELF_BENEFICIAL — blocage absolu".
  Aucun fichier de test SOTS-SELF-01 dans tests/p0/ —
  source : ls tests/p0/ | grep -i sots retourne rien.
  isSelfOrganized est calculé dans PlacementGuard mais
  aucun garde-fou structurel ne bloque la soumission d'une
  SOTSSubmission auto-bénéficiaire dans le code existant.

- BLOQUANT-E3 (hérité de Domaine A) — Casse Linux dans
  transitionEngagement.js bloque GUARDS-CHAIN-01 T-11 à T-16
  qui valident SOTSWindowGuard bout-en-bout — source :
  Fiche A.

- BLOQUANT-E4 — sots_window_duration_hours non seeded en
  database (partagé avec BLOQUANT-B2). SOTSWindowGuard
  fail-closed si config absente — source : SOTSWindowGuard.js
  + POLICYCONFIG-FAILCLOSED-01 output.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- EMA (D-081) non implémentée. Le calcul SOTSScoreSnapshot
  par EMA (emaAlpha_ppm, minSubmissionsForEma) n'existe
  pas dans le code. Pour Event 1, avec 1 seule soumission,
  EMA = la valeur brute — impact nul sur le premier event.
  Mais le score qui module la commission (D-080) ne sera
  pas calculé correctement pour les events suivants.

- SOTSCommissionModulationConfig non appliquée. D-026 : SOTS
  modulation active dès MVP ; D-080 : multiplicateur appliqué
  sur ≥10 soumissions. Pour Event 1, multiplicateur forcé
  à 1 000 000 ppm (neutre) — non bloquant.

- SOTS multi-dimensionnel (D-079 : 7 dimensions configurables)
  non implémenté. Pour Event 1, une soumission à score global
  simple satisfait C-08. La granularité dimensionnelle peut
  attendre.

- D-082 contestation SOTS (reversal dans ReputationLedger
  avec DecisionRecord + EvidenceBundle) non implémentée —
  non bloquant pour Event 1 si aucune contestation n'est
  soulevée.

- Pierre de Rosette C05 : "Le Trèfle note Alex" (organisateur
  note talent) — D-078 matrice : "Organisateur → Talent(s) :
  Est organisateur + event complété". Cette soumission
  (organisateur→talent) n'est pas la même que C-08 qui exige
  la soumission du talent lui-même. Les deux doivent exister
  indépendamment — risque de confusion dans l'implémentation.

REPORTABLE (peut attendre l'événement 2+) :

- SOTS-CHECKIN-01 (Conditionnel, si SOTS audience actif,
  requiredBeforeEvent=2) — EXPORT_BRUT TEST_REGISTRY.
  AudienceCheckIn + TicketAdmissionRight requis pour soumission
  audience. Non requis pour Event 1 si pas de SOTS audience.
- SOTSFraudDetectionPolicyConfig (7 patterns D-094) —
  post-Event 1. Pour Event 1 dans un réseau fermé connu,
  les patterns de fraude ne s'appliquent pas.
- SOTSContestPolicyConfig (D-082, fenêtre 48h) — post-Event 1.
- Score public (D-083 seuils de confiance) — visible après
  3–10 soumissions. Pour Event 1 : score interne uniquement
  (1 soumission, admin + analytiques). Non bloquant.
- CheckpointCulturalProfile (EMA comportementale sur historique
  CP-PLATEAU-0001) — post-Event 1.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : C-08 exige la SOTSSubmission
  "du talent". D-075 condition 7 dit "SOTSSubmission du talent
  soumis ← requis, pas optionnel". Mais la matrice D-078
  précise que le talent note "organisateur et checkpoint".
  Un talent ne se note pas lui-même — il note les autres.
  La "SOTSSubmission du talent" dans C-08 signifie-t-elle
  la soumission faite PAR le talent (qui note l'organisateur),
  ou la soumission faite SUR le talent (par l'organisateur)?
  Le code dit "Le talent doit avoir soumis son SOTS" (C-08
  message d'erreur) — interprétation = soumission PAR le
  talent. Mais si le talent soumet sa note de l'organisateur
  pendant la fenêtre SOTS, C-08 est satisfait. À valider
  avec le fondateur pour éviter l'ambiguïté.

→ INFÉRENCE NON DOCUMENTÉE 2 : SOTSWindowGuard exige
  sotsConsolidated=true, mais aucun service ne produit
  cette flag. Qui agrège les soumissions dans les
  ReputationLedgers et positionne sotsConsolidated=true ?
  Un cron ? Une action admin manuelle ? L'OS ne le précise
  pas explicitement. Si ce flag n'est jamais positionné,
  SOTSWindowGuard bloque en boucle.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette directe sur SOTS — V1 n'a pas de
  système de réputation structuré. La note default 3/5
  (D-026) assure que DJ Alex commence avec un score neutre,
  ce qui est adapté pour le premier event.

De l'architecture Guards-only : les guards sont complets mais
  la couche de persistence SOTS (SOTSSubmission,
  ReputationLedger, SOTSScoreSnapshot) n'existe que dans
  l'OBJECT_REGISTRY — pas dans le code. C'est le même pattern
  que la SessionPresence (Domaine D) : le système sait
  vérifier les données mais n'a pas encore les services pour
  les créer.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Implémenter le service de création et persistence de
SOTSSubmission et ReputationLedger (append-only), implémenter
le mécanisme qui positionne sotsConsolidated=true après
l'agrégation, créer et passer le test P0 SOTS-SELF-01,
seeder sots_window_duration_hours en database, et clarifier
avec le fondateur l'interprétation exacte de C-08 (SOTSSubmission
PAR le talent ou SUR le talent).

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → ~40% estimé

Justification :
  Guards de fenêtre (SOTSWindowGuard, ContestationWindowGuard) :
    90% — logique complète, testée en isolation. Bloqués
    bout-en-bout par casse Linux.
  ReputationLedger/SOTSSubmission persistence : 0% — absent.
  EMA (D-081) : 0% — non implémentée.
  SOTS-SELF-01 test P0 : 0% — non créé.
  Config seeded en database : 0% (partagé avec Domaine B).
  sotsConsolidated mécanisme : INCONNU.
  Score default 3/5 D-026 : défini en OS, non seedé en DB.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- F. Archivage global (settled→archived) exige que
  sots_window_closed soit atteint et que GoNoGoDecisionRecord
  = GO — source : OS V15 section 2.7.1 ArchiveWORMGuard :
  "SOTS window closed · tous LedgerRecords finaux ·
  GoNoGoDecisionRecord = GO".

- G. Commission MR (Domaine B) dépend du SOTSScoreSnapshot
  pour la modulation du taux effectif (D-080) — source :
  EXPORT_BRUT D-080. Pour Event 1, impact nul (< 10
  soumissions → multiplicateur 1 000 000 ppm neutre), mais
  la dépendance est active dès Event 2+ avec historique.

- INFÉRENCE : la condition FULL SUCCESS du premier event
  ("SOTS soumis" — EXPORT_BRUT D-144) exige qu'une
  SOTSSubmission soit enregistrée. Sans service de
  persistence, cette condition ne peut pas être satisfaite
  automatiquement. Si le fondateur entre la note manuellement
  dans Base44 UI, l'event est CONTROLLED SUCCESS, pas
  FULL SUCCESS — source : EXPORT_BRUT D-144.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — E. SOTS et réputation
Conserver cette fiche pour le Prompt de Synthèse