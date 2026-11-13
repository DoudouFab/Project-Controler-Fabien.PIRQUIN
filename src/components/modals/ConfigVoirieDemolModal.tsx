import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ROLES_DEMOLITION, ROLES_VOIRIE } from '../../constants/inasep';
import {
  ConfigExtraPoste,
  ConfigRoleDims,
  LigneManuelle,
  PosteMarche,
  ProjectData,
  TronconEgout,
} from '../../types/project';
import {
  analyserUnite,
  calcQte,
  candidatsDemolition,
  candidatsVoirie,
  cleLigneMan,
  epaisseurParDefautRole,
  evalCalc,
  fmt,
  largeurParRole,
  srcP,
} from '../../utils/calculations';

interface ConfigVoirieDemolModalProps {
  mode: 'voirie' | 'demol';
  appData: ProjectData;
  onClose: () => void;
  onApply: (
    updatedConfig: Record<string, Record<string, unknown>>,
    newManualLines: LigneManuelle[],
    removedIds: string[]
  ) => void;
}

type RoleDraftState = Record<string, Record<string, unknown>>;

export const ConfigVoirieDemolModal: React.FC<ConfigVoirieDemolModalProps> = ({
  mode,
  appData,
  onClose,
  onApply,
}) => {
  const isVoirie = mode === 'voirie';
  const roles = isVoirie ? ROLES_VOIRIE : ROLES_DEMOLITION;
  const allPostes = useMemo(() => srcP(appData), [appData]);
  const statuts = appData.carnetMesurage?.statutsLignes || {};

  const getPosteIdFromObj = (trObj: Record<string, unknown>, roleKey: string): string => {
    const val = trObj[roleKey];
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object' && 'posteId' in val) {
      return String((val as { posteId?: string }).posteId || '');
    }
    return '';
  };

  const isDetacheFromObj = (trObj: Record<string, unknown>, roleKey: string): boolean => {
    const val = trObj[roleKey];
    if (val && typeof val === 'object' && 'detache' in val) {
      return Boolean((val as { detache?: boolean }).detache);
    }
    return Boolean(trObj[`${roleKey}_detache`]);
  };

  // Tronçons VC/VE marqués Fait, en masquant ceux dont toutes les lignes existantes sont déjà facturées
  const { tronconsEligibles, nbFacturesMasques } = useMemo(() => {
    const vcVe = (appData.tronconsEgout || []).filter(
      (t) => t.fait !== false && (t.milieu === 'VC' || t.milieu === 'VE')
    );
    const lignesPrefix = (appData.carnetMesurage?.lignesManuelles || []).filter(
      (l) => l.id.startsWith(`${mode}:`) || l.id.startsWith(`${mode}_`)
    );
    let masques = 0;
    const elig: TronconEgout[] = [];
    for (const t of vcVe) {
      const lignesT = lignesPrefix.filter(
        (l) =>
          l.id.startsWith(`${mode}:${t.ref}:`) ||
          l.id.includes(`_${t.ref}_cfg`) ||
          l.tronconRef === t.ref
      );
      const allBilled =
        lignesT.length > 0 && lignesT.every((l) => Boolean(statuts[cleLigneMan(l.id)]?.porteeA));
      if (allBilled) masques++;
      else elig.push(t);
    }
    return { tronconsEligibles: elig, nbFacturesMasques: masques };
  }, [appData, mode, statuts]);

  const initialDraft = useMemo<RoleDraftState>(() => {
    const src = isVoirie
      ? appData.configVoirie?.parTroncon || {}
      : appData.configDemolition?.parTroncon || {};
    return JSON.parse(JSON.stringify(src)) as RoleDraftState;
  }, [appData, isVoirie]);

  const [draft, setDraft] = useState<RoleDraftState>(initialDraft);
  const [openRoles, setOpenRoles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    roles.forEach(([k]) => {
      init[k] = true;
    });
    return init;
  });

  const getCandForRole = (roleKey: string): PosteMarche[] => {
    const cands = isVoirie
      ? candidatsVoirie(appData, roleKey)
      : candidatsDemolition(appData, roleKey);
    return cands.length > 0 ? cands : allPostes;
  };

  const getRoleDims = (t: TronconEgout, roleKey: string, poste: PosteMarche | null): ConfigRoleDims => {
    const trObj = (draft[t.ref] || {}) as Record<string, unknown>;
    const saved = (trObj[`${roleKey}_dims`] as ConfigRoleDims | undefined) || {};
    const defL = t.long || 0;
    const defW = roleKey === 'sciage' ? 0 : largeurParRole(mode, roleKey, t);
    const defE =
      roleKey === 'sciage' ? 0 : epaisseurParDefautRole(mode, roleKey, t, poste);
    return {
      l: saved.l !== undefined ? saved.l : defL,
      w: saved.w !== undefined ? saved.w : defW,
      e: saved.e !== undefined ? saved.e : defE,
      lExpr: saved.lExpr,
      wExpr: saved.wExpr,
      eExpr: saved.eExpr,
    };
  };

  const updatePosteCascade = (
    tronconIdx: number,
    roleKey: string,
    posteId: string,
    isForceDirect = false
  ) => {
    setDraft((prev) => {
      const next: RoleDraftState = { ...prev };
      const targetRef = tronconsEligibles[tronconIdx].ref;
      const curTarget = { ...(next[targetRef] || {}) };
      curTarget[roleKey] = { posteId, detache: tronconIdx > 0 || isForceDirect };
      curTarget[`${roleKey}_detache`] = tronconIdx > 0;
      next[targetRef] = curTarget;

      // Cascade vers les tronçons suivants non détachés
      for (let i = tronconIdx + 1; i < tronconsEligibles.length; i++) {
        const ref = tronconsEligibles[i].ref;
        const obj = { ...(next[ref] || {}) };
        if (!isDetacheFromObj(obj, roleKey)) {
          obj[roleKey] = { posteId, detache: false };
          next[ref] = obj;
        }
      }
      return next;
    });
  };

  const resetCascadeForRow = (tronconIdx: number, roleKey: string) => {
    if (tronconIdx <= 0) return;
    setDraft((prev) => {
      const next: RoleDraftState = { ...prev };
      const prevRef = tronconsEligibles[tronconIdx - 1].ref;
      const curRef = tronconsEligibles[tronconIdx].ref;
      const inherited = getPosteIdFromObj((next[prevRef] || {}) as Record<string, unknown>, roleKey);
      const curObj = { ...(next[curRef] || {}) };
      curObj[`${roleKey}_detache`] = false;
      curObj[roleKey] = { posteId: inherited, detache: false };
      next[curRef] = curObj;
      return next;
    });
  };

  const updateDim = (
    ref: string,
    roleKey: string,
    field: 'l' | 'w' | 'e',
    raw: string,
    t: TronconEgout,
    poste: PosteMarche | null
  ) => {
    const val = evalCalc(raw);
    const trimmed = raw.trim();
    const isExpr = trimmed.startsWith('=') || /[+\-*/()]/.test(trimmed);
    setDraft((prev) => {
      const tr = { ...(prev[ref] || {}) };
      const existingDims = getRoleDims(t, roleKey, poste);
      const updated: ConfigRoleDims = {
        ...existingDims,
        [field]: val !== null ? Math.max(0, val) : existingDims[field],
        [`${field}Expr`]: isExpr ? trimmed : undefined,
      };
      tr[`${roleKey}_dims`] = updated;
      return { ...prev, [ref]: tr };
    });
  };

  const getExtras = (ref: string): ConfigExtraPoste[] => {
    const arr = draft[ref]?._extras;
    return Array.isArray(arr) ? (arr as ConfigExtraPoste[]) : [];
  };

  const addExtra = (t: TronconEgout) => {
    setDraft((prev) => {
      const tr = { ...(prev[t.ref] || {}) };
      const list = Array.isArray(tr._extras) ? [...(tr._extras as ConfigExtraPoste[])] : [];
      list.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        posteId: '',
        dims: { l: t.long || 0, w: calcQte(t).Wt, e: 0.2 },
      });
      tr._extras = list;
      return { ...prev, [t.ref]: tr };
    });
  };

  const updateExtra = (ref: string, extraId: string, patch: Partial<ConfigExtraPoste>) => {
    setDraft((prev) => {
      const tr = { ...(prev[ref] || {}) };
      const list = Array.isArray(tr._extras) ? [...(tr._extras as ConfigExtraPoste[])] : [];
      tr._extras = list.map((ex) => (ex.id === extraId ? { ...ex, ...patch } : ex));
      return { ...prev, [ref]: tr };
    });
  };

  const removeExtra = (ref: string, extraId: string) => {
    setDraft((prev) => {
      const tr = { ...(prev[ref] || {}) };
      const list = Array.isArray(tr._extras) ? [...(tr._extras as ConfigExtraPoste[])] : [];
      tr._extras = list.filter((ex) => ex.id !== extraId);
      return { ...prev, [ref]: tr };
    });
  };

  const computeQty = (poste: PosteMarche | null, dims: ConfigRoleDims, roleKey?: string): number => {
    const L = dims.l || 0;
    const W = dims.w || 0;
    const E = dims.e || 0;
    if (roleKey === 'sciage') return L;
    const { isVol, isSurf, isLin } = analyserUnite(poste?.u);
    if (isVol) return L * W * E;
    if (isSurf) return L * W;
    if (isLin) return L;
    return L * W * (E > 0 ? E : 1);
  };

  const buildDetailFormule = (
    t: TronconEgout,
    roleLabel: string,
    poste: PosteMarche,
    dims: ConfigRoleDims,
    qte: number,
    roleKey?: string
  ): string => {
    const L = dims.l || 0;
    const W = dims.w || 0;
    const E = dims.e || 0;
    const { isVol, isSurf } = analyserUnite(poste.u);
    const exprParts: string[] = [];
    if (dims.lExpr) exprParts.push(`L=${dims.lExpr}`);
    if (dims.wExpr) exprParts.push(`l=${dims.wExpr}`);
    if (dims.eExpr) exprParts.push(`ép=${dims.eExpr}`);
    const exprLine = exprParts.length ? `\nFormule(s) : ${exprParts.join(' ; ')}` : '';
    if (roleKey === 'sciage' || (!isVol && !isSurf)) {
      return `${roleLabel} — ${t.ref} (${t.milieu})\nL = ${L.toFixed(3)} m = ${qte.toFixed(3)} ${poste.u}${exprLine}`;
    }
    if (isSurf) {
      return `${roleLabel} — ${t.ref} (${t.milieu})\nL(${L.toFixed(3)}m) × l(${W.toFixed(3)}m) = ${qte.toFixed(3)} ${poste.u}${exprLine}`;
    }
    return `${roleLabel} — ${t.ref} (${t.milieu})\nL(${L.toFixed(3)}m) × l(${W.toFixed(3)}m) × ép(${E.toFixed(3)}m) = ${qte.toFixed(3)} ${poste.u}${exprLine}`;
  };

  const handleApply = () => {
    const existingManual = appData.carnetMesurage?.lignesManuelles || [];
    const removedIds: string[] = [];
    const preservedBilledRefs = new Set<string>();

    existingManual.forEach((lm) => {
      if (lm.id.startsWith(`${mode}:`) || lm.id.startsWith(`${mode}_`)) {
        const isBilled = Boolean(statuts[cleLigneMan(lm.id)]?.porteeA);
        if (isBilled) {
          preservedBilledRefs.add(lm.id);
        } else {
          removedIds.push(lm.id);
        }
      }
    });

    const newLines: LigneManuelle[] = [];
    tronconsEligibles.forEach((t) => {
      const trObj = (draft[t.ref] || {}) as Record<string, unknown>;
      roles.forEach(([roleKey, roleLabel]) => {
        const posteId = getPosteIdFromObj(trObj, roleKey).trim();
        if (!posteId) return;
        const poste = allPostes.find((p) => p.id === posteId) || null;
        if (!poste) return;
        const lineId = `${mode}:${t.ref}:${roleKey}`;
        const legacyId = `${mode}_${roleKey}_${t.ref}_cfg`;
        if (preservedBilledRefs.has(lineId) || preservedBilledRefs.has(legacyId)) return;
        const dims = getRoleDims(t, roleKey, poste);
        const qte = computeQty(poste, dims, roleKey);
        if (qte <= 0) return;
        newLines.push({
          id: lineId,
          posteId: poste.id,
          libelle: `${roleLabel} — ${t.ref} (${t.de} → ${t.a})`,
          quantite: Math.round(qte * 1000) / 1000,
          detailFormule: buildDetailFormule(t, roleLabel, poste, dims, qte, roleKey),
          roleAuto: `${mode}:${roleKey}`,
          tronconRef: t.ref,
        });
      });

      getExtras(t.ref).forEach((ex) => {
        if (!ex.posteId) return;
        const poste = allPostes.find((p) => p.id === ex.posteId) || null;
        if (!poste) return;
        const lineId = `${mode}:${t.ref}:extra_${ex.id}`;
        if (preservedBilledRefs.has(lineId)) return;
        const dims = ex.dims || { l: t.long || 0, w: calcQte(t).Wt, e: 0.2 };
        const qte = computeQty(poste, dims);
        if (qte <= 0) return;
        newLines.push({
          id: lineId,
          posteId: poste.id,
          libelle: `Suppl. ${poste.desc.slice(0, 48)} — ${t.ref}`,
          quantite: Math.round(qte * 1000) / 1000,
          detailFormule: buildDetailFormule(t, 'Poste supplémentaire', poste, dims, qte),
          roleAuto: `${mode}:extra`,
          tronconRef: t.ref,
        });
      });
    });

    onApply(draft, newLines, removedIds);
    onClose();
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isVoirie
                ? '🚧 Configuration Voirie (tronçons VC / VE marqués Fait)'
                : '🔨 Configuration Démolition (tronçons VC / VE marqués Fait)'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Sélectionnez un poste sur la première ligne : il se propage en cascade vers les tronçons suivants non détachés. Les formules type Excel (=L*2) sont acceptées.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {nbFacturesMasques > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {nbFacturesMasques} tronçon(s) déjà entièrement facturé(s) sur ce module masqué(s).
              </span>
            </div>
          )}

          {tronconsEligibles.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
              Aucun tronçon VC ou VE marqué « Fait » disponible à configurer.
            </div>
          ) : (
            <>
              {roles.map(([roleKey, roleLabel]) => {
                const cands = getCandForRole(roleKey);
                const isOpen = openRoles[roleKey] !== false;
                return (
                  <div
                    key={roleKey}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenRoles((prev) => ({ ...prev, [roleKey]: !isOpen }))
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-800/80 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        {roleLabel}
                      </span>
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {cands.length} poste(s) candidat(s)
                      </span>
                    </button>

                    {isOpen && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                              <th className="py-1.5 px-2.5 text-left font-medium w-44">Tronçon</th>
                              <th className="py-1.5 px-2.5 text-left font-medium">Poste attribué</th>
                              <th className="py-1.5 px-2 text-left font-medium w-24">Forcer N°</th>
                              <th className="py-1.5 px-2 text-right font-medium w-24">Long (m)</th>
                              <th className="py-1.5 px-2 text-right font-medium w-24">Larg (m)</th>
                              <th className="py-1.5 px-2 text-right font-medium w-24">Ép (m)</th>
                              <th className="py-1.5 px-2.5 text-right font-medium w-28">Qté est.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {tronconsEligibles.map((t, idx) => {
                              const trObj = (draft[t.ref] || {}) as Record<string, unknown>;
                              const posteId = getPosteIdFromObj(trObj, roleKey);
                              const poste = allPostes.find((p) => p.id === posteId) || null;
                              const detache = isDetacheFromObj(trObj, roleKey);
                              const dims = getRoleDims(t, roleKey, poste);
                              const { isVol, isSurf } = analyserUnite(poste?.u);
                              const isSciage = roleKey === 'sciage';
                              const showW = !isSciage && (isVol || isSurf || !poste);
                              const showE = !isSciage && (isVol || !poste);
                              const qte = poste ? computeQty(poste, dims, roleKey) : 0;
                              const isBilledLine =
                                Boolean(statuts[cleLigneMan(`${mode}:${t.ref}:${roleKey}`)]?.porteeA) ||
                                Boolean(statuts[cleLigneMan(`${mode}_${roleKey}_${t.ref}_cfg`)]?.porteeA);

                              return (
                                <tr
                                  key={t.ref}
                                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                                >
                                  <td className="py-1.5 px-2.5 align-middle">
                                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                                      {t.ref}{' '}
                                      <span className="font-mono text-[10px] text-slate-500">
                                        ({t.milieu})
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate max-w-[165px]">
                                      {t.de} → {t.a}
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-2.5 align-middle">
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        disabled={isBilledLine}
                                        value={posteId}
                                        onChange={(e) =>
                                          updatePosteCascade(idx, roleKey, e.target.value)
                                        }
                                        className="w-full min-w-[200px] px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 disabled:opacity-60"
                                      >
                                        <option value="">— Ignorer / Aucun —</option>
                                        {cands.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.id} — {p.desc.slice(0, 68)} ({p.u})
                                          </option>
                                        ))}
                                        {posteId && !cands.some((c) => c.id === posteId) && (
                                          <option value={posteId}>
                                            {posteId} — {poste?.desc.slice(0, 68) || '(Forcé)'}
                                          </option>
                                        )}
                                      </select>
                                      {detache && (
                                        <button
                                          type="button"
                                          onClick={() => resetCascadeForRow(idx, roleKey)}
                                          title="Rattacher à la cascade"
                                          className="p-1 rounded text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 cursor-pointer shrink-0"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {isBilledLine && (
                                        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-2 align-middle">
                                    <input
                                      type="text"
                                      disabled={isBilledLine}
                                      placeholder="N°..."
                                      value={posteId}
                                      onChange={(e) =>
                                        updatePosteCascade(idx, roleKey, e.target.value.trim(), true)
                                      }
                                      className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                                    />
                                  </td>
                                  <td className="py-1.5 px-2 align-middle">
                                    <input
                                      type="text"
                                      disabled={isBilledLine}
                                      defaultValue={dims.lExpr || String(dims.l ?? '')}
                                      onBlur={(e) =>
                                        updateDim(t.ref, roleKey, 'l', e.target.value, t, poste)
                                      }
                                      className="w-full px-2 py-1 text-xs text-right font-mono tabular-nums rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                                    />
                                  </td>
                                  <td className="py-1.5 px-2 align-middle text-right">
                                    {showW ? (
                                      <input
                                        type="text"
                                        disabled={isBilledLine}
                                        defaultValue={
                                          dims.wExpr ||
                                          (dims.w !== undefined ? dims.w.toFixed(3) : '')
                                        }
                                        onBlur={(e) =>
                                          updateDim(t.ref, roleKey, 'w', e.target.value, t, poste)
                                        }
                                        className="w-full px-2 py-1 text-xs text-right font-mono tabular-nums rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                                      />
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 align-middle text-right">
                                    {showE ? (
                                      <input
                                        type="text"
                                        disabled={isBilledLine}
                                        defaultValue={
                                          dims.eExpr ||
                                          (dims.e !== undefined ? dims.e.toFixed(3) : '')
                                        }
                                        onBlur={(e) =>
                                          updateDim(t.ref, roleKey, 'e', e.target.value, t, poste)
                                        }
                                        className="w-full px-2 py-1 text-xs text-right font-mono tabular-nums rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                                      />
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2.5 align-middle text-right font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                                    {poste ? `${fmt(qte, 3)} ${poste.u}` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Section Postes supplémentaires indépendants par tronçon */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Postes supplémentaires indépendants par tronçon (sans cascade)
                </div>
                <div className="space-y-2">
                  {tronconsEligibles.map((t) => {
                    const extras = getExtras(t.ref);
                    return (
                      <div
                        key={t.ref}
                        className="border border-slate-200 dark:border-slate-800 rounded-md p-2.5 bg-slate-50/50 dark:bg-slate-950/40 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {t.ref} — {t.de} → {t.a} ({t.milieu})
                          </span>
                          <button
                            type="button"
                            onClick={() => addExtra(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Lier un poste supplémentaire à ce tronçon
                          </button>
                        </div>

                        {extras.map((ex) => {
                          const p = allPostes.find((pp) => pp.id === ex.posteId) || null;
                          const dims = ex.dims || { l: t.long || 0, w: calcQte(t).Wt, e: 0.2 };
                          const qte = p ? computeQty(p, dims) : 0;
                          return (
                            <div
                              key={ex.id}
                              className="grid grid-cols-12 gap-2 items-center pt-1"
                            >
                              <select
                                value={ex.posteId}
                                onChange={(e) =>
                                  updateExtra(t.ref, ex.id, { posteId: e.target.value })
                                }
                                className="col-span-5 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                              >
                                <option value="">— Choisir un poste —</option>
                                {allPostes.map((pp) => (
                                  <option key={pp.id} value={pp.id}>
                                    {pp.id} — {pp.desc.slice(0, 55)} ({pp.u})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="L (m)"
                                defaultValue={dims.lExpr || String(dims.l ?? '')}
                                onBlur={(e) => {
                                  const val = evalCalc(e.target.value);
                                  if (val !== null) {
                                    updateExtra(t.ref, ex.id, {
                                      dims: { ...dims, l: Math.max(0, val), lExpr: e.target.value },
                                    });
                                  }
                                }}
                                className="col-span-2 px-2 py-1 text-xs text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                              <input
                                type="text"
                                placeholder="l (m)"
                                defaultValue={dims.wExpr || String(dims.w ?? '')}
                                onBlur={(e) => {
                                  const val = evalCalc(e.target.value);
                                  if (val !== null) {
                                    updateExtra(t.ref, ex.id, {
                                      dims: { ...dims, w: Math.max(0, val), wExpr: e.target.value },
                                    });
                                  }
                                }}
                                className="col-span-2 px-2 py-1 text-xs text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                              <input
                                type="text"
                                placeholder="ép (m)"
                                defaultValue={dims.eExpr || String(dims.e ?? '')}
                                onBlur={(e) => {
                                  const val = evalCalc(e.target.value);
                                  if (val !== null) {
                                    updateExtra(t.ref, ex.id, {
                                      dims: { ...dims, e: Math.max(0, val), eExpr: e.target.value },
                                    });
                                  }
                                }}
                                className="col-span-1 px-2 py-1 text-xs text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                              <div className="col-span-1 text-right text-xs font-mono tabular-nums font-semibold">
                                {p ? fmt(qte, 3) : '—'}
                              </div>
                              <div className="col-span-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeExtra(t.ref, ex.id)}
                                  className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                                  title="Supprimer ce poste supplémentaire"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
          >
            ✔ Valider et générer les lignes
          </button>
        </div>
      </div>
    </div>
  );
};
