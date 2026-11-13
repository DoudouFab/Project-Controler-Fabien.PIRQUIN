import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Database,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  Layers,
  Moon,
  Printer,
  Redo2,
  Route,
  Save,
  Scale,
  Sun,
  Undo2,
} from 'lucide-react';
import { ConfirmDialog, ConfirmDialogState, ToastContainer, ToastMessage } from './components/AppDialogs';
import { MultiPrintModal, PrintTabSelection } from './components/modals/MultiPrintModal';
import { Tab1Global } from './components/Tab1Global';
import { Tab2Encodage } from './components/Tab2Encodage';
import { Tab3Carnet } from './components/Tab3Carnet';
import { Tab4EaEnCours } from './components/Tab4EaEnCours';
import { Tab5EaValides } from './components/Tab5EaValides';
import { Tab6Cumul } from './components/Tab6Cumul';
import { Tab7Delais } from './components/Tab7Delais';
import { ProjectData, TronconEgout } from './types/project';
import {
  calculerEtatDelai,
  fmt,
  genererStructureVierge,
  mnt,
  prochainNumeroEA,
  srcP,
} from './utils/calculations';
import { INASEP_LOGO_BASE64 } from './constants/inasep';
import { buildInasepDelaySheetHtml, printHtmlViaIframe } from './utils/inasepPrint';

const STORAGE_DATA_KEY = 'projectcontroller_inasep_data';
const STORAGE_THEME_KEY = 'projectcontroller_theme';

function normalizeProjectData(raw: unknown): ProjectData {
  const base = genererStructureVierge();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProjectData>;

  const tronconsEgout: TronconEgout[] = Array.isArray(r.tronconsEgout)
    ? r.tronconsEgout.map((t, idx) => ({
        ref: t.ref || `T${idx + 1}`,
        ordreEncodage: typeof t.ordreEncodage === 'number' ? t.ordreEncodage : idx + 1,
        de: t.de || '',
        a: t.a || '',
        long: Number(t.long) || 0,
        p_amo: Number(t.p_amo) || 0,
        p_ava: Number(t.p_ava) || 0,
        sf: Number(t.sf) || 0,
        fond: Number(t.fond) || 0,
        rev: Number(t.rev) || 0,
        epExist: Number(t.epExist) || 0,
        natureTuyau: t.natureTuyau || 'BA',
        dn: Number(t.dn) || 300,
        diamExt: Number(t.diamExt) || Number(t.dn) || 300,
        milieu: t.milieu || 'TN',
        remblaiType: t.remblaiType || 'Terrain Naturel',
        chauxPourcent: Number(t.chauxPourcent) || 0,
        d9000Type: t.d9000Type || '',
        fait: t.fait !== false,
        lt_force: t.lt_force !== undefined && t.lt_force !== null ? Number(t.lt_force) : null,
        insp_porter: Boolean(t.insp_porter),
        insp_qte: t.insp_qte !== undefined && t.insp_qte !== null ? Number(t.insp_qte) : null,
        cet_porter: Boolean(t.cet_porter),
        cet_qte: t.cet_qte !== undefined && t.cet_qte !== null ? Number(t.cet_qte) : null,
        rocheux: t.rocheux || null,
        compact: t.compact || null,
        remplacement: t.remplacement || null,
        blindage: t.blindage || null,
        avecEnrobage: t.avecEnrobage !== false,
        cvAmo: t.cvAmo || { dint: 0, h: 0 },
        cvAva: t.cvAva || { dint: 0, h: 0 },
      }))
    : [];

  return {
    nomProjet: r.nomProjet || base.nomProjet,
    infosAdministratives: {
      ...base.infosAdministratives,
      ...(r.infosAdministratives || {}),
    },
    marche3P: Array.isArray(r.marche3P) ? r.marche3P : [],
    avenants: Array.isArray(r.avenants) ? r.avenants : [],
    tronconsEgout,
    compteurTroncons:
      typeof r.compteurTroncons === 'number' ? r.compteurTroncons : tronconsEgout.length,
    ordreTroncons:
      typeof r.ordreTroncons === 'number' ? r.ordreTroncons : tronconsEgout.length,
    carnetMesurage: {
      lignesManuelles: Array.isArray(r.carnetMesurage?.lignesManuelles)
        ? r.carnetMesurage.lignesManuelles
        : [],
      statutsLignes: r.carnetMesurage?.statutsLignes || {},
      overrides: r.carnetMesurage?.overrides || {},
      cvAutoGeneres: Array.isArray(r.carnetMesurage?.cvAutoGeneres)
        ? r.carnetMesurage.cvAutoGeneres
        : [],
    },
    historiqueEA: Array.isArray(r.historiqueEA) ? r.historiqueEA : [],
    delais: {
      ...base.delais,
      ...(r.delais || {}),
      joursMarques: r.delais?.joursMarques || {},
      delaisCompl: Array.isArray(r.delais?.delaisCompl) ? r.delais.delaisCompl : [],
      arrets: Array.isArray(r.delais?.arrets) ? r.delais.arrets : [],
    },
    configVoirie: r.configVoirie?.parTroncon ? r.configVoirie : { parTroncon: {} },
    configDemolition: r.configDemolition?.parTroncon ? r.configDemolition : { parTroncon: {} },
  };
}

function setPrintOrientationStyle(orient: 'portrait' | 'landscape') {
  let el = document.getElementById('print-orient-style') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'print-orient-style';
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: A4 ${orient}; margin: 12mm 12mm 15mm 12mm; }`;
}

const TABS = [
  { id: 1, label: '1. Global & Bordereau', icon: Database },
  { id: 2, label: '2. Encodage Tronçons', icon: Route },
  { id: 3, label: '3. Carnet de Mesurage', icon: ClipboardList },
  { id: 4, label: '4. EA en Cours', icon: Layers },
  { id: 5, label: '5. EA Validés', icon: FileCheck2 },
  { id: 6, label: '6. Cumul & Concordance', icon: Scale },
  { id: 7, label: '7. Délais', icon: CalendarClock },
] as const;

export default function App() {
  const [appData, setAppData] = useState<ProjectData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_DATA_KEY);
      if (saved) return normalizeProjectData(JSON.parse(saved));
    } catch {
      // Fallback to clean project structure
    }
    return genererStructureVierge();
  });

  const [activeTab, setActiveTab] = useState<number>(1);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  const [hideBordereauPrint, setHideBordereauPrint] = useState<boolean>(false);
  const [sansCalendrier, setSansCalendrier] = useState<boolean>(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastSeq = useRef(1);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [showMultiPrintModal, setShowMultiPrintModal] = useState<boolean>(false);
  const [multiPrintBatch, setMultiPrintBatch] = useState<PrintTabSelection[] | null>(null);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const undoStackRef = useRef<ProjectData[]>([]);
  const redoStackRef = useRef<ProjectData[]>([]);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
  }, []);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryCounts();
  }, [syncHistoryCounts]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = toastSeq.current++;
    setToasts((prev) => [...prev.slice(-4), { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openConfirm = useCallback((opts: ConfirmDialogState) => {
    setConfirmDialog(opts);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(appData));
    } catch {
      // Ignore quota errors silently
    }
  }, [appData]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    document.body.classList.toggle('hide-bordereau', hideBordereauPrint);
  }, [hideBordereauPrint]);

  useEffect(() => {
    document.body.classList.toggle('print-sans-cal', sansCalendrier);
  }, [sansCalendrier]);

  const handleUpdateData = useCallback(
    (updater: (prev: ProjectData) => ProjectData) => {
      setAppData((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        undoStackRef.current = [...undoStackRef.current.slice(-29), prev];
        redoStackRef.current = [];
        window.setTimeout(syncHistoryCounts, 0);
        return next;
      });
    },
    [syncHistoryCounts]
  );

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    setAppData((curr) => {
      const stack = undoStackRef.current;
      if (stack.length === 0) return curr;
      const previous = stack[stack.length - 1];
      undoStackRef.current = stack.slice(0, -1);
      redoStackRef.current = [...redoStackRef.current.slice(-29), curr];
      window.setTimeout(syncHistoryCounts, 0);
      return previous;
    });
    notify('info', 'Dernière action annulée.');
  }, [notify, syncHistoryCounts]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    setAppData((curr) => {
      const stack = redoStackRef.current;
      if (stack.length === 0) return curr;
      const restored = stack[stack.length - 1];
      redoStackRef.current = stack.slice(0, -1);
      undoStackRef.current = [...undoStackRef.current.slice(-29), curr];
      window.setTimeout(syncHistoryCounts, 0);
      return restored;
    });
    notify('info', 'Action rétablie.');
  }, [notify, syncHistoryCounts]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (undoStackRef.current.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (redoStackRef.current.length > 0) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleSaveJson = () => {
    const json = JSON.stringify(appData, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (appData.nomProjet || 'Chantier').replace(/[^\w\-]+/g, '_');
    a.href = url;
    a.download = `${safeName}_sauvegarde.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('success', `Sauvegarde exportée : ${safeName}_sauvegarde.json`);
  };

  const handleLoadJsonFile = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (!parsed || !Array.isArray(parsed.marche3P)) {
        notify('error', 'Fichier JSON invalide : la structure marche3P est manquante.');
        return;
      }
      const norm = normalizeProjectData(parsed);
      setAppData(norm);
      clearHistory();
      notify(
        'success',
        `Projet chargé : ${norm.nomProjet} (${norm.marche3P.length} postes, ${norm.tronconsEgout.length} tronçons, ${norm.historiqueEA.length} EA).`
      );
    } catch (err) {
      notify(
        'error',
        `Erreur lors de la lecture du fichier JSON : ${
          err instanceof Error ? err.message : 'format invalide'
        }`
      );
    }
  };

  const handleLoadExample = async () => {
    try {
      const resp = await fetch('/exemple_hamois.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const parsed = await resp.json();
      const norm = normalizeProjectData(parsed);
      setAppData(norm);
      clearHistory();
      notify(
        'success',
        `Exemple chargé : ${norm.nomProjet} (${norm.marche3P.length} postes, ${norm.tronconsEgout.length} tronçons).`
      );
    } catch (err) {
      notify(
        'error',
        `Impossible de charger l'exemple HAMOIS : ${
          err instanceof Error ? err.message : 'erreur réseau'
        }`
      );
    }
  };

  const handleResetVierge = () => {
    openConfirm({
      title: 'Créer un chantier vierge',
      message:
        'Toutes les données actuelles non sauvegardées (bordereau, tronçons, carnet, EA et délais) seront remplacées par un dossier vierge.',
      confirmLabel: 'Réinitialiser',
      danger: true,
      onConfirm: () => {
        setAppData(genererStructureVierge());
        clearHistory();
        setActiveTab(1);
        notify('info', 'Nouveau chantier vierge initialisé.');
      },
    });
  };

  const handlePrintActiveTab = (orient: 'portrait' | 'landscape') => {
    setPrintOrientationStyle(orient);
    setMultiPrintBatch(null);
    window.setTimeout(() => {
      window.print();
    }, 80);
  };

  const launchPrintBatch = useCallback(
    (batch: PrintTabSelection[], orient: 'portrait' | 'landscape', nextBatch?: { tabs: PrintTabSelection[]; orient: 'portrait' | 'landscape' }) => {
      setPrintOrientationStyle(orient);
      setMultiPrintBatch(batch);

      const handleAfterPrint = () => {
        window.removeEventListener('afterprint', handleAfterPrint);
        setMultiPrintBatch(null);
        if (nextBatch && nextBatch.tabs.length > 0) {
          openConfirm({
            title: `Lot ${orient === 'portrait' ? 'Portrait' : 'Paysage'} terminé`,
            message: `Le premier lot (${orient}) a été envoyé à l'impression. Voulez-vous lancer le second lot (${nextBatch.orient === 'portrait' ? 'Portrait' : 'Paysage'} — ${nextBatch.tabs.length} onglet(s)) ?`,
            confirmLabel: `Imprimer lot ${nextBatch.orient === 'portrait' ? 'Portrait' : 'Paysage'}`,
            onConfirm: () => {
              launchPrintBatch(nextBatch.tabs, nextBatch.orient);
            },
          });
        }
      };

      window.addEventListener('afterprint', handleAfterPrint);
      window.setTimeout(() => {
        window.print();
      }, 120);
    },
    [openConfirm]
  );

  const handleMultiPrintTabs = (selections: PrintTabSelection[]) => {
    const portraits = selections.filter((s) => s.orientation === 'portrait');
    const landscapes = selections.filter((s) => s.orientation === 'landscape');

    if (portraits.length > 0 && landscapes.length > 0) {
      launchPrintBatch(portraits, 'portrait', { tabs: landscapes, orient: 'landscape' });
    } else if (portraits.length > 0) {
      launchPrintBatch(portraits, 'portrait');
    } else if (landscapes.length > 0) {
      launchPrintBatch(landscapes, 'landscape');
    }
  };

  const handlePrintInasepSheet = () => {
    printHtmlViaIframe(buildInasepDelaySheetHtml(appData));
  };

  const kpis = useMemo(() => {
    const postes = srcP(appData);
    const budget = postes.reduce((s, p) => s + mnt(p.qte, p.pu), 0);
    const cumulValide = (appData.historiqueEA || []).reduce((s, ea) => s + (ea.montant || 0), 0);
    const pctValide = budget > 0 ? (cumulValide / budget) * 100 : 0;
    const etat = calculerEtatDelai(appData);
    const nextEa = prochainNumeroEA(appData);
    return { budget, cumulValide, pctValide, etat, nextEa };
  }, [appData]);

  const renderTabContent = (tabId: number) => {
    switch (tabId) {
      case 1:
        return (
          <Tab1Global
            appData={appData}
            onUpdateData={handleUpdateData}
            onNotify={notify}
            onConfirm={openConfirm}
            hideBordereauPrint={hideBordereauPrint}
            onToggleHideBordereauPrint={setHideBordereauPrint}
            onLoadExample={handleLoadExample}
          />
        );
      case 2:
        return (
          <Tab2Encodage
            appData={appData}
            onUpdateData={handleUpdateData}
            onNotify={notify}
            onConfirm={openConfirm}
          />
        );
      case 3:
        return (
          <Tab3Carnet
            appData={appData}
            onUpdateData={handleUpdateData}
            onNotify={notify}
            onConfirm={openConfirm}
          />
        );
      case 4:
        return (
          <Tab4EaEnCours
            appData={appData}
            onUpdateData={handleUpdateData}
            onNotify={notify}
            onConfirm={openConfirm}
            onAfterCloseEA={() => setActiveTab(5)}
          />
        );
      case 5:
        return (
          <Tab5EaValides
            appData={appData}
            onUpdateData={handleUpdateData}
            onNotify={notify}
            onConfirm={openConfirm}
            onAfterDevalider={() => setActiveTab(4)}
          />
        );
      case 6:
        return <Tab6Cumul appData={appData} onNotify={notify} />;
      case 7:
        return (
          <Tab7Delais
            appData={appData}
            onUpdateData={handleUpdateData}
            onNotify={notify}
            sansCalendrier={sansCalendrier}
            onToggleSansCalendrier={setSansCalendrier}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          {/* Brand + Global KPI Strip + Actions */}
          <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={INASEP_LOGO_BASE64}
                alt="INASEP"
                className="h-10 w-auto object-contain rounded bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                    ProjectController
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Gestion Chantier &amp; Décomptes · F.Pirquin
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[320px] sm:max-w-[460px]">
                  {appData.infosAdministratives.marche
                    ? `${appData.infosAdministratives.marche} — `
                    : ''}
                  {appData.infosAdministratives.intitule || appData.nomProjet || 'Chantier vierge'}
                </div>
              </div>
            </div>

            {/* Compact KPI Strip (flat bordered cells, no pills) */}
            <div className="hidden xl:flex items-center border border-slate-200 dark:border-slate-800 rounded-lg divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Budget marché
                </div>
                <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {fmt(kpis.budget)} €
                </div>
              </div>
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Validé ({appData.historiqueEA.length} EA)
                </div>
                <div className="text-xs font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmt(kpis.cumulValide)} € ({fmt(kpis.pctValide, 1)}%)
                </div>
              </div>
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Prochain EA
                </div>
                <div className="text-xs font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400">
                  EA {String(kpis.nextEa).padStart(2, '0')}
                </div>
              </div>
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Délai consommé
                </div>
                <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {kpis.etat.os ? `${kpis.etat.consumedExec} / ${kpis.etat.totalExec} j` : '—'}
                </div>
              </div>
            </div>

            {/* Utility Actions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer whitespace-nowrap shrink-0"
                title="Exporter le dossier complet au format JSON"
              >
                <Save className="w-3.5 h-3.5" />
                Sauvegarder
              </button>

              <button
                type="button"
                onClick={() => jsonInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                title="Charger une sauvegarde .json"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Charger (.json)
              </button>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLoadJsonFile(file);
                  e.target.value = '';
                }}
              />

              <button
                type="button"
                onClick={handleLoadExample}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                title="Charger le dossier exemple ASS-21-1064 HAMOIS"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                Exemple
              </button>

              <button
                type="button"
                onClick={handleResetVierge}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                title="Réinitialiser sur un chantier vierge"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Nouveau
              </button>

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyCounts.undo === 0}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-35 disabled:pointer-events-none cursor-pointer whitespace-nowrap shrink-0"
                  title={`Annuler la dernière modification (Ctrl+Z) — ${historyCounts.undo} en mémoire`}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Annuler</span>
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyCounts.redo === 0}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border-l border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-35 disabled:pointer-events-none cursor-pointer whitespace-nowrap shrink-0"
                  title={`Rétablir (Ctrl+Y) — ${historyCounts.redo} disponible(s)`}
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => handlePrintActiveTab('portrait')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                  title="Imprimer l'onglet actif en A4 Portrait"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintActiveTab('landscape')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border-l border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                  title="Imprimer l'onglet actif en A4 Paysage"
                >
                  Paysage
                </button>
                <button
                  type="button"
                  onClick={() => setShowMultiPrintModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border-l border-slate-300 dark:border-slate-700 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer whitespace-nowrap shrink-0"
                  title="Impression groupée multi-onglets et feuille INASEP"
                >
                  Lot…
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsDark((d) => !d)}
                className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
                title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
                aria-label="Changer de thème"
              >
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 7-Tab Navigation */}
          <nav className="flex items-center gap-1 overflow-x-auto pt-1.5" aria-label="Navigation principale">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#1e3a5f] dark:border-sky-400 text-[#1e3a5f] dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/25 rounded-t-md'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-t-md'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Workspace (hidden during multi-print batch) */}
      <main
        className={`flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 ${
          multiPrintBatch ? 'hidden print:hidden' : ''
        }`}
      >
        {renderTabContent(activeTab)}
        <div
          className={`text-right text-[10px] text-slate-400 dark:text-slate-600 italic mt-4 ${
            activeTab === 7 ? 'no-print' : ''
          }`}
        >
          © ProjectController-F.Pirquin-INASEP
        </div>
      </main>

      {/* Multi-tab print container (active only while printing a multi-tab batch) */}
      {multiPrintBatch && (
        <div className="hidden print:block w-full">
          {multiPrintBatch.map((item, idx) => (
            <div
              key={item.id}
              className={idx > 0 ? 'break-before-page pt-2' : ''}
            >
              {renderTabContent(item.id)}
              <div
                className={`text-right text-[9px] text-slate-600 italic mt-2 ${
                  item.id === 7 ? 'no-print' : ''
                }`}
              >
                © ProjectController-F.Pirquin-INASEP
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="no-print text-center text-[10px] text-slate-500 dark:text-slate-500 italic py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        ProjectController · F.Pirquin · INASEP — Outil interne de gestion de chantier
      </footer>

      {/* Modals & Toasts */}
      {showMultiPrintModal && (
        <MultiPrintModal
          onClose={() => setShowMultiPrintModal(false)}
          onPrintTabs={handleMultiPrintTabs}
          onPrintInasepSheet={handlePrintInasepSheet}
        />
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
