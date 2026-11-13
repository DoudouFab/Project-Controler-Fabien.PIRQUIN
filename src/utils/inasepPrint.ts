import { INASEP_LOGO_BASE64, MOIS_FR } from '../constants/inasep';
import { ProjectData } from '../types/project';
import { calculerEtatDelai } from './calculations';

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Génère le canvas HTML/CSS EXACT de la feuille de délais au format INASEP.
 * Aucune mise en page, dimension, police, bordure ou structure n'est modifiée.
 */
export function buildInasepDelaySheetHtml(appData: ProjectData): string {
  const state = calculerEtatDelai(appData);
  const dl = state.dl;
  const info = appData.infosAdministratives || {};
  const dl_base = Number(dl.base) || 0;
  const dl_unite = dl.unite || 'JO';
  const dl_os = dl.os || '';

  function fmtDate(s: string): string {
    if (!s) return '—';
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  }

  const moisData = state.rows;
  const tC = moisData.reduce((s, r) => s + r.nbJ, 0);
  const tSa = moisData.reduce((s, r) => s + r.nSam, 0);
  const tDi = moisData.reduce((s, r) => s + r.nDim, 0);
  const tFe = moisData.reduce((s, r) => s + r.nFer, 0);
  const tCo = moisData.reduce((s, r) => s + r.nCon, 0);
  const tIn = moisData.reduce((s, r) => s + r.nInt, 0);
  const tDe = moisData.reduce((s, r) => s + r.ded, 0);
  const tEm = moisData.reduce((s, r) => s + r.emp, 0);

  const listeAr = dl.arrets || [];
  let suspRows = '';
  let reprRows = '';
  listeAr.forEach((a, i) => {
    suspRows += '<div>' + (i + 1) + ') ' + fmtDate(a.dateDebut) + '</div>';
    reprRows += '<div>' + (i + 1) + ') ' + fmtDate(a.dateReprise || '') + '</div>';
  });
  if (!suspRows) suspRows = '—';
  if (!reprRows) reprRows = '—';

  let lignes = '';
  let prevY = -1;
  for (const r of moisData) {
    if (r.y !== prevY) {
      prevY = r.y;
      lignes += '<tr><td colspan="11" class="yr">' + r.y + '</td></tr>';
    }
    const estVide = r.nbJ === 0;
    const dc = estVide ? '' : r.ded;
    const ec = estVide ? '' : r.emp;
    const ecls = 'num' + (!estVide && r.emp > 0 ? ' emp' : '');
    const obs = r.nMes > 0 ? `MES : ${r.nMes} j` : '';
    lignes +=
      '<tr><td class="mois">' +
      MOIS_FR[r.m] +
      '<br>' +
      r.y +
      '</td><td>' +
      (estVide ? '' : r.nbJ) +
      '</td><td>' +
      (estVide ? '' : r.nSam) +
      '</td><td>' +
      (estVide ? '' : r.nDim) +
      '</td><td>' +
      (estVide ? '' : r.nFer) +
      '</td><td>' +
      (estVide ? '' : r.nCon) +
      '</td><td class="det">' +
      (estVide ? '' : r.intDetail) +
      '</td><td>' +
      (estVide ? '' : r.nInt) +
      '</td><td class="ded">' +
      dc +
      '</td><td class="' +
      ecls +
      '">' +
      ec +
      '</td><td class="obs">' +
      obs +
      '</td></tr>';
  }

  const totRow =
    '<tr class="tot"><td class="mois">TOTAUX</td><td>' +
    tC +
    '</td><td>' +
    tSa +
    '</td><td>' +
    tDi +
    '</td><td>' +
    tFe +
    '</td><td>' +
    tCo +
    '</td><td>—</td><td>' +
    tIn +
    '</td><td class="ded">' +
    tDe +
    '</td><td class="num emp">' +
    tEm +
    '</td><td></td></tr>';

  const LOGO = INASEP_LOGO_BASE64;
  const css =
    '*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;background:#fff;}.page{width:210mm;margin:0 auto;padding:10mm 10mm 15mm 10mm;}.hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3mm;padding-bottom:2mm;border-bottom:1px solid #000;gap:4mm;}.hdr-l{flex:1;font-size:9pt;font-family:Arial,Helvetica,sans-serif;}.hdr-l .admin-row{display:flex;gap:2mm;line-height:1.6;}.hdr-l .lbl{font-weight:400;min-width:28mm;white-space:nowrap;}.hdr-l .val{font-weight:700;}.hdr-r{text-align:right;flex-shrink:0;}.hdr-r img{height:18mm;width:auto;object-fit:contain;display:block;margin-bottom:1mm;}.hdr-r .nom{font-family:"Century Gothic","Trebuchet MS",Arial,sans-serif;font-size:8.5pt;font-weight:700;color:#0B4499;display:block;}.hdr-r .sub{font-family:"Century Gothic","Trebuchet MS",Arial,sans-serif;font-size:6.5pt;color:#0B4499;display:block;}.titre{text-align:center;font-size:13pt;font-weight:700;font-family:Verdana,Arial,sans-serif;color:#000;margin-bottom:2mm;}.dl{margin-bottom:2mm;font-size:9pt;font-family:Arial,Helvetica,sans-serif;}.dl-row{display:flex;gap:2mm;margin-bottom:0.4mm;align-items:baseline;}.dl-l{min-width:38mm;white-space:nowrap;font-weight:400;text-align:right;}.dl-r{font-weight:400;}.prol{font-weight:700;line-height:1.4;}table.cal{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:2mm;table-layout:fixed;}table.cal th{background:#fff;color:#000;text-align:center;vertical-align:middle;padding:0.8mm 0.4mm;border:1px solid #000;font-size:7pt;font-family:Arial,Helvetica,sans-serif;line-height:1.1;font-weight:400;}table.cal th.thl{text-align:center;}table.cal th.rot{writing-mode:vertical-rl;transform:rotate(180deg);white-space:normal;padding:2mm 0.4mm;vertical-align:bottom;text-align:center;line-height:1.1;font-size:7pt;}table.cal td{border:1px solid #000;padding:0.5mm 0.4mm;text-align:center;vertical-align:middle;font-size:8.5pt;font-family:Arial,Helvetica,sans-serif;color:#000;overflow:hidden;}table.cal td.mois{text-align:center;white-space:normal;font-size:8.5pt;line-height:1.3;padding:0.4mm;font-weight:400;}table.cal td.det{font-size:7pt;font-family:Arial,Helvetica,sans-serif;white-space:normal;word-break:break-all;}table.cal td.ded{font-weight:700;}table.cal td.num.emp{font-weight:700;}table.cal td.obs{text-align:left;padding-left:1mm;font-size:8.5pt;white-space:normal;}table.cal tr.yr td{font-weight:700;text-align:left;padding:0.3mm 1mm;font-size:9pt;border:1px solid #000;background:#fff;}table.cal tr.tot td{font-weight:700;border:1px solid #000;text-align:center;font-size:8.5pt;background:#fff;}table.cal tr.tot td.mois{text-align:center;}.sig-spacer{flex:1;min-height:5mm;}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:3mm;}tr.drest td{border:none;background:#fff;padding:0.8mm 0.4mm;}tr.drest+tr.drest td{border-top:none;}table.cal tr.drest:first-of-type td{border-top:1.5px solid #000;}td.drest-l{font-size:8.5pt;font-family:Arial,Helvetica,sans-serif;text-align:right;white-space:nowrap;font-weight:700;padding-right:0;}td.drest-n{font-size:11pt;font-family:Arial,Helvetica,sans-serif;text-align:center;font-weight:700;}td.drest-n.neg{color:#c00;}td.drest-u{font-size:8.5pt;font-family:Arial,Helvetica,sans-serif;text-align:left;white-space:nowrap;padding-left:1mm;}.sig{font-size:10pt;font-family:Calibri,Arial,Helvetica,sans-serif;}.sig .st{font-weight:400;margin-bottom:9mm;}.sig .sl{border-bottom:1px solid #000;margin-bottom:1mm;}.sig .ss{font-size:8pt;color:#555;text-align:center;}@page{size:A4 portrait;margin:10mm 10mm 15mm 10mm;}@page{@bottom-right{content:"Page " counter(page) " sur " counter(pages);font-family:Arial,sans-serif;font-size:8pt;color:#555;}}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{padding:0;display:flex;flex-direction:column;min-height:272mm;}.sig-spacer{flex:1 0 10mm;min-height:10mm;}.sigs{flex:0 0 auto;page-break-inside:avoid;break-inside:avoid;margin-top:0;padding-top:5mm;}}.page-num{display:none;}';

  const hdrR =
    '<div class="hdr-r"><img src="' +
    LOGO +
    '" alt="INASEP"><span class="nom">Intercommunale Namuroise de Services Publics</span><span class="sub">S.C.R.L \u2013 Association de Communes</span><span class="sub">Parc industriel | Rue des Viaux 1b | 5100 Naninne</span><span class="sub">T\u00e9l. : 081 40 75 11 | Fax : 081 40 75 75</span><span class="sub">www.inasep.be | info@inasep.be</span></div>';

  const adminHtml =
    '<div class="hdr-l"><div class="admin-row"><span class="lbl">Ma\u00eetre d\u2019ouvrage :</span><span class="val">' +
    escapeHtml(info.mo || 'I.N.A.S.E.P.') +
    '</span></div><div class="admin-row"><span class="lbl">Auteur de projet :</span><span class="val">' +
    escapeHtml(info.auteur || 'I.N.A.S.E.P.') +
    '</span></div><div class="admin-row"><span class="lbl">Travaux de :</span><span class="val">' +
    escapeHtml(info.intitule || appData.nomProjet || '') +
    '</span></div><div class="admin-row"><span class="lbl">Entrepreneur :</span><span class="val">' +
    escapeHtml(info.entrepreneur || '') +
    '</span></div><div class="admin-row"><span class="lbl">N\u00b0 de march\u00e9 :</span><span class="val">' +
    escapeHtml(info.marche || '') +
    '</span></div><div class="admin-row"><span class="lbl">Lieu des travaux :</span><span class="val">' +
    escapeHtml(info.lieu || '') +
    '</span></div></div>';

  let prolongLines = '';
  const complGroup = { JO: 0, JC: 0 };
  (dl.delaisCompl || []).forEach((dc) => {
    const v = Number(dc.duree ?? dc.valeur) || 0;
    const u = dc.unite === 'JC' ? 'JC' : 'JO';
    complGroup[u] += v;
  });
  (['JO', 'JC'] as const).forEach((u) => {
    if (complGroup[u]) prolongLines += '<div class="prol">+' + complGroup[u] + ' ' + u + '</div>';
  });

  let dlHtml = '<div class="dl">';
  dlHtml +=
    '<div class="dl-row"><span class="dl-l">D\u00e9lai d\u2019ex\u00e9cution :</span><span class="dl-r">' +
    dl_base +
    ' ' +
    dl_unite +
    '</span></div>';
  if (prolongLines) {
    dlHtml +=
      '<div class="dl-row"><span class="dl-l">Prolongation(s) :</span><span class="dl-r">' +
      prolongLines +
      '</span></div>';
  }
  dlHtml +=
    '<div class="dl-row"><span class="dl-l">Ordre de commencement :</span><span class="dl-r">' +
    fmtDate(dl_os) +
    '</span></div>';
  if (suspRows !== '\u2014') {
    dlHtml +=
      '<div class="dl-row"><span class="dl-l">Suspension d\u00e9lai :</span><span class="dl-r">' +
      suspRows +
      '</span></div>';
  }
  if (reprRows !== '\u2014') {
    dlHtml +=
      '<div class="dl-row"><span class="dl-l">Reprise d\u00e9lai :</span><span class="dl-r">' +
      reprRows +
      '</span></div>';
  }
  dlHtml += '</div>';

  const thHtml =
    '<thead><tr><th class="thl" rowspan="2" style="min-width:18mm">MOIS<br>ANN\u00c9E</th><th class="rot" rowspan="2">NOMBRE DE<br>JOURS CALENDRIER</th><th class="rot" rowspan="2">NOMBRE DE<br>SAMEDI</th><th class="rot" rowspan="2">NOMBRE DE<br>DIMANCHE</th><th class="rot" rowspan="2">NOMBRE DE<br>JOURS F\u00c9RI\u00c9S</th><th class="rot" rowspan="2">NOMBRE DE JOURS<br>VACANCES ANNUELLES</th><th colspan="2">NOMBRE DE JOURS D\u2019INT\u00c9MP\u00c9RIES</th><th class="rot" rowspan="2">NOMBRE TOTAL<br>J. \u00c0 D\u00c9DUIRE</th><th class="rot" rowspan="2">NOMBRE TOTAL<br>J. EMPLOY\u00c9S</th><th class="thl" rowspan="2" style="min-width:20mm">SUSPENSIONS<br>REPRISES<br>OBSERVATIONS</th></tr><tr><th>D\u00c9TAIL</th><th>TOTAL</th></tr></thead>';

  const mesDuree_ = Number(dl.mesDuree) || 0;
  const mesUnite_ = dl.mesUnite || 'JC';
  let dRestStr =
    '<tr class="drest"><td colspan="9" class="drest-l">Délai restant exécution :</td><td class="drest-n">' +
    state.executionRestant.JO +
    '</td><td class="drest-u">JO</td><td></td></tr>';
  if (state.executionRestant.JC > 0 || state.groupes.JC > 0) {
    dRestStr +=
      '<tr class="drest"><td colspan="9" class="drest-l"></td><td class="drest-n">' +
      state.executionRestant.JC +
      '</td><td class="drest-u">JC</td><td></td></tr>';
  }
  if (mesDuree_ > 0) {
    dRestStr +=
      '<tr class="drest"><td colspan="9" class="drest-l">Délai restant mise en service :</td><td class="drest-n">' +
      state.mesRestant +
      '</td><td class="drest-u">' +
      mesUnite_ +
      '</td><td></td></tr>';
  }

  return (
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Feuille de d\u00e9lais</title><style>' +
    css +
    '</style></head><body><div class="page"><div class="hdr">' +
    adminHtml +
    hdrR +
    '</div><div class="titre">CALCUL DU D\u00c9LAI D\u2019EX\u00c9CUTION</div>' +
    dlHtml +
    '<table class="cal"><colgroup><col style="width:24mm"><col style="width:10mm"><col style="width:8mm"><col style="width:12mm"><col style="width:12mm"><col style="width:11mm"><col><col style="width:10mm"><col style="width:11mm"><col style="width:12mm"><col style="width:31mm"></colgroup>' +
    thHtml +
    '<tbody>' +
    lignes +
    '</tbody>' +
    totRow +
    dRestStr +
    '</table><div class="sig-spacer"></div><div class="page-num"></div><div class="sigs"><div class="sig"><div class="st">Vu par l\u2019entrepreneur :</div><div class="sl"></div></div><div class="sig"><div class="st">Dress\u00e9 par le contr\u00f4leur de travaux :</div><div class="sl"></div></div></div></div></body></html>'
  );
}

/**
 * Imprime un document HTML autonome via un iframe caché (compatible iframe AI Studio, sans window.open).
 */
export function printHtmlViaIframe(html: string): void {
  const existing = document.getElementById('inasep-print-iframe');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'inasep-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // fallback handled if needed
      }
      setTimeout(() => {
        iframe.remove();
      }, 60000);
    }, 100);
  };
  iframe.srcdoc = html;
}
