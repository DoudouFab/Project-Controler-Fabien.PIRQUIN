import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Eye, FileSpreadsheet, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { MOIS_FR } from '../constants/inasep';
import { ArretChantier, DelaiCompl, ProjectData } from '../types/project';
import {
  calculerEtatDelai,
  dateCle,
  formaterDelaiMixte,
  numeroSemaineISO,
} from '../utils/calculations';
import { exportFeuilleDelaisExcel } from '../utils/excelExports';
import { buildInasepDelaySheetHtml, printHtmlViaIframe } from '../utils/inasepPrint';
import { PrintHeader } from './PrintHeader';

interface Tab7DelaisProps {
  appData: ProjectData;
  onUpdateData: (updater: (prev: ProjectData) => ProjectData) => void;
  onNotify?: (type: 'success' | 'warning' | 'error' | 'info', text: string) => void;
  sansCalendrier: boolean;
  onToggleSansCalendrier: (val: boolean) => void;
}

type BrushMode = 'intemperie' | 'ferie' | 'conge' | 'effacer';

function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function getJoursFeriesBelges(year: number): Array<{ date: Date; label: string }> {
  const easter = computeEasterSunday(year);
  return [
    { date: new Date(year, 0, 1), label: 'Jour de l’An' },
    { date: addDays(easter, 1), label: 'Lundi de Pâques' },
    { date: new Date(year, 4, 1), label: 'Fête du Travail' },
    { date: addDays(easter, 39), label: 'Ascension' },
    { date: addDays(easter, 50), label: 'Lundi de Pentecôte' },
    { date: new Date(year, 6, 21), label: 'Fête Nationale' },
    { date: new Date(year, 7, 15), label: 'Assomption' },
    { date: new Date(year, 10, 1), label: 'Toussaint' },
    { date: new Date(year, 10, 11), label: 'Armistice' },
    { date: new Date(year, 11, 25), label: 'Noël' },
  ];
}

export const Tab7Delais: React.FC<Tab7DelaisProps> = ({
  appData,
  onUpdateData,
  onNotify,
  sansCalendrier,
  onToggleSansCalendrier,
}) => {
  const [brush, setBrush] = useState<BrushMode>('intemperie');
  const [subTab, setSubTab] = useState<'calendrier' | 'apercu'>('calendrier');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [rangeType, setRangeType] = useState<BrushMode>('conge');
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);

  const dragPaintModeRef = useRef<BrushMode | null>(null);

  useEffect(() => {
    const stopDrag = () => {
      dragPaintModeRef.current = null;
    };
    window.addEventListener('mouseup', stopDrag);
    return () => window.removeEventListener('mouseup', stopDrag);
  }, []);

  const dl = appData.delais;
  const state = useMemo(() => calculerEtatDelai(appData), [appData]);

  const updateDelais = (patch: Partial<ProjectData['delais']>) => {
    onUpdateData((prev) => ({
      ...prev,
      delais: {
        ...prev.delais,
        ...patch,
      },
    }));
  };

  const applyPaintDay = (cle: string, mode: BrushMode) => {
    onUpdateData((prev) => {
      const jm = { ...(prev.delais.joursMarques || {}) };
      if (mode === 'effacer') {
        if (!(cle in jm)) return prev;
        delete jm[cle];
      } else {
        if (jm[cle] === mode) return prev;
        jm[cle] = mode;
      }
      return {
        ...prev,
        delais: {
          ...prev.delais,
          joursMarques: jm,
        },
      };
    });
  };

  const handleCellMouseDown = (cle: string) => {
    const cur = state.jm[cle] || '';
    const effectiveMode: BrushMode =
      brush === 'effacer' || cur === brush ? 'effacer' : brush;
    dragPaintModeRef.current = effectiveMode;
    applyPaintDay(cle, effectiveMode);
  };

  const handleCellMouseEnter = (cle: string) => {
    if (!dragPaintModeRef.current) return;
    applyPaintDay(cle, dragPaintModeRef.current);
  };

  const handlePrefillFeriesBelges = () => {
    const start = state.os && !isNaN(state.os.getTime())
      ? new Date(state.os)
      : new Date(new Date().getFullYear(), 0, 1);
    const end = state.finAff && !isNaN(state.finAff.getTime())
      ? new Date(state.finAff)
      : new Date(start.getFullYear(), 11, 31);

    const startY = start.getFullYear();
    const endY = end.getFullYear();
    const candidates: string[] = [];
    for (let y = startY; y <= endY; y++) {
      getJoursFeriesBelges(y).forEach(({ date }) => {
        if (date < start || date > end) return;
        const wd = date.getDay();
        if (wd === 0 || wd === 6) return;
        candidates.push(dateCle(date));
      });
    }

    let added = 0;
    onUpdateData((prev) => {
      const jm = { ...(prev.delais.joursMarques || {}) };
      candidates.forEach((cle) => {
        if (!jm[cle]) {
          jm[cle] = 'ferie';
          added++;
        }
      });
      if (added === 0) return prev;
      return {
        ...prev,
        delais: {
          ...prev.delais,
          joursMarques: jm,
        },
      };
    });

    onNotify?.(
      added > 0 ? 'success' : 'info',
      added > 0
        ? `${added} jour(s) férié(s) belge(s) pré-rempli(s) sur la période.`
        : 'Tous les jours fériés belges ouvrables de la période sont déjà marqués.'
    );
  };

  const applyLeavePreset = (preset: 'ete' | 'noel') => {
    const refYear =
      state.os && !isNaN(state.os.getTime())
        ? Math.max(state.os.getFullYear(), new Date().getFullYear())
        : new Date().getFullYear();

    if (preset === 'ete') {
      // Congés du bâtiment été : 2e lundi de juillet -> 3 semaines ouvrables
      const jul1 = new Date(refYear, 6, 1);
      const offsetToMon = (8 - jul1.getDay()) % 7;
      const firstMon = addDays(jul1, offsetToMon);
      const secondMon = addDays(firstMon, 7);
      const thirdFri = addDays(secondMon, 18);
      setRangeStart(dateCle(secondMon));
      setRangeEnd(dateCle(thirdFri));
    } else {
      // Fermeture bâtiment fin d'année
      setRangeStart(`${refYear}-12-24`);
      setRangeEnd(`${refYear + 1}-01-04`);
    }
    setRangeType('conge');
  };

  const handleApplyRange = () => {
    if (!rangeStart || !rangeEnd) {
      onNotify?.('warning', 'Renseignez les dates Du et Au avant d’appliquer la plage.');
      return;
    }
    const d1 = new Date(`${rangeStart}T00:00:00`);
    const d2 = new Date(`${rangeEnd}T00:00:00`);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) {
      onNotify?.('error', 'Plage de dates invalide (la date Au doit être postérieure à Du).');
      return;
    }

    let count = 0;
    onUpdateData((prev) => {
      const jm = { ...(prev.delais.joursMarques || {}) };
      for (let cur = new Date(d1); cur <= d2; cur.setDate(cur.getDate() + 1)) {
        const wd = cur.getDay();
        if (skipWeekends && (wd === 0 || wd === 6)) continue;
        const cle = dateCle(cur);
        if (rangeType === 'effacer') {
          if (cle in jm) {
            delete jm[cle];
            count++;
          }
        } else {
          if (rangeType === 'conge' && jm[cle] === 'ferie') continue;
          if (jm[cle] !== rangeType) {
            jm[cle] = rangeType;
            count++;
          }
        }
      }
      const prevFin = prev.delais.finCalendrier || '';
      const nextFin =
        rangeType !== 'effacer' && (!prevFin || rangeEnd > prevFin) ? rangeEnd : prevFin;

      return {
        ...prev,
        delais: {
          ...prev.delais,
          joursMarques: jm,
          finCalendrier: nextFin,
        },
      };
    });

    onNotify?.(
      'success',
      rangeType === 'effacer'
        ? `${count} jour(s) effacé(s) sur la plage.`
        : `${count} jour(s) pré-encodé(s) sur la plage (${rangeStart} → ${rangeEnd}).`
    );
  };

  const monthsGrid = useMemo(() => {
    if (!state.os || isNaN(state.os.getTime())) return [];
    const list: Array<{ y: number; m: number }> = [];
    const cur = new Date(state.os.getFullYear(), state.os.getMonth(), 1);
    const endM = new Date(state.finAff.getFullYear(), state.finAff.getMonth(), 1);
    while (cur <= endM) {
      list.push({ y: cur.getFullYear(), m: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [state.os, state.finAff]);

  const complGroup = useMemo(() => {
    const cg = { JO: 0, JC: 0 };
    (dl.delaisCompl || []).forEach((d) => {
      const u = d.unite === 'JC' ? 'JC' : 'JO';
      cg[u] += Number(d.valeur ?? d.duree) || 0;
    });
    return cg;
  }, [dl.delaisCompl]);

  const totalRest = (state.executionRestant.JO || 0) + (state.executionRestant.JC || 0);

  const inasepHtml = useMemo(() => buildInasepDelaySheetHtml(appData), [appData]);

  const handleOpenInasepPrint = () => {
    printHtmlViaIframe(inasepHtml);
  };

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      await exportFeuilleDelaisExcel(appData);
      onNotify?.('success', 'Export Excel au format officiel INASEP généré.');
    } catch {
      onNotify?.('error', 'Erreur lors de la génération de l’export Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-4">
      <PrintHeader infos={appData.infosAdministratives} />

      {/* Barre d'action INASEP & onglets d'affichage */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Suivi des Délais d'Exécution &amp; Feuille Officielle INASEP
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {subTab === 'calendrier'
                ? 'Cliquez ou glissez sur les jours du calendrier pour marquer intempéries, fériés ou congés pré-encodés.'
                : 'Aperçu A4 Portrait strictement identique au format d’impression INASEP (signatures & pagination par page).'}
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={() => setSubTab('calendrier')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                subTab === 'calendrier'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendrier &amp; Saisie
            </button>
            <button
              type="button"
              onClick={() => setSubTab('apercu')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                subTab === 'apercu'
                  ? 'bg-sky-800 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Aperçu format INASEP
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exportingExcel}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {exportingExcel ? 'Génération Excel...' : 'Export Excel (format INASEP)'}
          </button>
          <button
            type="button"
            onClick={handleOpenInasepPrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-800 hover:bg-sky-700 text-white cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimer / PDF (format INASEP)
          </button>
        </div>
      </div>

      {subTab === 'apercu' ? (
        <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <iframe
            title="Aperçu feuille de délais INASEP"
            srcDoc={inasepHtml}
            className="w-full h-[calc(100vh-225px)] min-h-[720px] bg-slate-300 border-0 block"
          />
        </div>
      ) : (
        /* Config gauche + Dashboard droit */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Paramétrage des délais */}
        <div className="no-print lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4 text-xs">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Délai Principal
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Date OC
                </label>
                <input
                  type="date"
                  value={dl.os || ''}
                  onChange={(e) => updateDelais({ os: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Délai & Unité
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={dl.base ?? 60}
                    onChange={(e) =>
                      updateDelais({ base: parseFloat(e.target.value) || 0 })
                    }
                    className="w-20 px-2 py-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <select
                    value={dl.unite || 'JO'}
                    onChange={(e) => updateDelais({ unite: e.target.value })}
                    className="flex-1 px-1.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="JO">JO</option>
                    <option value="JC">JC</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Délais complémentaires */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Délais complémentaires
              </h3>
              <button
                type="button"
                onClick={() =>
                  updateDelais({
                    delaisCompl: [
                      ...(dl.delaisCompl || []),
                      { libelle: '', valeur: 0, unite: 'JO' },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>

            {(dl.delaisCompl || []).length === 0 ? (
              <div className="text-[11px] italic text-slate-400">
                Aucun délai complémentaire.
              </div>
            ) : (
              <div className="space-y-1.5">
                {(dl.delaisCompl || []).map((dc: DelaiCompl, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={dc.libelle || ''}
                      placeholder="Motif..."
                      onChange={(e) => {
                        const next = [...(dl.delaisCompl || [])];
                        next[i] = { ...next[i], libelle: e.target.value };
                        updateDelais({ delaisCompl: next });
                      }}
                      className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="number"
                      value={dc.valeur ?? dc.duree ?? 0}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        const next = [...(dl.delaisCompl || [])];
                        next[i] = { ...next[i], valeur: v, duree: v };
                        updateDelais({ delaisCompl: next });
                      }}
                      className="w-16 px-1.5 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <select
                      value={dc.unite || 'JO'}
                      onChange={(e) => {
                        const next = [...(dl.delaisCompl || [])];
                        next[i] = { ...next[i], unite: e.target.value };
                        updateDelais({ delaisCompl: next });
                      }}
                      className="px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="JO">JO</option>
                      <option value="JC">JC</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        updateDelais({
                          delaisCompl: (dl.delaisCompl || []).filter((_, j) => j !== i),
                        })
                      }
                      className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Délai MES */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mise en Service (MES)
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Durée MES</label>
                <input
                  type="number"
                  value={dl.mesDuree ?? 0}
                  onChange={(e) =>
                    updateDelais({ mesDuree: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Unité</label>
                <select
                  value={dl.mesUnite || 'JO'}
                  onChange={(e) => updateDelais({ mesUnite: e.target.value })}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="JO">JO</option>
                  <option value="JC">JC</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Début MES</label>
                <input
                  type="date"
                  value={dl.dateMes || ''}
                  onChange={(e) => updateDelais({ dateMes: e.target.value })}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          </div>

          {/* Arrêts & Reprises */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Arrêts & Reprises
              </h3>
              <button
                type="button"
                onClick={() =>
                  updateDelais({
                    arrets: [...(dl.arrets || []), { dateDebut: '', dateReprise: '' }],
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Ajouter arrêt
              </button>
            </div>

            {(dl.arrets || []).length === 0 ? (
              <div className="text-[11px] italic text-slate-400">Aucun arrêt enregistré.</div>
            ) : (
              <div className="space-y-1.5">
                {(dl.arrets || []).map((a: ArretChantier, i: number) => (
                  <div key={i} className="grid grid-cols-11 gap-1 items-center">
                    <input
                      type="date"
                      value={a.dateDebut || ''}
                      onChange={(e) => {
                        const next = [...(dl.arrets || [])];
                        next[i] = { ...next[i], dateDebut: e.target.value };
                        updateDelais({ arrets: next });
                      }}
                      className="col-span-5 px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="date"
                      value={a.dateReprise || ''}
                      onChange={(e) => {
                        const next = [...(dl.arrets || [])];
                        next[i] = { ...next[i], dateReprise: e.target.value };
                        updateDelais({ arrets: next });
                      }}
                      className="col-span-5 px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateDelais({
                          arrets: (dl.arrets || []).filter((_, j) => j !== i),
                        })
                      }
                      className="col-span-1 p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pré-encodage congés & jours fériés */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pré-encodage congés &amp; fériés
              </h3>
              <button
                type="button"
                onClick={handlePrefillFeriesBelges}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-[11px] font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer whitespace-nowrap"
                title="Ajoute tous les jours fériés légaux belges (y compris Pâques, Ascension et Pentecôte) sans écraser vos marques"
              >
                <Sparkles className="w-3 h-3" /> Fériés belges
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyLeavePreset('ete')}
                className="px-2 py-1 rounded border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold hover:bg-amber-100 cursor-pointer"
                title="Congés du bâtiment — été (à ajuster selon la région)"
              >
                Été bâtiment (3 sem.)
              </button>
              <button
                type="button"
                onClick={() => applyLeavePreset('noel')}
                className="px-2 py-1 rounded border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold hover:bg-amber-100 cursor-pointer"
                title="Fermeture bâtiment fin d'année"
              >
                Hiver / Fin d'année
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Du</label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Au</label>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={rangeType}
                onChange={(e) => setRangeType(e.target.value as BrushMode)}
                className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="conge">Congé entreprise</option>
                <option value="intemperie">Intempérie</option>
                <option value="ferie">Jour férié</option>
                <option value="effacer">Effacer sur la plage</option>
              </select>
              <button
                type="button"
                onClick={handleApplyRange}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                <CalendarDays className="w-3.5 h-3.5" /> Appliquer
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={skipWeekends}
                onChange={(e) => setSkipWeekends(e.target.checked)}
              />
              <span>Ignorer samedis &amp; dimanches sur la plage</span>
            </label>
          </div>

          {/* Fin calendrier & Option sans calendriers */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Calendrier visible jusqu'au
              </label>
              <input
                type="date"
                value={dl.finCalendrier || ''}
                onChange={(e) => updateDelais({ finCalendrier: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <label className="inline-flex items-start gap-2 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300 pt-1">
              <input
                type="checkbox"
                checked={sansCalendrier}
                onChange={(e) => onToggleSansCalendrier(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Imprimer SANS les calendriers (affiche le détail des dates d'intempéries dans le récapitulatif)
              </span>
            </label>
          </div>
        </div>

        {/* Compteurs & alerte droite */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <div className="text-[10px] uppercase text-slate-500">Total Contractuel</div>
                <div className="text-base font-bold font-mono tabular-nums mt-0.5">
                  {formaterDelaiMixte(state.groupes)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <div className="text-[10px] uppercase text-slate-500">Délais Compl.</div>
                <div className="text-base font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-0.5">
                  {formaterDelaiMixte(complGroup, '+')}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <div className="text-[10px] uppercase text-slate-500">Consommé</div>
                <div className="text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                  {formaterDelaiMixte(state.consumed)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <div className="text-[10px] uppercase text-slate-500">Solde Restant</div>
                <div
                  className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                    totalRest < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formaterDelaiMixte(state.executionRestant)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <div className="text-[10px] uppercase text-slate-500">MES Restant</div>
                <div className="text-base font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400 mt-0.5">
                  {state.mesDuree > 0
                    ? `${state.mesRestant} / ${state.mesDuree} ${state.mesUnite}`
                    : '—'}
                </div>
              </div>
            </div>

            {state.os ? (
              <div
                className={`p-2.5 rounded-lg border text-center text-xs font-bold ${
                  totalRest < 0
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    : totalRest <= 10
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                {totalRest < 0
                  ? `⚠ Délai d'exécution dépassé (${formaterDelaiMixte(state.executionRestant)}).`
                  : totalRest <= 10
                  ? `⚠ Échéance proche : il reste ${formaterDelaiMixte(state.executionRestant)}.`
                  : `✔ Sous contrôle : ${formaterDelaiMixte(state.executionRestant)} restants.`}
              </div>
            ) : (
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center text-xs text-slate-500">
                Renseignez la Date OC pour démarrer le décompte du délai.
              </div>
            )}
          </div>

          {/* Barre de pinceau + légende */}
          <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-600 dark:text-slate-300 mr-1">
              Cliquer / glisser :
            </span>
            {(
              [
                ['intemperie', 'Intempérie', '#0e7490'],
                ['ferie', 'Férié', '#be123c'],
                ['conge', 'Congé entreprise', '#b45309'],
                ['effacer', 'Effacer', '#475569'],
              ] as const
            ).map(([m, lbl, hex]) => {
              const active = brush === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBrush(m)}
                  style={
                    active
                      ? { backgroundColor: hex, borderColor: hex, color: '#ffffff' }
                      : undefined
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                    active
                      ? ''
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm inline-block border border-white/50"
                    style={{ backgroundColor: hex }}
                  />
                  {lbl}
                </button>
              );
            })}

            <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" /> Sam / Dim
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#4a1d96' }} /> Arrêt
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="w-3 h-3 rounded-sm inline-block border border-sky-400 bg-sky-100" /> Zone MES
            </span>
          </div>

          {/* Légende print-only */}
          <div id="zone-legende-cal" className="hidden print:block border border-slate-300 rounded-lg p-3 bg-slate-50 text-[10px]">
            <div className="font-bold text-slate-900 mb-2">Légende du calendrier</div>
            <div className="grid grid-cols-4 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#0e7490' }} /> Intempérie
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#be123c' }} /> Jour férié
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#b45309' }} /> Congé entreprise
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#4a1d96' }} /> Arrêt de chantier
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" /> Samedi / Dimanche
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-sky-100 border border-sky-400 inline-block" /> Zone MES
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-white border border-slate-400 inline-block" /> Jour ouvrable employé
              </div>
            </div>
          </div>

          {/* Calendrier visuel mensuel */}
          <div
            id="zone-calendrier-delai"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
          >
            {monthsGrid.map(({ y, m }) => {
              const nbJ = new Date(y, m + 1, 0).getDate();
              const dec = (new Date(y, m, 1).getDay() + 6) % 7;
              const weeks: Array<{
                semISO: number;
                days: Array<{
                  day: number | null;
                  cle?: string;
                  cls?: string;
                  inPeriod?: boolean;
                  title?: string;
                }>;
              }> = [];

              let jour = 1;
              let ligne = 0;
              while (jour <= nbJ) {
                const lundi = new Date(y, m, 1 - dec + ligne * 7);
                const semISO = numeroSemaineISO(lundi);
                const weekDays: Array<{
                  day: number | null;
                  cle?: string;
                  cls?: string;
                  inPeriod?: boolean;
                  title?: string;
                }> = [];

                for (let col = 0; col < 7; col++) {
                  const index = ligne * 7 + col - dec;
                  if (index < 0 || jour > nbJ) {
                    weekDays.push({ day: null });
                    continue;
                  }
                  const j = jour++;
                  const d = new Date(y, m, j);
                  const cle = dateCle(d);
                  const inPeriod =
                    Boolean(state.os) && d >= state.os! && d <= state.finAff;
                  const wd = d.getDay();
                  const isWE = wd === 0 || wd === 6;
                  const isArret = state.estEnArret(d);
                  const mk = state.jm[cle] || '';
                  const isMES = Boolean(
                    state.dateMes && !isNaN(state.dateMes.getTime()) && d >= state.dateMes
                  );

                  let cls = 'cal-day-cell ';
                  if (mk === 'intemperie') cls += 'cal-day-intemperie';
                  else if (mk === 'ferie') cls += 'cal-day-ferie';
                  else if (mk === 'conge') cls += 'cal-day-conge';
                  else if (isArret) cls += 'cal-day-arret';
                  else if (isMES && isWE) cls += 'cal-day-weekend-mes';
                  else if (isMES) cls += 'cal-day-mes';
                  else if (isWE) cls += 'cal-day-weekend';
                  else cls += 'cal-day-normal';

                  weekDays.push({
                    day: j,
                    cle,
                    cls,
                    inPeriod,
                    title: `${cle}${isArret ? ' (Arrêt)' : ''}${isMES ? ' (MES)' : ''}${
                      mk ? ` (${mk})` : ''
                    }`,
                  });
                }
                weeks.push({ semISO, days: weekDays });
                ligne++;
              }

              return (
                <div
                  key={`${y}-${m}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5"
                >
                  <div className="text-[11px] font-bold uppercase text-slate-800 dark:text-slate-200 mb-2">
                    {MOIS_FR[m]} {y}
                  </div>
                  <div className="grid grid-cols-8 gap-1 text-center">
                    <div className="text-[9px] text-slate-400 font-semibold flex items-center justify-center">
                      S.
                    </div>
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((dLabel, idx) => (
                      <div
                        key={idx}
                        className="text-[9px] font-semibold text-slate-500 pb-0.5"
                      >
                        {dLabel}
                      </div>
                    ))}
                    {weeks.map((wk, wIdx) => (
                      <React.Fragment key={wIdx}>
                        <div
                          title={`Semaine ISO ${wk.semISO}`}
                          className="text-[9px] font-mono text-slate-400 flex items-center justify-center"
                        >
                          {String(wk.semISO).padStart(2, '0')}
                        </div>
                        {wk.days.map((cell, cIdx) =>
                          cell.day === null ? (
                            <div key={cIdx} />
                          ) : (
                            <button
                              key={cell.cle}
                              type="button"
                              disabled={!cell.inPeriod}
                              title={cell.title}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (cell.cle) handleCellMouseDown(cell.cle);
                              }}
                              onMouseEnter={() => {
                                if (cell.cle) handleCellMouseEnter(cell.cle);
                              }}
                              className={`${cell.cls} ${
                                cell.inPeriod ? '' : 'opacity-20 pointer-events-none'
                              }`}
                            >
                              {cell.day}
                            </button>
                          )
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Récap mensuel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 px-2.5 text-left">Mois</th>
                    <th className="py-2 px-2 text-center">J.Cal.</th>
                    <th className="py-2 px-2 text-center">Sam.</th>
                    <th className="py-2 px-2 text-center">Dim.</th>
                    <th className="py-2 px-2 text-center">Fériés</th>
                    <th className="py-2 px-2 text-center">Congés</th>
                    {sansCalendrier && (
                      <th className="py-2 px-2 text-center">Dates intempéries</th>
                    )}
                    <th className="py-2 px-2 text-center">Intemp.</th>
                    <th className="py-2 px-2 text-center font-bold">Total déduit</th>
                    <th className="py-2 px-2 text-center font-bold">J. Employés</th>
                    <th className="py-2 px-2.5 text-left">Observations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {state.rows.filter((r) => r.nbJ > 0 || r.nMes > 0 || Boolean(r.eaLabel))
                    .length === 0 ? (
                    <tr>
                      <td
                        colSpan={sansCalendrier ? 11 : 10}
                        className="py-6 text-center font-sans italic text-slate-500"
                      >
                        Aucun jour comptabilisé sur la période.
                      </td>
                    </tr>
                  ) : (
                    state.rows
                      .filter((r) => r.nbJ > 0 || r.nMes > 0 || Boolean(r.eaLabel))
                      .map((r) => {
                        const obsParts: string[] = [];
                        if (r.eaLabel) obsParts.push(r.eaLabel);
                        if (r.nMes > 0) obsParts.push(`MES : ${r.nMes} j`);
                        if (r.nbJ === 0 && r.nMes === 0) obsParts.push('Arrêt de délai');
                        return (
                          <tr
                            key={`${r.y}-${r.m}`}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-1.5 px-2.5 font-sans font-semibold text-slate-800 dark:text-slate-100">
                              {MOIS_FR[r.m]} {r.y}
                              {r.nMes > 0 && (
                                <span className="ml-1.5 text-[10px] text-sky-700 dark:text-sky-400">
                                  ({r.nMes}J MES)
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center">{r.nbJ > 0 ? r.nbJ : '—'}</td>
                            <td className="py-1.5 px-2 text-center">{r.nbJ > 0 ? r.nSam : '—'}</td>
                            <td className="py-1.5 px-2 text-center">{r.nbJ > 0 ? r.nDim : '—'}</td>
                            <td className="py-1.5 px-2 text-center">{r.nbJ > 0 ? r.nFer : '—'}</td>
                            <td className="py-1.5 px-2 text-center">{r.nbJ > 0 ? r.nCon : '—'}</td>
                            {sansCalendrier && (
                              <td className="py-1.5 px-2 text-center text-[11px]">
                                {r.nbJ > 0 ? r.intDetail : '—'}
                              </td>
                            )}
                            <td className="py-1.5 px-2 text-center">{r.nbJ > 0 ? r.nInt : '—'}</td>
                            <td className="py-1.5 px-2 text-center font-bold">
                              {r.nbJ > 0 ? r.ded : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-bold text-emerald-700 dark:text-emerald-400">
                              {r.nbJ > 0 ? r.emp : '—'}
                            </td>
                            <td className="py-1.5 px-2.5 text-left font-sans text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {obsParts.join(' · ')}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-300 dark:border-slate-700">
                  <tr>
                    <td
                      colSpan={sansCalendrier ? 9 : 8}
                      className="py-2 px-2.5 text-right uppercase"
                    >
                      Total jours d'exécution employés cumulés :
                    </td>
                    <td className="py-2 px-2 text-center font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {state.consumedExec}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Signatures impression onglet 7 standard */}
          <div className="hidden print:grid grid-cols-2 gap-8 pt-6 text-xs">
            <div className="border border-slate-300 rounded p-3 min-h-24 flex flex-col justify-between">
              <div>
                <div className="font-bold">Dressé par le contrôleur de travaux :</div>
                <div className="font-semibold mt-1">
                  {appData.infosAdministratives.controleur || '_______________'}
                </div>
              </div>
              <div className="border-t border-slate-400 pt-1 text-[10px] text-slate-500">
                Signature
              </div>
            </div>
            <div className="border border-slate-300 rounded p-3 min-h-24 flex flex-col justify-between">
              <div className="font-bold">Vu par l'entrepreneur :</div>
              <div className="border-t border-slate-400 pt-1 text-[10px] text-slate-500">
                Signature
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
