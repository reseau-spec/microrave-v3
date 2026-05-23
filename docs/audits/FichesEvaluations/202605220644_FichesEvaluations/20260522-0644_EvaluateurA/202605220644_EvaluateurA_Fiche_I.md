━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — I. UX ET VÉRITÉ PERÇUE
(ventilation avant acceptation, état payout lisible,
fonds protégés)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-024, D-084, D-085, D-086, D-087, D-088, D-089, D-090,
     TEST_REGISTRY Catégorie 8)
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md §3.1
  • src/ — inventaire complet (adapters/, core/, repositories/,
    services/ uniquement — aucun composant UI)

Niveau de confiance : HAUTE pour l'absence totale de composants
  UI dans le ZIP soumis (constat direct par listing src/).
  HAUTE pour la doctrine UX (D-024/084/085 — décisions bien
  documentées dans les registres).
  INFÉRENCE pour V1 microrave.ca — des pages existent peut-être
  en production mais aucun code V1 n'est dans le ZIP.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- La page talent affiche la ventilation complète obligatoire
  avant que le bouton "Accepter" soit activable :
  cachet brut → tier → taux de base → score SOTS →
  multiplicateur SOTS → taux effectif → commission MR →
  cachet net. Le talent ne peut pas accepter sans l'avoir vue.
  Source : OS V15 D-024 — *"Au moment de l'acceptation
  finale : la ventilation complète s'affiche obligatoirement
  et intégralement."*

- L'état payout affiché au talent correspond à l'état métier
  prouvé (UXTruthProjection D-084). Format universel
  5 éléments : statut / argent / prochaine action / délai /
  preuve ou blocage.
  Source : OS V15 D-084 — *"Chaque état visible par le talent
  affiche : 1. Statut 2. Argent 3. Prochaine action 4. Délai
  5. Preuve ou blocage."*

- Tout blocage de payout affiche un PayoutBlockReason
  explicite et lisible — jamais de blocage silencieux.
  Source : OS V15 D-101, D-087 — *"Tout verrou déclenché =
  PayoutBlockReason créé avec code explicite. Jamais blocage
  silencieux."*

- La page payeur utilise le terme "fonds protégés" et non
  "escrow". Affiche l'état des fonds au bon moment.
  Source : OS V15 D-085 — *"Le mot 'escrow' est interdit
  dans l'interface."*

- UXTruthProjection : chaque statut visible est connecté à
  transitionEngagement(), pas à un champ libre modifiable
  depuis l'UI Base44.
  Source : Plan Implantation §3.1 — *"Connecter chaque
  statut visible à transitionEngagement(), pas à un champ
  libre."*

Ce domaine bloque tout le reste si :

- Pour la première transaction (Event 0A pilote), ce domaine
  est **hors chemin critique** — D-144 CONTROLLED SUCCESS
  autorise l'absence d'UX complète pour Event 0A avec
  fondateur sur place.
  Source : Plan Implantation §3.1 — *"Tests UX-VENTILATION-01,
  UX-PAYOUT-STATUS-01, UX-FONDSPROTEGÉS-01, UX-01 requis
  avant Event 1."* (pas Event 0A).

- Pour Event 1 (premier event sans fondateur sur place),
  l'absence de ventilation D-024 bloque : le talent ne peut
  pas consentir en connaissance de cause.
  Source : TEST_REGISTRY Catégorie 8 — requiredBeforeEvent=1.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- Doctrine UX entièrement validée : D-024 (ventilation
  progressive et obligatoire), D-084 (format 5 éléments
  universel), D-085 (fonds protégés), D-086 (explication
  frais MR), D-087 (notification non accusatoire 6 points),
  D-088 (i18n français d'abord), D-089 (dashboard
  organisateur), D-090 (dashboard vendeur).
  Source : registres EXPORT_BRUT, tous statut VALIDÉ.

- Les données nécessaires à l'UX sont toutes calculées et
  disponibles : waterfall (SealingGuard retourne le
  ContractSnapshot phase 2 avec cachet brut final, commission,
  net), état Engagement (TRANSITION_TABLE), PayoutBlockReason
  (PayoutExecutor PAYOUT_BLOCK_REASONS enum).
  Source : SealingGuard.js + PayoutExecutor.js.

- Stratégie de migration V1 → V3 documentée : Plan
  Implantation §3.1 — *"Adapter les pages existantes de V1
  microrave.ca vers V3. Ne pas repartir de zéro."*
  Source : Plan Implantation §3.1.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 (microrave.ca) possède des pages UI
  fonctionnelles. Selon Plan Implantation §3.1, elles peuvent
  être adaptées vers V3 — c'est une stratégie, pas une
  livraison. Avantage : point de départ existant ; dette
  potentielle : logique UI V1 couplée aux entités V1 (non
  compatibles sans adaptation avec la machine d'état V3).

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune UI V2 identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- Aucun bloquant pour Event 0A. Ce domaine est explicitement
  classé Phase 3 (requiredBeforeEvent=1) dans le Plan
  Implantation et le TEST_REGISTRY.
  Source : Plan Implantation §3.1 + TEST_REGISTRY Catégorie 8.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-I1 — Absence totale de composants UI dans le
  ZIP soumis. Aucun fichier .jsx, .tsx, .vue, .html dans
  src/. L'intégralité de la couche présentation est absente
  du codebase V3 actuel.
  Source : listing src/ — *"adapters/, core/, repositories/,
  services/ uniquement."*
  NOTE : Pour Event 0A (fondateur sur place, manipulation
  directe de la base via scripts et APIs), c'est acceptable.
  Dégradant pour tout event impliquant un talent ou payeur
  externe.

- DÉGRADANT-I2 — D-088 : aucune chaîne i18n externalisée
  visible. Aucun fichier de traduction ni système i18n dans
  le ZIP. La règle *"aucune chaîne visible par l'utilisateur
  hardcodée dans le code"* n'est pas vérifiable sans pages.
  Source : OS V15 D-088.

- DÉGRADANT-I3 — UXTruthProjection non câblée. D-084 exige
  que l'état affiché = l'état métier prouvé, connecté à
  transitionEngagement(). Sans pages, cette connexion ne
  peut pas être réalisée. Un champ status modifiable
  directement depuis l'UI Base44 contournerait toute la
  doctrine.
  Source : Plan Implantation §3.1 — *"connecter chaque
  statut visible à transitionEngagement(), pas à un champ
  libre."*

REPORTABLE (peut attendre l'événement 2+) :

- Tous les tests P0 Catégorie 8 (UX-VENTILATION-01,
  UX-PAYOUT-STATUS-01, UX-FONDSPROTEGÉS-01, UX-01) :
  requiredBeforeEvent=1. Non créés, non requis avant Event 0A.
  Source : TEST_REGISTRY Catégorie 8.

- D-089 dashboard organisateur temps réel (timeline incident,
  délégué) : Phase 3, requis avant Event 1.

- D-090 dashboard vendeur : Phase 3+.

- D-025 facture payeur 5 lignes canoniques : Phase 3.

- UX-QUICKPLAY-30S-01 (conditionnel, Event 2+) : non
  applicable avant activation QuickPlay.

ANGLE MORT POTENTIEL :

- Pour Event 0A, le fondateur utilisera l'interface
  d'administration de Base44 directement pour créer
  l'Engagement, voir les données et suivre les états.
  Cette interface Base44 n'est pas contrôlée par la
  doctrine UX V3 — elle peut afficher des états, des
  montants et des termes non conformes à D-084/D-085/D-086.
  Le talent DJ Alex et l'organisateur (Bar Le Trèfle)
  verront-ils cette interface Base44 brute, ou le fondateur
  sera-t-il le seul intermédiaire ?
  INFÉRENCE NON DOCUMENTÉE — à valider : pour Event 0A,
  qui voit quoi dans l'interface ? Si DJ Alex doit avoir
  accès à une page pour son check-in GPS (domaine D,
  BLOQUANT-D1), cette page doit afficher quelque chose —
  et cette page n'existe pas encore en V3.

- D-024 exige que la ventilation soit visible *avant* que
  le bouton Accepter soit activable — ce n'est pas une
  contrainte backend (le guard MissionConversionGuard ne
  vérifie pas que la ventilation a été affichée), c'est
  une contrainte frontend pure. Sans code frontend, cette
  invariante est invérifiable et non enforceable.
  INFÉRENCE NON DOCUMENTÉE — à valider : pour Event 0A,
  le consentement éclairé du talent sera-t-il documenté
  manuellement (signature hors système) ou via une page V3 ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Positive : La doctrine UX est complète et bien rédigée
(D-024 à D-090, 7 décisions validées). Elle peut servir de
spec directe pour développer les pages — pas de
déchiffrement ou de reverse engineering nécessaire.

V1 (microrave.ca) offre une base de pages existantes à
adapter selon la stratégie documentée dans le Plan
Implantation. L'avantage est réel : layout, routing et
composants de base existent déjà, réduisant la portée du
travail à un cadrage V3 plutôt qu'une construction
from-scratch.

Risque V1 : les pages V1 sont probablement couplées à des
états et entités non-souverains (sans systemId IDFactory,
sans transitionEngagement()). L'adaptation exige une
déconnexion des états V1 et un recâblage sur l'API V3 —
travail non trivial.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (Event 0A avec fondateur en
médiation) : aucun delta requis côté UX formelle — le
fondateur opère directement. Pour Event 1 (talent et
organisateur autonomes) : implémenter les 3 pages
essentielles (talent : ventilation + check-in + état payout ;
organisateur : dashboard lineup ; payeur : fonds protégés)
en adaptant les pages V1 existantes vers les APIs V3 et
en connectant chaque statut à transitionEngagement().

──────────────────────────────────────────────────
6. STATUT FINAL

☑ BLOQUÉ PAR → Décision opérationnelle Event 0A

Pour Event 0A : domaine hors chemin critique (requiredBefore-
Event=1). Statut acceptable : CONTRÔLÉ par le fondateur
sans pages V3.

Pour Event 1 : NON COMMENCÉ — aucun composant UI V3 dans
le ZIP. Stratégie d'adaptation V1 documentée mais non
exécutée.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Ce domaine ne bloque aucun autre domaine pour la première
  transaction (Event 0A) — tous les autres domaines A–J
  fonctionnent sans couche UI.
  Source : TEST_REGISTRY — tous les tests Catégorie 8
  requiredBeforeEvent=1, pas 0A.

- Domaine D (Présence et preuve) a une dépendance pratique
  sur ce domaine : le bouton "Je suis arrivé" doit exister
  quelque part pour que SessionPresenceService.create()
  soit appelé. Sans page, ce bouton n'existe pas — mais
  cette lacune est classée BLOQUANT-D1 (domaine D) et non
  ici.
  Source : Plan Implantation §1.1.

- INFÉRENCE : Domaine J (Acteurs et onboarding) dépend
  de ce domaine pour que le talent puisse compléter son
  onboarding Stripe Connect (page retour URL après
  onboarding) et voir son profil. Sans pages, l'onboarding
  KYC s'arrête au lien généré par StripeConnectService —
  le talent n'a nulle part où revenir après.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — I. UX ET VÉRITÉ PERÇUE
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━