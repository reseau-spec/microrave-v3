import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Source : OS V10 section 9.6 — Classification des configs
const categoryStyles = {
  CRITIQUE:     "bg-destructive/15 text-destructive border-destructive/30",
  ELEVE:        "bg-orange-500/15 text-orange-500 border-orange-500/30",
  STANDARD:     "bg-primary/15 text-primary border-primary/20",
  OPERATIONNEL: "bg-muted text-muted-foreground border-border",
  // Fallback pour les configs Base44 génériques (non Micro Rave)
  general:       "bg-muted text-muted-foreground border-border",
  security:      "bg-destructive/10 text-destructive/70 border-destructive/20",
  limits:        "bg-chart-4/15 text-chart-4 border-chart-4/20",
  features:      "bg-accent/15 text-accent border-accent/20",
  notifications: "bg-chart-3/15 text-chart-3 border-chart-3/20",
  integrations:  "bg-chart-5/15 text-chart-5 border-chart-5/20",
};

// Source : OS V10 section 3.2 — standard numérique invariant
const typeStyles = {
  PPM:     "bg-chart-4/10 text-chart-4 border-chart-4/20",
  CENTS:   "bg-primary/10 text-primary border-primary/20",
  ENUM:    "bg-accent/10 text-accent border-accent/20",
  STRING:  "bg-muted text-muted-foreground",
  BOOLEAN: "bg-chart-3/10 text-chart-3",
  JSON:    "bg-primary/10 text-primary",
  URL:     "bg-chart-5/10 text-chart-5",
  NUMBER:  "bg-chart-4/10 text-chart-4",
  // Fallback types Base44 génériques
  string:  "bg-muted text-muted-foreground",
  number:  "bg-chart-4/10 text-chart-4",
  boolean: "bg-accent/10 text-accent",
  json:    "bg-primary/10 text-primary",
  url:     "bg-chart-5/10 text-chart-5",
};

// Configs CRITIQUE — suppression interdite par OS V10 section 9.4 + 9.5
// Un POLICY_ADMIN ne peut pas supprimer une config CRITIQUE depuis l'UI.
// Toute suppression exige : AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord.
const CRITIQUE_KEYS = [
  "payment_fees_tax_treatment",
  "tps_ppm",
  "tvq_ppm",
  "event_payment_cap_cents",
];

function isCritiqueConfig(config) {
  return config.category === "CRITIQUE" || CRITIQUE_KEYS.includes(config.key);
}

export default function PolicyTable({ configs, onEdit, onDelete }) {
  if (!configs || configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <span className="text-2xl opacity-50">⚙️</span>
        </div>
        <p className="text-sm">Aucune configuration trouvée</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clé</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valeur</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catégorie</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {configs.map((config) => {
                const critique = isCritiqueConfig(config);
                return (
                  <motion.tr
                    key={config.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${
                      critique ? "bg-destructive/5" : ""
                    }`}
                  >
                    <TableCell className="font-mono text-sm font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        {critique && (
                          <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0" />
                        )}
                        {config.key}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground max-w-[180px] truncate">
                      {config.value || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs font-mono ${typeStyles[config.value_type] || typeStyles.string}`}>
                        {config.value_type || "string"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${categoryStyles[config.category] || categoryStyles.general}`}>
                        {config.category || "general"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {config.description || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => onEdit(config)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>

                        {critique ? (
                          // Suppression bloquée pour les configs CRITIQUE — OS V10 section 9.4
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground/30 cursor-not-allowed"
                                  disabled
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[220px] text-xs">
                              Suppression interdite — config CRITIQUE. Toute modification exige AdminAction + DataAccessLedgerEntry. Source : OS V10 section 9.5.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => onDelete(config)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}