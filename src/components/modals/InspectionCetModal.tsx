import React, { useMemo, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { ProjectData, TronconEgout } from '../../types/project';
import { calcQte, cleLigneAuto, fmt, NRM } from '../../utils/calculations';

interface InspectionCetModalProps {
  mode: 'insp' | 'cet';
  appData: ProjectData;
  onClose: () => void;
  onApply: (updates: Array<{ ref: string; porter: boolean; qte: number | null }>) => void;
}

export const InspectionCetModal: React.FC<InspectionCetModalProps> = ({
  mode,
  appData,
  onClose,
  onApply,
}) => {
  const isInsp = mode === 'insp';
  const statuts = appData.carnetMesurage?.statutsLignes || {};

  const rows = useMemo(() => {
    const troncons = (appData.tronconsEgout || []).filter((t) => {
      if (t.fait === false) return false;
      if (!isInsp) {
        if (!t.d9000Type) return false;
        const dBit = NRM(t.d9000Type);
        if (dBit.includes('bitumin') || dBit.includes('enrobe') || dBit.includes('fraisa')) {
          return false;
        }
      }
      return true;
    });
    return troncons.map((t: TronconEgout) => {
      const q = calcQte(t);
      const defQte = isInsp ? q.longPose : q.v_d9000;
      const porter = isInsp ? Boolean(t.insp_porter) : Boolean(t.cet_porter);
      const customQte = isInsp ? t.insp_qte : t.cet_qte;
      const lineKey = isInsp
        ? cleLigneAuto(t.ref, 'insp')
        : `cet_${(t.d9000Type || '').replace(/\s+/g, '_')}`;
      const isBilled = Boolean(statuts[lineKey]?.porteeA);
      return {
        t,
        defQte,
        porter,
        qte: customQte !== null && isFinite(customQte) ? customQte : defQte,
        isBilled,
      };
    });
  }, [appData, isInsp, statuts]);

  const [state, setState] = useState<Record<string, { porter: boolean; qte: number }>>(() => {
    const init: Record<string, { porter: boolean; qte: number }> = {};
    rows.forEach((r) => {
      init[r.t.ref] = { porter: r.porter, qte: r.qte };
    });
    return init;
  });

  const totals = useMemo(() => {
    let total = 0;
    const byType = new Map<string, number>();
    rows.forEach((r) => {
      const cur = state[r.t.ref];
      if (!cur?.porter) return;
      const v = Number(cur.qte) || 0;
      total += v;
      if (!isInsp && r.t.d9000Type) {
        byType.set(r.t.d9000Type, (byType.get(r.t.d9000Type) || 0) + v);
      }
    });
    return { total, byType: Array.from(byType.entries()) };
  }, [rows, state, isInsp]);

  const toggleAll = (val: boolean) => {
    setState((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        if (!r.isBilled) {
          next[r.t.ref] = { ...next[r.t.ref], porter: val };
        }
      });
      return next;
    });
  };

  const handleSave = () => {
    const updates = rows.map((r) => {
      const cur = state[r.t.ref];
      const diff = Math.abs(cur.qte - r.defQte) > 0.0001;
      return {
        ref: r.t.ref,
        porter: cur.porter,
        qte: diff ? cur.qte : null,
      };
    });
    onApply(updates);
    onClose();
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isInsp
                ? '📷 Inspection caméra autotractée'
                : '🗑 CET / D9000 — Mise en site autorisé des terres'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isInsp
                ? 'Sélectionnez les tronçons marqués « Fait » à porter au Carnet et ajustez la longueur si nécessaire.'
                : 'Sélectionnez les tronçons avec type D9000 (hors bitumineux/fraisats) à regrouper au Carnet.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleAll(true)}
              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tout décocher
            </button>
          </div>
          <div className="text-xs font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
            Total sélectionné : {fmt(totals.total, 3)} {isInsp ? 'm' : 'm³'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">
              {isInsp
                ? 'Aucun tronçon marqué « Fait » disponible.'
                : 'Aucun tronçon marqué « Fait » avec type D9000 (hors bitumineux) disponible.'}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2.5 text-center w-12">Porter</th>
                  <th className="py-2 px-2.5 text-left">Tronçon</th>
                  {!isInsp && <th className="py-2 px-2.5 text-left">Type D9000</th>}
                  <th className="py-2 px-2.5 text-right w-28">
                    {isInsp ? 'L nette calc.' : 'Vol. AG+remp'}
                  </th>
                  <th className="py-2 px-2.5 text-right w-32">Qté portée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.map((r) => {
                  const cur = state[r.t.ref] || { porter: false, qte: r.defQte };
                  return (
                    <tr
                      key={r.t.ref}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-1.5 px-2.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            disabled={r.isBilled}
                            checked={cur.porter}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                [r.t.ref]: { ...prev[r.t.ref], porter: e.target.checked },
                              }))
                            }
                          />
                          {r.isBilled && <Lock className="w-3 h-3 text-emerald-600" />}
                        </div>
                      </td>
                      <td className="py-1.5 px-2.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {r.t.ref}
                        </span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">
                          {r.t.de} → {r.t.a}
                        </span>
                      </td>
                      {!isInsp && (
                        <td className="py-1.5 px-2.5 font-medium text-slate-700 dark:text-slate-200">
                          {r.t.d9000Type}
                        </td>
                      )}
                      <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-500">
                        {fmt(r.defQte, 3)} {isInsp ? 'm' : 'm³'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        <input
                          type="number"
                          step="0.001"
                          disabled={r.isBilled}
                          value={cur.qte}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              [r.t.ref]: {
                                ...prev[r.t.ref],
                                qte: parseFloat(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-24 px-2 py-1 text-xs text-right font-mono tabular-nums rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!isInsp && totals.byType.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-3 text-xs">
              {totals.byType.map(([type, vol]) => (
                <div
                  key={type}
                  className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-mono tabular-nums"
                >
                  <span className="font-semibold">{type} :</span> {fmt(vol, 3)} m³
                </div>
              ))}
            </div>
          )}
        </div>

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
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
          >
            ✔ Appliquer au Carnet
          </button>
        </div>
      </div>
    </div>
  );
};
