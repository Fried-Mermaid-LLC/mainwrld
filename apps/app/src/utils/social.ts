import type { Relationship } from '@/types'

// The three social buckets for a user, as deduped username lists. A relationship
// is mutual when both directions exist; mutual pairs appear ONLY in `mutuals`,
// never in `admirers` / `admiring`, so the three categories are disjoint (a
// person is in exactly one). One-sided edges stay in their own bucket.
export interface SocialBuckets {
  mutuals: string[] // admire `username` AND are admired back
  admirers: string[] // admire `username`, one-sided (not admired back)
  admiring: string[] // `username` admires, one-sided (they don't admire back)
}

export function getSocialBuckets(
  relationships: Relationship[],
  username: string
): SocialBuckets {
  const admiringMe = new Set<string>() // people who admire `username`
  const iAdmire = new Set<string>() // people `username` admires
  for (const r of relationships) {
    if (r.target === username) admiringMe.add(r.admirer)
    if (r.admirer === username) iAdmire.add(r.target)
  }
  const mutuals: string[] = []
  const admirers: string[] = []
  const admiring: string[] = []
  for (const u of admiringMe) {
    if (iAdmire.has(u)) mutuals.push(u)
    else admirers.push(u)
  }
  for (const u of iAdmire) {
    if (!admiringMe.has(u)) admiring.push(u)
  }
  return { mutuals, admirers, admiring }
}
