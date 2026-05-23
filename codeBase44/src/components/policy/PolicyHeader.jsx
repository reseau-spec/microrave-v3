import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Zap } from "lucide-react";

export default function PolicyHeader({ search, onSearchChange, onAdd, total }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Policy Config</h1>
          <p className="text-sm text-muted-foreground">
            {total} configuration{total !== 1 ? "s" : ""} enregistrée{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher par clé, catégorie…"
            className="pl-9 bg-muted/40 border-border/50"
          />
        </div>
        <Button onClick={onAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          Ajouter
        </Button>
      </div>
    </div>
  );
}