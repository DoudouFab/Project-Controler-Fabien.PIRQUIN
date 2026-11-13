import React from 'react';
import { INASEP_LOGO_BASE64 } from '../constants/inasep';
import { InfosAdministratives } from '../types/project';

interface PrintHeaderProps {
  infos: InfosAdministratives;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({ infos }) => {
  const todayStr = new Date().toLocaleDateString('fr-FR');
  return (
    <div
      className="print-header-box hidden border-b-2 border-[#1e3a5f] pb-3 mb-4"
      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <img
            src={INASEP_LOGO_BASE64}
            alt="INASEP"
            className="h-14 w-auto object-contain"
          />
          <div>
            <div className="text-[13pt] font-bold text-slate-900">
              {infos.intitule || '— Projet —'}
            </div>
            {infos.lieu && (
              <div className="text-[8pt] text-slate-600">{infos.lieu}</div>
            )}
          </div>
        </div>
        <div className="text-right text-[8pt] text-slate-800 space-y-0.5">
          <div>Réf. {infos.marche || '—'}</div>
          {infos.mo && <div>{infos.mo}</div>}
          {infos.auteur && <div>Auteur de projet : {infos.auteur}</div>}
          {infos.entrepreneur && <div>Adjudicataire : {infos.entrepreneur}</div>}
          {infos.controleur && <div>Contrôleur responsable : {infos.controleur}</div>}
          <div className="mt-1 text-slate-500">Imprimé le {todayStr}</div>
        </div>
      </div>
    </div>
  );
};
