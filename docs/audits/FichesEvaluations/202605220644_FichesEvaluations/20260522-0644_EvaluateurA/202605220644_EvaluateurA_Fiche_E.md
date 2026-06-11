━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — E. SOTS ET RÉPUTATION
(check-in requis, auto-note bloquée, append-only, EMA)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-077, D-080, D-081, D-082, D-083, D-094, D-115,
     TEST_REGISTRY Catégorie 4)
  • src/services/SOTSSubmissionService.js
  • src/core/guards/SOTSWindowGuard.js
  • src/repositories/SOTSRepository.js
  • src/repositories/ReputationRepository.js
  • src/repositories/index.js (extraits sots/reputation)
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/ : SOTS-SELF-01

Niveau de confiance : HAUTE pour SOTSSubmissionService,
  SOTSWindowGuard, et les repositories (code complet et lisible,
  logiques cohérentes avec l'OS).
  PARTIELLE pour l'EMA (le service implémente une moyenne
  arithmétique simple, pas l'EMA configurable de D-081).
  INFÉRENCE pour le TicketAdmissionRight / AudienceCheckIn
  (D-094 garde-fou structurel — non visible dans le code soumis).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Au moins une SOTSSubmission est soumise pendant la fenêtre
  24h post-event_completed par un acteur non-talent (D-094).
  Condition C-08 de PresenceProofGuard (domaine D) l'exige
  pour autoriser payable.
  Source : PresenceProofGuard.js C-08 — *"source : D-075
  Condition 8 · SOTS-TEMOIN-01 (VT-22)."* Exception :
  SoloFounderOverride (performed→payable) dispense du SOTS.

- La SOTSSubmission est consolidée (SOTSScoreSnapshot créé,
  markConsolidated = true) avant que SOTSWindowGuard
  autorise event_completed → sots_window_closed.
  Source : SOTSWindowGuard.js — *"sotsConsolidated=false.
  Les SOTSSubmissions doivent être agrégées dans les
  ReputationLedgers avant de fermer la fenêtre."*

- D-094 pattern 6 bloque toute auto-note directe ou
  indirecte (submittedBy === talentUserId) avant toute
  persistence.
  Source : OS V15 D-094 — *"Blocage absolu. Jamais de
  contournement, jamais de SoloFounderOverride."*

- ReputationLedger est append-only : toute entrée est
  immuable après création, aucun DELETE ni UPDATE.
  Source : OS V15 D-077, LOI GREFFIER-01.

- Les seuils de calcul EMA et la durée de la fenêtre SOTS
  sont lus depuis la base (sots_window_duration_hours via
  PolicyConfig — jamais hardcodés).
  Source : OS V15 D-063, SOTSWindowGuard.js.

Ce domaine bloque tout le reste si :

- SOTS non consolidé à l'expiration de la fenêtre :
  SOTSWindowGuard.sotsConsolidated=false → bloque
  event_completed → sots_window_closed → toute la
  chaîne post-SOTS est gelée.
  Source : SOTSWindowGuard.js Chemin A/B.

- Auto-note acceptée en base : violation D-094, intégrité
  du système de réputation compromise, impact direct sur
  les taux de commission (SOTSCommissionModulationConfig).
  Source : OS V15 D-094 pattern 6.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- SOTSSubmissionService : complet. submit() implémente
  D-094 pattern 6 (SOTS_SELF_BENEFICIAL — blocage absolu
  avant toute persistence), vérifie que la fenêtre n'est
  pas fermée (findSnapshotByEngagementId), génère SOT-*
  via IDFactory, persiste SOTSSubmission + ReputationLedger-
  Entry en un seul appel. consolidate() crée le SOTSScore-
  Snapshot immuable et marque les soumissions consolidées.
  isConsolidated() pour le contexte du SOTSWindowGuard.
  Source : SOTSSubmissionService.js complet.
  IMPORTANT : Ce service était listé comme livrable Phase 2
  dans le Plan Implantation du 21 mai, mais il est
  effectivement présent dans le code — livré depuis.

- SOTSWindowGuard : complet. Deux chemins d'entrée
  (A : sotsWindowClosedAt fourni par scheduler, B : calcul
  depuis sotsWindowOpenedAt). Admin override avec Admin-
  IncidentRecord obligatoire. Retourne une SchedulerDueTask
  SOTS_WINDOW_EXPIRATION si fenêtre pas encore close (même
  pattern que ContestationWindowGuard). Tests T-11 à T-16
  de GUARDS-CHAIN-01 PASSED selon Plan Implantation.
  Source : SOTSWindowGuard.js complet.

- SOTSRepository : complet. create() (SOTSSubmission),
  findByEngagementId(), markConsolidated() (bulk update
  via Promise.all — note D-DEGR ci-dessous), createSnapshot(),
  findSnapshotByEngagementId(). Préfixe SOT-* validé.
  Source : SOTSRepository.js complet.

- ReputationRepository : complet et append-only enforced.
  append() valide préfixe REP-*, userId et engagementId
  obligatoires, pas de champ updatedAt (immuabilité
  documentée). findByUserId() trié ASC pour calcul EMA
  chronologique. findByEngagementId() pour audit.
  Source : ReputationRepository.js — *"APPEND-ONLY :
  pas d'updatedAt — immuable."*

- Intégration repositories/index.js : sots → SOTSRepository
  et reputation → ReputationRepository correctement câblés.
  Source : index.js L.111–112.

- Test SOTS-SELF-01 : 6 cas couverts (format SOT-*,
  engagementId manquant, auto-note bloquée, consolidate()
  retourne sotsConsolidated:true avec snapshot,
  isConsolidated()=false, soumission post-consolidation
  bloquée). PASSED listé explicitement dans le code avec
  message de confirmation Phase 2.1.
  Source : SOTS-SELF-01.js — message final *"Phase 2.1
  validée : SOTSSubmissionService opérationnel."*

- Score par défaut 3/5 = multiplicateur neutre (D-026,
  D-083) : sous le seuil de confiance de 10 soumissions,
  le multiplicateur est forcé à 1 000 000 ppm → aucun
  impact sur les commissions pour Event 0A.
  Source : OS V15 D-083, D-080.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 n'avait pas de SOTS formalisé. Pas de
  dette directe.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-E1 — Aucune UI de soumission SOTS visible
  dans le code. SOTSSubmissionService.submit() est
  implémenté. Aucune page Base44, endpoint API, ou
  formulaire ne l'appelle. L'organisateur n'a aucun
  moyen d'accéder à la soumission de son score dans le
  système actuel.
  Source : Plan Implantation §2.1 — *"[livrable] src/
  services/SOTSSubmissionService.js"* listé sans mention
  d'une UI correspondante.
  NOTE : Pour Event 0A avec SoloFounderOverride (performed
  → payable), C-08 de PresenceProofGuard est bypassée —
  SOTS non requis pour le payout du premier event pilote.
  Bloquant à partir d'Event 0B (chemin nominal complet
  via contestation_window).

- BLOQUANT-E2 — Orchestrateur de consolidation absent.
  SOTSWindowGuard exige sotsConsolidated=true. Mais aucun
  service ni cron dans le code visible n'appelle
  SOTSSubmissionService.consolidate() avant de déclencher
  event_completed → sots_window_closed. Le scheduler doit
  créer la SchedulerDueTask SOTS_WINDOW_EXPIRATION et
  l'exécuter avec sotsConsolidated=true dans le context.
  Qui déclenche la consolidation avant ? Non documenté.
  Source : SOTSWindowGuard.js contextOverrides — *"sotsConsolidated: true — le scheduler consolidera
  avant de déclencher."* Ce "avant" n'est pas implémenté.
  NOTE : Contournable pour Event 0A via SoloFounderOverride
  avec admin override SOTSWindowGuard + AdminIncidentRecord.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-E1 — EMA non implémentée. D-081 exige un
  calcul EMA (Exponential Moving Average) avec facteur
  de lissage configurable dans SOTSCalculationPolicyConfig.
  SOTSSubmissionService.computeAggregatedScore() fait une
  moyenne arithmétique simple. Pour Event 0A (1 seule
  soumission), l'impact est nul — moyenne = EMA à 1 point.
  Impacte la précision réputationnelle à partir d'Event 2+.
  Source : OS V15 D-081 — *"Score SOTS courant calculé par
  EMA avec facteur de lissage configurable."*

- DÉGRADANT-E2 — markConsolidated() utilise Promise.all
  sur des PUT individuels. Base44 ne supportant pas les
  bulk updates, la consolidation d'un engagement avec
  plusieurs soumissions SOTS produit N appels PUT séquen-
  tiels dans un Promise.all. En cas d'échec partiel (un
  seul PUT échoue), certaines soumissions sont marquées
  consolidées et d'autres non — état incohérent sans
  transaction atomique. Non-critique pour Event 0A avec
  1–2 soumissions.
  Source : SOTSRepository.js markConsolidated() — *"Base44
  ne supporte pas bulk update."*

- DÉGRADANT-E3 — SOTSScoreSnapshot.systemId utilise
  IDFactory.generate('SOTSRecord') qui génère un préfixe
  SOT-*. Le snapshot et les soumissions partagent le même
  préfixe IDFactory, ce qui ne les distingue pas par ID
  dans les logs. IDFactory ne possède pas de type
  distinct 'SOTSScoreSnapshot'. INFÉRENCE — potentiel
  risque de confusion dans les audits.
  Source : SOTSSubmissionService.js consolidate() L.~100 +
  IDFactory.PREFIXES — pas de clé 'SOTSScoreSnapshot'.

REPORTABLE (peut attendre l'événement 2+) :

- SOTS-CHECKIN-01 (conditionnel) : garde-fou structurel
  TicketAdmissionRight + AudienceCheckIn. Requis seulement
  si SOTS audience actif. Non-bloquant pour Event 0A
  (talent + organisateur uniquement).
  Source : TEST_REGISTRY Catégorie 4 — *"Conditionnel :
  Si SOTS audience actif — requiredBeforeEvent=2."*

- SOTS-REVERSAL-01 / REPUTATION-APPEND-01 : tests P0
  de correction SOTS et d'append-only ReputationLedger.
  requiredBeforeEvent=1. Non-bloquants pour Event 0A.
  Source : TEST_REGISTRY Catégorie 4.

- SOTS-FRAUD-01 (cluster suspect mis en quarantaine) :
  requiredBeforeEvent=2. D-094 pattern 7 — détection de
  réseaux de notation coordonnée. Reportable.
  Source : TEST_REGISTRY Catégorie 4.

- SOTSCommissionModulationConfig : modulation neutre sous
  10 soumissions (seuil de confiance D-083). Pour Event 0A
  avec 1–2 soumissions : multiplicateur = 1 000 000 ppm,
  aucun impact commission. Reportable.
  Source : OS V15 D-083.

ANGLE MORT POTENTIEL :

- L'auto-note indirecte n'est pas bloquée dans le code.
  D-094 pattern 6 parle de blocage *direct et indirect*.
  SOTSSubmissionService bloque uniquement submittedBy ===
  talentUserId (direct). Une note soumise par un
  organisateur qui est en fait un compte contrôlé par
  le talent (indirect) n'est pas détectée. D-094 liste
  7 patterns de fraude — seul le pattern 6 (SOTS_SELF_
  BENEFICIAL) est implémenté. Les 6 autres patterns ne
  sont pas dans le code visible.
  INFÉRENCE NON DOCUMENTÉE — pour Event 0A avec Le Trèfle
  comme organisateur et DJ Alex comme talent, ce risque
  est pratiquement nul. Bloquant pour ouverture publique.

- SOTSWindowGuard.contextOverrides indique que le scheduler
  doit appeler consolidate() AVANT de déclencher la
  transition. Mais l'ordre exact (consolidate → puis
  injecter sotsConsolidated:true dans le context) n'est
  documenté dans aucun service ou script. C'est une
  hypothèse dans un commentaire de code.
  INFÉRENCE NON DOCUMENTÉE — à valider avec le fondateur
  avant d'implémenter le dispatcher cron (domaine F).

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : Domaine entièrement nouveau en V3. L'architecture
append-only du ReputationLedger et le blocage D-094 pattern 6
sont correctement implémentés depuis le départ — pas de
dette héritée.

Légère dette interne : le Plan Implantation du 21 mai
listait SOTSSubmissionService comme livrable Phase 2 "à créer".
Il existe dans le code soumis, avec tests PASSED. Le document
n'a pas été mis à jour pour refléter cet avancement — le Plan
Implantation est donc en retard par rapport à la réalité du
code, ce qui peut induire en erreur lors d'une priorisation.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (Event 0A avec SoloFounderOverride) :
aucun delta requis — le SoloFounderOverride bypass C-08 (SOTS
non requis pour performed→payable). Pour Event 0B (chemin
nominal complet) : créer dans Base44 un formulaire de soumission
SOTS post-event pour l'organisateur, et implémenter dans le
scheduler l'appel à consolidate() avant de déclencher
event_completed → sots_window_closed.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Event 0A : SoloFounderOverride bypass SOTS
       (performed→payable, C-08 non applicable).
       Aucun delta requis pour Event 0A.
  C2 — Event 0B : formulaire soumission SOTS UI +
       orchestrateur consolidation dans scheduler.
  C3 — Mettre à jour le Plan Implantation pour refléter
       que SOTSSubmissionService est livré (Phase 2.1
       déjà accomplie).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine D (Présence et preuve) dépend de ce domaine via
  PresenceProofGuard C-08 : SOTSSubmission exigée pour le
  chemin nominal contestation_window → payable. Sans SOTS,
  ce chemin est bloqué.
  Source : PresenceProofGuard.js C-08 — D-075 Condition 8.

- Domaine A (Ontologie / machine d'état) dépend de ce
  domaine pour que event_completed → sots_window_closed
  (Moment WORM 5) soit possible. SOTSWindowGuard est le
  guard spécifique de cette transition.
  Source : OS V15 §2.7.1 + §2.7 Moment 5.

- Domaine F (Scheduler) dépend de ce domaine pour
  l'orchestration correcte : le dispatcher cron doit
  appeler consolidate() avant de déclencher SOTSWindowGuard.
  L'ordre est documenté dans un commentaire du guard mais
  pas dans un service — le domaine F doit implémenter
  cette séquence.
  Source : SOTSWindowGuard.js contextOverrides —
  *"le scheduler consolidera avant de déclencher."*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — E. SOTS ET RÉPUTATION
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━