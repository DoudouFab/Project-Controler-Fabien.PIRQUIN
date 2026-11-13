import ExcelJS from 'exceljs';
import { INASEP_LOGO_BASE64, MOIS_FR } from '../constants/inasep';
import { CarnetLineItem, PosteMarche, ProjectData } from '../types/project';
import { calculerEtatDelai, mnt, srcP } from './calculations';

// ─── HELPERS COMMUNS EXCELJS ────────────────────────────────────────────────

const BORDER_SLATE: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FFCBD5E1' },
};
const BORDER_HEADER_LIGHT: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FF334155' },
};
const BORDER_TOTAL_TOP: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FF1E3A5F' },
};
const BORDER_TOTAL_BOTTOM: Partial<ExcelJS.Border> = {
  style: 'double',
  color: { argb: 'FF1E3A5F' },
};

const CELL_BORDERS: Partial<ExcelJS.Borders> = {
  top: BORDER_SLATE,
  left: BORDER_SLATE,
  bottom: BORDER_SLATE,
  right: BORDER_SLATE,
};

const HEADER_BORDERS: Partial<ExcelJS.Borders> = {
  top: BORDER_HEADER_LIGHT,
  left: BORDER_HEADER_LIGHT,
  bottom: BORDER_HEADER_LIGHT,
  right: BORDER_HEADER_LIGHT,
};

const TOTAL_BORDERS: Partial<ExcelJS.Borders> = {
  top: BORDER_TOTAL_TOP,
  left: BORDER_SLATE,
  bottom: BORDER_TOTAL_BOTTOM,
  right: BORDER_SLATE,
};

async function downloadExcelWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Feuille';
}

function addStyledMetaBanner(
  ws: ExcelJS.Worksheet,
  appData: ProjectData,
  title: string,
  totalCols: number,
  extraRight?: { label: string; value: string | number; numFmt?: string }
): { nextRow: number; extraValueCellRef?: string } {
  const info = appData.infosAdministratives || {};
  const midCol = Math.max(2, Math.floor(totalCols / 2));

  // Ligne 1 : Bandeau titre
  ws.mergeCells(1, 1, 1, totalCols);
  const titleRow = ws.getRow(1);
  titleRow.height = 28;
  const titleCell = titleRow.getCell(1);
  titleCell.value = `  ${title}`;
  titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B4499' },
  };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

  const metaPairs: Array<[string, string, string, string | number, string?]> = [
    [
      'Projet :',
      info.intitule || appData.nomProjet || '—',
      'N° de marché :',
      info.marche || '—',
    ],
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
    [
      'Exporté le :',
      new Date().toLocaleDateString('fr-FR'),
      extraRight ? extraRight.label : 'Généré par :',
      extraRight ? extraRight.value : 'ProjectController · F.Pirquin · INASEP',
      extraRight?.numFmt,
    ],
  ];

  let extraValueCellRef: string | undefined;

  if (totalCols < 4) {
    const simpleRows: Array<[string, string | number]> = [
      ['Projet :', info.intitule || appData.nomProjet || '—'],
      ['N° de marché :', info.marche || '—'],
      ['Maître d’ouvrage :', info.mo || '—'],
      ['Exporté le :', new Date().toLocaleDateString('fr-FR')],
    ];
    simpleRows.forEach(([l1, v1], idx) => {
      const rIdx = idx + 2;
      const row = ws.getRow(rIdx);
      row.height = 18;
      if (totalCols > 2) ws.mergeCells(rIdx, 2, rIdx, totalCols);
      const cL = row.getCell(1);
      cL.value = l1;
      cL.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF334155' } };
      cL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cL.alignment = { horizontal: 'left', vertical: 'middle' };
      cL.border = CELL_BORDERS;

      const cV = row.getCell(2);
      cV.value = v1;
      cV.font = { name: 'Arial', size: 8.5, color: { argb: 'FF0F172A' } };
      cV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cV.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let cc = 2; cc <= totalCols; cc++) {
        row.getCell(cc).border = CELL_BORDERS;
      }
    });
  } else {
    metaPairs.forEach(([l1, v1, l2, v2, v2Fmt], idx) => {
      const rIdx = idx + 2;
      const row = ws.getRow(rIdx);
      row.height = 18;

      if (midCol > 2) {
        ws.mergeCells(rIdx, 2, rIdx, midCol);
      }
      const cL1 = row.getCell(1);
      cL1.value = l1;
      cL1.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF334155' } };
      cL1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cL1.alignment = { horizontal: 'left', vertical: 'middle' };
      cL1.border = CELL_BORDERS;

      const cV1 = row.getCell(2);
      cV1.value = v1;
      cV1.font = { name: 'Arial', size: 8.5, bold: false, color: { argb: 'FF0F172A' } };
      cV1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cV1.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let cc = 2; cc <= midCol; cc++) {
        row.getCell(cc).border = CELL_BORDERS;
      }

      const rightLblCol = midCol + 1;
      const rightValCol = Math.min(totalCols, rightLblCol + 1);
      if (totalCols > rightValCol) {
        ws.mergeCells(rIdx, rightValCol, rIdx, totalCols);
      }
      const cL2 = row.getCell(rightLblCol);
      cL2.value = l2;
      cL2.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF334155' } };
      cL2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cL2.alignment = { horizontal: 'left', vertical: 'middle' };
      cL2.border = CELL_BORDERS;

      const cV2 = row.getCell(rightValCol);
      cV2.value = v2;
      cV2.font = {
        name: 'Arial',
        size: 8.5,
        bold: Boolean(extraRight && idx === 3),
        color: { argb: 'FF0F172A' },
      };
      cV2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cV2.alignment = {
        horizontal: typeof v2 === 'number' ? 'right' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      if (v2Fmt) {
        cV2.numFmt = v2Fmt;
      }
      for (let cc = rightValCol; cc <= totalCols; cc++) {
        row.getCell(cc).border = CELL_BORDERS;
      }

      if (extraRight && idx === 3) {
        extraValueCellRef = cV2.address;
      }
    });
  }

  ws.getRow(6).height = 8;
  return { nextRow: 7, extraValueCellRef };
}

function styleTableHeaderRow(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  headers: Array<{ label: string; align?: 'left' | 'center' | 'right' }>
) {
  const row = ws.getRow(rowIdx);
  row.height = 26;
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h.label;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    cell.alignment = {
      horizontal: h.align || 'left',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = HEADER_BORDERS;
  });

  ws.views = [{ state: 'frozen', ySplit: rowIdx }];
  ws.autoFilter = {
    from: { row: rowIdx, column: 1 },
    to: { row: rowIdx, column: headers.length },
  };
}

function applyStandardPageSetup(ws: ExcelJS.Worksheet, orientation: 'landscape' | 'portrait' = 'landscape') {
  ws.pageSetup = {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.45,
      bottom: 0.5,
      header: 0.2,
      footer: 0.25,
    },
  };
  ws.headerFooter = {
    oddFooter: '&L© ProjectController - F.Pirquin - INASEP&RPage &P sur &N',
  };
}

const FMT_QTE = '#,##0.000';
const FMT_EUR = '#,##0.00 "€"';
const FMT_PCT = '0.0%';

// ─── 1. EXPORT CARNET DE MESURAGE ───────────────────────────────────────────
export async function exportCarnetExcel(
  appData: ProjectData,
  lines: CarnetLineItem[]
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectController - F.Pirquin - INASEP';
  wb.created = new Date();

  const ws = wb.addWorksheet(safeSheetName('Carnet_Mesurage'));
  applyStandardPageSetup(ws, 'landscape');

  ws.columns = [
    { width: 13 }, // A: N° Poste
    { width: 34 }, // B: Description poste
    { width: 8 }, // C: Unité
    { width: 24 }, // D: Tronçon / Localisation
    { width: 28 }, // E: Prestation
    { width: 38 }, // F: Détail / Formule
    { width: 13 }, // G: Quantité
    { width: 13 }, // H: PU (€)
    { width: 15 }, // I: Montant (€)
    { width: 19 }, // J: Statut EA
    { width: 24 }, // K: Annotation
  ];

  const { nextRow } = addStyledMetaBanner(ws, appData, 'CARNET DE MESURAGE', 11);
  const headerRowIdx = nextRow;

  styleTableHeaderRow(ws, headerRowIdx, [
    { label: 'N° Poste', align: 'center' },
    { label: 'Description poste', align: 'left' },
    { label: 'Unité', align: 'center' },
    { label: 'Tronçon / Localisation', align: 'left' },
    { label: 'Prestation', align: 'left' },
    { label: 'Détail / Formule', align: 'left' },
    { label: 'Quantité', align: 'right' },
    { label: 'PU (€)', align: 'right' },
    { label: 'Montant (€)', align: 'right' },
    { label: 'Statut EA', align: 'center' },
    { label: 'Annotation', align: 'left' },
  ]);

  const dataStart = headerRowIdx + 1;
  let curRow = dataStart;

  lines.forEach((l, idx) => {
    const pu = l.posteEff?.pu ?? 0;
    const qteVal = Math.round(l.qEff * 1000) / 1000;
    const puVal = Math.round(pu * 100) / 100;
    const montant = mnt(qteVal, puVal);
    const statut = l.porteeA
      ? `${l.porteeA}${l.deverrouille ? ' (déverrouillé)' : ' (clôturé)'}`
      : l.coche
      ? 'À porter à l’EA'
      : 'En attente';

    const formuleStr = (l.formuleTxt || '').replace(/\n/g, ' | ');
    const maxLen = Math.max(
      (l.posteEff?.desc || '').length / 32,
      formuleStr.length / 36,
      (l.libPrestation || '').length / 26
    );
    const row = ws.getRow(curRow);
    row.height = Math.max(19, Math.ceil(maxLen) * 12.5);

    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    const values: unknown[] = [
      l.posteId || 'NON ATTRIBUÉ',
      l.posteEff?.desc || '—',
      l.unite || '',
      l.libTroncon,
      l.libPrestation,
      formuleStr,
      qteVal,
      puVal,
      { formula: `ROUND(G${curRow}*H${curRow},2)`, result: montant },
      statut,
      l.annotation || '',
    ];

    values.forEach((v, cIdx) => {
      const col = cIdx + 1;
      const cell = row.getCell(col);
      cell.value = v as ExcelJS.CellValue;
      cell.border = CELL_BORDERS;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

      let fontColor = 'FF0F172A';
      let bold = col === 1 || col === 9;
      if (col === 10) {
        bold = true;
        fontColor = l.porteeA ? 'FF047857' : l.coche ? 'FF0369A1' : 'FF64748B';
      } else if (col === 7 && qteVal < 0) {
        fontColor = 'FFDC2626';
      }

      cell.font = { name: 'Arial', size: 9, bold, color: { argb: fontColor } };
      cell.alignment = {
        horizontal:
          col === 1 || col === 3 || col === 10
            ? 'center'
            : col >= 7 && col <= 9
            ? 'right'
            : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      if (col === 7) cell.numFmt = FMT_QTE;
      if (col === 8 || col === 9) cell.numFmt = FMT_EUR;
    });

    curRow++;
  });

  const dataEnd = curRow - 1;
  const totalMontantExact = lines.reduce(
    (s, l) => Math.round((s + mnt(l.qEff, l.posteEff?.pu ?? 0)) * 100) / 100,
    0
  );

  // Ligne Total
  const totRow = ws.getRow(curRow);
  totRow.height = 22;
  ws.mergeCells(curRow, 1, curRow, 8);
  const totLbl = totRow.getCell(1);
  totLbl.value = `TOTAL CARNET AFFICHÉ (${lines.length} ligne${lines.length > 1 ? 's' : ''})`;
  totLbl.alignment = { horizontal: 'right', vertical: 'middle' };

  const totVal = totRow.getCell(9);
  totVal.value =
    dataEnd >= dataStart
      ? { formula: `SUM(I${dataStart}:I${dataEnd})`, result: totalMontantExact }
      : 0;
  totVal.numFmt = FMT_EUR;
  totVal.alignment = { horizontal: 'right', vertical: 'middle' };

  for (let cc = 1; cc <= 11; cc++) {
    const cell = totRow.getCell(cc);
    cell.border = TOTAL_BORDERS;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
  }

  await downloadExcelWorkbook(wb, `${appData.nomProjet || 'Chantier'}_Carnet_Mesurage.xlsx`);
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

export async function exportEaEnCoursExcel(
  appData: ProjectData,
  eaIndice: string,
  groups: EaExportRow[],
  totalEA: number
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectController - F.Pirquin - INASEP';
  wb.created = new Date();

  // Feuille 1 : Synthèse EA
  const wsSynth = wb.addWorksheet(safeSheetName(`Synthèse_${eaIndice}`));
  applyStandardPageSetup(wsSynth, 'landscape');
  wsSynth.columns = [
    { width: 13 }, // A: N° Poste
    { width: 42 }, // B: Description
    { width: 8 }, // C: Unité
    { width: 13 }, // D: PU (€)
    { width: 15 }, // E: Q. Avant EA
    { width: 15 }, // F: Q. de l'EA
    { width: 16 }, // G: Montant EA (€)
    { width: 15 }, // H: Q. Cumulée
  ];

  const { nextRow: synthHeaderRow } = addStyledMetaBanner(
    wsSynth,
    appData,
    `ÉTAT D’AVANCEMENT EN COURS — ${eaIndice}`,
    8
  );

  styleTableHeaderRow(wsSynth, synthHeaderRow, [
    { label: 'N° Poste', align: 'center' },
    { label: 'Description', align: 'left' },
    { label: 'Unité', align: 'center' },
    { label: 'PU (€)', align: 'right' },
    { label: 'Q. Avant EA', align: 'right' },
    { label: 'Q. de l’EA', align: 'right' },
    { label: 'Montant EA (€)', align: 'right' },
    { label: 'Q. Cumulée', align: 'right' },
  ]);

  const sStart = synthHeaderRow + 1;
  let curS = sStart;
  groups.forEach((g, idx) => {
    const row = wsSynth.getRow(curS);
    row.height = Math.max(19, Math.ceil((g.poste.desc || '').length / 40) * 12.5);
    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    const qAvant = Math.round(g.qAvant * 1000) / 1000;
    const qEA = Math.round(g.qEA * 1000) / 1000;
    const pu = Math.round(g.poste.pu * 100) / 100;

    const vals: unknown[] = [
      g.poste.id,
      g.poste.desc,
      g.poste.u,
      pu,
      qAvant,
      qEA,
      { formula: `ROUND(F${curS}*D${curS},2)`, result: Math.round(g.mEA * 100) / 100 },
      { formula: `E${curS}+F${curS}`, result: Math.round(g.qCumul * 1000) / 1000 },
    ];

    vals.forEach((v, cIdx) => {
      const col = cIdx + 1;
      const cell = row.getCell(col);
      cell.value = v as ExcelJS.CellValue;
      cell.border = CELL_BORDERS;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: col === 1 || col === 7,
        color: { argb: 'FF0F172A' },
      };
      cell.alignment = {
        horizontal: col === 1 || col === 3 ? 'center' : col >= 4 ? 'right' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      if (col === 4 || col === 7) cell.numFmt = FMT_EUR;
      if (col === 5 || col === 6 || col === 8) cell.numFmt = FMT_QTE;
    });
    curS++;
  });

  const sEnd = curS - 1;
  const sTot = wsSynth.getRow(curS);
  sTot.height = 22;
  wsSynth.mergeCells(curS, 1, curS, 6);
  sTot.getCell(1).value = `TOTAL ${eaIndice}`;
  sTot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  sTot.getCell(7).value =
    sEnd >= sStart
      ? { formula: `SUM(G${sStart}:G${sEnd})`, result: Math.round(totalEA * 100) / 100 }
      : 0;
  sTot.getCell(7).numFmt = FMT_EUR;
  sTot.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  for (let cc = 1; cc <= 8; cc++) {
    const c = sTot.getCell(cc);
    c.border = TOTAL_BORDERS;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
  }

  // Feuille 2 : Détail justificatif
  const wsDetail = wb.addWorksheet(safeSheetName(`Détail_${eaIndice}`));
  applyStandardPageSetup(wsDetail, 'landscape');
  wsDetail.columns = [
    { width: 13 }, // A: N° Poste
    { width: 26 }, // B: Tronçon / Localisation
    { width: 38 }, // C: Prestation
    { width: 8 }, // D: Unité
    { width: 14 }, // E: Quantité
    { width: 13 }, // F: PU (€)
    { width: 16 }, // G: Montant (€)
  ];

  const { nextRow: detHeaderRow } = addStyledMetaBanner(
    wsDetail,
    appData,
    `DÉTAIL JUSTIFICATIF — ${eaIndice}`,
    7
  );

  styleTableHeaderRow(wsDetail, detHeaderRow, [
    { label: 'N° Poste', align: 'center' },
    { label: 'Tronçon / Localisation', align: 'left' },
    { label: 'Prestation', align: 'left' },
    { label: 'Unité', align: 'center' },
    { label: 'Quantité', align: 'right' },
    { label: 'PU (€)', align: 'right' },
    { label: 'Montant (€)', align: 'right' },
  ]);

  const dStart = detHeaderRow + 1;
  let curD = dStart;
  let detIdx = 0;

  groups.forEach((g) => {
    g.lines.forEach((l) => {
      const row = wsDetail.getRow(curD);
      row.height = Math.max(19, Math.ceil((l.libPrestation || '').length / 36) * 12.5);
      const bg = detIdx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const q = Math.round(l.qEff * 1000) / 1000;
      const pu = Math.round(g.poste.pu * 100) / 100;
      const mVal = mnt(q, pu);

      const vals: unknown[] = [
        g.poste.id,
        l.libTroncon,
        l.libPrestation,
        l.unite,
        q,
        pu,
        { formula: `ROUND(E${curD}*F${curD},2)`, result: mVal },
      ];

      vals.forEach((v, cIdx) => {
        const col = cIdx + 1;
        const cell = row.getCell(col);
        cell.value = v as ExcelJS.CellValue;
        cell.border = CELL_BORDERS;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = {
          name: 'Arial',
          size: 9,
          bold: col === 1 || col === 7,
          color: { argb: 'FF0F172A' },
        };
        cell.alignment = {
          horizontal: col === 1 || col === 4 ? 'center' : col >= 5 ? 'right' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        if (col === 5) cell.numFmt = FMT_QTE;
        if (col === 6 || col === 7) cell.numFmt = FMT_EUR;
      });
      curD++;
      detIdx++;
    });
  });

  const dEnd = curD - 1;
  const dTot = wsDetail.getRow(curD);
  dTot.height = 22;
  wsDetail.mergeCells(curD, 1, curD, 6);
  dTot.getCell(1).value = `TOTAL DÉTAIL ${eaIndice}`;
  dTot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  dTot.getCell(7).value =
    dEnd >= dStart
      ? { formula: `SUM(G${dStart}:G${dEnd})`, result: Math.round(totalEA * 100) / 100 }
      : 0;
  dTot.getCell(7).numFmt = FMT_EUR;
  dTot.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  for (let cc = 1; cc <= 7; cc++) {
    const c = dTot.getCell(cc);
    c.border = TOTAL_BORDERS;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
  }

  await downloadExcelWorkbook(wb, `${appData.nomProjet || 'Chantier'}_${eaIndice}.xlsx`);
}

// ─── 3. EXPORT EA VALIDÉS ───────────────────────────────────────────────────
export async function exportEaValidesExcel(appData: ProjectData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectController - F.Pirquin - INASEP';
  wb.created = new Date();

  const allPostes = srcP(appData);
  const budgetGlobal = Math.round(allPostes.reduce((s, p) => s + mnt(p.qte, p.pu), 0) * 100) / 100;

  // Feuille 1 : Synthèse des EA validés
  const wsSynth = wb.addWorksheet(safeSheetName('EA_Validés'));
  applyStandardPageSetup(wsSynth, 'landscape');
  wsSynth.columns = [
    { width: 14 }, // A: N° EA
    { width: 16 }, // B: Date clôture
    { width: 18 }, // C: Montant EA (€)
    { width: 18 }, // D: Cumulé (€)
    { width: 14 }, // E: % Budget
    { width: 18 }, // F: Solde marché (€)
  ];

  const { nextRow: synthHeaderRow, extraValueCellRef: budgetCellRef } = addStyledMetaBanner(
    wsSynth,
    appData,
    'HISTORIQUE DES ÉTATS D’AVANCEMENT VALIDÉS',
    6,
    { label: 'Budget global marché :', value: budgetGlobal, numFmt: FMT_EUR }
  );

  styleTableHeaderRow(wsSynth, synthHeaderRow, [
    { label: 'N° EA', align: 'center' },
    { label: 'Date clôture', align: 'center' },
    { label: 'Montant EA (€)', align: 'right' },
    { label: 'Cumulé (€)', align: 'right' },
    { label: '% Budget', align: 'right' },
    { label: 'Solde marché (€)', align: 'right' },
  ]);

  const sStart = synthHeaderRow + 1;
  let curS = sStart;
  let cumul = 0;

  (appData.historiqueEA || []).forEach((ea, idx) => {
    const m = Math.round((ea.montant || 0) * 100) / 100;
    cumul = Math.round((cumul + m) * 100) / 100;
    const pct = budgetGlobal > 0 ? cumul / budgetGlobal : 0;
    const rest = Math.round((budgetGlobal - cumul) * 100) / 100;

    const row = wsSynth.getRow(curS);
    row.height = 20;
    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    const bRef = budgetCellRef || '$E$5';

    const vals: unknown[] = [
      ea.indice,
      ea.date,
      m,
      idx === 0
        ? { formula: `C${curS}`, result: cumul }
        : { formula: `D${curS - 1}+C${curS}`, result: cumul },
      { formula: `IF(${bRef}>0,D${curS}/${bRef},0)`, result: pct },
      { formula: `${bRef}-D${curS}`, result: rest },
    ];

    vals.forEach((v, cIdx) => {
      const col = cIdx + 1;
      const cell = row.getCell(col);
      cell.value = v as ExcelJS.CellValue;
      cell.border = CELL_BORDERS;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: col === 1 || col === 3 || col === 4,
        color: { argb: col === 6 && rest < 0 ? 'FFDC2626' : 'FF0F172A' },
      };
      cell.alignment = {
        horizontal: col <= 2 ? 'center' : 'right',
        vertical: 'middle',
      };
      if (col === 3 || col === 4 || col === 6) cell.numFmt = FMT_EUR;
      if (col === 5) cell.numFmt = FMT_PCT;
    });

    curS++;
  });

  const sEnd = curS - 1;
  const sTot = wsSynth.getRow(curS);
  sTot.height = 22;
  wsSynth.mergeCells(curS, 1, curS, 2);
  sTot.getCell(1).value = 'TOTAL VALIDÉ';
  sTot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  sTot.getCell(3).value =
    sEnd >= sStart ? { formula: `SUM(C${sStart}:C${sEnd})`, result: cumul } : 0;
  sTot.getCell(3).numFmt = FMT_EUR;
  sTot.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
  sTot.getCell(4).value =
    sEnd >= sStart ? { formula: `D${sEnd}`, result: cumul } : 0;
  sTot.getCell(4).numFmt = FMT_EUR;
  sTot.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  const bRef = budgetCellRef || '$E$5';
  sTot.getCell(5).value =
    sEnd >= sStart
      ? { formula: `IF(${bRef}>0,D${curS}/${bRef},0)`, result: budgetGlobal > 0 ? cumul / budgetGlobal : 0 }
      : 0;
  sTot.getCell(5).numFmt = FMT_PCT;
  sTot.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
  sTot.getCell(6).value =
    sEnd >= sStart
      ? { formula: `${bRef}-D${curS}`, result: Math.round((budgetGlobal - cumul) * 100) / 100 }
      : budgetGlobal;
  sTot.getCell(6).numFmt = FMT_EUR;
  sTot.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

  for (let cc = 1; cc <= 6; cc++) {
    const c = sTot.getCell(cc);
    c.border = TOTAL_BORDERS;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
  }

  // Feuille 2 : Détail par poste de chaque EA validé
  const wsDetail = wb.addWorksheet(safeSheetName('Détail_Postes_EA'));
  applyStandardPageSetup(wsDetail, 'landscape');
  wsDetail.columns = [
    { width: 11 }, // A: N° EA
    { width: 14 }, // B: Date clôture
    { width: 13 }, // C: N° Poste
    { width: 38 }, // D: Description
    { width: 8 }, // E: Unité
    { width: 15 }, // F: Quantité retenue
    { width: 14 }, // G: Qté origine
    { width: 13 }, // H: PU (€)
    { width: 16 }, // I: Montant (€)
  ];

  const { nextRow: detHeaderRow } = addStyledMetaBanner(
    wsDetail,
    appData,
    'DÉTAIL DES POSTES PAR ÉTAT D’AVANCEMENT VALIDÉ',
    9
  );

  styleTableHeaderRow(wsDetail, detHeaderRow, [
    { label: 'N° EA', align: 'center' },
    { label: 'Date clôture', align: 'center' },
    { label: 'N° Poste', align: 'center' },
    { label: 'Description', align: 'left' },
    { label: 'Unité', align: 'center' },
    { label: 'Qté retenue', align: 'right' },
    { label: 'Qté origine', align: 'right' },
    { label: 'PU (€)', align: 'right' },
    { label: 'Montant (€)', align: 'right' },
  ]);

  const dStart = detHeaderRow + 1;
  let curD = dStart;
  let detIdx = 0;
  let totalDet = 0;

  (appData.historiqueEA || []).forEach((ea) => {
    const details = [...(ea.detailParPoste || [])].sort((a, b) =>
      a.posteId.localeCompare(b.posteId, 'fr', { numeric: true, sensitivity: 'base' })
    );
    details.forEach((d) => {
      const poste = allPostes.find((p) => p.id === d.posteId);
      const qRet = Math.round((d.qte || 0) * 1000) / 1000;
      const qOrig = d.qteOrigine !== undefined ? Math.round(d.qteOrigine * 1000) / 1000 : '';
      const pu = Math.round((poste?.pu || 0) * 100) / 100;
      const mVal = Math.round((d.montant || 0) * 100) / 100;
      totalDet = Math.round((totalDet + mVal) * 100) / 100;

      const row = wsDetail.getRow(curD);
      row.height = Math.max(19, Math.ceil((poste?.desc || '').length / 36) * 12.5);
      const bg = detIdx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';

      const vals: unknown[] = [
        ea.indice,
        ea.date,
        d.posteId,
        poste?.desc || '—',
        poste?.u || '',
        qRet,
        qOrig,
        pu,
        mVal,
      ];

      vals.forEach((v, cIdx) => {
        const col = cIdx + 1;
        const cell = row.getCell(col);
        cell.value = v as ExcelJS.CellValue;
        cell.border = CELL_BORDERS;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = {
          name: 'Arial',
          size: 9,
          bold: col === 1 || col === 3 || col === 9,
          color: { argb: 'FF0F172A' },
        };
        cell.alignment = {
          horizontal:
            col <= 3 || col === 5 ? 'center' : col >= 6 ? 'right' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        if (col === 6 || col === 7) cell.numFmt = FMT_QTE;
        if (col === 8 || col === 9) cell.numFmt = FMT_EUR;
      });
      curD++;
      detIdx++;
    });
  });

  const dEnd = curD - 1;
  const dTot = wsDetail.getRow(curD);
  dTot.height = 22;
  wsDetail.mergeCells(curD, 1, curD, 8);
  dTot.getCell(1).value = 'TOTAL DÉTAIL DES POSTES VALIDÉS';
  dTot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  dTot.getCell(9).value =
    dEnd >= dStart ? { formula: `SUM(I${dStart}:I${dEnd})`, result: totalDet } : 0;
  dTot.getCell(9).numFmt = FMT_EUR;
  dTot.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  for (let cc = 1; cc <= 9; cc++) {
    const c = dTot.getCell(cc);
    c.border = TOTAL_BORDERS;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
  }

  await downloadExcelWorkbook(wb, `${appData.nomProjet || 'Chantier'}_EA_Valides.xlsx`);
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

export async function exportCumulExcel(
  appData: ProjectData,
  rowsData: CumulExportRow[]
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectController - F.Pirquin - INASEP';
  wb.created = new Date();

  const ws = wb.addWorksheet(safeSheetName('Cumul_Concordance'));
  applyStandardPageSetup(ws, 'landscape');
  ws.columns = [
    { width: 12 }, // A: N° Poste
    { width: 36 }, // B: Description
    { width: 8 }, // C: Unité
    { width: 12 }, // D: PU (€)
    { width: 13 }, // E: Q. Prév.
    { width: 15 }, // F: Budget (€)
    { width: 13 }, // G: Q. Avant EA
    { width: 13 }, // H: Q. EA en cours
    { width: 15 }, // I: Montant EA (€)
    { width: 13 }, // J: Q. Cumulée
    { width: 15 }, // K: Montant Réel (€)
    { width: 13 }, // L: Solde Qté
    { width: 11 }, // M: % Exécuté
    { width: 15 }, // N: Écart (€)
  ];

  const { nextRow: headerRowIdx } = addStyledMetaBanner(
    ws,
    appData,
    'CUMUL & CONCORDANCE BUDGÉTAIRE',
    14
  );

  styleTableHeaderRow(ws, headerRowIdx, [
    { label: 'N° Poste', align: 'center' },
    { label: 'Description', align: 'left' },
    { label: 'Unité', align: 'center' },
    { label: 'PU (€)', align: 'right' },
    { label: 'Q. Prév.', align: 'right' },
    { label: 'Budget (€)', align: 'right' },
    { label: 'Q. Avant EA', align: 'right' },
    { label: 'Q. EA en cours', align: 'right' },
    { label: 'Montant EA (€)', align: 'right' },
    { label: 'Q. Cumulée', align: 'right' },
    { label: 'Montant Réel (€)', align: 'right' },
    { label: 'Solde Qté', align: 'right' },
    { label: '% Exécuté', align: 'right' },
    { label: 'Écart (€)', align: 'right' },
  ]);

  const dStart = headerRowIdx + 1;
  let curR = dStart;
  let totBudget = 0;
  let totEA = 0;
  let totReel = 0;

  rowsData.forEach((r, idx) => {
    totBudget = Math.round((totBudget + r.mBudget) * 100) / 100;
    totEA = Math.round((totEA + r.mEA) * 100) / 100;
    totReel = Math.round((totReel + r.mReel) * 100) / 100;

    const row = ws.getRow(curR);
    row.height = Math.max(19, Math.ceil((r.p.desc || '').length / 34) * 12.5);
    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';

    const pu = Math.round(r.p.pu * 100) / 100;
    const qPrev = Math.round(r.p.qte * 1000) / 1000;
    const qAvant = Math.round(r.qAvant * 1000) / 1000;
    const qEA = Math.round(r.qEA * 1000) / 1000;

    const vals: unknown[] = [
      r.p.id,
      r.p.desc,
      r.p.u,
      pu,
      qPrev,
      { formula: `ROUND(E${curR}*D${curR},2)`, result: Math.round(r.mBudget * 100) / 100 },
      qAvant,
      qEA,
      { formula: `ROUND(H${curR}*D${curR},2)`, result: Math.round(r.mEA * 100) / 100 },
      { formula: `G${curR}+H${curR}`, result: Math.round(r.qCumul * 1000) / 1000 },
      { formula: `ROUND(J${curR}*D${curR},2)`, result: Math.round(r.mReel * 100) / 100 },
      { formula: `E${curR}-J${curR}`, result: Math.round(r.solde * 1000) / 1000 },
      { formula: `IF(F${curR}>0,K${curR}/F${curR},0)`, result: r.pct / 100 },
      { formula: `K${curR}-F${curR}`, result: Math.round(r.ecart * 100) / 100 },
    ];

    vals.forEach((v, cIdx) => {
      const col = cIdx + 1;
      const cell = row.getCell(col);
      cell.value = v as ExcelJS.CellValue;
      cell.border = CELL_BORDERS;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

      let fontColor = 'FF0F172A';
      if (col === 12 && r.solde < 0) fontColor = 'FFB45309';
      if (col === 13 && r.pct > 100) fontColor = 'FFB45309';
      if (col === 14 && r.ecart > 0) fontColor = 'FFDC2626';
      if (col === 14 && r.ecart < 0) fontColor = 'FF047857';

      cell.font = {
        name: 'Arial',
        size: 9,
        bold: col === 1 || col === 11 || col === 14,
        color: { argb: fontColor },
      };
      cell.alignment = {
        horizontal: col === 1 || col === 3 ? 'center' : col >= 4 ? 'right' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      if (col === 4 || col === 6 || col === 9 || col === 11 || col === 14) {
        cell.numFmt = FMT_EUR;
      } else if (col === 5 || col === 7 || col === 8 || col === 10 || col === 12) {
        cell.numFmt = FMT_QTE;
      } else if (col === 13) {
        cell.numFmt = FMT_PCT;
      }
    });

    curR++;
  });

  const dEnd = curR - 1;
  const totEcart = Math.round((totReel - totBudget) * 100) / 100;
  const pctTot = totBudget > 0 ? totReel / totBudget : 0;

  const totRow = ws.getRow(curR);
  totRow.height = 22;
  ws.mergeCells(curR, 1, curR, 5);
  totRow.getCell(1).value = `TOTAUX (${rowsData.length} poste${rowsData.length > 1 ? 's' : ''})`;
  totRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

  totRow.getCell(6).value =
    dEnd >= dStart ? { formula: `SUM(F${dStart}:F${dEnd})`, result: totBudget } : 0;
  totRow.getCell(6).numFmt = FMT_EUR;
  totRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

  totRow.getCell(9).value =
    dEnd >= dStart ? { formula: `SUM(I${dStart}:I${dEnd})`, result: totEA } : 0;
  totRow.getCell(9).numFmt = FMT_EUR;
  totRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

  totRow.getCell(11).value =
    dEnd >= dStart ? { formula: `SUM(K${dStart}:K${dEnd})`, result: totReel } : 0;
  totRow.getCell(11).numFmt = FMT_EUR;
  totRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };

  totRow.getCell(13).value =
    dEnd >= dStart
      ? { formula: `IF(F${curR}>0,K${curR}/F${curR},0)`, result: pctTot }
      : 0;
  totRow.getCell(13).numFmt = FMT_PCT;
  totRow.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };

  totRow.getCell(14).value =
    dEnd >= dStart ? { formula: `K${curR}-F${curR}`, result: totEcart } : 0;
  totRow.getCell(14).numFmt = FMT_EUR;
  totRow.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };

  for (let cc = 1; cc <= 14; cc++) {
    const c = totRow.getCell(cc);
    c.border = TOTAL_BORDERS;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.font = {
      name: 'Arial',
      size: 9.5,
      bold: true,
      color: {
        argb:
          cc === 14 && totEcart > 0
            ? 'FFDC2626'
            : cc === 14 && totEcart < 0
            ? 'FF047857'
            : 'FF0F172A',
      },
    };
  }

  await downloadExcelWorkbook(
    wb,
    `${appData.nomProjet || 'Chantier'}_Cumul_Concordance.xlsx`
  );
}

// ─── 5. EXPORT FEUILLE DE DÉLAIS (CANVAS OFFICIEL INASEP + FORMULES) ────────
export async function exportFeuilleDelaisExcel(appData: ProjectData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectController - F.Pirquin - INASEP';
  wb.created = new Date();

  const state = calculerEtatDelai(appData);
  const dl = state.dl;
  const info = appData.infosAdministratives || {};
  const dl_base = Number(dl.base) || 0;
  const dl_unite = dl.unite || 'JO';
  const dl_os = dl.os || '';

  const fmtDate = (s: string): string => {
    if (!s) return '—';
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  };

  const thinSide: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: 'FF000000' },
  };
  const allThinBorders: Partial<ExcelJS.Borders> = {
    top: thinSide,
    left: thinSide,
    bottom: thinSide,
    right: thinSide,
  };

  // ── Feuille 1 : Canvas officiel INASEP avec formules ──
  const ws = wb.addWorksheet('Feuille_Delais_INASEP', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.55,
        header: 0.2,
        footer: 0.25,
      },
    },
    headerFooter: {
      oddFooter: '&L© ProjectController - F.Pirquin - INASEP&RPage &P sur &N',
    },
  });

  ws.columns = [
    { width: 15 }, // A: MOIS / ANNEE
    { width: 6.5 }, // B: J. CALENDRIER
    { width: 5.5 }, // C: SAMEDI
    { width: 6.5 }, // D: DIMANCHE
    { width: 6.5 }, // E: FERIES
    { width: 6.5 }, // F: VACANCES
    { width: 25 }, // G: INTEMPERIES DETAIL
    { width: 6.5 }, // H: INTEMPERIES TOTAL
    { width: 7 }, // I: TOTAL A DEDUIRE
    { width: 8 }, // J: TOTAL J. EMPLOYES
    { width: 21 }, // K: OBSERVATIONS
  ];

  try {
    const base64Clean = INASEP_LOGO_BASE64.replace(/^data:image\/\w+;base64,/, '');
    const imgId = wb.addImage({
      base64: base64Clean,
      extension: 'png',
    });
    ws.addImage(imgId, {
      tl: { col: 8.55, row: 0.1 },
      ext: { width: 132, height: 50 },
    });
  } catch {
    // Poursuit l'export sans bloquer si image indisponible
  }

  const adminEntries: Array<[string, string]> = [
    ['Maître d’ouvrage :', info.mo || 'I.N.A.S.E.P.'],
    ['Auteur de projet :', info.auteur || 'I.N.A.S.E.P.'],
    ['Travaux de :', info.intitule || appData.nomProjet || ''],
    ['Entrepreneur :', info.entrepreneur || ''],
    ['N° de marché :', info.marche || ''],
    ['Lieu des travaux :', info.lieu || ''],
  ];

  adminEntries.forEach(([lbl, val], i) => {
    const rIdx = i + 1;
    const row = ws.getRow(rIdx);
    row.height = 15.5;
    ws.mergeCells(rIdx, 1, rIdx, 2);
    ws.mergeCells(rIdx, 3, rIdx, 7);
    const cLbl = row.getCell(1);
    cLbl.value = lbl;
    cLbl.font = { name: 'Arial', size: 9, bold: false, color: { argb: 'FF000000' } };
    cLbl.alignment = { vertical: 'middle', horizontal: 'left' };

    const cVal = row.getCell(3);
    cVal.value = val;
    cVal.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
    cVal.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });

  ws.mergeCells('H4:K4');
  const orgName = ws.getCell('H4');
  orgName.value = 'Intercommunale Namuroise de Services Publics';
  orgName.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF0B4499' } };
  orgName.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells('H5:K5');
  const orgAddr = ws.getCell('H5');
  orgAddr.value = 'S.C.R.L – Association de Communes | Rue des Viaux 1b | 5100 Naninne';
  orgAddr.font = { name: 'Arial', size: 6.5, color: { argb: 'FF0B4499' } };
  orgAddr.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells('H6:K6');
  const orgTel = ws.getCell('H6');
  orgTel.value = 'Tél. : 081 40 75 11 | Fax : 081 40 75 75 | www.inasep.be';
  orgTel.font = { name: 'Arial', size: 6.5, color: { argb: 'FF0B4499' } };
  orgTel.alignment = { horizontal: 'right', vertical: 'middle' };

  for (let c = 1; c <= 11; c++) {
    ws.getRow(6).getCell(c).border = { bottom: thinSide };
  }

  let curRow = 8;
  ws.mergeCells(curRow, 1, curRow, 11);
  const titleCell = ws.getCell(curRow, 1);
  titleCell.value = 'CALCUL DU DÉLAI D’EXÉCUTION';
  titleCell.font = { name: 'Verdana', size: 13, bold: true, color: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(curRow).height = 22;
  curRow += 2;

  const appendDlRow = (
    label: string,
    value: string | number,
    boldVal = false,
    numFmt?: string
  ): number => {
    const rowIdx = curRow;
    const r = ws.getRow(rowIdx);
    r.height = 14.5;
    ws.mergeCells(rowIdx, 1, rowIdx, 3);
    ws.mergeCells(rowIdx, 4, rowIdx, 11);
    const cl = r.getCell(1);
    cl.value = label;
    cl.font = { name: 'Arial', size: 9, color: { argb: 'FF000000' } };
    cl.alignment = { horizontal: 'right', vertical: 'middle' };

    const cv = r.getCell(4);
    cv.value = value;
    cv.font = { name: 'Arial', size: 9, bold: boldVal, color: { argb: 'FF000000' } };
    cv.alignment = { horizontal: 'left', vertical: 'middle' };
    if (numFmt) {
      cv.numFmt = numFmt;
    }
    curRow++;
    return rowIdx;
  };

  // Valeur numérique réelle avec format "0 JO" / "0 JC" pour permettre les formules de Délai restant
  const dlExecRow = appendDlRow(
    'Délai d’exécution :',
    dl_base,
    false,
    dl_unite === 'JC' ? '0" JC"' : '0" JO"'
  );

  const complGroup = { JO: 0, JC: 0 };
  (dl.delaisCompl || []).forEach((dc) => {
    const v = Number(dc.duree ?? dc.valeur) || 0;
    const u = dc.unite === 'JC' ? 'JC' : 'JO';
    complGroup[u] += v;
  });

  let prolJoRow: number | null = null;
  let prolJcRow: number | null = null;
  let hasProlLbl = false;
  if (complGroup.JO > 0) {
    prolJoRow = appendDlRow('Prolongation(s) :', complGroup.JO, true, '+0" JO"');
    hasProlLbl = true;
  }
  if (complGroup.JC > 0) {
    prolJcRow = appendDlRow(hasProlLbl ? '' : 'Prolongation(s) :', complGroup.JC, true, '+0" JC"');
  }

  appendDlRow('Ordre de commencement :', fmtDate(dl_os));

  const listeAr = dl.arrets || [];
  if (listeAr.length > 0) {
    listeAr.forEach((a, i) => {
      appendDlRow(i === 0 ? 'Suspension délai :' : '', `${i + 1}) ${fmtDate(a.dateDebut)}`);
    });
    listeAr.forEach((a, i) => {
      appendDlRow(i === 0 ? 'Reprise délai :' : '', `${i + 1}) ${fmtDate(a.dateReprise || '')}`);
    });
  }

  curRow += 1;

  // En-tête du tableau (2 lignes)
  const h1 = curRow;
  const h2 = curRow + 1;
  ws.getRow(h1).height = 76;
  ws.getRow(h2).height = 16;

  ws.mergeCells(h1, 1, h2, 1);
  ws.mergeCells(h1, 2, h2, 2);
  ws.mergeCells(h1, 3, h2, 3);
  ws.mergeCells(h1, 4, h2, 4);
  ws.mergeCells(h1, 5, h2, 5);
  ws.mergeCells(h1, 6, h2, 6);
  ws.mergeCells(h1, 7, h1, 8);
  ws.mergeCells(h1, 9, h2, 9);
  ws.mergeCells(h1, 10, h2, 10);
  ws.mergeCells(h1, 11, h2, 11);

  const headerSpecs: Array<{ col: number; row: number; text: string; rot?: boolean }> = [
    { col: 1, row: h1, text: 'MOIS\nANNÉE' },
    { col: 2, row: h1, text: 'NOMBRE DE\nJOURS CALENDRIER', rot: true },
    { col: 3, row: h1, text: 'NOMBRE DE\nSAMEDI', rot: true },
    { col: 4, row: h1, text: 'NOMBRE DE\nDIMANCHE', rot: true },
    { col: 5, row: h1, text: 'NOMBRE DE\nJOURS FÉRIÉS', rot: true },
    { col: 6, row: h1, text: 'NOMBRE DE JOURS\nVACANCES ANNUELLES', rot: true },
    { col: 7, row: h1, text: 'NOMBRE DE JOURS D’INTEMPÉRIES' },
    { col: 7, row: h2, text: 'DÉTAIL' },
    { col: 8, row: h2, text: 'TOTAL' },
    { col: 9, row: h1, text: 'NOMBRE TOTAL\nJ. À DÉDUIRE', rot: true },
    { col: 10, row: h1, text: 'NOMBRE TOTAL\nJ. EMPLOYÉS', rot: true },
    { col: 11, row: h1, text: 'SUSPENSIONS\nREPRISES\nOBSERVATIONS' },
  ];

  headerSpecs.forEach(({ col, row, text, rot }) => {
    const cell = ws.getCell(row, col);
    cell.value = text;
    cell.font = { name: 'Arial', size: 7, bold: false, color: { argb: 'FF000000' } };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      textRotation: rot ? 90 : 0,
    };
  });

  for (let rr = h1; rr <= h2; rr++) {
    for (let cc = 1; cc <= 11; cc++) {
      ws.getCell(rr, cc).border = allThinBorders;
    }
  }

  ws.pageSetup.printTitlesRow = `${h1}:${h2}`;
  curRow = h2 + 1;

  // Lignes annuelles et mensuelles avec formules I = SUM(C:F)+H et J = B-I
  const dataStartRow = curRow;
  let prevY = -1;
  const moisData = state.rows;

  moisData.forEach((r) => {
    if (r.y !== prevY) {
      prevY = r.y;
      ws.mergeCells(curRow, 1, curRow, 11);
      const yrRow = ws.getRow(curRow);
      yrRow.height = 15;
      const cYr = yrRow.getCell(1);
      cYr.value = r.y;
      cYr.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
      cYr.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let cc = 1; cc <= 11; cc++) {
        yrRow.getCell(cc).border = allThinBorders;
      }
      curRow++;
    }

    const estVide = r.nbJ === 0;
    const obsParts: string[] = [];
    if (r.eaLabel) obsParts.push(r.eaLabel);
    if (r.nMes > 0) obsParts.push(`MES : ${r.nMes} j`);
    const obs = obsParts.join('\n');
    const detailStr = estVide ? '' : r.intDetail || '';
    const detailLines = detailStr ? Math.ceil(detailStr.length / 26) : 1;
    const obsLines =
      obsParts.length > 0
        ? obsParts.reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / 17)), 0)
        : 1;
    const lineCount = Math.max(2, detailLines, obsLines);

    const row = ws.getRow(curRow);
    row.height = Math.max(24, lineCount * 11);

    const sumDed = r.nSam + r.nDim + r.nFer + r.nCon + r.nInt;
    const cellDedVal: ExcelJS.CellValue = estVide
      ? ''
      : sumDed === r.ded
      ? { formula: `SUM(C${curRow}:F${curRow})+H${curRow}`, result: r.ded }
      : r.ded;
    const cellEmpVal: ExcelJS.CellValue = estVide
      ? ''
      : { formula: `B${curRow}-I${curRow}`, result: r.emp };

    const vals: ExcelJS.CellValue[] = [
      `${MOIS_FR[r.m]}\n${r.y}`,
      estVide ? '' : r.nbJ,
      estVide ? '' : r.nSam,
      estVide ? '' : r.nDim,
      estVide ? '' : r.nFer,
      estVide ? '' : r.nCon,
      detailStr,
      estVide ? '' : r.nInt,
      cellDedVal,
      cellEmpVal,
      obs,
    ];

    vals.forEach((val, idxCol) => {
      const colNum = idxCol + 1;
      const cell = row.getCell(colNum);
      cell.value = val;
      cell.border = allThinBorders;
      const isBold = colNum === 9 || (colNum === 10 && !estVide && r.emp > 0);
      cell.font = {
        name: 'Arial',
        size: colNum === 7 ? 7 : colNum === 11 ? 8 : 8.5,
        bold: isBold,
        color: { argb: 'FF000000' },
      };
      cell.alignment = {
        horizontal: colNum === 11 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });

    curRow++;
  });

  const dataEndRow = curRow - 1;
  const totRowNum = curRow;
  const totRow = ws.getRow(totRowNum);
  totRow.height = 17.5;
  const hasDataRows = dataEndRow >= dataStartRow;

  const exactTotals: Record<number, number> = {
    2: moisData.reduce((s, r) => s + r.nbJ, 0),
    3: moisData.reduce((s, r) => s + r.nSam, 0),
    4: moisData.reduce((s, r) => s + r.nDim, 0),
    5: moisData.reduce((s, r) => s + r.nFer, 0),
    6: moisData.reduce((s, r) => s + r.nCon, 0),
    8: moisData.reduce((s, r) => s + r.nInt, 0),
    9: moisData.reduce((s, r) => s + r.ded, 0),
    10: moisData.reduce((s, r) => s + r.emp, 0),
  };

  const colLetters = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
  for (let cc = 1; cc <= 11; cc++) {
    const cell = totRow.getCell(cc);
    cell.border = allThinBorders;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };

    if (cc === 1) {
      cell.value = 'TOTAUX';
    } else if (cc === 7) {
      cell.value = '—';
    } else if (cc === 11) {
      cell.value = '';
    } else if (cc in exactTotals) {
      if (hasDataRows) {
        const colL = colLetters[cc];
        cell.value = {
          formula: `SUM(${colL}${dataStartRow}:${colL}${dataEndRow})`,
          result: exactTotals[cc],
        };
      } else {
        cell.value = 0;
      }
    }
  }
  curRow++;

  // Délai restant avec formules dynamiques lorsque l'unité est homogène (JO pur ou JC pur)
  const isPureJO = dl_unite !== 'JC' && state.groupes.JC === 0 && !prolJcRow;
  const isPureJC = dl_unite === 'JC' && state.groupes.JO === 0 && !prolJoRow;

  const restRows: Array<{ label: string; val: ExcelJS.CellValue; numVal: number; unite: string }> =
    [
      {
        label: 'Délai restant exécution :',
        val: isPureJO
          ? {
              formula: `D${dlExecRow}${prolJoRow ? `+D${prolJoRow}` : ''}-J${totRowNum}`,
              result: state.executionRestant.JO,
            }
          : state.executionRestant.JO,
        numVal: state.executionRestant.JO,
        unite: 'JO',
      },
    ];

  if (state.executionRestant.JC > 0 || state.groupes.JC > 0) {
    restRows.push({
      label: '',
      val: isPureJC
        ? {
            formula: `D${dlExecRow}${prolJcRow ? `+D${prolJcRow}` : ''}-J${totRowNum}`,
            result: state.executionRestant.JC,
          }
        : state.executionRestant.JC,
      numVal: state.executionRestant.JC,
      unite: 'JC',
    });
  }

  const mesDuree_ = Number(dl.mesDuree) || 0;
  if (mesDuree_ > 0) {
    restRows.push({
      label: 'Délai restant mise en service :',
      val: state.mesRestant,
      numVal: state.mesRestant,
      unite: dl.mesUnite || 'JC',
    });
  }

  restRows.forEach((rr, idx) => {
    const row = ws.getRow(curRow);
    row.height = 18;
    ws.mergeCells(curRow, 1, curRow, 9);

    const cl = row.getCell(1);
    cl.value = rr.label;
    cl.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF000000' } };
    cl.alignment = { horizontal: 'right', vertical: 'middle' };

    const cn = row.getCell(10);
    cn.value = rr.val;
    cn.font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: rr.numVal < 0 ? 'FFCC0000' : 'FF000000' },
    };
    cn.alignment = { horizontal: 'center', vertical: 'middle' };

    const cu = row.getCell(11);
    cu.value = rr.unite;
    cu.font = { name: 'Arial', size: 8.5, color: { argb: 'FF000000' } };
    cu.alignment = { horizontal: 'left', vertical: 'middle' };

    if (idx === 0) {
      for (let cc = 1; cc <= 11; cc++) {
        row.getCell(cc).border = { top: thinSide };
      }
    }
    curRow++;
  });

  // Signatures
  curRow += 2;
  const sigTitleRow = ws.getRow(curRow);
  sigTitleRow.height = 16;
  ws.mergeCells(curRow, 1, curRow, 5);
  ws.mergeCells(curRow, 7, curRow, 11);

  const sigLeft = sigTitleRow.getCell(1);
  sigLeft.value = 'Vu par l’entrepreneur :';
  sigLeft.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };

  const sigRight = sigTitleRow.getCell(7);
  sigRight.value = 'Dressé par le contrôleur de travaux :';
  sigRight.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };

  curRow += 2;
  const sigLineRow = ws.getRow(curRow);
  sigLineRow.height = 14;
  for (let cc = 1; cc <= 5; cc++) {
    sigLineRow.getCell(cc).border = { bottom: thinSide };
  }
  for (let cc = 7; cc <= 11; cc++) {
    sigLineRow.getCell(cc).border = { bottom: thinSide };
  }

  // ── Feuille 2 : Jours marqués (annexe soignée) ──
  const wsJm = wb.addWorksheet('Jours_Marques');
  applyStandardPageSetup(wsJm, 'portrait');
  wsJm.columns = [{ width: 18 }, { width: 16 }, { width: 26 }];
  const { nextRow: jmHeaderRow } = addStyledMetaBanner(
    wsJm,
    appData,
    'CALENDRIER — JOURS MARQUÉS',
    3
  );
  styleTableHeaderRow(wsJm, jmHeaderRow, [
    { label: 'Date (AAAA-MM-JJ)', align: 'center' },
    { label: 'Jour', align: 'center' },
    { label: 'Motif', align: 'left' },
  ]);

  const labelMap: Record<string, string> = {
    intemperie: 'Intempérie',
    ferie: 'Jour férié',
    conge: 'Congé entreprise',
  };
  const joursSem = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  let curJm = jmHeaderRow + 1;
  Object.keys(dl.joursMarques || {})
    .sort()
    .forEach((k, idx) => {
      const val = dl.joursMarques[k];
      if (!val) return;
      const d = new Date(`${k}T00:00:00`);
      const jourName = isNaN(d.getTime()) ? '' : joursSem[d.getDay()];
      const r = wsJm.getRow(curJm);
      r.height = 18;
      const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      [k, jourName, labelMap[val] || val].forEach((txt, cIdx) => {
        const c = r.getCell(cIdx + 1);
        c.value = txt;
        c.border = CELL_BORDERS;
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c.font = { name: 'Arial', size: 9, color: { argb: 'FF0F172A' } };
        c.alignment = { horizontal: cIdx < 2 ? 'center' : 'left', vertical: 'middle' };
      });
      curJm++;
    });

  await downloadExcelWorkbook(
    wb,
    `${appData.nomProjet || 'Chantier'}_Feuille_Delais_INASEP.xlsx`
  );
}
