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

interface TableRowChunk {
  kind: 'yr' | 'row';
  year: number;
  html: string;
  heightMm: number;
}

/**
 * Génère le document HTML/CSS multi-pages A4 Portrait exact de la feuille de délais au format INASEP.
 * - Bordures de tableau strictement uniformes (0.75pt partout).
 * - Signature entrepreneur / contrôleur et numérotation "Page X sur Y" en bas de CHAQUE page.
 * - Pagination déterministe identique entre l'aperçu écran et l'impression PDF.
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

  const items: TableRowChunk[] = [];
  let prevY = -1;
  for (const r of moisData) {
    if (r.y !== prevY) {
      prevY = r.y;
      items.push({
        kind: 'yr',
        year: r.y,
        html: '<tr><td colspan="11" class="yr">' + r.y + '</td></tr>',
        heightMm: 5.8,
      });
    }
    const estVide = r.nbJ === 0;
    const dc = estVide ? '' : r.ded;
    const ec = estVide ? '' : r.emp;
    const ecls = 'num' + (!estVide && r.emp > 0 ? ' emp' : '');
    const obsParts: string[] = [];
    if (r.eaLabel) obsParts.push(r.eaLabel);
    if (r.nMes > 0) obsParts.push(`MES : ${r.nMes} j`);
    const obsHtml = obsParts.map(escapeHtml).join('<br>');
    const detailStr = estVide ? '' : r.intDetail || '';

    const detailLines = detailStr ? Math.ceil(detailStr.length / 26) : 1;
    const obsLines =
      obsParts.length > 0
        ? obsParts.reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / 17)), 0)
        : 1;
    const lineCount = Math.max(2, detailLines, obsLines);
    const estHeightMm = Math.max(8.2, lineCount * 3.3 + 1.8);

    const rowHtml =
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
      escapeHtml(detailStr) +
      '</td><td>' +
      (estVide ? '' : r.nInt) +
      '</td><td class="ded">' +
      dc +
      '</td><td class="' +
      ecls +
      '">' +
      ec +
      '</td><td class="obs">' +
      obsHtml +
      '</td></tr>';

    items.push({
      kind: 'row',
      year: r.y,
      html: rowHtml,
      heightMm: estHeightMm,
    });
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

  const mesDuree_ = Number(dl.mesDuree) || 0;
  const mesUnite_ = dl.mesUnite || 'JC';
  let dRestCount = 1;
  let dRestStr =
    '<tr class="drest"><td colspan="9" class="drest-l">Délai restant exécution :</td><td class="drest-n' +
    (state.executionRestant.JO < 0 ? ' neg' : '') +
    '">' +
    state.executionRestant.JO +
    '</td><td class="drest-u">JO</td></tr>';

  if (state.executionRestant.JC > 0 || state.groupes.JC > 0) {
    dRestCount++;
    dRestStr +=
      '<tr class="drest"><td colspan="9" class="drest-l"></td><td class="drest-n' +
      (state.executionRestant.JC < 0 ? ' neg' : '') +
      '">' +
      state.executionRestant.JC +
      '</td><td class="drest-u">JC</td></tr>';
  }
  if (mesDuree_ > 0) {
    dRestCount++;
    dRestStr +=
      '<tr class="drest"><td colspan="9" class="drest-l">Délai restant mise en service :</td><td class="drest-n' +
      (state.mesRestant < 0 ? ' neg' : '') +
      '">' +
      state.mesRestant +
      '</td><td class="drest-u">' +
      escapeHtml(mesUnite_) +
      '</td></tr>';
  }

  const summaryHtml = totRow + dRestStr;
  const summaryHeightMm = 6.5 + dRestCount * 6.4;

  const LOGO = INASEP_LOGO_BASE64;

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
  let prolongCount = 0;
  const complGroup = { JO: 0, JC: 0 };
  (dl.delaisCompl || []).forEach((dc) => {
    const v = Number(dc.duree ?? dc.valeur) || 0;
    const u = dc.unite === 'JC' ? 'JC' : 'JO';
    complGroup[u] += v;
  });
  (['JO', 'JC'] as const).forEach((u) => {
    if (complGroup[u]) {
      prolongCount++;
      prolongLines += '<div class="prol">+' + complGroup[u] + ' ' + u + '</div>';
    }
  });

  let dlHtml = '<div class="dl">';
  dlHtml +=
    '<div class="dl-row"><span class="dl-l">D\u00e9lai d\u2019ex\u00e9cution :</span><span class="dl-r">' +
    dl_base +
    ' ' +
    escapeHtml(dl_unite) +
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

  const dlHeightMm =
    9.5 +
    (prolongCount > 0 ? prolongCount * 4.4 + 0.6 : 0) +
    (listeAr.length > 0 ? listeAr.length * 4.4 * 2 + 1.2 : 0) +
    2.5;

  const thHtml =
    '<thead><tr><th class="thl" rowspan="2" style="min-width:18mm">MOIS<br>ANN\u00c9E</th><th class="rot" rowspan="2">NOMBRE DE<br>JOURS CALENDRIER</th><th class="rot" rowspan="2">NOMBRE DE<br>SAMEDI</th><th class="rot" rowspan="2">NOMBRE DE<br>DIMANCHE</th><th class="rot" rowspan="2">NOMBRE DE<br>JOURS F\u00c9RI\u00c9S</th><th class="rot" rowspan="2">NOMBRE DE JOURS<br>VACANCES ANNUELLES</th><th colspan="2">NOMBRE DE JOURS D\u2019INT\u00c9MP\u00c9RIES</th><th class="rot" rowspan="2">NOMBRE TOTAL<br>J. \u00c0 D\u00c9DUIRE</th><th class="rot" rowspan="2">NOMBRE TOTAL<br>J. EMPLOY\u00c9S</th><th class="thl" rowspan="2" style="min-width:20mm">SUSPENSIONS<br>REPRISES<br>OBSERVATIONS</th></tr><tr><th>D\u00c9TAIL</th><th>TOTAL</th></tr></thead>';

  const colgroupHtml =
    '<colgroup><col style="width:24mm"><col style="width:10mm"><col style="width:8mm"><col style="width:12mm"><col style="width:12mm"><col style="width:11mm"><col><col style="width:10mm"><col style="width:11mm"><col style="width:12mm"><col style="width:31mm"></colgroup>';

  // Budget vertical disponible en mm sur A4 (297mm - 22mm marges = 275mm ; sécurité 272mm)
  const USABLE_HEIGHT_MM = 271;
  const HDR_TITRE_MM = 44; // .hdr (~36mm) + .titre (~8mm)
  const THEAD_MM = 38.5; // en-tête colonnes verticales + ligne détail/total
  const FOOTER_SIG_MM = 24.5; // .sig-spacer min + .sigs + .page-num

  const availBodyPage1 = Math.max(
    45,
    USABLE_HEIGHT_MM - HDR_TITRE_MM - dlHeightMm - THEAD_MM - FOOTER_SIG_MM
  );
  const availBodyPageN = Math.max(
    55,
    USABLE_HEIGHT_MM - HDR_TITRE_MM - THEAD_MM - FOOTER_SIG_MM
  );

  interface PageSlice {
    includeDl: boolean;
    tbodyHtml: string;
    includeSummary: boolean;
  }

  const pages: PageSlice[] = [];
  let idx = 0;

  if (items.length === 0) {
    pages.push({
      includeDl: true,
      tbodyHtml: '',
      includeSummary: true,
    });
  } else {
    while (idx < items.length) {
      const isFirst = pages.length === 0;
      const limit = isFirst ? availBodyPage1 : availBodyPageN;
      let used = 0;
      let tbodyHtml = '';

      // Si la page 2+ reprend directement sur un mois, rappeler l'année en tête du tableau
      if (!isFirst && items[idx].kind === 'row') {
        tbodyHtml +=
          '<tr><td colspan="11" class="yr">' + items[idx].year + ' (suite)</td></tr>';
        used += 5.8;
      }

      while (idx < items.length) {
        const cur = items[idx];

        // Éviter un titre d'année orphelin en bas de page
        if (cur.kind === 'yr') {
          const nextRow = items[idx + 1];
          const needed = cur.heightMm + (nextRow ? nextRow.heightMm : 0);
          if (used > 0 && used + needed > limit) {
            break;
          }
        }

        if (used > 0 && used + cur.heightMm > limit) {
          break;
        }

        tbodyHtml += cur.html;
        used += cur.heightMm;
        idx++;
      }

      const isLastItemsDone = idx >= items.length;
      if (isLastItemsDone) {
        if (used + summaryHeightMm <= limit) {
          pages.push({
            includeDl: isFirst,
            tbodyHtml,
            includeSummary: true,
          });
        } else {
          // Les lignes remplissent cette page ; placer TOTAUX + Délai restant sur la page suivante
          pages.push({
            includeDl: isFirst,
            tbodyHtml,
            includeSummary: false,
          });
          pages.push({
            includeDl: false,
            tbodyHtml: '',
            includeSummary: true,
          });
        }
      } else {
        pages.push({
          includeDl: isFirst,
          tbodyHtml,
          includeSummary: false,
        });
      }
    }
  }

  const totalPages = pages.length;

  const pagesHtml = pages
    .map((p, pageIndex) => {
      const tableBodyContent =
        (p.tbodyHtml ? '<tbody>' + p.tbodyHtml + '</tbody>' : '') +
        (p.includeSummary ? '<tbody>' + summaryHtml + '</tbody>' : '');

      return (
        '<div class="page">' +
        '<div class="hdr">' +
        adminHtml +
        hdrR +
        '</div>' +
        '<div class="titre">CALCUL DU D\u00c9LAI D\u2019EX\u00c9CUTION</div>' +
        (p.includeDl ? dlHtml : '') +
        '<table class="cal">' +
        colgroupHtml +
        thHtml +
        tableBodyContent +
        '</table>' +
        '<div class="sig-spacer"></div>' +
        '<div class="page-bottom">' +
        '<div class="sigs">' +
        '<div class="sig"><div class="st">Vu par l\u2019entrepreneur :</div><div class="sl"></div></div>' +
        '<div class="sig"><div class="st">Dress\u00e9 par le contr\u00f4leur de travaux :</div><div class="sl"></div></div>' +
        '</div>' +
        '<div class="page-num">Page ' +
        (pageIndex + 1) +
        ' sur ' +
        totalPages +
        '</div>' +
        '</div>' +
        '</div>'
      );
    })
    .join('');

  const css = `
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;background:#cbd5e1;padding:12px 0;font-variant-numeric:tabular-nums;}
.page{width:210mm;height:297mm;margin:0 auto 14px auto;padding:10mm 10mm 12mm 10mm;background:#fff;box-shadow:0 8px 26px rgba(15,23,42,0.22);display:flex;flex-direction:column;overflow:hidden;}
.page:last-child{margin-bottom:0;}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:0.75pt solid #000;gap:4mm;}
.hdr-l{flex:1;font-size:9pt;font-family:Arial,Helvetica,sans-serif;}
.hdr-l .admin-row{display:flex;gap:2mm;line-height:1.55;}
.hdr-l .lbl{font-weight:400;min-width:29mm;white-space:nowrap;}
.hdr-l .val{font-weight:700;}
.hdr-r{text-align:right;flex-shrink:0;}
.hdr-r img{height:18mm;width:auto;object-fit:contain;display:block;margin-bottom:1mm;margin-left:auto;}
.hdr-r .nom{font-family:"Century Gothic","Trebuchet MS",Arial,sans-serif;font-size:8.5pt;font-weight:700;color:#0B4499;display:block;}
.hdr-r .sub{font-family:"Century Gothic","Trebuchet MS",Arial,sans-serif;font-size:6.5pt;color:#0B4499;display:block;}
.titre{text-align:center;font-size:13pt;font-weight:700;font-family:Verdana,Arial,sans-serif;color:#000;margin-bottom:2mm;}
.dl{margin-bottom:2mm;font-size:9pt;font-family:Arial,Helvetica,sans-serif;}
.dl-row{display:flex;gap:2mm;margin-bottom:0.4mm;align-items:baseline;}
.dl-l{min-width:39mm;white-space:nowrap;font-weight:400;text-align:right;}
.dl-r{font-weight:400;}
.prol{font-weight:700;line-height:1.4;}
table.cal{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:1.5mm;table-layout:fixed;font-variant-numeric:tabular-nums;}
table.cal th{background:#fff;color:#000;text-align:center;vertical-align:middle;padding:0.8mm 0.4mm;border:0.75pt solid #000;font-size:7pt;font-family:Arial,Helvetica,sans-serif;line-height:1.1;font-weight:400;}
table.cal thead tr:first-child th{height:31mm;}
table.cal thead tr:nth-child(2) th{height:5mm;}
table.cal th.thl{text-align:center;}
table.cal th.rot{writing-mode:vertical-rl;transform:rotate(180deg);white-space:normal;padding:1.5mm 0.4mm;vertical-align:middle;text-align:center;line-height:1.1;font-size:7pt;}
table.cal td{border:0.75pt solid #000;padding:0.55mm 0.4mm;text-align:center;vertical-align:middle;font-size:8.5pt;font-family:Arial,Helvetica,sans-serif;color:#000;overflow:hidden;}
table.cal td.mois{text-align:center;white-space:normal;font-size:8.5pt;line-height:1.25;padding:0.45mm;font-weight:400;}
table.cal td.det{font-size:7pt;font-family:Arial,Helvetica,sans-serif;white-space:normal;word-break:break-word;line-height:1.15;}
table.cal td.ded{font-weight:700;}
table.cal td.num.emp{font-weight:700;}
table.cal td.obs{text-align:left;padding-left:1mm;font-size:8pt;white-space:normal;line-height:1.2;}
table.cal tr.yr td{font-weight:700;text-align:left;padding:0.4mm 1mm;font-size:9pt;border:0.75pt solid #000;background:#fff;}
table.cal td.yr{font-weight:700;text-align:left;padding:0.4mm 1mm;font-size:9pt;border:0.75pt solid #000;background:#fff;}
table.cal tr.tot td{font-weight:700;border:0.75pt solid #000;text-align:center;font-size:8.5pt;background:#fff;padding:0.65mm 0.4mm;}
table.cal tr.tot td.mois{text-align:center;}
table.cal tr.drest td{border:none;background:#fff;padding:0.75mm 0.4mm;}
table.cal tr.drest:first-of-type td{border-top:0.75pt solid #000;}
table.cal td.drest-l{font-size:8.5pt;font-family:Arial,Helvetica,sans-serif;text-align:right;white-space:nowrap;font-weight:700;padding-right:1mm;}
table.cal td.drest-n{font-size:11pt;font-family:Arial,Helvetica,sans-serif;text-align:center;font-weight:700;}
table.cal td.drest-n.neg{color:#c00;}
table.cal td.drest-u{font-size:8.5pt;font-family:Arial,Helvetica,sans-serif;text-align:left;white-space:nowrap;padding-left:1.5mm;}
.sig-spacer{flex:1 1 auto;min-height:3mm;}
.page-bottom{flex:0 0 auto;page-break-inside:avoid;break-inside:avoid;}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:8mm;}
.sig{font-size:9.5pt;font-family:Calibri,Arial,Helvetica,sans-serif;}
.sig .st{font-weight:400;margin-bottom:9mm;}
.sig .sl{border-bottom:0.75pt solid #000;}
.page-num{margin-top:2.5mm;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#333;}
@page{size:A4 portrait;margin:0;}
@media print{
  body{background:#fff;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{width:210mm;height:296.5mm;margin:0;padding:10mm 10mm 12mm 10mm;box-shadow:none;}
  .page:not(:last-child){page-break-after:always;break-after:page;}
}
`;

  return (
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Feuille de d\u00e9lais INASEP</title><style>' +
    css +
    '</style></head><body>' +
    pagesHtml +
    '</body></html>'
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
