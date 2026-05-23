━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — D. PRÉSENCE ET PREUVE
(check-in, SessionPresence, PresenceProofResolver)

Date d'évaluation : 22 mai 2026 07:17 EST
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-093, D-093-A, D-075, D-054, TEST_REGISTRY Catégorie 1)
  • src/core/guards/PresenceProofGuard.js
  • src/core/guards/PresenceWindowGuard.js
  • src/services/SessionPresenceService.js
  • src/repositories/SessionPresenceRepository.js
  • src/repositories/index.js (extrait sessionPresence)
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/ : PRESENCEPROOF-01, SESSION-PRESENCE-01,
    GUARDS-CHAIN-01 (T-01 à T-05 PresenceWindowGuard)

Niveau de confiance : HAUTE pour la logique de validation
  (PresenceProofGuard 11 conditions, PresenceWindowGuard,
  SessionPresenceService — code complet et lisible).
  PARTIELLE pour le PresenceProofResolver complet (D-093 liste
  8 signaux ; le code n'implémente que GPS + durée + checkedInAt).
  INFÉRENCE pour le bouton UI "Je suis arrivé" et l'appel
  réel à SessionPresenceService.create() depuis Base44.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- La SessionPresence est créée en base avant la transition
  event_sealed → performed : le talent a effectué son
  check-in (sessionPresenceId SPR-* présent dans context).
  Source : OS V15 §2.7.1 table ligne event_sealed→performed
  — *"check-in window ouverte · SessionPresence initiée."*

- La fenêtre de check-in est ouverte au moment de la
  transition (now ≥ eventScheduledStartAt − checkInWindow-
  Minutes lu en base). PresenceWindowGuard la vérifie.
  Source : OS V15 §2.7.1 PresenceWindowGuard.

- Les 11 conditions D-075 sont toutes satisfaites avant
  que PresenceProofGuard autorise contestation_window →
  payable : GPS ≤ maxDistancePolicy, durée ≥ plancher,
  ContractSnapshot W2 présent, SOTS soumis, pas de litige,
  pas de SafetyReport bloquant, idempotency SettlementInstruction.
  Source : OS V15 registres D-075.

- Les seuils GPS et durée (maxDistancePolicy, minDuration-
  FloorMinutes, minDurationRatioPpm) sont lus depuis la
  base via PolicyConfig — jamais hardcodés.
  Source : OS V15 D-063.

Ce domaine bloque tout le reste si :

- SessionPresence.checkedInAt est null : C-03 de
  PresenceProofGuard bloque, contestation_window → payable
  impossible, settled jamais atteint.
  Source : PresenceProofGuard.js C-03.

- La fenêtre de check-in n'est pas encore ouverte quand
  la transition event_sealed → performed est demandée :
  PresenceWindowGuard bloque, le talent ne peut pas
  démarrer sa prestation dans le système.
  Source : PresenceWindowGuard.js Condition 2.

- D-075 C-04 : GPS trop loin (> maxDistancePolicy) :
  payout bloqué même si le talent a réellement joué.
  Seul SoloFounderOverride peut contourner.
  Source : PresenceProofGuard.js C-04.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- PresenceWindowGuard : complet. Vérifie 3 conditions :
  (1) eventScheduledStartAt présent et valide, (2) fenêtre
  ouverte (now ≥ startAt − checkInWindowMinutes), (3)
  sessionPresenceId au format SPR-* présent. checkIn-
  WindowMinutes lu depuis PolicyConfig en base. nowOverride
  disponible pour les tests. Inclus dans les 3 guards de
  la chaîne post-event résolus le 21 mai selon Plan
  Implantation, avec T-01 à T-05 GUARDS-CHAIN-01 PASSED.
  Source : PresenceWindowGuard.js complet + Plan
  Implantation "13 guards implémentés".

- PresenceProofGuard : complet. 11 conditions D-075
  séquentielles, toutes les valeurs de seuil lues depuis
  PolicyConfig. C-05 implémente la règle à deux couches
  (max(plancher, durée_contrat × ratio)), C-08 exige
  SOTSSubmission sauf SoloFounderOverride, C-11 vérifie
  l'idempotency SettlementInstruction. Test PRESENCEPROOF-01
  couvre les 11 conditions + les deux cas de transition.
  PASSED selon Plan Implantation 16/16.
  Source : PresenceProofGuard.js complet.

- SessionPresenceService : complet. create() génère un
  systemId SPR-* via IDFactory, persist via repository,
  signalTypes par défaut ['MANUAL'] si GPS absent.
  recordCheckout() valide finalDurationMinutes entier
  non-négatif (D-064). getByEngagementId() pour construire
  le contexte des guards. Séparation nette persistence /
  validation (pas de logique métier dans le service).
  Test SESSION-PRESENCE-01 PASSED (7 cas).
  Source : SessionPresenceService.js complet.

- SessionPresenceRepository : complet. create() valide
  le préfixe SPR-, findByEngagementId() pour les guards,
  updateCheckout() valide finalDurationMinutes entier.
  Connecté dans repositories/index.js à la clé
  sessionPresence.
  Source : SessionPresenceRepository.js + index.js L.108.

- PolicyConfig seedée : maxDistancePolicy (500m),
  minDurationFloorMinutes (30), minDurationRatioPpm
  (950 000 = 95%) — valeurs ratifiées par le fondateur.
  Source : PRESENCEPROOF-01 mock DB valeurs + Plan
  Implantation "PolicyConfig : 20 configs seedées".

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 n'avait pas de SessionPresence GPS
  formalisée. La présence était gérée manuellement ou
  absente. V3 repart de zéro — pas de dette directe.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée dans ce domaine.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-D1 — Bouton UI "Je suis arrivé" absent du
  code soumis. SessionPresenceService.create() est
  implémenté. Mais aucune interface Base44 (page, fonction
  API, endpoint) ne l'appelle. Le talent n'a aucun moyen
  dans le système actuel de déclencher son check-in. Sans
  sessionPresenceId en base, PresenceWindowGuard bloque
  event_sealed → performed.
  Source : Plan Implantation §1.1 — *"Page ou endpoint dans
  Base44 : bouton 'Je suis arrivé' pour le talent →
  appelle SessionPresenceService.create()"* — listé comme
  livrable Phase 1 non encore livré.
  NOTE : Pour Event 0A pilote, ce bloquant peut être
  contourné par une insertion manuelle de SessionPresence
  en base (SoloFounderOverride documenté). Bloquant absolu
  pour Event 0B et tout event sans fondateur sur place.

- BLOQUANT-D2 — recordCheckout() / finalDurationMinutes
  sans UX d'appel. PresenceProofGuard C-05 vérifie
  sessionPresence.durationMinutes. Ce champ n'est rempli
  que par recordCheckout(). Sans déclencheur UI côté
  talent (bouton "Mon set est terminé"), durationMinutes
  reste null et C-05 bloque le payout.
  Source : PresenceProofGuard.js C-05 — *"sessionPresence.
  durationMinutes absent. checkoutAt requis."*
  NOTE : contournable à Event 0A par insertion manuelle
  du checkout en base.

- BLOQUANT-D3 — Context de PresenceProofGuard non
  assemblé par aucun orchestrateur visible. Le guard
  exige 9 champs dans context (sessionPresence, contract-
  SnapshotPhase2, isSelfOrganized, organizerValidated,
  sotsSubmission, activeSafetyReport, activeDispute,
  settlementInstruction, transitionReason). Aucun service
  ou script dans le ZIP ne collecte ces données depuis la
  base et les assemble avant d'appeler transitionEngagement
  (contestation_window → payable). Pour Event 0A, le
  fondateur devra assembler ce contexte manuellement.
  INFÉRENCE NON DOCUMENTÉE — non listé comme livrable
  explicite dans le Plan Implantation.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-D1 — PresenceProofResolver (D-093) réduit à
  GPS + durée dans PresenceProofGuard. La doctrine D-093
  définit 8 signaux pondérés (QR code, validation staff,
  timestamp, Checkpoint actif, TicketAdmissionRight, log
  connexion, etc.). Le guard n'implémente que GPS (C-04)
  et durée (C-05). Les 6 autres signaux sont absents.
  Pour Event 0A avec GPS disponible, c'est suffisant.
  Pour EventLocation sans GPS fiable ou venue privée, le
  système n'a pas de signal de repli.
  Source : OS V15 D-093, D-093-A — matrice 8 signaux.

- DÉGRADANT-D2 — signalTypes par défaut à ['MANUAL'].
  SessionPresenceService.create() pose signalTypes:
  ['MANUAL'] si GPS absent. PresenceProofGuard ne
  distingue pas les types de signaux dans sa validation
  — il vérifie uniquement gpsDistanceMeters. Une présence
  purement MANUAL avec gpsDistanceMeters=0 passerait la
  C-04 sans vrai signal géographique.
  Source : SessionPresenceService.js L.~75.

- DÉGRADANT-D3 — updateCheckout() identifie le record
  par base44Id, pas par systemId SPR-*. Le repository
  attend l'identifiant Base44 interne pour le PUT. Cela
  crée une dépendance à l'ID Base44 au moment du checkout,
  qui doit être conservé quelque part entre le check-in
  et la fin du set. Non documenté comment l'appelant
  obtient ce base44Id.
  Source : SessionPresenceRepository.js updateCheckout().

REPORTABLE (peut attendre l'événement 2+) :

- D-093-A signaux complets (QR code, staff, Checkpoint) :
  infrastructure non MVP. Non-bloquant si GPS disponible.
  Source : OS V15 D-093-A.

- SpoofingDetectionPolicyConfig (D-093) : anti-spoofing
  GPS non implémenté. Reportable post-MVP.
  Source : OS V15 D-093.

ANGLE MORT POTENTIEL :

- La transition event_sealed → performed exige un
  sessionPresenceId dans le context. Mais qui le fournit ?
  Normalement, le talent ouvre l'app, clique "Je suis
  arrivé", le SPR-* est créé, et l'appelant qui demande
  la transition récupère ce SPR-* depuis la base. Ce
  flux complet (talent → UI → SessionPresenceService.
  create() → récupérer SPR-* → transitionEngagement()) est
  un pipeline non implémenté bout-à-bout.
  INFÉRENCE NON DOCUMENTÉE — à valider : est-ce que la
  transition event_sealed → performed est déclenchée par
  le talent lui-même, ou par un cron, ou par le fondateur ?
  La réponse conditionne l'architecture du check-in.

- Pour Event 0A pilote (lieu = Bar Le Trèfle, Montréal),
  la précision GPS dépend de l'appareil du talent. La
  config maxDistancePolicy = 500m est généreuse. Mais si
  le signal GPS est faible à l'intérieur du bar, gps-
  DistanceMeters pourrait être > 500m malgré présence
  réelle. Aucun mécanisme de repli WIFI ou QR dans le
  code actuel.
  INFÉRENCE NON DOCUMENTÉE — à valider : le fondateur
  sera sur place pour Event 0A, SoloFounderOverride
  disponible. Mais le seuil 500m doit être confirmé
  comme valide pour Le Trèfle spécifiquement.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : Ce domaine est entièrement nouveau en V3. Aucune
dette V1/V2. La logique de validation est soundement
architecturée autour de PolicyConfig (pas de constantes
hardcodées), et les tests unitaires sont solides (11/11
conditions couvertes dans PRESENCEPROOF-01).

La dette est exclusivement d'ordre opérationnel : la
couche de persistence (service + repository) est prête,
mais la couche de déclenchement UX (bouton, endpoint,
orchestrateur de contexte) ne l'est pas. C'est un
câblage, pas une refonte.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction : créer dans Base44 un bouton
"Je suis arrivé" qui appelle SessionPresenceService.create()
et un bouton "Mon set est terminé" qui appelle recordCheckout()
— et écrire l'orchestrateur qui assemble les 9 champs de
context pour PresenceProofGuard avant de déclencher
contestation_window → payable. Pour Event 0A, ces trois
éléments peuvent être remplacés par des insertions manuelles
documentées sous SoloFounderOverride.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → 65%

Ce qui reste :
  BLOQUANT-D1 : bouton "Je suis arrivé" UI ou insertion
    manuelle Event 0A (SoloFounderOverride)
  BLOQUANT-D2 : bouton "Mon set est terminé" UI ou
    insertion manuelle checkout
  BLOQUANT-D3 : orchestrateur contexte PresenceProofGuard
    (service non visible, peut être fait manuellement
    pour Event 0A)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine A (Ontologie) dépend de ce domaine pour que
  event_sealed → performed soit possible (sessionPresenceId
  requis dans context par PresenceWindowGuard).
  Source : OS V15 §2.7.1 table.

- Domaine B (Finance et ledger) dépend de ce domaine car
  PresenceProofGuard est le GUARD 3 sur la transition
  contestation_window → payable, et GUARD 4 (LedgerInvariant-
  Guard) ne s'exécute que si C-01 à C-11 sont passées.
  Sans preuve de présence valide, aucun payout n'est
  autorisé.
  Source : transitionEngagement.js GUARD 3 + 4, OS V15
  §2.7.1.

- Domaine E (SOTS et réputation) dépend de ce domaine
  car C-08 de PresenceProofGuard exige une SOTSSubmission.
  La présence et le SOTS sont co-dépendants : pas de
  payout sans les deux.
  Source : PresenceProofGuard.js C-08 — *"Source : D-075
  Condition 8 · SOTS-TEMOIN-01 (VT-22)."*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — D. PRÉSENCE ET PREUVE
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━