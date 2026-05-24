/**
 * ProgrammeView — Vue programme de l'EventLobby (placements finaux).
 * Extrait de EventLobby.jsx pour réduire la taille du fichier.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FileText, Eye, EyeOff } from 'lucide-react';
import { buildPresenceBlocks } from './LineupBoard';

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHHMM(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d)) return '--:--';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function durationLabel(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return '';
  const diffMin = Math.round((new Date(isoEnd) - new Date(isoStart)) / 60000);
  if (diffMin <= 0) return '';
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}min`;
}

export default function ProgrammeView({ session, roleMap, styleMap, profileMap, currentUserId, isOrganizer }) {
  const scenes = session?.scenes || [];
  const schedule = session?.schedule || [];
  const slots = session?.slots || [];

  // v2 fix — exclure les candidats rejetés ou non-confirmés du programme et du budget.
  // Un candidat avec status !== 'confirmed' ou proposalStatus === 'rejected'
  // ne doit pas apparaître dans le programme ni être compté dans totalBudget.
  const allPlacements = slots.flatMap(slot =>
    (slot.candidates || [])
      .filter(candidate =>
        candidate.status === 'confirmed' &&
        candidate.proposalStatus !== 'rejected'
      )
      .flatMap(candidate => {
      const talentPlacements = (candidate.placements || []).map(p => ({ ...p, slotId: slot.slotId }));
      const presenceBlocks = buildPresenceBlocks(talentPlacements, schedule);
      return (candidate.placements || []).map((p, idx) => {
        const plageObj = schedule.find(pl => pl.plageId === p.plageId);
        const workedMin = plageObj?.timeStart && plageObj?.timeEnd ? (new Date(plageObj.timeEnd) - new Date(plageObj.timeStart)) / 60000 : null;
        let blockMeta = null;
        for (const block of presenceBlocks) {
          const entry = block.placements.find(bp => bp.plageId === p.plageId);
          if (entry) { blockMeta = { requiredMin: block.requiredMin, billableMin: block.billableMin, allocationRatio: entry.allocationRatio, blockSize: block.placements.length }; break; }
        }
        let implicitRate = null;
        if (p.assignedPrice != null && blockMeta) {
          implicitRate = Math.round((p.assignedPrice / blockMeta.allocationRatio) / (blockMeta.billableMin / 60));
        } else if (p.assignedPrice != null && workedMin != null) {
          implicitRate = Math.round(p.assignedPrice / (Math.max(30, workedMin) / 60));
        }
        return {
          key: `${slot.slotId}:${candidate.userId}:${p.sceneId}:${p.plageId}:${idx}`,
          slotId: slot.slotId,
          roleSystemId: slot.roleSystemId,
          userId: candidate.userId,
          candidateStyleSystemIds: candidate.styleSystemIds || [],
          candidateAssignedStyleSystemIds: p.assignedStyleSystemIds || [],
          sceneId: p.sceneId,
          plageId: p.plageId,
          assignedPrice: p.assignedPrice ?? null,
          workedMin,
          blockMeta,
          implicitRate,
        };
      });
    })
  );

  const totalBudget = isOrganizer ? allPlacements.reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0) : null;
  const uniqueProviders = new Set(allPlacements.map(p => p.userId).filter(Boolean)).size;

  if (!allPlacements.length) {
    return (
      <div className="py-12 text-center">
        <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Le programme se construira au fur et à mesure des placements.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isOrganizer && totalBudget > 0 && (
        <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Budget total engagé</p>
            <p className="text-2xl font-bold text-cyan-300">${totalBudget} <span className="text-sm font-normal text-slate-400">CAD</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{uniqueProviders} prestataire{uniqueProviders > 1 ? 's' : ''} · {allPlacements.length} placement{allPlacements.length > 1 ? 's' : ''}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1 justify-end mt-0.5"><EyeOff className="w-3 h-3" />Prix visibles par vous seul et chaque talent</p>
          </div>
        </div>
      )}

      {scenes.map(scene => {
        const scenePlacements = allPlacements.filter(p => p.sceneId === scene.sceneId).sort((a, b) => schedule.findIndex(x => x.plageId === a.plageId) - schedule.findIndex(x => x.plageId === b.plageId));
        if (!scenePlacements.length) return null;
        const sceneTotal = isOrganizer ? scenePlacements.reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0) : null;
        return (
          <div key={scene.sceneId}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{scene.icon}</span>
              <h3 className="font-bold text-gray-900">{scene.label}</h3>
              {isOrganizer && sceneTotal > 0 && <span className="ml-auto text-sm font-semibold text-gray-500">${sceneTotal} CAD</span>}
            </div>
            <div className="space-y-2">
              {scenePlacements.map(entry => {
                const plage = schedule.find(p => p.plageId === entry.plageId);
                if (!plage) return null;
                const prof = profileMap[entry.userId];
                const role = roleMap[entry.roleSystemId];
                const name = prof?.displayName || `Talent …${(entry.userId || '').slice(-4)}`;
                const isMe = entry.userId === currentUserId;
                const canSeePrice = isOrganizer || isMe;
                const stylesToShow = entry.candidateAssignedStyleSystemIds?.length > 0 ? entry.candidateAssignedStyleSystemIds : entry.candidateStyleSystemIds || [];
                return (
                  <div key={entry.key} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex flex-col items-center w-16 flex-shrink-0 text-center">
                      <span className="text-[10px] font-mono text-indigo-600 font-semibold">{fmtHHMM(plage.timeStart)}</span>
                      <div className="w-px h-3 bg-indigo-200 my-0.5" />
                      <span className="text-[10px] font-mono text-gray-400">{fmtHHMM(plage.timeEnd)}</span>
                    </div>
                    <div className="w-20 flex-shrink-0">
                      <span className="text-xs font-medium text-gray-600">{plage.label}</span>
                      <div className="text-[10px] text-gray-400">{durationLabel(plage.timeStart, plage.timeEnd)}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                        {prof?.avatarUrl ? <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" /> : <span className="text-white text-xs font-bold">{name[0]?.toUpperCase()}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{isMe ? `${name} (Vous)` : name}</p>
                        <p className="text-xs text-gray-500">{role?.nameFr || entry.roleSystemId}</p>
                      </div>
                    </div>
                    {stylesToShow.length > 0 && (
                      <div className="hidden sm:flex flex-wrap gap-1 max-w-32">
                        {stylesToShow.slice(0, 3).map(sid => <Badge key={sid} variant="outline" className="text-[10px] px-1.5 py-0">{styleMap[sid]?.displayName || sid}</Badge>)}
                        {stylesToShow.length > 3 && <span className="text-[10px] text-gray-400">+{stylesToShow.length - 3}</span>}
                      </div>
                    )}
                    <div className="flex-shrink-0 text-right min-w-[80px]">
                      {canSeePrice && entry.assignedPrice != null ? (
                        <div>
                          <span className="text-sm font-bold text-gray-900">${entry.assignedPrice}</span>
                          <p className="text-[9px] text-gray-400 flex items-center gap-0.5 justify-end"><Eye className="w-2.5 h-2.5" />{isMe && !isOrganizer ? 'Votre cachet' : 'CAD'}</p>
                          {isOrganizer && entry.implicitRate != null && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-[9px] text-slate-400 font-mono">{entry.implicitRate} CAD/h</p>
                              {entry.workedMin != null && <p className="text-[9px] text-slate-400">{Math.round(entry.workedMin)} min joués</p>}
                              {entry.blockMeta?.blockSize > 1 && <p className="text-[9px] text-slate-400">bloc {Math.round(entry.blockMeta.requiredMin)} min → {Math.round(entry.blockMeta.billableMin)} min fact. · {Math.round(entry.blockMeta.allocationRatio * 100)} %</p>}
                              {entry.blockMeta?.blockSize === 1 && entry.workedMin != null && entry.blockMeta.billableMin > entry.workedMin && <p className="text-[9px] text-slate-400">min 30 min fact.</p>}
                            </div>
                          )}
                        </div>
                      ) : !canSeePrice ? <div className="flex items-center gap-1 text-gray-300"><EyeOff className="w-3 h-3" /><span className="text-xs">—</span></div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}