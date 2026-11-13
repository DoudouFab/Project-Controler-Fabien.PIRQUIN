import React, { useMemo, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';
import { LigneManuelle, ProjectData } from '../../types/project';
import {
  candidatsPourCV,
  cleLigneMan,
  collecterCvUniques,
  srcP,
} from '../../utils/calculations';

interface CvPreEncodeModalProps {
  appData: ProjectData;
  onClose: () => void;
  onApply: (lines: LigneManuelle[], generatedKeys: string[], replaceCvKeys: string[]) => void;
}

export const CvPreEncodeModal: React.FC<CvPreEncodeModalProps> = ({
  appData,
  onClose,
  onApply,
}) => {
  const allPostes = useMemo(() => srcP(appData), [appData]);
  const statuts = appData.carnetMesurage?.statutsLignes || {};
  const existingAuto = appData.carnetMesurage?.cvAutoGeneres || [];

  const cvList = useMemo(() => {
    const map = collecterCvUniques(appData);
    return Array.from(map.entries()).map(([key, info]) => {
      const cands = candidatsPourCV(appData, info.h);
      const unique = cands.length === 1;
      const existing80 = (appData.carnetMesurage?.lignesManuelles || []).find(
        (l) =>
          (l.cvKey === key || l.id.startsWith(`cv_${key}_`)) &&
          (l.id.startsWith('cv80_') || l.id.endsWith('a') || Math.abs((l.quantite || 0) - 0.8) < 0.01)
      );
      const existing20 = (appData.carnetMesurage?.lignesManuelles || []).find(
        (l) =>
          (l.cvKey === key || l.id.startsWith(`cv_${key}_`)) &&
          (l.id.startsWith('cv20_') || l.id.endsWith('b') || Math.abs((l.quantite || 0) - 0.2) < 0.01)
      );
      const isBilled =
        (existing80 && Boolean(statuts[cleLigneMan(existing80.id)]?.porteeA)) ||
        (existing20 && Boolean(statuts[cleLigneMan(existing20.id)]?.porteeA));
      return {
        key,
        nom: info.nom,
        h: info.h,
        cands,
        unique,
        alreadyGen: existingAuto.includes(key),
        isBilled: Boolean(isBilled),
        defaultPosteId: existing80?.posteId || (unique ? cands[0].id : ''),
      };
    });
  }, [appData, existingAuto, statuts]);

  const [selectedPostes, setSelectedPostes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    cvList.forEach((cv) => {
      init[cv.key] = cv.defaultPosteId;
    });
    return init;
  });

  const [checkedCvs, setCheckedCvs] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    cvList.forEach((cv) => {
      init[cv.key] = !cv.isBilled && Boolean(cv.defaultPosteId);
    });
    return init;
  });

  const handleValidate = () => {
    const lines: LigneManuelle[] = [];
    const generatedKeys: string[] = [];
    const replaceCvKeys: string[] = [];

    cvList.forEach((cv) => {
      if (cv.isBilled || !checkedCvs[cv.key]) return;
      const pid = (selectedPostes[cv.key] || '').trim();
      const poste = allPostes.find((p) => p.id === pid);
      if (!poste) return;

      replaceCvKeys.push(cv.key);
      generatedKeys.push(cv.key);

      lines.push({
        id: `cv80_${cv.key}`,
        posteId: poste.id,
        libelle: `Pose complète ${cv.nom} (80% — Hors accessoires de finition)`,
        quantite: 0.8,
        detailFormule: `${cv.nom} : H = ${cv.h.toFixed(2)} m\n80% = 0.800 (Hors accessoires de finition)`,
        cvKey: cv.key,
      });
      lines.push({
        id: `cv20_${cv.key}`,
        posteId: poste.id,
        libelle: `Pose complète ${cv.nom} (20% — Accessoires de finition)`,
        quantite: 0.2,
        detailFormule: `${cv.nom} : H = ${cv.h.toFixed(2)} m\n20% = 0.200 (Accessoires de finition)`,
        cvKey: cv.key,
      });
    });

    onApply(lines, generatedKeys, replaceCvKeys);
    onClose();
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              🏗️ Pré-encoder les Chambres de Visite (CV)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Un seul regard est créé par CV unique (profondeur max retenue) et scindé en 2 lignes (0.800 + 0.200). Validez explicitement pour générer dans le Carnet.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cvList.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
              Aucune Chambre de Visite (CV) avec hauteur renseignée détectée sur les tronçons marqués « Fait ».
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2.5 text-center w-10">Inc.</th>
                  <th className="py-2 px-2.5 text-left">CV</th>
                  <th className="py-2 px-2.5 text-right w-20">H max</th>
                  <th className="py-2 px-2.5 text-left">Poste candidat (ou forcer N°)</th>
                  <th className="py-2 px-2.5 text-left w-28">Forcer N°</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {cvList.map((cv) => {
                  const sel = selectedPostes[cv.key] || '';
                  return (
                    <tr
                      key={cv.key}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2 px-2.5 text-center">
                        {cv.isBilled ? (
                          <Lock className="w-3.5 h-3.5 text-emerald-600 mx-auto" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={Boolean(checkedCvs[cv.key])}
                            onChange={(e) =>
                              setCheckedCvs((prev) => ({
                                ...prev,
                                [cv.key]: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300"
                          />
                        )}
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-slate-800 dark:text-slate-100">
                        {cv.nom}
                        {cv.alreadyGen && (
                          <span className="ml-2 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                            (déjà pré-encodé)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums">
                        {cv.h.toFixed(2)} m
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            disabled={cv.isBilled}
                            value={sel}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedPostes((prev) => ({ ...prev, [cv.key]: val }));
                              setCheckedCvs((prev) => ({
                                ...prev,
                                [cv.key]: Boolean(val),
                              }));
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                          >
                            <option value="">— Choisir un poste —</option>
                            {cv.cands.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.id} — {p.desc.slice(0, 75)}
                              </option>
                            ))}
                            {sel && !cv.cands.some((c) => c.id === sel) && (
                              <option value={sel}>
                                {sel} —{' '}
                                {allPostes.find((p) => p.id === sel)?.desc.slice(0, 65) ||
                                  '(Poste forcé)'}
                              </option>
                            )}
                          </select>
                          {cv.unique && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                              <Check className="w-3 h-3" /> candidat unique
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          disabled={cv.isBilled}
                          placeholder="N°..."
                          value={sel}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setSelectedPostes((prev) => ({ ...prev, [cv.key]: val }));
                            setCheckedCvs((prev) => ({
                              ...prev,
                              [cv.key]: Boolean(val),
                            }));
                          }}
                          className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            onClick={handleValidate}
            disabled={cvList.length === 0}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
          >
            ✔ Valider et pré-encoder
          </button>
        </div>
      </div>
    </div>
  );
};
