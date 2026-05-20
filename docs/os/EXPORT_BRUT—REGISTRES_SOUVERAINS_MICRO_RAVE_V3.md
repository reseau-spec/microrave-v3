# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 1 / 8**

---

## **0\. Métadonnées de l'export**

**Date de génération :** 13 mai 2026 · **Mise à jour :** 20 mai 2026 **Portée :** BLOCs 0 à 18 — interrogatoire procédural complet **Total des décisions :** 158 décisions validées

**Liste des décisions principales :** D-001 à D-147 **Liste des décisions amendées :**

* D-060-A — Ajout compte 6119 au LedgerCodeMap V3  
* D-093-A — PresenceProofResolver précisions conditionnelles  
* D-096-A — Rétention 7 ans comme plancher \+ retentionJustificationCode  
* D-120-A — Capitaine QuickPlay correction complète
* D-019-A — Machine d'état V4 complète (remplace D-019)
* D-019-B — Séparation Frein d'Urgence / Contestation de Prestation
* SC-NO-SHOW-PRE — Waterfall no\_show\_pre\_event → archived
* SC-DEPOSIT-FAIL — Waterfall deposit\_failed → archived
* SC-08-PARTIEL — Waterfall partially\_settled (deliveryRecognizedRatio)
* D-147 — EngagementAmendment — extension de plage horaire sur accord mutuel
* CT-014 — Clarification LOI NO-SHOW-01 multi-talent avec coefficient

**Registres inclus :**

1. DECISION\_REGISTRY\_V3  
2. FOUNDER\_FINGERPRINT\_REGISTER  
3. ASSUMPTION\_REGISTER\_V3  
4. CONTRADICTION\_REGISTER\_V3  
5. DO\_NOT\_BUILD\_YET\_REGISTER  
6. POLICYCONFIG\_REGISTER  
7. OBJECT\_REGISTRY  
8. TEST\_REGISTRY  
9. ECONOMIC\_SCENARIO\_REGISTER  
10. MVP\_SCOPE\_REGISTER  
11. ROADMAP\_REGISTER  
12. LIQUIDITY\_REGISTER  
13. FIRST\_EVENT\_REGISTER  
14. BASE44\_PORTABILITY\_REGISTER  
15. GLOSSARY\_CANONICAL  
16. RAW\_APPENDIX

---

## **1\. DECISION\_REGISTRY\_V3 — Export complet**

---

### **D-001 | Identité fondamentale du système**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Phrase canonique :** Micro Rave est une institution de règlement.

**Règle invariante :** Autorité surplombante sur les disputes. DecisionKernel final avec appel. Responsabilité de neutralité et de rigueur explicite dans les CGU et l'architecture.

**Contenu brut :** Micro Rave est une institution de règlement au sens définitif et architectural. Les décisions de DecisionKernel sont finales (avec appel, mais finales). Micro Rave porte une responsabilité de neutralité et de rigueur explicite dans les CGU et l'architecture.

**Objets concernés :** DecisionKernel, CGU

---

### **D-002 | Phrase souveraine — Loi Zéro**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Phrase canonique :** *"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*

**Règle invariante :** Entre dans tous les documents, toutes les PRs, tous les onboarding dev. Critère d'inclusion/exclusion de toute feature.

**Contenu brut :** La phrase souveraine de la V3 est validée telle quelle. Elle est la Loi Zéro. Si une feature, un schéma, ou une fonction ne contribue pas à cette chaîne, elle est hors scope.

---

### **D-003 | Refus fondamentaux**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Contenu brut :** Micro Rave ne deviendra jamais :

1. Un système où les relations personnelles dictent les relations professionnelles  
2. Un marché opaque où les mandats circulent par proximité sociale  
3. Un simple annuaire de prestataires  
4. Une marketplace molle sans garantie de suite  
5. Une boîte noire financière  
6. Une plateforme sans preuve, sans arbitrage et sans mémoire  
7. Un système qui exploite la scène culturelle au lieu de l'institutionnaliser

---

### **D-004 | Remplacement de LOI-GR-01 — Prix accepté**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Règle invariante :** LOI-GR-01 originale rejetée. La commission MR est prélevée sur le cachet brut, jamais ajoutée par-dessus.

**Contenu brut :** LOI-GR-01 — Le prix accepté est un cachet brut transparent, soumis au courtage connu du talent.

Quand un talent accepte une offre de 1 000 $, il accepte un cachet brut contractuel de 1 000 $. Ce montant n'est pas son net garanti. Avant d'accepter, le talent doit voir clairement :

* Cachet brut offert  
* Tier abonnement  
* Taux de courtage de base : X%  
* Score SOTS : Y/5  
* Modulation SOTS : ±Z%  
* Taux effectif : X%  
* Commission Micro Rave : X$  
* Cachet net estimé : X$

La commission MR est prélevée sur le montant offert, et non ajoutée par-dessus le cachet. Les taxes et les frais Stripe, eux, sont ajoutés au payeur.

**Configs concernées :** CommissionRateConfig, SOTSCommissionModulationConfig

---

### **D-005 | Promesse au talent**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Phrase canonique :** *"Ce que tu acceptes est transparent. Tu vois exactement ce que tu recevras avant d'accepter — et Micro Rave garantit ce règlement si tu livres ta présence."*

---

### **D-006 | Promesse à l'organisateur**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Phrase canonique :** *"Le bon talent, au bon prix, au bon moment, avec le bon client — dans un cadre professionnel où la preuve remplace l'improvisation et où la relation personnelle ne dicte plus seule la relation professionnelle."*

**Contenu brut :** Les sept risques réduits par Micro Rave pour l'organisateur :

1. Risque de mauvais choix de talent  
2. Risque de mauvais prix  
3. Risque de mauvais moment  
4. Risque de no-show ou présence non fiable  
5. Risque de qualité insuffisante  
6. Risque de litige non résolu  
7. Risque financier, fiscal et opérationnel

---

### **D-007 | Promesse au vendeur**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Phrase canonique :** *"Micro Rave te permet de transformer ton réseau en portefeuille."*

**Contenu brut :** Le vendeur est un courtier commercial autonome avec : ClientActivation, SellerAttribution, FirstCommission, ResidualCommission, SellerPortfolio, PortfolioValuation, PortfolioTransfer.

---

### **D-008 | Modèle cellule-succursale**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Contenu brut :** La cellule est une unité opérationnelle, commerciale, territoriale et hiérarchique définie par agrégation des codes postaux.

Paliers cellulaires :

1. Même code postal complet \= cellule quartier  
2. Même 5 premiers caractères \= cellule multiquartier  
3. Même 4 premiers caractères \= cellule locale  
4. Même 3 premiers caractères \= cellule sectorielle  
5. Même 2 premiers caractères \= cellule district  
6. Même 1 premier caractère \= cellule municipale  
7. Regroupement 3-5 municipalités \= cellule régionale  
8. Regroupement 3-5 régions \= cellule provinciale  
9. Regroupement tout un pays \= cellule nationale  
10. Regroupement tous les pays \= cellule mère/globale

Architecture database-driven totale : ajouter un poste \= créer une ligne, zéro changement de code.

Promesse en trois horizons :

* Immédiat : territoire structuré  
* Progressif : unité économique crédible  
* Long terme : nœud physique du circuit culturel Micro Rave

**Objets concernés :** CellularUnit, CellManager **Configs concernées :** GrowthPolicyConfig

---

### **D-009 | Statut des documents RÉFLEXION 01-05**

**Statut :** VALIDÉ **Bloc :** BLOC 0 — Vision et identité

**Règle invariante :** Hypothèses à contre-valider entièrement. Zéro décision acquise sans validation explicite dans ce processus.

---

### **D-010 | Modèle de visibilité des événements**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Trois niveaux de visibilité :

* SECRET : visible uniquement par l'organisateur \+ les utilisateurs explicitement invités  
* PRIVÉ : visible uniquement par le réseau de following mutuel de l'organisateur  
* PUBLIC : visible par tout utilisateur de la plateforme

S'applique aux Checkpoints commerciaux ouverts ET aux lieux privés/résidentiels. Les cellules et leurs employés opèrent dans ce même flux géolocalisé.

---

### **D-011 | L'Engagement comme atome \+ Pivot de Marché**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Règle invariante :** L'architecture entière doit être conçue pour un Pivot de Marché. Remplacer "musique, humour, vidéo" par "plomberie, électricien, déneigeur" \= modifier quelques lignes de database, zéro refonte de code.

**Contenu brut :** L'Engagement est l'objet atomique central : "un talent précis · pour un rôle précis · dans une plage précise · à un prix accepté · sous des conditions explicites · avec présence vérifiable · paiement sécurisé · réputation engagée · et règlement garanti par Micro Rave."

Le principe invariant architectural : *"Trouver le bon talent pour le bon gig, au bon prix, au bon moment"* est universel et doit être l'invariant architectural, pas le domaine culturel.

---

### **D-012 | Plusieurs Engagements par talent par event — Loi du gros bon sens**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Règle invariante :** Un talent peut avoir plusieurs Engagements dans le même event si et seulement si les plages horaires ne se chevauchent pas pour des rôles talent.

**Contenu brut :** Un user ne peut pas être simultanément DJ 14h-16h ET Vidéaste 14h-16h. Il peut être DJ 14h-15h ET Vidéaste 15h-16h. Les rôles non-talent (organisateur, payeur, vendeur) ne sont pas soumis à cette contrainte.

---

### **D-013 | Transfert natif d'Engagement**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Transfert natif validé. L'Engagement peut passer de Talent A à Talent B sous conditions. Histoire tracée. Réputation de Talent A affectée. Seuil maximal de cancellations en délai déraisonnable (moins de 72h avant l'event). Micro Rave est tier impartial qui propose des solutions — jamais responsable, toujours facilitateur.

---

### **D-014 | WORM en couches — 6 moments sacrés**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :**

| Moment | État | Ce qui devient immuable |
| ----- | ----- | ----- |
| 1\. ACCEPTED | Offre acceptée | Cachet brut, tier, taux de base, SOTS snapshot, multiplicateur, taux effectif estimé, commission estimée, net estimé, historique de négociation |
| 2\. DEPOSIT\_SECURED | Dépôt réglé | Liaison contractuelle des parties. Talent engagé à se présenter. Organisateur engagé à régler balance à J-7. Balance impayée J-7 → délai J-6. À J-6 \= annulation automatique \+ payout prorata dépôt |
| 3\. EVENT\_SEALED | Balance reçue \+ scellement | WORM financier complet. Montants, taux, taxes, frais Stripe snapshotés immuables. Toute correction \= amendment ou reversal formel |
| 4\. EVENT\_COMPLETED | Fin de l'événement | Ouverture fenêtre SOTS 24h |
| 5\. SOTS\_WINDOW\_CLOSED | 24h après fin event | WORM réputationnel. Résultats consolidés, scores snapshotés, ReputationLedger entries créées |
| 6\. ARCHIVED | Archive finale | WORM global lecture seule |

---

### **D-015 | Ontologie du vendeur-courtier — objets canoniques V3**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :**

| Objet | Définition |
| ----- | ----- |
| ClientActivation | Preuve qu'un vendeur a activé un client |
| ClientAttributionRight | Droit économique conditionnel reconnu au vendeur sur les flux d'un client activé |
| EventAttribution | Attribution ponctuelle sur l'Event initial |
| FirstCommission | Commission sur la première transaction admissible |
| ResidualCommission | Commission future sur les transactions admissibles du client activé, selon politique encadrée |
| SellerPortfolio | Agrégat des ClientAttributionRights actifs du vendeur |
| PortfolioTransfer | Transfert futur possible des droits économiques — pas des clients eux-mêmes |

Le client appartient institutionnellement à Micro Rave. Le vendeur détient un droit d'attribution économique conditionnel, pas une propriété.

---

### **D-016 | Hiérarchie Event → Lineup → Engagements**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Le Lineup est l'entité intermédiaire entre l'Event et les Engagements individuels. Il porte la réconciliation budgétaire totale. Il peut avoir son propre état indépendamment des Engagements individuels.

---

### **D-017 | Checkpoint ad hoc pour lieux privés \+ événements virtuels**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Un lieu privé/résidentiel \= Checkpoint ad hoc avec statut `private` ou `unverified`. Il accumule la mémoire culturelle géolocalisée mais sans jamais révéler l'adresse précise en UX. La granularité de présentation publique est limitée à un niveau de zoom ≥ 10 — rue ou quartier, jamais résidence. Un événement peut ne pas avoir d'adresse ni de géolocalisation s'il est virtuel (livestream DJ, open mic en ligne, etc.).

---

### **D-018 | Modèle de confidentialité — Principe du coffre-fort bancaire**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Règle invariante :** *"Chaque employé voit uniquement l'information nécessaire pour accomplir sa tâche, au moment où il en a besoin, et toute consultation d'information sensible doit être justifiée, autorisée et journalisée."*

**Contenu brut :** Les événements SECRET ne sont pas visibles par défaut aux employés de cellule, aux gestionnaires, ni aux admins centraux. L'accès est possible uniquement sous condition explicite : support client, fraude, fiscalité, paiement, litige, sécurité, conformité ou incident P0. Chaque accès produit un journal d'accès obligatoire.

---

### **D-019 | Machine d'état complète révisée**

**Statut :** REMPLACÉ PAR D-019-A — 19 mai 2026, 18:07 EST
**Note :** D-019 original contenait `balance_pending` et l'ancienne fenêtre de dispute.
Remplacé intégralement par D-019-A (machine d'état V4) et D-019-B (régimes de litige).

---

### **D-019-A | Amendement de D-019 — Machine d'état V4 complète**

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST **Bloc :** BLOC 1 — Ontologie du produit
**Remplace :** D-019 intégralement
**Décisions intégrées :** D-014-A · D-014-B · D-013 · OS V13 Q3 · Résolution V4 dispute

**Contenu brut :**

proposed → negotiating / withdrawn  
negotiating → accepted / withdrawn  
accepted → placed / cancelled\_pre\_deposit  
placed → deposit\_pending / cancelled\_pre\_deposit  
deposit\_pending → deposit\_secured / deposit\_failed  
deposit\_secured → event\_sealed / transfer\_requested / cancelled\_J30 / cancelled\_J7  
transfer\_requested → transfer\_accepted / transfer\_refused / no\_show\_pre\_event  
transfer\_accepted → placed  
transfer\_refused → placed  
event\_sealed → performed  
performed → event\_completed / disputed / payable  
event\_completed → sots\_window\_closed  
sots\_window\_closed → contestation\_window / no\_show  
contestation\_window → payable / disputed  
payable → settled / disputed  
settled → archived  
disputed → payable / partially\_settled / refunded  
no\_show → refunded  
refunded → archived  
partially\_settled → archived  
cancelled\_pre\_deposit → archived  
cancelled\_J30 → archived  
cancelled\_J7 → archived  
deposit\_failed → archived  
no\_show\_pre\_event → archived

**Note D-014-A :** `balance_pending` supprimé. `deposit_secured` absorbe la surveillance du solde et arme la SchedulerDueTask `balance_deadline_check`.

**Note D-014-B :** `payable` est un état opérationnel non-WORM, protégé par D-101.

**Note `contestation_window` :** État explicite post-SOTS. Durée dans `DisputeAccessPolicyConfig.contestationWindowDurationHours` (recommandé : 24h). Voir D-019-B.

**Note `performed → payable` :** Exception SoloFounderOverride uniquement. Voir D-106.

**Note `* → disputed` (Frein d'Urgence) :** Depuis tout état avant `event_completed`, sans fenêtre temporelle. Depuis `contestation_window`, Contestation de Prestation avec fenêtre. Voir D-019-B.

---

### **D-019-B | Séparation souveraine des deux régimes de litige**

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST **Bloc :** BLOC 1 — Ontologie du produit
**Résout :** Contradiction AUD-02/AUD-12 — Q3 vs D-045
**Abroge :** D-045 §"Ouverture dispute : jusqu'à 24h après event\_completed"

**Principe fondateur :**
Le mot "disputed" couvrait deux réalités juridiques incompatibles. Cette décision les sépare définitivement.

**Régime 1 — Frein d'Urgence (Q3)**

Applicable depuis : `proposed`, `negotiating`, `accepted`, `placed`, `deposit_pending`, `deposit_secured`, `event_sealed`, `performed`.
Temporalité : aucune fenêtre — accès instantané et permanent.
Conditions : standing validé + EvidenceBundle soumis.
Cas typiques : lieu inondé, DJ absent avant event, contrat rompu, fraude, force majeure, non-paiement.

**Régime 2 — Contestation de Prestation**

Applicable depuis : `contestation_window` uniquement.
Temporalité : durée dans `DisputeAccessPolicyConfig.contestationWindowDurationHours` (recommandé MVP : 24h après `sots_window_closed`).
Conditions : standing validé + EvidenceBundle soumis.
Cas typiques : prestation dégradée, retard, qualité insuffisante, désaccord SOTS, non-livraison partielle.

**Ligne du temps canonique post-event :**

event\_completed → \[+24h SOTS\] → sots\_window\_closed  
→ contestation\_window → \[+24h contestation\]  
→ contestation\_window expire → payable → settled → archived

**Conséquence sur D-045 :**
La clause de D-045 *"Ouverture dispute : jusqu'à 24h après event\_completed"* est abrogée. La fenêtre de contestation court 24h après `sots_window_closed`. Le reste de D-045 (procédure, EvidenceBundle, DecisionRecord) demeure inchangé.

**Configs concernées :** `DisputeAccessPolicyConfig` (champ : `contestationWindowDurationHours`)

---

### **D-020 | EVENT\_SEALED couvre la majoration vendeur**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Au moment de `event_sealed`, l'argent reçu doit couvrir la totalité :

* cachets bruts des talents  
* commission Micro Rave  
* taxes sur la commission MR  
* frais Stripe  
* majoration vendeur (si applicable)  
* droits/commissions vendeur associés

La base de volume commercial du vendeur \= commission Micro Rave \+ majoration vendeur.

---

### **D-021 | QuickPlay — moteur de formation d'offre, pas système financier parallèle (version corrigée)**

**Statut :** VALIDÉ (corrigé dans D-021 et précisé dans D-114) **Bloc :** BLOC 1 — Ontologie du produit

**Règle invariante :** QuickPlay ne génère jamais un flux financier parallèle. Dès qu'un client accepte le lobby, l'ontologie standard reprend le contrôle.

**Contenu brut :** Deux voies d'entrée : A. Organisateur-led : Event → MissionSlots ouverts → négociation B. QuickPlay-led : Lobby → EngagementCollectif (noyau indivisible, prix yield, rôles/styles déterminés collectivement) → assigné à un Event → Lineup → confirmation en Engagements individuels

L'organisateur/client ne peut pas accepter une partie du lobby — le lobby est indivisible. Tout ou rien. Une fois le lobby accepté, chaque talent doit valider sa présence individuelle mais ne peut pas négocier le prix ni le style.

---

### **D-022 | ClientAttributionRight — durée, renouvellement et transactions admissibles**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Durée de base : 36 mois à partir de la première transaction admissible.

Renouvellement automatique si toutes les conditions réunies :

* le client a racheté dans une fenêtre récente  
* le vendeur est encore actif et en règle  
* le SellerPortfolio n'est pas suspendu  
* aucune attribution concurrente n'a été validée  
* aucune révocation n'a été décidée par Micro Rave

Transactions admissibles pour ResidualCommission :

* ✅ Commissions liées aux Events / Engagements payants  
* ✅ Majoration vendeur si officiellement attachée au client activé  
* ❌ Taxes  
* ❌ Frais Stripe  
* ❌ Cachets talents  
* ❌ Memberships SaaS (MVP — réévaluer V3.1)

**Formulation canonique :** ResidualCommission \= droit économique conditionnel, durable, renouvelable, gouverné et traçable.

---

### **D-023 | Événement PRIVÉ — visibilité réseau mutuel**

**Statut :** VALIDÉ **Bloc :** BLOC 1 — Ontologie du produit

**Contenu brut :** Un événement PRIVÉ est visible uniquement par les utilisateurs en following mutuel avec l'organisateur — les deux se suivent mutuellement. Following unilatéral \= pas de visibilité sur les événements PRIVÉ.

---

### **D-024 | Ventilation UX talent — progressive et obligatoire**

**Statut :** VALIDÉ **Bloc :** BLOC 2 — Prix accepté

**Contenu brut :** Pendant la négociation : l'écran principal affiche cachet brut offert \+ net estimé en UX distinctif. Le talent peut déplier pour voir le détail.

Au moment de l'acceptation finale : la ventilation complète s'affiche obligatoirement et intégralement avant que le bouton "Accepter" soit activable. Le talent ne peut pas accepter sans avoir vu : cachet brut, tier, taux de base, score SOTS, multiplicateur SOTS, taux effectif, commission MR, cachet net.

---

### **D-025 | Facture payeur — structure 5 lignes canoniques**

**Statut :** VALIDÉ **Bloc :** BLOC 2 — Prix accepté

**Contenu brut :**

Ligne 1 — Prestation : montant brut Ligne 2 — Service Micro Rave (inclus dans la prestation) : commission MR Ligne 3 — TPS : taxes sur commission MR Ligne 4 — TVQ : taxes sur commission MR Ligne 5 — Frais de paiement : frais Stripe refacturés **Total payeur**

Exemple 1 (sans majoration, cachet brut 1 000$, taux effectif 19%) :

* Prestation : 1 000,00$  
* Service Micro Rave : 190,00$  
* TPS (5% sur 190$) : 9,50$  
* TVQ (9,975% sur 190$) : 18,95$  
* Frais de paiement : 31,02$  
* Total : 1 059,47$

---

### **D-026 | SOTS actif dès MVP — score par défaut 3/5**

**Statut :** VALIDÉ **Bloc :** BLOC 2 — Prix accepté

**Contenu brut :** La modulation SOTS est active dès le MVP pour tous les talents. Tout nouveau talent sans historique reçoit un score SOTS par défaut de 3/5 \= 3 000 score\_units, sur lequel il construit progressivement.

---

### **D-027 | Taux de membership — database uniquement, jamais hardcodé**

**Statut :** VALIDÉ **Bloc :** BLOC 2 — Prix accepté

**Règle invariante :** LOI F-03 renforcée. Les taux de membership ne sont jamais dans le code.

**Contenu brut :** Les taux vivent dans une table MembershipPlan avec SKU unique par plan et par période, dates de début et de fin de validité, taux associé.

Règle de résolution en cas d'absence de membership actif :

1. Chercher un UserMembership actif → utiliser son commissionRateSnapshot  
2. Aucun membership actif → résoudre vers le MembershipPlan de tier Freemium dont la date de fin est la plus récente  
3. Aucun Freemium trouvé → FINANCIAL\_CONFIG\_MISSING — blocage absolu

**Configs concernées :** MembershipPlan, UserMembership

---

### **D-028 | Règle prorata du coefficient de vente — LOI LINEUP-01**

**Statut :** VALIDÉ **Bloc :** BLOC 3 — Commissions et take-rates

**Formule canonique :**

coefficient\_de\_vente \= max(1, prix\_vendu\_client / total\_lineup\_signé)  
cachet\_brut\_final\_talent \= cachet\_brut\_signé\_talent × coefficient\_de\_vente

**Règles invariantes :**

* Le coefficient ne peut jamais être inférieur à 1  
* Si le prix vendu dépasse le lineup signé, tout le lineup monte proportionnellement  
* Le vendeur ne garde pas de marge cachée sur la différence  
* Le taux de commission de chaque talent ne change pas (snapshoté au ContractSnapshot)  
* Cas des gratuités : le système doit exiger une déclaration de part de lineup même si le montant initial est 0$

---

### **D-029 | MVP supporte les deux scénarios nativement — SC-01 et SC-02**

**Statut :** VALIDÉ **Bloc :** BLOC 2 — Prix accepté

**Contenu brut :** Le MVP supporte nativement SC-01 (payeur \= organisateur) et SC-02 (payeur ≠ organisateur). Deux flux d'authentification, deux vues, deux niveaux d'information supportés dès le MVP.

---

### **D-030 | Traitement des gratuités — convention 1$ symbolique — LOI LINEUP-02**

**Statut :** VALIDÉ **Bloc :** BLOC 3 — Commissions et take-rates

**Formule canonique :**

cachet\_effectif\_pour\_calcul \= max(1, cachet\_brut\_signé\_cents)  
lineup\_weight\_talent \= cachet\_effectif\_pour\_calcul / sum(cachet\_effectif\_pour\_calcul, tous talents)  
cachet\_brut\_final\_talent \= cachet\_effectif\_pour\_calcul × coefficient\_de\_vente

**Règle invariante :** La convention 1$ s'applique uniquement pour les calculs de poids et de coefficient. Le signed\_price\_cents reste 0 dans le ContractSnapshot.

---

### **D-031 | SellerCommissionPolicy — base de calcul (remplacée par D-049)**

**Statut :** REMPLACÉ PAR D-049 **Note :** D-031 validait `seller_commission = (commission_MR_totale + surplus_commercial) × seller_rate`. Corrigé dans D-049 : la base par défaut est `commission_MR_totale × seller_rate`.

---

### **D-032 | Taux Stripe — database configurable par territoire**

**Statut :** VALIDÉ **Bloc :** BLOC 3 — Commissions et take-rates

**Contenu brut :** Table `PaymentProviderConfig` en database avec : territoire, provider, taux en ppm, montant fixe par transaction en cents, date de début, date de fin, statut actif.

Au MVP : une seule ligne active — Québec / Stripe / taux CAD standard.

Règle de fallback : si aucune config active → ligne la moins récemment expirée → si aucune → PAYMENT\_CONFIG\_MISSING, blocage absolu.

---

### **D-033 | Poids lineup talent 0$ — valeur de référence du rôle**

**Statut :** VALIDÉ (précision de D-028) **Bloc :** BLOC 3 — Commissions et take-rates

**Contenu brut :** max(1, cachet\_brut\_signé\_cents) \= 1 cent symbolique pour calculs de poids. La valeur de référence du rôle (taux médian du rôle dans la cellule) est utilisée pour les statistiques de pricing et la tarification dynamique QuickPlay, pas pour le calcul du coefficient de vente.

---

### **D-034 | Blocage EPR si prix vendu \< total lineup signé — LOI LINEUP-03**

**Statut :** VALIDÉ **Bloc :** BLOC 3 — Commissions et take-rates

**Règle invariante :** L'EPR ne peut pas être créée si `prix_vendu_client_cents < total_lineup_signé_cents`. Code d'erreur : `LINEUP_PRICE_FLOOR_VIOLATION`.

---

### **D-035 | ContractSnapshot en deux phases**

**Statut :** VALIDÉ **Bloc :** BLOC 3 — Commissions et take-rates

**Contenu brut :**

Phase 1 — à `accepted` (WORM immédiat) : `signed_price_cents`, `talent_platform_commission_rate_snapshot`, `sots_snapshot`, `membership_tier_snapshot`, `commission_estimated_cents`, historique complet de négociation.

Phase 2 — à `event_sealed` (WORM complémentaire) : `coefficient_de_vente`, `final_price_cents`, `commission_final_cents`, `seller_base_commission_cents`, `seller_surplus_commission_cents`, `tax_snapshot`, `stripe_fee_snapshot`.

---

### **D-036 | SellerCommissionPolicy — taux unique sur base combinée (LOI SELLER-01 finalisée)**

**Statut :** VALIDÉ (remplace D-031) **Bloc :** BLOC 3 — Commissions et take-rates

**Formule canonique :**

seller\_commission \= commission\_MR\_totale × seller\_rate  
(base par défaut — configurable en database via SellerCommissionPolicy)

Un seul taux `seller_rate` dans la table `SellerCommissionPolicy`, selon le SellerTier du vendeur. Jamais hardcodé.

---

### **D-037 | Compte d'ajustement dédié pour les écarts d'arrondi**

**Statut :** VALIDÉ **Bloc :** BLOC 3 — Commissions et take-rates

**Contenu brut :** Les écarts d'arrondi issus du coefficient de vente vont dans un compte `rounding_adjustment` dédié dans le ledger. Réconciliation périodique mensuelle. Compte LedgerCodeMap : 6591\.

---

### **D-038 | Waterfall SC-01 — Écritures ledger complètes — LOI LEDGER-01**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Règle invariante — LOI LEDGER-01 :** Aucun revenu n'est reconnu tant que l'Engagement n'est pas archivé. La commission MR vit en 4530 (passif — revenu différé) jusqu'à archivage. Elle passe en 7110 (revenu) uniquement à l'archivage.

**Contenu brut :**

Phase 1 — À la réception du paiement :

DR  5200  Stripe en attente          1 028,45 $  
DR  4190  Frais Stripe différés         35,66 $  
    CR  4310  Talent payable (net)        810,00 $  
    CR  4530  Revenus différés (comm.)    190,00 $  
    CR  4410  TPS à remettre               9,50 $  
    CR  4420  TVQ à remettre              18,95 $

Phase 2 — À l'archivage :

DR  4310  Talent payable              810,00 $  
DR  4530  Revenus différés            190,00 $  
DR  6110  Frais Stripe courtage        35,66 $  
    CR  5100  Stripe disponible         810,00 $  
    CR  7110  Revenus courtage complété 190,00 $  
    CR  4190  Frais Stripe différés      35,66 $

Résultat net MR sur cet event : 190,00$ − 35,66$ \= 154,34$ (avant taxes remises)

---

### **D-039 | SC-05 — Annulation à plus de J-30 — LOI ANNULATION-01**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Règle invariante :** Annulation \> J-30 \= remboursement total moins frais Stripe. Micro Rave ne retient aucune commission sur un event qui ne s'est pas tenu avec plus de 30 jours de préavis.

**Contenu brut :** Remboursement total du dépôt au payeur. Les frais Stripe déjà payés sont déduits du remboursement. Aucune commission MR retenue. Taxes estimées reversées intégralement.

Formule : `montant_remboursé_payeur = dépôt_brut_reçu − frais_stripe_dépôt`

---

### **D-040 | SC-06 — Balance impayée à J-6 — LOI ANNULATION-02**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Règle invariante :** Balance impayée à J-6 \= annulation automatique. Les talents sont payés sur le dépôt au prorata. Micro Rave retient sa commission. Le payeur défaillant ne reçoit aucun remboursement.

---

### **D-041 | SC-07 — No-show talent confirmé — LOI NO-SHOW-01**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Règle invariante :** No-show confirmé \= talent payé 0$, organisateur remboursé du cachet net talent, Micro Rave conserve sa commission. La commission est un revenu pour service rendu, pas un revenu conditionnel à la présence du talent.

---

### **D-042 | Ratio dépôt/balance — database configurable par admin**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Contenu brut :** Le ratio 20/80 est la valeur par défaut dans une table EventPaymentConfig. Modifiable globalement ou par tier d'organisateur par un admin. Jamais hardcodé.

Règle de fallback : config active → config la moins récemment expirée → PAYMENT\_CONFIG\_MISSING, blocage absolu.

---

### **D-043 | SC-06 cancelled\_J7 — cachets signés, coefficient forcé à 1**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Contenu brut :** En cancelled\_J7, la commission MR est calculée sur les signed\_price\_cents avec coefficient forcé à 1 (event\_sealed non atteint, final\_price\_cents inconnu).

---

### **D-044 | SC-07 no-show partiel — chaque Engagement traité indépendamment**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Contenu brut :** Le no-show d'un talent n'affecte pas les payouts des autres talents. L'organisateur est remboursé uniquement du cachet net du talent absent.

---

### **D-045 | SC-08 — Doctrine complète de règlement des disputes**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Phrase canonique :** *"Une dispute n'est pas un bouton rembourser ou payer. C'est une procédure : geler, qualifier, prouver, répondre, décider, régler, mémoriser."*

**Règle invariante — LOI DISPUTE-01 :**

DisputeRecord → EvidenceBundle → DecisionRecord  
→ SettlementInstruction → FinancialLedger  
→ ReputationLedger → Archive

**Contenu brut :**

Gel des fonds — deux phases : Phase 1 — Gel total temporaire au déclenchement Phase 2 — Gel chirurgical après qualification

Conditions de payout talent (11 conditions — voir D-075)

Délais dans DisputePolicyConfig (jamais hardcodés) :

* Ouverture dispute : jusqu'à 24h après event\_completed  
* Soumission preuves : 24h  
* Réponse adverse : 24h  
* Décision standard : maximum 72h  
* Cas complexe : maximum 7 jours avec justification

Issue 1 — En faveur du talent : talent payé, commission MR reconnue, commission vendeur libérée Issue 2 — En faveur du payeur : talent non payé, MR ne reconnaît pas sa commission sur portion fautive Issue 3 — Partielle : `deliveryRecognizedRatio = DecisionRecord.recognizedAmount / initialAmount`

---

### **D-046 | SC-09 — Remboursement post-event : voies B \+ C**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Contenu brut :** Voie C — Dispute tardive sous conditions strictes dans DisputeAccessPolicyConfig. Standard pour cas légitimes post-archive. Voie B — Procédure admin exceptionnelle pour cas non couverts par voie C. AdminAction \+ reasonCode \+ policyId \+ DecisionRecord \+ reversal obligatoires. Hiérarchie : voie C tentée en premier, voie B seulement si voie C explicitement inapplicable.

---

### **D-047 | Matrice des droits de dispute — Doctrine complète**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Phrase canonique :** *"Tout le monde peut parler. Seuls les acteurs avec standing peuvent geler. Le ledger n'obéit qu'à une décision valide."*

**Contenu brut :** Matrice complète par acteur :

* Talent : dispute son Engagement, présence, payout, SOTS, sécurité  
* Organisateur : dispute présence, no-show, retard, mauvaise prestation, échec global  
* Payeur : dispute facture, paiement, remboursement, non-livraison, fraude, post-archive sous conditions  
* Délégué : valide/conteste présence terrain, ouvre IncidentRecord, escalade  
* Vendeur : dispute sa commission, attribution, résiduel, portefeuille  
* Audience : IncidentRecord, SafetyReport, SOTS, preuve. Aucun DisputeRecord financier direct  
* Admin : exceptions fraude, chargeback, ledger, post-archive avec traces complètes  
* Système : risk\_hold, auto-review sur anomalies

Invariants techniques :

* Aucun DisputeRecord bloquant sans : actorRole, standingLevel, targetObjectType, targetObjectId, disputeType, policyId, reasonCode  
* Toute dispute financière exige amountDisputedCents  
* Un IncidentRecord ne gèle jamais automatiquement les fonds

**Configs concernées :** DisputeAccessPolicyConfig, EvidencePolicyConfig, TimeWindowPolicyConfig

---

### **D-048 | SC-02 — Distinction ledger payeur ≠ organisateur**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Contenu brut :** Le ledger doit distinguer explicitement le payeur de l'organisateur dans chaque écriture liée à l'event. L'EPR porte payerUserId ET organizerUserId comme champs distincts.

---

### **D-049 | SC-03 — Waterfall corrigé — LOI WATERFALL-01**

**Statut :** VALIDÉ (remplace D-031) **Bloc :** BLOC 4 — Money Waterfall

**Phrase canonique — LOI WATERFALL-01 :** *"Le coefficient augmente les talents. Le taux de chaque talent calcule sa commission. Le vendeur est payé par une policy séparée. Aucun dollar ne doit être compté deux fois."*

**Contenu brut :**

Séquence de calcul canonique :

ÉTAPE 1 : coefficient \= max(1, prix\_vendu\_client / total\_lineup\_effectif)  
ÉTAPE 2 : cachet\_brut\_final\_i \= cachet\_effectif\_signé\_i × coefficient  
ÉTAPE 3 : commission\_MR\_i \= cachet\_brut\_final\_i × taux\_effectif\_snapshot\_i  
ÉTAPE 4 : talent\_net\_payable\_i \= cachet\_brut\_final\_i − commission\_MR\_i  
ÉTAPE 5 : commission\_MR\_totale \= sum(commission\_MR\_i), talent\_net\_total \= sum(talent\_net\_payable\_i)  
ÉTAPE 6 : TPS \= commission\_MR\_totale × taux\_TPS, TVQ \= commission\_MR\_totale × taux\_TVQ  
ÉTAPE 7 : sous\_total \= prix\_vendu\_client \+ TPS \+ TVQ  
ÉTAPE 8 : frais\_stripe \= calculé sur sous\_total (config en database)  
ÉTAPE 9 : total\_payeur \= sous\_total \+ frais\_stripe

Comptes ledger seller commission :

DR  6150  Commissions vendeurs         seller\_commission $  
CR  4330  Passif commissions vendeurs  seller\_commission $  
DR  4330  Passif commissions vendeurs  seller\_commission $  
CR  5100  Stripe disponible            seller\_commission $

---

### **D-050 | SC-04 — Membership SaaS talent — waterfall et reconnaissance**

**Statut :** VALIDÉ **Bloc :** BLOC 4 — Money Waterfall

**Phrase canonique :** *"Le membership SaaS est encaissé maintenant, mais gagné avec le temps."*

**Contenu brut :**

Au paiement :

DR  5200  Stripe en attente    total\_TTC $  
    CR  4535  Revenus différés SaaS   montant\_HT $  
    CR  4410  TPS à remettre          tps $  
    CR  4420  TVQ à remettre          tvq $

Reconnaissance proportionnelle :

* mensuel : reconnu sur le mois  
* annuel : reconnu sur 12 mois  
* période partielle : prorata par jour  
* lifetime : politique séparée à définir

Remboursement : `refund_HT = unused_period_ratio × montant_HT` où `unused_period_ratio = jours_restants / jours_totaux_période`

Gouvernance : TaxConfig, MembershipPlan, UserMembership, RevenueRecognitionPolicyConfig, SubscriptionRefundPolicyConfig, PaymentFeeConfig, LedgerCodeMap

---

**FIN DE LA PARTIE 1 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 2 / 8**

---

*(Suite du DECISION\_REGISTRY\_V3)*

---

### **D-051 | Statut légal de Micro Rave — courtier / agent marketplace**

**Statut :** VALIDÉ provisoirement — validation professionnelle requise avant lancement **Bloc :** BLOC 5 — Fiscalité et statut légal

**Phrase canonique :** *"Micro Rave est courtier par doctrine. Les flux sont les preuves. Le ledger est le témoin."*

**Contenu brut :** Micro Rave agit comme courtier / agent marketplace. Elle ne vend pas la prestation artistique comme fournisseur principal.

Revenus propres de Micro Rave :

* Commission de courtage événementiel  
* Revenus SaaS  
* Frais de billetterie Micro Rave  
* Revenus ou frais de courtage liés aux commandites  
* Frais de service explicitement définis

Le cachet talent n'est jamais un revenu Micro Rave.

Règle de snapshot par flux : rôle légal snapshoté via RevenueStreamLegalRoleSnapshot.

**Objets concernés :** RevenueStreamLegalRoleSnapshot

---

### **D-052 | Coefficient de vente — actif seulement pour Events seller-led**

**Statut :** VALIDÉ **Bloc :** BLOC 5 — Fiscalité et statut légal

**Contenu brut :** Events simples MVP → coefficient \= 1 (forcé)

Events seller-led → coefficient actif si et seulement si :

* vendeur assigné  
* SellerTier valide  
* SellerCommissionPolicyConfig active  
* CoefficientSalePolicyConfig active  
* RevenueStreamSnapshot créé  
* tests ledger SC-03 multi-talents passés  
* InvoiceComposer capable de produire une facture cohérente

Règle anti-extraction : si coefficient désactivé, prix\_vendu\_client doit égaler total\_lineup\_signé.

**Configs concernées :** CoefficientSalePolicyConfig, SellerCommissionPolicy

---

### **D-053 | Statut fiscal des talents et TalentTaxProfile**

**Statut :** VALIDÉ **Bloc :** BLOC 5 — Fiscalité et statut légal

**Contenu brut :** Les talents sont travailleurs autonomes. Micro Rave ne devient pas leur employeur.

AnnualTalentPaymentSummary requis dès le MVP : cachets bruts, commissions prélevées, payouts nets, refunds, reversals, taxes talent si applicables, données T4A.

TalentTaxProfile champs : legalName, businessName, businessNumber, gstNumber, qstNumber, isGstRegistered, isQstRegistered, taxEffectiveFrom, taxEffectiveTo, taxValidationStatus, taxCollectionMode.

**Objets concernés :** TalentTaxProfile, AnnualTalentPaymentSummary

---

### **D-054 | Billetterie — flux distinct, TicketAdmissionRight obligatoire**

**Statut :** VALIDÉ — implémentation V3.2, architecture prête dès MVP **Bloc :** BLOC 5 — Fiscalité et statut légal

**Règle invariante :** Chaque audience possède un TicketAdmissionRight, même si l'événement est gratuit (billet à 0$). AudienceCheckIn doit être lié à un TicketAdmissionRight.

**Objets concernés :** TicketAdmissionRight, AudienceCheckIn

---

### **D-055 | Commandites — flux distinct, SponsorshipContract**

**Statut :** VALIDÉ — implémentation V3.3, architecture prête dès MVP **Bloc :** BLOC 5 — Fiscalité et statut légal

**Contenu brut :** Objets validés : SponsorshipContract, SponsorshipDeliverable, SponsorshipRevenueSchedule, SellerSponsorshipAttribution.

Revenus de commandite reconnus selon les SponsorshipDeliverable livrés. Ne se mélange jamais avec le coefficient de vente.

---

### **D-056 | Taxes talent — modèle hybride taxCollectionMode**

**Statut :** VALIDÉ **Bloc :** BLOC 5 — Fiscalité et statut légal

**Phrase canonique :** *"Micro Rave peut collecter le paiement, mais la taxe talent n'est jamais une taxe Micro Rave."*

**Contenu brut :**

Modes dans TalentTaxProfile.taxCollectionMode :

* NOT\_REGISTERED : aucune taxe talent  
* MR\_COLLECTS\_FOR\_TALENT : MR collecte via EPR, distingue sur facture, transfère au talent avec payout  
* MR\_REMIT\_BY\_ELECTION : mode futur — validation légale requise  
* TALENT\_INVOICES\_EXTERNAL : exception — découragé, deux factures créent confusion

---

### **D-057 | Responsabilité légale événements physiques — EventRiskPolicyConfig**

**Statut :** VALIDÉ **Bloc :** BLOC 5 — Fiscalité et statut légal

**Phrase canonique :** *"Micro Rave courtise, contractualise et règle; elle ne devient pas l'assureur invisible du terrain."*

**Contenu brut :** Modèle de risque par EventRiskPolicyConfig :

* Faible : CGU \+ acceptation des responsabilités  
* Moyen : assurance recommandée ou déclaration obligatoire  
* Élevé : preuve d'assurance obligatoire avant event\_sealed

Aucun event à risque élevé ne peut atteindre event\_sealed sans exigences d'assurance satisfaites.

**Configs concernées :** EventRiskPolicyConfig

---

### **D-058 | Plafond du coefficient de vente — CoefficientSalePolicyConfig**

**Statut :** VALIDÉ **Bloc :** BLOC 5 — Fiscalité et statut légal

**Phrase canonique :** *"Le marché peut fixer un prix élevé, mais Micro Rave ne doit pas laisser une vente incohérente devenir une preuve de valeur."*

**Contenu brut :**

CoefficientSalePolicyConfig champs : maxCoefficient, warningCoefficient, adminReviewCoefficient, maxAbsoluteSurplusCents, requirePayerExplicitAcknowledgement, requireAdminApprovalAboveThreshold, blockAboveMax, reasonCode.

Logique :

* coefficient \< warningCoefficient → autorisé  
* ≥ warningCoefficient et \< adminReviewCoefficient → alerte interne  
* ≥ adminReviewCoefficient et \< maxCoefficient → revue admin obligatoire  
* ≥ maxCoefficient → COEFFICIENT\_MAX\_EXCEEDED, blocage absolu

---

### **D-059 | Remise TPS/TVQ — TaxRemittanceRecord semi-automatique**

**Statut :** VALIDÉ **Bloc :** BLOC 5 — Fiscalité et statut légal

**Phrase canonique :** *"Les taxes ne sont pas un solde approximatif; ce sont des passifs datés, déclarés, payés et réconciliés."*

**Contenu brut :**

TaxRemittanceRecord champs : periodStart, periodEnd, filingFrequency, gstCollectedCents, qstCollectedCents, gstAdjustmentsCents, qstAdjustmentsCents, netGstPayableCents, netQstPayableCents, status (draft/ready/filed/paid/reconciled), generatedAt, reviewedBy, filedAt, paidAt, paymentReference, proofAttachmentId, ledgerTransactionGroupId.

Écriture au paiement :

DR 4410 TPS à remettre  
DR 4420 TVQ à remettre  
    CR 5100 Banque / Stripe disponible

---

### **D-060 | LedgerCodeMap V3 — Plan comptable complet et définitif**

**Statut :** VALIDÉ — voir aussi D-060-A (ajout 6119\) **Bloc :** BLOC 6 — Ledger et comptabilité

**Contenu brut :**

Le document de référence est le LedgerCodeMap V3 transmis dans le document 7 de la conversation. Voir section 9 (ECONOMIC\_SCENARIO\_REGISTER) pour les comptes par scénario.

Comptes principaux :

CAPITAUX PROPRES : 1100, 1150, 1200, 1300, 1400 PASSIFS LT : 1600, 1700, 1800, 1900 ACTIFS LT : 2100, 2110, 2200, 2300, 2600, 2610, 2700, 2900 ACTIFS COURANTS : 4110, 4120, 4130, 4190 PASSIFS TALENTS/ESCROW : 4310, 4320, 4325, 4326, 4330, 4335, 4350, 4360, 4365, 4370 REVENUS DIFFÉRÉS : 4530, 4535, 4540, 4541, 4545 FISCAL MR : 4410, 4420, 4450 FOURNISSEURS : 4510, 4520, 4610, 4620, 4690 LIQUIDITÉS : 5100, 5200, 5300, 5400, 5500, 5900 FRAIS DE VENTE : 6110, 6115, 6116, 6119, 6120, 6130, 6140, 6150, 6155, 6160 EXPLOITATION : 6210-6270 PERSONNEL : 6310-6330 AUTRES CHARGES : 6370, 6410, 6510, 6590, 6591, 6610, 6690 REVENUS COURTAGE : 7110, 7120, 7130, 7190 REVENUS SAAS : 7210, 7220, 7230, 7240, 7280, 7290 REVENUS BILLETTERIE : 7410, 7415, 7420, 7490 REVENUS COMMANDITES : 7510, 7515, 7520, 7590 AUTRES PRODUITS : 7910, 7990

FLUX : ENC-DEPOT, ENC-BALANCE, ENC-SAAS, ENC-BILLET, ENC-SPONSOR, DEC-FRAIS, DEC-PAYOUT, DEC-SELLER-EVENT, DEC-SELLER-BILLET, DEC-SELLER-SPONSOR, DEC-BILLET, DEC-SPONSOR, DEC-REMB, DEC-TAXE, DEC-TAXE-TIERS, DEC-TAXE-TIERS-GOV, INT-CAPTURE

---

### **D-060-A | Ajout 6119 au LedgerCodeMap V3**

**Statut :** VALIDÉ — amendement D-060 **Bloc :** BLOC 7 (issu de BLOC 6\)

**Phrase canonique :** *"6591 explique les poussières mathématiques; 6119 explique les surprises du processeur."*

**Contenu brut :**

6119 | P\&L | Frais de vente | Frais Stripe — Écarts frais de paiement / frais processeur

Rôle : capturer les écarts réels entre frais de paiement estimés/refacturés et frais effectivement prélevés.

Distinction : 6591 \= ajustements d'arrondi mathématique interne. 6119 \= écarts réels de frais processeur.

Toute écriture vers 6119 exige un PaymentFeeVarianceRecord.

---

### **D-061 | FinancialNumericStandard**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Phrase canonique :** *"Le dollar est une unité d'affichage. Le cent est une unité de vérité. Le ppm est une unité de taux."*

**Contenu brut :**

MONEY   \= integer cents  
RATE    \= integer ppm (1% \= 10 000 ppm, 9,975% \= 99 750 ppm)  
RATIO   \= numerator / denominator (jamais float)  
SCORE   \= integer units sur 0-5000 (SOTS 4,1/5 \= 4 100\)  
DISPLAY \= dérivé uniquement — jamais source de calcul  
LEDGER  \= cents only

Interdits absolus : `amount: 1000.00`, `commissionRate: 0.19`, `sotsScore: 4.1`

---

### **D-062 | CommissionBaseMode — GROSS\_ACCEPTED**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Contenu brut :** Mode V3 par défaut : GROSS\_ACCEPTED. Le talent accepte un cachet brut. La commission MR est calculée sur ce brut. Le net talent est le reste après commission. NET\_GUARANTEED est interdit au MVP.

---

### **D-063 | RoundingPolicyConfig — aucun arrondi artisanal dans le code métier**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Règle invariante :** Toutes les règles d'arrondi vivent dans RoundingPolicyConfig. Tous les calculs financiers passent par MoneyMath. Aucun Math.round, Math.floor, Math.ceil libre dans le code métier.

---

### **D-064 | Arrondi commission MR et net talent**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Phrase canonique :** *"Le net talent n'est pas un deuxième calcul; c'est le reste protégé."*

**Formule canonique :**

commission\_MR\_i \= floor(gross\_final\_i × effective\_rate\_ppm / 1\_000\_000)  
talent\_net\_i    \= gross\_final\_i − commission\_MR\_i

---

### **D-065 | Arrondi taxes**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Contenu brut :** round sur la base effectivement postée/facturée. La taxe suit la ligne facturée, pas le calcul invisible.

---

### **D-066 | Arrondi frais Stripe**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Contenu brut :** Frais Stripe refacturés au payeur \= ceil (Micro Rave ne sous-collecte jamais). Frais Stripe absorbés par MR \= charge selon le flux concerné (6110, 6115, 6116, 6120, 6130, 6140).

---

### **D-067 | Arrondi seller commission**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Contenu brut :** floor \+ cap selon SellerCommissionPolicyConfig.maxSellerCommissionRatio.

---

### **D-068 | Coefficient de vente — allocation par largest remainder**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Contenu brut :**

coefficient\_numerator   \= prix\_vendu\_client\_cents  
coefficient\_denominator \= total\_lineup\_signed\_cents

Allocation par méthode des plus grands restes pour garantir `sum(gross_final_i) = prix_vendu_client_cents`.

---

### **D-069 | Invariant ledger — zéro cent d'écart — LOI LEDGER-02**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Phrase canonique — LOI LEDGER-02 :** *"Le résidu peut naître dans le calcul; il doit mourir dans l'écriture ledger."*

**Règle invariante :**

sum(talent\_net\_payable\_i) \+ sum(commission\_MR\_i) \+ rounding\_adjustment\_cents  
\= prix\_vendu\_client\_cents

Si invariant non respecté → LEDGER\_BALANCE\_VIOLATION → event\_sealed bloqué.

---

### **D-070 | RoundingReconciliationRecord**

**Statut :** VALIDÉ **Bloc :** BLOC 7 — Règles d'arrondi et précision

**Règle invariante :** Toute écriture vers 6591 exige un RoundingReconciliationRecord traçable. 6591 est une loupe, pas une poubelle.

---

### **D-071 | DecisionKernel — partiel MVP**

**Statut :** VALIDÉ **Bloc :** BLOC 8 — DecisionKernel et arbitrage

**Phrase canonique :** *"Le DecisionKernel MVP ne doit pas prétendre être un juge parfait. Il doit être un greffier incorruptible : il automatise seulement ce qui est prouvé, il gèle ce qui est incertain, il exige une décision humaine pour les cas ambigus, et il ne laisse jamais une sortie d'argent se produire sans trace institutionnelle."*

**Contenu brut :** Objets requis dès MVP : DecisionRecord, EvidenceBundle, SettlementInstruction, AdminAction, DecisionMode, DecisionPolicyConfig.

Automatique au MVP : PAYOUT\_APPROVED (preuve forte), SYSTEM\_HOLD (anomalie), DISPUTE\_HOLD\_APPLIED (DisputeRecord valide), TRANSFER\_APPROVED (Talent B accepte), CHARGEBACK\_HOLD\_APPLIED (webhook Stripe).

Admin review au MVP : dispute complexe, no-show contesté, refund partiel, payout refusé, chargeback résolu, override exceptionnel, livraison partielle, preuve contradictoire.

---

### **D-072 | Types de DecisionRecord — liste canonique complète**

**Statut :** VALIDÉ **Bloc :** BLOC 8 — DecisionKernel et arbitrage

**Phrase canonique :** *"Un événement déclenche une procédure; un DecisionRecord tranche une conséquence."*

**Contenu brut :**

PAYOUT\_APPROVED / PAYOUT\_HELD\_ADMIN\_REVIEW / PAYOUT\_DENIED\_AFTER\_REVIEW  
PRESENCE\_VALIDATED / PRESENCE\_REJECTED  
NO\_SHOW\_CONFIRMED / NO\_SHOW\_CONTESTED  
REFUND\_FULL\_APPROVED / REFUND\_PARTIAL\_APPROVED / REFUND\_DENIED  
DISPUTE\_HOLD\_APPLIED / DISPUTE\_RESOLVED\_TALENT / DISPUTE\_RESOLVED\_PAYER  
DISPUTE\_RESOLVED\_PARTIAL / DISPUTE\_REJECTED\_OUT\_OF\_SCOPE  
TRANSFER\_APPROVED / TRANSFER\_REFUSED / TRANSFER\_EXPIRED  
SELLER\_COMMISSION\_APPROVED / SELLER\_COMMISSION\_HELD / SELLER\_COMMISSION\_DENIED  
SOTS\_ADJUSTMENT\_APPROVED / SOTS\_ADJUSTMENT\_DENIED  
LATE\_DISPUTE\_ACCEPTED / LATE\_DISPUTE\_REJECTED  
SYSTEM\_HOLD / SYSTEM\_HOLD\_RELEASED  
CHARGEBACK\_HOLD\_APPLIED / CHARGEBACK\_RESOLVED  
ADMIN\_OVERRIDE

---

### **D-073 | Délégué sur place — combinaison rôles automatiques \+ désignation explicite**

**Statut :** VALIDÉ **Bloc :** BLOC 8 — DecisionKernel et arbitrage

**Phrase canonique :** *"Le délégué confirme le réel; il ne distribue pas l'argent."*

**Contenu brut :** Délégués automatiques : organisateur, co-organisateur, gérant de cellule assigné, employé Micro Rave terrain. Délégués désignés : nommés par l'organisateur avant event\_sealed. Maximum dans DelegatePolicyConfig.maxExplicitDelegates (MVP : 3).

Droits : valider/contester présence, ouvrir IncidentRecord, ajouter EvidenceBundle, escalader. Interdits : autoriser payout, autoriser refund, trancher dispute, modifier ledger.

---

### **D-074 | Standing légitime — filtre statique \+ vérification dynamique**

**Statut :** VALIDÉ **Bloc :** BLOC 8 — DecisionKernel et arbitrage

**Phrase canonique :** *"Le standing ne vient pas du rôle seul; il vient du lien prouvable entre l'acteur et l'objet contesté."*

**Contenu brut :**

standing \= actorRole autorisé (filtre statique)  
         \+ relation directe avec targetObject (vérification dynamique)  
         \+ statut actif dans l'Event  
         \+ fenêtre temporelle valide

Snapshot obligatoire : standingLevel, standingReasonCodes, standingCheckedAt, standingPolicyId.

---

### **D-075 | Conditions de payout automatique — 11 conditions**

**Statut :** VALIDÉ **Bloc :** BLOC 8 — DecisionKernel et arbitrage

**Phrase canonique :** *"Le payout automatique est réservé aux cas où la preuve est forte, complète, non contestée et ledger-ready."*

**Contenu brut :** canApprovePayout\_automatic \= true si et seulement si :

1. event\_sealed \= true  
2. Engagement.status admissible au payout  
3. SessionPresence.checkedInAt \!= null  
4. géolocalisation cohérente avec maxDistancePolicy (database)  
5. présence temporelle cohérente avec minDurationPolicy / plage horaire (database)  
6. présence validée par organisateur/délégué OU délai de contestation expiré sans contestation  
7. SOTSSubmission du talent soumis ← requis, pas optionnel  
8. aucun DisputeRecord open/blocking sur cet Engagement  
9. aucun SafetyReport bloquant  
10. Ledger invariant vérifié (LOI LEDGER-02)  
11. Payment / escrow réellement secured

---

### **D-076 | Délai d'appel — configurable par type de décision**

**Statut :** VALIDÉ **Bloc :** BLOC 8 — DecisionKernel et arbitrage

**Phrase canonique :** *"Un hold peut être immédiat; un transfert final d'argent doit respecter la fenêtre prévue par sa policy."*

**Contenu brut :** Table de gouvernance : DecisionAppealPolicyConfig par decisionType.

Immédiates : SYSTEM\_HOLD, DISPUTE\_HOLD\_APPLIED, CHARGEBACK\_HOLD\_APPLIED, PAYOUT\_APPROVED (après fenêtre normale).

Attendent le délai d'appel : PAYOUT\_DENIED\_AFTER\_REVIEW, REFUND\_FULL\_APPROVED, REFUND\_PARTIAL\_APPROVED, NO\_SHOW\_CONFIRMED, DISPUTE\_RESOLVED\_PAYER, DISPUTE\_RESOLVED\_PARTIAL, SELLER\_COMMISSION\_DENIED.

---

### **D-077 | ReputationLedger append-only \+ SOTSScoreSnapshot périodique**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Phrase canonique :** *"Le ReputationLedger garde pourquoi; le snapshot dit combien."*

**Contenu brut :** Couche 1 — ReputationLedger : append-only. Chaque soumission SOTS \= ReputationLedgerEntry immuable. Invalidation \= entrée reversal liée à DecisionRecord \+ EvidenceBundle. Jamais supprimée. Couche 2 — SOTSScoreSnapshot : calculé périodiquement par EMA. Snapshoté pour affichage, ContractSnapshot et calculs de commission.

---

### **D-078 | Matrice de notation SOTS — par relation réelle et présence observable**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Règle invariante :** Un acteur peut noter seulement ce qu'il a réellement vécu ou observé.

**Contenu brut :**

| Noteur | Peut noter | Condition |
| ----- | ----- | ----- |
| Audience | Talent(s), Checkpoint | TicketAdmissionRight actif \+ AudienceCheckIn validé |
| Talent | Organisateur, Checkpoint | Engagement dans l'event \+ présence validée |
| Organisateur | Talent(s) | Est organisateur \+ event complété |
| Payeur | Organisateur, Vendeur | A payé l'event \+ event complété |
| Vendeur | Organisateur, Talent(s) | SellerAttribution actif sur l'event |
| Admin | Tout acteur | SOTS\_ADJUSTMENT — AdminAction obligatoire |

---

### **D-079 | SOTS multi-dimensionnel configurable**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Contenu brut :** Score affiché \= unique sur 5\. Calculé depuis dimensions internes dans SOTSDimensionConfig. Aucune dimension hardcodée.

Dimensions initiales (modifiables) :

* performance\_artistique  
* fiabilite\_operationnelle  
* professionnalisme\_relationnel  
* experience\_generee  
* adequation\_mandat  
* non\_toxicite  
* reference ("L'auriez-vous référencé?")

SOTSDimensionConfig champs : dimensionKey, label, weight\_ppm, isActive, visibleToUser, affectsCommission, effectiveFrom, effectiveTo.

Calcul : `sots_score_units = sum(dimension_score_i × weight_ppm_i) / sum(weight_ppm_i)`

---

### **D-080 | SOTSCommissionModulationConfig — structure validée, valeurs en database**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Contenu brut :** Score élevé → multiplicateur \< 1 000 000 ppm (commission réduite) Score neutre (3/5 \= 3 000 units) → multiplicateur \= 1 000 000 ppm (neutre) Score faible → multiplicateur \> 1 000 000 ppm (commission augmentée)

Standard numérique : tous multiplicateurs en integer ppm. 0,95 \= 950 000 ppm, 1,00 \= 1 000 000 ppm, 1,15 \= 1 150 000 ppm.

Fallback si seuil de confiance non atteint : multiplicateur forcé à 1 000 000 ppm.

SOTSCommissionModulationConfig champs : scoreThreshold\_units, multiplier\_ppm, isActive, effectiveFrom, effectiveTo.

---

### **D-081 | Calcul SOTS — EMA avec paramètre configurable**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Contenu brut :** Score SOTS courant calculé par EMA avec facteur de lissage configurable dans SOTSCalculationPolicyConfig.

Champs : emaAlpha\_ppm, minSubmissionsForEma, calculationMethod, isActive, effectiveFrom, effectiveTo.

---

### **D-082 | Contestation SOTS — conditions strictes \+ reversal dans ReputationLedger**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Contenu brut :** Fenêtre de contestation : configurable en database dans SOTSContestPolicyConfig (MVP recommandé : 48h).

Motifs admissibles : fraude prouvée, erreur manifeste, noteur non admissible, vengeance prouvable, conflit d'intérêt, preuve factuelle contraire.

Non admissible : désaccord subjectif.

Traitement : note originale immuable → ReputationLedgerEntry de reversal liée à DecisionRecord \+ EvidenceBundle.

---

### **D-083 | Seuils de confiance SOTS — SOTSConfidencePolicyConfig**

**Statut :** VALIDÉ **Bloc :** BLOC 9 — Réputation et SOTS

**Phrase canonique :** *"Le SOTS mesure ce qui a été livré, comment cela a été livré, et à quel point c'était bon; le ReputationLedger garde pourquoi; le seuil de confiance décide quand ce score peut toucher l'argent."*

**Contenu brut :**

| Niveau | Seuil MVP | Comportement |
| ----- | ----- | ----- |
| Score interne | 1 soumission | Visible admin et analytiques uniquement |
| Score public limité | 3 soumissions | Affiché avec indicateur "en construction" |
| Score public standard | 5 soumissions | Affiché normalement |
| Modulation complète commission | 10 soumissions | Multiplicateur SOTS appliqué |

Sous 10 soumissions : multiplicateur forcé à 1 000 000 ppm.

SOTSConfidencePolicyConfig champs : level, minSubmissions, behaviorDescription, isActive, effectiveFrom, effectiveTo.

---

### **D-084 | UX talent — format universel par état**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Règle invariante :** Chaque état visible par le talent affiche : 1\. Statut 2\. Argent 3\. Prochaine action 4\. Délai 5\. Preuve ou blocage.

*Voir tableau complet des états dans la section BLOC 10 de RAW\_APPENDIX.*

---

### **D-085 | UX payeur — fonds protégés, langage vulgarisé**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Règle de vocabulaire :** Le mot "escrow" est interdit dans l'interface. Remplacé par "fonds protégés".

---

### **D-086 | Explication des frais Micro Rave — service de confiance**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Contenu brut :** Pour le talent : *"Le taux Micro Rave couvre la mise en relation, la contractualisation, la sécurisation du paiement, la preuve de présence et la garantie de règlement. Ton net est garanti si tu es présent."* Pour le payeur : *"Les frais de service Micro Rave couvrent la sélection du talent, la gestion du contrat, la sécurisation des fonds et le règlement garanti de la prestation."* Pour l'onboarding : *"Tu paies une fois pour la certitude que ça se passe bien — ou que tu es protégé si ça ne se passe pas bien."*

---

### **D-087 | Notification négative — format canonique non accusatoire**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Contenu brut :** Structure obligatoire : 1\. Raison lisible 2\. Preuve utilisée 3\. Règle appliquée 4\. Recours 5\. Délai 6\. Arbitre.

Ton obligatoire : non accusatoire. Le système explique ce qu'il a observé, pas ce que l'utilisateur a fait de mal.

---

### **D-088 | Langue — français d'abord, architecture bilingue dès MVP**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Règle invariante :** Aucune chaîne de caractères visible par l'utilisateur n'est hardcodée dans le code. Toujours externalisée dans le système i18n.

MVP : français uniquement. V3.0.1 : activation anglais par simple ajout fichier de traduction EN.

---

### **D-089 | Dashboard organisateur — vue lineup temps réel avec délégué et timeline incident**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

*Voir détails dans section BLOC 10 de RAW\_APPENDIX.*

---

### **D-090 | Dashboard vendeur — portefeuille complet**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Contenu brut :** Vue globale : clients actifs, GMV généré, commissions libérées vs retenues, commissions à risque, valeur estimée portefeuille, score santé. Vue par client : FirstCommission, ResidualCommission projetée, résiduel 12 mois, volume, droits expirant bientôt, clients dormants. Vue pipeline : events en cours, complétés, potentiels.

---

### **D-091 | Architecture marketplace — triptyque talent ↔ organisateur/payeur ↔ checkpoint**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Phrases canoniques :** *"Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène."* *"Le checkpoint est comme un listing Airbnb, mais pour la performance événementielle."*

**Contenu brut :** Le Checkpoint est un rôle utilisateur à part entière avec : calendrier de disponibilités, propriétaire reconnu, capacité d'acceptation QuickPlay, pouvoir de créer des événements, contraintes techniques, réputation calculée par usage réel.

Séparation ontologique : EventLocation \= endroit où un event a lieu. Checkpoint \= lieu reconnu, programmable, publiquement exploitable dans l'écosystème MR.

---

### **D-092 | Checkpoint comportemental vs déclaratif**

**Statut :** VALIDÉ **Bloc :** BLOC 10 — UX et vérité perçue

**Phrase canonique :** *"Un lieu devient ce qu'il accueille."*

**Règle invariante :** Un checkpoint ne dit pas ce qu'il est; il le devient par les événements qu'il héberge.

Préférences utilisateur \= déclaratives. Préférences checkpoint \= comportementales (EMA sur historique des événements hébergés).

---

**FIN DE LA PARTIE 2 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 3 / 8**

---

*(Suite du DECISION\_REGISTRY\_V3 — D-093 à D-146 \+ amendements)*

---

### **D-093 | PresenceProofResolver — faisceau d'indices pondérés**

**Statut :** VALIDÉ — voir aussi D-093-A **Bloc :** BLOC 11 — Sécurité, fraude et vie privée

**Contenu brut :** La présence est résolue par un faisceau d'indices pondérés. GPS n'est pas obligatoire — signal fort parmi d'autres.

Matrice des signaux (voir D-093-A pour version complète avec conditions).

Règles de résolution :

* Signal fort unique convergent → présence probable (admin review si contradiction)  
* Faisceau convergent → présence confirmée → payout automatique éligible  
* Signaux contradictoires → admin review obligatoire  
* Aucun signal → absence présumée → admin review

Anti-spoofing dans SpoofingDetectionPolicyConfig. Seuils dans PresencePolicyConfig. Tout override admin → AdminAction loggée obligatoirement.

---

### **D-093-A | PresenceProofResolver — précisions conditionnelles**

**Statut :** VALIDÉ — amendement D-093 **Bloc :** BLOC 11 — précision post-BLOC 10

**Contenu brut :**

Matrice complète des signaux avec conditions :

| Signal | Poids | Disponibilité | Condition |
| ----- | ----- | ----- | ----- |
| TicketAdmissionRight validé | Fort | Toujours pour audience | Événement avec billetterie |
| AudienceCheckIn / TalentCheckIn | Fort | Toujours | — |
| GPS cohérent avec le lieu | Fort | Si disponible | Événement physique |
| QR code scanné sur place | Fort | Si déployé | Événement physique |
| Validation staff / délégué | Moyen | Si délégué présent | Événement physique |
| Timestamp cohérent avec la plage | Moyen | Toujours | — |
| Checkpoint actif à ce moment | Moyen | Si Checkpoint existe | Conditionnel D-091 |
| Log de connexion plateforme | Fort | Événements virtuels | Événements virtuels uniquement |

Note : pour les EventLocations sans Checkpoint (lieux privés, résidentiels), le signal "Checkpoint actif" est absent par design, non par anomalie.

---

### **D-094 | Fraude SOTS — garde-fou structurel \+ 7 patterns**

**Statut :** VALIDÉ **Bloc :** BLOC 11 — Sécurité, fraude et vie privée

**Contenu brut :** Garde-fou structurel primaire : TicketAdmissionRight \+ AudienceCheckIn \= condition nécessaire pour soumettre une note audience. Rejet avant ledger si absent.

7 patterns dans SOTSFraudDetectionPolicyConfig :

1. SUSPICIOUS\_SOTS\_CLUSTER — cluster de notes identiques, intervalle court, comptes récents → quarantaine  
2. Noteur sans AudienceCheckIn → rejet structurel  
3. SOTS\_PATTERN\_ANOMALY — notes systématiquement extrêmes → flag \+ review  
4. Compte \< 30 jours sans historique → quarantaine  
5. CROSS\_TALENT\_SOTS\_SUSPICIOUS — talent note concurrent sur events non croisés → flag \+ review  
6. SOTS\_SELF\_BENEFICIAL — auto-note directe ou indirecte → blocage absolu  
7. SOTS\_CONFLICT\_OF\_INTEREST — vengeance/conflit d'intérêt → contestation admissible

Soumissions en quarantaine : inscrites avec statut QUARANTINED. Jamais supprimées.

Tests P0 : SOTS-CHECKIN-01, SOTS-SELF-01.

---

### **D-095 | Hiérarchie de sensibilité des données — 5 niveaux**

**Statut :** VALIDÉ **Bloc :** BLOC 11 — Sécurité, fraude et vie privée

**Contenu brut :**

| Niveau | Catégorie | Contenu | Accès |
| ----- | ----- | ----- | ----- |
| 1 | Données publiques | Profil talent public, SOTS public, Checkpoint public, events publics | Tout utilisateur |
| 2 | Semi-privées (parties concernées) | Ventilation brut/commission/net talent, statut payout, facture payeur, détails Engagement | Parties de l'Engagement |
| 3 | Confidentielles | Commissions vendeur, SellerPortfolio, ClientAttributionRight | Parties \+ rôles autorisés — DataAccessLedgerEntry obligatoire |
| 4 | Très sensibles | FinancialLedger complet, TalentTaxProfile, DecisionRecord internal notes, AdminAction logs, DataAccessLedger, AdminIncidentRecord, BugReplayRecord, SchedulerIncidentRecord financier | Admin — DataAccessLedgerEntry obligatoire |
| 5 | Critiques | Secrets Stripe, clés chiffrement, LedgerCodeMap (double validation), SecretsRotationPolicyConfig, MigrationTriggerPolicyConfig | Fondateur — double validation |

Règle transversale : tout accès niveau 3+ → DataAccessLedgerEntry obligatoire. Test P0 : ADMIN-ROLE-02.

---

### **D-096 | Rétention et droit à l'effacement — pseudonymisation \+ DataRetentionPolicyConfig**

**Statut :** VALIDÉ provisoirement — voir aussi D-096-A **Bloc :** BLOC 11 — Sécurité, fraude et vie privée

**Phrase canonique :** *"On efface l'identité; on conserve la preuve."*

**Contenu brut :** Données personnelles non financières → pseudonymisation possible sur demande. Données financières → non effaçables, rétention 7 ans minimum, pseudonymisation du lien vers profil. Données réputationnelles → non effaçables (append-only), score public masquable.

DataRetentionPolicyConfig — durées en database, double validation obligatoire. DataSubjectRequestRecord — délai 30 jours (Loi 25).

---

### **D-096-A | Rétention — 7 ans comme plancher \+ retentionJustificationCode**

**Statut :** VALIDÉ — amendement D-096

**Contenu brut :** 7 ans \= plancher légal, pas plafond. Réévaluation possible selon obligations déclaration plateformes numériques ARC/RQ.

DataRetentionPolicyConfig ajoute champ retentionJustificationCode :

| Code | Source légale |
| ----- | ----- |
| CRA\_TAX\_7Y | Obligation fiscale CRA — 7 ans minimum |
| DIGITAL\_PLATFORM\_REPORTING | Obligation déclaration plateforme numérique ARC/RQ |
| QC\_LAW25\_PRIVACY | Loi 25 Québec |
| INTERNAL\_POLICY | Politique interne Micro Rave |

Si plusieurs codes s'appliquent → durée la plus longue prévaut.

---

### **D-097 | Secrets Stripe — 10 règles absolues**

**Statut :** VALIDÉ **Bloc :** BLOC 11 — Sécurité, fraude et vie privée

**Contenu brut :**

1. Aucun secret Stripe dans le code source  
2. Environnements séparés : dev/staging → Stripe test; prod → Stripe live  
3. Secrets dans variables d'environnement plateforme uniquement  
4. Rotation planifiée dans SecretsRotationPolicyConfig \+ rotation après incident  
5. KYC Stripe Connect obligatoire avant payout (KYCStatus \= VERIFIED)  
6. Webhook signature validation obligatoire — raw body préservé  
7. Idempotency obligatoire — WebhookProcessedLog  
8. Restricted keys Stripe par usage (moindre privilège)  
9. Aucune clé prod dans logs, Base44 UI, debug  
10. Toute rotation \= AdminAction \+ DataAccessLedgerEntry

Tests P0 : WEBHOOK-SIG-02, WEBHOOK-IDEM-01, PAYOUT-BLOCK-KYC.

---

### **D-098 | Fraude de paiement — 7 signaux, 3 niveaux \+ rail HOLD**

**Statut :** VALIDÉ **Bloc :** BLOC 11 — Sécurité, fraude et vie privée

**Contenu brut :**

7 signaux dans FraudDetectionPolicyConfig :

1. NEW\_ACCOUNT\_HIGH\_VALUE\_PAYMENT — carte \< 24h après création compte → moyen  
2. UNUSUAL\_AMOUNT\_NEW\_ACCOUNT — montant anormal, sans historique → moyen  
3. GEO\_MISMATCH — facturation dans pays différent de la cellule → léger  
4. PAYMENT\_RETRY\_SUSPICIOUS — tentatives multiples échouées → moyen  
5. NEW\_STRIPE\_CONNECT\_ACCOUNT — payout vers compte Stripe \< 48h → lourd  
6. PRIOR\_CHARGEBACK\_ACCOUNT — chargeback MR précédent → lourd (admin review avant event\_sealed)  
7. HIGH\_VELOCITY\_NEW\_ACCOUNT — création cascade events, fenêtre courte → moyen

Traitement :

* Léger : monitoring, aucun blocage  
* Moyen : délai payout étendu, PayoutBlockReason : FRAUD\_REVIEW\_PENDING  
* Lourd : admin review, SYSTEM\_HOLD via rail HOLD, AdminIncidentRecord, PayoutBlockReason : FRAUD\_HOLD\_APPLIED

---

### **D-099 | Architecture Scheduler — SchedulerDueTask, doctrine centrale**

**Statut :** VALIDÉ **Bloc :** BLOC 12 — Scheduler et opérations

**Phrases canoniques :** *"Le cron réveille; la tâche dit quoi faire."* *"Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement."*

**Contenu brut :** Structure SchedulerDueTask : id, jobKey, dueAt, status (pending/processing/done/failed/cancelled), lockedByRunId, sourceEventType, sourceEventId, policyId, attemptCount, lastAttemptAt.

Statut cancelled obligatoire si objet cible atteint état rendant la tâche caduque.

Surveillance en deux dimensions : HEARTBEAT\_MISSING (dispatcher ne se réveille pas) et DUE\_TASK\_OVERDUE (tâche P0 non traitée même si dispatcher tourne). Seuils dans SchedulerPolicyConfig.

ManualJobRunRequest champs : adminUserId, targetJobKey, reasonCode, policyId, adminActionId.

---

### **D-100 | Jobs Scheduler — liste P0/P1/P2 complète**

**Statut :** VALIDÉ **Bloc :** BLOC 12 — Scheduler et opérations

**Contenu brut :**

Jobs P0 : capture\_deposit, deposit\_deadline\_check, balance\_deadline\_check, seal\_event, sots\_window\_close, payout\_approver, execute\_payout\_transfer, chargeback\_hold, expire\_dispute\_window, transfer\_expiry\_check, ledger\_balance\_check.

Jobs P1 : saas\_revenue\_recognition\_daily, tax\_remittance\_reminder, client\_attribution\_renewal, seller\_portfolio\_health.

Jobs P2 : sots\_snapshot, checkpoint\_cultural\_profile, fraud\_pattern\_scan (candidat P1 dès volume justifié), data\_retention\_enforcement, rounding\_reconciliation, scheduler\_credit\_budget\_report.

---

### **D-101 | Anti-double payout — 6 verrous**

**Statut :** VALIDÉ **Bloc :** BLOC 12 — Scheduler et opérations

**Contenu brut :**

1. lockedByRunId — anti-double-exécution  
2. Status check — Engagement.status admissible  
3. PayoutExecutionRecord — si existant → no-op absolu  
4. Stripe idempotency key — Engagement.systemId \+ "payout" \+ attempt\_version  
5. SettlementInstruction.consumedAt — consommable une seule fois  
6. Invariant LEDGER-02 — si Dr ≠ Cr → LedgerImbalanceRecord \+ SYSTEM\_HOLD → PayoutBlockReason : LEDGER\_IMBALANCE

Règle invariante : tout verrou déclenché \= PayoutBlockReason créé avec code explicite. Jamais blocage silencieux.

---

### **D-102 | Politique de relance des jobs — trois catégories**

**Statut :** VALIDÉ **Bloc :** BLOC 12 — Scheduler et opérations

**Contenu brut :**

Relançables par admin via ManualJobRunRequest \+ AdminAction : sots\_snapshot, checkpoint\_cultural\_profile, fraud\_pattern\_scan, data\_retention\_enforcement, rounding\_reconciliation, tax\_remittance\_reminder, seller\_portfolio\_health.

Relançables avec procédure formelle : chargeback\_hold (ManualJobRunRequest \+ AdminAction \+ reasonCode \+ DecisionRecord), saas\_revenue\_recognition\_daily (guard "période déjà reconnue → no-op"), balance\_deadline\_check / deposit\_deadline\_check (fondateur \+ double validation), expire\_dispute\_window (fondateur \+ double validation).

Interdits absolus : SchedulerRun complété (immuable), SchedulerDueTask de type payout (pas de création directe admin), execute\_payout\_transfer, capture\_deposit.

---

### **D-103 | Traitement ledger imbalance**

**Statut :** VALIDÉ **Bloc :** BLOC 12 — Scheduler et opérations

**Contenu brut :** Détection par ledger\_balance\_check (P0) → scan par transactionGroupId → Dr ≠ Cr → LEDGER\_BALANCE\_VIOLATION.

Sur détection : payouts de l'event gelés (rail HOLD), autres events non affectés, LedgerImbalanceRecord créé, SchedulerIncidentRecord P0, alerte fondateur, aucun retry automatique.

Correction : uniquement par reversal \+ correctrice. DecisionRecord ADMIN\_OVERRIDE \+ double validation fondateur.

---

### **D-104 | CronBudgetPolicyConfig — quatre états de fonctionnement**

**Statut :** VALIDÉ **Bloc :** BLOC 12 — Scheduler et opérations

**Contenu brut :**

| État | Seuil | Comportement |
| ----- | ----- | ----- |
| healthy | \< 6 500 crédits/mois | Normal |
| watch | 6 500–8 000 | Réduire P2, alerte interne |
| critical\_only | 8 000–9 900 | P0 \+ P1 seulement, P2 suspendus, alerte fondateur |
| exhausted | \> 9 900 | P0 seulement, alerte fondateur immédiate |

Si exhausted pendant 3 mois consécutifs → signal MigrationTriggerPolicyConfig.

SchedulerCreditBudget objet de suivi mensuel. Consommation anormalement rapide → AdminIncidentRecord automatique.

Estimation MVP : \~3 630 crédits/mois sur 10 000 disponibles.

---

### **D-105 | Rôles admin canoniques — 10 rôles sur 5 niveaux**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Contenu brut :**

| Rôle | Niveau | Description |
| ----- | ----- | ----- |
| FOUNDER | 5 | Autorité ultime. Absorbe rôles vacants MVP. FOUNDER\_ACTING\_AS\_\[ROLE\] dans DataAccessLedger. |
| FINANCE\_ADMIN | 4 | Finance, payouts, ledger, TaxConfig, reversals, TaxRemittanceRecord. |
| OPS\_ADMIN | 3 | Opérations quotidiennes, relances non financières. |
| SUPPORT\_ADMIN | 2 | Lecture niveaux 1-2. IncidentRecord, ReviewRequest, escalade. Pas payout, config, export massif, SYSTEM\_HOLD, données financières, events SECRET, DecisionRecord. |
| DISPUTE\_ADMIN | 3 | Disputes, DecisionRecord, DISPUTE\_HOLD après résolution. Déclaration conflit d'intérêt obligatoire. |
| DEV\_ADMIN | 2 | Déploiement, logs, rotation technique secrets. Zéro données financières prod. Zéro events SECRET. |
| PRIVACY\_SECURITY\_ADMIN | 3 | LPRPDE, pseudonymisation, DataRetentionPolicyConfig, DataSubjectRequestRecord, gouvernance SecretsRotationPolicy. |
| POLICY\_ADMIN | 3 | Modification PolicyConfig standard et élevée. Pas configs critiques. |
| CELL\_MANAGER | 2 | POST-MVP. Voit events PUBLIC de son territoire. Accède events PRIVÉ si assigné. Ne voit jamais events SECRET automatiquement. |
| AUDITOR\_EXTERNAL | 1 | Lecture seulement sur périmètre DataAccessAuditRoleConfig. |

Suppressions : PLATFORM\_ADMIN → OPS\_ADMIN / ARBITRATION\_ADMIN → DISPUTE\_ADMIN / DEVELOPER → DEV\_ADMIN.

---

### **D-106 | SoloFounderOverride ≠ DualApproval**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Phrase canonique :** *"SoloFounderOverride est une exception documentée. Ce n'est pas une validation — c'est une exception qui doit rester exceptionnelle."*

**Contenu brut :** Conditions : délai configurable (recommandé 60s, dans DualApprovalThresholdConfig), confirmation explicite obligatoire, AdminIncidentRecord type SOLO\_FOUNDER\_OVERRIDE, DataAccessLedgerEntry marqueur FOUNDER\_SOLO\_OVERRIDE, reasonCode obligatoire.

Actions à double validation indépendamment du montant : pseudonymisation compte, TaxConfig, LedgerCodeMap, SOTSCommissionModulationConfig, DataRetentionPolicyConfig, MigrationTriggerPolicyConfig, SecretsRotationPolicyConfig, DualApprovalThresholdConfig elle-même, payouts exceptionnels au-delà du seuil, reversals ledger au-delà du seuil.

---

### **D-107 | Interdits absolus — 19 actions architecturalement impossibles**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Phrase canonique :** *"Certains pouvoirs ne doivent pas exister, parce que leur existence détruirait la confiance que Micro Rave est censée incarner."*

**Contenu brut :**

1. Modifier/supprimer une écriture FinancialLedger  
2. Supprimer une ReputationLedgerEntry  
3. Modifier données ContractSnapshot WORM  
4. Sauter une transition d'état obligatoire  
5. Revenir en arrière sur un état WORM  
6. Modifier un Engagement archivé  
7. Supprimer un DecisionRecord  
8. Supprimer un AdminAction log  
9. Supprimer un DataAccessLedgerEntry  
10. Supprimer ou falsifier un BugReplayRecord  
11. Modifier un WebhookIdempotencyRecord traité  
12. Désactiver le DataAccessLedger  
13. Modifier un SchedulerRun complété  
14. Supprimer un AdminIncidentRecord  
15. Modifier le systemId d'un objet existant  
16. Modifier les préfixes IDFactory d'objets déjà créés  
17. Contourner le MoneyMovementRouter  
18. Créer une SettlementInstruction sans DecisionRecord valide (quand chaîne LOI DISPUTE-01 requise)  
19. Contourner les 6 verrous anti-double payout

---

### **D-108 | PolicyConfigChangeRecord — règle universelle \+ classification 32 tables**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Contenu brut :** Toute modification de toute PolicyConfig produit : AdminAction \+ DataAccessLedgerEntry \+ PolicyConfigChangeRecord. Champs du record : previousVersion, newVersion, reasonCode, changedBy, approvedBy, effectiveFrom, effectiveTo. Interdit absolu : aucune modification directe en database en production.

Classification CRITIQUE (double validation) : TaxConfig, LedgerCodeMap, MembershipPlan, SOTSCommissionModulationConfig, DataRetentionPolicyConfig, MigrationTriggerPolicyConfig, SecretsRotationPolicyConfig, DualApprovalThresholdConfig.

Note : DualApprovalThresholdConfig \= CRITIQUE uniquement. Auto-protégée.

Classification ÉLEVÉ : PresencePolicyConfig, DisputeAccessPolicyConfig, KYCPolicyConfig, CronBudgetPolicyConfig, PaymentProviderConfig, GrowthPolicyConfig, CoefficientSalePolicyConfig, SellerCommissionPolicy.

Classification STANDARD : FraudDetectionPolicyConfig, SOTSConfidencePolicyConfig, DelegatePolicyConfig, EventRiskPolicyConfig, EventPaymentConfig, DisputePolicyConfig, LiquidityPolicyConfig.

Classification OPÉRATIONNEL : SchedulerCreditBudget, SpoofingDetectionPolicyConfig, SOTSCalculationPolicyConfig.

---

### **D-109 | SecretsRotationPolicyConfig — séparation gouvernance / exécution**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Phrase canonique :** *"Celui qui tourne la clé technique ne doit pas forcément être celui qui décide la règle."*

**Contenu brut :** Gouvernance : PRIVACY\_SECURITY\_ADMIN \+ FOUNDER, double validation obligatoire. Exécution : DEV\_ADMIN selon instructions de la policy. Traçabilité : AdminAction \+ DataAccessLedgerEntry \+ PolicyConfigChangeRecord. AdminIncidentRecord automatique si : rotation urgente, exposition suspectée, échec de rotation, rotation non planifiée.

---

### **D-110 | ConflictOfInterestRecord — arbitrage indépendant**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Phrase canonique :** *"Micro Rave ne règle jamais une dispute par proximité sociale. Elle règle par preuve, rôle, indépendance, décision et trace."*

**Contenu brut :** Champs : disputeRecordId, adminUserId, conflictType, declaredAt, recusalRequired, replacementAdminId, reasonCode.

Ordre de relais si récusation : 1\. Autre DISPUTE\_ADMIN 2\. FINANCE\_ADMIN sur aspects financiers purs 3\. FOUNDER en dernier recours \+ AdminIncidentRecord \+ FOUNDER\_ACTING\_AS\_DISPUTE\_ADMIN.

---

### **D-111 | Export comme pouvoir distinct**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

**Phrase canonique :** *"Lire n'est pas modifier. Modifier n'est pas approuver. Approuver n'est pas exécuter. Exporter est un pouvoir distinct."*

---

### **D-112 | Matrice Admin Authority Matrix — table canonique**

**Statut :** VALIDÉ **Bloc :** BLOC 13 — Admin Authority Matrix

*Voir tableau complet dans section BLOC 13 de RAW\_APPENDIX.*

Légende : ✅ Autorisé / ❌ Interdit / 🔶 Conditionnel \+ DataAccessLedgerEntry / DV \= double validation / EXEC \= exécution technique seulement / OBL \= obligatoire.

---

### **D-113 | Chemin nominal MVP — 13 étapes non négociables**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

**Phrase canonique :** *"Le MVP ne doit pas prouver que Micro Rave a beaucoup de features. Il doit prouver qu'un besoin réel peut devenir une mission, une mission peut devenir un engagement, et un engagement peut être payé, vécu, évalué, réglé et comptabilisé."*

**Contenu brut :**

Deux origines → même pipeline : A : CreateEvent → MissionSlots ouverts → négociation B : Lobby → EngagementCollectif → assigné à Event → MissionSlots remplis

13 étapes : proposition → négociation → ContractSnapshot phase 1 → placement Lineup → dépôt → balance → event\_sealed ContractSnapshot phase 2 → prestation SessionPresence → event\_completed SOTS 24h → SOTS window closed → payout approuvé → talent payé ledger équilibré → archivage WORM global.

---

### **D-114 | QuickPlay mince MVP**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

**Contenu brut :** INCLUS : lobby formation, capitaine (premier arrivé), EngagementCollectif indivisible, prix \= valeur déclarée par capitaine (pas de calcul yield), l'organisateur prend le prix tel quel, pas de négociation post-acceptation, conversion en Engagements individuels, pipeline standard.

EXCLU : tarification yield dynamique, matching algorithmique avancé, négociation post-acceptation, multi-lobby simultané.

---

### **D-115 | Billetterie mince MVP — TicketAdmissionRight obligatoire**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

**Règle invariante :** Sans TicketAdmissionRight, le garde-fou anti-fraude SOTS (SOTS-CHECKIN-01) n'existe pas.

MVP : TicketAdmissionRight obligatoire même à 0$, AudienceCheckIn lié au billet, flux comptable séparé si payant (4540/7410). V3.0.1 : billetterie complète.

---

### **D-116 | Coefficient de vente au MVP — conditions strictes**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

**Règle invariante (LOI LINEUP-03) :** Si coefficient \= 1, prix\_vendu ne peut pas dépasser total\_lineup\_signé.

**Contenu brut :** Sans vendeur : coefficient \= 1 forcé. Pilote seller-led : activation fondateur (AdminAction \+ reasonCode) \+ toutes conditions D-052 satisfaites simultanément. Seller-led complet sans conditions \= V3.1.

---

### **D-117 | Critères de readiness — deux seuils formalisés**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

**Phrase canonique :** *"On ne lance pas selon un pourcentage global. On lance seulement quand le chemin exact qu'on va utiliser est vert."*

**Contenu brut :** Seuil 1 — Premier event réel : 100% tests P0 chemin exercé \= PASS, 0 BugReplayRecord non PASSED, GoNoGoDecisionRecord \= GO. Un seul P0 FAILED \= event interdit.

Seuil 2 — Ouverture publique élargie : tout seuil 1 \+ au moins un event réel complété avec payout sans intervention manuelle, ledger zéro cent, GoNoGoDecisionRecord \= GO, support opérationnel, procédure de recours testée.

---

### **D-118 | Minimum Viable Trust — 12 critères**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

**Contenu brut :**

1. Talent voit ventilation complète avant acceptation  
2. Talent voit état payout avec raison de blocage lisible  
3. Payeur comprend "fonds protégés"  
4. Frais MR expliqués comme service de confiance  
5. Décision négative \= explication \+ recours  
6. Payout readiness prouvé  
7. Event 0 documenté  
8. Premier event pilote contrôlé  
9. Canal support disponible  
10. Procédure de recours documentée  
11. QuickPlay compréhensible en 30 secondes  
12. Au moins un event réel complété (payout sans intervention, ledger zéro cent, visible/référençable) ← ouverture élargie seulement

---

### **D-119 | Roadmap V3.0 → V3.3 — version définitive**

**Statut :** VALIDÉ **Bloc :** BLOC 14 — MVP Scope Lock

*Voir section 11 ROADMAP\_REGISTER pour détail complet.*

Séquence de lancement : Event 0A (Stripe test), Event 0B (Stripe live 5-10$), Event 1 (4 à 7 Premium), Event 2 (ALL NIGHT LONG), Event 3 (hybride).

---

### **D-120 | Capitaine QuickPlay — statut de lobby, pas rôle métier**

**Statut :** VALIDÉ — voir aussi D-120-A **Bloc :** BLOC 1 (correction dans BLOC 15\)

**Phrase canonique fondatrice :** *"Le capitaine est un statut de lobby, pas un rôle métier."*

*Voir D-120-A pour version complète.*

---

### **D-120-A | Capitaine QuickPlay — correction complète, analogie StarCraft 2**

**Statut :** VALIDÉ — amendement D-120

**Règle invariante :** *"Tout talent admissible dans un lobby peut être capitaine. Le capitaine est le premier arrivé. Le système ne distingue pas les capitaines potentiels des membres potentiels. Cette distinction n'existe pas."*

**Contenu brut :** Modèle : roleMetier \= DJ/photographe/vidéaste/VJ/MC/hôte/technicien. lobbyStatus \= captain/member.

Sélection MVP : premier utilisateur arrivé dans le lobby par matching \= capitaine automatique. Si quitte → suivant dans l'ordre d'arrivée.

Code V2 confirmé : `isCaptain = (user.id === session.captainUserId)`

Pouvoirs du capitaine : soumettre MissionApplication avant lobby complet, choisir/confirmer checkpoint cible, coordination informelle.

Déclenchement automatique : si lineup complet ET critères satisfaits → session lancée automatiquement.

Interdits absolus : aucun MissionSlot/Engagement/payout/roleMetier "capitaine", aucun pouvoir d'engager sans consentement, aucun contournement pipeline.

Analogie StarCraft 2 : hôte \= premier qui crée la salle. Son rôle dans la partie \= identique aux autres. Statut d'hôte disparaît au lancement.

Tests P0 : QUICKPLAY-CAPTAIN-01, QUICKPLAY-CAPTAIN-02, QUICKPLAY-CAPTAIN-03, QUICKPLAY-AUTO-01.

---

### **D-121 | Corridor de lancement — H2T / H2X / H2Z**

**Statut :** VALIDÉ **Bloc :** BLOC 15 — Liquidité commerciale

**Phrase canonique :** *"On ne lance pas une ville; on allume un corridor."*

**Contenu brut :** H2T → Mile-End / Plateau culturel / scène créative H2X → Plateau sud / Quartier latin / axe étudiant-culturel H2Z → Quartier des spectacles / centre-ville / potentiel corporate

---

### **D-122 | Deux produits d'amorçage — séquence validée**

**Statut :** VALIDÉ **Bloc :** BLOC 15 — Liquidité commerciale

**Phrase canonique :** *"Le 4 à 7 finance la preuve. ALL NIGHT LONG prouve la culture. L'hybride prouve Micro Rave."*

**Contenu brut :** Produit 1 — 4 à 7 Premium : CreateEvent, PME 20-150 employés, DJ, 750$-1 500$ CAD, test EPR \+ payout \+ ledger. Produit 2 — ALL NIGHT LONG : QuickPlay/Lobby/Checkpoint, billets 0$ ou symboliques, test QuickPlay \+ SOTS audience. Event 3 hybride : MissionSlot CreateEvent rempli par lobby QuickPlay.

---

### **D-123 | Plafond MVP — database, deux niveaux**

**Statut :** VALIDÉ **Bloc :** BLOC 15 — Liquidité commerciale

**Contenu brut :** Standard : 150 000 cents (1 500$ CAD) dans EventPaymentConfig. Exception contrôlée : 250 000 cents (2 500$ CAD) avec SoloFounderOverride \+ AdminAction \+ reasonCode. Valeurs en database. Modifiables avec la maturité du système.

---

### **D-124 | Liquidité progressive — 5 phases**

**Statut :** VALIDÉ **Bloc :** BLOC 15 — Liquidité commerciale

**Phrase canonique :** *"Le système peut recommander tôt. Il ne contractualise pas automatiquement tôt."*

**Contenu brut :**

| Phase | Volume | Mode |
| ----- | ----- | ----- |
| 1 Amorçage | 0–5 events | 100% manuel — fondateur place les talents |
| 2 Démarrage | 5–15 events | Suggestions système, humain valide |
| 3 Liquidité minimale | 15–30 events | Auto-suggestion QuickPlay, acceptation humaine obligatoire |
| 4 Liquidité active | 30–50 events | Matching auto limité — missions simples, rôles connus |
| 5 Liquidité établie | 50+ events | Matching auto élargi \+ RSI critère de gouvernance |

Seuils dans LiquidityPolicyConfig en database.

---

### **D-125 | RSI — définition canonique**

**Statut :** VALIDÉ **Bloc :** BLOC 15 — Liquidité commerciale

**Contenu brut :** RSI \= Référencement Spontané Identifiable / Intégré. RSI Identifiable : référence traçable dans la plateforme. RSI Intégré : comportement récurrent (return rate, rebooking).

Statut MVP : interne, observé, non exposé comme mécanique utilisateur. Jamais revenue share visible. Devient critère de gouvernance à 50+ events. Seuil dans LiquidityPolicyConfig.

---

### **D-126 | 20 premiers talents — composition finale**

**Statut :** VALIDÉ **Bloc :** BLOC 15 — Liquidité commerciale

**Règle canonique :** *"Fiabilité avant notoriété."*

**Contenu brut :** 10 DJs / 3 photographes-vidéastes / 2 VJ / 2 MC-hôtes / 2 techniciens son-lumière / 1 talent hybride (ex. DJ \+ photo). Total : 20 talents métiers. N'importe lequel peut être capitaine selon l'ordre d'arrivée dans le lobby.

---

### **D-127 | Base44 comme rampe — doctrine architecturale V3**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Phrases canoniques :** *"Base44 est la rampe. L'architecture souveraine est la destination. On ne confond pas les deux."* *"Base44 peut héberger l'objet. Il ne doit pas devenir l'objet."* *"Base44 sert à aller vite. L'architecture souveraine sert à durer."*

**Contenu brut :** Couches portables (jamais propriété de Base44) : IDFactory, MissionGraph, ContractSnapshot WORM logic, FinancialLedger \+ LedgerCodeMap V3, Payment waterfall, Stripe webhook \+ idempotency, Anti-double payout 6 verrous, SOTS/ReputationLedger, PolicyConfig resolver, SchedulerDueTask, AdminAuthorityResolver, DataAccessLedger, i18n strings, PresenceProofResolver, MoneyMovementRouter, MissionConversionGuard, CheckpointCulturalProfile (calcul EMA), PhoneFreeRitualGuard (conditionnel Micro-Onde).

Ce qui peut rester couplé Base44 MVP : UI, pages, formulaires, routing, auth technique MVP, queries simples.

---

### **D-128 | Repository interfaces — liste complète**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Contenu brut :** EngagementRepository (Event, Lineup, MissionSlot, MissionApplication, MissionProposal, Engagement, LineupPlacement), EventRepository/MissionRepository, LedgerRepository, PaymentRepository, SchedulerRepository, UserRepository, CheckpointRepository, DisputeRepository (chaîne LOI DISPUTE-01), ReputationRepository (ReputationLedger \+ SOTSScoreSnapshot), AdminRepository (AdminAction \+ AdminIncidentRecord \+ DataAccessLedgerEntry \+ PolicyConfigChangeRecord), PolicyConfigRepository.

---

### **D-129 | WEBHOOK-RAWBODY-01 test P0 bloquant**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Règle invariante :** Un seul FAILED \= Event 0B interdit.

**Contenu brut :** Si Base44 ne permet pas la validation fiable du raw body Stripe : webhook proxy externe obligatoire avant argent réel. Le proxy doit : recevoir le webhook, valider la signature avec raw body, préserver l'idempotency key, ne transmettre à Base44 que des événements validés. Ce proxy est une précondition, pas un plan B.

---

### **D-130 | MigrationTriggerPolicyConfig — trois niveaux**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Contenu brut :**

ALERTE : crédits cron \> 8 000 / mois pendant 1 mois, coût mensuel \> seuil d'alerte, dégradation performance.

MIGRATION À PLANIFIER : crédits \> 9 900 pendant 3 mois consécutifs, \> 50 events simultanés, \> 10 000 Engagements, coût \> seuil migration, limitation ORM relations complexes.

MIGRATION ACCÉLÉRÉE : bug financier P0 causé par Base44, impossibilité validation webhooks, impossibilité invariants ledger/payout/WORM.

Destination préférée : PostgreSQL. Décision finale au moment de la migration. Modification MigrationTriggerPolicyConfig \= AdminAction \+ PolicyConfigChangeRecord (niveau CRITIQUE — double validation).

---

### **D-131 | Discipline développement — doctrine V3**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Phrase canonique :** *"GitHub trace le code. La database trace la config. Ces deux registres sont distincts et complémentaires. Un changement de PolicyConfig sans PolicyConfigChangeRecord est un interdit absolu — même si le code GitHub est à jour."*

**Contenu brut :** GitHub dès premier commit V3. Branches dev/staging/main. PR obligatoire avant merge main. Environnements séparés. Secrets séparés. Aucun secret dans code/logs/GitHub. dev \+ staging → Stripe test keys. prod → Stripe live keys. CI/CD MVP : lint \+ tests unitaires critiques. V3.0.1 : pipeline complet P0 automatisés.

---

### **D-132 | Portability Readiness — checklist ordonnée, précondition Event 0B**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Phrase canonique :** *"Une sortie théorique n'est pas une stratégie de sortie. Il faut tester qu'on peut vraiment sortir."*

**Contenu brut :** Un item FAILED \= Event 0B interdit. Ordre : 1\. Aucun objet métier critique sans systemId 2\. Mapping Base44 id → systemId documenté 3\. Schema registry versionné 4\. Export complet tables critiques lisible hors Base44 5\. Backup planifié 6\. Test restauration hors Base44 7\. Vérification intégrité référentielle Event ↔ Lineup ↔ MissionSlot ↔ Engagement ↔ Ledger.

---

### **D-133 | Observabilité MVP — précondition Event 0B, 10 alertes P0**

**Statut :** VALIDÉ **Bloc :** BLOC 16 — Technologie et Base44

**Contenu brut :** Infrastructure : logs externalisés, Sentry ou équivalent, monitoring heartbeat externe, dashboard fondateur.

10 alertes P0 :

1. Ledger imbalance  
2. Double payout tenté  
3. Webhook Stripe invalide  
4. Heartbeat manquant  
5. SchedulerDueTask P0 expirée  
6. event\_sealed bloqué  
7. Payout bloqué sans PayoutBlockReason explicite  
8. CriticalConfig manquante  
9. Consommation cron anormalement rapide  
10. Échec écriture DataAccessLedger sur action sensible

---

### **D-134 | Principe fondateur des tests — BugReplayRecord**

**Statut :** VALIDÉ **Bloc :** BLOC 17 — Tests et bug replay

**Phrase canonique :** *"Un bug corrigé mais non rejoué est un bug qui attend de revenir."*

**Règle invariante :** replayStatus \= PASSED requis avant clôture de tout bug touchant une vérité irréversible. Correction de code seule insuffisante.

**Contenu brut :** Portée : tout bug qui touche une vérité irréversible — argent, contrat, présence, réputation, admin, sécurité, portabilité ou état WORM.

Ne déclenche pas BugReplayRecord : bug CSS mineur, affichage sans conséquence métier, comportement UX sans impact sur vérité irréversible.

---

### **D-135 | Distinction P0 global / P0 conditionnel**

**Statut :** VALIDÉ **Bloc :** BLOC 17 — Tests et bug replay

**Contenu brut :** Structure de chaque test : testCode, category (global/conditionnel), triggerCondition, linkedDecision, requiredBeforeEvent (0A/0B/1/2/3).

P0 GLOBAL : toujours requis avant argent réel (WEBHOOK-RAWBODY-01, PORTABILITY-RESTORE-01, LEDGER-INV-01, DOUBLE-PAY-01 et chemin nominal).

P0 CONDITIONNEL : SC-03 coefficient si seller-led, SC-10 billetterie si payante, PhoneFreeRitualGuard si Micro-Onde, SOTS-CHECKIN-01 si SOTS audience, SC-15 si transfert activé, SC-16 si SOTS audience actif.

---

### **D-136 | Suite de tests P0 complète — 8 catégories**

**Statut :** VALIDÉ **Bloc :** BLOC 17 — Tests et bug replay

*Voir section 8 TEST\_REGISTRY pour détail complet par catégorie.*

---

### **D-137 | BugReplayRecord — structure et portée**

**Statut :** VALIDÉ **Bloc :** BLOC 17 — Tests et bug replay

**Contenu brut :** Déclenche obligatoirement : bug financier/ledger/payout, ContractSnapshot WORM, MissionConversionGuard, QuickPlay/Lobby, SOTS/ReputationLedger, DataAccessLedger, PolicyConfig, webhook/scheduler, présence/check-in, portabilité Base44, sécurité/rôle/interdit absolu.

Structure : sourceIncidentId, sourceAdminIncidentRecordId, bugCategory, affectedObjectType, affectedObjectId, reproductionSteps, inputState, expectedOutputState, actualOutputState, fixedAt, replayTestId, replayStatus (PENDING/RUNNING/PASSED/FAILED), replayValidatedAt, replayValidatedBy.

---

### **D-138 | Scénarios économiques canoniques — 16 scénarios**

**Statut :** VALIDÉ **Bloc :** BLOC 17 — Tests et bug replay

*Voir section 9 ECONOMIC\_SCENARIO\_REGISTER pour détail complet.*

---

### **D-139 | Grille de readiness par event — version finale**

**Statut :** VALIDÉ **Bloc :** BLOC 17 — Tests et bug replay

*Voir section 13 FIRST\_EVENT\_REGISTER pour détail complet.*

---

### **D-140 | Participants du premier event réel — co-testeurs consentants**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

**Contenu brut :** Talent : fiable du réseau direct fondateur, disponible pour débriefing, accepte contexte pilote. Organisateur : connu du fondateur, budget réel, prêt frictions UX, accepte contexte pilote. Payeur : identique à organisateur (SC-01). Admin : fondateur — admin concierge sur place.

Reconnaissance pilote : tous acceptent explicitement *"Je comprends que je participe à un événement pilote Micro Rave avec argent réel, support humain, et suivi post-event."*

---

### **D-141 | Montant du premier event réel — calibration du risque**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

**Contenu brut :** Event 0B : 5$-10$ CAD Stripe live symbolique. Event 1 : cachet net talent recommandé 300$ CAD, fourchette 300$-500$ CAD. Prix vendu client calculé par le système selon EventPaymentConfig, taxes, frais, ledger, waterfall. Jamais hardcodé.

---

### **D-142 | Checklist pré-event 1 — version complète**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

*Voir section 13 FIRST\_EVENT\_REGISTER pour checklist complète.*

---

### **D-143 | Surveillance en temps réel — 12 signaux**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

*Voir section 13 FIRST\_EVENT\_REGISTER pour détail complet.*

---

### **D-144 | Définition de succès — trois statuts**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

**Contenu brut :** FULL SUCCESS : tous critères financiers, contractuels, présence, SOTS et institutionnels verts sans intervention manuelle → Event 2 autorisé sans réserve. CONTROLLED SUCCESS : complété avec intervention humaine documentée → GO avec réserves si aucun P0 FAILED. NO-GO : P0 FAILED / ledger imbalance / payout manuel non prévu / BugReplayRecord FAILED-PENDING sur chemin critique → Event 2 bloqué.

---

### **D-145 | AbortProtocol — conditions d'arrêt et procédure**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

**Phrase canonique :** *"Un event pilote peut échouer. Il ne doit jamais échouer silencieusement."*

*Voir section 13 FIRST\_EVENT\_REGISTER pour conditions complètes et procédure 8 étapes.*

---

### **D-146 | Checklist post-event 1 — version complète**

**Statut :** VALIDÉ **Bloc :** BLOC 18 — Premier événement réel

*Voir section 13 FIRST\_EVENT\_REGISTER pour checklist complète.*


---

### **D-147 | EngagementAmendment — Extension de plage horaire sur accord mutuel**

**Statut :** VALIDÉ — 20 mai 2026 **Bloc :** BLOC 1 — Ontologie du produit
**Complète :** D-041, D-044, D-013
**Distinct de :** Transfert (D-013 — changement de talent), No-show (D-041 — absence sans consentement)

**Phrase canonique :** *"Un talent qui choisit de rester plus longtemps mérite d'être payé pour le temps réel qu'il passe. Le contrat ne change pas — il s'étend. Le taux est le même. La durée est différente. L'absent reste absent."*

**Règle invariante :** Le taux contractuel est WORM W2 — immuable. Seule la durée change. Le no-show d'un talent sur le même event n'est jamais absorbé par les autres talents. Chaque Engagement est indépendant (D-044).

**Contenu brut :**

Un `EngagementAmendment` de type `PLAGE_EXTENSION` modifie la durée d'un Engagement existant en état `performed`, avec le double consentement talent + organisateur. Il ne crée pas de nouvel Engagement. Il s'appuie sur le taux horaire implicite dérivé du ContractSnapshot phase 2 (WORM W2).

Formule canonique :

taux\_horaire\_implicite\_cents = cachet\_brut\_final\_cents (CS phase 2) / duree\_signee\_minutes × 60
nouveau\_cachet\_brut\_final\_cents = taux\_horaire\_implicite × new\_duration\_minutes / 60
delta\_cachet\_cents = nouveau\_cachet\_brut\_final\_cents − cachet\_brut\_final\_cents
delta\_commission\_mr\_cents = floor(delta\_cachet\_cents × taux\_effectif\_snapshot\_ppm / 1\_000\_000)
delta\_talent\_net\_cents = delta\_cachet\_cents − delta\_commission\_mr\_cents

Conditions : Engagement en état `performed` · double consentement talent + organisateur · avant `event_completed` · `newDurationMinutes > originalDurationMinutes` · dans la limite de `EngagementAmendmentPolicyConfig.maxExtensionMinutes`

L'amendment est conforme à WORM-APPEND-01 : il ajoute des écritures ledger (delta), il ne modifie pas les écritures existantes du ContractSnapshot phase 2.

**Objet `EngagementAmendment` champs minimaux :** id, systemId (AMD-), engagementId, amendmentType (`PLAGE_EXTENSION`), originalDurationMinutes, newDurationMinutes, originalCachetBrutFinalCents, newCachetBrutFinalCents, deltaCachetCents, deltaCommissionMrCents, deltaTalentNetCents, talentConsentAt, organizerConsentAt, adminActionId, reasonCode, createdAt \[immuable\]

**Configs concernées :** `EngagementAmendmentPolicyConfig` (maxExtensionMinutes, requireDoubleConsent, allowedFromState)

**Test P0 à créer :** AMENDMENT-01 — taux immuable · double consentement · uniquement depuis `performed` · LOI LEDGER-02 vérifiée après delta


---

**FIN DE LA PARTIE 3 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 4 / 8**

---

## **2\. FOUNDER\_FINGERPRINT\_REGISTER — Export complet**

---

### **Phrases canoniques fondatrices (toutes validées)**

**Loi Zéro :** *"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*

**Identité institutionnelle :** *"Micro Rave est courtier par doctrine. Les flux sont les preuves. Le ledger est le témoin."*

**Architecture :** *"Base44 est la rampe. L'architecture souveraine est la destination. On ne confond pas les deux."* *"Base44 sert à aller vite. L'architecture souveraine sert à durer. Le MVP doit bénéficier de Base44 sans devenir prisonnier de Base44."* *"GitHub trace le code. La database trace la config. Ces deux registres sont distincts et complémentaires."*

**Finance :** *"Le dollar est une unité d'affichage. Le cent est une unité de vérité. Le ppm est une unité de taux."* *"Le net talent n'est pas un deuxième calcul; c'est le reste protégé."* *"Le coefficient augmente les talents. Le taux de chaque talent calcule sa commission. Le vendeur est payé par une policy séparée. Aucun dollar ne doit être compté deux fois."* *"Le résidu peut naître dans le calcul; il doit mourir dans l'écriture ledger."* *"Les taxes ne sont pas un solde approximatif; ce sont des passifs datés, déclarés, payés et réconciliés."* *"Le membership SaaS est encaissé maintenant, mais gagné avec le temps."* *"6591 explique les poussières mathématiques; 6119 explique les surprises du processeur."* *"Le paiement n'est pas encore un revenu gagné; c'est une obligation de service."*

**Ledger :** *"Un concept métier \= une source de vérité."* *"Aucun hardcode financier dans les fonctions."* *"Configuration absente \= erreur bloquante."*

**Scheduler :** *"Le cron réveille; la tâche dit quoi faire."* *"Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement."* *"Le Scheduler fiable ne court pas partout; il se réveille au bon moment, lit ses tâches dues, protège l'argent, bloque quand la preuve manque, laisse une trace, surveille son propre carburant, puis retourne dormir sans gaspiller."*

**Tests et bugs :** *"Un bug corrigé mais non rejoué est un bug qui attend de revenir."* *"Le BLOC 17 ne sert pas à croire que le système marche. Il sert à prouver que le système ne peut pas oublier ses propres erreurs."*

**Disputes :** *"Une dispute n'est pas un bouton rembourser ou payer. C'est une procédure : geler, qualifier, prouver, répondre, décider, régler, mémoriser."* *"Tout le monde peut parler. Seuls les acteurs avec standing peuvent geler. Le ledger n'obéit qu'à une décision valide."* *"Micro Rave ne règle jamais une dispute par intuition. Elle règle par preuve, délai, montant contesté, décision, écriture ledger et archive."* *"Micro Rave ne règle jamais une dispute par proximité sociale. Elle règle par preuve, rôle, indépendance, décision et trace."*

**Admin :** *"Certains pouvoirs ne doivent pas exister, parce que leur existence détruirait la confiance que Micro Rave est censée incarner."* *"SoloFounderOverride est une exception documentée. Ce n'est pas une validation — c'est une exception qui doit rester exceptionnelle."* *"Lire n'est pas modifier. Modifier n'est pas approuver. Approuver n'est pas exécuter. Exporter est un pouvoir distinct."* *"L'exception admin existe, mais elle doit laisser plus de traces que la procédure normale."* *"Celui qui tourne la clé technique ne doit pas forcément être celui qui décide la règle."*

**Sécurité :** *"On efface l'identité; on conserve la preuve."* *"Le BLOC 11 est une doctrine de preuve, accès minimal et journalisation — pas seulement de la cybersécurité."* *"Une sortie théorique n'est pas une stratégie de sortie. Il faut tester qu'on peut vraiment sortir."* *"Chaque employé voit uniquement l'information nécessaire pour accomplir sa tâche, au moment où il en a besoin, et toute consultation d'information sensible doit être justifiée, autorisée et journalisée."*

**SOTS :** *"Le SOTS mesure ce qui a été livré, comment cela a été livré, et à quel point c'était bon; le ReputationLedger garde pourquoi; le seuil de confiance décide quand ce score peut toucher l'argent."* *"Le ReputationLedger garde pourquoi; le snapshot dit combien."* *"Le standing ne vient pas du rôle seul; il vient du lien prouvable entre l'acteur et l'objet contesté."*

**UX :** *"Escrow → interdit dans l'interface. Remplacé par : fonds protégés."* *"Tu paies une fois pour la certitude que ça se passe bien — ou que tu es protégé si ça ne se passe pas bien."* *"Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène."* *"Le checkpoint est comme un listing Airbnb, mais pour la performance événementielle."* *"Un lieu devient ce qu'il accueille."*

**Marketplace :** *"La liquidité ne s'achète pas. Elle se construit talent par talent, checkpoint par checkpoint, event par event, dans un corridor assez dense pour que la réputation se propage naturellement."* *"On ne lance pas une ville; on allume un corridor."* *"Le 4 à 7 finance la preuve. ALL NIGHT LONG prouve la culture. L'hybride prouve Micro Rave."* *"Micro Rave te permet de transformer ton réseau en portefeuille."* *"ResidualCommission \= droit économique conditionnel, durable, renouvelable, gouverné et traçable."* *"Le système peut recommander tôt. Il ne contractualise pas automatiquement tôt."*

**QuickPlay :** *"Le capitaine est un statut de lobby, pas un rôle métier."* *"Le capitaine peut lancer la session si le lobby est prêt; sinon, quand le lobby est complet, le système doit lancer automatiquement."*

**Premier event réel :** *"Un event pilote peut échouer. Il ne doit jamais échouer silencieusement."* *"Le premier événement réel n'est pas un lancement marketing. C'est un examen institutionnel."*

**DecisionKernel :** *"Le DecisionKernel MVP ne doit pas prétendre être un juge parfait. Il doit être un greffier incorruptible."* *"Un événement déclenche une procédure; un DecisionRecord tranche une conséquence."* *"Le payout automatique est réservé aux cas où la preuve est forte, complète, non contestée et ledger-ready."* *"Un hold peut être immédiat; un transfert final d'argent doit respecter la fenêtre prévue par sa policy."*

**Refus fondamentaux :** *"Micro Rave ne deviendra jamais un système où les relations personnelles dictent les relations professionnelles."* *"Micro Rave ne deviendra jamais un marché opaque où les mandats circulent par proximité sociale."* *"Micro Rave ne deviendra jamais un simple annuaire de prestataires."*

---

### **Principes de gouvernance**

* Tout objet métier critique a un systemId portable dès le jour 1  
* Aucune constante financière dans le code — ever  
* Configuration absente \= erreur bloquante, jamais valeur par défaut silencieuse  
* Le token de standing vient du lien prouvable, pas du rôle abstrait  
* Tout accès niveau 3+ → DataAccessLedgerEntry obligatoire  
* Tout blocage financier → PayoutBlockReason avec code explicite. Jamais silencieux  
* Base44 est un adapter. La logique métier est portable  
* DualApprovalThresholdConfig est auto-protégée  
* Un bug n'est corrigé que quand son BugReplayRecord \= PASSED  
* Fiabilité avant notoriété dans le recrutement des talents

---

### **Analogies validées**

* **StarCraft 2** : le capitaine QuickPlay est l'hôte d'une partie custom — premier à créer la salle, statut disparaît au lancement  
* **Airbnb** : le checkpoint est un listing Airbnb pour la performance événementielle  
* **Coffre-fort bancaire** : modèle mental de la confidentialité des données  
* **Jeu vidéo** : "Tu es rendu ici. Voilà ta récompense. Voilà ta prochaine action. Voilà le temps restant."  
* **Partie jouée** : l'archive d'un event \= pièce d'historique consultable comme une partie jouée  
* **Assurance/gestion de patrimoine** : le vendeur bâtit un livre d'affaires comme un conseiller autonome

---

### **Corrections ontologiques fondatrices**

**Correction 1 — Prix accepté :** LOI-GR-01 originale (cachet net garanti, commission ajoutée par-dessus) rejetée. Remplacée par modèle brut transparent (commission prélevée sur le cachet brut). D-004.

**Correction 2 — Capitaine QuickPlay :** "Talent hybride capitaine" retiré de la composition des 20 premiers talents. Le capitaine est un statut temporaire de lobby — n'importe quel talent admissible peut l'être selon l'ordre d'arrivée. D-120-A.

**Correction 3 — Surplus commercial / double comptage :** Le surplus commercial (coefficient − 1\) ne doit pas être compté une seconde fois comme base vendeur. Il est déjà absorbé dans le rehaussement des cachets talents. Base vendeur par défaut \= commission\_MR\_totale × seller\_rate. D-049.

**Correction 4 — Triptyque marketplace :** La vision "talent ↔ organisateur" est incomplète. La marketplace correcte est "talent ↔ organisateur/payeur ↔ checkpoint". Le checkpoint est la troisième partie active. D-091.

---

### **Standard numérique canonique**

MONEY \= cents / RATE \= ppm / RATIO \= n/d / SCORE \= units / DISPLAY \= derived

---

### **Matrice d'arrondi**

| Calcul | Règle |
| ----- | ----- |
| Commission MR par talent | floor |
| Net talent | brut\_final − commission\_floorée |
| Taxes TPS/TVQ | round sur base postée/facturée |
| Frais Stripe refacturés | ceil |
| Frais Stripe absorbés | charge selon flux |
| Seller commission | floor \+ cap |
| Coefficient de vente | allocation largest remainder |
| Ajustements d'arrondi | 6591 \+ RoundingReconciliationRecord |

---

## **3\. ASSUMPTION\_REGISTER\_V3 — Export complet**

---

| \# | Statut | Bloc | Formulation | Résolution |
| ----- | ----- | ----- | ----- | ----- |
| A-001 | RÉSOLU → D-011 | BLOC 1 | L'Engagement est l'objet atomique central | Validé avec ajout Pivot de Marché |
| A-002 | RÉSOLU → D-127 | BLOC 1 | Base44 conservé pour MVP | Validé comme rampe |
| A-003 | RÉSOLU → D-026, D-080 | BLOC 1 | SOTS module la commission au MVP | Actif dès MVP, score défaut 3/5 |
| A-004 | RÉSOLU → D-042 | BLOC 1 | Dépôt 20% / balance 80% | Ratio en database, configurable |
| A-005 | RÉSOLU → D-022 | BLOC 1 | ResidualCommission — règles de durée | 36 mois renouvelables |
| A-006 | DO\_NOT\_BUILD\_YET | BLOC 1 | PortfolioTransfer — conditions exactes | Légal non validé — post V3.3 |
| A-007 | RÉSOLU → D-008 | BLOC 1 | Hiérarchie rôles cellule 9 niveaux | Architecture database-driven validée |
| A-008 | RÉSOLU → D-032 | BLOC 1 | Stripe 2,9% \+ 0,30$ | En database, configurable |
| A-009 | RÉSOLU → D-059 | BLOC 1 | TPS 5%, TVQ 9,975% | En database via TaxConfig |
| A-010 | RÉSOLU → D-027 | BLOC 1 | Freemium \= taux non défini | En database via MembershipPlan |
| A-011 | RÉSOLU → D-017 | BLOC 1 | Lieu privé/résidentiel sans Checkpoint | Checkpoint ad hoc statut private |
| A-012 | RÉSOLU → D-018, D-105 | BLOC 1 | CELL\_MANAGER voit events SECRET? | Non — jamais automatiquement |
| A-013 | RÉSOLU → D-023 | BLOC 1 | Réseau PRIVÉ \= following mutuel ou unilatéral? | Following mutuel uniquement |
| A-014 | RÉSOLU → D-093 | BLOC 1 | SOTS sur event SECRET dans résidence? | PresenceProofResolver adapté |
| A-015 | RÉSOLU → D-022 | BLOC 1 | Durée ClientAttributionRight | 36 mois renouvelables |
| A-016 | RÉSOLU → D-022 | BLOC 1 | Transactions admissibles ResidualCommission | Events/Engagements payants, SaaS exclu MVP |
| A-017 | RÉSOLU → D-013 | BLOC 1 | Seuil cancellations déraisonnables talent | \< 72h \= délai déraisonnable |
| A-018 | RÉSOLU → D-023 | BLOC 1 | Réseau organisateur pour PRIVÉ | Following mutuel uniquement |
| A-019 | RÉSOLU → D-018, D-095 | BLOC 1 | Format journal d'accès events SECRET | DataAccessLedgerEntry obligatoire |
| A-020 | RÉSOLU → D-017 | BLOC 1 | Niveau de zoom exact ≥ 10 | Rue/quartier, jamais résidence |
| A-021 | RÉSOLU → D-022 | BLOC 1 | Fenêtre de rachat "récente" | Définie dans ClientAttributionRight policy |
| A-022 | DO\_NOT\_BUILD\_YET | BLOC 1 | Tarification yield QuickPlay | V3.1 |
| A-023 | RÉSOLU → D-022 | BLOC 1 | Attribution concurrente validée | Condition de non-renouvellement |
| A-024 | RÉSOLU → D-022, D-105 | BLOC 1 | Conditions révocation ClientAttributionRight | Admin \+ AdminAction |
| A-025 | RÉSOLU → D-080 | BLOC 9 | Multiplicateur SOTS exact 3/5 par défaut | Structure en database, valeurs saisies en config |
| A-026 | RÉSOLU → D-022 | BLOC 1 | Fenêtre rachat renouvellement | Définie dans SellerPortfolio policy |
| A-027 | RÉSOLU → D-049 | BLOC 3 | Base commission MR avec majoration | LOI WATERFALL-01 — cachet\_brut\_final par talent |
| A-028 | RÉSOLU → D-032 | BLOC 3 | Taux Stripe exact | En database PaymentProviderConfig |
| A-029 | RÉSOLU → D-030 | BLOC 3 | Poids lineup talent 0$ | Convention 1$ symbolique |
| A-030 | RÉSOLU → D-034 | BLOC 3 | Prix vendu \< lineup signé | LINEUP\_PRICE\_FLOOR\_VIOLATION — blocage EPR |
| A-031 | RÉSOLU → D-036 | BLOC 3 | seller\_rate\_base et seller\_rate\_surplus | Un seul taux, base combinée |
| A-032 | RÉSOLU → D-035 | BLOC 3 | ContractSnapshot phases | Deux phases : accepted et event\_sealed |
| A-033 | RÉSOLU → D-037 | BLOC 3 | Absorption écarts d'arrondi | Compte 6591, réconciliation mensuelle |
| A-034 | RÉSOLU → D-042 | BLOC 4 | Ratio dépôt exact | Database configurable |
| A-035 | RÉSOLU → D-043 | BLOC 4 | Commission MR sur SC-06 avant event\_sealed | Cachets signés, coefficient \= 1 |
| A-036 | RÉSOLU → D-044 | BLOC 4 | No-show partiel multi-talents | Engagements traités indépendamment |
| A-037 | RÉSOLU → D-082 | BLOC 9 | Fenêtre "post-plage" pour incident | SOTSContestPolicyConfig |
| A-038 | RÉSOLU → D-047 | BLOC 4 | Qui peut ouvrir DisputeRecord | Matrice complète D-047 |
| A-039 | RÉSOLU → D-045 | BLOC 4 | Preuve suffisante EvidenceBundle | Matrice de preuve validée |
| A-040 | RÉSOLU → D-046 | BLOC 4 | Frais non remboursables post-dispute | Via DisputeAccessPolicyConfig si explicite |
| A-041 | RÉSOLU → D-074 | BLOC 8 | Définition exacte "standing légitime" | Filtre statique \+ vérification dynamique |
| A-042 | RÉSOLU → D-045 | BLOC 8 | Scope defaultFreezeScope | Défini dans DisputeAccessPolicyConfig |
| A-043 | RÉSOLU → D-073 | BLOC 8 | Qui peut être délégué sur place | Rôles automatiques \+ désignation explicite |
| A-044 | RÉSOLU → D-036 | BLOC 3 | Plafond maxSellerCommissionRatio | Dans SellerCommissionPolicy |
| A-045 | RÉSOLU → D-049 | BLOC 4 | Moment calcul seller commission | À l'archivage event |
| A-046 | OUVERTE | BLOC 4 | Politique lifetime membership | Politique séparée à définir |
| A-047 | RÉSOLU → D-100 | BLOC 12 | Fréquence reconnaissance périodique | saas\_revenue\_recognition\_daily (P1) |
| A-048 | RÉSOLU → D-056 | BLOC 5 | taxCollectionMode modes exacts | 4 modes définis D-056 |
| A-049 | RÉSOLU → D-053 | BLOC 5 | Seuil T4A | AnnualTalentPaymentSummary dès MVP |
| A-050 | RÉSOLU → D-035 | BLOC 3 | InvoiceTreatmentSnapshot | ContractSnapshot phase 2 |
| A-051 | RÉSOLU → D-058 | BLOC 5 | Plafond coefficient | CoefficientSalePolicyConfig |
| A-052 | RÉSOLU → D-051 | BLOC 5 | RevenueStreamLegalRoleSnapshot | Validé D-051 |
| A-053 | OUVERTE | BLOC 5 | Critères exacts classification EventRiskPolicyConfig | Seuils numériques à définir |
| A-054 | RÉSOLU → D-060 | BLOC 6 | Compte taxes talent en transit | 4325/4326 |
| A-055 | RÉSOLU → D-059 | BLOC 5 | filingFrequency par défaut | Dans TaxRemittanceRecord, selon volume MR |
| A-056 | OUVERTE | BLOC 8 | maxDistancePolicy GPS exact | À définir en PresencePolicyConfig |
| A-057 | OUVERTE | BLOC 8 | minDurationPolicy exact | À définir en PresencePolicyConfig |
| A-058 | RÉSOLU → D-075 | BLOC 8 | SOTS absent \+ délai expiré | Condition 7 : SOTS requis pour payout auto |
| A-059 | OUVERTE | BLOC 9 | Fréquence recalcul SOTSScoreSnapshot | À définir en SOTSCalculationPolicyConfig |
| A-060 | OUVERTE | BLOC 9 | Talent voit ses propres dimensions SOTS? | À décider en UX V3.0.1 |
| A-061 | RÉSOLU → D-072 | BLOC 8 | No-show impact ReputationLedger | NO\_SHOW\_CONFIRMED → DecisionRecord |
| A-062 | OUVERTE | BLOC 11 | Durée rétention "vendeurs actifs" selon ARC/RQ | Réévaluation post-consultation RQ |

---

## **4\. CONTRADICTION\_REGISTER\_V3 — Export complet**

---

| \# | Contradiction | Source | Résolution | Décision liée |
| ----- | ----- | ----- | ----- | ----- |
| CT-001 | LOI-GR-01 originale (net garanti) vs modèle brut transparent | Documents RÉFLEXION 05 vs Q004 | LOI-GR-01 rejetée. Remplacée par D-004 | D-004 |
| CT-002 | Objets vendeur (ClientActivation, ResidualCommission) absents des documents RÉFLEXION | Documents RÉFLEXION 01-05 vs Q006 | Couche économique vendeur créée dans D-015, D-022 | D-015, D-022 |
| CT-003 | Machine d'état RÉFLEXION 03-04 manquait EVENT\_SEALED et 6 moments WORM | Documents RÉFLEXION vs D-014 | Machine d'état entièrement réécrite D-019 | D-019 |
| CT-004 | Domaines comme taxonomie quasi-fixe vs Pivot de Marché database-driven | Documents RÉFLEXION 02 vs D-011 | Domaines \= lignes de database, zéro constante code | D-011 |
| CT-005 | "Majoration vendeur" hors MVP (RÉFLEXION 05 §6.3) vs coefficient de vente actif MVP | RÉFLEXION 05 vs BLOCs 3-4 | Majoration vendeur deprecated. Remplacée par coefficient \+ LOI LINEUP-01 | D-028, D-052 |
| CT-006 | Commission MR calculée sur cachet \+ majoration (exemple D-025) vs commission sur cachet uniquement (D-004) | D-025 exemple 2 vs D-004 | LOI WATERFALL-01 : commission calculée talent par talent sur cachet\_brut\_final après coefficient | D-049 |
| CT-007 | ContractSnapshot WORM à accepted vs montants finaux connus seulement à event\_sealed | D-014 vs D-035 | ContractSnapshot deux phases : estimation à accepted, finalisation à event\_sealed | D-035 |
| CT-008 | surplus\_commercial compté dans base vendeur alors qu'il était déjà absorbé dans coefficient | D-031 vs calcul waterfall | Correction D-049 : base vendeur \= commission\_MR\_totale × seller\_rate uniquement | D-049 |
| CT-009 | D-031 LOI SELLER-01 vs D-049 LOI SELLER-01 révisée | D-031 vs D-049 | D-031 remplacé par D-049. LOI SELLER-01 \= seller\_commission \= commission\_MR\_totale × seller\_rate | D-049 |
| CT-010 | balance\_pending comme état WORM W1 dans code/OS V11 sans décision D-0XX | OS V11 changelog vs D-014 | D-014-A — balance\_pending retiré de WORM\_STATES. D-014 reste à 6 moments officiels. | D-014-A |
| CT-011 | payable comme état WORM W1 dans code sans décision D-0XX | Code commentaire "protection pragmatique" vs D-014 | D-014-B — payable défini souverainement comme non-WORM, protégé par D-101. | D-014-B |
| CT-012 | Q3 (litige universel) vs D-045 (24h après event\_completed) — deadlock structurel | OS V12 Q3 vs D-045 REG | D-019-B — deux régimes distincts : Frein d'Urgence (pre-event) et Contestation de Prestation (post-SOTS). D-045 §fenêtre abrogé. | D-019-B |
| CT-013 | D-019 original conservait balance\_pending et ancienne fenêtre dispute | D-014-A vs D-019 | D-019-A remplace D-019 intégralement. Machine d'état V4 sans balance\_pending, avec contestation\_window. | D-019-A |
| CT-014 | LOI NO-SHOW-01 ne précisait pas la base de calcul du remboursement quand coefficient > 1 | D-041 + D-044 + D-049 vs ambiguïté ZA-07 audit 19/05 | CT-014 — Base = ContractSnapshot phase 2 (cachet\_brut\_final\_i, WORM W2). Le remboursement organisateur = cachet\_net\_final\_i = cachet\_brut\_final\_i − commission\_MR\_i. Le coefficient est déjà gravé — il s'applique. ZA-07 fermé. | D-041, D-044, D-147 |

**Correction ontologique fondatrice (hors numérotation CT) :** *Event → Lineup ← Engagements* (pas "Event va dans Lineup"). Event possède Lineup. Lineup reçoit Engagements. MissionSlot exprime besoin. MissionApplication mène à Engagement.

---

**FIN DE LA PARTIE 4 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 5 / 8**

---

## **5\. DO\_NOT\_BUILD\_YET\_REGISTER — Export complet**

---

| Objet / Feature | Raison du report | Version cible | Conditions d'activation |
| ----- | ----- | ----- | ----- |
| PortfolioTransfer | Légal non validé — droits transférables non définis | Post V3.3 | Validation légale formelle |
| PortfolioValuation formelle | Nécessite données de portefeuille matures (min. 50 clients activés) | Post V3.3 | — |
| Pivot de Marché (activation réelle) | Architecture doit le rendre possible, pas l'activer | Post V3 | Architecture database-driven complète |
| Circuit physique Micro Rave | Vision long terme, avant V3.3 impossib. | V3.3 | Cellules opérationnelles |
| Commandites complètes | Architecture prête, flux distincts validés | V3.3 | SponsorshipContract architecture |
| Cellules-succursales opérationnelles | Architecture prête | V3.2 | CELL\_MANAGER actif |
| CELL\_MANAGER actif | Architecture prête, rôle post-MVP | V3.2 | Cellules ayant atteint seuil GrowthPolicyConfig |
| Dashboard Checkpoint complet | Architecture prête | V3.2 | Données culturelles matures |
| TicketAdmissionRight — implémentation complète | Architecture prête, mince MVP | V3.2 (complète) | MVP : mince à 0$ |
| SponsorshipContract — implémentation complète | Architecture prête | V3.3 | — |
| Billetterie complète | MVP billetterie mince uniquement | V3.0.1 | Après Event 1 et 2 validés |
| Anglais i18n | MVP français uniquement, architecture i18n prête | V3.0.1 | Fichier EN à ajouter |
| TalentTaxProfile UI complète | Données collectées MVP, UI post-MVP | V3.0.1 | Après validation fiscale |
| T4A émission automatique | Validation fiscale requise | V3.0.1 post-validation | Avis comptable |
| MR\_REMIT\_BY\_ELECTION (taxCollectionMode) | Validation légale/fiscale requise | V3.0.1+ | Entente formelle |
| Seller-led complet sans conditions | Conditions strictes MVP (D-116) | V3.1 | 10 cas analysés |
| SellerCommissionPolicy complète | Architecture prête | V3.1 | — |
| ClientAttributionRight UI | Architecture prête | V3.1 | — |
| ResidualCommission active | Architecture prête | V3.1 | — |
| OfficialEventContent | — | V3.1 | — |
| Disputes automatisées | Nécessite 10 cas réels analysés | V3.1 | 10 cas analysés (D-071) |
| Matching automatique | Manual-first jusqu'à 50 events | V3.1 (phase 4 liquidité) | 30-50 events (LiquidityPolicyConfig) |
| Arbitre tiers externe | Architecture prête, appel si DisputePolicyConfig prévoit | V3.1 | — |
| Tarification yield dynamique QuickPlay | Architecture prête | V3.1 | — |
| Matching algorithmique avancé | — | V3.1 | — |
| RSI comme mécanique utilisateur centrale | Interne MVP, observé | V3.1+ (50+ events) | LiquidityPolicyConfig seuil |
| PortfolioTransfer (V3.2) | Version intermédiaire avant légal | V3.2+ | — |

---

## **6\. POLICYCONFIG\_REGISTER — Export complet**

---

| Nom | Niveau | Rôle autorisé à modifier | Double validation | Trace requise | Décision liée | Statut MVP |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| TaxConfig | CRITIQUE | FOUNDER \+ FINANCE\_ADMIN | Oui | AdminAction \+ DataAccessLedger \+ PolicyConfigChangeRecord | D-059 | MVP |
| LedgerCodeMap | CRITIQUE | FOUNDER uniquement | Oui | AdminAction \+ DataAccessLedger \+ PolicyConfigChangeRecord | D-060 | MVP |
| MembershipPlan | CRITIQUE | FOUNDER \+ FINANCE\_ADMIN | Oui | idem | D-027 | MVP |
| SOTSCommissionModulationConfig | CRITIQUE | FOUNDER \+ FINANCE\_ADMIN | Oui | idem | D-080 | MVP |
| DataRetentionPolicyConfig | CRITIQUE | FOUNDER \+ PRIVACY\_SECURITY\_ADMIN | Oui | idem | D-096 | MVP |
| MigrationTriggerPolicyConfig | CRITIQUE | FOUNDER \+ PLATFORM\_ADMIN | Oui | idem | D-130 | MVP |
| SecretsRotationPolicyConfig | CRITIQUE | PRIVACY\_SECURITY\_ADMIN \+ FOUNDER | Oui | idem | D-109 | MVP |
| DualApprovalThresholdConfig | CRITIQUE (auto-protégée) | FOUNDER \+ second admin | Oui | idem | D-106, D-108 | MVP |
| PresencePolicyConfig | ÉLEVÉ | FOUNDER \+ OPS\_ADMIN | Non | AdminAction \+ DataAccessLedger \+ AdminIncidentRecord | D-093 | MVP |
| DisputeAccessPolicyConfig | ÉLEVÉ | FOUNDER \+ OPS\_ADMIN | Non | idem | D-047 | MVP |
| KYCPolicyConfig | ÉLEVÉ | FOUNDER \+ OPS\_ADMIN | Non | idem | D-097 | MVP |
| CronBudgetPolicyConfig | ÉLEVÉ | FOUNDER \+ OPS\_ADMIN | Non | idem | D-104 | MVP |
| PaymentProviderConfig | ÉLEVÉ | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-032 | MVP |
| GrowthPolicyConfig | ÉLEVÉ | FOUNDER \+ OPS\_ADMIN | Non | idem | D-105 | MVP |
| CoefficientSalePolicyConfig | ÉLEVÉ | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-058 | MVP |
| SellerCommissionPolicy | ÉLEVÉ | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-036 | MVP (si seller-led activé) |
| FraudDetectionPolicyConfig | STANDARD | FOUNDER \+ PRIVACY\_SECURITY\_ADMIN | Non | AdminAction \+ DataAccessLedger | D-098 | MVP |
| SOTSConfidencePolicyConfig | STANDARD | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-083 | MVP |
| DelegatePolicyConfig | STANDARD | FOUNDER \+ OPS\_ADMIN | Non | idem | D-073 | MVP |
| EventRiskPolicyConfig | STANDARD | FOUNDER \+ OPS\_ADMIN | Non | idem | D-057 | MVP |
| EventPaymentConfig | STANDARD | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-042 | MVP |
| DisputePolicyConfig | STANDARD | FOUNDER \+ DISPUTE\_ADMIN | Non | idem | D-045 | MVP |
| LiquidityPolicyConfig | STANDARD | FOUNDER \+ OPS\_ADMIN | Non | idem | D-124, D-125 | MVP |
| SchedulerCreditBudget | OPÉRATIONNEL | FOUNDER \+ OPS\_ADMIN | Non | AdminAction \+ log | D-104 | MVP |
| SpoofingDetectionPolicyConfig | OPÉRATIONNEL | FOUNDER \+ PRIVACY\_SECURITY\_ADMIN | Non | idem | D-093 | MVP |
| SOTSCalculationPolicyConfig | OPÉRATIONNEL | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-081 | MVP |
| RoundingPolicyConfig | STANDARD | FOUNDER \+ FINANCE\_ADMIN | Non | AdminAction \+ DataAccessLedger | D-063 | MVP |
| SOTSDimensionConfig | STANDARD | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-079 | MVP |
| SOTSFraudDetectionPolicyConfig | STANDARD | FOUNDER \+ PRIVACY\_SECURITY\_ADMIN | Non | idem | D-094 | MVP |
| SOTSContestPolicyConfig | STANDARD | FOUNDER \+ DISPUTE\_ADMIN | Non | idem | D-082 | MVP |
| DataAccessAuditRoleConfig | ÉLEVÉ | FOUNDER \+ PRIVACY\_SECURITY\_ADMIN | Non | AdminAction \+ DataAccessLedger \+ AdminIncidentRecord | D-105 | MVP |
| RevenueRecognitionPolicyConfig | STANDARD | FOUNDER \+ FINANCE\_ADMIN | Non | AdminAction \+ DataAccessLedger | D-050 | MVP |
| SubscriptionRefundPolicyConfig | STANDARD | FOUNDER \+ FINANCE\_ADMIN | Non | idem | D-050 | MVP |
| DecisionAppealPolicyConfig | STANDARD | FOUNDER \+ DISPUTE\_ADMIN | Non | idem | D-076 | MVP |

---

## **7\. OBJECT\_REGISTRY — Export complet**

---

*(Sélection des objets canoniques les plus critiques — liste non exhaustive)*

| Objet | Définition | Rôle | Champs minimaux | Décision liée | MVP |
| ----- | ----- | ----- | ----- | ----- | ----- |
| Event | Contexte d'un événement | Container principal | id, systemId, organizerUserId, payerUserId, visibility (SECRET/PRIVÉ/PUBLIC), status, checkpointId ou eventLocationId | D-016, D-091 | MVP |
| Lineup | Agrégat des Engagements d'un Event | Réconciliation budgétaire | id, eventId, status, total\_signed\_cents, coefficient\_de\_vente, transactionGroupId | D-016, D-049 | MVP |
| MissionSlot | Besoin exprimé par l'organisateur | Définir un rôle à remplir | id, eventId, roleMetier, plageHoraire, statut | D-113 | MVP |
| MissionApplication | Candidature d'un talent à un MissionSlot | Lier talent et slot | id, slotId, talentId, proposalId, status | D-113 | MVP |
| MissionProposal | Proposition de prix et conditions | Négociation | id, applicationId, priceCents, conditions, round, status | D-113 | MVP |
| Engagement | Objet atomique central | Fil rouge de tout le cycle | id, systemId, eventId, lineupId, talentId, roleMetier, plageHoraire, signed\_price\_cents, final\_price\_cents, status, contractSnapshotId | D-011, D-019 | MVP |
| EngagementCollectif | Noyau indivisible QuickPlay | Lot d'Engagements | id, lobbyId, eventId, members\[\], totalPriceCents, status | D-021, D-114 | MVP |
| ContractSnapshot | Document immuable de l'accord | WORM financier | id, engagementId, phase (1/2), signed\_price\_cents, talent\_platform\_commission\_rate\_snapshot, sots\_snapshot, membership\_tier\_snapshot, commission\_estimated\_cents, \[phase 2 : coefficient, final\_price\_cents, commission\_final\_cents, tax\_snapshot, stripe\_fee\_snapshot\] | D-035 | MVP |
| EventPaymentRequest | Demande de paiement | Instrument financier | id, eventId, payerUserId, organizerUserId, type (dépôt/balance), gross\_amount\_cents, status, stripePaymentIntentId | D-048 | MVP |
| FinancialLedger | Registre comptable append-only | Source de vérité financière | id, transactionGroupId, accountCode, debitCents, creditCents, description, createdAt, \[immuable\] | D-038, D-060 | MVP |
| SettlementInstruction | Instruction de règlement | Déclencheur de payout | id, engagementId, decisionRecordId, allocatedCents, consumedAt, status | D-047, D-101 | MVP |
| PayoutExecutionRecord | Preuve d'exécution du payout | Verrou anti-double | id, engagementId, executedAt, stripeTransferId, amountCents, status | D-101 | MVP |
| PayoutBlockReason | Code de blocage de payout | Traçabilité institutionnelle | id, engagementId, reasonCode, createdAt, resolvedAt | D-101 | MVP |
| DecisionRecord | Décision institutionnelle | Pièce maîtresse du règlement | id, type (voir D-072), engagementId, actorRole, standingLevel, evidence\[\], deliveryRecognizedRatio, createdAt | D-071, D-072 | MVP |
| DisputeRecord | Procédure de litige | Gel financier \+ preuve | id, actorRole, standingLevel, targetObjectType, targetObjectId, disputeType, amountDisputedCents, policyId, reasonCode, status, timeWindowPolicyId | D-047 | MVP |
| EvidenceBundle | Preuves rassemblées | Support du DecisionRecord | id, disputeRecordId, evidences\[\], submittedBy, submittedAt | D-047 | MVP |
| ReputationLedger | Registre réputationnel append-only | Source de vérité SOTS | id, engagementId, authorUserId, targetUserId, dimensions\[\], score\_units, status (ACTIVE/QUARANTINED), createdAt, \[immuable\] | D-077, D-082 | MVP |
| SOTSScoreSnapshot | Projection calculée du score SOTS | Performance cache | id, userId, score\_units, calculatedAt, submissionsCount, confidenceLevel | D-077, D-083 | MVP |
| SOTSSubmission | Soumission individuelle SOTS | Entrée ReputationLedger | id, engagementId, submittedBy, role, dimensions{}, overall\_score\_units, status, eventId | D-078, D-079 | MVP |
| TicketAdmissionRight | Droit d'accès à un event | Garde-fou SOTS audience | id, eventId, userId, priceCents (0 si gratuit), status | D-054, D-115 | MVP |
| AudienceCheckIn | Présence audience validée | Condition SOTS audience | id, ticketAdmissionRightId, userId, eventId, checkedInAt, signalType | D-054, D-093 | MVP |
| SessionPresence | Présence talent validée | Condition payout | id, engagementId, checkedInAt, gpsCoordinates, distanceMeters, signalTypes\[\], gpsStatus, duration, validatedBy | D-093 | MVP |
| PresenceProofResolver | Résolveur de présence | Calcul faisceau d'indices | (logique, pas objet de données) — produit SessionPresence.resolved | D-093, D-093-A | MVP |
| Checkpoint | Lieu reconnu dans l'écosystème | Troisième côté marketplace | id, systemId, ownerId, name, geoCoordinates, type, culturalProfile, capacity, status, calendarId | D-091, D-092 | MVP |
| EventLocation | Lieu d'un event sans Checkpoint | Contexte physique | id, eventId, address, geoCoordinates, isPrivate, isVirtual | D-017, D-091 | MVP |
| CheckpointCulturalProfile | Identité culturelle comportementale | EMA des events hébergés | id, checkpointId, domainRanking\[\], emaAlpha, lastCalculatedAt | D-092 | MVP |
| SchedulerDueTask | Tâche planifiée | Système nerveux autonome | id, jobKey, dueAt, status, lockedByRunId, sourceEventType, sourceEventId, policyId, attemptCount | D-099 | MVP |
| SchedulerRun | Exécution du dispatcher | Log de cron | id, startedAt, completedAt, tasksProcessed, status, \[immuable une fois complété\] | D-099 | MVP |
| SchedulerIncidentRecord | Incident Scheduler | Alerte opérationnelle | id, incidentType (HEARTBEAT\_MISSING/DUE\_TASK\_OVERDUE), schedulerRunId, detectedAt, severity | D-099 | MVP |
| AdminAction | Action admin loggée | Traçabilité institutionnelle | id, actorUserId, actionType, targetObjectType, targetObjectId, reasonCode, policyId, createdAt, \[immuable\] | D-107, D-108 | MVP |
| AdminIncidentRecord | Incident admin | Alerte \+ trace | id, incidentType, actorUserId, targetObjectId, severity, createdAt, resolvedAt, \[immuable\] | D-071, D-103 | MVP |
| DataAccessLedgerEntry | Log d'accès aux données sensibles | Coffre-fort bancaire | id, actorUserId, actorRole, targetObjectType, targetObjectId, accessType, justification, createdAt, \[immuable\] | D-018, D-095 | MVP |
| PolicyConfigChangeRecord | Log de modification PolicyConfig | Gouvernance config | id, configName, previousVersion, newVersion, reasonCode, changedBy, approvedBy, effectiveFrom, effectiveTo, createdAt | D-108 | MVP |
| ConflictOfInterestRecord | Déclaration de conflit d'intérêt | Arbitrage indépendant | id, disputeRecordId, adminUserId, conflictType, declaredAt, recusalRequired, replacementAdminId, reasonCode | D-110 | MVP |
| BugReplayRecord | Trace de bug \+ replay | Mémoire institutionnelle | id, sourceIncidentId, bugCategory, affectedObjectType, affectedObjectId, reproductionSteps, inputState, expectedOutputState, actualOutputState, fixedAt, replayTestId, replayStatus (PENDING/RUNNING/PASSED/FAILED), replayValidatedAt, replayValidatedBy | D-137 | MVP |
| GoNoGoDecisionRecord | Décision de lancement | Seuil de readiness | id, eventReference, decision (GO/GO\_WITH\_RESERVES/NO\_GO), decisionBy, decisionAt, conditions\[\], blockers\[\] | D-117, D-144 | MVP |
| MoneyMovementRouter | Routeur de flux financiers | Rail financier invariant | (logique) — 6 rails : COLLECT, HOLD, DISTRIBUTE, REFUND, TRANSFER, RECONCILE | D-049 | MVP |
| MissionConversionGuard | Garde-fou de conversion | Pas d'Engagement sans acceptation | (logique) — vérifie MissionProposal.status \= accepted avant création Engagement | D-127 | MVP |
| IDFactory | Générateur de systemId | Identité portable souveraine | (logique) — préfixes par type d'objet, immuables, jamais Base44 id | D-127 | MVP |
| TalentTaxProfile | Profil fiscal du talent | Conformité fiscale | id, userId, legalName, businessNumber, gstNumber, qstNumber, isGstRegistered, isQstRegistered, taxEffectiveFrom, taxEffectiveTo, taxValidationStatus, taxCollectionMode | D-053 | MVP (données) |
| AnnualTalentPaymentSummary | Résumé annuel des paiements talent | Obligations fiscales | id, userId, year, grossCachets, commissionsPrelevees, payoutsNets, refunds, reversals | D-053 | MVP |
| TaxRemittanceRecord | Remise fiscale TPS/TVQ | Conformité fiscale | id, periodStart, periodEnd, filingFrequency, gstCollectedCents, qstCollectedCents, netGstPayableCents, netQstPayableCents, status, filedAt, paidAt, proofAttachmentId | D-059 | MVP |
| WebhookProcessedLog | Log idempotency webhook | Anti-double traitement | id, webhookId, stripeEventType, processedAt, status | D-097 | MVP |
| RoundingReconciliationRecord | Trace d'arrondi | Loupe sur les cents | id, transactionGroupId, adjustmentCents, month, reconciledAt | D-070 | MVP |
| PaymentFeeVarianceRecord | Trace d'écart frais Stripe | Compte 6119 | id, transactionGroupId, estimatedFeeCents, actualFeeCents, varianceCents, createdAt | D-060-A | MVP |
| ManualJobRunRequest | Demande de relance manuelle | Admin Scheduler | id, adminUserId, targetJobKey, reasonCode, policyId, adminActionId, createdAt, status | D-099, D-102 | MVP |
| LedgerImbalanceRecord | Trace d'imbalance ledger | Diagnostic | id, transactionGroupId, detectedAt, drTotal, crTotal, variance, status, resolvedAt | D-103 | MVP |
| SchedulerCreditBudget | Suivi mensuel des crédits cron | Santé opérationnelle | id, month, creditsConsumed, alertsTriggered, degradationsApplied | D-104 | MVP |
| DataSubjectRequestRecord | Demande d'accès/effacement | Loi 25 | id, userId, requestType, receivedAt, resolvedAt, decisionSummary | D-096 | MVP |
| ConflictOfInterestRecord | Conflit d'intérêt arbitre | Indépendance dispute | id, disputeRecordId, adminUserId, conflictType, declaredAt, recusalRequired, replacementAdminId | D-110 | MVP |
| EngagementAmendment | Extension de plage horaire d'un Engagement en état performed | Amendment post-scellement avec consentement | id, systemId (AMD-), engagementId, amendmentType, originalDurationMinutes, newDurationMinutes, originalCachetBrutFinalCents, newCachetBrutFinalCents, deltaCachetCents, deltaCommissionMrCents, deltaTalentNetCents, talentConsentAt, organizerConsentAt, adminActionId, reasonCode, createdAt | D-147 | MVP |

---

**FIN DE LA PARTIE 5 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 6 / 8**

---

## **8\. TEST\_REGISTRY — Export complet**

---

### **Catégorie 1 — Frontières ontologiques critiques**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| CHECKIN-01 | Global | Toujours | 0A | D-054, D-115 | Check-in sans TicketAdmissionRight rejeté |
| MISSION-01 | Global | Toujours | 0A | D-127 | MissionConversionGuard — pas d'Engagement sans acceptation |
| LOBBY-01 | Global | Si QuickPlay | 2 | D-021, D-114 | Lobby unique à stades multiples — fragmentation impossible |
| QUICKPLAY-CAPTAIN-01 | Global | Si QuickPlay | 2 | D-120-A | Premier arrivé dans le lobby \= captain |
| QUICKPLAY-CAPTAIN-02 | Global | Si QuickPlay | 2 | D-120-A | captain \= lobbyStatus, jamais roleMetier |
| QUICKPLAY-CAPTAIN-03 | Global | Si QuickPlay | 2 | D-120-A | Aucun MissionSlot / Engagement "capitaine" |
| QUICKPLAY-AUTO-01 | Global | Si QuickPlay | 2 | D-120-A | Auto-lancement si lineup complet \+ critères remplis |
| RAIL-01 | Global | Toujours | 0A | D-049 | MoneyMovementRouter obligatoire — tout mouvement sans rail rejeté |
| PRESENCE-01 | Global | Toujours | 1 | D-093 | PresenceProofResolver — faisceau requis |
| CONFIG-01 | Global | Toujours | 0A | D-027, D-063 | CriticalConfig fail-closed — config manquante \= blocage |
| UX-01 | Global | Toujours | 1 | D-084 | UXTruthProjection — état affiché \= état métier prouvé |
| PRIV-01 | Global | Toujours | 0A | D-017, D-018 | PresencePrivacyGate — agrégat seulement |

---

### **Catégorie 2 — Finance et ledger**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| LEDGER-INV-01 | Global | Toujours | 0B | D-069 | Invariant LEDGER-02 — zéro cent d'écart |
| DOUBLE-PAY-01 | Global | Toujours | 0B | D-101 | Double tentative simultanée bloquée |
| DOUBLE-PAY-02 | Global | Toujours | 0B | D-101 | Double tentative séquentielle bloquée |
| PAYOUT-BLOCK-\* | Global | Toujours | 1 | D-101 | Tous les PayoutBlockReason testés |
| PAYOUT-BLOCK-LEDGER | Global | Toujours | 1 | D-101, D-103 | Ledger imbalance bloque payout |
| ROUNDING-01 | Global | Toujours | 0A | D-061-D-068 | Arrondis en cents entiers, ppm |
| NO-HARDCODE-FINANCE-01 | Global | Toujours | 0A | D-061 | Aucune config financière hardcodée |

---

### **Catégorie 3 — Stripe et webhooks**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| WEBHOOK-SIG-02 | Global | Toujours | 0B | D-097 | Signature invalide rejetée, aucun effet |
| WEBHOOK-IDEM-01 | Global | Toujours | 0B | D-097 | Idempotency — même webhookId traité une seule fois |
| WEBHOOK-RAWBODY-01 | Global | Toujours | 0B | D-129 | Base44 transmet le raw body pour validation signature |
| PAYOUT-BLOCK-KYC | Global | Toujours | 1 | D-097 | KYC incomplet bloque payout |
| WEBHOOK-PROXY-01 | Conditionnel | Si Base44 échoue RAWBODY | 0B | D-129 | Proxy externe validé si Base44 échoue raw body |

---

### **Catégorie 4 — SOTS et réputation**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| SOTS-CHECKIN-01 | Conditionnel | Si SOTS audience actif | 2 | D-094 | Soumission SOTS sans check-in rejetée avant ledger |
| SOTS-SELF-01 | Global | Toujours | 1 | D-094 | Auto-note directe ou indirecte bloquée |
| SOTS-FRAUD-01 | Global | Toujours | 2 | D-094 | Cluster suspect mis en quarantaine |
| SOTS-REVERSAL-01 | Global | Toujours | 1 | D-082 | Correction SOTS \= reversal append-only, jamais suppression |
| REPUTATION-APPEND-01 | Global | Toujours | 1 | D-077 | ReputationLedger append-only — aucune modification |

---

### **Catégorie 5 — Admin, sécurité et PolicyConfig**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| ADMIN-ABS-\* | Global | Toujours | 0A | D-107 | Tous les 19 interdits absolus testés |
| ADMIN-ROLE-02 | Global | Toujours | 0A | D-095 | DEV\_ADMIN sans accès données financières réelles en prod |
| DATAACCESS-WRITE-01 | Global | Toujours | 0B | D-095 | Toute action sensible produit DataAccessLedgerEntry |
| DATAACCESS-FAIL-01 | Global | Toujours | 0B | D-133 | Échec écriture DataAccessLedger \= blocage ou AdminIncidentRecord |
| ADMIN-ABS-DAL-01 | Global | Toujours | 0A | D-107 | DataAccessLedgerEntry immuable |
| POLICY-DIRECT-01 | Global | Toujours | 0A | D-108 | Modification directe DB prod rejetée |
| POLICY-CHANGE-01 | Global | Toujours | 0A | D-108 | PolicyConfigChangeRecord obligatoire sur toute modification |
| POLICY-CRITICAL-01 | Global | Toujours | 0A | D-108 | Config critique \= double validation |
| POLICY-FAILCLOSED-01 | Global | Toujours | 0A | D-027, D-063 | Config critique absente \= fail-closed, jamais valeur inventée |
| ADMIN-ABS-BUGREPLAY | Global | Toujours | 0A | D-107 | BugReplayRecord immuable |
| ADMIN-ABS-SYSTEMID | Global | Toujours | 0A | D-107 | systemId d'un objet existant immuable |
| ADMIN-ABS-SCHEDULERRUN | Global | Toujours | 0A | D-107 | SchedulerRun complété immuable |
| ADMIN-ABS-INCIDENT | Global | Toujours | 0A | D-107 | AdminIncidentRecord immuable |
| ADMIN-EXPORT-01 | Global | Toujours | 0A | D-111 | Export massif interdit à SUPPORT\_ADMIN |
| ADMIN-COI-01 | Global | Si dispute | 1 | D-110 | ConflictOfInterestRecord obligatoire si conflit |
| ADMIN-SOLO-02 | Global | Toujours | 0A | D-106 | SoloFounderOverride → AdminIncidentRecord créé |
| ADMIN-SOLO-03 | Global | Toujours | 0A | D-106 | SoloFounderOverride ≠ DualApproval — délai \+ confirmation |
| ADMIN-CELL-SECRET-01 | Global | Toujours | 0A | D-018, D-105 | CELL\_MANAGER ne voit pas events SECRET par défaut |
| ADMIN-AUDITOR-01 | Global | Toujours | 0A | D-105 | AUDITOR\_EXTERNAL limité par DataAccessAuditRoleConfig |
| ADMIN-DEV-FINANCE-01 | Global | Toujours | 0A | D-105 | DEV\_ADMIN — accès données financières réelles prod interdit |
| ADMIN-SUPPORT-PAYOUT-01 | Global | Toujours | 0A | D-105 | SUPPORT\_ADMIN ne peut pas approuver payout |
| ADMIN-GROWTH-01 | Global | Toujours | Post-MVP | D-105 | GrowthPolicyConfig — seuil séparation rôles critiques |

---

### **Catégorie 6 — Scheduler**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| SCHEDULER-HEARTBEAT-01 | Global | Toujours | 0B | D-099 | HEARTBEAT\_MISSING détecté \+ AdminIncidentRecord créé |
| SCHEDULER-OVERDUE-01 | Global | Toujours | 0B | D-099 | DUE\_TASK\_OVERDUE P0 détecté |
| SCHEDULER-DOUBLE-01 | Global | Toujours | 0B | D-099, D-101 | lockedByRunId — anti-double exécution |
| SCHEDULER-CREDITS-01 | Global | Toujours | 0B | D-104 | Vélocité cron anormale détectée |
| MIGRATION-TRIGGER-01 | Global | Toujours | 0B | D-130 | MigrationTriggerPolicyConfig — seuil ALERTE déclenche AdminIncidentRecord |

---

### **Catégorie 7 — Portabilité Base44**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| PORTABILITY-SYSTEMID-01 | Global | Toujours | 0B | D-132 | Aucun objet métier critique sans systemId |
| PORTABILITY-EXPORT-01 | Global | Toujours | 0B | D-132 | Export complet tables critiques lisible hors Base44 |
| PORTABILITY-RESTORE-01 | Global | Toujours | 0B | D-132 | Restauration hors Base44 réussie |
| PORTABILITY-REF-01 | Global | Toujours | 0B | D-132 | Intégrité référentielle Event ↔ Lineup ↔ MissionSlot ↔ Engagement ↔ Ledger |
| REPOSITORY-ADAPTER-01 | Global | Toujours | 0A | D-128 | Logique métier critique ne dépend pas directement de Base44 |
| BASE44-ID-01 | Global | Toujours | 0A | D-127 | Aucun Base44 id comme identifiant métier souverain |
| AUTH-SYSTEMID-01 | Global | Toujours | 0A | D-127 | Base44 Auth user id ≠ systemId métier |

---

### **Catégorie 8 — UX et vérité perçue**

| testCode | P0 | Trigger | requiredBeforeEvent | Décision | Ce qu'il vérifie |
| ----- | ----- | ----- | ----- | ----- | ----- |
| UX-VENTILATION-01 | Global | Toujours | 1 | D-024, D-084 | Talent voit ventilation complète avant acceptation |
| UX-PAYOUT-STATUS-01 | Global | Toujours | 1 | D-084 | Talent voit état payout avec PayoutBlockReason lisible |
| UX-FONDSPROTEGÉS-01 | Global | Toujours | 1 | D-085 | Payeur voit "fonds protégés" au bon état |
| UX-QUICKPLAY-30S-01 | Conditionnel | Si QuickPlay actif | 2 | D-021, D-114 | QuickPlay est compréhensible en 30 secondes |

---

## **9\. ECONOMIC\_SCENARIO\_REGISTER — Export complet**

---

| Code | Nom | Description | P0 | Déclencheur conditionnel | Comptes ledger | Décisions liées |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| SC-01 nominal | Waterfall standard 1 talent | EPR → dépôt → balance → event\_sealed → présence → SOTS → payout → archive | Global | — | 5200, 4190, 4310, 4530, 4410, 4420, 5100, 7110, 6110 | D-038 |
| SC-01 multi | Waterfall 3 talents taux différents | Même que SC-01 avec calcul par talent | Global | — | Mêmes \+ per-talent | D-049 |
| SC-03 coeff | Coefficient de vente \> 1, prorata | Rehaussement lineup, commission par talent, seller commission | Conditionnel | Si seller-led pilote activé (D-116) | \+ 4330, 6150 | D-028, D-049, D-052 |
| SC-05 annulation | Annulation \> J-30 | Remboursement dépôt − frais Stripe | Global | — | 4320, 4410, 4420 reversals, 5100 | D-039 |
| SC-06 balance J-6 | Balance impayée J-6 | Annulation auto, payout dépôt aux talents | Global | — | 4320, 4310, 7120, 4410, 4420 | D-040, D-043 |
| SC-07 no-show | Talent absent | Talent 0$, organisateur remboursé cachet\_net\_final (ContractSnapshot phase 2 — coefficient inclus), MR conserve commission · **[CT-014]** base = cachet\_brut\_final\_i WORM W2 | Global | — | 4310 → 5100 (remboursement) \+ 7110 | D-041, D-044, D-147 |
| SC-08 dispute | Litige ouvert | Gel chirurgical, résolution partielle via deliveryRecognizedRatio | Global | — | Holds \+ reversals selon résolution | D-045, D-047 |
| SC-10 billetterie | Billets payants | Comptes billetterie ségrégués | Conditionnel | Si billets payants | 4540, 7410 | D-054, D-115 |
| SC-11 gratuit | Billet 0$ | Droit SOTS audience, aucune fausse recette | Global | — | TicketAdmissionRight sans flux monétaire | D-054, D-115 |
| SC-12 hybride | CreateEvent × QuickPlay | MissionSlot CreateEvent rempli par lobby QuickPlay | Event 3 | Si Event 3 | Mêmes que SC-01 | D-021, D-114, D-122 |
| SC-13 lobby | Lobby QuickPlay complet | Formation → lineup → check-ins → SOTS → archive | Event 2+ | Si QuickPlay actif | Mêmes que SC-01 | D-021, D-114 |
| SC-14 no-show refund | No-show \+ remboursement | Rail REFUND, ledger équilibré | Global | — | Rail REFUND \+ reversals | D-041 |
| SC-15 transfert | Transfert d'Engagement | Talent A → Talent B, payout Talent B, ledger zéro cent | Conditionnel | Si transfert activé au MVP | ContractSnapshot mis à jour | D-013 |
| SC-16 SOTS contesté | SOTS mis en quarantaine | Note quarantaine → admin review → DecisionRecord → reversal si invalidé | Conditionnel | Si SOTS audience actif | ReputationLedger reversal | D-082, D-094 |
| SC-NO-SHOW-PRE | No-show pré-event après transfert échoué | Reversal complet depuis deposit\_secured · remboursement organisateur (dépôt − frais Stripe) · Talent A = 0$ · MR = 0$ | Global | Si transfert activé | 4310, 4530, 4410, 4420 reversals, 5200, 4190, 4320, 5100 | D-013, D-019-A |
| SC-DEPOSIT-FAIL | Échec Stripe sur deposit\_pending | Zéro écriture ledger · EPR FAILED · SchedulerDueTasks CANCELLED | Global | — | Aucun | D-019-A |
| SC-08-PARTIEL | Résolution partielle de litige | deliveryRecognizedRatio appliqué · commission MR proportionnelle · deux SettlementInstructions | Global | Si dispute partiellement résolue | 4310, 4530, 7110, 4410, 4420, 5100, 6110, 6119, 4190 | D-019-A, D-045, D-072 |
| SC-07-AMENDMENT | No-show talent A + extension plage talent B (même event) | No-show headliner → remboursement cachet\_net\_final headliner (CS phase 2) · EngagementAmendment warmup → facturation delta payeur · Engagements indépendants · coefficient immuable | Conditionnel | Si EngagementAmendment activé | 4310, 4530, 7110, 5100, 6110 + delta entries | D-041, D-044, D-147, CT-014 |

---

**FIN DE LA PARTIE 6 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 7 / 8**

---

## **10\. MVP\_SCOPE\_REGISTER — Export complet**

---

### **Engagement et cycle de vie**

INCLUS MVP : machine d'état complète (D-019), ContractSnapshot deux phases WORM (D-035), Event → Lineup → MissionSlots → MissionApplications → MissionProposals → Engagements (D-016, D-113), transfert d'Engagement si requis (D-013), WORM en 6 couches (D-014).

---

### **QuickPlay mince**

INCLUS MVP : Lobby formation, capitaine (premier arrivé \= lobbyStatus, D-120-A), EngagementCollectif indivisible, prix déclaré par capitaine (pas de yield), conversion en Engagements individuels, pipeline standard (D-114, D-021).

EXCLU MVP : tarification yield dynamique, matching algorithmique avancé, multi-lobby simultané (D-022, V3.1).

---

### **Billetterie mince**

INCLUS MVP : TicketAdmissionRight obligatoire même à 0$, AudienceCheckIn lié au billet, flux comptable séparé si payant 4540/7410 (D-115, D-054).

EXCLU MVP (V3.0.1) : remboursements complexes, politiques tarifaires avancées, annulations billetterie, règles fiscales détaillées.

---

### **Paiement**

INCLUS MVP : EPR \+ dépôt \+ balance (D-042), coefficient de vente \= 1 dans chemin nominal (D-116), seller-led pilote possible sous conditions strictes (D-116), KYC Stripe Connect obligatoire (D-097), 6 verrous anti-double payout (D-101), SC-01, SC-05, SC-06, SC-07 actifs.

EXCLU MVP : seller-led complet sans conditions (V3.1), SC-03 coefficient sauf pilote fondateur, billetterie payante avancée (V3.0.1).

---

### **Ledger**

INCLUS MVP : LedgerCodeMap V3 complet (D-060, D-060-A), FinancialLedger append-only (LOI LEDGER-01), invariant LEDGER-02 (D-069), LOI WATERFALL-01 (D-049), LOI LINEUP-01/02/03 (D-028, D-030, D-034), RoundingPolicyConfig (D-063), comptes ségrégués par moteur économique.

---

### **SOTS**

INCLUS MVP : actif dès MVP (D-026), score par défaut 3/5 (D-026), ReputationLedger append-only (D-077), modulation commission existe en policy mais reste neutre sous seuil de confiance (D-080, D-083), 7 patterns fraude SOTS (D-094), SOTSScoreSnapshot périodique (D-077).

---

### **Checkpoint**

INCLUS MVP : Checkpoint comme rôle utilisateur à part entière (D-091), CheckpointCulturalProfile comportemental (D-092), EventLocation distinct du Checkpoint (D-091), granularité de zoom ≥ 10 pour lieux privés (D-017).

---

### **Décision**

INCLUS MVP : DecisionKernel partiel (D-071), payout automatique (11 conditions D-075), types DecisionRecord (D-072), délégué sur place (D-073), standing légitime dynamique (D-074), délai d'appel configurable (D-076).

MANUAL-FIRST MVP : disputes complexes, no-show contesté, refund partiel, payout manuel exceptionnel.

---

### **Sécurité**

INCLUS MVP : PresenceProofResolver faisceau (D-093, D-093-A), fraude SOTS 7 patterns (D-094), hiérarchie sensibilité 5 niveaux (D-095), DataAccessLedger (D-018), secrets Stripe 10 règles (D-097), fraude paiement 7 signaux (D-098), pseudonymisation / DataRetentionPolicyConfig (D-096, D-096-A).

---

### **Admin**

INCLUS MVP : 10 rôles canoniques (D-105), SoloFounderOverride (D-106), 19 interdits absolus (D-107), PolicyConfigChangeRecord universel (D-108), SecretsRotationPolicyConfig (D-109), ConflictOfInterestRecord (D-110), Admin Authority Matrix (D-112).

CELL\_MANAGER : architecture prête, activation post-MVP (V3.2).

---

### **Scheduler**

INCLUS MVP : SchedulerDueTask (D-099), dispatcher P0/P1/P2 (D-100), anti-double payout 6 verrous (D-101), politique de relance (D-102), traitement ledger imbalance (D-103), CronBudgetPolicyConfig 4 états (D-104).

---

### **UX**

INCLUS MVP : format universel 5 éléments par état (D-084), "fonds protégés" — pas "escrow" (D-085), frais MR expliqués (D-086), notification non accusatoire (D-087), français \+ i18n architecture bilingue (D-088), dashboard organisateur avec délégué et timeline (D-089), dashboard vendeur complet (D-090).

---

### **IDFactory**

INCLUS MVP : systemId portable souverain sur tous les objets critiques (D-127). Base44 Auth user id ≠ systemId métier (D-127).

---

### **Base44**

Rampe de lancement MVP (D-127). Couches portables listées (D-127). Repository interfaces (D-128). WEBHOOK-RAWBODY-01 test P0 (D-129). MigrationTriggerPolicyConfig (D-130). GitHub \+ CI/CD \+ environnements (D-131). Portability Readiness checklist (D-132). 10 alertes P0 observabilité (D-133).

---

### **Tests**

100% tests P0 chemin exercé avant argent réel (D-117). 8 catégories P0 (D-136). BugReplayRecord portée élargie (D-137). 16 scénarios économiques (D-138). Grille readiness par event (D-139).

---

### **Liquidité commerciale**

Corridor H2T/H2X/H2Z (D-121). 4 à 7 Premium \+ ALL NIGHT LONG \+ hybride (D-122). Plafond 1 500$ standard (D-123). 5 phases de liquidité (D-124). RSI interne (D-125). 20 premiers talents (D-126).

---

### **Premier event réel**

Event 0A (test) → Event 0B (Stripe live 5-10$) → Event 1 (4 à 7 Premium) → Event 2 (ALL NIGHT LONG) → Event 3 (hybride). Co-testeurs consentants. Cachet 300-500$. Checklist pré/post event. AbortProtocol. GoNoGoDecisionRecord. FULL SUCCESS / CONTROLLED SUCCESS / NO-GO (D-140 à D-146).

---

### **Manual-first MVP**

Matching automatique, disputes complexes, T4A automatique, valeur portefeuille vendeur formelle, décisions post-archive exceptionnelles, TalentTaxProfile UI complète, MR\_REMIT\_BY\_ELECTION.

---

## **11\. ROADMAP\_REGISTER — Export complet**

---

### **MVP (V3.0)**

**Features incluses :** Chemin nominal 13 étapes, QuickPlay mince, Billetterie mince TicketAdmissionRight 0$, SOTS actif modulation neutre sous seuil, Scheduler P0/P1/P2, Matrice Admin D-112, SC-01/SC-05/SC-06/SC-07 actifs, Base44 avec couches portables, GitHub \+ CI/CD minimal.

**Manual-first :** Disputes complexes, matching automatique, T4A, valeur portefeuille, décisions post-archive.

**Séquence lancement :** Event 0A → Event 0B → Event 1 → Event 2 → Event 3\.

---

### **V3.0.1**

**Features incluses :** Billetterie complète (remboursements, politiques tarifaires, annulations, règles fiscales), Anglais i18n activé (fichier EN ajouté), TalentTaxProfile UI complète, Corrections frictions pilote, T4A si validation fiscale positive, MR\_REMIT\_BY\_ELECTION si validation légale.

**Conditions d'activation :** Après Event 1 \+ Event 2 validés, GoNoGoDecisionRecord \= GO, frictions documentées.

---

### **V3.1**

**Features incluses :** Seller-led complet sans conditions restrictives, SellerCommissionPolicy complète, ClientAttributionRight UI, ResidualCommission active, OfficialEventContent, Disputes automatisées (condition : 10 cas réels analysés), Matching auto limité (phases 4-5 liquidité).

**Conditions d'activation :** 15-30 events actifs, données vendeur matures.

---

### **V3.2**

**Features incluses :** Cellules-succursales opérationnelles, CELL\_MANAGER actif, Commandites complètes (SponsorshipContract, etc.), Dashboard Checkpoint complet, PortfolioTransfer (si légal validé).

**Conditions d'activation :** GrowthPolicyConfig seuil atteint, cellules actives H2T/H2X/H2Z.

---

### **V3.3**

**Features incluses :** Pivot de Marché (remplacement des domaines par database uniquement), Circuit physique Micro Rave (premier lieu physique), Expansion territoriale avancée.

**Conditions d'activation :** Liquidité établie (50+ events), données culturelles Checkpoint matures.

---

### **Hors scope indéfini**

PortfolioTransfer complet (légal non validé), PortfolioValuation formelle, Circuit physique (avant V3.3).

---

## **12\. LIQUIDITY\_REGISTER — Export complet**

---

### **Corridor de lancement**

H2T / H2X / H2Z — Montréal. *"On ne lance pas une ville; on allume un corridor."*

H2T → Mile-End / Plateau culturel / scène créative H2X → Plateau sud / Quartier latin / axe étudiant-culturel H2Z → Quartier des spectacles / centre-ville / potentiel corporate

---

### **Produits d'amorçage**

**Produit 1 — 4 à 7 Premium (wedge corporatif) :**

* Chemin : CreateEvent contrôlé  
* Cible : PME 20-150 employés, RH, direction  
* Format : 4 à 7 après-bureau avec DJ  
* Prix : 750$ à 1 500$ CAD  
* Objectif : premier cash réel, test EPR \+ payout \+ ledger

**Produit 2 — ALL NIGHT LONG (wedge culturel) :**

* Chemin : QuickPlay / Lobby / Checkpoint / Billetterie mince  
* Format : nuit au checkpoint, billets 0$ ou symboliques  
* Objectif : preuve culturelle, test QuickPlay \+ check-in \+ SOTS audience

**Event 3 hybride :**

* MissionSlot CreateEvent rempli par lobby QuickPlay  
* Rôle : preuve que les deux chemins s'interalimentent

*"Le 4 à 7 finance la preuve. ALL NIGHT LONG prouve la culture. L'hybride prouve Micro Rave."*

---

### **Plafond MVP**

Standard : 150 000 cents (1 500$ CAD) dans EventPaymentConfig. Exception contrôlée : 250 000 cents (2 500$ CAD) avec SoloFounderOverride \+ AdminAction \+ reasonCode. Valeurs en database, jamais hardcodées.

---

### **Liquidité progressive — 5 phases**

*"Le système peut recommander tôt. Il ne contractualise pas automatiquement tôt."*

| Phase | Volume | Mode |
| ----- | ----- | ----- |
| 1 Amorçage | 0–5 events | 100% manuel |
| 2 Démarrage | 5–15 events | Suggestions système, humain valide |
| 3 Liquidité minimale | 15–30 events | Auto-suggestion, acceptation humaine |
| 4 Liquidité active | 30–50 events | Matching auto limité |
| 5 Liquidité établie | 50+ events | Matching auto élargi \+ RSI |

Seuils dans LiquidityPolicyConfig, jamais hardcodés.

---

### **RSI**

RSI \= Référencement Spontané Identifiable / Intégré.

* RSI Identifiable : référence traçable dans la plateforme  
* RSI Intégré : comportement récurrent (return rate, rebooking)

Statut MVP : interne, observé, non exposé. Jamais revenue share visible. Devient critère de gouvernance à 50+ events.

---

### **20 premiers talents — composition**

10 DJs / 3 photographes-vidéastes / 2 VJ / 2 MC-hôtes / 2 techniciens son-lumière / 1 talent hybride (ex. DJ \+ photo). *"Fiabilité avant notoriété."*

N'importe lequel peut être capitaine selon l'ordre d'arrivée. Aucun recrutement de "profil capitaine".

---

### **Capitaine QuickPlay**

*"Le capitaine est un statut de lobby, pas un rôle métier."*

lobbyStatus \= captain (temporaire) / roleMetier \= DJ/photo/VJ/MC/technicien (permanent). Capitaine \= premier arrivé dans le lobby. Pouvoirs : soumettre MissionApplication avant lobby complet, confirmer checkpoint. Déclenchement automatique si lineup complet \+ critères satisfaits.

---

## **13\. FIRST\_EVENT\_REGISTER — Export complet**

---

### **Séquence des events pilotes**

| Event | Description |
| ----- | ----- |
| Event 0A | Test interne Stripe test mode — scénarios larges, comptes tests |
| Event 0B | Stripe live symbolique (5$-10$) — prouver argent réel entre et sort |
| Event 1 | 4 à 7 Premium — premier event réel, argent externe |
| Event 2 | ALL NIGHT LONG — audience \+ QuickPlay |
| Event 3 | Hybride CreateEvent × QuickPlay |

---

### **Participants Event 1**

Talent : fiable réseau direct fondateur, disponible débriefing, contexte pilote accepté. Organisateur : connu fondateur, budget réel, frictions UX acceptées. Payeur : identique organisateur (SC-01). Admin : fondateur — admin concierge sur place.

Reconnaissance pilote obligatoire : *"Je comprends que je participe à un événement pilote Micro Rave avec argent réel, support humain, et suivi post-event."*

---

### **Montant Event 1**

Event 0B : 5$-10$ CAD Stripe live symbolique. Event 1 : cachet net talent recommandé 300$ CAD, fourchette 300$-500$ CAD. Prix vendu client calculé par le système. Jamais hardcodé.

---

### **Checklist pré-event 1 (un item FAILED \= event interdit)**

**Infrastructure :** Stripe live keys, webhook proxy validé si requis, WEBHOOK-RAWBODY-01 \= PASS, observabilité D-133 active, dashboard fondateur.

**Portabilité :** Portability Readiness D-132 \= PASS, backup planifié.

**Tests :** Event 0A \= GO, Event 0B \= GO, 100% P0 chemin CreateEvent \= PASS, 0 BugReplayRecord non PASSED, SC-15 \= PASS si transfert activé.

**Consentement pilote :** Talent accepté, organisateur/payeur accepté, canal support confirmé.

**Config critique :** EventPaymentConfig, LedgerCodeMap, TaxConfig, PayoutPolicyConfig, PresencePolicyConfig, CriticalConfig fail-closed testé.

**Traçabilité :** DataAccessLedger write test \= PASS, AdminAction possible, PayoutBlockReason catalog disponible, AbortProtocol accessible.

**Event spécifique :** systemId sur tous les objets critiques, Event → Lineup → MissionSlot → Engagement cohérent, ContractSnapshot phase 1 WORM, EPR dépôt créée selon EventPaymentConfig, SchedulerDueTasks créées, KYC \= VERIFIED.

**Financier :** plafond MVP respecté, fonds pour remboursement total disponibles.

---

### **Surveillance en temps réel — 12 signaux**

1. Stripe dépôt reçu et 4310/4530 crédités  
2. SchedulerDueTasks créées, deposit\_secured atteint  
3. Ledger Dr \= Cr sur transactionGroupId  
4. État Engagement en séquence correcte  
5. TalentCheckIn dans les temps, PresenceProofResolver résolu  
6. GPS/QR/délégué signal fort, timestamp cohérent  
7. SOTS fenêtre ouverte, talent a soumis  
8. DecisionKernel 11 conditions vertes, PayoutExecutionRecord, ledger zéro cent  
9. DataAccessLedger — action admin → entrée créée  
10. Alertes P0 D-133 toutes actives  
11. Support humain — talent et organisateur comprennent leur état  
12. UXTruthProjection — affiché \= état métier réel

---

### **Définition de succès**

**FULL SUCCESS :** Dépôt reçu (montant exact), balance reçue, event\_sealed sans intervention manuelle, présence prouvée, SOTS soumis, payout exécuté automatiquement, ledger zéro cent, aucun BugReplayRecord non PASSED, GoNoGoDecisionRecord \= GO. → Event 2 autorisé sans réserve.

**CONTROLLED SUCCESS :** Event complété, argent sécurisé, ledger équilibré, mais une intervention humaine documentée nécessaire. → GO avec réserves si aucun P0 FAILED. Corrections avant Event 2\.

**NO-GO :** P0 FAILED / ledger imbalance / payout manuel non prévu / BugReplayRecord FAILED-PENDING / ContractSnapshot WORM violé / présence impossible à prouver / DataAccessLedger manquant. → Event 2 bloqué jusqu'à résolution.

---

### **AbortProtocol — conditions d'arrêt**

**ARRÊT IMMÉDIAT si :** Test P0 FAILED sur chemin exercé, ledger imbalance non résolu, double payout tenté, webhook Stripe invalide sur transaction event, ContractSnapshot WORM violé, état impossible machine Engagement, payout exécuté sans PayoutExecutionRecord, DataAccessLedger non écrit sur action sensible, systemId manquant sur objet critique, BugReplayRecord FAILED/PENDING sur chemin critique, CriticalConfig manquante, AdminIncidentRecord P0 non résolu, SessionPresence sans aucun signal valide.

Note : GPS spoofing seul \= HOLD \+ admin review (pas abort si faisceau alternatif valide). Fonds non reçus \= event non sealed (pas abort post-lancement).

**Procédure en 8 étapes :**

1. Rail HOLD sur l'event concerné  
2. Bloquer payout et mouvement sortant  
3. Créer AdminIncidentRecord avec contexte complet  
4. Notifier talent et organisateur honnêtement  
5. Ne pas rembourser ni payer silencieusement  
6. Créer BugReplayRecord si vérité irréversible touchée  
7. Émettre DecisionRecord avant toute action financière corrective  
8. GoNoGoDecisionRecord \= NO-GO jusqu'à résolution

---

### **Checklist post-event 1**

**Vérifications système (dans les 2h) :** Ledger zéro cent, PayoutExecutionRecord complété, SchedulerDueTasks critiques \= done, SOTS window créée/planifiée, aucun AdminIncidentRecord P0 non résolu, DataAccessLedger complet.

**Documentation (dans les 24h) :** BugReplayRecord pour tout bug touchant vérité irréversible, retour talent documenté, retour organisateur documenté, frictions UX classées P0/P1/P2, écarts vérité affichée/métier documentés, critères MVT exercés documentés.

**Décision (dans les 48h) :** GoNoGoDecisionRecord créé. FULL SUCCESS / CONTROLLED SUCCESS / NO-GO. Si GO avec réserves : corrections obligatoires avant Event 2 avec owners. Si NO-GO : blocants listés avec owners.

**Apprentissage :** Quels tests P0 exercés pour la première fois? Quels BugReplayRecords PENDING? Quelle friction UX a le plus nui? Talent recommanderait Micro Rave? Organisateur rachèterait? Quelle preuve sociale utilisable sans violer confidentialité/droits image?

---

## **14\. BASE44\_PORTABILITY\_REGISTER — Export complet**

*Voir D-127 à D-133 dans DECISION\_REGISTRY\_V3 ci-dessus pour le contenu complet.*

**Résumé structure :**

* D-127 : Base44 comme rampe — couches portables  
* D-128 : Repository interfaces — 11 interfaces  
* D-129 : WEBHOOK-RAWBODY-01 test P0 bloquant  
* D-130 : MigrationTriggerPolicyConfig — 3 niveaux  
* D-131 : Discipline développement GitHub/CI/CD  
* D-132 : Portability Readiness — 7 items ordonnés  
* D-133 : Observabilité MVP — 10 alertes P0

---

**FIN DE LA PARTIE 7 / 8**

---

# **EXPORT BRUT — REGISTRES SOUVERAINS MICRO RAVE V3**

**PARTIE 8 / 8**

---

## **15\. GLOSSARY\_CANONICAL — Export complet**

---

| Terme | Définition canonique |
| ----- | ----- |
| **fonds protégés** | Terme UX obligatoire pour désigner l'escrow. "Ton argent est gardé jusqu'à ce que la prestation soit validée." Le mot "escrow" est interdit dans l'interface. (D-085) |
| **Event** | Container d'un événement Micro Rave. Possède un Lineup. Peut être PUBLIC, PRIVÉ ou SECRET. Peut être physique, résidentiel ou virtuel. (D-016, D-091) |
| **Lineup** | Agrégat des Engagements d'un Event. Porte la réconciliation budgétaire totale. Entité intermédiaire entre Event et Engagements. (D-016) |
| **MissionSlot** | Besoin exprimé par l'organisateur : rôle à remplir, plage horaire, conditions. Précède les applications. (D-113) |
| **MissionApplication** | Candidature d'un talent à un MissionSlot. Mène à une MissionProposal puis à un Engagement. (D-113) |
| **MissionProposal** | Offre de prix et conditions soumise par un talent ou un organisateur. Itérations de négociation. (D-113) |
| **Engagement** | Objet atomique central de Micro Rave. Un talent précis · pour un rôle précis · dans une plage précise · à un prix accepté · sous des conditions explicites · avec présence vérifiable · paiement sécurisé · réputation engagée · et règlement garanti par Micro Rave. (D-011) |
| **EngagementCollectif** | Noyau indivisible formé par un lobby QuickPlay. L'organisateur ne peut pas accepter une partie — tout ou rien. Se convertit en Engagements individuels à l'acceptation. (D-021, D-114) |
| **Lobby** | Salle de formation d'offre QuickPlay. Les talents y rejoignent des MissionSlots selon leur roleMetier. Le premier arrivé \= capitaine (lobbyStatus). Se convertit en Event → Lineup → Engagements à l'acceptation. (D-021, D-120-A) |
| **Capitaine QuickPlay** | Statut temporaire de lobby — pas un rôle métier. Premier utilisateur arrivé dans le lobby par matching. Peut soumettre la MissionApplication avant que le lobby soit complet. Statut disparaît à l'acceptation de l'EngagementCollectif. Analogue à l'hôte d'une partie StarCraft 2\. (D-120-A) |
| **Checkpoint** | Lieu reconnu, programmable et publiquement exploitable dans l'écosystème Micro Rave. Rôle utilisateur à part entière. Identité culturelle \= comportementale (EMA sur historique). Distinct de EventLocation. Analogue à un listing Airbnb pour la performance événementielle. (D-091, D-092) |
| **EventLocation** | Endroit où un event a lieu. Peut être un lieu privé, résidentiel ou virtuel sans Checkpoint enregistré. (D-017, D-091) |
| **SOTS** | Score de réputation multi-dimensionnel. Affiché sur 5, calculé depuis dimensions internes configurables dans SOTSDimensionConfig. EMA configurable. Modulation de commission active après seuil de confiance (10 soumissions MVP). (D-077-D-083) |
| **RSI** | Référencement Spontané Identifiable / Intégré. Signal mesurable qu'un talent, un checkpoint ou un organisateur est spontanément référencé par d'autres utilisateurs. Interne MVP. Jamais revenue share visible. (D-125) |
| **DataAccessLedger** | Registre des accès aux données sensibles. Toute consultation niveau 3+ produit une DataAccessLedgerEntry immuable. Jamais désactivable. Jamais modifiable. (D-018, D-095) |
| **BugReplayRecord** | Objet institutionnel liant un bug à sa correction prouvée. Un bug n'est corrigé que quand replayStatus \= PASSED. Portée : tout bug touchant une vérité irréversible. (D-134, D-137) |
| **PolicyConfig** | Table de configuration en database. Jamais hardcodée. Modifiable uniquement via AdminAction \+ DataAccessLedgerEntry \+ PolicyConfigChangeRecord. Classification : CRITIQUE / ÉLEVÉ / STANDARD / OPÉRATIONNEL. (D-108) |
| **contestation\_window** | État opérationnel temporaire post-`sots_window_closed`. Fenêtre de Contestation de Prestation — distincte du Frein d'Urgence (Q3). Durée dans `DisputeAccessPolicyConfig`. Expire vers `payable` si aucun DisputeRecord ouvert. Non-WORM. (D-019-B) |
| **partially\_settled** | État terminal de résolution partielle de litige. Atteint via `disputed → partially_settled`. Le `deliveryRecognizedRatio` gouverne la distribution proportionnelle entre talent, payeur et MR. (D-019-A, SC-08-PARTIEL) |
| **deliveryRecognizedRatio** | Ratio de livraison reconnue dans une dispute partielle. `DecisionRecord.recognizedAmount / initialAmount`. Gouverne la distribution prorata talent/payeur/MR/vendeur. (D-045) |
| **Frein d'Urgence** | Régime 1 de litige (D-019-B). Accessible depuis tout état avant `event_completed`. Aucune fenêtre temporelle. Pour cas pré-event : fraude, contrat rompu, absence talent, force majeure. |
| **Contestation de Prestation** | Régime 2 de litige (D-019-B). Accessible depuis `contestation_window` uniquement. Fenêtre configurable post-SOTS. Pour cas post-event : qualité insuffisante, désaccord SOTS, non-livraison partielle. |
| **WORM** | Write Once Read Many. Données immuables après snapshot. Le FinancialLedger et le ReputationLedger sont append-only (jamais de modification — seulement des reversals). Le ContractSnapshot est WORM en deux phases. (D-014, D-035) |
| **MoneyMovementRouter** | Routeur obligatoire pour tout mouvement d'argent. 6 rails : COLLECT, HOLD, DISTRIBUTE, REFUND, TRANSFER, RECONCILE. Contournement \= interdit absolu \#17. (D-049, D-107) |
| **GoNoGoDecisionRecord** | Décision formelle de lancement ou de blocage d'un event. Produit après chaque event pilote. Statuts : GO / GO avec réserves / NO-GO. (D-117, D-144) |
| **PayoutBlockReason** | Code explicite lié à tout blocage de payout. Jamais de blocage silencieux. Créé automatiquement quand un des 6 verrous se déclenche. (D-101) |
| **CriticalConfig** | Désigne les PolicyConfig de niveau CRITIQUE dans la classification D-108. Modification \= double validation obligatoire \+ DualApprovalThresholdConfig auto-protégée. (D-108) |
| **Base44Adapter** | Couche d'accès aux données Base44 implémentant les Repository interfaces portables. Si Micro Rave migre, seul l'adapter change — la logique métier reste intacte. (D-128) |
| **systemId** | Identifiant souverain portable de tout objet métier critique. Généré par IDFactory. Jamais le Base44 id. Immuable une fois créé (interdit absolu \#15). (D-127) |
| **SoloFounderOverride** | Exception documentée permettant au fondateur d'effectuer seul une action nécessitant normalement double validation. Exige délai configurable (60s recommandé), confirmation explicite, AdminIncidentRecord type SOLO\_FOUNDER\_OVERRIDE. Ce n'est pas une validation — c'est une exception. (D-106) |
| **standing** | Droit conditionnel d'ouvrir un DisputeRecord bloquant. Calculé dynamiquement : rôle autorisé \+ relation directe avec l'objet contesté \+ statut actif \+ fenêtre temporelle. Snapshoté dans standingLevel \+ standingReasonCodes. (D-074) |
| **PresenceProofResolver** | Logique de résolution de la présence par faisceau d'indices pondérés. GPS n'est pas obligatoire. Résultat : présence confirmée / présence probable / admin review / absence présumée. (D-093, D-093-A) |
| **AbortProtocol** | Procédure d'arrêt immédiat en 8 étapes si un event pilote rencontre une condition bloquante. "Un event pilote peut échouer. Il ne doit jamais échouer silencieusement." (D-145) |
| **EngagementAmendment** | Extension de la plage horaire d'un Engagement existant sur accord mutuel talent + organisateur, depuis l'état `performed`. Le taux contractuel (ContractSnapshot phase 2, WORM W2) est invariant — seule la durée change. Distinct du transfert (changement de talent) et du no-show (absence). (D-147) |
| **deliveryRecognizedRatio** | Ratio de livraison reconnue dans une dispute partielle. DecisionRecord.recognizedAmount / initialAmount. Gouverne la distribution prorata talent/payeur/MR/vendeur. (D-045) |

---

## **16\. RAW\_APPENDIX — Blocs complets (résumé structuré)**

*Note : chaque bloc est représenté par ses décisions validées, questions posées, réponses retenues, phrases canoniques et corrections. Le détail complet de chaque décision est dans la section 1 DECISION\_REGISTRY\_V3 ci-dessus.*

---

**BLOC 0 — Vision et identité** Décisions : D-001 à D-009. Questions posées : \#001 à \#008. Phrases canoniques : Loi Zéro, refus fondamentaux, promesses aux parties. Correction fondatrice : LOI-GR-01 originale rejetée (D-004).

---

**BLOC 1 — Ontologie du produit** Décisions : D-010 à D-023. Questions posées : \#009 à \#019. Phrases canoniques : "Le capitaine est un statut de lobby, pas un rôle métier", "ResidualCommission \= droit conditionnel, durable, renouvelable, gouverné et traçable". Correction fondatrice : D-021 corrigé — EngagementCollectif indivisible, QuickPlay n'est pas un système financier parallèle. Note important ajoutée : Micro Rave orchestre le triptyque talent ↔ organisateur/payeur ↔ checkpoint (D-091).

---

**BLOC 2 — Prix accepté** Décisions : D-024 à D-029. Questions posées : \#020 à \#025. Phrases canoniques : "Ce que tu acceptes est transparent", "fonds protégés". Points clés : ventilation UX progressive et obligatoire, facture payeur 5 lignes, SOTS actif dès MVP score 3/5, taux en database.

---

**BLOC 3 — Commissions et take-rates** Décisions : D-030 à D-037. Questions posées : \#026 à \#032. Phrases canoniques : LOI LINEUP-01 formule canonique, convention 1$ gratuités, LOI LINEUP-02, LOI LINEUP-03. Corrections : D-031 remplacé par D-036 (LOI SELLER-01 — base \= commission\_MR\_totale, pas surplus).

---

**BLOC 4 — Money Waterfall** Décisions : D-038 à D-050. Questions posées : \#033 à \#045. Phrases canoniques : LOI LEDGER-01, LOI WATERFALL-01, LOI ANNULATION-01/02, LOI NO-SHOW-01, LOI DISPUTE-01/02, "Tout le monde peut parler. Seuls les acteurs avec standing peuvent geler. Le ledger n'obéit qu'à une décision valide." Objet fondateur : matrice des droits de dispute D-047 — 8 acteurs, architecture complète.

---

**BLOC 5 — Fiscalité et statut légal** Décisions : D-051 à D-059. Questions posées : \#046 à \#052. Phrase canonique : "Micro Rave est courtier par doctrine. Les flux sont les preuves. Le ledger est le témoin." Additions : billetterie flux distinct, commandites flux distinct, TalentTaxProfile, taxCollectionMode hybride.

---

**BLOC 6 — Ledger et comptabilité** Décisions : D-060, D-060-A. Questions posées : \#053. Points clés : LedgerCodeMap V3 complet — doublons supprimés (4430/4440/7120 ancienne version), comptes billetterie/commandites ajoutés, 6119 ajouté pour écarts processeur. Phrase canonique : "Le plan V3 est bon dans sa colonne vertébrale, mais il doit encore séparer tous les moteurs économiques."

---

**BLOC 7 — Règles d'arrondi et précision** Décisions : D-061 à D-070. Questions posées : \#054 à \#056. Phrases canoniques : "Le dollar est une unité d'affichage. Le cent est une unité de vérité. Le ppm est une unité de taux.", "Le net talent n'est pas un deuxième calcul; c'est le reste protégé.", "Le résidu peut naître dans le calcul; il doit mourir dans l'écriture ledger." Standard : MONEY=cents / RATE=ppm / RATIO=n/d / SCORE=units / DISPLAY=derived.

---

**BLOC 8 — DecisionKernel et arbitrage** Décisions : D-071 à D-076. Questions posées : \#057 à \#062. Phrase canonique : "Le DecisionKernel MVP ne doit pas prétendre être un juge parfait. Il doit être un greffier incorruptible." Points clés : 11 conditions payout automatique, 23 types DecisionRecord, standing dynamique, délai d'appel par type.

---

**BLOC 9 — Réputation et SOTS** Décisions : D-077 à D-083. Questions posées : \#063 à \#069. Phrase canonique : "Le SOTS mesure ce qui a été livré, comment cela a été livré, et à quel point c'était bon; le ReputationLedger garde pourquoi; le seuil de confiance décide quand ce score peut toucher l'argent." Points clés : ReputationLedger append-only \+ SOTSScoreSnapshot périodique, 7 dimensions configurables, EMA, seuils de confiance 1/3/5/10 soumissions.

---

**BLOC 10 — UX et vérité perçue** Décisions : D-084 à D-092. Questions posées : \#070 à \#076. Phrases canoniques : "Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène.", "Un lieu devient ce qu'il accueille.", "fonds protégés" (pas escrow). Correction fondatrice : triptyque marketplace — pas binaire talent ↔ organisateur mais talent ↔ organisateur/payeur ↔ checkpoint (D-091).

---

**BLOC 11 — Sécurité, fraude et vie privée** Décisions : D-093, D-093-A, D-094 à D-098. Questions posées : \#077 à \#082. Phrase canonique : "Le BLOC 11 est une doctrine de preuve, accès minimal et journalisation." Points clés : PresenceProofResolver faisceau d'indices, garde-fou structurel SOTS-CHECKIN-01, hiérarchie 5 niveaux sensibilité, secrets Stripe 10 règles, 7 signaux fraude paiement.

---

**BLOC 12 — Scheduler et opérations** Décisions : D-099 à D-104. Questions posées : \#083 à \#088. Phrases canoniques : "Le cron réveille; la tâche dit quoi faire.", "Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement." Points clés : SchedulerDueTask architecture, 11 jobs P0 / 4 jobs P1 / 6 jobs P2, 6 verrous anti-double payout, CronBudgetPolicyConfig 4 états.

---

**BLOC 13 — Admin Authority Matrix** Décisions : D-105 à D-112. Questions posées : \#089 à \#094. Phrase canonique : "Certains pouvoirs ne doivent pas exister, parce que leur existence détruirait la confiance que Micro Rave est censée incarner." Points clés : 10 rôles canoniques, SoloFounderOverride ≠ DualApproval, 19 interdits absolus, PolicyConfigChangeRecord universel, classification 32 tables, matrice Admin Authority Matrix.

---

**BLOC 14 — MVP Scope Lock** Décisions : D-113 à D-119. Questions posées : \#095 à \#101. Phrase canonique : "Le MVP ne doit pas prouver que Micro Rave a beaucoup de features. Il doit prouver qu'un besoin réel peut devenir une mission, une mission peut devenir un engagement, et un engagement peut être payé, vécu, évalué, réglé et comptabilisé." Points clés : 13 étapes chemin nominal, QuickPlay mince, billetterie mince, coefficient \= 1 sauf seller-led pilote, 2 seuils de readiness, 12 critères MVT, roadmap V3.0 → V3.3.

---

**BLOC 15 — Liquidité commerciale** Décisions : D-120-A (correction ontologique), D-121 à D-126. Questions posées : \#102 à \#107 \+ correction capitaine. Phrases canoniques : "On ne lance pas une ville; on allume un corridor.", "Le 4 à 7 finance la preuve. ALL NIGHT LONG prouve la culture. L'hybride prouve Micro Rave.", "Fiabilité avant notoriété." Correction fondatrice : capitaine \= statut de lobby selon ordre d'arrivée. Pas de recrutement de "profil capitaine". Analogue hôte StarCraft 2\.

---

**BLOC 16 — Technologie et Base44** Décisions : D-127 à D-133. Questions posées : \#108 à \#114. Phrases canoniques : "Base44 est la rampe. L'architecture souveraine est la destination.", "Une sortie théorique n'est pas une stratégie de sortie. Il faut tester qu'on peut vraiment sortir.", "GitHub trace le code. La database trace la config." Points clés : couches portables, 11 Repository interfaces, WEBHOOK-RAWBODY-01, MigrationTriggerPolicyConfig 3 niveaux, Portability Readiness 7 items, 10 alertes P0 observabilité.

---

**BLOC 17 — Tests et bug replay** Décisions : D-134 à D-139. Questions posées : \#115 à \#120 (correction protocole — questions posées après la matière exploratoire). Phrases canoniques : "Un bug corrigé mais non rejoué est un bug qui attend de revenir.", "Le BLOC 17 ne sert pas à croire que le système marche. Il sert à prouver que le système ne peut pas oublier ses propres erreurs." Points clés : distinction P0 global/conditionnel, 8 catégories de tests, BugReplayRecord portée élargie, 16 scénarios économiques, grille readiness Event 0A à Event 3\.

---

**BLOC 18 — Premier événement réel** Décisions : D-140 à D-146. Questions posées : \#121 à \#127. Phrases canoniques : "Un event pilote peut échouer. Il ne doit jamais échouer silencieusement.", "Le premier événement réel n'est pas un lancement marketing. C'est un examen institutionnel." Points clés : co-testeurs consentants, cachet 300-500$ CAD, checklist pré-event complète (35+ items), 12 signaux surveillance temps réel, 3 statuts de succès (FULL/CONTROLLED/NO-GO), AbortProtocol 8 étapes, checklist post-event.

---

## **Clôture de l'export**

**Export brut — Registres Souverains Micro Rave V3** **Date :** 13 mai 2026 · **Mise à jour :** 20 mai 2026 **Total décisions :** 158 (D-001 à D-147 \+ D-060-A \+ D-093-A \+ D-096-A \+ D-120-A \+ D-019-A \+ D-019-B \+ D-014-A \+ D-014-B \+ CT-014) **BLOCs couverts :** 0 à 18 (19 blocs complets) **Registres exportés :** 16

**Phrase de clôture :** *"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*

---

**FIN DE L'EXPORT — PARTIE 8 / 8**