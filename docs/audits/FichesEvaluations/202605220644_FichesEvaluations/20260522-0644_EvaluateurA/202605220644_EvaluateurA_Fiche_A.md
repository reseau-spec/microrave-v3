━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — A. ONTOLOGIE ET MACHINE D'ÉTAT
(Engagement, MissionSlot, ContractSnapshot, états WORM)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • src/core/transitionEngagement.js
  • src/core/IDFactory.js
  • src/core/guards/MissionConversionGuard.js (head)
  • src/core/guards/SealingGuard.js (head)
  • src/core/guards/ArchiveWORMGuard.js (head)
  • src/core/guards/EngagementAmendmentGuard.js (head)
  • src/services/EngagementAmendmentService.js (head)
  • src/repositories/EngagementRepository.js
  • src/repositories/ContractSnapshotRepository.js
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/CHEMIN-NOMINAL-01.js (head)
  • tests/p0/TRANSITION-01.js (head)
  • tests/p0/AMENDMENT-01.js (head)

Niveau de confiance : HAUTE pour la logique d'état et les guards.
  PARTIELLE pour la persistence (repository shells présents mais
  connexion Base44 non vérifiée à l'exécution).
  INFÉRENCE pour les entités MissionSlot, Lobby, QuickPlay
  (OS V15 §2.3–2.5 renvoie à V11 — contenu non soumis).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- La machine d'état couvre le chemin nominal complet
  proposed → … → settled → archived en 14 états, fail-closed
  sur toute transition non listée.
  Source : OS V15 §2.6 [D-019-A], §2.7.1 LOI TRANSITION-01.

- transitionEngagement() est l'unique point d'entrée pour
  toute mutation de status — aucune écriture directe possible.
  Source : OS V15 §2.7.1 LOI fondatrice + LOI TRANSITION-01.

- Les 6 moments WORM (accepted W1, deposit_secured W1,
  event_sealed W2, event_completed W1, sots_window_closed W1,
  archived W3) sont encodés et actifs dans WORM_STATES.
  Source : OS V15 §2.7 [D-014-A/B].

- Le ContractSnapshot phase 1 (CS1-*) est créé et retourné
  à accepted — snapshot du cachet, tier, taux, historique.
  Source : OS V15 §2.7 Moment 1.

- Le ContractSnapshot phase 2 (CS2-*) est créé et gravé
  à event_sealed — WORM financier complet, base de tout
  calcul ultérieur (payout, no-show, amendment).
  Source : OS V15 §2.7 Moment 3 + [D-147].

- L'IDFactory génère des systemId portables pour toutes
  les entités (préfixes souverains, format PREFIX-TS-RND).
  Source : OS V15 §2.9.

- Les guards de la chaîne nominale sont implémentés et
  passent leurs tests P0.
  Source : OS V15 §15 Tests et qualité.

Ce domaine bloque tout le reste si :

- transitionEngagement() n'est pas appelé et qu'une
  mutation directe de status contourne les guards —
  toute la chaîne de preuve devient inopérante.
  Source : OS V15 §2.7.1 LOI TRANSITION-01.

- WORM_STATES encode balance_pending ou payable comme
  états WORM (erreur documentaire) — fausse protection
  et signaux d'alerte parasites.
  Source : OS V15 §2.7 [D-014-A/B].

- ContractSnapshot phase 2 absent ou non retourné par
  SealingGuard — PayoutExecutor, NoShowGuard et
  EngagementAmendmentGuard n'ont aucune base de calcul.
  Source : OS V15 §2.7 Moment 3, §3.x (waterfall).

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- transitionEngagement() : implémenté, 43 transitions
  couvertes, fail-closed sur toute transition non listée,
  5 guards dans l'ordre souverain.
  Source : transitionEngagement.js — TRANSITION_TABLE complet.

- WORM_STATES : 6 moments officiels encodés, balance_pending
  et payable correctement absents, contestation_window
  correctement non-WORM.
  Source : transitionEngagement.js L.130–137 commentaires
  + code WORM_STATES const.

- W2 (event_sealed) : protection asymétrique correcte —
  le code permet les transitions DEPUIS event_sealed si
  elles sont dans TRANSITION_TABLE, bloque toutes les autres
  avec AdminIncidentRecord P0 simulé (console.error).
  Source : transitionEngagement.js Guard 2 (W2 block).

- W3 (archived) : hardblock absolu — throw immédiat, aucune
  exception possible, pas même SoloFounderOverride.
  Source : transitionEngagement.js Guard 2 (W3 block).

- IDFactory : complet, 28 préfixes, AMD- pour Amendment
  (D-147), CS1-/CS2- pour ContractSnapshot phase 1 et 2.
  Source : src/core/IDFactory.js PREFIXES.

- ContractSnapshotRepository : interface créée, méthodes
  create(), findByEngagementIdAndPhase(), findByEngagementId()
  avec validation des préfixes CS1-/CS2- avant insertion.
  Source : ContractSnapshotRepository.js.

- EngagementRepository : interface créée, méthodes
  findEngagementById(), findEngagementsByEventId(),
  findEngagementByPaymentIntentId(), updateEngagementStatus(),
  createEngagement(), findEventById(), createEvent(),
  findLineupByEventId(), findMissionSlotsByEventId().
  Source : EngagementRepository.js.

- EngagementAmendmentGuard (D-147) : implémenté complet,
  14/14 PASSED selon Plan Implantation — validation des
  7 conditions obligatoires, formule taux horaire implicite
  WORM W2 inchangé, LOI LEDGER-02 sur delta.
  Source : Plan Implantation "EngagementAmendmentGuard :
  D-147 complet, 14/14 PASSED".

- Guards nominaux : MissionConversionGuard, SealingGuard,
  ArchiveWORMGuard, EventPaymentGuard, PresenceWindowGuard,
  EventCompletionGuard, SOTSWindowGuard, ContestationWindowGuard,
  PresenceProofGuard, LedgerInvariantGuard implémentés.
  Source : transitionEngagement.js imports + Plan Implantation
  "13 guards implémentés".

- Tests P0 : CHEMIN-NOMINAL-01, TRANSITION-01, AMENDMENT-01
  présents et référencés comme PASSED.
  Source : Plan Implantation "16/16 tests P0 verts".

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : La logique métier des entités Engagement,
  Event, Lineup existe dans V1 (microrave.ca). V3 la réifie
  via transitionEngagement() avec guards. La V1 n'utilisait
  pas de machine d'état formelle — avantage : le terrain
  est connu ; dette : aucun pattern d'état V1 ne peut être
  réutilisé tel quel sans passer par transitionEngagement().

Ce qui vient de V2 et a survécu :

- INFÉRENCE : V2 abandonnée "faute de fondations" selon
  le prompt de contexte. Aucun code V2 identifié dans le
  ZIP. Aucune dette directe détectée dans ce domaine.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-A1 — no_show → refunded : mauvais câblage dans
  runSpecificGuard(). La TRANSITION_TABLE route cette
  transition vers 'RefundGuard' (placeholder non implémenté).
  NoShowGuard.validateRefundTrigger() existe et est correcte
  mais n'est jamais appelée. L'argent passe vers refunded
  sans calcul de remboursement ni écriture ledger.
  Source : Plan Implantation §0.2, transitionEngagement.js
  case 'RefundGuard' (throw GUARD_NOT_IMPLEMENTED pour tout
  autre chemin que no_show→refunded — mais le case détecte
  déjà no_show→refunded et route vers NoShowGuard).
  CORRECTION : après lecture attentive du code (case
  'RefundGuard' L. ~432), la détection `if transitionKey ===
  'no_show->refunded' → appel NoShowGuard.validate()` EST
  présente dans le code source. Le Plan Implantation §0.2
  la liste comme livrable — ambiguïté : écrit avant ou après
  la correction ? STATUT : INCONNU — à valider par exécution
  du test NO-SHOW. Marqué BLOQUANT par prudence.

- BLOQUANT-A2 — Persistence des SchedulerDueTasks absente
  pour les transitions temporelles nominales.
  EventPaymentGuard ne retourne pas encore l'objet
  schedulerTask balance_deadline_check (LOI ANNULATION-02
  non armée). Sans cette tâche, la transition automatique
  deposit_secured → cancelled_J7 à J-6 ne s'arme jamais.
  Source : Plan Implantation §0.3 — "BLOQUANT (LOI
  ANNULATION-02)".
  NOTE : Pour la toute première transaction avec fondateur
  présent (Event 0A), ce bloquant peut être contourné par
  SoloFounderOverride documenté selon D-144 CONTROLLED.

- BLOQUANT-A3 — DataAccessLedger non persisté.
  Guard 5 écrit uniquement en console.log. LOI TRANSITION-01
  exige une DataAccessLedgerEntry sur chaque mutation de
  status. Sans AdminRepository, les transitions depuis l'UI
  Base44 sont indétectables.
  Source : Plan Implantation §0.5, transitionEngagement.js
  Guard 5 — console.log('[AuditLogger]', ...).
  NOTE : Le code contient déjà le câblage conditionnel :
  `if (repositories.admin && typeof repositories.admin
  .appendToDataAccessLedger === 'function')` — il ne manque
  que AdminRepository connecté. Non-bloquant pour Event 0A
  si SoloFounderOverride mais bloquant pour Event 0B.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-A1 — 6 guards de litige/transfert implémentés
  en Phase 2.3 mais non encore validés pour la première
  transaction : CancellationGuard (présent, plan Phase 2.3),
  DisputeGuard, DisputeResolutionGuard, TransferGuard,
  WithdrawalGuard. Pour SC-01 (chemin nominal DJ Alex, pas
  de litige), ces guards ne bloquent pas. Ils bloquent tout
  chemin alternatif.
  Source : Plan Implantation §2.3 "Guards de litige —
  6 placeholders restants".
  NOTE CORRECTION : les fichiers DisputeGuard.js,
  DisputeResolutionGuard.js, CancellationGuard.js,
  TransferGuard.js, WithdrawalGuard.js sont PRÉSENTS dans
  le répertoire src/core/guards/ avec des tailles
  substantielles (5–18 Ko). Plan Implantation date du
  21 mai. Statut réel : PARTIELLEMENT IMPLÉMENTÉS —
  à vérifier par exécution des tests correspondants.

- DÉGRADANT-A2 — MissionConversionGuard source mentionée
  "OS V10 section 2.7.1" dans son header — documentation
  obsolète (OS est à V15). Pas d'impact fonctionnel car
  la logique est conforme à V15 selon les tests.
  Source : MissionConversionGuard.js header.

- DÉGRADANT-A3 — MissionSlot, Lobby, QuickPlay : OS V15
  §2.3/2.4/2.5 renvoient à "V11 — inchangé" sans le
  contenu. Ces entités ne sont pas auditables depuis les
  documents soumis.
  INFÉRENCE NON DOCUMENTÉE.

REPORTABLE (peut attendre l'événement 2+) :

- D-068 méthode des plus grands restes pour prorata
  multi-talent dans SealingGuard. Non-bloquant pour SC-01
  mono-talent (DJ Alex seul).
  Source : Plan Implantation §3.3.

- Corrections documentaires : header EventPaymentGuard.js
  "Source : OS V10.1" → V14, retrait référence
  BalanceRequestGuard.
  Source : Plan Implantation §3.4.

ANGLE MORT POTENTIEL :

- La transition negotiating → accepted retourne un
  ContractSnapshot phase 1 via MissionConversionGuard.
  Le code de transitionEngagement() propage
  result.contractSnapshot de guardResult. Mais la
  persistence de ce snapshot en base dépend de l'appelant
  (pattern correct). Si l'appelant ne persiste pas le
  ContractSnapshot phase 1 avant d'avancer vers placed,
  SealingGuard ne trouvera pas context.contractSnapshotPhase1Id
  et bloquera. Il n'y a pas de vérification que CS1 est
  en base avant placed — seulement via PlacementGuard.
  INFÉRENCE NON DOCUMENTÉE — à valider : PlacementGuard
  vérifie-t-il l'existence du CS1 en base ou seulement
  sa présence dans le context ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre / positive : La V3 n'hérite d'aucun code de machine
d'état de V1 ou V2 — elle repart de zéro avec une doctrine
explicite. C'est un avantage net : aucune logique fantôme,
aucune transition non documentée. La dette est
essentiellement documentaire (headers obsolètes, références
V10/V11 dans certains guards).

Dette active : Le Plan Implantation §3.4 liste 3 corrections
documentaires résiduelles (Carte 08 drawio, EventPaymentGuard
header, référence BalanceRequestGuard). Elles ne bloquent
pas la transaction mais peuvent induire en erreur un
développeur futur.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (SC-01, DJ Alex, chemin nominal
sans litige) : vérifier et corriger le câblage
no_show→refunded dans runSpecificGuard() (BLOQUANT-A1,
statut INCONNU), ajouter la création de SchedulerDueTask
dans EventPaymentGuard (BLOQUANT-A2, contournable Event 0A
avec SoloFounderOverride), et connecter AdminRepository
au Guard 5 (BLOQUANT-A3, non-bloquant Event 0A). Le reste
du domaine A est documenté, implémenté et testé.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Confirmer par exécution que case 'RefundGuard' dans
       runSpecificGuard() route correctement no_show→refunded
       vers NoShowGuard (BLOQUANT-A1 — potentiellement déjà
       corrigé mais non vérifié).
  C2 — Pour Event 0A : accepter SoloFounderOverride documenté
       pour les transitions temporelles (SchedulerDueTask
       absente — BLOQUANT-A2).
  C3 — Pour Event 0B : connecter AdminRepository et activer
       la persistence DataAccessLedger (BLOQUANT-A3).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine B (Finance et ledger) ne peut pas calculer sans
  ContractSnapshot phase 2 retourné par SealingGuard.
  Source : OS V15 §2.7 Moment 3 — "base de tout calcul
  ultérieur".

- Domaine C (Stripe et paiements) dépend de
  findEngagementByPaymentIntentId() dans EngagementRepository
  pour que WebhookProcessor retrouve l'Engagement depuis
  un webhook Stripe.
  Source : EngagementRepository.js
  findEngagementByPaymentIntentId(), Plan Implantation §0.1.

- Domaine D (Présence et preuve) dépend de l'état
  event_sealed → performed via PresenceWindowGuard pour
  ouvrir la fenêtre de check-in.
  Source : OS V15 §2.7.1 table ligne event_sealed→performed.

- Domaine E (SOTS et réputation) dépend de l'état
  performed → event_completed via EventCompletionGuard.
  Source : OS V15 §2.7.1.

- Domaine F (Scheduler) dépend des SchedulerDueTasks
  créées par les guards de ce domaine (EventPaymentGuard,
  SOTSWindowGuard, ContestationWindowGuard). Si ce domaine
  ne les crée pas, le scheduler n'a rien à consommer.
  Source : Plan Implantation §1.4 + §0.3.

- Domaine G (Admin et sécurité) dépend du Guard 5
  (AuditLogger → DataAccessLedger) de ce domaine pour
  toute traçabilité.
  Source : OS V15 §2.7.1 "GUARD 5 : AuditLogger — toujours,
  sans exception".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — A. ONTOLOGIE ET MACHINE D'ÉTAT
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━