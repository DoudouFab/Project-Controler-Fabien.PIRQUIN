import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Search } from 'lucide-react';
import { ProjectData } from '../types/project';
import { extraireQtesCochees, extraireQtesTotales, fmt, mnt, NRM, srcP } from '../utils/calculations';
import { exportCumulExcel } from '../utils/excelExports';
import { PrintHeader } from './PrintHeader';

interface Tab6CumulProps {
  appData: ProjectData;
  onNotify?: (type: 'success' | 'warning' | 'error' | 'info', text: string) => void;
}

type FilterMode = 'tous' | 'depassement' | 'dep10' | 'dep10_1000' | 'dep10_ou_1000' | 'masquer0';

export const Tab6Cumul: React.FC<Tab6CumulProps> = ({ appData, onNotify }) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('tous');

  const [cols, setCols] = useState({
    qteM: true,
    budget: true,
    qteAvant: true,
    qteEA: true,
    sommeEA: true,
    qteCumul: true,
    reel: true,
    solde: true,
    pct: true,
    ecart: true,
  });

  const allPostes = useMemo(() => srcP(appData), [appData]);
  const qTot = useMemo(() => extraireQtesTotales(appData), [appData]);
  const qCoch = useMemo(() => extraireQtesCochees(appData), [appData]);

  const rows = useMemo(() => {
    return allPostes.map((p) => {
      const qCumul = qTot.get(p.id) || 0;
      const qEA = qCoch.get(p.id) || 0;
      const qAvant = qCumul - qEA;
      const solde = p.qte - qCumul;
      const mBudget = mnt(p.qte, p.pu);
      const mReel = mnt(qCumul, p.pu);
      const mEA = mnt(qEA, p.pu);
      const ecart = mReel - mBudget;
      const pct = p.qte > 0 ? (qCumul / p.qte) * 100 : qCumul > 0 ? 999 : 0;
      return {
        p,
        qAvant,
        qEA,
        qCumul,
        solde,
        mBudget,
        mReel,
        mEA,
        ecart,
        pct,
      };
    });
  }, [allPostes, qTot, qCoch]);

  const filteredRows = useMemo(() => {
    const q = NRM(search);
    return rows.filter((r) => {
      const matchSearch = !q || NRM(r.p.id).includes(q) || NRM(r.p.desc).includes(q);
      if (!matchSearch) return false;
      if (filterMode === 'depassement') return r.pct > 100;
      if (filterMode === 'dep10') return r.pct > 110;
      if (filterMode === 'dep10_1000') return r.pct > 110 && r.ecart > 1000;
      if (filterMode === 'dep10_ou_1000') return r.pct > 110 || r.ecart > 1000;
      if (filterMode === 'masquer0') return r.qCumul !== 0;
      return true;
    });
  }, [rows, search, filterMode]);

  const totals = useMemo(() => {
    let tBudget = 0;
    let tReel = 0;
    let tEA = 0;
    rows.forEach((r) => {
      tBudget += r.mBudget;
      tReel += r.mReel;
      tEA += r.mEA;
    });
    const tEcart = tReel - tBudget;
    const tPct = tBudget > 0 ? Math.round((tReel / tBudget) * 10000) / 100 : 0;
    return { tBudget, tReel, tEA, tEcart, tPct };
  }, [rows]);

  const toggleCol = (key: keyof typeof cols) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      <PrintHeader infos={appData.infosAdministratives} />

      {/* Filtres & colonnes */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher N° poste ou libellé..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredRows.length} ligne(s) affichée(s) sur {rows.length}
            </span>
            <button
              type="button"
              disabled={filteredRows.length === 0}
              onClick={() => {
                exportCumulExcel(appData, filteredRows);
                onNotify?.('success', `Export Excel Cumul généré (${filteredRows.length} postes).`);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 text-emerald-800 dark:text-emerald-300 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </button>
          </div>
        </div>

        {/* Radio filtres */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-200 dark:border-slate-800">
          {(
            [
              ['tous', 'Tous les postes'],
              ['depassement', 'Dépassement (> 100%)'],
              ['dep10', 'Dépassement > 110%'],
              ['dep10_1000', '> 110% ET écart > 1 000 €'],
              ['dep10_ou_1000', '> 110% OU écart > 1 000 €'],
              ['masquer0', 'Masquer qté = 0'],
            ] as const
          ).map(([val, lbl]) => (
            <label key={val} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="t6-filter"
                checked={filterMode === val}
                onChange={() => setFilterMode(val)}
              />
              <span>{lbl}</span>
            </label>
          ))}
        </div>

        {/* Colonnes visibles */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Colonnes :</span>
          {(
            [
              ['qteM', 'Q. Prév.'],
              ['budget', 'Budget (€)'],
              ['qteAvant', 'Q. Avant EA'],
              ['qteEA', 'Q. EA en cours'],
              ['sommeEA', 'Montant EA (€)'],
              ['qteCumul', 'Q. Cumulée'],
              ['reel', 'Montant Réel (€)'],
              ['solde', 'Solde Qté'],
              ['pct', '% Exécuté'],
              ['ecart', 'Écart (€)'],
            ] as const
          ).map(([k, lbl]) => (
            <label key={k} className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={cols[k]}
                onChange={() => toggleCol(k)}
              />
              <span>{lbl}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tableau concordance */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Aucun poste dans le marché. Importez un bordereau 3P dans l'onglet 1.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2.5 text-left w-20">N°</th>
                  <th className="py-2 px-2.5 text-left">Description</th>
                  <th className="py-2 px-2.5 text-center w-14">U.</th>
                  {cols.qteM && <th className="py-2 px-2.5 text-right">Q. Prév.</th>}
                  {cols.budget && <th className="py-2 px-2.5 text-right">Budget (€)</th>}
                  {cols.qteAvant && <th className="py-2 px-2.5 text-right">Avant EA</th>}
                  {cols.qteEA && <th className="py-2 px-2.5 text-right">EA cours</th>}
                  {cols.sommeEA && <th className="py-2 px-2.5 text-right">Montant EA (€)</th>}
                  {cols.qteCumul && <th className="py-2 px-2.5 text-right">Cumul Qté</th>}
                  {cols.reel && <th className="py-2 px-2.5 text-right">Cumul (€)</th>}
                  {cols.solde && <th className="py-2 px-2.5 text-right">Solde Qté</th>}
                  {cols.pct && <th className="py-2 px-2.5 text-center w-20">%</th>}
                  {cols.ecart && <th className="py-2 px-2.5 text-right">Écart (€)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRows.map((r) => {
                  const dep10 = r.pct > 110;
                  const dep = r.pct > 100 && !dep10;
                  const rowCls = dep10
                    ? 'bg-rose-50/75 dark:bg-rose-950/30'
                    : dep
                    ? 'bg-amber-50/75 dark:bg-amber-950/25'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40';
                  return (
                    <tr key={r.p.id} className={rowCls}>
                      <td className="py-1.5 px-2.5 font-mono font-bold text-sky-700 dark:text-sky-400">
                        {r.p.id}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-100">
                        {r.p.desc}
                      </td>
                      <td className="py-1.5 px-2.5 text-center">{r.p.u}</td>
                      {cols.qteM && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums">
                          {fmt(r.p.qte, 3)}
                        </td>
                      )}
                      {cols.budget && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums">
                          {fmt(r.mBudget)} €
                        </td>
                      )}
                      {cols.qteAvant && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {fmt(r.qAvant, 3)}
                        </td>
                      )}
                      {cols.qteEA && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {fmt(r.qEA, 3)}
                        </td>
                      )}
                      {cols.sommeEA && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                          {fmt(r.mEA)} €
                        </td>
                      )}
                      {cols.qteCumul && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-sky-700 dark:text-sky-400 font-semibold">
                          {fmt(r.qCumul, 3)}
                        </td>
                      )}
                      {cols.reel && (
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-sky-700 dark:text-sky-400 font-bold">
                          {fmt(r.mReel)} €
                        </td>
                      )}
                      {cols.solde && (
                        <td
                          className={`py-1.5 px-2.5 text-right font-mono tabular-nums ${
                            r.solde < 0
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {fmt(r.solde, 3)}
                        </td>
                      )}
                      {cols.pct && (
                        <td className="py-1.5 px-2.5 text-center font-mono tabular-nums">
                          {dep10 ? (
                            <span className="font-bold text-rose-700 dark:text-rose-400">
                              {r.pct.toFixed(0)}% ⚠
                            </span>
                          ) : dep ? (
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              {r.pct.toFixed(0)}% !
                            </span>
                          ) : (
                            <span
                              className={
                                r.pct >= 90
                                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {r.pct.toFixed(0)}%
                            </span>
                          )}
                        </td>
                      )}
                      {cols.ecart && (
                        <td
                          className={`py-1.5 px-2.5 text-right font-mono tabular-nums font-semibold ${
                            r.ecart > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : r.ecart < 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {fmt(r.ecart)} €
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-300 dark:border-slate-700">
                <tr>
                  <td colSpan={3} className="py-2.5 px-2.5 text-right">
                    TOTAL GÉNÉRAL MARCHÉ :
                  </td>
                  {cols.qteM && <td />}
                  {cols.budget && (
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {fmt(totals.tBudget)} €
                    </td>
                  )}
                  {cols.qteAvant && <td />}
                  {cols.qteEA && <td />}
                  {cols.sommeEA && (
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {fmt(totals.tEA)} €
                    </td>
                  )}
                  {cols.qteCumul && <td />}
                  {cols.reel && (
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-sky-700 dark:text-sky-400">
                      {fmt(totals.tReel)} €
                    </td>
                  )}
                  {cols.solde && <td />}
                  {cols.pct && (
                    <td
                      className={`py-2.5 px-2.5 text-center font-mono tabular-nums ${
                        totals.tPct > 100
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {totals.tPct.toFixed(1)}%
                    </td>
                  )}
                  {cols.ecart && (
                    <td
                      className={`py-2.5 px-2.5 text-right font-mono tabular-nums ${
                        totals.tEcart > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {fmt(totals.tEcart)} €
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
