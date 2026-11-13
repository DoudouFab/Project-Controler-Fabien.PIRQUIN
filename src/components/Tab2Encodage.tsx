import React, { useMemo, useState } from 'react';
import { Copy, Edit2, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { D9000_TYPES } from '../constants/inasep';
import { ProjectData, TronconEgout } from '../types/project';
import {
  calcQte,
  estCvOuDo,
  fmt,
  largeurTheo,
  NRM,
} from '../utils/calculations';
import { PrintHeader } from './PrintHeader';

interface Tab2EncodageProps {
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

const NATURES = ['BA', 'BNA', 'Fonte', 'PVC', 'PP', 'PEHD', 'Grès'];
const MILIEUX = ['TN', 'VC', 'VE'];
const REMBLAIS = [
  'Terrain Naturel',
  'Empierrement 0/32',
  'Sable-ciment',
  'Béton maigre',
  'Terre chaulée',
  'Apport extérieur',
];

function emptyForm(nextRef: string): TronconEgout {
  return {
    ref: nextRef,
    ordreEncodage: 0,
    de: '',
    a: '',
    long: 0,
    p_amo: 0,
    p_ava: 0,
    sf: 0,
    fond: 0,
    rev: 0.3,
    epExist: 0.3,
    natureTuyau: 'BA',
    dn: 300,
    diamExt: 380,
    milieu: 'TN',
    remblaiType: 'Terrain Naturel',
    chauxPourcent: 0,
    d9000Type: 'Type I',
    fait: true,
    lt_force: null,
    insp_porter: false,
    insp_qte: null,
    cet_porter: false,
    cet_qte: null,
    rocheux: null,
    compact: null,
    remplacement: null,
    blindage: null,
    avecEnrobage: false,
    cvAmo: { dint: 1, h: 0 },
    cvAva: { dint: 1, h: 0 },
  };
}

export const Tab2Encodage: React.FC<Tab2EncodageProps> = ({
  appData,
  onUpdateData,
  onNotify,
  onConfirm,
}) => {
  const nextAutoRef = `L${(appData.compteurTroncons || 0) + 1}`;
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [form, setForm] = useState<TronconEgout>(() => emptyForm(nextAutoRef));
  const [syncLongueur, setSyncLongueur] = useState(true);

  const [sortBy, setSortBy] = useState<'encodage' | 'ref_asc' | 'ref_desc' | 'de_asc'>('encodage');
  const [search, setSearch] = useState('');
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());

  // Modification groupée state
  const [batchMilieu, setBatchMilieu] = useState('');
  const [batchRemblai, setBatchRemblai] = useState('');
  const [batchD9000, setBatchD9000] = useState('');
  const [batchFait, setBatchFait] = useState('');
  const [batchEnrob, setBatchEnrob] = useState('');

  // Auto-complétion profondeur & CV depuis les tronçons déjà encodés
  const lookupNode = (nodeName: string, targetSide: 'amo' | 'ava') => {
    const clean = nodeName.trim().toUpperCase();
    if (!clean) return;
    const match = (appData.tronconsEgout || []).find(
      (t) =>
        t.de.trim().toUpperCase() === clean || t.a.trim().toUpperCase() === clean
    );
    if (!match) return;
    const fromDe = match.de.trim().toUpperCase() === clean;
    const foundProf = fromDe ? match.p_amo : match.p_ava;
    const foundCv = fromDe ? match.cvAmo : match.cvAva;

    setForm((prev) => {
      const next = { ...prev };
      if (targetSide === 'amo') {
        if (!next.p_amo && foundProf > 0) next.p_amo = foundProf;
        if (estCvOuDo(nodeName)) {
          next.cvAmo = {
            dint: foundCv?.dint || 1,
            h: foundCv?.h || foundProf || next.p_amo || 0,
          };
        }
      } else {
        if (!next.p_ava && foundProf > 0) next.p_ava = foundProf;
        if (estCvOuDo(nodeName)) {
          next.cvAva = {
            dint: foundCv?.dint || 1,
            h: foundCv?.h || foundProf || next.p_ava || 0,
          };
        }
      }
      return next;
    });
  };

  const handleLongChange = (val: number) => {
    setForm((prev) => ({
      ...prev,
      long: val,
      rocheux: prev.rocheux && syncLongueur ? { ...prev.rocheux, l: val } : prev.rocheux,
      compact: prev.compact && syncLongueur ? { ...prev.compact, l: val } : prev.compact,
      remplacement:
        prev.remplacement && syncLongueur ? { ...prev.remplacement, l: val } : prev.remplacement,
      blindage: prev.blindage && syncLongueur ? { ...prev.blindage, l: val } : prev.blindage,
    }));
  };

  const handleMilieuChange = (m: string) => {
    setForm((prev) => {
      if (m === 'TN') {
        return { ...prev, milieu: m, sf: 0, fond: 0, rev: 0.3, epExist: 0.3 };
      }
      return { ...prev, milieu: m };
    });
  };

  const buildChainedForm = (source: TronconEgout, nextRef: string): TronconEgout => ({
    ...emptyForm(nextRef),
    de: source.a.trim(),
    a: '',
    long: 0,
    p_amo: source.p_ava || 0,
    p_ava: source.p_ava || 0,
    sf: source.sf,
    fond: source.fond,
    rev: source.rev,
    epExist: source.epExist,
    natureTuyau: source.natureTuyau,
    dn: source.dn,
    diamExt: source.diamExt,
    milieu: source.milieu,
    remblaiType: source.remblaiType,
    chauxPourcent: source.chauxPourcent,
    d9000Type: source.d9000Type,
    avecEnrobage: source.avecEnrobage,
    fait: true,
    cvAmo: estCvOuDo(source.a)
      ? {
          dint: source.cvAva?.dint || 1,
          h: source.cvAva?.h || source.p_ava || 0,
        }
      : { dint: 1, h: 0 },
    cvAva: { dint: 1, h: 0 },
  });

  const handleChainFrom = (source: TronconEgout) => {
    let comp = (appData.compteurTroncons || 0) + 1;
    while ((appData.tronconsEgout || []).some((x) => x.ref === `L${comp}`)) {
      comp++;
    }
    setEditingRef(null);
    setForm(buildChainedForm(source, `L${comp}`));
    onNotify(
      'info',
      `Enchaîné depuis ${source.a || source.ref} (P. départ ${Number(source.p_ava || 0).toFixed(2)} m).`
    );
  };

  const submitForm = (chainNext: boolean) => {
    const refClean = (form.ref || nextAutoRef).trim();
    if (!form.de.trim() || !form.a.trim()) {
      onNotify('warning', 'Veuillez renseigner les nœuds De et À.');
      return;
    }

    if (editingRef) {
      onUpdateData((prev) => ({
        ...prev,
        tronconsEgout: (prev.tronconsEgout || []).map((t) =>
          t.ref === editingRef ? { ...form, ref: refClean } : t
        ),
      }));
      onNotify('success', `Tronçon ${refClean} mis à jour.`);
      setEditingRef(null);
      setForm(emptyForm(`L${(appData.compteurTroncons || 0) + 1}`));
    } else {
      if ((appData.tronconsEgout || []).some((t) => t.ref === refClean)) {
        onNotify('error', `La référence ${refClean} existe déjà.`);
        return;
      }
      const nextOrd = (appData.ordreTroncons || 0) + 1;
      const nextComp = (appData.compteurTroncons || 0) + 1;
      const newSeg: TronconEgout = {
        ...form,
        ref: refClean,
        ordreEncodage: nextOrd,
      };
      onUpdateData((prev) => ({
        ...prev,
        tronconsEgout: [...(prev.tronconsEgout || []), newSeg],
        compteurTroncons: Math.max(prev.compteurTroncons || 0, nextComp),
        ordreTroncons: nextOrd,
      }));
      if (chainNext) {
        let following = Math.max(appData.compteurTroncons || 0, nextComp) + 1;
        while ((appData.tronconsEgout || []).some((x) => x.ref === `L${following}`)) {
          following++;
        }
        setForm(buildChainedForm(newSeg, `L${following}`));
        onNotify(
          'success',
          `Tronçon ${refClean} injecté — prêt pour le tronçon suivant depuis ${newSeg.a}.`
        );
      } else {
        onNotify('success', `Tronçon ${refClean} injecté dans le chantier.`);
        setForm(emptyForm(`L${nextComp + 1}`));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitForm(false);
  };

  const sortedTroncons = useMemo(() => {
    const q = NRM(search);
    const list = (appData.tronconsEgout || []).filter(
      (t) =>
        !q ||
        NRM(t.ref).includes(q) ||
        NRM(t.de).includes(q) ||
        NRM(t.a).includes(q) ||
        NRM(t.natureTuyau).includes(q)
    );
    const natSort = (a: string, b: string) =>
      a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
    return [...list].sort((a, b) => {
      if (sortBy === 'ref_asc') return natSort(a.ref, b.ref);
      if (sortBy === 'ref_desc') return natSort(b.ref, a.ref);
      if (sortBy === 'de_asc') return natSort(a.de, b.de);
      return (a.ordreEncodage || 0) - (b.ordreEncodage || 0);
    });
  }, [appData.tronconsEgout, sortBy, search]);

  const applyBatchUpdate = () => {
    if (selectedRefs.size === 0) return;
    onUpdateData((prev) => ({
      ...prev,
      tronconsEgout: (prev.tronconsEgout || []).map((t) => {
        if (!selectedRefs.has(t.ref)) return t;
        const next = { ...t };
        if (batchMilieu) {
          next.milieu = batchMilieu;
          if (batchMilieu === 'TN') {
            next.sf = 0;
            next.fond = 0;
            next.rev = 0.3;
            next.epExist = 0.3;
          }
        }
        if (batchRemblai) next.remblaiType = batchRemblai;
        if (batchD9000) next.d9000Type = batchD9000;
        if (batchFait === 'true') next.fait = true;
        if (batchFait === 'false') next.fait = false;
        if (batchEnrob === 'true') next.avecEnrobage = true;
        if (batchEnrob === 'false') next.avecEnrobage = false;
        return next;
      }),
    }));
    onNotify('success', `${selectedRefs.size} tronçon(s) modifié(s) en masse.`);
    setSelectedRefs(new Set());
    setBatchMilieu('');
    setBatchRemblai('');
    setBatchD9000('');
    setBatchFait('');
    setBatchEnrob('');
  };

  const liveCalc = useMemo(() => calcQte(form), [form]);
  const ltTheo = useMemo(() => largeurTheo(form.dn, form.diamExt), [form.dn, form.diamExt]);

  return (
    <div className="space-y-4">
      <PrintHeader infos={appData.infosAdministratives} />

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Formulaire gauche */}
        <form
          onSubmit={handleSubmit}
          className="no-print w-full lg:w-[410px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs lg:sticky lg:top-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h2 className="font-bold text-slate-900 dark:text-slate-100">
              {editingRef ? `Modifier tronçon ${editingRef}` : 'Nouveau tronçon'}
            </h2>
            {editingRef && (
              <button
                type="button"
                onClick={() => {
                  setEditingRef(null);
                  setForm(emptyForm(nextAutoRef));
                }}
                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Annuler édition
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Réf.
              </label>
              <input
                type="text"
                value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                className="w-full px-2 py-1 font-mono font-bold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                De (Amont)
              </label>
              <input
                type="text"
                required
                value={form.de}
                onChange={(e) => setForm({ ...form, de: e.target.value })}
                onBlur={(e) => lookupNode(e.target.value, 'amo')}
                placeholder="ex: CV 101"
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                À (Aval)
              </label>
              <input
                type="text"
                required
                value={form.a}
                onChange={(e) => setForm({ ...form, a: e.target.value })}
                onBlur={(e) => lookupNode(e.target.value, 'ava')}
                placeholder="ex: CV 102"
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                  Long. (m)
                </label>
                <label className="inline-flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncLongueur}
                    onChange={(e) => setSyncLongueur(e.target.checked)}
                  />
                  Sync
                </label>
              </div>
              <input
                type="number"
                step="0.01"
                value={form.long || ''}
                onChange={(e) => handleLongChange(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                P. amont (m)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.p_amo || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setForm((prev) => ({
                    ...prev,
                    p_amo: v,
                    cvAmo: { ...prev.cvAmo, h: prev.cvAmo.h || v },
                  }));
                }}
                className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                P. aval (m)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.p_ava || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setForm((prev) => ({
                    ...prev,
                    p_ava: v,
                    cvAva: { ...prev.cvAva, h: prev.cvAva.h || v },
                  }));
                }}
                className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* CV/DO extrémités si préfixe CV ou DO */}
          {(estCvOuDo(form.de) || estCvOuDo(form.a)) && (
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Ouvrages d'extrémités (déduction ½∅ & volume ½-cylindre)
              </div>
              {estCvOuDo(form.de) && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-[11px] font-medium truncate">{form.de}</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="∅int (m)"
                    value={form.cvAmo?.dint || ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        cvAmo: { ...p.cvAmo, dint: parseFloat(e.target.value) || 0 },
                      }))
                    }
                    className="px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="H (m)"
                    value={form.cvAmo?.h || ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        cvAmo: { ...p.cvAmo, h: parseFloat(e.target.value) || 0 },
                      }))
                    }
                    className="px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              )}
              {estCvOuDo(form.a) && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-[11px] font-medium truncate">{form.a}</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="∅int (m)"
                    value={form.cvAva?.dint || ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        cvAva: { ...p.cvAva, dint: parseFloat(e.target.value) || 0 },
                      }))
                    }
                    className="px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="H (m)"
                    value={form.cvAva?.h || ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        cvAva: { ...p.cvAva, h: parseFloat(e.target.value) || 0 },
                      }))
                    }
                    className="px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              )}
            </div>
          )}

          {/* Tuyau & Lt */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Nature
              </label>
              <select
                value={form.natureTuyau}
                onChange={(e) => setForm({ ...form, natureTuyau: e.target.value })}
                className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {NATURES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                DN (mm)
              </label>
              <input
                type="number"
                value={form.dn || ''}
                onChange={(e) => setForm({ ...form, dn: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Ø ext (mm)
              </label>
              <input
                type="number"
                value={form.diamExt || ''}
                onChange={(e) => setForm({ ...form, diamExt: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Lt forcé
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={ltTheo.toFixed(3)}
                value={form.lt_force ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setForm({ ...form, lt_force: !isNaN(v) && v > 0 ? v : null });
                }}
                className="w-full px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* Terrains particuliers */}
          <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.rocheux)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rocheux: e.target.checked ? { l: form.long || 0, p: 0.3 } : null,
                    })
                  }
                />
                <span>Rocheux</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.compact)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      compact: e.target.checked ? { l: form.long || 0, p: 0.5 } : null,
                    })
                  }
                />
                <span>Compact</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.remplacement)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      remplacement: e.target.checked ? { l: form.long || 0, p: 0.4 } : null,
                    })
                  }
                />
                <span>Rempl. sol</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.avecEnrobage)}
                  onChange={(e) => setForm({ ...form, avecEnrobage: e.target.checked })}
                />
                <span>Enrobage</span>
              </label>
            </div>

            {form.rocheux && (
              <div className="grid grid-cols-3 gap-2 items-center pt-1">
                <span className="text-[11px] text-slate-500">Rocheux (L, P)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.rocheux.l}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rocheux: { ...form.rocheux!, l: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="px-2 py-0.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  step="0.01"
                  value={form.rocheux.p}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rocheux: { ...form.rocheux!, p: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="px-2 py-0.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}
            {form.compact && (
              <div className="grid grid-cols-3 gap-2 items-center pt-1">
                <span className="text-[11px] text-slate-500">Compact (L, P)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.compact.l}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      compact: { ...form.compact!, l: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="px-2 py-0.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  step="0.01"
                  value={form.compact.p}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      compact: { ...form.compact!, p: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="px-2 py-0.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}
            {form.remplacement && (
              <div className="grid grid-cols-3 gap-2 items-center pt-1">
                <span className="text-[11px] text-slate-500">Rempl. sol (L, P)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.remplacement.l}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      remplacement: { ...form.remplacement!, l: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="px-2 py-0.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  step="0.01"
                  value={form.remplacement.p}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      remplacement: { ...form.remplacement!, p: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="px-2 py-0.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}
          </div>

          {/* Milieu & Structure */}
          <div className="grid grid-cols-5 gap-1.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Milieu
              </label>
              <select
                value={form.milieu}
                onChange={(e) => handleMilieuChange(e.target.value)}
                className="w-full px-1 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {MILIEUX.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Ss-F
              </label>
              <input
                type="number"
                step="0.05"
                value={form.sf}
                onChange={(e) => setForm({ ...form, sf: parseFloat(e.target.value) || 0 })}
                className="w-full px-1.5 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Fond.
              </label>
              <input
                type="number"
                step="0.05"
                value={form.fond}
                onChange={(e) => setForm({ ...form, fond: parseFloat(e.target.value) || 0 })}
                className="w-full px-1.5 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Rev.
              </label>
              <input
                type="number"
                step="0.05"
                value={form.rev}
                onChange={(e) => setForm({ ...form, rev: parseFloat(e.target.value) || 0 })}
                className="w-full px-1.5 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Ép.Ex
              </label>
              <input
                type="number"
                step="0.05"
                value={form.epExist}
                onChange={(e) => setForm({ ...form, epExist: parseFloat(e.target.value) || 0 })}
                className="w-full px-1.5 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* Remblai & D9000 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Remblai
              </label>
              <select
                value={form.remblaiType}
                onChange={(e) => setForm({ ...form, remblaiType: e.target.value })}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {REMBLAIS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                D9000 / CET
              </label>
              <select
                value={form.d9000Type}
                onChange={(e) => setForm({ ...form, d9000Type: e.target.value })}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {D9000_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="Bitumineux / Fraisats">Bitumineux / Fraisats</option>
              </select>
            </div>
          </div>

          {form.remblaiType.toLowerCase().includes('chaul') && (
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-slate-600 dark:text-slate-400">
                Taux de chaux (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.chauxPourcent}
                onChange={(e) =>
                  setForm({ ...form, chauxPourcent: parseFloat(e.target.value) || 0 })
                }
                className="w-24 px-2 py-1 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          {/* Aperçu calculs temps réel */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-slate-500 font-sans">Lt eff.</div>
              <div className="font-bold">{liveCalc.Wt.toFixed(3)} m</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-sans">L nette</div>
              <div className="font-bold">{liveCalc.longPose.toFixed(3)} m</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-sans">V. Fouille</div>
              <div className="font-bold">{liveCalc.v_fouille.toFixed(2)} m³</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={form.fait}
                onChange={(e) => setForm({ ...form, fait: e.target.checked })}
              />
              <span>Tronçon Fait (actif)</span>
            </label>
            <div className="flex items-center gap-1.5">
              {!editingRef && (
                <button
                  type="button"
                  onClick={() => submitForm(true)}
                  title="Injecter ce tronçon et pré-remplir le suivant depuis son nœud d'arrivée"
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-sky-600 text-sky-700 dark:text-sky-300 dark:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40 font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Injecter & Enchaîner
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingRef ? 'Enregistrer' : 'Injecter'}
              </button>
            </div>
          </div>
        </form>

        {/* Liste des tronçons à droite */}
        <div className="flex-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="no-print flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tronçons ({sortedTroncons.length})
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer réf / nœud..."
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Tri :</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="encodage">Ordre d'encodage</option>
                <option value="ref_asc">Réf. croissante</option>
                <option value="ref_desc">Réf. décroissante</option>
                <option value="de_asc">De (A → Z)</option>
              </select>
            </div>
          </div>

          {selectedRefs.size > 0 && (
            <div className="no-print p-2.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/40 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-sky-900 dark:text-sky-100">
                {selectedRefs.size} sélectionné(s) :
              </span>
              <select
                value={batchMilieu}
                onChange={(e) => setBatchMilieu(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Milieu...</option>
                {MILIEUX.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={batchRemblai}
                onChange={(e) => setBatchRemblai(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Remblai...</option>
                {REMBLAIS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={batchD9000}
                onChange={(e) => setBatchD9000(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">D9000...</option>
                {D9000_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={batchEnrob}
                onChange={(e) => setBatchEnrob(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Enrobage...</option>
                <option value="true">Avec enrobage</option>
                <option value="false">Sans enrobage</option>
              </select>
              <select
                value={batchFait}
                onChange={(e) => setBatchFait(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Statut Fait...</option>
                <option value="true">Marquer Fait</option>
                <option value="false">Marquer Non fait</option>
              </select>
              <button
                type="button"
                onClick={applyBatchUpdate}
                className="px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-semibold cursor-pointer"
              >
                Appliquer
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="no-print py-2 px-2 text-center w-8">
                    <input
                      type="checkbox"
                      checked={
                        sortedTroncons.length > 0 &&
                        sortedTroncons.every((t) => selectedRefs.has(t.ref))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRefs(new Set(sortedTroncons.map((t) => t.ref)));
                        } else {
                          setSelectedRefs(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="py-2 px-2 text-left">Réf</th>
                  <th className="py-2 px-2 text-left">De → À</th>
                  <th className="py-2 px-2 text-center">Milieu</th>
                  <th className="py-2 px-2 text-left">Tuyau / DN</th>
                  <th className="py-2 px-2 text-right">Long (nette)</th>
                  <th className="py-2 px-2 text-right">Pm (m)</th>
                  <th className="py-2 px-2 text-right">Lt (m)</th>
                  <th className="py-2 px-2 text-right">Fouille</th>
                  <th className="py-2 px-2 text-right">Excéd.</th>
                  <th className="py-2 px-2 text-center">Fait</th>
                  <th className="no-print py-2 px-2 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sortedTroncons.map((t) => {
                  const q = calcQte(t);
                  return (
                    <tr
                      key={t.ref}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        t.fait === false ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="no-print py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRefs.has(t.ref)}
                          onChange={(e) =>
                            setSelectedRefs((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(t.ref);
                              else n.delete(t.ref);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="py-1.5 px-2 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {t.ref}
                      </td>
                      <td className="py-1.5 px-2 text-slate-700 dark:text-slate-200">
                        {t.de} → {t.a}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-semibold">
                        {t.milieu}
                      </td>
                      <td className="py-1.5 px-2">
                        {t.natureTuyau} DN{t.dn}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {fmt(t.long, 2)} ({fmt(q.longPose, 2)})
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {fmt(q.Hm, 2)}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            step="0.01"
                            value={t.lt_force ?? ''}
                            placeholder={q.Wt.toFixed(2)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              onUpdateData((prev) => ({
                                ...prev,
                                tronconsEgout: (prev.tronconsEgout || []).map((x) =>
                                  x.ref === t.ref
                                    ? { ...x, lt_force: !isNaN(v) && v > 0 ? v : null }
                                    : x
                                ),
                              }));
                            }}
                            className={`w-14 px-1 py-0.5 text-xs text-right font-mono tabular-nums rounded border ${
                              q.isForce
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold'
                                : 'border-slate-300 dark:border-slate-700 bg-transparent'
                            }`}
                          />
                          {q.isForce && (
                            <button
                              type="button"
                              title="Réinitialiser Lt auto"
                              onClick={() =>
                                onUpdateData((prev) => ({
                                  ...prev,
                                  tronconsEgout: (prev.tronconsEgout || []).map((x) =>
                                    x.ref === t.ref ? { ...x, lt_force: null } : x
                                  ),
                                }))
                              }
                              className="no-print text-amber-600 hover:text-amber-800 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {fmt(q.v_fouille, 2)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {fmt(q.v_exced, 2)}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={t.fait !== false}
                          onChange={(e) =>
                            onUpdateData((prev) => ({
                              ...prev,
                              tronconsEgout: (prev.tronconsEgout || []).map((x) =>
                                x.ref === t.ref ? { ...x, fait: e.target.checked } : x
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="no-print py-1.5 px-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title={`Enchaîner un nouveau tronçon depuis ${t.a}`}
                            onClick={() => handleChainFrom(t)}
                            className="p-1 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Éditer"
                            onClick={() => {
                              setEditingRef(t.ref);
                              setForm(JSON.parse(JSON.stringify(t)) as TronconEgout);
                            }}
                            className="p-1 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Dupliquer"
                            onClick={() => {
                              const nextOrd = (appData.ordreTroncons || 0) + 1;
                              const nextComp = (appData.compteurTroncons || 0) + 1;
                              const newRef = `L${nextComp}`;
                              onUpdateData((prev) => ({
                                ...prev,
                                compteurTroncons: nextComp,
                                ordreTroncons: nextOrd,
                                tronconsEgout: [
                                  ...(prev.tronconsEgout || []),
                                  {
                                    ...JSON.parse(JSON.stringify(t)),
                                    ref: newRef,
                                    ordreEncodage: nextOrd,
                                  },
                                ],
                              }));
                              onNotify('info', `Tronçon dupliqué sous ${newRef}.`);
                            }}
                            className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Supprimer"
                            onClick={() =>
                              onConfirm({
                                title: `Supprimer le tronçon ${t.ref} ?`,
                                message: `Le tronçon ${t.ref} (${t.de} → ${t.a}) sera retiré du projet.`,
                                danger: true,
                                confirmLabel: 'Supprimer',
                                onConfirm: () =>
                                  onUpdateData((prev) => ({
                                    ...prev,
                                    tronconsEgout: (prev.tronconsEgout || []).filter(
                                      (x) => x.ref !== t.ref
                                    ),
                                  })),
                              })
                            }
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
