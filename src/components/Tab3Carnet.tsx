import React, { useMemo, useState } from 'react';
import {
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Construction,
  FileSpreadsheet,
  Hammer,
  Landmark,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Unlock,
} from 'lucide-react';
import { CarnetLineItem, LigneManuelle, PosteMarche, ProjectData } from '../types/project';
import { exportCarnetExcel } from '../utils/excelExports';
import {
  analyserUnite,
  cleLigneMan,
  construireLignesCarnet,
  evalCalc,
  fmt,
  getTronconCetEffectiveEA,
  mnt,
  normCV,
  NRM,
  srcP,
} from '../utils/calculations';
import { PrintHeader } from './PrintHeader';
import { ConfigVoirieDemolModal } from './modals/ConfigVoirieDemolModal';
import { CvPreEncodeModal } from './modals/CvPreEncodeModal';
import { InspectionCetModal } from './modals/InspectionCetModal';

interface Tab3CarnetProps {
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
}

export const Tab3Carnet: React.FC<Tab3CarnetProps> = ({
  appData,
  onUpdateData,
  onNotify,
  onConfirm,
}) => {
  const allPostes = useMemo(() => srcP(appData), [appData]);
  const allLines = useMemo(() => construireLignesCarnet(appData), [appData]);

  // Filtres & tri
  const [sortBy, setSortBy] = useState<'poste_asc' | 'poste_desc' | 'troncon'>('poste_asc');
  const [search, setSearch] = useState('');
  const [masquerFacturees, setMasquerFacturees] = useState(false);
  const [masquerNonCochees, setMasquerNonCochees] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Formulaire ajout ligne manuelle
  const [showManualForm, setShowManualForm] = useState(false);
  const [manSearch, setManSearch] = useState('');
  const [manPosteId, setManPosteId] = useState('');
  const [manModeDim, setManModeDim] = useState(false);
  const [manFormula, setManFormula] = useState('');
  const [manDimL, setManDimL] = useState('');
  const [manDimW, setManDimW] = useState('');
  const [manDimH, setManDimH] = useState('');
  const [manLib, setManLib] = useState('');
  const [manDetail, setManDetail] = useState('');
  const [manPorterEA, setManPorterEA] = useState(true);

  // Modals
  const [inspCetModal, setInspCetModal] = useState<'insp' | 'cet' | null>(null);
  const [showCvModal, setShowCvModal] = useState(false);
  const [configModal, setConfigModal] = useState<'voirie' | 'demol' | null>(null);

  // Buffers locaux d'édition pour éviter les sauts pendant la frappe
  const [qteDrafts, setQteDrafts] = useState<Record<string, string>>({});
  const [posteDrafts, setPosteDrafts] = useState<Record<string, string>>({});

  const filteredPostesManual = useMemo(() => {
    const q = NRM(manSearch);
    if (!q) return allPostes;
    return allPostes.filter((p) => NRM(p.id).includes(q) || NRM(p.desc).includes(q));
  }, [allPostes, manSearch]);

  const selectedManualPoste: PosteMarche | null = useMemo(() => {
    if (manPosteId) {
      const f = allPostes.find((p) => p.id === manPosteId);
      if (f) return f;
    }
    return filteredPostesManual[0] || null;
  }, [allPostes, filteredPostesManual, manPosteId]);

  const manualPreviewQte = useMemo(() => {
    if (!manModeDim) {
      return evalCalc(manFormula);
    }
    const { isVol, isSurf } = analyserUnite(selectedManualPoste?.u);
    const L = parseFloat(manDimL.replace(',', '.')) || 0;
    const W = parseFloat(manDimW.replace(',', '.')) || 0;
    const H = parseFloat(manDimH.replace(',', '.')) || 0;
    if (isVol) return L * W * H;
    if (isSurf) return L * W;
    return L;
  }, [manModeDim, manFormula, manDimL, manDimW, manDimH, selectedManualPoste]);

  // Facturé par poste (depuis historiqueEA)
  const facturesParPoste = useMemo(() => {
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

  const filteredLines = useMemo(() => {
    const q = NRM(search);
    return allLines.filter((l) => {
      if (masquerFacturees && l.porteeA) return false;
      if (masquerNonCochees && !l.coche && !l.porteeA) return false;
      if (!q) return true;
      return (
        NRM(l.posteId || '').includes(q) ||
        NRM(l.posteEff?.desc || '').includes(q) ||
        NRM(l.libTroncon).includes(q) ||
        NRM(l.libPrestation).includes(q) ||
        NRM(l.annotation).includes(q)
      );
    });
  }, [allLines, search, masquerFacturees, masquerNonCochees]);

  const groupedLines = useMemo(() => {
    if (sortBy === 'troncon') {
      const sorted = [...filteredLines].sort((a, b) => a.ordreTroncon - b.ordreTroncon);
      return [
        {
          grpKey: '__ALL_TRONCON__',
          posteId: null as string | null,
          poste: null as PosteMarche | null,
          lines: sorted,
          totalEA: sorted.reduce((s, l) => (!l.porteeA && l.coche ? s + l.qEff : s), 0),
          totalFacture: 0,
        },
      ];
    }

    const sorted = [...filteredLines].sort((a, b) => {
      const pa = a.posteId || 'ZZZZ_NON_LIE';
      const pb = b.posteId || 'ZZZZ_NON_LIE';
      const c = pa.localeCompare(pb, 'fr', { numeric: true, sensitivity: 'base' });
      const dir = sortBy === 'poste_desc' ? -c : c;
      if (dir !== 0) return dir;
      return a.ordreTroncon - b.ordreTroncon;
    });

    const groups: Array<{
      grpKey: string;
      posteId: string | null;
      poste: PosteMarche | null;
      lines: CarnetLineItem[];
      totalEA: number;
      totalFacture: number;
    }> = [];

    sorted.forEach((l) => {
      const gKey = l.posteId || '__NON_LIE__';
      let last = groups[groups.length - 1];
      if (!last || last.grpKey !== gKey) {
        const poste = l.posteId ? allPostes.find((p) => p.id === l.posteId) || l.posteEff : null;
        last = {
          grpKey: gKey,
          posteId: l.posteId,
          poste,
          lines: [],
          totalEA: 0,
          totalFacture: l.posteId ? facturesParPoste.get(l.posteId) || 0 : 0,
        };
        groups.push(last);
      }
      last.lines.push(l);
      if (!l.porteeA && l.coche) {
        last.totalEA += l.qEff;
      }
    });

    return groups;
  }, [filteredLines, sortBy, allPostes, facturesParPoste]);

  // Actions sur les statuts et overrides
  const toggleCocheEA = (cle: string, val: boolean) => {
    onUpdateData((prev) => {
      const carnet = prev.carnetMesurage || {
        lignesManuelles: [],
        statutsLignes: {},
        overrides: {},
      };
      const cur = carnet.statutsLignes?.[cle] || { porteeA: null, coche: false };
      return {
        ...prev,
        carnetMesurage: {
          ...carnet,
          statutsLignes: {
            ...carnet.statutsLignes,
            [cle]: { ...cur, coche: val },
          },
        },
      };
    });
  };

  const toggleLockBilledLine = (l: CarnetLineItem) => {
    const isUnlocked = Boolean(l.deverrouille);
    if (!isUnlocked) {
      onConfirm({
        title: `Déverrouiller une ligne facturée (${l.porteeA}) ?`,
        message:
          `La ligne « ${l.libPrestation} » (${l.libTroncon}) a déjà été portée à ${l.porteeA}.\n\n` +
          `La déverrouiller permet de modifier son poste ou sa quantité directement, mais modifiera le présent carnet sans réécrire l'historique archivé.`,
        confirmLabel: 'Déverrouiller',
        danger: true,
        onConfirm: () => {
          onUpdateData((prev) => {
            const carnet = prev.carnetMesurage;
            const cur = carnet.statutsLignes[l.cle] || { porteeA: l.porteeA, coche: false };
            return {
              ...prev,
              carnetMesurage: {
                ...carnet,
                statutsLignes: {
                  ...carnet.statutsLignes,
                  [l.cle]: { ...cur, deverrouille: true },
                },
              },
            };
          });
        },
      });
    } else {
      onUpdateData((prev) => {
        const carnet = prev.carnetMesurage;
        const cur = carnet.statutsLignes[l.cle] || { porteeA: l.porteeA, coche: false };
        return {
          ...prev,
          carnetMesurage: {
            ...carnet,
            statutsLignes: {
              ...carnet.statutsLignes,
              [l.cle]: { ...cur, deverrouille: false },
            },
          },
        };
      });
    }
  };

  const updateOverride = (
    cle: string,
    patch: { posteId?: string | null; quantite?: number | null; annotation?: string; formuleSupplement?: string }
  ) => {
    onUpdateData((prev) => {
      const carnet = prev.carnetMesurage || {
        lignesManuelles: [],
        statutsLignes: {},
        overrides: {},
      };
      const curOv = { ...(carnet.overrides?.[cle] || {}) };
      if ('posteId' in patch) {
        if (patch.posteId) curOv.posteId = patch.posteId;
        else delete curOv.posteId;
      }
      if ('quantite' in patch) {
        if (patch.quantite !== null && patch.quantite !== undefined && isFinite(patch.quantite)) {
          curOv.quantite = patch.quantite;
        } else {
          delete curOv.quantite;
        }
      }
      if ('annotation' in patch) {
        if (patch.annotation) curOv.annotation = patch.annotation;
        else delete curOv.annotation;
      }
      if ('formuleSupplement' in patch) {
        if (patch.formuleSupplement) curOv.formuleSupplement = patch.formuleSupplement;
        else delete curOv.formuleSupplement;
      }

      const nextOverrides = { ...carnet.overrides };
      if (Object.keys(curOv).length === 0) {
        delete nextOverrides[cle];
      } else {
        nextOverrides[cle] = curOv;
      }
      return {
        ...prev,
        carnetMesurage: {
          ...carnet,
          overrides: nextOverrides,
        },
      };
    });
  };

  const commitPosteOverride = (l: CarnetLineItem, raw: string) => {
    const clean = raw.trim();
    if (!clean) {
      updateOverride(l.cle, { posteId: null });
      return;
    }
    const idToken = clean.includes(' — ') ? clean.split(' — ')[0].trim() : clean;
    const found = allPostes.find((p) => p.id.toLowerCase() === idToken.toLowerCase());
    if (!found) {
      onNotify('warning', `Poste « ${idToken} » introuvable dans le bordereau.`);
      return;
    }
    updateOverride(l.cle, { posteId: found.id });
    setPosteDrafts((prev) => {
      const n = { ...prev };
      delete n[l.cle];
      return n;
    });
  };

  const commitQtyOverride = (l: CarnetLineItem, raw: string) => {
    const clean = raw.trim();
    if (!clean) {
      updateOverride(l.cle, { quantite: null });
      return;
    }
    const evaluated = evalCalc(clean);
    if (evaluated === null) {
      onNotify('warning', 'Expression de quantité invalide.');
      return;
    }
    const rounded = Math.round(evaluated * 1000) / 1000;
    const nextPatch: { quantite: number; formuleSupplement?: string } = { quantite: rounded };
    if (/[+\-*/()]/.test(clean.replace(/^-/, ''))) {
      nextPatch.formuleSupplement = `${clean} = ${rounded.toFixed(3)}`;
    }
    updateOverride(l.cle, nextPatch);
    setQteDrafts((prev) => {
      const n = { ...prev };
      delete n[l.cle];
      return n;
    });
  };

  const handleDeleteOrIgnoreLine = (l: CarnetLineItem) => {
    if (l.manuelleId) {
      onConfirm({
        title: 'Supprimer cette ligne manuelle ?',
        message: `La ligne « ${l.libPrestation} » sera supprimée définitivement du carnet.`,
        danger: true,
        confirmLabel: 'Supprimer',
        onConfirm: () => {
          onUpdateData((prev) => {
            const carnet = prev.carnetMesurage;
            const target = (carnet.lignesManuelles || []).find((m) => m.id === l.manuelleId);
            const remaining = (carnet.lignesManuelles || []).filter((m) => m.id !== l.manuelleId);

            // Nettoyage cvAutoGeneres pour ré-autoriser le pré-encodage CV si plus aucune ligne de ce CV ne subsiste
            let nextCvGen = [...(carnet.cvAutoGeneres || [])];
            if (target) {
              const deriveCvKey = (item: LigneManuelle): string | null => {
                if (item.cvKey) return item.cvKey;
                if (item.id.startsWith('cv_')) {
                  const parts = item.id.split('_');
                  if (parts.length >= 2) return parts[1];
                }
                if (/pré-encodage auto cv/i.test(item.detailFormule || '')) {
                  const m = String(item.libelle || '').match(/^(.*?)\s*—\s*H fouille/);
                  return m ? normCV(m[1]) : null;
                }
                return null;
              };
              const targetKey = deriveCvKey(target);
              if (targetKey) {
                const stillUsed = remaining.some((r) => deriveCvKey(r) === targetKey);
                if (!stillUsed) {
                  nextCvGen = nextCvGen.filter((k) => k !== targetKey);
                }
              }
            }

            const nextStatuts = { ...carnet.statutsLignes };
            delete nextStatuts[l.cle];
            const nextOverrides = { ...carnet.overrides };
            delete nextOverrides[l.cle];

            return {
              ...prev,
              carnetMesurage: {
                ...carnet,
                lignesManuelles: remaining,
                cvAutoGeneres: nextCvGen,
                statutsLignes: nextStatuts,
                overrides: nextOverrides,
              },
            };
          });
          onNotify('info', 'Ligne supprimée.');
        },
      });
      return;
    }

    // Ligne automatique / CET / correction -> ignorer (et décocher insp_porter / cet_porter si applicable)
    onConfirm({
      title: 'Retirer / masquer cette ligne du carnet ?',
      message: `La ligne « ${l.libPrestation} » (${l.libTroncon}) sera retirée du carnet.`,
      danger: true,
      confirmLabel: 'Retirer',
      onConfirm: () => {
        onUpdateData((prev) => {
          const carnet = prev.carnetMesurage;
          let nextTroncons = prev.tronconsEgout;
          const nextOverrides = { ...carnet.overrides };

          if (l.cle.endsWith('_insp')) {
            const ref = l.cle.replace(/^auto_/, '').replace(/_insp$/, '');
            nextTroncons = nextTroncons.map((t) =>
              t.ref === ref ? { ...t, insp_porter: false, insp_qte: null } : t
            );
          } else if (l.cle.startsWith('cet_')) {
            const typeName = l.cetType || l.cle.replace(/^cet_/, '').replace(/_/g, ' ');
            nextTroncons = nextTroncons.map((t) =>
              t.d9000Type === typeName && !getTronconCetEffectiveEA(t, carnet.statutsLignes)
                ? { ...t, cet_porter: false, cet_qte: null, cet_porteeA: null }
                : t
            );
          } else {
            nextOverrides[l.cle] = { ...(nextOverrides[l.cle] || {}), _ignore: true };
          }

          return {
            ...prev,
            tronconsEgout: nextTroncons,
            carnetMesurage: {
              ...carnet,
              overrides: nextOverrides,
            },
          };
        });
        onNotify('info', 'Ligne retirée du carnet.');
      },
    });
  };

  const handleBulkEA = (val: boolean) => {
    onConfirm({
      title: val ? 'Tout porter à l’EA en cours ?' : 'Tout décocher pour l’EA en cours ?',
      message: val
        ? 'Toutes les lignes non facturées et non ignorées (avec poste associé) seront cochées pour le prochain EA.'
        : 'Toutes les cases « EA » non encore facturées seront décochées.',
      confirmLabel: val ? 'Tout cocher' : 'Tout décocher',
      onConfirm: () => {
        onUpdateData((prev) => {
          const carnet = prev.carnetMesurage;
          const nextStatuts = { ...carnet.statutsLignes };
          allLines.forEach((l) => {
            if (l.porteeA) return;
            if (val && !l.posteId) return;
            const cur = nextStatuts[l.cle] || { porteeA: null, coche: false };
            nextStatuts[l.cle] = { ...cur, coche: val };
          });
          return {
            ...prev,
            carnetMesurage: {
              ...carnet,
              statutsLignes: nextStatuts,
            },
          };
        });
      },
    });
  };

  const handleAddManualLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManualPoste) {
      onNotify('warning', 'Sélectionnez un poste du bordereau.');
      return;
    }
    const q = manualPreviewQte;
    if (q === null || !isFinite(q)) {
      onNotify('warning', 'Quantité ou formule invalide.');
      return;
    }
    const newId = `lm_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const formuleDesc = manModeDim
      ? [
          manDimL ? `L=${manDimL}m` : '',
          manDimW ? `l=${manDimW}m` : '',
          manDimH ? `H=${manDimH}m` : '',
        ]
          .filter(Boolean)
          .join(' × ') + ` = ${q.toFixed(3)} ${selectedManualPoste.u}`
      : manFormula.trim() || `${q.toFixed(3)} ${selectedManualPoste.u}`;
    const detail = manDetail.trim()
      ? `${manDetail.trim()}\n${formuleDesc}`
      : formuleDesc;

    const newLine: LigneManuelle = {
      id: newId,
      posteId: selectedManualPoste.id,
      libelle: manLib.trim() || selectedManualPoste.desc,
      quantite: Math.round(q * 1000) / 1000,
      detailFormule: detail,
    };

    onUpdateData((prev) => {
      const carnet = prev.carnetMesurage;
      return {
        ...prev,
        carnetMesurage: {
          ...carnet,
          lignesManuelles: [...(carnet.lignesManuelles || []), newLine],
          statutsLignes: {
            ...carnet.statutsLignes,
            [cleLigneMan(newId)]: { porteeA: null, coche: manPorterEA },
          },
        },
      };
    });

    setManFormula('');
    setManDimL('');
    setManDimW('');
    setManDimH('');
    setManLib('');
    setManDetail('');
    setShowManualForm(false);
    onNotify('success', `Ligne ajoutée sur le poste ${selectedManualPoste.id}.`);
  };

  const eaStats = useMemo(() => {
    let nbChecked = 0;
    let totalMontant = 0;
    allLines.forEach((l) => {
      if (!l.porteeA && l.coche && l.posteEff) {
        nbChecked++;
        totalMontant += mnt(l.qEff, l.posteEff.pu);
      }
    });
    return { nbChecked, totalMontant: Math.round(totalMontant * 100) / 100 };
  }, [allLines]);

  return (
    <div className="space-y-4">
      <PrintHeader infos={appData.infosAdministratives} />

      <datalist id="postes-marche-list">
        {allPostes.map((p) => (
          <option key={p.id} value={`${p.id} — ${p.desc}`} />
        ))}
      </datalist>

      {/* Barre d'actions automatisations */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
          </button>
          <button
            type="button"
            onClick={() => setInspCetModal('insp')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Inspection caméra
          </button>
          <button
            type="button"
            onClick={() => setInspCetModal('cet')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Landmark className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> CET / D9000
          </button>
          <button
            type="button"
            onClick={() => setShowCvModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            Pré-encoder les CV
          </button>
          <button
            type="button"
            onClick={() => setConfigModal('voirie')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Construction className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Config. Voirie
          </button>
          <button
            type="button"
            onClick={() => setConfigModal('demol')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Hammer className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Config. Démolition
          </button>
          <button
            type="button"
            disabled={filteredLines.length === 0}
            onClick={() => {
              exportCarnetExcel(appData, filteredLines);
              onNotify('success', `Export Excel Carnet généré (${filteredLines.length} lignes).`);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 text-emerald-800 dark:text-emerald-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
          {eaStats.nbChecked} ligne(s) cochée(s) ·{' '}
          <span className="font-bold text-emerald-700 dark:text-emerald-400">
            {fmt(eaStats.totalMontant)} €
          </span>
        </div>
      </div>

      {/* Formulaire ligne manuelle */}
      {showManualForm && (
        <form
          onSubmit={handleAddManualLine}
          className="no-print bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-800 rounded-xl p-4 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              Nouvelle ligne manuelle dans le Carnet
            </h3>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Fermer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Filtrer le bordereau
              </label>
              <input
                type="text"
                value={manSearch}
                onChange={(e) => setManSearch(e.target.value)}
                placeholder="Mot-clé ou N°..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div className="md:col-span-8">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Poste du marché ({filteredPostesManual.length} résultat(s))
              </label>
              <select
                value={selectedManualPoste?.id || ''}
                onChange={(e) => setManPosteId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {filteredPostesManual.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {p.desc} ({p.u} · {fmt(p.pu)} €)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Libellé / Localisation
              </label>
              <input
                type="text"
                value={manLib}
                onChange={(e) => setManLib(e.target.value)}
                placeholder="ex: Raccordement particulier n°14"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="md:col-span-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  {manModeDim
                    ? `Dimensions (${selectedManualPoste?.u || ''})`
                    : `Quantité ou formule (${selectedManualPoste?.u || ''})`}
                </label>
                <button
                  type="button"
                  onClick={() => setManModeDim((v) => !v)}
                  className="text-[11px] text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  {manModeDim ? 'Saisie par formule' : 'Saisie par L × l × H'}
                </button>
              </div>
              {!manModeDim ? (
                <input
                  type="text"
                  value={manFormula}
                  onChange={(e) => setManFormula(e.target.value)}
                  placeholder="ex: 3*1.6*0.4 ou 12.5"
                  className="w-full px-2.5 py-1.5 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={manDimL}
                    onChange={(e) => setManDimL(e.target.value)}
                    placeholder="L (m)"
                    className="px-2 py-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  {(analyserUnite(selectedManualPoste?.u).isSurf ||
                    analyserUnite(selectedManualPoste?.u).isVol) && (
                    <input
                      type="text"
                      value={manDimW}
                      onChange={(e) => setManDimW(e.target.value)}
                      placeholder="l (m)"
                      className="px-2 py-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  )}
                  {analyserUnite(selectedManualPoste?.u).isVol && (
                    <input
                      type="text"
                      value={manDimH}
                      onChange={(e) => setManDimH(e.target.value)}
                      placeholder="H (m)"
                      className="px-2 py-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Note / détail de mesurage
              </label>
              <input
                type="text"
                value={manDetail}
                onChange={(e) => setManDetail(e.target.value)}
                placeholder="Complément facultatif..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={manPorterEA}
                onChange={(e) => setManPorterEA(e.target.checked)}
              />
              <span>Porter directement à l'EA en cours</span>
            </label>
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                Résultat : {manualPreviewQte !== null ? `${manualPreviewQte.toFixed(3)} ${selectedManualPoste?.u || ''}` : '—'}
              </span>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold cursor-pointer"
              >
                Ajouter au carnet
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Barre de filtres & contrôles de masse */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer poste / tronçon / libellé..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 w-56"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="poste_asc">Grouper par Poste (croissant)</option>
            <option value="poste_desc">Grouper par Poste (décroissant)</option>
            <option value="troncon">Ordre des tronçons (sans groupes)</option>
          </select>

          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={masquerFacturees}
              onChange={(e) => setMasquerFacturees(e.target.checked)}
            />
            <span>Masquer lignes facturées</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={masquerNonCochees}
              onChange={(e) => setMasquerNonCochees(e.target.checked)}
            />
            <span>Masquer lignes non cochées</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showAnnotations}
              onChange={(e) => setShowAnnotations(e.target.checked)}
            />
            <span>Afficher annotations</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleBulkEA(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-medium cursor-pointer whitespace-nowrap"
          >
            <CheckSquare className="w-3.5 h-3.5" /> Tout porter EA
          </button>
          <button
            type="button"
            onClick={() => handleBulkEA(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium cursor-pointer whitespace-nowrap"
          >
            <Square className="w-3.5 h-3.5" /> Tout décocher EA
          </button>
          {sortBy !== 'troncon' && (
            <>
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups(new Set(groupedLines.map((g) => g.grpKey)))
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                ▶ Tout enrouler
              </button>
              <button
                type="button"
                onClick={() => setCollapsedGroups(new Set())}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                ▼ Tout dérouler
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tableau du carnet */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredLines.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Aucune ligne de mesurage à afficher. Encodez des tronçons dans l'onglet 2 ou ajoutez une ligne manuelle.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2.5 text-center w-24">Statut / EA</th>
                  <th className="py-2 px-2.5 text-left w-48">Poste marché</th>
                  <th className="py-2 px-2.5 text-left">Tronçon / Prestation</th>
                  <th className="py-2 px-2.5 text-left">Détail & Formule de calcul</th>
                  {showAnnotations && (
                    <th className="py-2 px-2.5 text-left w-44">Annotation</th>
                  )}
                  <th className="py-2 px-2.5 text-center w-14">Unité</th>
                  <th className="py-2 px-2.5 text-right w-28">Quantité</th>
                  <th className="py-2 px-2.5 text-right w-24">Montant (€)</th>
                  <th className="no-print py-2 px-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody>
                {groupedLines.map((grp) => {
                  const isCollapsed = collapsedGroups.has(grp.grpKey);
                  const unite = grp.poste?.u || '';
                  return (
                    <React.Fragment key={grp.grpKey}>
                      {sortBy !== 'troncon' && (
                        <tr
                          onClick={() =>
                            setCollapsedGroups((prev) => {
                              const n = new Set(prev);
                              if (n.has(grp.grpKey)) n.delete(grp.grpKey);
                              else n.add(grp.grpKey);
                              return n;
                            })
                          }
                          className="bg-slate-50 dark:bg-slate-800/80 border-y border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <td colSpan={showAnnotations ? 9 : 8} className="py-2 px-3">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 min-w-0">
                                {isCollapsed ? (
                                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                                )}
                                <span className="font-mono text-sky-700 dark:text-sky-400 shrink-0">
                                  {grp.posteId ? `Poste ${grp.posteId}` : 'Non lié au bordereau'}
                                </span>
                                {grp.poste && (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    — {grp.poste.desc}
                                  </span>
                                )}
                                <span className="text-[11px] font-normal text-slate-500 whitespace-nowrap">
                                  ({grp.lines.length} ligne{grp.lines.length > 1 ? 's' : ''})
                                </span>
                              </div>
                              <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-right">
                                {grp.poste && (
                                  <span className="text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap">
                                    Prévue : {fmt(grp.poste.qte, 3)} {unite}
                                  </span>
                                )}
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                                  EA : {fmt(grp.totalEA, 3)} {unite}
                                </span>
                                <span className="text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap">
                                  Facturé : {fmt(grp.totalFacture, 3)} {unite}
                                </span>
                                <span className="text-sky-700 dark:text-sky-400 font-bold whitespace-nowrap">
                                  Cumulé : {fmt(grp.totalEA + grp.totalFacture, 3)} {unite}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {!isCollapsed &&
                        grp.lines.map((l) => {
                          const canEdit = !l.porteeA || l.deverrouille;
                          const montantLigne = l.posteEff ? mnt(l.qEff, l.posteEff.pu) : 0;
                          const rowBg = l.isCorrection
                            ? 'bg-rose-50/70 dark:bg-rose-950/25'
                            : l.isUpdatedAfterEA
                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                            : l.porteeA && !l.deverrouille
                            ? 'bg-slate-50/50 dark:bg-slate-950/30 opacity-75'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/30';

                          const qDraft = qteDrafts[l.cle];
                          const pDraft = posteDrafts[l.cle];

                          return (
                            <tr
                              key={l.cle}
                              className={`border-b border-slate-200 dark:border-slate-800 align-top ${rowBg}`}
                            >
                              {/* Statut / EA */}
                              <td className="py-2 px-2.5 text-center">
                                {l.porteeA ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleLockBilledLine(l)}
                                    title={
                                      l.deverrouille
                                        ? 'Reverrouiller cette ligne facturée'
                                        : `Facturée dans ${l.porteeA} — Cliquer pour déverrouiller`
                                    }
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold cursor-pointer ${
                                      l.deverrouille
                                        ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
                                        : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                    }`}
                                  >
                                    {l.deverrouille ? (
                                      <Unlock className="w-3 h-3" />
                                    ) : (
                                      <Lock className="w-3 h-3" />
                                    )}
                                    {l.porteeA}
                                  </button>
                                ) : (
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                                    <input
                                      type="checkbox"
                                      checked={l.coche}
                                      disabled={!l.posteId}
                                      onChange={(e) => toggleCocheEA(l.cle, e.target.checked)}
                                    />
                                    <span className="text-[11px]">EA</span>
                                  </label>
                                )}
                              </td>

                              {/* Poste associé */}
                              <td className="py-2 px-2.5">
                                <div className="flex items-center gap-1">
                                  <span
                                    className={`font-mono font-bold ${
                                      l.posteId
                                        ? 'text-sky-700 dark:text-sky-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {l.posteId || 'N/D'}
                                  </span>
                                  {l.posteForceManuellement && (
                                    <span
                                      title="Poste forcé manuellement"
                                      className="text-amber-600 dark:text-amber-400 text-[11px]"
                                    >
                                      ⚡
                                    </span>
                                  )}
                                  {l.posteForceManuellement && canEdit && (
                                    <button
                                      type="button"
                                      title="Rétablir le poste automatique"
                                      onClick={() => updateOverride(l.cle, { posteId: null })}
                                      className="no-print text-slate-400 hover:text-amber-600 cursor-pointer"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                {l.posteEff && (
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                                    {l.posteEff.desc}
                                  </div>
                                )}
                                {canEdit && (
                                  <input
                                    list="postes-marche-list"
                                    value={pDraft ?? ''}
                                    placeholder="Lier / changer poste..."
                                    onChange={(e) =>
                                      setPosteDrafts((prev) => ({
                                        ...prev,
                                        [l.cle]: e.target.value,
                                      }))
                                    }
                                    onBlur={(e) => {
                                      if (e.target.value.trim()) {
                                        commitPosteOverride(l, e.target.value);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitPosteOverride(l, (e.target as HTMLInputElement).value);
                                      }
                                    }}
                                    className="no-print mt-1 w-full px-1.5 py-0.5 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                  />
                                )}
                              </td>

                              {/* Tronçon / Prestation */}
                              <td className="py-2 px-2.5">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {l.libPrestation}
                                </div>
                                <div className="text-[11px] font-mono text-sky-700 dark:text-sky-400 mt-0.5">
                                  {l.libTroncon}
                                </div>
                                {l.isCorrection && (
                                  <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 mt-0.5">
                                    Correction suite modification
                                  </div>
                                )}
                                {l.isUpdatedAfterEA && (
                                  <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                                    Mis à jour après clôture EA
                                  </div>
                                )}
                              </td>

                              {/* Formule + complément */}
                              <td className="py-2 px-2.5">
                                <pre className="whitespace-pre-wrap font-sans text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed m-0">
                                  {l.formuleTxt}
                                </pre>
                                {l.formuleSupplement && (
                                  <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-sky-700 dark:text-sky-300">
                                    {l.formuleSupplement}
                                  </div>
                                )}
                                {canEdit && (
                                  <input
                                    type="text"
                                    value={l.formuleSupplement}
                                    placeholder="+ note / détail calcul..."
                                    onChange={(e) =>
                                      updateOverride(l.cle, {
                                        formuleSupplement: e.target.value,
                                      })
                                    }
                                    className="no-print mt-1 w-full px-1.5 py-0.5 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                                  />
                                )}
                              </td>

                              {/* Annotation */}
                              {showAnnotations && (
                                <td className="py-2 px-2.5">
                                  <input
                                    type="text"
                                    value={l.annotation}
                                    disabled={!canEdit}
                                    placeholder="Observation..."
                                    onChange={(e) =>
                                      updateOverride(l.cle, { annotation: e.target.value })
                                    }
                                    className="w-full px-1.5 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 disabled:opacity-60"
                                  />
                                </td>
                              )}

                              {/* Unité */}
                              <td className="py-2 px-2.5 text-center text-slate-600 dark:text-slate-300">
                                {l.posteEff?.u || l.unite}
                              </td>

                              {/* Quantité */}
                              <td className="py-2 px-2.5 text-right">
                                <div className="inline-flex items-center justify-end gap-1">
                                  <input
                                    type="text"
                                    disabled={!canEdit}
                                    value={qDraft ?? l.qEff.toFixed(3)}
                                    onChange={(e) =>
                                      setQteDrafts((prev) => ({
                                        ...prev,
                                        [l.cle]: e.target.value,
                                      }))
                                    }
                                    onBlur={(e) => commitQtyOverride(l, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitQtyOverride(
                                          l,
                                          (e.target as HTMLInputElement).value
                                        );
                                      }
                                    }}
                                    className={`w-22 px-1.5 py-1 text-right font-mono tabular-nums rounded border disabled:opacity-70 ${
                                      l.qForce
                                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                                    }`}
                                  />
                                  {l.qForce && (
                                    <span title={`Forcée (auto = ${l.qCalc.toFixed(3)})`}>
                                      ⚡
                                    </span>
                                  )}
                                  {l.qForce && canEdit && (
                                    <button
                                      type="button"
                                      title={`Rétablir valeur calculée (${l.qCalc.toFixed(3)})`}
                                      onClick={() => updateOverride(l.cle, { quantite: null })}
                                      className="no-print text-amber-600 hover:text-amber-800 cursor-pointer"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Montant */}
                              <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold">
                                {l.posteEff ? fmt(montantLigne) : '—'}
                              </td>

                              {/* Action supprimer / retirer */}
                              <td className="no-print py-2 px-2 text-center">
                                {(!l.porteeA || l.manuelleId) && (
                                  <button
                                    type="button"
                                    title={
                                      l.manuelleId
                                        ? 'Supprimer cette ligne manuelle'
                                        : 'Retirer / masquer cette ligne'
                                    }
                                    onClick={() => handleDeleteOrIgnoreLine(l)}
                                    className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals Carnet */}
      {inspCetModal && (
        <InspectionCetModal
          mode={inspCetModal}
          appData={appData}
          onClose={() => setInspCetModal(null)}
          onApply={(updates) => {
            onUpdateData((prev) => {
              const map = new Map(updates.map((u) => [u.ref, u]));
              return {
                ...prev,
                tronconsEgout: (prev.tronconsEgout || []).map((t) => {
                  const u = map.get(t.ref);
                  if (!u) return t;
                  if (inspCetModal === 'insp') {
                    return { ...t, insp_porter: u.porter, insp_qte: u.qte };
                  }
                  if (getTronconCetEffectiveEA(t, prev.carnetMesurage?.statutsLignes)) {
                    return t;
                  }
                  return { ...t, cet_porter: u.porter, cet_qte: u.qte, cet_porteeA: null };
                }),
              };
            });
            onNotify(
              'success',
              inspCetModal === 'insp'
                ? 'Lignes Inspection caméra mises à jour.'
                : 'Lignes CET / D9000 mises à jour.'
            );
          }}
        />
      )}

      {showCvModal && (
        <CvPreEncodeModal
          appData={appData}
          onClose={() => setShowCvModal(false)}
          onApply={(lines, generatedKeys, replaceCvKeys) => {
            onUpdateData((prev) => {
              const carnet = prev.carnetMesurage;
              const replaceSet = new Set(replaceCvKeys);
              const keptManuals = (carnet.lignesManuelles || []).filter((lm) => {
                if (lm.cvKey && replaceSet.has(lm.cvKey)) return false;
                if (
                  replaceCvKeys.some((k) => lm.id.startsWith(`cv_${k}_`)) &&
                  !carnet.statutsLignes?.[cleLigneMan(lm.id)]?.porteeA
                ) {
                  return false;
                }
                return true;
              });
              const nextStatuts = { ...carnet.statutsLignes };
              lines.forEach((nl) => {
                const cle = cleLigneMan(nl.id);
                if (!nextStatuts[cle]) {
                  nextStatuts[cle] = { porteeA: null, coche: false };
                }
              });
              const mergedGen = Array.from(
                new Set([...(carnet.cvAutoGeneres || []), ...generatedKeys])
              );
              return {
                ...prev,
                carnetMesurage: {
                  ...carnet,
                  lignesManuelles: [...keptManuals, ...lines],
                  statutsLignes: nextStatuts,
                  cvAutoGeneres: mergedGen,
                },
              };
            });
            onNotify('success', `${lines.length} ligne(s) CV (0.8 / 0.2) générée(s) dans le Carnet.`);
          }}
        />
      )}

      {configModal && (
        <ConfigVoirieDemolModal
          mode={configModal}
          appData={appData}
          onClose={() => setConfigModal(null)}
          onApply={(updatedConfig, newManualLines, removedIds) => {
            onUpdateData((prev) => {
              const carnet = prev.carnetMesurage;
              const removedSet = new Set(removedIds);
              const keptManuals = (carnet.lignesManuelles || []).filter(
                (lm) => !removedSet.has(lm.id)
              );
              const nextStatuts = { ...carnet.statutsLignes };
              removedIds.forEach((rid) => {
                delete nextStatuts[cleLigneMan(rid)];
              });
              return {
                ...prev,
                ...(configModal === 'voirie'
                  ? { configVoirie: { parTroncon: updatedConfig } }
                  : { configDemolition: { parTroncon: updatedConfig } }),
                carnetMesurage: {
                  ...carnet,
                  lignesManuelles: [...keptManuals, ...newManualLines],
                  statutsLignes: nextStatuts,
                },
              };
            });
            onNotify(
              'success',
              configModal === 'voirie'
                ? 'Configuration Voirie appliquée au Carnet.'
                : 'Configuration Démolition appliquée au Carnet.'
            );
          }}
        />
      )}
    </div>
  );
};
