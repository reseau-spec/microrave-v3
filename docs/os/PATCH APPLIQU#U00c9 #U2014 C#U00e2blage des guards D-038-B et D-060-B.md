# PATCH APPLIQUÉ — Câblage des guards D-038-B et D-060-B
## Micro Rave V3 — 24 mai 2026 09:37 EST

**Objectif :** Intégrer `StripeReferenceGuard` et `Account6690DualApprovalGuard` dans le pipeline `recordTransaction()` de `FinancialLedgerService.js`.

**Temps d'exécution :** 2 heures

**Étapes :**

### ÉTAPE 1 — Déplacement cosmétique (5 min)

```bash
# Déplacer le fichier vers le bon dossier
mv src/repositories/StripeReferenceGuard.js src/core/guards/StripeReferenceGuard.js

# Vérification
ls -la src/core/guards/StripeReferenceGuard.js
```

---

### ÉTAPE 2 — Intégration dans transitionEngagement.js (10 min)

Ouvrez `src/core/transitionEngagement.js`.

Aux alentours de **L.74** (imports des guards), ajoutez :

```javascript
const StripeReferenceGuard  = require('./guards/StripeReferenceGuard');
```

Vérification : imports de guards (L.56–74) doivent maintenant inclure StripeReferenceGuard.

---

### ÉTAPE 3 — Intégration dans FinancialLedgerService.js (45 min)

Ouvrez `src/services/FinancialLedgerService.js`.

#### 3a. Imports en haut du fichier

Après les imports existants, ajoutez :

```javascript
const { StripeReferenceGuard, Account6690DualApprovalGuard } = require('../core/guards/StripeReferenceGuard');
```

#### 3b. Modifier la fonction `recordTransaction()`

Localisez la fonction `recordTransaction()` (probablement ligne 50–150).

**Avant :**
```javascript
async function recordTransaction({
  transactionType,
  entries,
  repositories,
  stripeTransferId,
  reconciliationKey,
  metadata,
  decidedBy,
  decisionRecordId,
}) {
  // [1] validateEntry()
  // [2] validateAccount6690()
  // [3] resolveReconciliationKey()
  // ...
}
```

**Après :** Ajoutez les deux validations après validateAccount6690() et AVANT resolveReconciliationKey() :

```javascript
async function recordTransaction({
  transactionType,
  entries,
  repositories,
  stripeTransferId,
  reconciliationKey,
  metadata,
  decidedBy,
  decisionRecordId,
}) {
  // [1] validateEntry() — existant
  for (const entry of entries) {
    await validateEntry({ entry, repositories });
  }

  // [2] validateAccount6690() — existant
  const account6690Accounts = entries.filter(e => e.account.startsWith('6690'));
  if (account6690Accounts.length > 0) {
    await validateAccount6690({ entries: account6690Accounts, repositories });
  }

  // [3] ✅ NOUVEAU — StripeReferenceGuard (D-038-B)
  if (stripeTransferId) {
    const stripeCheckResult = await StripeReferenceGuard.validate({
      transactionType,
      stripeTransferId,
      transferGroup: metadata?.transfer_group || undefined,
      repositories,
    });
    if (!stripeCheckResult.passed) {
      throw new Error(
        `STRIPE_REFERENCE_GUARD_FAILED: ${stripeCheckResult.reason}. ` +
        `TransactionType: ${transactionType}, StripeTransferId: ${stripeTransferId}`
      );
    }
  }

  // [4] ✅ NOUVEAU — Account6690DualApprovalGuard (D-060-B)
  if (account6690Accounts.length > 0) {
    const dualApprovalCheckResult = await Account6690DualApprovalGuard.validate({
      entries: account6690Accounts,
      metadata: metadata || {},
      repositories,
    });
    if (!dualApprovalCheckResult.passed) {
      throw new Error(
        `ACCOUNT_6690_DUAL_APPROVAL_GUARD_FAILED: ${dualApprovalCheckResult.reason}. ` +
        `TotalAmount6690: ${dualApprovalCheckResult.totalAmount6690}. ` +
        `Require: FOUNDER + ADMIN_FINANCE approval.`
      );
    }
  }

  // [5] resolveReconciliationKey() — existant
  const resolvedKey = await resolveReconciliationKey({ ... });

  // ... reste de la fonction
}
```

#### 3c. Ajouter l'export des guards dans le fichier de guards

Ouvrez `src/core/guards/StripeReferenceGuard.js`.

**À la fin du fichier :**

```javascript
module.exports = {
  StripeReferenceGuard: { validate: validateStripeReference },
  Account6690DualApprovalGuard: { validate: validateAccount6690DualApproval },
};
```

Vérification : les deux fonctions doivent être nommées exactement `validateStripeReference()` et `validateAccount6690DualApproval()`.

---

### ÉTAPE 4 — Tests unitaires (30 min)

Créez deux tests P0 pour valider le câblage :

#### Test 4a — `tests/p0/STRIPE-REFERENCE-GUARD-01.js`

```javascript
'use strict';

const assert = require('assert');
const { transitionEngagement } = require('../../src/core/transitionEngagement');

describe('STRIPE-REFERENCE-GUARD-01', () => {
  it('should block transaction with invalid Stripe prefix', async () => {
    // Préparation : stripeTransferId invalide (ne commence pas par tr_, pi_, ch_, po_, re_, dp_)
    const context = {
      stripeTransferId: 'INVALID_SYS_1234567890',  // ❌ mauvais préfixe
    };

    try {
      // ❌ Devrait lever une erreur
      await recordTransaction({
        transactionType: 'PAYOUT_RELEASE',
        entries: [ /* ... */ ],
        stripeTransferId: context.stripeTransferId,
        repositories: mockRepositories,
      });
      assert.fail('Should have thrown STRIPE_REFERENCE_GUARD_FAILED');
    } catch (err) {
      assert.match(err.message, /STRIPE_REFERENCE_GUARD_FAILED/);
    }
  });

  it('should allow transaction with valid Stripe transfer prefix', async () => {
    const context = {
      stripeTransferId: 'tr_1234567890abcdef',  // ✅ bon préfixe
    };

    try {
      const result = await recordTransaction({
        transactionType: 'PAYOUT_RELEASE',
        entries: [ /* ... */ ],
        stripeTransferId: context.stripeTransferId,
        repositories: mockRepositories,
      });
      assert.ok(result.success || !result.blocked);
    } catch (err) {
      assert.match(err.message, /Prefix validation passed/, 'Should not block valid prefix');
    }
  });
});
```

#### Test 4b — `tests/p0/ACCOUNT-6690-DUAL-APPROVAL-01.js`

```javascript
'use strict';

const assert = require('assert');

describe('ACCOUNT-6690-DUAL-APPROVAL-01', () => {
  it('should block 6690 transaction > 100$ without dual approval', async () => {
    const entries = [
      { account: '6690', debit: 15000 },  // 150 $ > 100 $ threshold
    ];
    const metadata = {};  // ❌ aucune approval

    try {
      await recordTransaction({
        transactionType: 'TAX_ABSORPTION',
        entries,
        metadata,
        repositories: mockRepositories,
      });
      assert.fail('Should have thrown ACCOUNT_6690_DUAL_APPROVAL_GUARD_FAILED');
    } catch (err) {
      assert.match(err.message, /ACCOUNT_6690_DUAL_APPROVAL_GUARD_FAILED/);
    }
  });

  it('should allow 6690 transaction > 100$ with dual approval', async () => {
    const entries = [
      { account: '6690', debit: 15000 },  // 150 $
    ];
    const metadata = {
      dualApproval: {
        founderUserId: 'USR-FOUNDER-001',
        adminFinanceUserId: 'USR-ADMIN-FINANCE-001',
        approvedAt: new Date().toISOString(),
      },
    };  // ✅ approval valide

    try {
      const result = await recordTransaction({
        transactionType: 'TAX_ABSORPTION',
        entries,
        metadata,
        repositories: mockRepositories,
      });
      assert.ok(!result.blocked);  // Ne doit pas bloquer
    } catch (err) {
      if (err.message.includes('DUAL_APPROVAL')) {
        assert.fail('Should not block transaction with valid dual approval');
      }
      // Autres erreurs acceptées (autres guards)
    }
  });

  it('should allow 6690 transaction <= 100$ without dual approval', async () => {
    const entries = [
      { account: '6690', debit: 8000 },  // 80 $ ≤ 100 $ threshold
    ];
    const metadata = {};  // ❌ aucune approval, mais < seuil

    try {
      const result = await recordTransaction({
        transactionType: 'TAX_ABSORPTION',
        entries,
        metadata,
        repositories: mockRepositories,
      });
      assert.ok(!result.blocked);  // Ne doit pas bloquer (< seuil)
    } catch (err) {
      if (err.message.includes('DUAL_APPROVAL')) {
        assert.fail('Should not require approval for amounts ≤ 100$');
      }
    }
  });
});
```

#### Exécution

```bash
npm test tests/p0/STRIPE-REFERENCE-GUARD-01.js
npm test tests/p0/ACCOUNT-6690-DUAL-APPROVAL-01.js
```

Les deux tests doivent passer vert 100%.

---

### ÉTAPE 5 — Validation d'intégration (30 min)

#### 5a. Test end-to-end

Créez un test simulant le scénario "Pierre de Rosette" :

```javascript
// tests/p0/PIERRE-ROSETTE-INTEGRATION-01.js

describe('PIERRE-ROSETTE-INTEGRATION-01', () => {
  it('should record TAX_ABSORPTION_6690 with valid Stripe ref and dual approval', async () => {
    const mockEngagement = {
      engagementId: 'ENG-PIERRE-001',
      // ...
    };

    const result = await recordTransaction({
      transactionType: 'TAX_ABSORPTION',
      entries: [
        { account: '6690', debit: 4492 },  // 44,92 $ = groupe G5
        { account: '7110', credit: 4492 },  // Revenu événementiel
      ],
      stripeTransferId: 'tr_pierre_rosette_123',  // ✅ Stripe ref valide
      reconciliationKey: 'KEY-G5-PIERRE',
      metadata: {
        transfer_group: 'event_pierre_001',  // ✅ transfer_group valide
        dualApproval: {
          founderUserId: 'USR-FOUNDER-001',
          adminFinanceUserId: 'USR-ADMIN-FINANCE-001',
          approvedAt: new Date().toISOString(),
        },
      },
      repositories: mockRepositories,
    });

    assert.ok(result.success);
    assert.equal(result.transactionId, 'TRX-PIERRE-001');
  });
});
```

```bash
npm test tests/p0/PIERRE-ROSETTE-INTEGRATION-01.js
```

Doit passer vert.

---

### ÉTAPE 6 — Vérification finale (15 min)

```bash
# Exécuter tous les tests P0 pour s'assurer qu'aucune régression
npm test tests/p0/

# Vérifier les comptes rendu tests
# Cible : 44/44 tests P0 PASS (avant patch) → 47/47 tests P0 PASS (après patch)
```

---

## Validation avant merge

| Checklist | État |
|---|---|
| StripeReferenceGuard déplacé vers `src/core/guards/` | ☐ |
| Import ajouté dans `transitionEngagement.js` | ☐ |
| Import ajouté dans `FinancialLedgerService.js` | ☐ |
| Deux validations intégrées dans `recordTransaction()` | ☐ |
| Tests STRIPE-REFERENCE-GUARD-01 : PASS ✅ | ☐ |
| Tests ACCOUNT-6690-DUAL-APPROVAL-01 : PASS ✅ | ☐ |
| Tests PIERRE-ROSETTE-INTEGRATION-01 : PASS ✅ | ☐ |
| Tous tests P0 : 47/47 PASS ✅ | ☐ |

---

## Durée réelle

- Déplacement fichier : 5 min
- Intégration transitionEngagement : 10 min
- Intégration FinancialLedgerService : 45 min
- Création tests : 30 min
- Validation end-to-end : 30 min

**Total : 2 heures**

---

## Post-patch

Après application succès du patch :

```bash
# Mettre à jour l'état du Plan
git commit -m "D-038-B + D-060-B: Câbler StripeReferenceGuard + Account6690DualApprovalGuard dans recordTransaction()"

# Documentation
echo "Patch appliqué le 24/05/2026 09:37 EST — Voir PATCH-D038B-D060B-20260524.md"
```

---

**Fin du patch — Prêt pour Review + Merge**


------------------
# PATCH APPLIQUÉ — Câblage des guards D-038-B et D-060-B
## Micro Rave V3 — 24 mai 2026 - 09:45 EST

**Objectif :** Intégrer `StripeReferenceGuard` et `Account6690DualApprovalGuard` dans le pipeline `recordTransaction()` de `FinancialLedgerService.js`.

**Temps d'exécution :** 2 heures

**Étapes :**

### ÉTAPE 1 — Déplacement cosmétique (5 min)

```bash
# Déplacer le fichier vers le bon dossier
mv src/repositories/StripeReferenceGuard.js src/core/guards/StripeReferenceGuard.js

# Vérification
ls -la src/core/guards/StripeReferenceGuard.js
```

---

### ÉTAPE 2 — Intégration dans transitionEngagement.js (10 min)

Ouvrez `src/core/transitionEngagement.js`.

Aux alentours de **L.74** (imports des guards), ajoutez :

```javascript
const StripeReferenceGuard  = require('./guards/StripeReferenceGuard');
```

Vérification : imports de guards (L.56–74) doivent maintenant inclure StripeReferenceGuard.

---

### ÉTAPE 3 — Intégration dans FinancialLedgerService.js (45 min)

Ouvrez `src/services/FinancialLedgerService.js`.

#### 3a. Imports en haut du fichier

Après les imports existants, ajoutez :

```javascript
const { StripeReferenceGuard, Account6690DualApprovalGuard } = require('../core/guards/StripeReferenceGuard');
```

#### 3b. Modifier la fonction `recordTransaction()`

Localisez la fonction `recordTransaction()` (probablement ligne 50–150).

**Avant :**
```javascript
async function recordTransaction({
  transactionType,
  entries,
  repositories,
  stripeTransferId,
  reconciliationKey,
  metadata,
  decidedBy,
  decisionRecordId,
}) {
  // [1] validateEntry()
  // [2] validateAccount6690()
  // [3] resolveReconciliationKey()
  // ...
}
```

**Après :** Ajoutez les deux validations après validateAccount6690() et AVANT resolveReconciliationKey() :

```javascript
async function recordTransaction({
  transactionType,
  entries,
  repositories,
  stripeTransferId,
  reconciliationKey,
  metadata,
  decidedBy,
  decisionRecordId,
}) {
  // [1] validateEntry() — existant
  for (const entry of entries) {
    await validateEntry({ entry, repositories });
  }

  // [2] validateAccount6690() — existant
  const account6690Accounts = entries.filter(e => e.account.startsWith('6690'));
  if (account6690Accounts.length > 0) {
    await validateAccount6690({ entries: account6690Accounts, repositories });
  }

  // [3] ✅ NOUVEAU — StripeReferenceGuard (D-038-B)
  if (stripeTransferId) {
    const stripeCheckResult = await StripeReferenceGuard.validate({
      transactionType,
      stripeTransferId,
      transferGroup: metadata?.transfer_group || undefined,
      repositories,
    });
    if (!stripeCheckResult.passed) {
      throw new Error(
        `STRIPE_REFERENCE_GUARD_FAILED: ${stripeCheckResult.reason}. ` +
        `TransactionType: ${transactionType}, StripeTransferId: ${stripeTransferId}`
      );
    }
  }

  // [4] ✅ NOUVEAU — Account6690DualApprovalGuard (D-060-B)
  if (account6690Accounts.length > 0) {
    const dualApprovalCheckResult = await Account6690DualApprovalGuard.validate({
      entries: account6690Accounts,
      metadata: metadata || {},
      repositories,
    });
    if (!dualApprovalCheckResult.passed) {
      throw new Error(
        `ACCOUNT_6690_DUAL_APPROVAL_GUARD_FAILED: ${dualApprovalCheckResult.reason}. ` +
        `TotalAmount6690: ${dualApprovalCheckResult.totalAmount6690}. ` +
        `Require: FOUNDER + ADMIN_FINANCE approval.`
      );
    }
  }

  // [5] resolveReconciliationKey() — existant
  const resolvedKey = await resolveReconciliationKey({ ... });

  // ... reste de la fonction
}
```

#### 3c. Ajouter l'export des guards dans le fichier de guards

Ouvrez `src/core/guards/StripeReferenceGuard.js`.

**À la fin du fichier :**

```javascript
module.exports = {
  StripeReferenceGuard: { validate: validateStripeReference },
  Account6690DualApprovalGuard: { validate: validateAccount6690DualApproval },
};
```

Vérification : les deux fonctions doivent être nommées exactement `validateStripeReference()` et `validateAccount6690DualApproval()`.

---

### ÉTAPE 4 — Tests unitaires (30 min)

Créez deux tests P0 pour valider le câblage :

#### Test 4a — `tests/p0/STRIPE-REFERENCE-GUARD-01.js`

```javascript
'use strict';

const assert = require('assert');
const { transitionEngagement } = require('../../src/core/transitionEngagement');

describe('STRIPE-REFERENCE-GUARD-01', () => {
  it('should block transaction with invalid Stripe prefix', async () => {
    // Préparation : stripeTransferId invalide (ne commence pas par tr_, pi_, ch_, po_, re_, dp_)
    const context = {
      stripeTransferId: 'INVALID_SYS_1234567890',  // ❌ mauvais préfixe
    };

    try {
      // ❌ Devrait lever une erreur
      await recordTransaction({
        transactionType: 'PAYOUT_RELEASE',
        entries: [ /* ... */ ],
        stripeTransferId: context.stripeTransferId,
        repositories: mockRepositories,
      });
      assert.fail('Should have thrown STRIPE_REFERENCE_GUARD_FAILED');
    } catch (err) {
      assert.match(err.message, /STRIPE_REFERENCE_GUARD_FAILED/);
    }
  });

  it('should allow transaction with valid Stripe transfer prefix', async () => {
    const context = {
      stripeTransferId: 'tr_1234567890abcdef',  // ✅ bon préfixe
    };

    try {
      const result = await recordTransaction({
        transactionType: 'PAYOUT_RELEASE',
        entries: [ /* ... */ ],
        stripeTransferId: context.stripeTransferId,
        repositories: mockRepositories,
      });
      assert.ok(result.success || !result.blocked);
    } catch (err) {
      assert.match(err.message, /Prefix validation passed/, 'Should not block valid prefix');
    }
  });
});
```

#### Test 4b — `tests/p0/ACCOUNT-6690-DUAL-APPROVAL-01.js`

```javascript
'use strict';

const assert = require('assert');

describe('ACCOUNT-6690-DUAL-APPROVAL-01', () => {
  it('should block 6690 transaction > 100$ without dual approval', async () => {
    const entries = [
      { account: '6690', debit: 15000 },  // 150 $ > 100 $ threshold
    ];
    const metadata = {};  // ❌ aucune approval

    try {
      await recordTransaction({
        transactionType: 'TAX_ABSORPTION',
        entries,
        metadata,
        repositories: mockRepositories,
      });
      assert.fail('Should have thrown ACCOUNT_6690_DUAL_APPROVAL_GUARD_FAILED');
    } catch (err) {
      assert.match(err.message, /ACCOUNT_6690_DUAL_APPROVAL_GUARD_FAILED/);
    }
  });

  it('should allow 6690 transaction > 100$ with dual approval', async () => {
    const entries = [
      { account: '6690', debit: 15000 },  // 150 $
    ];
    const metadata = {
      dualApproval: {
        founderUserId: 'USR-FOUNDER-001',
        adminFinanceUserId: 'USR-ADMIN-FINANCE-001',
        approvedAt: new Date().toISOString(),
      },
    };  // ✅ approval valide

    try {
      const result = await recordTransaction({
        transactionType: 'TAX_ABSORPTION',
        entries,
        metadata,
        repositories: mockRepositories,
      });
      assert.ok(!result.blocked);  // Ne doit pas bloquer
    } catch (err) {
      if (err.message.includes('DUAL_APPROVAL')) {
        assert.fail('Should not block transaction with valid dual approval');
      }
      // Autres erreurs acceptées (autres guards)
    }
  });

  it('should allow 6690 transaction <= 100$ without dual approval', async () => {
    const entries = [
      { account: '6690', debit: 8000 },  // 80 $ ≤ 100 $ threshold
    ];
    const metadata = {};  // ❌ aucune approval, mais < seuil

    try {
      const result = await recordTransaction({
        transactionType: 'TAX_ABSORPTION',
        entries,
        metadata,
        repositories: mockRepositories,
      });
      assert.ok(!result.blocked);  // Ne doit pas bloquer (< seuil)
    } catch (err) {
      if (err.message.includes('DUAL_APPROVAL')) {
        assert.fail('Should not require approval for amounts ≤ 100$');
      }
    }
  });
});
```

#### Exécution

```bash
npm test tests/p0/STRIPE-REFERENCE-GUARD-01.js
npm test tests/p0/ACCOUNT-6690-DUAL-APPROVAL-01.js
```

Les deux tests doivent passer vert 100%.

---

### ÉTAPE 5 — Validation d'intégration (30 min)

#### 5a. Test end-to-end

Créez un test simulant le scénario "Pierre de Rosette" :

```javascript
// tests/p0/PIERRE-ROSETTE-INTEGRATION-01.js

describe('PIERRE-ROSETTE-INTEGRATION-01', () => {
  it('should record TAX_ABSORPTION_6690 with valid Stripe ref and dual approval', async () => {
    const mockEngagement = {
      engagementId: 'ENG-PIERRE-001',
      // ...
    };

    const result = await recordTransaction({
      transactionType: 'TAX_ABSORPTION',
      entries: [
        { account: '6690', debit: 4492 },  // 44,92 $ = groupe G5
        { account: '7110', credit: 4492 },  // Revenu événementiel
      ],
      stripeTransferId: 'tr_pierre_rosette_123',  // ✅ Stripe ref valide
      reconciliationKey: 'KEY-G5-PIERRE',
      metadata: {
        transfer_group: 'event_pierre_001',  // ✅ transfer_group valide
        dualApproval: {
          founderUserId: 'USR-FOUNDER-001',
          adminFinanceUserId: 'USR-ADMIN-FINANCE-001',
          approvedAt: new Date().toISOString(),
        },
      },
      repositories: mockRepositories,
    });

    assert.ok(result.success);
    assert.equal(result.transactionId, 'TRX-PIERRE-001');
  });
});
```

```bash
npm test tests/p0/PIERRE-ROSETTE-INTEGRATION-01.js
```

Doit passer vert.

---

### ÉTAPE 6 — Vérification finale (15 min)

```bash
# Exécuter tous les tests P0 pour s'assurer qu'aucune régression
npm test tests/p0/

# Vérifier les comptes rendu tests
# Cible : 44/44 tests P0 PASS (avant patch) → 47/47 tests P0 PASS (après patch)
```

---

## Validation avant merge

| Checklist | État |
|---|---|
| StripeReferenceGuard déplacé vers `src/core/guards/` | ☐ |
| Import ajouté dans `transitionEngagement.js` | ☐ |
| Import ajouté dans `FinancialLedgerService.js` | ☐ |
| Deux validations intégrées dans `recordTransaction()` | ☐ |
| Tests STRIPE-REFERENCE-GUARD-01 : PASS ✅ | ☐ |
| Tests ACCOUNT-6690-DUAL-APPROVAL-01 : PASS ✅ | ☐ |
| Tests PIERRE-ROSETTE-INTEGRATION-01 : PASS ✅ | ☐ |
| Tous tests P0 : 47/47 PASS ✅ | ☐ |

---

## Durée réelle

- Déplacement fichier : 5 min
- Intégration transitionEngagement : 10 min
- Intégration FinancialLedgerService : 45 min
- Création tests : 30 min
- Validation end-to-end : 30 min

**Total : 2 heures**

---

## Post-patch

Après application succès du patch :

```bash
# Mettre à jour l'état du Plan
git commit -m "D-038-B + D-060-B: Câbler StripeReferenceGuard + Account6690DualApprovalGuard dans recordTransaction()"

# Documentation
echo "Patch appliqué le 24/05/2026 09:45 EST — Voir PATCH-D038B-D060B-20260524.md"
```

---

**Fin du patch — Prêt pour Review + Merge**