// Shared age math (X09). Returns null for unknown/invalid dates so each caller
// decides its own fail policy (fail-open vs fail-closed). Used by the <13
// signup gate and the under-16 explicit filter.
export const ageFromBirthDate = (
  birthDate?: string | null
): number | null => {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}
