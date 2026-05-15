# Micro Rave V3 — Operating System

**Architecture souveraine — V7 FINAL**

---

## Structure des branches

| Branche | Usage |
|---|---|
| `dev` | Travail quotidien — tout nouveau code commence ici |
| `staging` | Test complet avant mise en production |
| `main` | Production uniquement — PR obligatoire, jamais de push direct |

## Règle absolue
> Le code Base44 ne contient jamais la vérité métier.
> Il appelle des fonctions métier portables définies dans `src/core/`.

## Structure du projet

```
src/core/          → Logique métier portable (jamais propriété de Base44)
src/repositories/  → Interfaces d'accès aux données (adapter pattern)
src/adapters/      → Couche Base44 (remplaceable par PostgreSQL sans changer core/)
stripe-webhook-proxy/ → Proxy Stripe si Base44 ne peut pas valider le raw body
tests/p0/          → Tests bloquants — LEDGER-INV-01, DOUBLE-PAY-01
tests/scenarios/   → SC-01, SC-05, SC-06, SC-07...
config/            → Schémas de configuration (pas les valeurs secrètes)
```

## Avant d'écrire la moindre logique financière

1. `getConfig()` fonctionne et throw si une clé est absente ✓
2. `IDFactory.generate('Event')` retourne `EVT-XXXX-XXXXXX` ✓
3. Test `WEBHOOK-RAWBODY-01` PASSED (Stripe) ✓
4. Les 12 PolicyConfig fondamentales sont en database ✓

## Variables d'environnement requises

Copier `.env.example` → `.env` (jamais committer `.env`)

## Références
- OS souverain : MICRORAVE_V3_OPERATING_SYSTEM_V7_FINAL
- Doctrine fiscale : Doctrine A — Commission MR = ventilation interne
- Ledger : 4310 / 4325 / 4326 / 4530 / 4190 → solde 5200 = 0
