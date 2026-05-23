━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — I. UX et vérité perçue
(ventilation avant acceptation, état payout lisible,
fonds protégés)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-024, D-025, D-084, D-085, D-086, D-087, D-088,
     D-089, D-090, D-091, D-092, D-118, TEST_REGISTRY
     Catégorie 1 UX-01 et Catégorie 8, FIRST_EVENT_REGISTER)
  • package.json · App.jsx (futuristic-rave-core-flow)
  • PolicyDashboard.jsx · PolicyFormDialog.jsx
Niveau de confiance : HAUTE sur la doctrine UX (D-084 à D-092)
                      IMPOSSIBLE À ÉVALUER sur l'implémentation UX :
                        aucune page talent, organisateur ou payeur
                        n'est présente dans le code livré
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Ventilation complète affichée avant acceptation du talent
  (bouton "Accepter" non activable avant vue) : cachet brut,
  tier, taux de base, score SOTS, multiplicateur SOTS, taux
  effectif, commission MR, cachet net — D-024, EXPORT_BRUT
  section D-024 + D-118 critère 1
- UX-VENTILATION-01 PASSED (requiredBeforeEvent=1) —
  EXPORT_BRUT TEST_REGISTRY Catégorie 8
- État payout visible par le talent avec PayoutBlockReason
  lisible pour chaque blocage — D-084 règle 5 éléments :
  "Statut / Argent / Prochaine action / Délai / Preuve
  ou blocage" + D-118 critère 2
- UX-PAYOUT-STATUS-01 PASSED (requiredBeforeEvent=1) —
  EXPORT_BRUT TEST_REGISTRY Catégorie 8
- Payeur voit "fonds protégés" (le mot "escrow" est
  interdit dans l'interface) au bon état — D-085 règle
  de vocabulaire + D-118 critère 3
- UX-FONDSPROTEGÉS-01 PASSED (requiredBeforeEvent=1) —
  EXPORT_BRUT TEST_REGISTRY Catégorie 8
- UX-01 PASSED (requiredBeforeEvent=1) : UXTruthProjection
  — état affiché = état métier prouvé — D-084,
  EXPORT_BRUT TEST_REGISTRY Catégorie 1
- Aucune chaîne visible hardcodée : tout externalisé dans
  i18n — D-088 règle invariante
- Reconnaissance pilote obtenue : "Je comprends que je
  participe à un événement pilote Micro Rave avec argent
  réel, support humain, et suivi post-event" — D-140,
  EXPORT_BRUT FIRST_EVENT_REGISTER section consentement
- Signal 11 de surveillance : "Support humain — talent et
  organisateur comprennent leur état" — EXPORT_BRUT
  FIRST_EVENT_REGISTER section surveillance 12 signaux

Ce domaine bloque tout le reste si :

- Talent ne voit pas la ventilation avant acceptation →
  MissionConversionGuard peut valider mais le consentement
  éclairé n'est pas prouvé → D-005 : "Ce que tu acceptes
  est transparent" = promesse fondamentale non tenue
- "Escrow" apparaît dans l'interface → D-085 violation
  explicite
- UXTruthProjection défaillante (état affiché ≠ état
  métier réel) → UX-01 FAILED → Event 1 interdit

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

Doctrine UX complète et validée (D-084 à D-092).
  • D-084 : format universel 5 éléments par état talent
    (Statut / Argent / Prochaine action / Délai / Preuve
    ou blocage) — EXPORT_BRUT section D-084.
  • D-085 : interdiction du mot "escrow", remplacement
    obligatoire par "fonds protégés" — EXPORT_BRUT D-085.
  • D-086 : textes d'explication des frais MR validés
    pour talent, payeur, onboarding — EXPORT_BRUT D-086.
  • D-087 : format notification négative canonique 6
    éléments (Raison/Preuve/Règle/Recours/Délai/Arbitre),
    ton non accusatoire — EXPORT_BRUT D-087.
  • D-088 : français d'abord, architecture i18n bilingue,
    aucune chaîne hardcodée — EXPORT_BRUT D-088.
  • D-024 : ventilation UX progressive et obligatoire,
    bouton "Accepter" bloqué avant vue complète —
    EXPORT_BRUT D-024.
  • D-025 : facture payeur 5 lignes canoniques —
    EXPORT_BRUT D-025.

PolicyDashboard — seule UI livrée dans le code V3.
  • futuristic-rave-core-flow App.jsx : une seule route
    "/" → PolicyDashboard. C'est un tableau de bord admin
    pour gérer les PolicyConfig en Base44 — non une
    interface talent, organisateur ou payeur — source :
    App.jsx.
  • PolicyFormDialog supporte les 8 value_types dont
    BOOLEAN — source : PolicyFormDialog.jsx. Note :
    c'est ce fichier qui confirme que BOOLEAN est valide
    dans Base44, contredisant le validateur du test
    POLICYCONFIG-FAILCLOSED-01.

PayoutBlockReason codes définis dans PayoutExecutor.
  • PAYOUT_BLOCK_REASONS constants définies dans le code
    backend : NOT_PAYABLE, ALREADY_EXECUTED, NO_SETTLEMENT_
    INSTRUCTION, INSTRUCTION_CONSUMED, KYC_NOT_VERIFIED,
    LEDGER_INVARIANT_FAILED, STRIPE_TRANSFER_FAILED —
    source : PayoutExecutor.js. Ces codes sont le
    substrat de UX-PAYOUT-STATUS-01.

Minimum Viable Trust D-118 critères 1-3 documentés.
  • Critère 1 (ventilation), critère 2 (état payout),
    critère 3 (fonds protégés) correspondent exactement
    aux 3 tests UX P0 — source : EXPORT_BRUT D-118.

Reconnaissance pilote textuelle validée.
  • "Je comprends que je participe à un événement pilote
    Micro Rave avec argent réel, support humain, et suivi
    post-event" — formulation ratifiée — EXPORT_BRUT
    D-140 + FIRST_EVENT_REGISTER ligne 3070.

Ce qui vient de V1 et est encore actif :
  V1 sur microrave.ca a une UI opérationnelle (pages
  talent, organisateur, etc.) en Base44. ACQUIS : le
  réseau connaît déjà l'interface Base44. DETTE : V1 ne
  montre probablement pas la ventilation complète avant
  acceptation (D-024) ni les "fonds protégés" (D-085).
  L'upgrade UX est nécessaire avant Event 1.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-I1 — UX talent/organisateur/payeur : aucune
  page ni composant présent dans le code V3 livré.
  App.jsx ne contient qu'une route "/" → PolicyDashboard
  (admin PolicyConfig) — source : App.jsx. Il n'existe
  aucune page talent (négociation, ventilation, check-in,
  état payout), aucune page organisateur (dashboard
  lineup, timeline), aucune page payeur (fonds protégés,
  facture) dans le code soumis — source : ls pages/.
  UX-VENTILATION-01, UX-PAYOUT-STATUS-01, UX-FONDSPROTEGÉS-01
  et UX-01 ne peuvent pas passer sans ces pages.
  CONSÉQUENCE : ces 4 tests sont requiredBeforeEvent=1 —
  EXPORT_BRUT TEST_REGISTRY. Sans eux, Event 1 est
  interdit.

- BLOQUANT-I2 — UXTruthProjection non vérifiable.
  D-084 exige que l'état affiché = l'état métier prouvé.
  Sans couche UI connectée à transitionEngagement(),
  cette projection est impossible à tester. UX-01
  (requiredBeforeEvent=1) ne peut pas passer — source :
  EXPORT_BRUT TEST_REGISTRY Catégorie 1.

- BLOQUANT-I3 — Reconnaissance pilote non collectée.
  La checklist pré-Event 1 exige "Talent accepté,
  organisateur/payeur accepté, canal support confirmé"
  — EXPORT_BRUT FIRST_EVENT_REGISTER. Cette
  reconnaissance nécessite un mécanisme de consentement
  explicite dans l'UX (bouton, signature, ou confirmation
  textuelle documentée). Aucun mécanisme visible.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- D-088 i18n : aucune infrastructure i18n dans le code V3.
  Le package.json ne contient pas react-i18next, i18next,
  formatjs ni équivalent — source : package.json. La
  règle "aucune chaîne visible hardcodée" (D-088) ne
  peut pas être vérifiée sans infrastructure. Pour Event 1
  avec un fondateur bilingue, l'impact est limité.

- D-087 notifications négatives : les messages d'erreur
  des guards (GUARD_FAILED, C-03_NO_CHECKIN, etc.) sont
  en français technique. Le format canonique D-087
  (Raison/Preuve/Règle/Recours/Délai/Arbitre) n'est pas
  appliqué — ces messages sont pour les développeurs,
  pas pour les utilisateurs finaux.

- D-089 dashboard organisateur (vue lineup temps réel
  avec délégué et timeline incident) non implémenté —
  non bloquant si le fondateur gère directement via
  Base44 admin pour Event 1.

- D-090 dashboard vendeur — non requis pour Event 1
  sans vendeur actif.

REPORTABLE (peut attendre l'événement 2+) :

- UX-QUICKPLAY-30S-01 (Conditionnel, requiredBeforeEvent=2)
  — QuickPlay non activé pour Event 1.
- D-091 Checkpoint interface complète — post-Event 1.
- D-092 CheckpointCulturalProfile EMA — post-Event 1.
- Architecture bilingue EN (D-088 V3.0.1) — post-Event 1.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : L'UX de Micro Rave V3
  est dans Base44 (plateforme no-code) — la doctrine
  prévoit cette séparation (D-127). Mais aucun document
  n'indique si les pages talent/organisateur/payeur
  existent déjà dans l'instance Base44 de production
  (microrave.ca V1) et sont réutilisables, ou si elles
  doivent être reconstruites en V3. Si V1 a des pages
  opérationnelles et que le fondateur les adapte pour
  V3, ce bloquant peut être résolu sans code livrable
  dans le zip. À clarifier : l'UX V3 existe-t-elle
  en Base44 sous une autre instance ou est-elle à
  construire from scratch?

→ INFÉRENCE NON DOCUMENTÉE 2 : Signal 12 de surveillance
  "UXTruthProjection — affiché = état métier réel"
  présuppose une connexion temps réel entre l'état de
  l'Engagement dans la machine d'état V3 et l'affichage
  dans Base44 UI. Cette connexion (comment Base44 lit
  l'état de l'Engagement créé par transitionEngagement())
  n'est pas documentée ni implémentée dans le code livré.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : V1 a une UI opérationnelle en Base44 sur
  microrave.ca — pages existantes, flux connus des
  utilisateurs, DJ Alex et Le Trèfle connaissent
  l'interface. ACQUIS majeur : la résistance à l'adoption
  UX est nulle. DETTE : V1 n'affiche pas la ventilation
  D-024 (requise), utilise peut-être "escrow" (interdit),
  et ne connecte pas les états machine à l'affichage.
  L'upgrade vers V3 UX est une évolution de l'existant,
  pas une refonte complète.

De Base44 : Base44 fournit des composants UI (Shadcn,
  formulaires, dialogues) déjà présents dans
  futuristic-rave-core-flow. La dette est nulle sur la
  couche technique UI — les composants sont là.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Construire (ou adapter depuis V1) les pages Base44 :
ventilation talent avant acceptation (D-024), état payout
avec PayoutBlockReason lisible (D-084), "fonds protégés"
payeur (D-085), connecter ces pages à l'état réel de la
machine d'état V3 (UXTruthProjection), collecter la
reconnaissance pilote des co-testeurs, et confirmer que
"canal support confirmé" est en place pour Event 1.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ IMPOSSIBLE À ÉVALUER → ce qui manque :

  L'UX est entièrement dans Base44 UI — non livrable
  dans un zip de code Node.js. Le seul frontend livré
  (futuristic-rave-core-flow) est un dashboard admin
  PolicyConfig, non les pages métier. L'état de l'UX
  talent/organisateur/payeur dans l'instance Base44
  de production est inconnu depuis ce zip.

  Ce qui peut être évalué : la doctrine (100% validée)
  et les PayoutBlockReason codes backend (présents).
  Ce qui ne peut pas être évalué : l'implémentation
  des pages, la ventilation D-024, l'UXTruthProjection,
  la reconnaissance pilote.

  Conditions pour passer de IMPOSSIBLE À ÉVALUER à
  EN COURS : fournir un accès ou un export des pages
  Base44 existantes (screenshots, export JSON des
  composants) ou confirmer que les pages V1 sur
  microrave.ca sont réutilisables pour Event 1.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Ce domaine ne bloque aucun autre domaine technique
  (A à H). Les guards, le waterfall, le scheduler
  fonctionnent indépendamment de l'UX.

- Ce domaine bloque la première transaction en tant
  qu'expérience utilisateur : sans ventilation visible,
  le talent ne peut pas consentir en connaissance de
  cause — D-005 : "Ce que tu acceptes est transparent"
  = promesse fondamentale. FULL SUCCESS exige que le
  talent comprenne son état (signal 11 surveillance) —
  source : EXPORT_BRUT FIRST_EVENT_REGISTER.

- INFÉRENCE : GoNoGoDecisionRecord = GO requiert que
  la checklist pré-Event 1 soit complète, incluant
  "Consentement pilote : Talent accepté, organisateur/
  payeur accepté, canal support confirmé" — source :
  EXPORT_BRUT FIRST_EVENT_REGISTER. Sans mécanisme de
  consentement explicite, cette case ne peut pas être
  cochée formellement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — I. UX et vérité perçue
Conserver cette fiche pour le Prompt de Synthèse.