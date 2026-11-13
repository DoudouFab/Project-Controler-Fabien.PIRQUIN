import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { ProjectData } from '../types/project';
import { fmt, mnt, srcP } from '../utils/calculations';
import { exportEaValidesExcel } from '../utils/excelExports';
import { PrintHeader } from './PrintHeader';

interface Tab5EaValidesProps {
  appData: ProjectData;
  onUpdateData: (updater: (prev: ProjectData) => ProjectData) => void;
  onNotify: (type: 'success' | 'warning' | 'error' | 'info', text: string) => void;
  onConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }) => void;
  onAfterDevalider: () => void;
}

export const Tab5EaValides: React.FC<Tab5EaValidesProps> = ({
  appData,
  onUpdateData,
  onNotify,
  onConfirm,
  onAfterDevalider,
}) => {
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [indiceDrafts, setIndiceDrafts] = useState<Record<number, string>>({});
  const [qteDrafts, setQteDrafts] = useState<Record<string, string>>({});

  const allPostes = useMemo(() => srcP(appData), [appData]);
  const budgetGlobal = useMemo(
    () => allPostes.reduce((s, p) => s + mnt(p.qte, p.pu), 0),
    [allPostes]
  );

  const eaRows = useMemo(() => {
    let cumul = 0;
    return (appData.historiqueEA || []).map((ea, i) => {
      cumul = Math.round((cumul + (ea.montant || 0)) * 100) / 100;
      const pct = budgetGlobal > 0 ? (cumul / budgetGlobal) * 100 : 0;
      const rest = budgetGlobal - cumul;
      return { ea, i, cumul, pct, rest };
    });
  }, [appData.historiqueEA, budgetGlobal]);

  const cumulTotal = eaRows.length > 0 ? eaRows[eaRows.length - 1].cumul : 0;
  const dernierEA = eaRows.length > 0 ? eaRows[eaRows.length - 1].ea.montant : 0;
  const resteMarche = budgetGlobal - cumulTotal;

  const toggleExpand = (i: number) => {
    setExpandedIdx((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const commitIndice = (i: number, newVal: string) => {
    const clean = newVal.trim();
    setIndiceDrafts((prev) => {
      const n = { ...prev };
      delete n[i];
      return n;
    });
    const ea = appData.historiqueEA?.[i];
    if (!ea) return;
    if (!clean) {
      onNotify('warning', "Le N° d'EA ne peut pas être vide.");
      return;
    }
    if (clean === ea.indice) return;
    const duplicate = appData.historiqueEA.some((e, j) => j !== i && e.indice === clean);
    if (duplicate) {
      onNotify('error', `Le N° « ${clean} » est déjà utilisé par un autre EA.`);
      return;
    }

    const oldIndice = ea.indice;
    onUpdateData((prev) => {
      const nextHist = prev.historiqueEA.map((item, idx) =>
        idx === i ? { ...item, indice: clean } : item
      );
      const nextStatuts = { ...prev.carnetMesurage.statutsLignes };
      Object.keys(nextStatuts).forEach((k) => {
        if (nextStatuts[k]?.porteeA === oldIndice) {
          nextStatuts[k] = { ...nextStatuts[k], porteeA: clean };
        }
      });
      return {
        ...prev,
        historiqueEA: nextHist,
        carnetMesurage: {
          ...prev.carnetMesurage,
          statutsLignes: nextStatuts,
        },
      };
    });
    onNotify('success', `${oldIndice} renommé en ${clean}.`);
  };

  const commitDetailQte = (eaIndex: number, posteId: string, rawVal: string) => {
    const key = `${eaIndex}_${posteId}`;
    setQteDrafts((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });

    const v = parseFloat(rawVal.replace(',', '.'));
    if (!isFinite(v) || v < 0) {
      onNotify('warning', 'Quantité invalide.');
      return;
    }
    const rounded = Math.round(v * 1000) / 1000;
    const poste = allPostes.find((p) => p.id === posteId);

    onUpdateData((prev) => {
      const nextHist = prev.historiqueEA.map((ea, idx) => {
        if (idx !== eaIndex) return ea;
        const nextDetail = (ea.detailParPoste || []).map((d) => {
          if (d.posteId !== posteId) return d;
          const qteOrigine = d.qteOrigine !== undefined ? d.qteOrigine : d.qte;
          const newMontant = poste ? mnt(rounded, poste.pu) : d.montant;
          return {
            ...d,
            qte: rounded,
            qteOrigine,
            montant: newMontant,
          };
        });
        const newTotal =
          Math.round(nextDetail.reduce((s, d) => s + (d.montant || 0), 0) * 100) / 100;
        return { ...ea, detailParPoste: nextDetail, montant: newTotal };
      });
      return { ...prev, historiqueEA: nextHist };
    });
  };

  const restoreDetailQte = (eaIndex: number, posteId: string) => {
    const poste = allPostes.find((p) => p.id === posteId);
    onUpdateData((prev) => {
      const nextHist = prev.historiqueEA.map((ea, idx) => {
        if (idx !== eaIndex) return ea;
        const nextDetail = (ea.detailParPoste || []).map((d) => {
          if (d.posteId !== posteId || d.qteOrigine === undefined) return d;
          const q = d.qteOrigine;
          return {
            posteId: d.posteId,
            qte: q,
            montant: poste ? mnt(q, poste.pu) : d.montant,
          };
        });
        const newTotal =
          Math.round(nextDetail.reduce((s, d) => s + (d.montant || 0), 0) * 100) / 100;
        return { ...ea, detailParPoste: nextDetail, montant: newTotal };
      });
      return { ...prev, historiqueEA: nextHist };
    });
  };

  const handleDevalider = (i: number) => {
    const ea = appData.historiqueEA?.[i];
    if (!ea) return;
    const linkedCount = Object.values(appData.carnetMesurage?.statutsLignes || {}).filter(
      (s) => s.porteeA === ea.indice
    ).length;
    const hasOpenChecked = Object.values(appData.carnetMesurage?.statutsLignes || {}).some(
      (s) => !s.porteeA && s.coche
    );

    onConfirm({
      title: `Dé-valider ${ea.indice} (${fmt(ea.montant)} €) ?`,
      message:
        (linkedCount > 0
          ? `Ses ${linkedCount} ligne(s) du Carnet de Mesurage repasseront cochées « EA en cours » (onglets 3 et 4) pour être retravaillées.`
          : `Aucune ligne du Carnet n'est rattachée à cet EA (ex. EA Néant) — il sera simplement retiré de l'historique.`) +
        (hasOpenChecked
          ? `\n\n⚠ Des lignes sont déjà cochées pour l'EA en cours : elles seront réunies avec celles de ${ea.indice}.`
          : ''),
      confirmLabel: `Dé-valider ${ea.indice}`,
      danger: true,
      onConfirm: () => {
        onUpdateData((prev) => {
          const nextStatuts = { ...prev.carnetMesurage.statutsLignes };
          Object.keys(nextStatuts).forEach((k) => {
            const st = nextStatuts[k];
            if (st?.porteeA === ea.indice) {
              nextStatuts[k] = { porteeA: null, coche: true };
            }
          });
          return {
            ...prev,
            carnetMesurage: {
              ...prev.carnetMesurage,
              statutsLignes: nextStatuts,
            },
            historiqueEA: prev.historiqueEA.filter((_, idx) => idx !== i),
          };
        });
        onNotify('info', `${ea.indice} réouvert dans le Carnet de Mesurage.`);
        onAfterDevalider();
      },
    });
  };

  const handleSupprimer = (i: number) => {
    const ea = appData.historiqueEA?.[i];
    if (!ea) return;
    onConfirm({
      title: `Supprimer ${ea.indice} ?`,
      message: `Cette action est irréversible. Les lignes rattachées à ${ea.indice} redeviendront non facturées et décochées.`,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => {
        onUpdateData((prev) => {
          const nextStatuts = { ...prev.carnetMesurage.statutsLignes };
          Object.keys(nextStatuts).forEach((k) => {
            if (nextStatuts[k]?.porteeA === ea.indice) {
              nextStatuts[k] = { porteeA: null, coche: false };
            }
          });
          return {
            ...prev,
            carnetMesurage: {
              ...prev.carnetMesurage,
              statutsLignes: nextStatuts,
            },
            historiqueEA: prev.historiqueEA.filter((_, idx) => idx !== i),
          };
        });
        onNotify('info', `${ea.indice} supprimé de l'historique.`);
      },
    });
  };

  return (
    <div className="space-y-4">
      <PrintHeader infos={appData.infosAdministratives} />

      {/* 4 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'EA validés',
            val: `${eaRows.length}`,
            cls: 'text-slate-900 dark:text-slate-100',
          },
          {
            label: 'Cumul facturé',
            val: `${fmt(cumulTotal)} €`,
            cls: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Dernier EA',
            val: `${fmt(dernierEA)} €`,
            cls: 'text-sky-700 dark:text-sky-400',
          },
          {
            label: 'Reste sur marché',
            val: `${fmt(resteMarche)} €`,
            cls:
              resteMarche < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100',
          },
        ].map((k) => (
          <div
            key={k.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3"
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {k.label}
            </div>
            <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${k.cls}`}>
              {k.val}
            </div>
          </div>
        ))}
      </div>

      {/* Barre d'export */}
      <div className="no-print flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Cliquez sur une ligne pour consulter ou ajuster les quantités archivées d'un EA.
        </div>
        <button
          type="button"
          disabled={eaRows.length === 0}
          onClick={() => {
            exportEaValidesExcel(appData);
            onNotify('success', `Export Excel EA validés généré (${eaRows.length} EA).`);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 text-emerald-800 dark:text-emerald-300 cursor-pointer whitespace-nowrap"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel (Synthèse + Détail)
        </button>
      </div>

      {/* Tableau historique */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {eaRows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Aucun état d'avancement validé pour le moment. Clôturez un EA depuis l'onglet 4.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2.5 px-3 text-left w-32">N° EA</th>
                  <th className="py-2.5 px-3 text-left w-28">Date</th>
                  <th className="py-2.5 px-3 text-right">Montant EA (€)</th>
                  <th className="py-2.5 px-3 text-right">Cumulé (€)</th>
                  <th className="py-2.5 px-3 text-center w-24">% Marché</th>
                  <th className="py-2.5 px-3 text-right">Solde marché (€)</th>
                  <th className="no-print py-2.5 px-3 text-right w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {eaRows.map(({ ea, i, cumul, pct, rest }) => {
                  const isOpen = expandedIdx.has(i);
                  const sortedDetails = [...(ea.detailParPoste || [])].sort((a, b) =>
                    a.posteId.localeCompare(b.posteId, 'fr', {
                      numeric: true,
                      sensitivity: 'base',
                    })
                  );
                  return (
                    <React.Fragment key={`${ea.indice}-${i}`}>
                      <tr
                        onClick={() => toggleExpand(i)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleExpand(i)}
                              className="no-print text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            >
                              {isOpen ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <input
                              type="text"
                              value={indiceDrafts[i] ?? ea.indice}
                              onChange={(e) =>
                                setIndiceDrafts((p) => ({ ...p, [i]: e.target.value }))
                              }
                              onBlur={(e) => commitIndice(i, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitIndice(i, (e.target as HTMLInputElement).value);
                                }
                              }}
                              title="Modifier l'indice officiel de l'EA"
                              className="w-20 px-1.5 py-0.5 font-mono font-bold text-sky-700 dark:text-sky-400 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 focus:border-sky-500 outline-none"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                          {ea.date}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                          {fmt(ea.montant)} €
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                          {fmt(cumul)} €
                        </td>
                        <td
                          className={`py-2.5 px-3 text-center font-mono tabular-nums font-bold ${
                            pct > 100
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {pct.toFixed(1)} %
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                            rest < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {fmt(rest)} €
                        </td>
                        <td
                          className="no-print py-2.5 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDevalider(i)}
                              title="Dé-valider : rouvre cet EA dans le Carnet"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 cursor-pointer"
                            >
                              <Unlock className="w-3 h-3" /> Dévalider
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSupprimer(i)}
                              title="Supprimer cet EA"
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-slate-50/80 dark:bg-slate-950/60">
                          <td colSpan={7} className="p-3 pl-8">
                            {sortedDetails.length === 0 ? (
                              <div className="text-[11px] italic text-slate-500">
                                EA Néant — Aucun poste facturé.
                              </div>
                            ) : (
                              <table className="w-full text-[11px] border-collapse">
                                <thead>
                                  <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                    <th className="py-1 px-2 text-left w-20">Poste</th>
                                    <th className="py-1 px-2 text-left">Description</th>
                                    <th className="py-1 px-2 text-center w-14">Unité</th>
                                    <th className="py-1 px-2 text-right w-24">P.U. (€)</th>
                                    <th className="py-1 px-2 text-right w-44">Qté facturée</th>
                                    <th className="py-1 px-2 text-right w-28">Montant (€)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                                  {sortedDetails.map((d) => {
                                    const p = allPostes.find((pp) => pp.id === d.posteId);
                                    const dKey = `${i}_${d.posteId}`;
                                    const modified =
                                      d.qteOrigine !== undefined &&
                                      Math.abs(d.qteOrigine - d.qte) > 0.0001;
                                    return (
                                      <tr key={d.posteId}>
                                        <td className="py-1.5 px-2 font-mono font-bold text-sky-700 dark:text-sky-400">
                                          {d.posteId}
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">
                                          {p ? p.desc : 'Poste introuvable'}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">{p?.u || '—'}</td>
                                        <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                                          {p ? fmt(p.pu) : '—'}
                                        </td>
                                        <td className="py-1.5 px-2 text-right">
                                          <div className="inline-flex items-center justify-end gap-1.5">
                                            {modified && (
                                              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                                                était : {d.qteOrigine!.toFixed(3)}
                                              </span>
                                            )}
                                            <input
                                              type="text"
                                              value={qteDrafts[dKey] ?? d.qte.toFixed(3)}
                                              onChange={(e) =>
                                                setQteDrafts((prev) => ({
                                                  ...prev,
                                                  [dKey]: e.target.value,
                                                }))
                                              }
                                              onBlur={(e) =>
                                                commitDetailQte(i, d.posteId, e.target.value)
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  commitDetailQte(
                                                    i,
                                                    d.posteId,
                                                    (e.target as HTMLInputElement).value
                                                  );
                                                }
                                              }}
                                              className={`w-24 px-1.5 py-0.5 text-right font-mono tabular-nums rounded border ${
                                                modified
                                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 font-bold'
                                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                                              }`}
                                            />
                                            {modified && (
                                              <button
                                                type="button"
                                                title="Restaurer la quantité d'origine"
                                                onClick={() => restoreDetailQte(i, d.posteId)}
                                                className="no-print text-amber-600 hover:text-amber-800 cursor-pointer"
                                              >
                                                <RotateCcw className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-mono tabular-nums font-semibold">
                                          {fmt(d.montant)} €
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
