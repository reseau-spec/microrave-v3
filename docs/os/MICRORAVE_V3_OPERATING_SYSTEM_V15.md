# MICRO RAVE V3 — FOUNDER-VALIDATED OPERATING SYSTEM

### Document de référence souverain — validé par Frédérik Gélin, Fondateur

---

**Ce document contient uniquement ce qui a été explicitement validé par le fondateur.** Toute décision non présente ici est une hypothèse, pas une loi. Version : MVP V3 — 20 mai 2026 — **V15 : D-148 (Calendrier 4-4-5) · D-149 (PlageHoraireSKU) · D-150 (RoleSKU) · D-151 (StyleSKU) · D-152 (EngagementSKUTag) · D-153 (LOI SKU-MOTEUR-01 — non-contamination des moteurs économiques) · D-154 (Classification flux de trésorerie) · D-155 (LedgerReportingService) · Amendements D-011, D-060, IDFactory**

---

## TABLE DES MATIÈRES

1. Identité et vision
2. Ontologie du produit
3. Modèle financier
4. Ledger et comptabilité
5. SOTS et réputation
6. DecisionKernel et arbitrage
7. Sécurité et vie privée
8. Scheduler et opérations
9. Admin Authority Matrix
10. UX et vérité perçue
11. Technologie et infrastructure
12. Liquidité commerciale
13. MVP Scope Lock
14. Premier événement réel
15. Tests et qualité
16. Lois canoniques et phrases fondatrices
17. **[NOUVEAU V15] Analytique et états financiers par SKU**

18. À INTÉGRER : Scalability-by-design = architecture prête pour l'expansion internationale
---

# PARTIES I à XIII

*(Inchangées depuis V14 — voir V14 pour le texte complet des sections 1 à 13, sauf corrections notées ci-dessous.)*

---

## CORRECTIONS DANS LES SECTIONS EXISTANTES — V15

### §2.9 IDFactory — Amendement

*(inchangé depuis V11, sauf : ajout AMD- en V14, et en V15 :)*

**Préfixes ajoutés en V15 :**

```
RoleSKU          → RSK-
StyleSKU         → SSK-
PlageHoraireSKU  → PSK-
EngagementSKUTag → EST-
CalendarAnchor   → CAL-
```

**Règle invariante :** Tout objet analytique SKU a un `systemId` généré par IDFactory avec son préfixe propre. Aucun identifiant SKU n'est hardcodé dans le code métier.

### §4 Ledger et comptabilité — Note V15

*(Inchangée depuis V11, sauf ajout :)*

**[D-154] Classification des mouvements par type d'activité de flux de trésorerie :** voir section 17.4.

**[D-153] LOI SKU-MOTEUR-01 :** Les revenus des moteurs économiques distincts (courtage, SaaS, billetterie, commandites) ne sont jamais agrégés dans un même état de rentabilité sans étiquette explicite du moteur. La corrélation inter-moteurs est une analyse stratégique — jamais une ligne comptable. Voir section 17.5.

---

# PARTIE XIV — PREMIER ÉVÉNEMENT RÉEL

*(Inchangée — voir V14)*

---

# PARTIE XV — TESTS ET QUALITÉ

*(Inchangée depuis V14. Tests P0 supplémentaires requis en V15 :)*

- `CALENDAR445-01` — vérifier l'ancrage de l'année, la génération des clés PSK-, le débordement Q4
- `ENGAGEMENTSKULOG-01` — vérifier que `EngagementSKUTag` est créé à `accepted` et est WORM
- `SKU-MOTEUR-01` — vérifier que les requêtes de reporting ne mélangent pas les moteurs économiques sans étiquette explicite

---

# PARTIE XVI — LOIS CANONIQUES ET PHRASES FONDATRICES

*(Inchangée depuis V14, sauf ajout :)*

## 16.4 Lois analytiques — [V15]

**LOI SKU-MOTEUR-01 — Non-contamination des moteurs économiques :**

*Un abonnement SaaS et un événement transigé ne partagent ni la même unité de temps, ni la même unité de valeur, ni la même causalité. Les mélanger dans un même état de rentabilité sans étiquette explicite produit une métrique composite qui ne se lit ni comme un revenu SaaS ni comme un revenu de courtage — et qui trompe tout le monde, les investisseurs les premiers.*

**LOI SKU-ATOME-01 — Triptyque SKU :**

*Une capacité périssable dans l'événementiel est définie par trois dimensions orthogonales et indépendantes : le rôle métier (qui), le style (comment), la plage horaire (quand). L'organisateur qui réserve un DJ House le vendredi soir a acheté trois capacités distinctes. Elles se corrèlent — elles ne s'agrègent pas.*

**LOI CALENDRIER-445-01 — Comparaison temporelle souveraine :**

*Des pommes avec des pommes. La semaine 6, vendredi soir, de l'année 2026 est comparable à la semaine 6, vendredi soir, de l'année 2027 — parce que le calendrier 4-4-5 garantit que ces deux semaines occupent la même position dans le cycle saisonnier. C'est la condition de possibilité de tout benchmarking inter-annuel dans l'événementiel.*

**Phrases canoniques ajoutées :**

*"Un rôle dit qui. Un style dit comment. Une plage dit quand. Trois SKU pour une prestation — jamais un seul."*

*"La corrélation entre abonnement et GMV événementiel est une question de stratégie produit, pas une ligne de compte de résultat."*

*"2 184 créneaux par an. Assez pour piloter. Pas assez pour noyer."*

---

# PARTIE XVII — ANALYTIQUE ET ÉTATS FINANCIERS PAR SKU

**[NOUVEAU V15] — Décisions D-148 à D-155**

---

## 17.1 Principe fondateur — Trois horloges, trois états, une couche de corrélation

Micro Rave opère trois moteurs économiques avec des unités de temps fondamentalement différentes :

**Moteur courtage** — unité : la transaction (Engagement archivé). Revenu reconnu à l'archivage (LOI LEDGER-01). SKU = combinaison RoleSKU × StyleSKU × PlageHoraireSKU.

**Moteur SaaS** — unité : la période (mois, année). Revenu reconnu pro-rata quotidien (D-050). SKU = MembershipPlan (Freemium, Pro, Studio).

**Moteur billetterie** — unité : le billet émis. Revenu reconnu à l'émission du TicketAdmissionRight. SKU = EventType × PriceCategory. *(Post-MVP)*

**Moteur commandites** — unité : la période contractuelle d'exposition. Revenu reconnu prorata sur la durée du SponsorshipContract. *(Post-MVP)*

**LOI SKU-MOTEUR-01 :** Ces quatre moteurs produisent des états de rentabilité séparés. La corrélation inter-moteurs est documentée dans le tableau de bord stratégique — jamais dans les états financiers officiels.

---

## 17.2 Calendrier 4-4-5 — [D-148]

### Principe

Le calendrier 4-4-5 découpe l'année en 4 trimestres de 13 semaines chacun, soit toujours exactement 52 semaines et 364 jours (hors débordement). Chaque trimestre contient trois périodes de 4, 4 et 5 semaines.

Cette structure garantit que la semaine N du trimestre Q de l'année Y est toujours comparable à la semaine N du trimestre Q de l'année Y+1 — même position dans le cycle saisonnier, même profil de demande attendu.

### Ancrage souverain

**Règle :** L'année 4-4-5 commence le **premier lundi strictement suivant le 1er janvier** de l'année grégorienne correspondante. Si le 1er janvier est lui-même un lundi, l'ancre est le lundi suivant (au plus tôt le 2 janvier, au plus tard le 8 janvier).

**Ancres validées :**

| Année | 1er janvier | Ancre W01 | Semaines | Overflow Q4 |
|-------|-------------|-----------|----------|-------------|
| 2026 | Jeudi | 2026-01-05 | 52 | 0 |
| 2027 | Vendredi | 2027-01-04 | 52 | 0 |
| 2028 | Samedi | 2028-01-03 | 53 | 1 |
| 2029 | Lundi | 2029-01-08 | 52 | 0 |
| 2030 | Mardi | 2030-01-07 | 52 | 0 |
| 2031 | Mercredi | 2031-01-06 | 52 | 0 |
| 2032 | Jeudi | 2032-01-05 | 52 | 0 |
| 2033 | Lundi | 2033-01-03 | 52 | 0 |
| 2034 | Lundi | 2034-01-02 | 53 | 1 |

**Règle de persistance :** L'ancre de chaque année est calculée une fois à l'ouverture de l'année et gravée dans `CalendarAnchorConfig` (table immuable). Elle n'est jamais recalculée à la volée. Toute requête sur un `PlageHoraireSKU` utilise l'ancre pré-calculée.

### Structure des trimestres

| Trimestre | Semaines | Périodes |
|-----------|----------|---------|
| Q1 | W01–W13 | 4 sem + 4 sem + 5 sem |
| Q2 | W14–W26 | 4 sem + 4 sem + 5 sem |
| Q3 | W27–W39 | 4 sem + 4 sem + 5 sem |
| Q4 | W40–W52 (+overflow) | 4 sem + 4 sem + 5 sem + overflow |

### Traitement du débordement

Les années à 53 semaines (prochaines : 2028, 2034) voient la semaine excédentaire absorbée dans Q4, qui devient 4-4-6 cette année-là. Q1, Q2, Q3 restent identiques toutes les années — la comparaison inter-annuelle n'est pas perturbée.

**Algorithme canonique en pseudocode :**

```
function get445Anchor(gregorianYear):
  jan1 = date(gregorianYear, 1, 1)
  daysUntilMonday = (7 - jan1.dayOfWeek) % 7
  if daysUntilMonday == 0: daysUntilMonday = 7
  return jan1 + daysUntilMonday days

function dateTo445(d):
  year = d.year
  anchor = get445Anchor(year)
  if d < anchor:
    year = year - 1
    anchor = get445Anchor(year)
  weekNum = floor((d - anchor).days / 7) + 1
  dayOfWeek = d.dayOfWeek  // 1=lundi, 7=dimanche
  quarter = if weekNum <= 13 then 1
            elif weekNum <= 26 then 2
            elif weekNum <= 39 then 3
            else 4
  return (year, quarter, weekNum, dayOfWeek)
```

---

## 17.3 PlageHoraireSKU — [D-149]

### Les 6 blocs de 4 heures

Chaque jour est découpé en 6 blocs de 4 heures. Un bloc capture un profil de demande, pas une heure exacte.

| Bloc | Plage | Label analytique | Profil saisonnier |
|------|-------|-----------------|-------------------|
| B1 | 00h00–04h00 | NUIT_PROFONDE | Peak weekend, off-peak semaine |
| B2 | 04h00–08h00 | AUBE | Off-peak quasi-absolu |
| B3 | 08h00–12h00 | MATIN | Corporate, brunch |
| B4 | 12h00–16h00 | APRES_MIDI | Événements familiaux, corporatifs |
| B5 | 16h00–20h00 | FIN_APRES_MIDI | 4 à 7, happy hour |
| B6 | 20h00–00h00 | SOIREE | Peak universel |

**Règle de chevauchement :** Un événement qui chevauche deux blocs génère deux `PlageHoraireSKU` distincts — un par bloc touché. L'heure de début détermine le bloc primaire. L'heure de fin détermine si un second bloc est impliqué.

### Format de la clé

```
{ANNEE}Q{Q}W{WW}{J}B{B}

ANNEE  = année 4-4-5 (4 chiffres)
Q      = trimestre (1–4)
WW     = semaine dans l'année, zéro-paddé (01–53)
J      = jour de la semaine (1=lundi, 7=dimanche)
B      = numéro de bloc (1–6)
```

**Exemples validés :**

Event vendredi 22h → samedi 2h, W06 2026 (vendredi 13 février 2026) :
```
2026Q1W065B6   (vendredi 20h–00h → SOIREE)
2026Q1W066B1   (samedi  00h–04h → NUIT_PROFONDE)
```

Comparaison inter-annuelle — même position dans le cycle, années différentes :
```
2026Q1W065B6   → vendredi 13 février 2026
2027Q1W065B6   → vendredi 12 février 2027
2028Q1W065B6   → vendredi 11 février 2028
```
**Pommes avec pommes. Garanti par construction.**

### Univers et volumétrie

| Granularité | SKUs/an | Usage |
|-------------|---------|-------|
| **Blocs 4h (PlageHoraireSKU)** | **2 184** | Analytique, états financiers, rentabilité par créneau |
| Atomes 15 min | 34 944 | Interdit comme SKU — trop fin, sans valeur décisionnelle supplémentaire |
| Atomes 5 min | 104 832 | Réservé exclusivement à `SessionPresence` (preuve GPS/durée) — jamais un SKU |

**Règle invariante :** La granularité des `PlageHoraireSKU` est fixée à 4 heures. Toute demande de granularité inférieure pour des fins analytiques est refusée — les atomes de 5 et 15 minutes appartiennent à la couche de preuve (`SessionPresence`), pas à la couche analytique.

### Objet `PlageHoraireSKU`

```
systemId          PSK-XXXXXX-XXXXXX
code              2026Q1W065B6
annee445          2026
trimestre         1
semaine           6 (dans l'année)
jourSemaine       5 (vendredi)
bloc              6 (SOIREE)
heureDebutHeure   20
heureFinHeure     24
labelAnalytique   SOIREE
profilRisque      PEAK | STANDARD | OFF_PEAK   (configurable en database)
activeFrom        date
activeTo          date | null
```

---

## 17.4 RoleSKU et StyleSKU — [D-150, D-151]

### RoleSKU — Taxonomie des rôles métier

Un rôle métier définit **qui** est engagé — l'unité de capacité au sens fonctionnel.

**Objet `RoleSKU` :**

```
systemId     RSK-XXXXXX-XXXXXX
code         DJ | HUMORISTE | MC | SOUNDTECH | VJ | PHOTOGRAPHE | ANIMATEUR | MUSICIEN | ...
labelFr      "DJ"
labelEn      "DJ"
activeFrom   date
activeTo     date | null
```

**Règle invariante :** Les codes RoleSKU sont définis en database — jamais hardcodés. Tout nouveau rôle est ajouté via `PolicyConfigChangeRecord` avec `AdminAction + fondateur`. Le code est invariant une fois créé (WORM de nomenclature).

### StyleSKU — Taxonomie des styles

Un style définit **comment** la prestation est exécutée. La relation Style ↔ Rôle est **N:M** — un style peut appartenir à plusieurs rôles, et un rôle peut accueillir plusieurs styles.

**Objet `StyleSKU` :**

```
systemId       SSK-XXXXXX-XXXXXX
code           HOUSE | TECHNO | DISCO | STAND_UP | IMPROVISATION | JAZZ | ...
labelFr        "House"
labelEn        "House"
roleSKUCodes   ["RSK-DJ"]          // N:M — liste des rôles compatibles
activeFrom     date
activeTo       date | null
```

**Exemples de relations N:M :**

| Style | Rôles compatibles |
|-------|-------------------|
| IMPROVISATION | HUMORISTE, MC, ANIMATEUR |
| JAZZ | DJ, MUSICIEN |
| STAND_UP | HUMORISTE |
| HOUSE | DJ |

**Règle invariante :** Un `StyleSKU` est toujours associé à au moins un `RoleSKU`. La liste `roleSKUCodes` est vérifiée à la création — un style orphelin de rôle est rejeté.

---

## 17.5 EngagementSKUTag — [D-152]

### Principe

`EngagementSKUTag` est la jointure analytique qui grave les trois dimensions SKU sur chaque Engagement au moment de `accepted`. Ce tag est **WORM** avec le ContractSnapshot phase 1 — il ne peut pas être modifié après création.

**Règle de création :** `EngagementSKUTag` est créé dans `MissionConversionGuard` simultanément au ContractSnapshot phase 1, à la transition `proposed → accepted` ou `negotiating → accepted`.

**Objet `EngagementSKUTag` :**

```
systemId          EST-XXXXXX-XXXXXX
engagementId      ENG-...
roleSKUCode       RSK-DJ
styleSKUCode      SSK-HOUSE
plageHoraireSKUs  ["PSK-2026Q1W065B6", "PSK-2026Q1W066B1"]   // 1 ou 2 blocs
membershipTier    FREEMIUM | PRO | STUDIO   // snapshot du tier au moment de accepted
capturedAt        timestamp WORM  // gravé à accepted — immuable
```

**Règle sur les plages multiples :** Si un Engagement couvre deux blocs de 4 heures (ex. 22h–02h), les deux `PlageHoraireSKU` sont capturés. La rentabilité est calculée proportionnellement par bloc (durée dans le bloc / durée totale).

**Règle invariante :** `EngagementSKUTag` est append-only. Aucune modification n'est permise après `capturedAt`. Toute erreur de catégorisation est documentée via `AdminAction + DataAccessLedgerEntry` et produit un `SKUCorrectionRecord` (trace séparée — le tag original reste immuable).

### Amendement D-011 — Champs analytiques dans Engagement

L'objet `Engagement` (D-011) est amendé pour inclure une référence vers `EngagementSKUTag` :

```
engagementSKUTagId   EST-...   // null jusqu'à accepted, gravé à accepted
```

---

## 17.6 LOI SKU-MOTEUR-01 — Non-contamination des moteurs économiques — [D-153]

### Le problème fondamental

Un abonnement SaaS (MembershipPlan) et un événement transigé (Engagement archivé) ne partagent ni la même unité de temps, ni la même unité de valeur, ni la même causalité directe.

Calculer la "valeur d'un abonnement par rapport au GMV" dans le même tableau revient à mélanger trois horloges dans une seule équation — l'équation est fausse par construction, pas par erreur de calcul.

### Les trois états séparés

**État 1 — Rentabilité par SKU de capacité transigée (moteur courtage)**

Unité : Engagement archivé. Dimensions : RoleSKU × StyleSKU × PlageHoraireSKU.

Pour chaque combinaison de SKU :

```
GMV brut              = sum(prixVenduClientCents) par tag
Commission MR         = sum(commissionMrCents) par tag  [compte 7110]
Frais Stripe directs  = sum(fraisStripeCents) par tag   [compte 6110]
Marge brute           = Commission MR − Frais Stripe
Taux de no-show       = count(no_show) / count(archived) par tag
GMV médian            = median(prixVenduClientCents) par tag
```

Source : `FinancialLedger (7110)` joint avec `EngagementSKUTag`.

**État 2 — Rentabilité par SKU d'abonnement (moteur SaaS)**

Unité : période de membership. Dimension : MembershipPlan.

```
Revenu SaaS reconnu   = sum(dailyRecognitionCents) par plan   [compte 7210–7240]
Revenu différé restant = sum(unreconizedCents) par plan       [compte 4535]
```

Source : `FinancialLedger (7210+)` joint avec `UserMembership`.

**Ces deux états ne se touchent pas dans la comptabilité.** Ils vivent dans des colonnes séparées de l'état des résultats, exactement comme AWS sépare EC2 de S3.

### La couche de corrélation — hors états financiers officiels

La corrélation inter-moteurs appartient au tableau de bord stratégique. Elle répond à des questions telles que :

*"Les talents en tier PRO génèrent-ils un GMV événementiel 3× supérieur à celui des talents Freemium sur les 12 mois suivant leur upgrade ?"*

Cette analyse joint `EngagementSKUTag.membershipTier` avec les `LedgerEntry (7110)` correspondantes, agrégée par cohorte d'activation. C'est une métrique de valeur à vie — pas une ligne comptable.

**Règle invariante :** Toute requête qui agrège des revenus de moteurs différents (7110 + 7210 par exemple) doit porter une étiquette explicite indiquant qu'il s'agit d'une agrégation inter-moteurs, pas d'un revenu homogène. Cette étiquette est obligatoire dans tout tableau de bord et tout rapport investisseur.

---

## 17.7 Classification des flux de trésorerie — [D-154]

Chaque `LedgerEntry` est classifiée selon le type d'activité de flux de trésorerie, conformément aux principes ASPE/IFRS 7 :

| Compte | Type d'activité | Commentaire |
|--------|----------------|-------------|
| 5200 DR (encaissement client) | **Exploitation** | Rentrée de trésorerie opérationnelle |
| 5100 CR (décaissement talent) | **Exploitation** | Sortie de trésorerie opérationnelle |
| 4325/4326 DR (taxes remises à l'État) | **Exploitation** | Obligations fiscales opérationnelles |
| 4190 DR/CR (débours Stripe) | **Exploitation** | Frais processeur en transit |
| 2xxx (acquisitions d'immobilisations) | **Investissement** | Post-MVP |
| 1xxx (capitaux propres, dettes LT) | **Financement** | Levées de fonds, remboursements |

**Règle invariante :** Toute nouvelle `LedgerEntry` doit porter un champ `cashFlowType` (`EXPLOITATION` | `INVESTISSEMENT` | `FINANCEMENT`). Ce champ est renseigné par le guard ou le service qui crée l'écriture — jamais par une classification a posteriori.

**Note sur les revenus différés in-flight :** Les Engagements entre `accepted` et `archived` n'ont pas encore de revenu reconnu. Ils apparaissent au bilan comme revenus différés (4530) — pas dans l'état des résultats. Cette doctrine est conforme ASPE/IFRS 15 et doit être explicitement documentée dans les notes aux états financiers lors de chaque clôture.

---

## 17.8 LedgerReportingService — [D-155]

### Principe

`LedgerReportingService` est la couche de requêtes sur le `FinancialLedger` qui produit mécaniquement les états financiers. Il ne crée pas de données — il lit les `LedgerEntry` immuables existantes et les agrège selon les axes demandés.

### États produits

**Bilan (à une date donnée) :**
Agrégation des soldes (DR − CR) par compte à la date de clôture.
- Actif = sum des comptes 4110–5900 avec solde débiteur
- Passif = sum des comptes 1xxx–4xxx avec solde créditeur
- Capitaux propres = 1100–1400

**État des résultats (pour une période) :**
Agrégation des mouvements sur les comptes 6xxx (charges) et 7xxx (produits) entre deux dates.
- Revenus = sum(7110–7990) pour les `LedgerEntry.createdAt` dans la période
- Charges = sum(6110–6690) pour la même période

**État des flux de trésorerie (pour une période) :**
Agrégation des mouvements sur les comptes 5xxx, filtrée par `cashFlowType`.

**État de rentabilité par SKU :**
Join `FinancialLedger (7110)` × `EngagementSKUTag` × période.

### Règles d'implémentation

- `LedgerReportingService` est **read-only** — il ne peut pas créer, modifier ou supprimer des `LedgerEntry`.
- Toutes les requêtes sont paramétrées par `(dateDebut, dateFin, moteur?, skuCode?)`.
- Les agrégations inter-moteurs sont autorisées uniquement avec le paramètre `labelInterMoteur` explicitement fourni.
- Le service est un `Repository` au sens de l'architecture Micro Rave — il respecte les 11 interfaces Repository définies en BLOC 16.

---

## 17.9 Amendement D-060 — Dimension analytique SKU dans le plan comptable

*(Amende D-060 — LedgerCodeMap V3)*

Les comptes de revenus `7110–7190` (courtage) sont les seuls sur lesquels une dimension analytique SKU est applicable. Chaque `LedgerEntry` sur ces comptes doit porter un champ optionnel `engagementSKUTagId` (référence vers `EngagementSKUTag`).

Cette dimension est optionnelle à l'écriture (elle peut être null pour les écritures de correction ou d'ajustement) mais obligatoire pour tout mouvement issu d'un Engagement archivé passant par `ArchiveWORMGuard`.

---

# DÉCISIONS FORMELLES — V15

## D-148 | Calendrier 4-4-5 — Ancrage, structure, débordement

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19 — Analytique et états financiers par SKU
**Décidé lors de :** Conversation fondateur 20 mai 2026

**Décisions souveraines :**
1. Ancrage : premier lundi strictement suivant le 1er janvier
2. Débordement : absorbé dans Q4 (structure 4-4-6 les années à 53 semaines)
3. Ancre persistée en `CalendarAnchorConfig` — jamais recalculée à la volée
4. Prochains débordements : 2028, 2034

**Voir section 17.2 pour le détail complet.**

---

## D-149 | PlageHoraireSKU — Format de clé, 6 blocs, univers

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19

**Voir section 17.3 pour le détail complet.**

**Règle invariante :** La clé format `{ANNEE}Q{Q}W{WW}{J}B{B}` est immuable une fois générée. Un `PlageHoraireSKU` créé est permanent — il ne peut pas être supprimé, seulement désactivé (`activeTo` renseigné).

---

## D-150 | RoleSKU — Taxonomie des rôles métier

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19

**Voir section 17.4 pour le détail complet.**

---

## D-151 | StyleSKU — Taxonomie des styles, relation N:M avec rôles

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19

**Voir section 17.4 pour le détail complet.**

**Règle invariante :** La relation `StyleSKU ↔ RoleSKU` est N:M. Un style sans rôle compatible est rejeté à la création. Cette contrainte est vérifiée dans le guard de création de `StyleSKU` (pas dans le code métier des Engagements).

---

## D-152 | EngagementSKUTag — Jointure analytique WORM

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19
**Amende :** D-011 (Engagement)

**Voir section 17.5 pour le détail complet.**

**Règle invariante :** `EngagementSKUTag` est créé simultanément au ContractSnapshot phase 1 — dans le même appel à `MissionConversionGuard`. Si le tag ne peut pas être créé (RoleSKU inconnu, StyleSKU incompatible avec le rôle), la transition `proposed → accepted` est bloquée. Fail-closed.

---

## D-153 | LOI SKU-MOTEUR-01 — Non-contamination des moteurs économiques

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19

**Voir section 17.6 pour le détail complet.**

**Phrase canonique :** *"La corrélation entre abonnement et GMV événementiel est une question de stratégie produit, pas une ligne de compte de résultat."*

---

## D-154 | Classification des LedgerEntry par type de flux de trésorerie

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19
**Amende :** D-038 (FinancialLedger), D-060 (LedgerCodeMap)

**Voir section 17.7 pour le détail complet.**

**Conséquence technique :** Le modèle `FinancialLedger` (D-038) est amendé pour inclure le champ `cashFlowType ENUM(EXPLOITATION, INVESTISSEMENT, FINANCEMENT)`. Ce champ est NOT NULL — toute écriture sans classification est rejetée.

---

## D-155 | LedgerReportingService — Couche de requêtes états financiers

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 19

**Voir section 17.8 pour le détail complet.**

**Test P0 à créer :** `LEDGER-REPORTING-01` — vérifier que les états produits sont cohérents avec les `LedgerEntry` individuelles, que LOI LEDGER-02 est respectée dans les bilans, et que les agrégations inter-moteurs sans étiquette sont rejetées.

---

## CHANGELOG

**V15 — 20 mai 2026 :**

D-148 — Calendrier 4-4-5 · ancrage premier lundi suivant 1er janvier · débordement absorbé Q4 · `CalendarAnchorConfig` · prochains débordements 2028/2034

D-149 — PlageHoraireSKU · 6 blocs de 4h · format `{ANNEE}Q{Q}W{WW}{J}B{B}` · univers 2 184 SKUs/an · règle de chevauchement (2 blocs si event chevauche minuit)

D-150 — RoleSKU · taxonomie des rôles métier · préfixe RSK- · WORM de nomenclature

D-151 — StyleSKU · taxonomie des styles · relation N:M avec rôles · préfixe SSK-

D-152 — EngagementSKUTag · jointure analytique WORM à `accepted` · préfixe EST- · amendement D-011

D-153 — LOI SKU-MOTEUR-01 · non-contamination des moteurs économiques · corrélation inter-moteurs = analyse stratégique, jamais ligne comptable

D-154 — Classification flux de trésorerie · champ `cashFlowType` dans `FinancialLedger` · amendement D-038 et D-060

D-155 — LedgerReportingService · read-only · bilan + résultats + flux + rentabilité par SKU · rejet agrégations inter-moteurs sans étiquette

Amendements : D-011 (champ `engagementSKUTagId`) · D-038 (champ `cashFlowType`) · D-060 (dimension `engagementSKUTagId` sur comptes 7110+) · IDFactory (préfixes RSK-, SSK-, PSK-, EST-, CAL-)

**V14 — 20 mai 2026 :**
D-147 · CT-014 · EngagementAmendment · SC-07-AMENDMENT

**V13 — 19 mai 2026, 18:07 EST :**
D-019-A · D-019-B · SC-NO-SHOW-PRE · SC-DEPOSIT-FAIL · SC-08-PARTIEL

**V12 — Mai 2026 :**
D-014-A · D-014-B

**V11 — Mai 2026 :**
Q1/Q2/Q3 · table 2.7.1 · Pierre de Rosette

Fondateur : Frédérik Gélin — Montréal, 20 mai 2026
*"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*