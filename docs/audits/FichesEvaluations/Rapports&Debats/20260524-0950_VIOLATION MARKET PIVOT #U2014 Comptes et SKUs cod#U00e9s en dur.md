# 🔴 VIOLATION MARKET PIVOT — Comptes et SKUs codés en dur
## Micro Rave V3 — Analyse critique · 24 mai 2026

**Severity :** 🔴 **CRITIQUE — Violation de doctrine**  
**Source :** `src/services/FinancialLedgerService.js` L.45–104  
**Doctrine violée :** Market Pivot · Énoncé constitutionnel V3

---

## 1. L'ÉNONCÉ CONSTITUTIONNEL

### Citation exacte du mandat V3 (userMemories)

> **« Une capacité Market Pivot où tous les domaines configuration vivent en lignes de base de données — jamais en code. »**

Source documentée : Inscription personnelle du fondateur aux alentours du 20 mai 2026 lors de la construction V3.

### Traduction opérationnelle

**Market Pivot** = Capacité à **changer les règles du domaine sans redéployer le code**.

Exemples :
- Modifier le plan de comptes (ajouter une nouvelle ligne 6720 pour un type de charge) → 1 ligne en base de données
- Ajouter un nouveau SKU (SKU-PARTENARIAT) → 1 ligne en base de données
- Activer/désactiver une règle fiscale pour une juridiction → 1 ligne en base de données
- Changer les taux TPS/TVQ → 1 ligne PolicyConfig en base de données

**Sans Market Pivot :** Modifier une règle métier = redéployer le code, tests, build, déploiement production (1-2 jours).  
**Avec Market Pivot :** Modifier une règle métier = insertion base de données (secondes).

---

## 2. VIOLATIONS OBSERVÉES

### Violation 1️⃣ — Comptes généraux (30+ lignes)

**Location :** `FinancialLedgerService.js` L.39–76

```javascript
const VALID_ACCOUNT_NUMBERS = new Set([
  // Actifs courants
  '4110', '4120', '4130', '4190',
  // Passifs talents / escrow
  '4310', '4320', '4325', '4326', '4330', '4335', '4350', '4360', '4365', '4370',
  // Revenus différés
  '4530', '4535', '4540', '4541', '4545',
  // ... 30+ lignes supplémentaires codées en dur
  '7510', '7515', '7520', '7590',
  '7910', '7990',
]);
```

**Analyse :**
- 75 comptes au total codés en dur (Set JavaScript immuable à la compilation)
- Chaque compte est une **ligne du domaine** — une règle métier comptable
- Pour ajouter/modifier un compte : rebuild + redéploiement (violation Market Pivot)

**Impact :** 
- ❌ Impossible d'ajouter une nouvelle ligne 6720 sans redéployer
- ❌ Impossible de déactiver un compte pour un audit sans redéployer
- ❌ Portabilité future vers autre juridiction = 50+ comptes à refactoriser en dur

---

### Violation 2️⃣ — SKU codes (5 lignes)

**Location :** `FinancialLedgerService.js` L.81–87

```javascript
const VALID_SKU_CODES = new Set([
  'SKU-COURTAGE',
  'SKU-SAAS',
  'SKU-BILLETTERIE',
  'SKU-COMMANDITES',
  'SKU-INTERNE',
]);
```

**Analyse :**
- 5 moteurs économiques Micro Rave codés en dur
- Chaque SKU = un flux économique (courtage, SaaS, billetterie, commandites)
- Pour ajouter un nouveau flux (ex: SKU-PARTENARIAT) : rebuild + redéploiement

**Impact :**
- ❌ Impossible d'activer un 6e moteur économique (ex: partenariats de marque) sans redéployer
- ❌ Pas de A/B testing sur l'activation graduelle de nouveaux SKUs
- ❌ Dépendance à la release cycle pour les décisions commerciales

---

### Violation 3️⃣ — Compte spécialisé 6690 + types d'intervention (3 lignes)

**Location :** `FinancialLedgerService.js` L.94 + L.100–104

```javascript
const FISCAL_LIABILITY_ACCOUNTS = new Set(['4410', '4420', '4430', '4440']);

const VALID_6690_INTERVENTION_TYPES = new Set([
  'PRINCIPAL_TAX_REGULARIZATION_PILOT',
  'PRINCIPAL_TAX_REGULARIZATION_ERROR',
  'PRINCIPAL_TAX_REGULARIZATION_AUDIT',
]);
```

**Analyse :**
- Compte 6690 (charges fiscales absorbées) — **hautement configurable** par juridiction
- Types d'intervention (ratios fiscaux, cas d'usage) — **dépendent de la réglementation**
- Passifs fiscaux autorisés (4410/4420/...) — **varient par province** (TPS/TVQ au Québec, HST en Ontario)

**Impact :**
- 🔴 **CRITIQUE pour expansion géographique** — impossible d'ajouter HST (Ontario) sans redéployer
- 🔴 **Risque fiscal** — si la réglementation change, pas de hotfix base de données
- 🔴 **Audit trail rompu** — les changements réglementaires ne sont pas traçables en base

**Commentaire actuel dans le code (L.92) :**
```javascript
// Source : D-060-B · extensible aux juridictions HST futures.
```

Le mot **« extensible »** implique que c'est prévu pour changer. Mais **coder en dur contredit cette intention**.

---

## 3. CONFORMITÉ À LA DOCTRINE

### Table de conformité

| Concept | Énoncé Market Pivot | État du code | Conforme ? |
|---|---|---|---|
| **Comptes (4110–7990)** | Vivre en base de données, jamais en code | Codés en dur L.39–76 | 🔴 **NON** |
| **SKU codes** | Vivre en base de données, jamais en code | Codés en dur L.81–87 | 🔴 **NON** |
| **6690 + passifs fiscaux** | Vivre en base de données, jamais en code | Codés en dur L.94 + L.100–104 | 🔴 **NON** |
| **PolicyConfig (tps_ppm, tvq_ppm, etc.)** | Vivre en base de données | ✅ Via `PolicyConfigRepository` | ✅ **OUI** |

**Verdict :** 0/3 critères Market Pivot respectés pour les comptes et SKUs.

---

## 4. COMPARAISON AVEC POLICYCONFIG (CONFORME)

### PolicyConfig — Implémentation Market Pivot correcte

Fichier : `src/adapters/base44/PolicyConfigAdapter.js`

```javascript
async getConfig(key) {
  const response = await fetch(`${this.baseUrl}/tables/PolicyConfig/records`, {
    query: { key },
  });
  return response.data[0].value;
}
```

**Modèle :**
1. Clés config (tps_ppm, tvq_ppm, balanceDeadlineDays, etc.) vivent en table Base44
2. Valeurs lues **à l'exécution** via API HTTP (pas de cache en dur)
3. Modification = insertion/update une seule ligne en base
4. Change appliquée **instantanément** (prochaine requête lit la nouvelle valeur)

**Résultat :** Market Pivot opérationnel pour PolicyConfig.

---

### Comptes et SKUs — Implémentation NON-conforme

```javascript
// ✗ Code dur — à la compilation
const VALID_ACCOUNT_NUMBERS = new Set([
  '4110', '4120', ..., '7990'  // 75 comptes immutables
]);

// Pour modifier : rebuild + redéploiement
```

**Résultat :** Market Pivot **complètement absent** pour les comptes.

---

## 5. IMPACT OPÉRATIONNEL RÉEL

### Scénario 1 : Ajout d'une ligne comptable

**Situation :** Comptable détecte une charge non catégorisée. Besoin : ajouter compte 6720 « Autres frais administratifs ».

**Avec Market Pivot (attendu) :**
```sql
INSERT INTO LedgerCodeMap (code, label, category, active, createdAt)
VALUES ('6720', 'Autres frais administratifs', 'CHARGES', true, NOW());
```
Temps : ~5 secondes. Effectif dès la prochaine requête.

**Sans Market Pivot (actuel) :**
1. Modifier FinancialLedgerService.js L.60, ajouter '6720'
2. Reconstruire le build TypeScript/Node
3. Tester localement (CHEMIN-NOMINAL-01 + 44 tests P0)
4. Commit + PR review
5. Merge en main
6. Déployer production (restart Base44 ou serveur)
7. Monitoring + rollback si erreur

Temps : ~1 jour. **Risque : bug dans le build bloque toute la comptabilité.**

---

### Scénario 2 : Expansion géographique (Ontario — HST)

**Situation :** Micro Rave s'étend en Ontario. Besoin : activer HST à la place de TPS/TVQ.

**Avec Market Pivot (attendu) :**
```sql
-- Québec (existant)
UPDATE PolicyConfig SET active=false WHERE region='QC';
-- Ontario (nouveau)
INSERT INTO PolicyConfig (key, value, region, active) 
VALUES ('hst_ppm', 130000, 'ON', true);
```
Temps : ~30 secondes. Go live Ontario dès demain.

**Sans Market Pivot (actuel) :**
1. Ajouter `const HST_PPM = 130000` en dur
2. Ajouter logique conditionnelle par région
3. Modifier PolicyConfig schema.js (30+ lignes)
4. Tous les guards dépendant de tps_ppm/tvq_ppm refactorisés
5. Retests complets (mode changement d'architecture)
6. Déploiement risqué (impacts en cascade)

Temps : ~1 semaine. **Risque : la première erreur casse la compta de 2 provinces.**

---

### Scénario 3 : A/B testing d'un nouveau SKU

**Situation :** Micro Rave veut tester un 6e moteur (SKU-PARTENARIAT) avec 10% des événements.

**Avec Market Pivot (attendu) :**
```sql
INSERT INTO SkuRegistry (code, label, active, pctRollout) 
VALUES ('SKU-PARTENARIAT', 'Partenariats de marque', true, 0.1);
```
Dès demain : 10% des événements roulent SKU-PARTENARIAT. Metrics live.

**Sans Market Pivot (actuel) :**
Impossible. Le SKU doit être codé en dur. Pas de rollout graduel. Feature flag manquante.

---

## 6. RECOMMANDATION IMMÉDIATE

### Pré-Event 1 (avant multi-talent)

**Priorité :** 🔴 **BLOQUANT pour expansion géographique + SAAS multi-région**

### Correction à appliquer

#### Étape 1 — Créer table LedgerCodeMap en base

```javascript
// Repository : src/repositories/LedgerCodeMapRepository.js

class LedgerCodeMapRepository {
  constructor(base44Adapter) {
    this.adapter = base44Adapter;
  }

  async getValidAccounts() {
    const records = await this.adapter.query('LedgerCodeMap', { active: true });
    return new Set(records.map(r => r.code));
  }

  async addAccount(code, label, category) {
    return await this.adapter.create('LedgerCodeMap', {
      code, label, category, active: true, createdAt: new Date().toISOString()
    });
  }

  async deactivateAccount(code) {
    return await this.adapter.update('LedgerCodeMap', { code }, { active: false });
  }
}

module.exports = LedgerCodeMapRepository;
```

#### Étape 2 — Créer table SkuRegistry en base

```javascript
// Repository : src/repositories/SkuRegistry.js

class SkuRegistry {
  async getValidSkus() {
    const records = await this.adapter.query('SkuRegistry', { active: true });
    return new Set(records.map(r => r.code));
  }

  async addSku(code, label, description) {
    return await this.adapter.create('SkuRegistry', {
      code, label, description, active: true, createdAt: new Date().toISOString()
    });
  }
}
```

#### Étape 3 — Refactoriser FinancialLedgerService.js

**Avant :**
```javascript
const VALID_ACCOUNT_NUMBERS = new Set(['4110', '4120', ...]);

function validateEntry(entry) {
  if (!VALID_ACCOUNT_NUMBERS.has(entry.account)) {
    throw new Error('Account invalid');
  }
}
```

**Après :**
```javascript
async function validateEntry(entry, repositories) {
  const validAccounts = await repositories.ledgerCodeMap.getValidAccounts();
  if (!validAccounts.has(entry.account)) {
    throw new Error('Account invalid');
  }
}

async function recordTransaction({
  transactionType, entries, repositories, ...
}) {
  for (const entry of entries) {
    await validateEntry(entry, repositories);  // ← passe repositories
  }
  ...
}
```

#### Étape 4 — Seed les données existantes en base

```bash
# Script migration : seed-ledger-code-map.js

const ledgerCodes = [
  { code: '4110', label: 'Comptes chèques', category: 'ACTIFS', active: true },
  { code: '4120', label: 'Comptes épargne', category: 'ACTIFS', active: true },
  // ... 75 codes
  { code: '6690', label: 'Charges fiscales absorbées', category: 'CHARGES_SPECIALES', active: true },
];

for (const code of ledgerCodes) {
  await ledgerCodeMapRepository.addAccount(code);
}

const skus = [
  { code: 'SKU-COURTAGE', label: 'Courtage d\'événementiel', active: true },
  { code: 'SKU-SAAS', label: 'SaaS plateforme', active: true },
  // ... 5 skus
];

for (const sku of skus) {
  await skuRegistry.addSku(sku.code, sku.label);
}
```

#### Étape 5 — Mettre à jour les guards

```javascript
// EventPaymentGuard.js — exemple

async function validateDepositCreation({ engagementId, actor, context, repositories }) {
  const { skuCode } = context;
  
  // ← Lit depuis la base au lieu de la const
  const validSkus = await repositories.skuRegistry.getValidSkus();
  
  if (skuCode && !validSkus.has(skuCode)) {
    return {
      passed: false,
      reason: `INVALID_SKU: "${skuCode}" absent de SkuRegistry.`
    };
  }
  
  return { passed: true };
}
```

---

## 7. TEMPS D'EXÉCUTION

| Tâche | Temps estimé |
|---|---|
| Créer 2 repositories (LedgerCodeMapRepository + SkuRegistry) | 2h |
| Refactoriser FinancialLedgerService.js | 3h |
| Mettre à jour guards (EventPaymentGuard, SealingGuard, etc.) | 2h |
| Créer script seed données existantes | 1h |
| Tests unitaires + intégration | 4h |
| **Total** | **12h** |

Peut être parallélisé sur 2-3 jours. **Non-bloquant pour Event 0B** (configs critiques déjà en PolicyConfig). **Bloquant avant Event 1** (multi-région, A/B testing).

---

## 8. STATUT D'URGENCE

### Par gate

| Gate | Impact | Blocage ? |
|---|---|---|
| **Event 0B** (DJ Alex solo, QC seul) | Zéro — comptes actuels suffisent | ❌ NON |
| **Event 1** (multi-talent, escalade) | Zéro — comptes actuels suffisent | ❌ NON |
| **Event 2+** (commercial live) | Zéro tant que QC seul | ❌ NON |
| **Expansion ON/provinces** | 🔴 Critique — HST requis | ✅ **OUI** |
| **SAAS multi-région** | 🔴 Critique — configs par région | ✅ **OUI** |
| **Portabilité D-132** | 🔴 Critique — schema dépend du code | ✅ **OUI** |

---

## 9. LIGNE DIRECTRICE DOCTRINE

**Pour rester dans l'esprit Market Pivot :**

> Aucune ligne métier comptable, fiscal, ou économique ne doit être codée en dur. Tout ce qui change d'une juridiction à l'autre, d'un client à l'autre, ou d'une saison commerciale à l'autre, vit en base de données.

**Test simple :** Vous déployez Micro Rave en Ontario demain. Si le déploiement demande une modification du code source, c'est une violation Market Pivot.

---

**Fin du rapport — Violation CONFIRMÉE et DOCUMENTÉE.**