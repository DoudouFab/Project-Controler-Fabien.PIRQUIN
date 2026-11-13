import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';

export interface PrintTabSelection {
  id: number;
  label: string;
  checked: boolean;
  orientation: 'portrait' | 'landscape';
}

const DEFAULT_SELECTIONS: PrintTabSelection[] = [
  { id: 1, label: '1. Global & Bordereau', checked: true, orientation: 'portrait' },
  { id: 2, label: '2. Encodage Tronçons', checked: false, orientation: 'landscape' },
  { id: 3, label: '3. Carnet de Mesurage', checked: false, orientation: 'landscape' },
  { id: 4, label: '4. EA en Cours', checked: true, orientation: 'landscape' },
  { id: 5, label: '5. EA Validés', checked: false, orientation: 'landscape' },
  { id: 6, label: '6. Cumul & Concordance', checked: false, orientation: 'landscape' },
  { id: 7, label: '7. Délais (calendriers & tableau)', checked: false, orientation: 'portrait' },
];

interface MultiPrintModalProps {
  onClose: () => void;
  onPrintTabs: (selections: PrintTabSelection[]) => void;
  onPrintInasepSheet: () => void;
}

export const MultiPrintModal: React.FC<MultiPrintModalProps> = ({
  onClose,
  onPrintTabs,
  onPrintInasepSheet,
}) => {
  const [items, setItems] = useState<PrintTabSelection[]>(DEFAULT_SELECTIONS);

  const toggleAllChecked = (val: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, checked: val })));
  };

  const setAllOrientation = (ori: 'portrait' | 'landscape') => {
    setItems((prev) => prev.map((it) => ({ ...it, orientation: ori })));
  };

  const selectedCount = items.filter((i) => i.checked).length;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              🖨️ Impression groupée de plusieurs onglets
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cochez les onglets à imprimer et choisissez l'orientation de chacun.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleAllChecked(true)}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={() => toggleAllChecked(false)}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tout décocher
            </button>
            <button
              type="button"
              onClick={() => setAllOrientation('landscape')}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tout paysage
            </button>
            <button
              type="button"
              onClick={() => setAllOrientation('portrait')}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tout portrait
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
              >
                <label className="flex items-center gap-2.5 cursor-pointer font-medium text-slate-800 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={it.checked}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === it.id ? { ...x, checked: e.target.checked } : x
                        )
                      )
                    }
                  />
                  <span>{it.label}</span>
                </label>

                <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === it.id ? { ...x, orientation: 'portrait' } : x
                        )
                      )
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      it.orientation === 'portrait'
                        ? 'bg-sky-700 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Portrait
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === it.id ? { ...x, orientation: 'landscape' } : x
                        )
                      )
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      it.orientation === 'landscape'
                        ? 'bg-sky-700 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Paysage
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
            <div className="text-xs text-slate-700 dark:text-slate-200">
              <div className="font-semibold">Feuille de délais (format INASEP)</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Document officiel A4 Portrait indépendant (mise en page INASEP figée)
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onPrintInasepSheet();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer feuille INASEP
            </button>
          </div>
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
            disabled={selectedCount === 0}
            onClick={() => {
              onPrintTabs(items.filter((i) => i.checked));
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
          >
            🖨️ Lancer l'impression ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
};
