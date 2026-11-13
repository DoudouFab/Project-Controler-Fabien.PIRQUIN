import React from 'react';
import { Printer, X } from 'lucide-react';
import { printHtmlViaIframe } from '../../utils/inasepPrint';

interface InasepPreviewModalProps {
  html: string;
  onClose: () => void;
}

export const InasepPreviewModal: React.FC<InasepPreviewModalProps> = ({ html, onClose }) => {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Aperçu — Feuille de délais officielle (format INASEP)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Canvas officiel A4 Portrait strictement identique au modèle INASEP
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printHtmlViaIframe(html)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-200 dark:bg-slate-950 p-4 overflow-hidden">
          <iframe
            title="Aperçu feuille de délais INASEP"
            srcDoc={html}
            className="w-full h-full bg-white rounded shadow-lg border border-slate-300"
          />
        </div>
      </div>
    </div>
  );
};
