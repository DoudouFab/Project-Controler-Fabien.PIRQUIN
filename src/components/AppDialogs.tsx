import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((t) => {
        const cls =
          t.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100'
            : t.type === 'warning'
            ? 'bg-amber-50 dark:bg-amber-950/90 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100'
            : t.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100'
            : 'bg-sky-50 dark:bg-sky-950/90 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-100';
        const Icon =
          t.type === 'success' ? CheckCircle2 : t.type === 'info' ? Info : AlertTriangle;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-xs ${cls}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 whitespace-pre-line">{t.text}</div>
            <button
              onClick={() => onDismiss(t.id)}
              className="opacity-60 hover:opacity-100 cursor-pointer shrink-0"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  dialog: ConfirmDialogState | null;
  onClose: () => void;
}> = ({ dialog, onClose }) => {
  if (!dialog) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {dialog.title}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
          {dialog.message}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {dialog.cancelLabel || 'Annuler'}
          </button>
          <button
            onClick={() => {
              dialog.onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg text-white cursor-pointer ${
              dialog.danger
                ? 'bg-rose-700 hover:bg-rose-600'
                : 'bg-emerald-700 hover:bg-emerald-600'
            }`}
          >
            {dialog.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
};
