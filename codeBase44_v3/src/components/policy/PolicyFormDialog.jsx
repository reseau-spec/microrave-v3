import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ShieldAlert } from "lucide-react";

// Source : OS V10 section 3.2 — standard numérique invariant
// PPM = parts par million (taux). CENTS = montant entier. ENUM = valeur d'une liste.
const VALUE_TYPES = [
  { value: "PPM",     label: "PPM — parts par million (taux)",      example: "50000 = 5,0%" },
  { value: "CENTS",   label: "CENTS — montant entier en cents CAD", example: "350000 = 3 500$" },
  { value: "ENUM",    label: "ENUM — valeur d'une liste définie",   example: "DEBOURS" },
  { value: "STRING",  label: "STRING — texte libre",                example: "talent_payable" },
  { value: "BOOLEAN", label: "BOOLEAN — vrai/faux",                 example: "true" },
  { value: "JSON",    label: "JSON — objet structuré",              example: '{"key":"val"}' },
  { value: "URL",     label: "URL — adresse web",                   example: "https://..." },
  { value: "NUMBER",  label: "NUMBER — nombre entier",              example: "30" },
];

// Source : OS V10 section 9.6 — Classification des configs
const CATEGORIES = [
  { value: "CRITIQUE",     label: "CRITIQUE",     desc: "Double validation. TaxConfig, LedgerCodeMap, MembershipPlan.", alert: true },
  { value: "ELEVE",        label: "ÉLEVÉ",        desc: "PresencePolicyConfig, KYCPolicyConfig, CronBudgetPolicyConfig.", alert: false },
  { value: "STANDARD",     label: "STANDARD",     desc: "EventPaymentConfig, DisputePolicyConfig, LiquidityPolicyConfig.", alert: false },
  { value: "OPERATIONNEL", label: "OPÉRATIONNEL", desc: "SchedulerCreditBudget, SOTSCalculationPolicyConfig.", alert: false },
];

const emptyForm = {
  key: "",
  value: "",
  value_type: "STRING",
  category: "STANDARD",
  description: "",
};

export default function PolicyFormDialog({ open, onOpenChange, config, onSave, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const isEditing = !!config;
  const isCritique = form.category === "CRITIQUE";

  useEffect(() => {
    if (config) {
      setForm({
        key:        config.key        || "",
        value:      config.value      || "",
        value_type: config.value_type || "STRING",
        category:   config.category   || "STANDARD",
        description: config.description || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [config, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const selectedType = VALUE_TYPES.find(t => t.value === form.value_type);
  const selectedCat  = CATEGORIES.find(c => c.value === form.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            {isEditing ? "Modifier la config" : "Nouvelle config"}
            {isCritique && (
              <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30 gap-1">
                <ShieldAlert className="w-3 h-3" />
                CRITIQUE
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Avertissement config CRITIQUE — OS V10 section 9.5 */}
        {isCritique && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive leading-relaxed">
              Configuration CRITIQUE — toute modification produit un <span className="font-semibold">AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord</span> obligatoires. Source : OS V10 section 9.5.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Clé */}
          <div className="space-y-2">
            <Label htmlFor="key" className="text-sm text-muted-foreground">
              Clé <span className="text-xs">(immuable après création)</span>
            </Label>
            <Input
              id="key"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="ex: tps_ppm, stripe_fixe_cents"
              className="font-mono text-sm bg-muted/50"
              disabled={isEditing}
              required
            />
          </div>

          {/* Type + Catégorie */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Type de valeur</Label>
              <Select value={form.value_type} onValueChange={(v) => setForm({ ...form, value_type: v })}>
                <SelectTrigger className="bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALUE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="font-mono text-xs">{t.value}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedType && (
                <p className="text-xs text-muted-foreground">Ex: {selectedType.example}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className={`bg-muted/50 ${isCritique ? "border-destructive/40" : ""}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className={c.alert ? "text-destructive font-semibold" : ""}>{c.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCat && (
                <p className="text-xs text-muted-foreground">{selectedCat.desc}</p>
              )}
            </div>
          </div>

          {/* Valeur */}
          <div className="space-y-2">
            <Label htmlFor="value" className="text-sm text-muted-foreground">
              Valeur
              {form.value_type === "PPM" && (
                <span className="ml-2 text-xs text-muted-foreground">(entier — 50000 = 5,0%)</span>
              )}
              {form.value_type === "CENTS" && (
                <span className="ml-2 text-xs text-muted-foreground">(entier — 20000 = 200,00$)</span>
              )}
            </Label>
            <Textarea
              id="value"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="Valeur de la configuration"
              className="font-mono text-sm bg-muted/50 min-h-[60px]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm text-muted-foreground">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Impact métier de cette configuration"
              className="bg-muted/50"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !form.key}
              className={isCritique ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {isSaving ? "Enregistrement…" : isEditing ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}