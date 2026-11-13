export interface InfosAdministratives {
  intitule: string;
  mo: string;
  auteur: string;
  entrepreneur: string;
  marche: string;
  lieu: string;
  controleur: string;
}

export interface PosteMarche {
  id: string;
  desc: string;
  u: string;
  qte: number;
  pu: number;
}

export interface Avenant extends PosteMarche {
  type: 'AV1' | 'AV2' | 'AV3' | 'PC' | string;
}

export interface ConditionParticuliere {
  p: number;
  l: number;
}

export interface CvDoExtremite {
  dint: number;
  h: number;
}

export interface TronconEgout {
  ref: string;
  ordreEncodage: number;
  de: string;
  a: string;
  long: number;
  p_amo: number;
  p_ava: number;
  sf: number;
  fond: number;
  rev: number;
  epExist: number;
  natureTuyau: string;
  dn: number;
  diamExt: number;
  milieu: string;
  remblaiType: string;
  chauxPourcent: number;
  d9000Type: string;
  fait: boolean;
  lt_force: number | null;
  insp_porter: boolean;
  insp_qte: number | null;
  cet_porter: boolean;
  cet_qte: number | null;
  rocheux: ConditionParticuliere | null;
  compact: ConditionParticuliere | null;
  remplacement: ConditionParticuliere | null;
  blindage: ConditionParticuliere | null;
  avecEnrobage: boolean;
  cvAmo: CvDoExtremite;
  cvAva: CvDoExtremite;
}

export interface LigneManuelle {
  id: string;
  posteId: string;
  libelle: string;
  quantite: number;
  detailFormule: string;
  roleAuto?: string;
  cvKey?: string;
  tronconRef?: string;
}

export interface StatutLigne {
  porteeA: string | null;
  coche: boolean;
  qteSnapshot?: number;
  posteIdSnapshot?: string;
  deverrouille?: boolean;
}

export interface LigneOverride {
  posteId?: string;
  quantite?: number;
  annotation?: string;
  formuleSupplement?: string;
  _ignore?: boolean;
}

export interface CarnetMesurage {
  lignesManuelles: LigneManuelle[];
  statutsLignes: Record<string, StatutLigne>;
  overrides: Record<string, LigneOverride>;
  cvAutoGeneres?: string[];
}

export interface DetailPosteEA {
  posteId: string;
  qte: number;
  montant: number;
  qteOrigine?: number;
}

export interface HistoriqueEA {
  indice: string;
  date: string;
  montant: number;
  detailParPoste: DetailPosteEA[];
}

export interface DelaiCompl {
  libelle: string;
  valeur: number;
  duree?: number;
  unite: 'JO' | 'JC' | string;
}

export interface ArretChantier {
  dateDebut: string;
  dateReprise: string;
}

export interface DelaisConfig {
  os: string;
  base: number;
  unite: 'JO' | 'JC' | string;
  finCalendrier: string;
  joursMarques: Record<string, 'intemperie' | 'ferie' | 'conge' | string>;
  delaisCompl: DelaiCompl[];
  arrets: ArretChantier[];
  mesDuree: number;
  mesUnite: 'JO' | 'JC' | string;
  dateMes?: string;
}

export interface ConfigRoleDims {
  l?: number;
  w?: number;
  e?: number;
  lExpr?: string;
  wExpr?: string;
  eExpr?: string;
}

export interface ConfigExtraPoste {
  id: string;
  posteId: string;
  dims?: ConfigRoleDims;
}

export interface ConfigVoirieDemolition {
  parTroncon: Record<string, Record<string, unknown>>;
}

export interface ProjectData {
  nomProjet: string;
  infosAdministratives: InfosAdministratives;
  marche3P: PosteMarche[];
  avenants: Avenant[];
  tronconsEgout: TronconEgout[];
  compteurTroncons: number;
  ordreTroncons: number;
  carnetMesurage: CarnetMesurage;
  historiqueEA: HistoriqueEA[];
  delais: DelaisConfig;
  configVoirie?: ConfigVoirieDemolition;
  configDemolition?: ConfigVoirieDemolition;
}

export interface CalcQteResult {
  Wt: number;
  isForce: boolean;
  Hm: number;
  nbCvDo: number;
  dedAmo: number;
  dedAva: number;
  longPose: number;
  dM: number;
  v_fouille: number;
  v_enrob_rect: number;
  H_enrob: number;
  H_remb: number;
  v_remblai: number;
  qtChaux: number;
  v_fond: number;
  v_cv: number;
  v_cv_amo: number;
  v_cv_ava: number;
  isRemblaiApport: boolean;
  v_exced: number;
  v_roch: number;
  v_comp: number;
  v_remp: number;
  v_d9000: number;
  v_sousfond: number;
  v_fondVoirie: number;
  v_souscouche: number;
  v_coucheRoul: number;
  epProj: number;
  epExist: number;
  diffCoffre: number;
}

export interface CarnetLineItem {
  cle: string;
  posteAuto: PosteMarche | null;
  posteEff: PosteMarche | null;
  posteId: string | null;
  posteForceManuellement: boolean;
  unite: string;
  libPrestation: string;
  formuleTxt: string;
  libTroncon: string;
  ordreTroncon: number;
  qCalc: number;
  qEff: number;
  qForce: boolean;
  porteeA: string | null;
  coche: boolean;
  deverrouille: boolean;
  annotation: string;
  formuleSupplement: string;
  manuelleId?: string;
  isCorrection?: boolean;
  isUpdatedAfterEA?: boolean;
  diffCorrection?: number;
}

export interface DelaiMoisRow {
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
  intDetail: string;
}

export interface EtatDelai {
  dl: DelaisConfig;
  os: Date | null;
  today: Date;
  dateMes: Date | null;
  finAff: Date;
  groupes: { JO: number; JC: number };
  consumed: { JO: number; JC: number };
  executionRestant: { JO: number; JC: number };
  executionDepasse: { JO: number; JC: number };
  consumedExec: number;
  totalExec: number;
  mesDuree: number;
  mesUnite: 'JO' | 'JC';
  mesConsumed: number;
  mesRestant: number;
  mes: { JO: number; JC: number };
  rows: DelaiMoisRow[];
  estEnArret: (d: Date) => boolean;
  eligible: (d: Date, u: string) => boolean;
  jm: Record<string, string>;
}
