# Description du changement

## Ce que cette PR fait
<!-- Décrivez en 2-3 phrases ce qui change -->

## Type de changement
- [ ] Logique métier (core/)
- [ ] Interface repository
- [ ] Adapter Base44
- [ ] Test P0
- [ ] Config / PolicyConfig
- [ ] Proxy Stripe
- [ ] Documentation

## Checklist avant merge sur main

### Obligatoire
- [ ] Testé sur `dev` sans erreur
- [ ] Testé sur `staging` sans erreur
- [ ] Aucune constante financière hardcodée dans le code (tout passe par `getConfig()`)
- [ ] Aucun secret dans le code ou les logs
- [ ] Chaque nouvel objet utilise `IDFactory.generate()`
- [ ] Le ledger balance (si changement financier) — solde 5200 = 0

### Si changement financier
- [ ] LEDGER-INV-01 PASSED : `sum(nets) + sum(commissions) = prix_vendu`
- [ ] DOUBLE-PAY-01 PASSED : les 6 verrous anti-double payout tiennent
- [ ] Doctrine A respectée : `4410/4420 = 0` à l'encaissement

### Si changement de config critique
- [ ] PolicyConfigChangeRecord créé
- [ ] Double validation si config CRITIQUE (TaxConfig, LedgerCodeMap, MembershipPlan)

## Tests
<!-- Quels tests ont été exécutés? Résultats? -->
