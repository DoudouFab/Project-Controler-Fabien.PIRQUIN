import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, Lock, PlusCircle } from 'lucide-react';
import { CarnetLineItem, DetailPosteEA, HistoriqueEA, PosteMarche, ProjectData } from '../types/project';
import { construireLignesCarnet, fmt, mnt, prochainNumeroEA, srcP } from '../utils/calculations';
import { exportEaEnCoursExcel } from '../utils/excelExports';
import { PrintHeader } from './PrintHeader';

interface Tab4EaEnCoursProps {
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
  onAfterCloseEA: () => void;
}

interface PosteEAGroup {
  poste: PosteMarche;
  qAvant: number;
  qEA: number;
  mEA: number;
  qCumul: number;
  lines: CarnetLineItem[];
}

export const Tab4EaEnCours: React.FC<Tab4EaEnCoursProps> = ({
  appData,
  onUpdateData,
  onNotify,
  onConfirm,
  onAfterCloseEA,
}) => {
  const [sortBy, setSortBy] = useState<'poste_asc' | 'poste_desc'>('poste_asc');
  const [showQAvant, setShowQAvant] = useState(true);
  const [showQCumul, setShowQCumul] = useState(true);
  const [expandedPostes, setExpandedPostes] = useState<Set<string>>(new Set());

  const allPostes = useMemo(() => srcP(appData), [appData]);
  const eaIndice = useMemo(
    () => `EA ${String(prochainNumeroEA(appData)).padStart(2, '0')}`,
    [appData]
  );

  const histCumul = useMemo(() => {
    const map = new Map<string, number>();
    (appData.historiqueEA || []).forEach((ea) => {
      (ea.detailParPoste || []).forEach((d) => {
        if (d.posteId) {
          map.set(d.posteId, (map.get(d.posteId) || 0) + (d.qte || 0));
        }
      });
    });
    return map;
  }, [appData.historiqueEA]);

  const checkedLines = useMemo(
    () => construireLignesCarnet(appData).filter((l) => !l.porteeA && l.coche && l.posteId),
    [appData]
  );

  const rows = useMemo<PosteEAGroup[]>(() => {
    const map = new Map<string, { q: number; lines: CarnetLineItem[] }>();
    checkedLines.forEach((l) => {
      if (!l.posteId || !isFinite(l.qEff) || l.qEff === 0) return;
      const cur = map.get(l.posteId) || { q: 0, lines: [] };
      cur.q += l.qEff;
      cur.lines.push(l);
      map.set(l.posteId, cur);
    });

    const list: PosteEAGroup[] = [];
    map.forEach((entry, pid) => {
      const p = allPostes.find((pp) => pp.id === pid);
      if (!p) return;
      const qAvant = histCumul.get(pid) || 0;
      const qEA = entry.q;
      const mEA = mnt(qEA, p.pu);
      list.push({
        poste: p,
        qAvant,
        qEA,
        mEA,
        qCumul: qAvant + qEA,
        lines: entry.lines,
      });
    });

    list.sort((a, b) => {
      const c = a.poste.id.localeCompare(b.poste.id, 'fr', {
        numeric: true,
        sensitivity: 'base',
      });
      return sortBy === 'poste_asc' ? c : -c;
    });
    return list;
  }, [checkedLines, allPostes, histCumul, sortBy]);

  const totalEA = useMemo(
    () => Math.round(rows.reduce((s, r) => s + r.mEA, 0) * 100) / 100,
    [rows]
  );

  const executeCloture = () => {
    const detail: DetailPosteEA[] = rows.map((r) => ({
      posteId: r.poste.id,
      qte: Math.round(r.qEA * 1000) / 1000,
      montant: r.mEA,
    }));

    const newEA: HistoriqueEA = {
      indice: eaIndice,
      date: new Date().toLocaleDateString('fr-FR'),
      montant: totalEA,
      detailParPoste: detail,
    };

    onUpdateData((prev) => {
      const carnet = prev.carnetMesurage;
      const nextStatuts = { ...carnet.statutsLignes };

      checkedLines.forEach((l) => {
        nextStatuts[l.cle] = {
          ...(nextStatuts[l.cle] || {}),
          porteeA: eaIndice,
          coche: false,
          qteSnapshot: Math.round(l.qEff * 1000) / 1000,
          posteIdSnapshot: l.posteId || undefined,
          deverrouille: false,
        };
      });

      return {
        ...prev,
        carnetMesurage: {
          ...carnet,
          statutsLignes: nextStatuts,
        },
        historiqueEA: [...(prev.historiqueEA || []), newEA],
      };
    });

    onNotify('success', `${eaIndice} clôturé et archivé (${fmt(totalEA)} €).`);
    onAfterCloseEA();
  };

  const handleCloturerEA = () => {
    if (rows.length === 0 || totalEA === 0) {
      const motif =
        rows.length === 0
          ? 'Aucune ligne cochée « EA » dans le Carnet de Mesurage (onglet 3).'
          : 'Le montant total des lignes cochées est nul (0,00 €).';
      onConfirm({
        title: `Valider ${eaIndice} en EA Néant (0,00 €) ?`,
        message: `${motif}\n\nValider tout de même un EA Néant (0,00 €) pour conserver la numérotation officielle ?`,
        confirmLabel: `Archiver ${eaIndice} (0,00 €)`,
        onConfirm: executeCloture,
      });
      return;
    }

    onConfirm({
      title: `Clôturer & Archiver ${eaIndice} ?`,
      message:
        `Montant de l'état d'avancement : ${fmt(totalEA)} € (${rows.length} poste(s), ${checkedLines.length} ligne(s)).\n\n` +
        `Les lignes incluses seront verrouillées sous ${eaIndice} avec capture de leur quantité et poste actuels.`,
      confirmLabel: `Clôturer ${eaIndice}`,
      onConfirm: executeCloture,
    });
  };

  const handleInsertEANull = () => {
    onConfirm({
      title: `Insérer ${eaIndice} comme EA Néant (0,00 €) ?`,
      message:
        `L'état d'avancement en cours passera automatiquement au numéro suivant.\n` +
        `Aucune ligne cochée dans le Carnet de Mesurage ne sera modifiée.`,
      confirmLabel: `Insérer ${eaIndice} Néant`,
      onConfirm: () => {
        const nullEA: HistoriqueEA = {
          indice: eaIndice,
          date: new Date().toLocaleDateString('fr-FR'),
          montant: 0,
          detailParPoste: [],
        };
        onUpdateData((prev) => ({
          ...prev,
          historiqueEA: [...(prev.historiqueEA || []), nullEA],
        }));
        onNotify('info', `${eaIndice} (Néant — 0,00 €) inséré dans l'historique.`);
      },
    });
  };

  return (
    <div className="space-y-4">
      <PrintHeader infos={appData.infosAdministratives} />

      {/* En-tête EA en cours & actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            État d'avancement en préparation
          </div>
          <div className="flex items-baseline gap-3 mt-0.5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
              {eaIndice}
            </h2>
            <span className="text-lg font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400">
              {fmt(totalEA)} €
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({rows.length} poste{rows.length > 1 ? 's' : ''} · {checkedLines.length} ligne
              {checkedLines.length > 1 ? 's' : ''})
            </span>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => {
              exportEaEnCoursExcel(appData, eaIndice, rows, totalEA);
              onNotify('success', `Export Excel ${eaIndice} généré.`);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 text-emerald-800 dark:text-emerald-300 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
          <button
            type="button"
            onClick={handleInsertEANull}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Insérer un EA Null
          </button>
          <button
            type="button"
            onClick={handleCloturerEA}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" /> Clôturer & Archiver {eaIndice}
          </button>
        </div>
      </div>

      {/* Options d'affichage */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showQAvant}
              onChange={(e) => setShowQAvant(e.target.checked)}
            />
            <span>Afficher Q avant EA</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showQCumul}
              onChange={(e) => setShowQCumul(e.target.checked)}
            />
            <span>Afficher Q Cumulée</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Tri :</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="poste_asc">N° Poste croissant</option>
            <option value="poste_desc">N° Poste décroissant</option>
          </select>
        </div>
      </div>

      {/* Tableau récapitulatif EA en cours */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Aucune ligne cochée « EA » dans le Carnet de Mesurage (onglet 3).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2.5 text-left w-24">N° Poste</th>
                  <th className="py-2 px-2.5 text-left">Description</th>
                  <th className="py-2 px-2.5 text-center w-16">Unité</th>
                  <th className="py-2 px-2.5 text-right w-24">P.U. (€)</th>
                  {showQAvant && (
                    <th className="py-2 px-2.5 text-right w-28">Q avant EA</th>
                  )}
                  <th className="py-2 px-2.5 text-right w-28">Q Période EA</th>
                  <th className="py-2 px-2.5 text-right w-28">Montant EA (€)</th>
                  {showQCumul && (
                    <th className="py-2 px-2.5 text-right w-28">Q Cumulée</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.map((r) => {
                  const isOpen = expandedPostes.has(r.poste.id);
                  return (
                    <React.Fragment key={r.poste.id}>
                      <tr
                        onClick={() =>
                          setExpandedPostes((prev) => {
                            const n = new Set(prev);
                            if (n.has(r.poste.id)) n.delete(r.poste.id);
                            else n.add(r.poste.id);
                            return n;
                          })
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td className="py-2 px-2.5 font-mono font-bold text-sky-700 dark:text-sky-400">
                          <span className="inline-flex items-center gap-1">
                            {isOpen ? (
                              <ChevronDown className="no-print w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="no-print w-3.5 h-3.5 text-slate-400" />
                            )}
                            {r.poste.id}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-slate-800 dark:text-slate-100">
                          {r.poste.desc}
                          <span className="no-print ml-2 text-[10px] text-slate-400">
                            ({r.lines.length} ligne{r.lines.length > 1 ? 's' : ''})
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-center">{r.poste.u}</td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums">
                          {fmt(r.poste.pu)}
                        </td>
                        {showQAvant && (
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {fmt(r.qAvant, 3)}
                          </td>
                        )}
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-bold">
                          {fmt(r.qEA, 3)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-bold text-sky-700 dark:text-sky-400">
                          {fmt(r.mEA)} €
                        </td>
                        {showQCumul && (
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                            {fmt(r.qCumul, 3)}
                          </td>
                        )}
                      </tr>
                      {isOpen &&
                        r.lines.map((l) => (
                          <tr
                            key={l.cle}
                            className="no-print bg-slate-50/70 dark:bg-slate-950/60 text-[11px] text-slate-600 dark:text-slate-400"
                          >
                            <td className="py-1 px-2.5 text-right font-mono">↳</td>
                            <td className="py-1 px-2.5" colSpan={showQAvant ? 4 : 3}>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {l.libTroncon}
                              </span>{' '}
                              — {l.libPrestation}
                            </td>
                            <td className="py-1 px-2.5 text-right font-mono tabular-nums">
                              {fmt(l.qEff, 3)}
                            </td>
                            <td className="py-1 px-2.5 text-right font-mono tabular-nums">
                              {fmt(mnt(l.qEff, r.poste.pu))} €
                            </td>
                            {showQCumul && <td />}
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-300 dark:border-slate-700">
                <tr>
                  <td
                    colSpan={4 + (showQAvant ? 1 : 0) + 1}
                    className="py-2.5 px-2.5 text-right uppercase text-slate-700 dark:text-slate-200"
                  >
                    TOTAL {eaIndice} À FACTURER :
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-sky-700 dark:text-sky-400">
                    {fmt(totalEA)} €
                  </td>
                  {showQCumul && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
