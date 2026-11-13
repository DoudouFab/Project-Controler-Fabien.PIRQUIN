import * as XLSX from 'xlsx';
import {
  Avenant,
  CalcQteResult,
  CarnetLineItem,
  DelaiMoisRow,
  EtatDelai,
  PosteMarche,
  ProjectData,
  TronconEgout,
} from '../types/project';
import { LIT_POSE, RECOUVREMENT } from '../constants/inasep';

export const fmt = (v: number, d = 2): string =>
  isFinite(v)
    ? (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('fr-FR', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })
    : '0,00';

// Montant d'une ligne (qté × PU) arrondi au centime — convention des états d'avancement
export const mnt = (q: number, pu: number): number => {
  const v = (q || 0) * (pu || 0);
  return isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

export const NRM = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Évaluation sécurisée d'expressions arithmétiques simples (+, -, *, /, parenthèses)
 * Accepte le signe '=' en préfixe et la virgule ou le point comme séparateur décimal.
 */
export function evalCalc(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('=')) s = s.slice(1).trim();
  s = s.replace(/,/g, '.').replace(/\s+/g, '');
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;

  let pos = 0;
  const peek = () => s[pos];
  const consume = () => s[pos++];

  function parseExpr(): number {
    let val = parseTerm();
    while (pos < s.length && (peek() === '+' || peek() === '-')) {
      const op = consume();
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (pos < s.length && (peek() === '*' || peek() === '/')) {
      const op = consume();
      const right = parseFactor();
      if (op === '/') {
        if (right === 0) return NaN;
        val = val / right;
      } else {
        val = val * right;
      }
    }
    return val;
  }

  function parseFactor(): number {
    if (peek() === '+') {
      consume();
      return parseFactor();
    }
    if (peek() === '-') {
      consume();
      return -parseFactor();
    }
    if (peek() === '(') {
      consume();
      const val = parseExpr();
      if (peek() !== ')') return NaN;
      consume();
      return val;
    }
    const start = pos;
    let dots = 0;
    while (pos < s.length && ((peek() >= '0' && peek() <= '9') || peek() === '.')) {
      if (peek() === '.') dots++;
      if (dots > 1) return NaN;
      pos++;
    }
    if (start === pos) return NaN;
    return parseFloat(s.slice(start, pos));
  }

  const result = parseExpr();
  if (pos !== s.length || !isFinite(result)) return null;
  return result;
}

export function genererStructureVierge(): ProjectData {
  return {
    nomProjet: 'Nouveau_Chantier_Vierge',
    infosAdministratives: {
      intitule: '',
      mo: '',
      auteur: '',
      entrepreneur: '',
      marche: '',
      lieu: '',
      controleur: '',
    },
    marche3P: [],
    avenants: [],
    tronconsEgout: [],
    compteurTroncons: 0,
    ordreTroncons: 0,
    carnetMesurage: {
      lignesManuelles: [],
      statutsLignes: {},
      overrides: {},
      cvAutoGeneres: [],
    },
    historiqueEA: [],
    delais: {
      os: '',
      base: 60,
      unite: 'JO',
      finCalendrier: '',
      joursMarques: {},
      delaisCompl: [],
      arrets: [],
      mesDuree: 0,
      mesUnite: 'JO',
      dateMes: '',
    },
    configVoirie: { parTroncon: {} },
    configDemolition: { parTroncon: {} },
  };
}

export function srcP(appData: ProjectData): PosteMarche[] {
  return [...(appData.marche3P || []), ...(appData.avenants || [])];
}

export function estCvOuDo(nom?: string | null): boolean {
  return Boolean(nom && /^(cv|do)/i.test(String(nom).trim()));
}

export function estCV(nom?: string | null): boolean {
  return Boolean(nom && /^cv/i.test(String(nom).trim()));
}

export function normCV(nom?: string | null): string {
  return String(nom || '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function largeurTheo(dn: number, diamExt: number): number {
  const dExt = (diamExt || dn || 0) / 1000;
  if (!dn) return 0.7;
  if (dn <= 225) return Math.max(0.7, dExt + 0.4 + 2 * 0.15);
  if (dn <= 350) return Math.max(0.7, dExt + 0.5 + 2 * 0.15);
  if (dn <= 700) return Math.max(0.7, dExt + 0.7 + 2 * 0.15);
  return Math.max(0.7, dExt + 0.85 + 2 * 0.15);
}

export function largeurEff(t: TronconEgout): { v: number; f: boolean } {
  if (t.lt_force && t.lt_force > 0) return { v: t.lt_force, f: true };
  return { v: largeurTheo(t.dn, t.diamExt), f: false };
}

export function calcQte(t: TronconEgout | null | undefined): CalcQteResult {
  if (!t) {
    return {
      Wt: 0,
      isForce: false,
      Hm: 0,
      nbCvDo: 0,
      dedAmo: 0,
      dedAva: 0,
      longPose: 0,
      dM: 0,
      v_fouille: 0,
      v_enrob_rect: 0,
      H_enrob: 0,
      H_remb: 0,
      v_remblai: 0,
      qtChaux: 0,
      v_fond: 0,
      v_cv: 0,
      v_cv_amo: 0,
      v_cv_ava: 0,
      isRemblaiApport: false,
      v_exced: 0,
      v_roch: 0,
      v_comp: 0,
      v_remp: 0,
      v_d9000: 0,
      v_sousfond: 0,
      v_fondVoirie: 0,
      v_souscouche: 0,
      v_coucheRoul: 0,
      epProj: 0,
      epExist: 0,
      diffCoffre: 0,
    };
  }
  const long = !t.long || isNaN(t.long) ? 0 : t.long;
  const p_amo = !t.p_amo || isNaN(t.p_amo) ? 0 : t.p_amo;
  const p_ava = !t.p_ava || isNaN(t.p_ava) ? 0 : t.p_ava;
  const dn = !t.dn || isNaN(t.dn) ? 0 : t.dn;
  const diamExt = !t.diamExt || isNaN(t.diamExt) ? 0 : t.diamExt;

  const Hm = (p_amo + p_ava) / 2;
  const lg = largeurEff(t);
  const Wt = lg.v;

  const dedAmo = estCvOuDo(t.de) && t.cvAmo && t.cvAmo.dint > 0 ? t.cvAmo.dint / 2 : 0;
  const dedAva = estCvOuDo(t.a) && t.cvAva && t.cvAva.dint > 0 ? t.cvAva.dint / 2 : 0;
  const nbCvDo = (dedAmo > 0 ? 1 : 0) + (dedAva > 0 ? 1 : 0);
  const longPose = Math.max(0, long - dedAmo - dedAva);

  const dM = (diamExt || dn || 0) / 1000;
  const v_fouille = long * Wt * Hm;

  const H_enrob = dM + LIT_POSE + RECOUVREMENT;
  const v_enrob_rect = H_enrob * Wt * longPose;

  const calcVolCV = (cvData: { dint: number; h: number } | undefined, nom: string) => {
    if (!estCvOuDo(nom)) return 0;
    if (!cvData || !cvData.dint || !cvData.h) return 0;
    const r = cvData.dint / 2;
    return Math.PI * r * r * cvData.h * 0.5;
  };
  const v_cv_amo = calcVolCV(t.cvAmo, t.de);
  const v_cv_ava = calcVolCV(t.cvAva, t.a);
  const v_cv = v_cv_amo + v_cv_ava;

  const epExist = t.epExist || 0;
  const epProj = (t.sf || 0) + (t.fond || 0) + (t.rev || 0);
  const diffCoffre = (epProj - epExist) * long * Wt;

  const H_remb = Math.max(0, Hm - epProj - (dn + (diamExt - dn) / 2 + 200) / 1000);

  const isTN =
    (t.remblaiType || '').toLowerCase().includes('terrain naturel') ||
    (t.remblaiType || '').toLowerCase() === 'tn';
  const v_remblai = isTN ? 0 : H_remb * Wt * long;

  const isCh = (t.remblaiType || '').toLowerCase().includes('chaul');
  const qtChaux = isCh && t.chauxPourcent > 0 ? v_remblai * 1.8 * (t.chauxPourcent / 100) : 0;

  const v_fond = ((t.sf || 0) + (t.fond || 0)) * Wt * long;

  const isRemblaiApport =
    !isTN &&
    ((t.remblaiType || '').toLowerCase().includes('apport') ||
      (t.remblaiType || '').toLowerCase().includes('béton') ||
      (t.remblaiType || '').toLowerCase().includes('beton') ||
      (t.remblaiType || '').toLowerCase().includes('sable') ||
      (t.remblaiType || '').toLowerCase().includes('empierrement'));

  const v_exced = Math.max(
    0,
    v_enrob_rect + v_cv + (isRemblaiApport ? v_remblai : 0) + diffCoffre
  );

  const v_roch = t.rocheux ? t.rocheux.l * Wt * t.rocheux.p : 0;
  const v_comp = t.compact ? t.compact.l * Wt * t.compact.p : 0;
  const v_remp = t.remplacement ? t.remplacement.l * Wt * t.remplacement.p : 0;

  const milieuV = (t.milieu || '').toUpperCase();
  let v_sousfond = 0,
    v_fondVoirie = 0,
    v_souscouche = 0,
    v_coucheRoul = 0;
  if (milieuV === 'VC') {
    v_sousfond = Wt * long;
    v_fondVoirie = v_sousfond;
    v_souscouche = (Wt + 2 * 0.2) * long;
    v_coucheRoul = v_souscouche;
  } else if (milieuV === 'VE') {
    v_sousfond = Wt * long;
    v_fondVoirie = (Wt + 2 * 0.2) * long;
    v_souscouche = (Wt + 2 * 0.4) * long;
    v_coucheRoul = v_souscouche;
  }

  const v_d9000 = v_exced + v_remp;

  return {
    Wt,
    isForce: lg.f,
    Hm,
    nbCvDo,
    dedAmo,
    dedAva,
    longPose,
    dM,
    v_fouille,
    v_enrob_rect,
    H_enrob,
    H_remb,
    v_remblai,
    qtChaux,
    v_fond,
    v_cv,
    v_cv_amo,
    v_cv_ava,
    isRemblaiApport,
    v_exced,
    v_roch,
    v_comp,
    v_remp,
    v_d9000,
    v_sousfond,
    v_fondVoirie,
    v_souscouche,
    v_coucheRoul,
    epProj,
    epExist,
    diffCoffre,
  };
}

// ─── RECHERCHE AUTOMATIQUE DES POSTES ───────────────────────────────────────

export function trouverPosteTerrassement(
  appData: ProjectData,
  _milieu: string,
  tranche: string,
  dn: number
): PosteMarche | null {
  if (!appData.marche3P.length) return null;
  let pMin: number | null = null;
  let pMax: number | null = null;
  if (tranche && tranche.includes('-')) {
    const pts = tranche.split('-').map(parseFloat);
    pMin = pts[0];
    pMax = pts[1];
  }

  const estTerrassementBase = (p: PosteMarche) => {
    const d = NRM(p.desc);
    if (!d.includes('terrassement')) return false;
    if (!(d.includes('canalisation') || d.includes('cv') || d.includes('appareil'))) return false;
    if (!d.includes('profondeur') && !d.includes('pmr')) return false;
    if (d.includes('divers') || d.includes('supplement') || d.includes('excedentaire')) return false;
    return true;
  };

  const matchDN = (p: PosteMarche) => {
    if (!dn) return true;
    const d = NRM(p.desc);
    const mLE = d.match(/dn\s*<=\s*(\d+)/);
    const mEQ = d.match(/dn\s*=\s*(\d+)/);
    if (mEQ) return parseInt(mEQ[1], 10) === dn;
    if (mLE) return dn <= parseInt(mLE[1], 10);
    return true;
  };

  const matchPMR = (p: PosteMarche) => {
    if (pMin === null || pMax === null) return true;
    const d = NRM(p.desc);
    const bornes = [...d.matchAll(/(\d+(?:[.,]\d+)?)\s*m?\s*<\s*pmr\s*<=\s*(\d+(?:[.,]\d+)?)/g)];
    if (bornes.length > 0) {
      const bMin = parseFloat(bornes[0][1].replace(',', '.'));
      const bMax = parseFloat(bornes[0][2].replace(',', '.'));
      const Hm = (pMin + pMax) / 2;
      return Hm > bMin && Hm <= bMax;
    }
    const uniq = d.match(/pmr\s*<=\s*(\d+(?:[.,]\d+)?)/);
    if (uniq) return pMin === 0 && pMax <= parseFloat(uniq[1].replace(',', '.'));
    return true;
  };

  return (
    appData.marche3P.find((p) => estTerrassementBase(p) && matchDN(p) && matchPMR(p)) ||
    appData.marche3P.find((p) => estTerrassementBase(p) && matchPMR(p)) ||
    appData.marche3P.find((p) => estTerrassementBase(p) && matchDN(p)) ||
    appData.marche3P.find((p) => estTerrassementBase(p)) ||
    null
  );
}

export function trouverPosteTuyau(
  appData: ProjectData,
  dn: number,
  natureTuyau?: string
): PosteMarche | null {
  if (!dn) return null;
  const MATERIAUX: Record<string, string[]> = {
    BNA: ['beton non arme', 'bna'],
    BA: ['beton arme'],
    Fonte: ['fonte ductile', 'fonte grise', 'fonte', 'ductile'],
    PVC: ['pvc', 'chlorure de polyvinyle'],
    PP: ['polypropylene', 'polypropy'],
    PEHD: ['polyethylene', 'pehd', 'pe hd'],
    'Grès': ['gres'],
    Gres: ['gres'],
  };

  const natNRM = natureTuyau ? NRM(natureTuyau) : null;
  let matPatterns: string[] | null = null;
  if (natureTuyau && natNRM) {
    const keyFound = Object.keys(MATERIAUX).find((k) => NRM(k) === natNRM);
    matPatterns = keyFound ? MATERIAUX[keyFound] : [natNRM];
  }

  const exclu = (d: string) =>
    d.includes('demolition') ||
    d.includes('raccord') ||
    d.includes('drainage') ||
    d.includes('enrobage') ||
    d.includes('joint') ||
    d.includes('terrassement') ||
    d.includes('fouille') ||
    d.includes('deblai') ||
    d.includes('inspection') ||
    d.includes('camera') ||
    d.includes('autotract') ||
    d.includes('visuel');

  const matchDN = (d: string) => {
    const mDE = d.match(/de\s*=\s*(\d+)/);
    const mDN = d.match(/dn\s*=\s*(\d+)/);
    const mLE = d.match(/dn\s*<=\s*(\d+)/);
    if (mDE && parseInt(mDE[1], 10) === dn) return true;
    if (mDN && parseInt(mDN[1], 10) === dn) return true;
    if (mLE && dn <= parseInt(mLE[1], 10)) return true;
    return false;
  };

  if (matPatterns) {
    const found = appData.marche3P.find((p) => {
      const d = NRM(p.desc);
      if (!d.includes('tuyau') && !d.includes('canalisation')) return false;
      if (exclu(d) || !matchDN(d)) return false;
      return matPatterns!.some((pat) => d.includes(pat));
    });
    if (found) return found;
  }

  return (
    appData.marche3P.find((p) => {
      const d = NRM(p.desc);
      if (!d.includes('tuyau') && !d.includes('canalisation')) return false;
      if (exclu(d)) return false;
      return matchDN(d);
    }) || null
  );
}

export function trouverPosteEnrobage(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('enrobage') && d.includes('canalisation');
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('enrobage') && (d.includes('conduite') || d.includes('tuyau'));
    }) ||
    null
  );
}

export function trouverPosteDeblaiExcedentaire(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('supplement') && d.includes('excedentaire') && !d.includes('ouvrage');
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('deblai') && d.includes('excedentaire') && !d.includes('demolition') && !d.includes('ouvrage');
    }) ||
    null
  );
}

export function trouverPosteRocheux(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('supplement') && d.includes('rocheux') && !d.includes('ouvrage');
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('rocheux') && d.includes('deblai') && !d.includes('ouvrage') && !d.includes('demolition');
    }) ||
    null
  );
}

export function trouverPosteCompact(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('supplement') && d.includes('compact') && !d.includes('ouvrage');
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('compact') && d.includes('deblai') && !d.includes('ouvrage') && !d.includes('demolition');
    }) ||
    null
  );
}

export function trouverPosteRemplacementSol(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('remplacement') && d.includes('sol') && d.includes('impropre');
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('remplacement') && d.includes('sol') && !d.includes('gazon') && !d.includes('plant') && !d.includes('retroussement');
    }) ||
    null
  );
}

export function trouverPosteRemblaiSpecial(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('remblai') && d.includes('special') && (d.includes('fondation') || d.includes('beton'));
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('remblai') && d.includes('supplement') && !d.includes('gazon') && !d.includes('plant') && !d.includes('retroussement');
    }) ||
    null
  );
}

export function trouverPosteD9000(appData: ProjectData, type: string): PosteMarche | null {
  if (!type) return null;
  const list = srcP(appData);
  const TYPE_PATTERNS: Record<string, RegExp[]> = {
    'type i': [/type\s+i(?!i|v)/, /usage\s+i(?!i|v)/],
    'type ii': [/type\s+ii(?!i)/, /usage\s+ii(?!i)/],
    'type iii': [/type\s+iii/, /usage\s+iii/],
    'type iv': [/type\s+iv/, /usage\s+iv/],
    'type v': [/type\s+v(?![i])/, /usage\s+v(?![i])/],
  };
  const tNRM = NRM(type);
  const patterns = TYPE_PATTERNS[tNRM];

  const isCETTerre = (d: string) =>
    (d.includes('site autorise') && d.includes('terres')) ||
    (d.includes('mise en site') && d.includes('terres')) ||
    (d.includes('cta') && d.includes('terres')) ||
    (d.includes('centre de traitement') && d.includes('terres'));

  if (patterns) {
    const found = list.find((p) => {
      const d = NRM(p.desc);
      if (!isCETTerre(d)) return false;
      if (
        d.includes('pierre') ||
        d.includes('arbre') ||
        d.includes('enrobe') ||
        d.includes('beton') ||
        d.includes('metal') ||
        d.includes('maconnerie') ||
        d.includes('demolition')
      ) {
        return false;
      }
      return patterns.some((rx) => rx.test(d));
    });
    if (found) return found;
  }

  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return (
        isCETTerre(d) &&
        !d.includes('pierre') &&
        !d.includes('arbre') &&
        !d.includes('enrobe') &&
        !d.includes('beton') &&
        !d.includes('metal') &&
        !d.includes('maconnerie')
      );
    }) || null
  );
}

export function trouverPosteGestionTerres(appData: ProjectData): PosteMarche | null {
  return (
    srcP(appData).find((p) => {
      const d = NRM(p.desc);
      return (
        (d.includes('gestion') && d.includes('terres')) ||
        (d.includes('stockage') && d.includes('terres')) ||
        (d.includes('gestion') && (d.includes('excavee') || d.includes('excave')))
      );
    }) || null
  );
}

export function trouverPosteCriblage(appData: ProjectData): PosteMarche | null {
  return (
    srcP(appData).find((p) => {
      const d = NRM(p.desc);
      return d.includes('criblage') && d.includes('terres');
    }) || null
  );
}

export function trouverPosteInspectionCamera(appData: ProjectData): PosteMarche | null {
  return (
    srcP(appData).find((p) => {
      const d = NRM(p.desc);
      return d.includes('inspection') && (d.includes('camera') || d.includes('autotract'));
    }) || null
  );
}

export function trouverPosteCETDyn(appData: ProjectData, t: TronconEgout): PosteMarche | null {
  const type = t.d9000Type || '';
  const list = srcP(appData);
  const pasBitumineux = (d: string) =>
    !d.includes('bitumin') && !d.includes('enrobe') && !d.includes('fraisa') && !d.includes('hydrocarb') && !d.includes('asphalte');
  const estTerres = (d: string) =>
    d.includes('terres') ||
    (d.includes('terre ') && !d.includes('pierre') && !d.includes('arbre') && !d.includes('beton') && !d.includes('metal'));

  return (
    list.find((p) => {
      const d = NRM(p.desc);
      if (!d.includes('mise en site') && !d.includes('mise en cta') && !d.includes('mise en centre')) return false;
      if (!pasBitumineux(d)) return false;
      if (!type) return estTerres(d);
      return d.includes(NRM(type).substring(0, 6)) && pasBitumineux(d);
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return (d.includes('mise en site') || d.includes('mise en cta')) && estTerres(d) && pasBitumineux(d);
    }) ||
    null
  );
}

export function trouverPosteFondation(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return (d.includes('fondation') || d.includes('sous-fondation')) && d.includes('evacuation');
    }) ||
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('demolition') && (d.includes('fondation') || d.includes('sous-fondation'));
    }) ||
    null
  );
}

export function trouverPosteChaux(appData: ProjectData): PosteMarche | null {
  const list = srcP(appData);
  return (
    list.find((p) => {
      const d = NRM(p.desc);
      return d.includes('chaux') && (d.includes('remblai') || d.includes('traitement') || d.includes('amendement'));
    }) ||
    list.find((p) => NRM(p.desc).includes('chaux')) ||
    null
  );
}

export function estPosteDemolitionOuSciage(desc: string): boolean {
  const d = NRM(desc);
  return d.includes('demolition') || d.includes('sciage') || d.includes('fraisage');
}

export function extraireEpaisseurTheorique(desc: string): number {
  const m = String(desc || '').match(/E\s*=\s*(\d+(?:[.,]\d+)?)\s*cm/i);
  return m ? parseFloat(m[1].replace(',', '.')) / 100 : 0;
}

export function candidatsVoirie(appData: ProjectData, role: string): PosteMarche[] {
  return srcP(appData).filter((p) => {
    const d = NRM(p.desc);
    if (estPosteDemolitionOuSciage(d)) return false;
    if (role === 'sousfond') return d.includes('sous-fondation') || (d.includes('sous') && d.includes('fondation')) || d.includes('granulaire');
    if (role === 'fondvoirie') return (d.includes('fondation') && !d.includes('sous')) || d.includes('empierrement') || d.includes('beton maigre');
    if (role === 'souscouche') return d.includes('enrobe') && (d.includes('base') || d.includes('sous'));
    if (role === 'coucheroul') return (d.includes('enrobe') && d.includes('surf')) || (d.includes('revetement') && d.includes('granulat')) || d.includes('sma');
    return false;
  });
}

export function candidatsDemolition(appData: ProjectData, role: string): PosteMarche[] {
  return srcP(appData).filter((p) => {
    const d = NRM(p.desc);
    if (role === 'demolFondation') return d.includes('demolition') && d.includes('fondation') && !d.includes('sous-fondation');
    if (role === 'demolSousFondation') return d.includes('demolition') && (d.includes('sous-fondation') || (d.includes('sous') && d.includes('fondation')));
    if (role === 'sciage') return d.includes('sciage') && d.includes('revetement');
    if (role === 'fraisage') return d.includes('fraisage') && d.includes('revetement');
    if (role === 'demolRevetement') return d.includes('demolition') && d.includes('revetement') && !d.includes('fraisage');
    return false;
  });
}

export function largeurParRole(prefix: 'voirie' | 'demol', key: string, t: TronconEgout): number {
  const Wt = calcQte(t).Wt;
  const isVE = (t.milieu || '').toUpperCase() === 'VE';
  if (prefix === 'voirie') {
    if (key === 'sousfond') return Wt;
    if (key === 'fondvoirie') return isVE ? Wt + 0.4 : Wt;
    if (key === 'souscouche' || key === 'coucheroul') return isVE ? Wt + 0.8 : Wt + 0.4;
  } else {
    if (key === 'demolSousFondation') return Wt;
    if (key === 'demolFondation') return isVE ? Wt + 0.4 : Wt;
    if (key === 'fraisage' || key === 'demolRevetement') return isVE ? Wt + 0.8 : Wt + 0.4;
  }
  return Wt;
}

export function epaisseurParDefautRole(
  prefix: 'voirie' | 'demol',
  key: string,
  t: TronconEgout,
  poste: PosteMarche | null
): number {
  if (prefix === 'voirie') {
    if (key === 'sousfond' && (t.sf || 0) > 0) return t.sf;
    if (key === 'fondvoirie' && (t.fond || 0) > 0) return t.fond;
    if ((key === 'souscouche' || key === 'coucheroul') && (t.rev || 0) > 0) return t.rev;
    const fromDesc = poste ? extraireEpaisseurTheorique(poste.desc) : 0;
    if (fromDesc > 0) return fromDesc;
    if (key === 'sousfond') return 0.3;
    if (key === 'fondvoirie') return 0.2;
    if (key === 'souscouche') return 0.06;
    if (key === 'coucheroul') return 0.04;
  } else {
    if (key === 'demolSousFondation' && (t.sf || 0) > 0) return t.sf;
    if (key === 'demolFondation' && (t.fond || 0) > 0) return t.fond;
    const fromDesc = poste ? extraireEpaisseurTheorique(poste.desc) : 0;
    if (fromDesc > 0) return fromDesc;
    if (key === 'demolSousFondation') return 0.3;
    if (key === 'demolFondation') return 0.2;
    if (key === 'demolRevetement') return 0.2;
    if (key === 'fraisage') return 0.05;
  }
  return 0.2;
}

export function analyserUnite(uRaw?: string): {
  isVol: boolean;
  isSurf: boolean;
  isLin: boolean;
  reconnu: boolean;
} {
  const u = String(uRaw || '').toLowerCase().trim();
  const isVol = u.includes('m³') || u.includes('m3');
  const isSurf = !isVol && (u.includes('m²') || u.includes('m2'));
  const isLin = !isVol && !isSurf && (u === 'm' || u.includes('ml') || u.includes('m lin'));
  return { isVol, isSurf, isLin, reconnu: isVol || isSurf || isLin };
}

// ─── PRÉ-ENCODAGE CV / DO ───────────────────────────────────────────────────

export function bornesTrancheCV(h: number): [number, number] {
  if (h <= 1) return [0, 1];
  if (h <= 2) return [1, 2];
  if (h <= 3) return [2, 3];
  if (h <= 4) return [3, 4];
  if (h <= 5) return [4, 5];
  if (h <= 6) return [5, 6];
  return [6, 7];
}

export function collecterCvUniques(appData: ProjectData): Map<string, { nom: string; h: number }> {
  const profondeurMax = new Map<string, { nom: string; h: number }>();
  const eligibles = new Set<string>();
  (appData.tronconsEgout || []).forEach((t) => {
    (
      [
        ['de', 'cvAmo'],
        ['a', 'cvAva'],
      ] as const
    ).forEach(([champ, cvChamp]) => {
      const nom = t[champ];
      const cv = t[cvChamp];
      if (!estCV(nom)) return;
      const h = cv && isFinite(cv.h) ? cv.h : 0;
      if (h <= 0) return;
      const key = normCV(nom);
      const ex = profondeurMax.get(key);
      if (!ex || h > ex.h) {
        profondeurMax.set(key, { nom: (ex && ex.nom) || String(nom).trim(), h });
      }
      if (t.fait !== false) eligibles.add(key);
    });
  });
  const map = new Map<string, { nom: string; h: number }>();
  profondeurMax.forEach((info, key) => {
    if (eligibles.has(key)) map.set(key, info);
  });
  return map;
}

export function estPosteRegardComplet(desc: string): boolean {
  const d = NRM(desc);
  const parle =
    d.includes('regard de visite') ||
    d.includes('chambre de visite') ||
    d.includes("chambre d'appareil") ||
    d.includes('chambre d appareil');
  if (!parle) return false;
  if (!d.includes('complet')) return false;
  if (d.includes('demolition') || d.includes('raccord') || d.includes('curage') || d.includes('infonet')) {
    return false;
  }
  return true;
}

export function extraireTrancheDesc(desc: string): [number, number] | null {
  const d = NRM(desc);
  const m = d.match(/(\d+(?:[.,]\d+)?)\s*m?\s*<\s*h\s*(?:<=|≤)\s*(\d+(?:[.,]\d+)?)\s*m?/i);
  if (m) return [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))];
  return null;
}

export function candidatsPourCV(appData: ProjectData, h: number): PosteMarche[] {
  const bornes = bornesTrancheCV(h);
  const all = srcP(appData);
  const parTranche = all.filter((p) => {
    if (!estPosteRegardComplet(p.desc)) return false;
    const tr = extraireTrancheDesc(p.desc);
    if (!tr) return false;
    return Math.abs(tr[0] - bornes[0]) < 0.001 && Math.abs(tr[1] - bornes[1]) < 0.001;
  });
  if (parTranche.length > 0) return parTranche;
  return all.filter((p) => estPosteRegardComplet(p.desc) && !extraireTrancheDesc(p.desc));
}

// ─── CARNET DE MESURAGE (GÉNÉRATION DES LIGNES & CORRECTION) ────────────────

export const cleLigneAuto = (ref: string, nat: string) => `auto_${ref}_${nat}`;
export const cleLigneMan = (id: string) => `manuelle_${id}`;

export function construireLignesCarnet(appData: ProjectData): CarnetLineItem[] {
  const allPostes = srcP(appData);
  const ov = appData.carnetMesurage?.overrides || {};
  const statuts = appData.carnetMesurage?.statutsLignes || {};
  const tronconsFait = (appData.tronconsEgout || []).filter((t) => t.fait !== false);

  const lines: CarnetLineItem[] = [];

  const pushWithFrozenAndCorrection = (
    cle: string,
    posteAuto: PosteMarche | null,
    unite: string,
    libPrestation: string,
    formuleTxt: string,
    libTroncon: string,
    ordreTroncon: number,
    qCalc: number,
    manuelleId?: string
  ) => {
    const ovL = ov[cle] || {};
    if (ovL._ignore && !statuts[cle]?.porteeA) return;
    const st = statuts[cle] || { porteeA: null, coche: false };

    const posteEffCourant = ovL.posteId
      ? allPostes.find((p) => p.id === ovL.posteId) || null
      : posteAuto;
    const qEffCourant =
      ovL.quantite !== undefined && ovL.quantite !== null ? ovL.quantite : qCalc;

    // Si la ligne est déjà facturée dans un EA clôturé, elle reste figée sur son snapshot
    // (sauf si déverrouillée manuellement). Si le poste ou la quantité a changé après coup,
    // on émet des lignes distinctes de correction (négative) / mise à jour.
    if (st.porteeA && !st.deverrouille) {
      const posteFrozenId = st.posteIdSnapshot ?? posteEffCourant?.id ?? null;
      const posteFrozen = posteFrozenId
        ? allPostes.find((p) => p.id === posteFrozenId) || posteEffCourant
        : posteEffCourant;
      const qFrozen = st.qteSnapshot !== undefined ? st.qteSnapshot : qEffCourant;

      lines.push({
        cle,
        posteAuto,
        posteEff: posteFrozen,
        posteId: posteFrozen ? posteFrozen.id : null,
        posteForceManuellement: Boolean(ovL.posteId),
        unite: posteFrozen?.u || unite,
        libPrestation,
        formuleTxt,
        libTroncon,
        ordreTroncon,
        qCalc,
        qEff: qFrozen,
        qForce: ovL.quantite !== undefined && ovL.quantite !== null,
        porteeA: st.porteeA,
        coche: false,
        deverrouille: false,
        annotation: ovL.annotation || '',
        formuleSupplement: ovL.formuleSupplement || '',
        manuelleId,
      });

      const currentPosteId = posteEffCourant?.id || null;
      const posteChanged =
        st.posteIdSnapshot !== undefined && currentPosteId !== st.posteIdSnapshot;

      if (posteChanged && posteFrozen) {
        // 1. Ligne négative d'annulation sur l'ancien poste
        const cleNeg = `${cle}_corr_neg`;
        if (!(ov[cleNeg] && ov[cleNeg]._ignore)) {
          const stNeg = statuts[cleNeg] || { porteeA: null, coche: false };
          const ovNeg = ov[cleNeg] || {};
          const qNeg =
            ovNeg.quantite !== undefined && ovNeg.quantite !== null ? ovNeg.quantite : -qFrozen;
          lines.push({
            cle: cleNeg,
            posteAuto: posteFrozen,
            posteEff: posteFrozen,
            posteId: posteFrozen.id,
            posteForceManuellement: false,
            unite: posteFrozen.u || unite,
            libPrestation: `Correction annulation (${libPrestation})`,
            formuleTxt: `⚠ CORRECTION (${st.porteeA} déjà facturé sur poste ${posteFrozen.id})\nAnnulation de la quantité facturée à tort : −${qFrozen.toFixed(3)} ${unite}`,
            libTroncon,
            ordreTroncon: ordreTroncon + 0.4,
            qCalc: -qFrozen,
            qEff: qNeg,
            qForce: ovNeg.quantite !== undefined && ovNeg.quantite !== null,
            porteeA: stNeg.porteeA,
            coche: Boolean(stNeg.coche),
            deverrouille: Boolean(stNeg.deverrouille),
            annotation: ovNeg.annotation || '',
            formuleSupplement: ovNeg.formuleSupplement || '',
            isCorrection: true,
            diffCorrection: qNeg,
          });
        }

        // 2. Nouvelle ligne "(mis à jour)" sur le nouveau poste avec sa pleine quantité
        const cleMaj = `${cle}_corr_maj`;
        if (!(ov[cleMaj] && ov[cleMaj]._ignore)) {
          const stMaj = statuts[cleMaj] || { porteeA: null, coche: false };
          const ovMaj = ov[cleMaj] || {};
          const qMaj =
            ovMaj.quantite !== undefined && ovMaj.quantite !== null ? ovMaj.quantite : qEffCourant;
          lines.push({
            cle: cleMaj,
            posteAuto: posteEffCourant,
            posteEff: posteEffCourant,
            posteId: currentPosteId,
            posteForceManuellement: false,
            unite: posteEffCourant?.u || unite,
            libPrestation: `${libPrestation} (mis à jour)`,
            formuleTxt: `Nouveau poste ${currentPosteId || 'N/D'} suite à modification du tronçon :\n${formuleTxt}`,
            libTroncon,
            ordreTroncon: ordreTroncon + 0.6,
            qCalc: qEffCourant,
            qEff: qMaj,
            qForce: ovMaj.quantite !== undefined && ovMaj.quantite !== null,
            porteeA: stMaj.porteeA,
            coche: Boolean(stMaj.coche),
            deverrouille: Boolean(stMaj.deverrouille),
            annotation: ovMaj.annotation || '',
            formuleSupplement: ovMaj.formuleSupplement || '',
            isUpdatedAfterEA: true,
          });
        }
      } else {
        const diff = qEffCourant - qFrozen;
        if (Math.abs(diff) > 0.0001) {
          const cleCorr = `${cle}_corr`;
          if (!(ov[cleCorr] && ov[cleCorr]._ignore)) {
            const stCorr = statuts[cleCorr] || { porteeA: null, coche: false };
            const ovCorr = ov[cleCorr] || {};
            const qCorrEff =
              ovCorr.quantite !== undefined && ovCorr.quantite !== null ? ovCorr.quantite : diff;
            lines.push({
              cle: cleCorr,
              posteAuto: posteEffCourant,
              posteEff: posteEffCourant,
              posteId: posteEffCourant ? posteEffCourant.id : null,
              posteForceManuellement: false,
              unite,
              libPrestation: `Correction (${libPrestation})`,
              formuleTxt: `⚠ CORRECTION — ${st.porteeA} déjà facturé\nNouvelle qté auto: ${qEffCourant.toFixed(3)} − Facturée: ${qFrozen.toFixed(3)} = ${diff > 0 ? '+' : ''}${diff.toFixed(3)} ${unite}`,
              libTroncon,
              ordreTroncon: ordreTroncon + 0.5,
              qCalc: diff,
              qEff: qCorrEff,
              qForce: ovCorr.quantite !== undefined && ovCorr.quantite !== null,
              porteeA: stCorr.porteeA,
              coche: Boolean(stCorr.coche),
              deverrouille: Boolean(stCorr.deverrouille),
              annotation: ovCorr.annotation || '',
              formuleSupplement: ovCorr.formuleSupplement || '',
              isCorrection: true,
              diffCorrection: qCorrEff,
            });
          }
        }
      }
      return;
    }

    lines.push({
      cle,
      posteAuto,
      posteEff: posteEffCourant,
      posteId: posteEffCourant ? posteEffCourant.id : null,
      posteForceManuellement: Boolean(ovL.posteId),
      unite,
      libPrestation,
      formuleTxt,
      libTroncon,
      ordreTroncon,
      qCalc,
      qEff: qEffCourant,
      qForce: ovL.quantite !== undefined && ovL.quantite !== null,
      porteeA: st.porteeA,
      coche: Boolean(st.coche),
      deverrouille: Boolean(st.deverrouille),
      annotation: ovL.annotation || '',
      formuleSupplement: ovL.formuleSupplement || '',
      manuelleId,
    });
  };

  tronconsFait.forEach((t, idx) => {
    const q = calcQte(t);
    const label = `${t.de} → ${t.a}`;
    const lib = `${t.ref} : ${label}`;
    let tranche = '---';
    const H = q.Hm;
    if (H <= 1) tranche = '0-1';
    else if (H <= 2) tranche = '1-2';
    else if (H <= 3) tranche = '2-3';
    else if (H <= 4) tranche = '3-4';
    else if (H <= 5) tranche = '4-5';
    else if (H <= 6) tranche = '5-6';
    else tranche = '6-7';

    const Wstr = q.isForce ? `${q.Wt.toFixed(3)}m⚡` : `${q.Wt.toFixed(3)}m`;
    const dedAmoTxt =
      q.dedAmo > 0 ? ` − ½∅amo(${(q.dedAmo * 2).toFixed(3)}m/2=${q.dedAmo.toFixed(3)}m)` : '';
    const dedAvaTxt =
      q.dedAva > 0 ? ` − ½∅ava(${(q.dedAva * 2).toFixed(3)}m/2=${q.dedAva.toFixed(3)}m)` : '';
    const cvStr =
      q.dedAmo > 0 || q.dedAva > 0 ? `${dedAmoTxt}${dedAvaTxt} = ${q.longPose.toFixed(3)}m` : '';
    const trStr =
      tranche !== '---'
        ? `PMR ∈ ]${tranche.split('-')[0]};${tranche.split('-')[1]}] m`
        : `PMR hors tranches standards (Hm=${q.Hm.toFixed(2)}m)`;

    // 1. Fouille
    const ecartStr =
      q.Wt - (t.diamExt || 0) / 1000 > 0 ? (q.Wt - (t.diamExt || 0) / 1000).toFixed(3) : '0';
    const formFouille =
      `Long. brute: ${t.long.toFixed(3)}m × W: ${Wstr} × Hm: ${q.Hm.toFixed(3)}m\n` +
      `Hm = (P.départ ${t.p_amo.toFixed(3)}m + P.arrivée ${t.p_ava.toFixed(3)}m) / 2\n` +
      `W = DiamExt(${t.diamExt}mm)/1000 + écart(${ecartStr}m) + 2×0.150m blindage\n` +
      `${trStr}, DN${t.dn}mm → Poste terrassement correspondant\n` +
      `= ${t.long.toFixed(3)} × ${q.Wt.toFixed(3)} × ${q.Hm.toFixed(3)} = ${q.v_fouille.toFixed(3)} m³`;
    const posteFoundFouille = trouverPosteTerrassement(appData, t.milieu, tranche, t.dn);
    const uniteFoundFouille = posteFoundFouille?.u?.toLowerCase().trim() || 'm³';
    const isLinFouille =
      uniteFoundFouille === 'm' || uniteFoundFouille === 'ml' || uniteFoundFouille === 'm lin';
    const qteFouille = isLinFouille ? t.long : q.v_fouille;
    const uniteFouille = isLinFouille ? 'm' : 'm³';
    const formFouilleAdapt = isLinFouille
      ? formFouille + `\n→ Poste en m linéaire (axe à axe) : L_brute = ${t.long.toFixed(3)} m`
      : formFouille;

    pushWithFrozenAndCorrection(
      cleLigneAuto(t.ref, 'fouille'),
      posteFoundFouille,
      uniteFouille,
      'Fouille / Terrassement tranchée',
      formFouilleAdapt,
      lib,
      idx * 20 + 1,
      qteFouille
    );

    // 2. Pose tuyau
    const formTuyau =
      `Long. brute: ${t.long.toFixed(3)}m${cvStr}\n` +
      (q.dedAmo > 0
        ? `Déduction départ (${t.de}) : ½ × ∅int(${(q.dedAmo * 2).toFixed(3)}m) = −${q.dedAmo.toFixed(3)}m\n`
        : estCvOuDo(t.de)
        ? `${t.de} = CV/DO mais ∅int non renseigné → déduction = 0\n`
        : '') +
      (q.dedAva > 0
        ? `Déduction arrivée  (${t.a}) : ½ × ∅int(${(q.dedAva * 2).toFixed(3)}m) = −${q.dedAva.toFixed(3)}m\n`
        : estCvOuDo(t.a)
        ? `${t.a} = CV/DO mais ∅int non renseigné → déduction = 0\n`
        : '') +
      `= ${t.long.toFixed(3)} − ${q.dedAmo.toFixed(3)} − ${q.dedAva.toFixed(3)} = ${q.longPose.toFixed(3)} m`;
    pushWithFrozenAndCorrection(
      cleLigneAuto(t.ref, 'tuyau'),
      trouverPosteTuyau(appData, t.dn, t.natureTuyau),
      'm',
      `Pose tuyau ${t.natureTuyau || ''} DN${t.dn || '?'}`,
      formTuyau,
      lib,
      idx * 20 + 2,
      q.longPose
    );

    // 3b. Inspection caméra
    if (t.insp_porter) {
      const posteInsp = trouverPosteInspectionCamera(appData);
      const qInsp = t.insp_qte !== null && isFinite(t.insp_qte) ? t.insp_qte : q.longPose;
      const formInsp = `Inspection caméra autotractée\nL_nette = ${q.longPose.toFixed(3)} m\nQté portée = ${qInsp.toFixed(3)} m`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'insp'),
        posteInsp,
        'm',
        'Inspection caméra',
        formInsp,
        lib,
        idx * 20 + 3,
        qInsp
      );
    }

    // 3. Déblais fondation / ss-fondation
    if (q.v_fond > 0) {
      const formFond =
        `Épaisseur fond. = SF(${(t.sf || 0).toFixed(3)}m) + Fond.(${(t.fond || 0).toFixed(3)}m) = ${((t.sf || 0) + (t.fond || 0)).toFixed(3)}m\n` +
        `Long. ${t.long.toFixed(3)}m × W ${q.Wt.toFixed(3)}m × ép. ${((t.sf || 0) + (t.fond || 0)).toFixed(3)}m = ${q.v_fond.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'fond'),
        trouverPosteFondation(appData),
        'm³',
        'Déblais fondation / ss-fondation',
        formFond,
        lib,
        idx * 20 + 4,
        q.v_fond
      );
    }

    // 4. Enrobage
    if (t.avecEnrobage) {
      const formEnrob =
        `H_enrob = DiamExt(${q.dM.toFixed(3)}m) + lit de pose(${LIT_POSE.toFixed(3)}m) + recouvrement(${RECOUVREMENT.toFixed(3)}m) = ${q.H_enrob.toFixed(3)}m\n` +
        `= ${q.H_enrob.toFixed(3)}m × ${q.Wt.toFixed(3)}m × ${q.longPose.toFixed(3)}m = ${q.v_enrob_rect.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'enrob'),
        trouverPosteEnrobage(appData),
        'm³',
        'Enrobage (zone rectangulaire tuyau+lit+recouvrement)',
        formEnrob,
        lib,
        idx * 20 + 5,
        q.v_enrob_rect
      );
    }

    // 5. Remblai
    if (q.v_remblai > 0) {
      const formRemb =
        `H_remblai = Hm(${q.Hm.toFixed(3)}) − epProj(${q.epProj.toFixed(3)}) − DiamExt/2(${(q.dM / 2).toFixed(3)}) − recouvrement(${RECOUVREMENT}) = ${q.H_remb.toFixed(3)}m\n` +
        `V_remblai = H(${q.H_remb.toFixed(3)}m) × Lt(${q.Wt.toFixed(3)}m) × Long.(${t.long.toFixed(3)}m) = ${q.v_remblai.toFixed(3)} m³\n` +
        `Type : ${t.remblaiType || 'TN'}`;
      const pR = t.remblaiType.toLowerCase().includes('chaul')
        ? trouverPosteChaux(appData) || trouverPosteRemblaiSpecial(appData)
        : trouverPosteRemblaiSpecial(appData);
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'remblai'),
        pR,
        'm³',
        `Remblai (${t.remblaiType || 'TN'})`,
        formRemb,
        lib,
        idx * 20 + 6,
        q.v_remblai
      );
    }

    // 6. Chaux
    if (q.qtChaux > 0) {
      const formChx =
        `Apport chaux = V_remblai(${q.v_remblai.toFixed(3)}m³) × densité(1.800 t/m³) × taux(${t.chauxPourcent}%)\n` +
        `= ${q.v_remblai.toFixed(3)} × 1.800 × ${(t.chauxPourcent / 100).toFixed(3)} = ${q.qtChaux.toFixed(3)} t`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'chaux'),
        trouverPosteChaux(appData),
        't',
        `Chaux (${t.chauxPourcent}%)`,
        formChx,
        lib,
        idx * 20 + 7,
        q.qtChaux
      );
    }

    // 7. Déblai excédentaire
    if (q.v_exced > 0) {
      const hasCvAmo = estCvOuDo(t.de) && q.v_cv_amo > 0;
      const hasCvAva = estCvOuDo(t.a) && q.v_cv_ava > 0;
      const formExc =
        `V_enrob_rect = (DiamExt(${(q.dM * 1000).toFixed(0)}mm)/1000 + lit(${LIT_POSE}m) + rec(${RECOUVREMENT}m)) × Lt(${q.Wt.toFixed(3)}m) × L_nette(${q.longPose.toFixed(3)}m) = ${q.v_enrob_rect.toFixed(3)}m³\n` +
        (hasCvAmo
          ? `V_CV départ (½ ${t.de}) = π×(∅int=${t.cvAmo?.dint || 0}m/2)² × H(${t.cvAmo?.h || 0}m) × ½ = ${q.v_cv_amo.toFixed(3)}m³\n`
          : estCvOuDo(t.de)
          ? `⚠ ${t.de} = CV/DO mais dimensions non renseignées (∅int+H) → V=0\n`
          : '') +
        (hasCvAva
          ? `V_CV arrivée  (½ ${t.a}) = π×(∅int=${t.cvAva?.dint || 0}m/2)² × H(${t.cvAva?.h || 0}m) × ½ = ${q.v_cv_ava.toFixed(3)}m³\n`
          : estCvOuDo(t.a)
          ? `⚠ ${t.a} = CV/DO mais dimensions non renseignées (∅int+H) → V=0\n`
          : '') +
        `V_cv total = ${q.v_cv.toFixed(3)}m³\n` +
        (q.isRemblaiApport
          ? `V_remblai_apport = ${q.v_remblai.toFixed(3)}m³ (${t.remblaiType} → apport extérieur évacué)\n`
          : `V_remblai = non comptabilisé dans AG (${t.remblaiType || 'TN/VC'} = réutilisé sur site)\n`) +
        `ΔCoffre = (ép.proj(${q.epProj.toFixed(3)}) − ép.exist(${q.epExist.toFixed(3)})) × Lt(${q.Wt.toFixed(3)}) × L(${t.long.toFixed(3)}) = ${q.diffCoffre.toFixed(3)}m³\n` +
        `= ${q.v_enrob_rect.toFixed(3)} + ${q.v_cv.toFixed(3)} + ${(q.isRemblaiApport ? q.v_remblai : 0).toFixed(3)} + ${q.diffCoffre.toFixed(3)} = ${q.v_exced.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'exced'),
        trouverPosteDeblaiExcedentaire(appData),
        'm³',
        'Déblai excédentaire',
        formExc,
        lib,
        idx * 20 + 8,
        q.v_exced
      );
    }

    // 8. Rocheux
    if (q.v_roch > 0 && t.rocheux) {
      const formR = `Long.(${t.rocheux.l.toFixed(3)}m) × Lt(${q.Wt.toFixed(3)}m) × Prof.(${t.rocheux.p.toFixed(3)}m) = ${q.v_roch.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'roch'),
        trouverPosteRocheux(appData),
        'm³',
        'Suppl. terrain rocheux',
        formR,
        lib,
        idx * 20 + 9,
        q.v_roch
      );
    }

    // 9. Compact
    if (q.v_comp > 0 && t.compact) {
      const formC = `Long.(${t.compact.l.toFixed(3)}m) × Lt(${q.Wt.toFixed(3)}m) × Prof.(${t.compact.p.toFixed(3)}m) = ${q.v_comp.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'comp'),
        trouverPosteCompact(appData),
        'm³',
        'Suppl. terrain compact',
        formC,
        lib,
        idx * 20 + 10,
        q.v_comp
      );
    }

    // 10. Remplacement sol
    if (q.v_remp > 0 && t.remplacement) {
      const formP = `Long.(${t.remplacement.l.toFixed(3)}m) × Lt(${q.Wt.toFixed(3)}m) × Prof.(${t.remplacement.p.toFixed(3)}m) = ${q.v_remp.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'remp'),
        trouverPosteRemplacementSol(appData),
        'm³',
        'Remplacement sol impropre',
        formP,
        lib,
        idx * 20 + 11,
        q.v_remp
      );
    }

    // 10b. Gestion des terres + Criblage
    if (q.v_fouille > 0) {
      const formGestion = `Volume brut de tranchée = L(${t.long.toFixed(3)}m) × Lt(${q.Wt.toFixed(3)}m) × Hm(${q.Hm.toFixed(3)}m) = ${q.v_fouille.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'gestion'),
        trouverPosteGestionTerres(appData),
        'm³',
        'Gestion des terres excavées',
        formGestion,
        lib,
        idx * 20 + 12,
        q.v_fouille
      );
      const formCriblage = `Volume criblage = Volume fouille = ${q.v_fouille.toFixed(3)} m³`;
      pushWithFrozenAndCorrection(
        cleLigneAuto(t.ref, 'criblage'),
        trouverPosteCriblage(appData),
        'm³',
        'Criblage des terres excavées',
        formCriblage,
        lib,
        idx * 20 + 13,
        q.v_fouille
      );
    }
  });

  // 11. CET / D9000 groupé par type (opt-in)
  const cetMap = new Map<string, { vol: number; refs: string[] }>();
  tronconsFait.forEach((t) => {
    if (!t.cet_porter || !t.d9000Type) return;
    const dBit = NRM(t.d9000Type || '');
    if (dBit.includes('bitumin') || dBit.includes('enrobe') || dBit.includes('fraisa')) return;
    const q = calcQte(t);
    const qCET = t.cet_qte !== null && isFinite(t.cet_qte) ? t.cet_qte : q.v_d9000 || 0;
    if (!cetMap.has(t.d9000Type)) cetMap.set(t.d9000Type, { vol: 0, refs: [] });
    const entry = cetMap.get(t.d9000Type)!;
    entry.vol += qCET;
    entry.refs.push(t.ref);
  });
  let d9000Ordre = 50000;
  cetMap.forEach((data, type) => {
    const refListe = data.refs.join(', ');
    const formCET = `CET — Type de terre : ${type}\nTronçons portés : ${refListe}\nVolume total = ${data.vol.toFixed(3)} m³`;
    pushWithFrozenAndCorrection(
      `cet_${type.replace(/\s+/g, '_')}`,
      trouverPosteD9000(appData, type),
      'm³',
      `CET / D9000 — ${type}`,
      formCET,
      refListe,
      d9000Ordre++,
      data.vol
    );
  });

  // 12. Lignes manuelles (y compris Config Voirie/Démolition et Pré-encodage CV)
  (appData.carnetMesurage?.lignesManuelles || []).forEach((lm) => {
    const p = allPostes.find((pp) => pp.id === lm.posteId) || null;
    pushWithFrozenAndCorrection(
      cleLigneMan(lm.id),
      p,
      p ? p.u : '?',
      lm.libelle || 'Ligne manuelle',
      lm.detailFormule || '',
      'Manuel',
      1000000,
      lm.quantite,
      lm.id
    );
  });

  return lines;
}

export function extraireQtesCochees(appData: ProjectData): Map<string, number> {
  const lines = construireLignesCarnet(appData);
  const cumul = new Map<string, number>();
  lines.forEach((l) => {
    if (l.porteeA || !l.coche || !l.posteId) return;
    if (!isFinite(l.qEff) || l.qEff === 0) return;
    cumul.set(l.posteId, (cumul.get(l.posteId) || 0) + l.qEff);
  });
  return cumul;
}

export function extraireQtesTotales(appData: ProjectData): Map<string, number> {
  const cumul = new Map<string, number>();
  const add = (id: string, q: number) => {
    if (id && isFinite(q) && q !== 0) {
      cumul.set(id, (cumul.get(id) || 0) + q);
    }
  };
  (appData.historiqueEA || []).forEach((ea) => {
    (ea.detailParPoste || []).forEach((d) => add(d.posteId, d.qte || 0));
  });
  extraireQtesCochees(appData).forEach((q, id) => add(id, q));
  return cumul;
}

export function prochainNumeroEA(appData: ProjectData): number {
  return (
    (appData.historiqueEA || []).reduce((max, ea) => {
      const m = String(ea.indice || '').match(/EA\s*0*(\d+)/i);
      return m ? Math.max(max, parseInt(m[1], 10) || 0) : max;
    }, 0) + 1
  );
}

// ─── CALCUL DES DÉLAIS ──────────────────────────────────────────────────────

export function dateCle(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function numeroSemaineISO(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const debut = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - debut.getTime()) / 86400000 + 1) / 7);
}

export function formaterDelaiMixte(groupes: { JO: number; JC: number }, prefix = ''): string {
  const parts: string[] = [];
  (['JO', 'JC'] as const).forEach((u) => {
    const v = Math.round((groupes?.[u] || 0) * 100) / 100;
    if (v !== 0) parts.push(`${v} ${u}`);
  });
  return parts.length
    ? (prefix ? prefix + ' ' : '') + parts.join(' + ')
    : prefix
    ? prefix + ' 0 JO'
    : '0 JO';
}

export function calculerEtatDelai(appData: ProjectData, dateFinOverride?: string): EtatDelai {
  const dl = appData.delais || {
    os: '',
    base: 60,
    unite: 'JO',
    finCalendrier: '',
    joursMarques: {},
    delaisCompl: [],
    arrets: [],
    mesDuree: 0,
    mesUnite: 'JO',
  };
  const os = dl.os ? new Date(dl.os + 'T00:00:00') : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateMes = dl.dateMes ? new Date(dl.dateMes + 'T00:00:00') : null;
  const finAff = dl.finCalendrier
    ? new Date(dl.finCalendrier + 'T00:00:00')
    : dateFinOverride
    ? new Date(dateFinOverride + 'T00:00:00')
    : today;

  const groupes: { JO: number; JC: number } = { JO: 0, JC: 0 };
  groupes[dl.unite === 'JC' ? 'JC' : 'JO'] += Number(dl.base) || 0;
  (dl.delaisCompl || []).forEach((d) => {
    const u = d.unite === 'JC' ? 'JC' : 'JO';
    groupes[u] += Number(d.valeur ?? d.duree) || 0;
  });

  const mesDuree = Math.max(0, Number(dl.mesDuree) || 0);
  const mesUnite: 'JO' | 'JC' = dl.mesUnite === 'JC' ? 'JC' : 'JO';
  const jm = dl.joursMarques || {};
  const arrets = dl.arrets || [];

  const estEnArret = (d: Date) =>
    arrets.some((a) => {
      if (!a.dateDebut) return false;
      const da = new Date(a.dateDebut + 'T00:00:00');
      if (a.dateReprise) {
        const dr = new Date(a.dateReprise + 'T00:00:00');
        return d >= da && d < dr;
      }
      return d >= da && d <= today;
    });

  const eligible = (d: Date, u: string) => {
    const wd = d.getDay();
    const cle = dateCle(d);
    const mk = jm[cle] || '';
    if (u === 'JC') return true;
    if (wd === 0 || wd === 6) return false;
    if (mk === 'ferie' || mk === 'conge' || mk === 'intemperie') return false;
    return true;
  };

  const consumed: { JO: number; JC: number } = { JO: 0, JC: 0 };
  const mes: { JO: number; JC: number } = { JO: 0, JC: 0 };
  const ordre: Array<'JO' | 'JC'> =
    dl.unite === 'JC' ? ['JC', 'JO'] : ['JO', 'JC'];
  const restant = { ...groupes };
  const moisMap = new Map<
    string,
    {
      y: number;
      m: number;
      nbJ: number;
      nSam: number;
      nDim: number;
      nFer: number;
      nCon: number;
      nInt: number;
      ded: number;
      emp: number;
      nMes: number;
      mesEmp: number;
      intDetail: number[];
    }
  >();

  if (os && !isNaN(os.getTime())) {
    const endCount = today;
    for (let d = new Date(os); d <= endCount; d.setDate(d.getDate() + 1)) {
      const cur = new Date(d);
      const phase =
        dateMes && !isNaN(dateMes.getTime()) && cur >= dateMes ? 'MES' : 'EXECUTION';
      if (estEnArret(cur)) continue;
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (!moisMap.has(key)) {
        moisMap.set(key, {
          y,
          m,
          nbJ: 0,
          nSam: 0,
          nDim: 0,
          nFer: 0,
          nCon: 0,
          nInt: 0,
          ded: 0,
          emp: 0,
          nMes: 0,
          mesEmp: 0,
          intDetail: [],
        });
      }
      const row = moisMap.get(key)!;
      const wd = cur.getDay();
      const mk = jm[dateCle(cur)] || '';
      if (phase === 'MES') {
        row.nMes++;
        if (eligible(cur, mesUnite)) {
          mes[mesUnite]++;
          row.mesEmp++;
        }
        continue;
      }
      row.nbJ++;
      if (wd === 6) row.nSam++;
      if (wd === 0) row.nDim++;
      if (mk === 'ferie') row.nFer++;
      if (mk === 'conge') row.nCon++;
      if (mk === 'intemperie') {
        row.nInt++;
        row.intDetail.push(cur.getDate());
      }
      let unit: 'JO' | 'JC' | null = null;
      for (const u of ordre) {
        if (restant[u] > 0 && eligible(cur, u)) {
          unit = u;
          break;
        }
      }
      if (unit) {
        consumed[unit]++;
        restant[unit]--;
        row.emp++;
      } else {
        const uniteDepasse = groupes[ordre[1]] > 0 ? ordre[1] : ordre[0];
        if (eligible(cur, uniteDepasse)) {
          consumed[uniteDepasse]++;
          row.emp++;
        }
      }
      row.ded = row.nbJ - row.emp;
    }
  }

  const executionRestant = {
    JO: groupes.JO - consumed.JO,
    JC: groupes.JC - consumed.JC,
  };
  const executionDepasse = {
    JO: Math.max(0, consumed.JO - groupes.JO),
    JC: Math.max(0, consumed.JC - groupes.JC),
  };
  const mesRestant = mesDuree - (mes[mesUnite] || 0);
  const totalExec = (groupes.JO || 0) + (groupes.JC || 0);
  const consumedExec = (consumed.JO || 0) + (consumed.JC || 0);
  const maxRowsEnd = finAff && !isNaN(finAff.getTime()) && finAff > today ? finAff : today;
  const rows: DelaiMoisRow[] = [];

  if (os && !isNaN(os.getTime())) {
    const cur = new Date(os.getFullYear(), os.getMonth(), 1);
    const endM = new Date(maxRowsEnd.getFullYear(), maxRowsEnd.getMonth(), 1);
    while (cur <= endM) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      const base = moisMap.get(key) || {
        y: cur.getFullYear(),
        m: cur.getMonth(),
        nbJ: 0,
        nSam: 0,
        nDim: 0,
        nFer: 0,
        nCon: 0,
        nInt: 0,
        ded: 0,
        emp: 0,
        nMes: 0,
        mesEmp: 0,
        intDetail: [],
      };
      rows.push({ ...base, intDetail: base.intDetail.join('-') || '—' });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  return {
    dl,
    os,
    today,
    dateMes,
    finAff,
    groupes,
    consumed,
    executionRestant,
    executionDepasse,
    consumedExec,
    totalExec,
    mesDuree,
    mesUnite,
    mesConsumed: mes[mesUnite] || 0,
    mesRestant,
    mes,
    rows,
    estEnArret,
    eligible,
    jm,
  };
}

// ─── PARSEUR EXCEL 3P ───────────────────────────────────────────────────────

export function lireNombreExcel(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  let s = String(val).trim().replace(/\u00A0/g, ' ').replace(/\s+/g, '');
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

export function trouverColonneExcel(
  entetes: unknown[],
  alias: string[],
  obligatoire = true
): number {
  const norm = (v: unknown) =>
    String(v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const h = entetes.map(norm);
  for (const a of alias) {
    const na = norm(a);
    const i = h.findIndex((x) => x === na);
    if (i >= 0) return i;
  }
  for (const a of alias) {
    const na = norm(a);
    const i = h.findIndex((x) => x.includes(na));
    if (i >= 0) return i;
  }
  if (obligatoire) throw new Error(`Colonne Excel introuvable : ${alias.join(' / ')}`);
  return -1;
}

export function parserExcel3P(
  buffer: ArrayBuffer,
  fileName: string
): {
  infos: Partial<ProjectData['infosAdministratives']>;
  marche3P: PosteMarche[];
  nomProjet: string;
} {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const apName = wb.SheetNames.find((n) => /aper|vua/i.test(n)) || wb.SheetNames[0];
  const poName =
    wb.SheetNames.find((n) => /post/i.test(n)) || wb.SheetNames[1] || wb.SheetNames[0];
  const rowsAp = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[apName], { header: 1, defval: '' });
  const rowsPo = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[poName], { header: 1, defval: '' });

  const NRM2 = (s: unknown) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[''`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const infos: Partial<ProjectData['infosAdministratives']> = {};
  rowsAp.forEach((r) => {
    if (!r || r.length < 2) return;
    const k = NRM2(r[0]);
    const v = String(r[1] ?? '').trim();
    if (!k || !v) return;
    if (
      (k === 'marche' || k.startsWith('marche ') || k.includes('objet du marche')) &&
      !k.includes('reference') &&
      !k.includes('ref')
    ) {
      infos.intitule = v;
    } else if (
      k === 'reference' ||
      k.startsWith('reference ') ||
      k.includes('n  dossier') ||
      k.includes('n° dossier')
    ) {
      infos.marche = v;
    } else if (k === 'lieu' || k === 'lieu des travaux') {
      infos.lieu = v;
    } else if (
      k === 'pouvoir adjudicateur' ||
      k.startsWith('pouvoir adjudicateur') ||
      k.includes('maitre d ouvrage') ||
      k.includes('commanditaire')
    ) {
      infos.mo = v;
    } else if (
      k === 'adjudicataire' ||
      k.startsWith('adjudicataire ') ||
      k.includes('soumissionnaire') ||
      k.includes('titulaire du marche') ||
      k.includes('entrepreneur')
    ) {
      infos.entrepreneur = v;
    } else if (
      k === 'auteur de projet' ||
      k.startsWith('auteur de projet') ||
      k.includes('fonctionnaire dirigeant') ||
      k.includes('chef de projet')
    ) {
      infos.auteur = v;
    }
  });

  let hIdx = -1;
  let mc: { n: number; r: number; d: number; u: number; q: number; pu: number } | null = null;
  for (let i = 0; i < Math.min(rowsPo.length, 80); i++) {
    const row = rowsPo[i] || [];
    const text = row.map((v) => NRM2(v)).join(' | ');
    if (
      /description/.test(text) &&
      /unite|pu|prix unitaire|q prev|qte prev|quantite prev/.test(text)
    ) {
      hIdx = i;
      mc = {
        n: trouverColonneExcel(row, ['N°', 'No', 'N', 'N° poste'], false),
        r: trouverColonneExcel(row, ['Réf', 'Référence', 'Ref'], false),
        d: trouverColonneExcel(row, ['Description', 'Désignation', 'Libellé'], true),
        u: trouverColonneExcel(row, ['Unité', 'Unit', 'U'], true),
        q: trouverColonneExcel(
          row,
          ['Q. prév', 'Q prév', 'Qté prév', 'Quantité prévue', 'Quantite prevue'],
          true
        ),
        pu: trouverColonneExcel(
          row,
          ['PU', 'Prix unitaire', 'Prix Unit.', 'Prix unitaire HT'],
          true
        ),
      };
      break;
    }
  }
  if (!mc) throw new Error('En-tête des postes introuvable dans la feuille Excel.');
  if (mc.n < 0 && mc.r < 0)
    throw new Error('Colonne N° / Réf. introuvable dans la feuille des postes.');

  const found: PosteMarche[] = [];
  for (let i = hIdx + 1; i < rowsPo.length; i++) {
    const r = rowsPo[i] || [];
    if (r.length < 4) continue;
    let id = mc.n >= 0 ? String(r[mc.n] ?? '').trim() : '';
    if (!id || id === 'undefined') id = mc.r >= 0 ? String(r[mc.r] ?? '').trim() : '';
    const desc = String(r[mc.d] ?? '').trim();
    const u = String(r[mc.u] ?? '').trim();
    const qte = lireNombreExcel(r[mc.q]);
    const pu = lireNombreExcel(r[mc.pu]);
    if (id && desc && !/sous[- ]?total/i.test(desc) && id !== 'N°') {
      found.push({ id, desc, u, qte, pu });
    }
  }
  if (!found.length) {
    throw new Error('Aucun poste exploitable trouvé dans la feuille Excel.');
  }

  const ref = (infos.marche || '').trim();
  const lieu = (infos.lieu || '').trim().split(/[-,]/)[0].trim();
  const nomAuto = (ref && lieu ? `${ref}_${lieu}` : ref || lieu || '')
    .replace(/[^\w\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const nomProjet = nomAuto || fileName.split('.')[0].replace(/[^a-zA-Z0-9_\-]/g, '_');

  return { infos, marche3P: found, nomProjet };
}

export function deriveProchainAvenantId(avenants: Avenant[], type: string): string {
  const n = avenants.filter((a) => a.type === type).length + 1;
  return `${type}-${String(n).padStart(3, '0')}`;
}
