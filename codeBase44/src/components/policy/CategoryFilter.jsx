import React from "react";
import { Badge } from "@/components/ui/badge";

// Source : OS V10 section 9.6 — Classification des configs
// CRITIQUE = double validation / ELEVE = accès restreint
// STANDARD = modification standard / OPERATIONNEL = modification courante
const CATEGORIES = [
  { value: "all",          label: "Toutes",       color: "" },
  { value: "CRITIQUE",     label: "Critique",     color: "bg-destructive/15 text-destructive border-destructive/30" },
  { value: "ELEVE",        label: "Élevé",        color: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  { value: "STANDARD",     label: "Standard",     color: "bg-primary/15 text-primary border-primary/20" },
  { value: "OPERATIONNEL", label: "Opérationnel", color: "bg-muted text-muted-foreground border-border" },
];

export default function CategoryFilter({ active, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className="focus:outline-none"
        >
          <Badge
            variant={active === cat.value ? "default" : "outline"}
            className={`cursor-pointer text-xs transition-all ${
              active === cat.value
                ? cat.value === "all"
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : `${cat.color} shadow-sm font-semibold`
                : `text-muted-foreground hover:text-foreground hover:border-foreground/30 ${cat.color}`
            }`}
          >
            {cat.label}
          </Badge>
        </button>
      ))}
    </div>
  );
}