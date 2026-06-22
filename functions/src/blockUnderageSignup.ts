import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// COPPA hard block (X09). The birth date is collected in our own signup form,
// not as a Firebase Auth property, so a beforeUserCreated blocking function
// cannot see it. The robust enforcement point is the users/{uid} create: if the
// birth date is missing or the computed age is under 13, tear the account down
// (mirroring deleteAccount.ts ordering — at signup time there are no books/
// comments yet, so the lighter teardown is sufficient). This guarantees an
// underage account cannot persist even if the client check is bypassed.
//
// Keep MIN_SIGNUP_AGE in sync with src/config/constants.ts (functions/ cannot
// import from src/).
const MIN_SIGNUP_AGE = 13

const ageFromBirthDate = (birthDate?: string | null): number | null => {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export const blockUnderageSignup = onDocumentCreated(
  { region: 'us-central1', document: 'users/{uid}' },
  async (event) => {
    const uid = event.params.uid
    const data = event.data?.data()
    const birthDate = data?.birthDate as string | undefined
    const username = data?.username as string | undefined
    const age = ageFromBirthDate(birthDate)

    if (age !== null && age >= MIN_SIGNUP_AGE) return // OK, keep the account

    logger.warn('blockUnderageSignup: tearing down underage/no-birthdate account', {
      uid,
      age,
    })
    const db = getFirestore()
    if (username) {
      try {
        await db.collection('usernames').doc(username.toLowerCase()).delete()
      } catch (err) {
        logger.warn('blockUnderageSignup: usernames delete failed', { username, err })
      }
    }
    try {
      await db.collection('users').doc(uid).delete()
    } catch (err) {
      logger.warn('blockUnderageSignup: users delete failed', { uid, err })
    }
    try {
      await getAuth().deleteUser(uid)
    } catch (err) {
      logger.warn('blockUnderageSignup: auth delete failed', { uid, err })
    }
  }
)
