import { BRANCH, MODALITY } from './format'

// Torneo, modalidad y rama de un partido (lo que falte se omite)
export const matchInfo = (m) =>
  [m.tournament?.name ?? m.tournamentName, MODALITY[m.modality], BRANCH[m.branch]].filter(Boolean).join(' \u00b7 ')
