import * as XLSX from 'xlsx';
import { MOIS_FR } from '../constants/inasep';
import { CarnetLineItem, PosteMarche, ProjectData } from '../types/project';
import { calculerEtatDelai, formaterDelaiMixte, mnt, srcP } from './calculations';

function saveWorkbook(wb: XLSX.WorkBook, fileName: string) {
  const safe = fileName.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  XLSX.writeFile(wb, safe);
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Feuille';
}

function autoFitSheet(ws: XLSX.WorkSheet, rows: unknown[][]) {
  const colWidths: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell, idx) => {
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      colWidths[idx] = Math.min(58, Math.max(colWidths[idx] || 10, len + 3));
    });
  });
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
}

function buildMetaHeader(appData: ProjectData, title: string): unknown[][] {
  const info = appData.infosAdministratives;
  return [
    [title],
    ['Projet :', info.intitule || appData.nomProjet || '—', 'Référence :', info.marche || '—'],
    [
      'Maître d’ouvrage :',
      info.mo || '—',
      'Adjudicataire :',
      info.entrepreneur || '—',
    ],
    [
      'Auteur de projet :',
      info.auteur || '—',
      'Contrôleur :',
      info.controleur || '—',
    ],
    ['Exporté le :', new Date().toLocaleDateString('fr-FR')],
    [],
  ];
}

// ─── 1. EXPORT CARNET DE MESURAGE ───────────────────────────────────────────
export function exportCarnetExcel(appData: ProjectData, lines: CarnetLineItem[]) {
  const wb = XLSX.utils.book_new();
  const rows: unknown[][] = [
    ...buildMetaHeader(appData, 'CARNET DE MESURAGE'),
    [
      'N° Poste',
      'Description poste',
      'Unité',
      'Tronçon / Localisation',
      'Prestation',
      'Détail / Formule',
      'Quantité',
      'PU (€)',
      'Montant (€)',
      'Statut EA',
      'Annotation',
    ],
  ];

  let totalMontant = 0;
  lines.forEach((l) => {
    const pu = l.posteEff?.pu ?? 0;
    const montant = mnt(l.qEff, pu);
    totalMontant = Math.round((totalMontant + montant) * 100) / 100;
    const statut = l.porteeA
      ? `${l.porteeA}${l.deverrouille ? ' (déverrouillé)' : ' (clôturé)'}`
      : l.coche
      ? 'À porter à l’EA'
      : 'En attente';
    rows.push([
      l.posteId || 'NON ATTRIBUÉ',
      l.posteEff?.desc || '—',
      l.unite || '',
      l.libTroncon,
      l.libPrestation,
      l.formuleTxt.replace(/\n/g, ' | '),
      Number(l.qEff.toFixed(3)),
      Number(pu.toFixed(2)),
      Number(montant.toFixed(2)),
      statut,
      l.annotation || '',
    ]);
  });

  rows.push([
    '',
    '',
    '',
    '',
    '',
    'TOTAL CARNET AFFICHÉ',
    '',
    '',
    Number(totalMontant.toFixed(2)),
    '',
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  autoFitSheet(ws, rows);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Carnet_Mesurage'));
  saveWorkbook(wb, `${appData.nomProjet || 'Chantier'}_Carnet_Mesurage.xlsx`);
}

// ─── 2. EXPORT EA EN COURS ──────────────────────────────────────────────────
export interface EaExportRow {
  poste: PosteMarche;
  qAvant: number;
  qEA: number;
  mEA: number;
  qCumul: number;
  lines: CarnetLineItem[];
}

export function exportEaEnCoursExcel(
  appData: ProjectData,
  eaIndice: string,
  groups: EaExportRow[],
  totalEA: number
) {
  const wb = XLSX.utils.book_new();

  const synthRows: unknown[][] = [
    ...buildMetaHeader(appData, `ÉTAT D’AVANCEMENT EN COURS — ${eaIndice}`),
    [
      'N° Poste',
      'Description',
      'Unité',
      'PU (€)',
      'Q. Avant EA',
      'Q. de l’EA',
      'Montant EA (€)',
      'Q. Cumulée',
    ],
  ];

  groups.forEach((g) => {
    synthRows.push([
      g.poste.id,
      g.poste.desc,
      g.poste.u,
      Number(g.poste.pu.toFixed(2)),
      Number(g.qAvant.toFixed(3)),
      Number(g.qEA.toFixed(3)),
      Number(g.mEA.toFixed(2)),
      Number(g.qCumul.toFixed(3)),
    ]);
  });

  synthRows.push([
    '',
    `TOTAL ${eaIndice}`,
    '',
    '',
    '',
    '',
    Number(totalEA.toFixed(2)),
    '',
  ]);

  const wsSynth = XLSX.utils.aoa_to_sheet(synthRows);
  autoFitSheet(wsSynth, synthRows);
  XLSX.utils.book_append_sheet(wb, wsSynth, safeSheetName(`Synthèse_${eaIndice}`));

  const detailRows: unknown[][] = [
    ...buildMetaHeader(appData, `DÉTAIL JUSTIFICATIF — ${eaIndice}`),
    ['N° Poste', 'Tronçon / Localisation', 'Prestation', 'Unité', 'Quantité', 'PU (€)', 'Montant (€)'],
  ];

  groups.forEach((g) => {
    g.lines.forEach((l) => {
      detailRows.push([
        g.poste.id,
        l.libTroncon,
        l.libPrestation,
        l.unite,
        Number(l.qEff.toFixed(3)),
        Number(g.poste.pu.toFixed(2)),
        Number(mnt(l.qEff, g.poste.pu).toFixed(2)),
      ]);
    });
  });

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  autoFitSheet(wsDetail, detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, safeSheetName(`Détail_${eaIndice}`));

  saveWorkbook(wb, `${appData.nomProjet || 'Chantier'}_${eaIndice}.xlsx`);
}

// ─── 3. EXPORT EA VALIDÉS ───────────────────────────────────────────────────
export function exportEaValidesExcel(appData: ProjectData) {
  const wb = XLSX.utils.book_new();
  const allPostes = srcP(appData);
  const budgetGlobal = allPostes.reduce((s, p) => s + mnt(p.qte, p.pu), 0);

  const synthRows: unknown[][] = [
    ...buildMetaHeader(appData, 'HISTORIQUE DES ÉTATS D’AVANCEMENT VALIDÉS'),
    ['N° EA', 'Date clôture', 'Montant EA (€)', 'Cumulé (€)', '% Budget', 'Solde marché (€)'],
  ];

  let cumul = 0;
  (appData.historiqueEA || []).forEach((ea) => {
    cumul = Math.round((cumul + (ea.montant || 0)) * 100) / 100;
    const pct = budgetGlobal > 0 ? (cumul / budgetGlobal) * 100 : 0;
    const rest = budgetGlobal - cumul;
    synthRows.push([
      ea.indice,
      ea.date,
      Number((ea.montant || 0).toFixed(2)),
      Number(cumul.toFixed(2)),
      Number(pct.toFixed(2)),
      Number(rest.toFixed(2)),
    ]);
  });

  const wsSynth = XLSX.utils.aoa_to_sheet(synthRows);
  autoFitSheet(wsSynth, synthRows);
  XLSX.utils.book_append_sheet(wb, wsSynth, safeSheetName('EA_Validés'));

  const detailRows: unknown[][] = [
    ...buildMetaHeader(appData, 'DÉTAIL DES POSTES PAR EA VALIDÉ'),
    [
      'N° EA',
      'Date clôture',
      'N° Poste',
      'Description',
      'Unité',
      'Quantité retenue',
      'Qté origine',
      'PU (€)',
      'Montant (€)',
    ],
  ];

  (appData.historiqueEA || []).forEach((ea) => {
    const details = [...(ea.detailParPoste || [])].sort((a, b) =>
      a.posteId.localeCompare(b.posteId, 'fr', { numeric: true, sensitivity: 'base' })
    );
    details.forEach((d) => {
      const poste = allPostes.find((p) => p.id === d.posteId);
      detailRows.push([
        ea.indice,
        ea.date,
        d.posteId,
        poste?.desc || '—',
        poste?.u || '',
        Number((d.qte || 0).toFixed(3)),
        d.qteOrigine !== undefined ? Number(d.qteOrigine.toFixed(3)) : '',
        Number((poste?.pu || 0).toFixed(2)),
        Number((d.montant || 0).toFixed(2)),
      ]);
    });
  });

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  autoFitSheet(wsDetail, detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, safeSheetName('Détail_Postes_EA'));

  saveWorkbook(wb, `${appData.nomProjet || 'Chantier'}_EA_Valides.xlsx`);
}

// ─── 4. EXPORT CUMUL & CONCORDANCE ──────────────────────────────────────────
export interface CumulExportRow {
  p: PosteMarche;
  mBudget: number;
  qAvant: number;
  qEA: number;
  mEA: number;
  qCumul: number;
  mReel: number;
  solde: number;
  pct: number;
  ecart: number;
}

export function exportCumulExcel(
  appData: ProjectData,
  rowsData: CumulExportRow[]
) {
  const wb = XLSX.utils.book_new();
  const rows: unknown[][] = [
    ...buildMetaHeader(appData, 'CUMUL & CONCORDANCE BUDGÉTAIRE'),
    [
      'N° Poste',
      'Description',
      'Unité',
      'PU (€)',
      'Q. Prév.',
      'Budget (€)',
      'Q. Avant EA',
      'Q. EA en cours',
      'Montant EA (€)',
      'Q. Cumulée',
      'Montant Réel (€)',
      'Solde Qté',
      '% Exécuté',
      'Écart (€)',
    ],
  ];

  let totBudget = 0;
  let totEA = 0;
  let totReel = 0;

  rowsData.forEach((r) => {
    totBudget += r.mBudget;
    totEA += r.mEA;
    totReel += r.mReel;
    rows.push([
      r.p.id,
      r.p.desc,
      r.p.u,
      Number(r.p.pu.toFixed(2)),
      Number(r.p.qte.toFixed(3)),
      Number(r.mBudget.toFixed(2)),
      Number(r.qAvant.toFixed(3)),
      Number(r.qEA.toFixed(3)),
      Number(r.mEA.toFixed(2)),
      Number(r.qCumul.toFixed(3)),
      Number(r.mReel.toFixed(2)),
      Number(r.solde.toFixed(3)),
      Number(r.pct.toFixed(1)),
      Number(r.ecart.toFixed(2)),
    ]);
  });

  const totEcart = totReel - totBudget;
  const pctTotal = totBudget > 0 ? (totReel / totBudget) * 100 : 0;
  rows.push([
    '',
    'TOTAUX (LIGNES EXPORTÉES)',
    '',
    '',
    '',
    Number(totBudget.toFixed(2)),
    '',
    '',
    Number(totEA.toFixed(2)),
    '',
    Number(totReel.toFixed(2)),
    '',
    Number(pctTotal.toFixed(1)),
    Number(totEcart.toFixed(2)),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  autoFitSheet(ws, rows);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Cumul_Concordance'));
  saveWorkbook(wb, `${appData.nomProjet || 'Chantier'}_Cumul_Concordance.xlsx`);
}

// ─── 5. EXPORT FEUILLE DE DÉLAIS ────────────────────────────────────────────
export function exportFeuilleDelaisExcel(appData: ProjectData) {
  const wb = XLSX.utils.book_new();
  const state = calculerEtatDelai(appData);
  const dl = appData.delais;

  const complGroup = { JO: 0, JC: 0 };
  (dl.delaisCompl || []).forEach((d) => {
    const u = d.unite === 'JC' ? 'JC' : 'JO';
    complGroup[u] += Number(d.valeur ?? d.duree) || 0;
  });

  const synthRows: unknown[][] = [
    ...buildMetaHeader(appData, 'FEUILLE DE DÉLAIS — SYNTHÈSE'),
    ['Paramètre', 'Valeur'],
    ['Date Ordre de Commencer (OC)', dl.os || 'Non définie'],
    ['Délai contractuel initial', `${dl.base || 0} ${dl.unite || 'JO'}`],
    ['Délais complémentaires cumulés', formaterDelaiMixte(complGroup)],
    ['Délai total exécution accordé', formaterDelaiMixte(state.groupes)],
    ['Jours d’exécution employés (à ce jour)', formaterDelaiMixte(state.consumed)],
    ['Jours d’exécution restants', formaterDelaiMixte(state.executionRestant)],
    ['Dépassement éventuel', formaterDelaiMixte(state.executionDepasse)],
    ['Fin estimée / Calendrier affiché jusqu’au', state.finAff.toLocaleDateString('fr-FR')],
    [
      'Mise en service (MES)',
      state.mesDuree > 0
        ? `${state.mesDuree} ${state.mesUnite} (début : ${dl.dateMes || '—'}, restant : ${state.mesRestant} ${state.mesUnite})`
        : 'Aucune',
    ],
    [],
    ['DÉLAIS COMPLÉMENTAIRES', 'Durée', 'Unité'],
  ];

  if ((dl.delaisCompl || []).length === 0) {
    synthRows.push(['Aucun délai complémentaire', '', '']);
  } else {
    (dl.delaisCompl || []).forEach((dc) => {
      synthRows.push([dc.libelle || '—', Number(dc.valeur ?? dc.duree ?? 0), dc.unite || 'JO']);
    });
  }

  synthRows.push([], ['ARRÊTS & REPRISES', 'Date début arrêt', 'Date reprise']);
  if ((dl.arrets || []).length === 0) {
    synthRows.push(['Aucun arrêt enregistré', '', '']);
  } else {
    (dl.arrets || []).forEach((a) => {
      synthRows.push(['Arrêt de chantier', a.dateDebut || '—', a.dateReprise || 'En cours']);
    });
  }

  const wsSynth = XLSX.utils.aoa_to_sheet(synthRows);
  autoFitSheet(wsSynth, synthRows);
  XLSX.utils.book_append_sheet(wb, wsSynth, safeSheetName('Synthèse_Délais'));

  // Feuille 2 : Décompte mensuel
  const moisRows: unknown[][] = [
    ...buildMetaHeader(appData, 'FEUILLE DE DÉLAIS — DÉCOMPTE MENSUEL'),
    [
      'Mois',
      'J. Calendrier',
      'Samedis',
      'Dimanches',
      'Jours Fériés',
      'Congés entreprise',
      'Intempéries',
      'Dates intempéries',
      'Total déduit',
      'J. Employés',
      'J. MES',
      'MES Employés',
    ],
  ];

  const activeRows = state.rows.filter((r) => r.nbJ > 0 || r.nMes > 0);
  let totCal = 0,
    totSam = 0,
    totDim = 0,
    totFer = 0,
    totCon = 0,
    totInt = 0,
    totDed = 0,
    totEmp = 0,
    totMes = 0,
    totMesEmp = 0;

  activeRows.forEach((r) => {
    totCal += r.nbJ;
    totSam += r.nSam;
    totDim += r.nDim;
    totFer += r.nFer;
    totCon += r.nCon;
    totInt += r.nInt;
    totDed += r.ded;
    totEmp += r.emp;
    totMes += r.nMes;
    totMesEmp += r.mesEmp;
    moisRows.push([
      `${MOIS_FR[r.m]} ${r.y}`,
      r.nbJ,
      r.nSam,
      r.nDim,
      r.nFer,
      r.nCon,
      r.nInt,
      r.intDetail,
      r.ded,
      r.emp,
      r.nMes,
      r.mesEmp,
    ]);
  });

  moisRows.push([
    'TOTAUX CUMULÉS',
    totCal,
    totSam,
    totDim,
    totFer,
    totCon,
    totInt,
    '',
    totDed,
    totEmp,
    totMes,
    totMesEmp,
  ]);

  const wsMois = XLSX.utils.aoa_to_sheet(moisRows);
  autoFitSheet(wsMois, moisRows);
  XLSX.utils.book_append_sheet(wb, wsMois, safeSheetName('Décompte_Mensuel'));

  // Feuille 3 : Jours marqués
  const jmRows: unknown[][] = [
    ...buildMetaHeader(appData, 'CALENDRIER — JOURS MARQUÉS'),
    ['Date (AAAA-MM-JJ)', 'Jour', 'Motif'],
  ];
  const labelMap: Record<string, string> = {
    intemperie: 'Intempérie',
    ferie: 'Jour férié',
    conge: 'Congé entreprise',
  };
  const joursSem = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  Object.keys(dl.joursMarques || {})
    .sort()
    .forEach((k) => {
      const val = dl.joursMarques[k];
      if (!val) return;
      const d = new Date(`${k}T00:00:00`);
      const jourName = isNaN(d.getTime()) ? '' : joursSem[d.getDay()];
      jmRows.push([k, jourName, labelMap[val] || val]);
    });

  const wsJm = XLSX.utils.aoa_to_sheet(jmRows);
  autoFitSheet(wsJm, jmRows);
  XLSX.utils.book_append_sheet(wb, wsJm, safeSheetName('Jours_Marqués'));

  saveWorkbook(wb, `${appData.nomProjet || 'Chantier'}_Feuille_Delais.xlsx`);
}
