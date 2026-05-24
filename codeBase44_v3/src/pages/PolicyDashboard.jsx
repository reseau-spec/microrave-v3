import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import PolicyHeader from "@/components/policy/PolicyHeader";
import CategoryFilter from "@/components/policy/CategoryFilter";
import PolicyTable from "@/components/policy/PolicyTable";
import PolicyFormDialog from "@/components/policy/PolicyFormDialog";

export default function PolicyDashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["policyConfigs"],
    queryFn: () => base44.entities.PolicyConfig.list("-updated_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PolicyConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policyConfigs"] });
      setDialogOpen(false);
      toast({ title: "Configuration créée" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PolicyConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policyConfigs"] });
      setDialogOpen(false);
      setEditingConfig(null);
      toast({ title: "Configuration mise à jour" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PolicyConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policyConfigs"] });
      setDeleteTarget(null);
      toast({ title: "Configuration supprimée" });
    },
  });

  const handleSave = (formData) => {
    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingConfig(null);
    setDialogOpen(true);
  };

  const filtered = configs.filter((c) => {
    const matchSearch =
      !search ||
      c.key?.toLowerCase().includes(search.toLowerCase()) ||
      c.category?.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || c.category === category;
    return matchSearch && matchCategory;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <PolicyHeader
          search={search}
          onSearchChange={setSearch}
          onAdd={handleAdd}
          total={configs.length}
        />

        <CategoryFilter active={category} onChange={setCategory} />

        <PolicyTable configs={filtered} onEdit={handleEdit} onDelete={setDeleteTarget} />

        <PolicyFormDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingConfig(null);
          }}
          config={editingConfig}
          onSave={handleSave}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette configuration ?</AlertDialogTitle>
              <AlertDialogDescription>
                La clé <span className="font-mono text-foreground">{deleteTarget?.key}</span> sera définitivement supprimée.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}