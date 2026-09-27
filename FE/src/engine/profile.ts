import type { Profile } from './types';

/** Sectors that handle perishable goods by definition, so "Do you handle perishable goods?" is answered for them. */
const PERISHABLE_SECTORS = new Set(['farm', 'processor', 'coldstorage']);

/** Profile answers the sector already gives away. Only carriers and brokers are asked about perishables. */
export function impliedProfile(sector: string | undefined): Profile {
  return sector && PERISHABLE_SECTORS.has(sector) ? { perishable: 'yes' } : {};
}

/** True when the sector answers this profile question, so it is not shown. */
export function isImplied(id: string, profile: Profile): boolean {
  return id in impliedProfile(profile.sector);
}

/**
 * The profile after the sector changes: fills in what the new sector implies, and clears answers the
 * old sector implied but the new one does not, so the question is asked instead of silently kept.
 */
export function withSector(profile: Profile, sector: string): Profile {
  const next: Profile = { ...profile, sector };
  for (const id of Object.keys(impliedProfile(profile.sector))) delete next[id];
  return { ...next, ...impliedProfile(sector) };
}
