import { auth, db, storage } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type User as FirebaseUser,
  type Unsubscribe
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  increment,
  writeBatch,
  deleteField,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe as FsUnsubscribe
} from 'firebase/firestore';

// ==================== AUTH FUNCTIONS ====================

export const signUp = async (
  email: string,
  password: string,
  username: string,
  displayName: string,
  birthDate: string
) => {
  // 1. Create Firebase Auth account
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  // 2. Create user profile document in Firestore
  await setDoc(doc(db, 'users', uid), {
    uid,
    username,
    displayName,
    email,
    birthDate,
    points: 50,
    admirersCount: 0,
    mutualsCount: 0,
    admiringCount: 0,
    strikes: 0,
    // Presence is owned by the RTDB mirror (X06); seed offline so a user who
    // signs up but never opens a presence connection isn't shown online.
    isOnline: false,
    activity: 'Idle',
    isPremium: false,
    premiumSince: null,
    createdAt: serverTimestamp()
  });

  // 3. Create username lookup document for uniqueness checking + login
  await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid, email });

  // 4. The setUsernameClaim Cloud Function (Stage 2c) fires on the
  // users/{uid} create above and stamps the username into the auth
  // token's custom claims. The current ID token was minted *before*
  // that claim existed, so force a refresh now. Otherwise firestore.
  // rules that check `request.auth.token.username` reject this user's
  // first session — particularly chat, relationships, notifications.
  try {
    await credential.user.getIdToken(true);
  } catch {
    // Non-fatal: claim will land on next token rotation.
  }

  return { uid, username, displayName, email, birthDate };
};

export const logIn = async (emailOrUsername: string, password: string) => {
  let email = emailOrUsername;

  // If not an email, look up username to get email
  // NOTE: usernames collection must be readable without auth (public lookup)
  if (!emailOrUsername.includes('@')) {
    const usernameDoc = await getDoc(doc(db, 'usernames', emailOrUsername.toLowerCase()));
    if (!usernameDoc.exists()) {
      throw new Error('Invalid username or password.');
    }
    const data = usernameDoc.data();
    // Prefer email stored directly in usernames doc (avoids needing auth to read users profile)
    if (data.email) {
      email = data.email;
    } else {
      // Fallback for old accounts: try reading user profile
      try {
        const userDoc = await getDoc(doc(db, 'users', data.uid));
        if (!userDoc.exists()) {
          throw new Error('Please log in with your email address instead of username.');
        }
        email = userDoc.data().email;
      } catch (e: any) {
        // If permission denied (not authed yet), ask user to use email
        throw new Error('Please log in with your email address instead of username.');
      }
    }
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  // Fetch user profile from Firestore
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) {
    throw new Error('User profile not found');
  }

  // Ban gate (F04), defense-in-depth: stop a banned user before any
  // home-screen state loads, even if a caller forgets the hook-level check.
  // The Auth record is also disabled server-side, but that only blocks NEW
  // sign-ins after token revocation; this catches the stale-session case.
  if (userDoc.data().isBanned === true) {
    await signOut(auth).catch(() => {});
    throw new Error('This account has been suspended for repeated community guideline violations.');
  }

  return { uid, ...userDoc.data() };
};

export const logOut = async () => {
  await signOut(auth);
};

export const onAuthChange = (callback: (user: FirebaseUser | null) => void): Unsubscribe => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentFirebaseUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

// Backfill the `username` custom claim for the signed-in user, then refresh
// the ID token so firestore.rules can authorize username-keyed records
// (chatMessages.from/to, notifications.recipient, relationships.admirer).
//
// setUsernameClaim only fires on users/{uid} CREATE, so accounts older than
// that trigger never received the claim and token rotation does not re-run
// it. Call this once right after sign-in, BEFORE the username-scoped
// subscriptions start, otherwise their first listen is rejected. Fail-soft:
// network/permission hiccups must not block login.
export const ensureUsernameClaim = async (): Promise<void> => {
  const current = auth.currentUser;
  if (!current) return;
  try {
    const functions = getFunctions();
    const fn = httpsCallable<void, { ok: boolean; changed?: boolean }>(
      functions,
      'ensureUsernameClaim'
    );
    const res = await fn();
    // Refresh the token so the (possibly new) claim lands in request.auth.
    if (res.data?.ok) {
      await current.getIdToken(true);
    }
  } catch (err) {
    console.error('[claims] ensureUsernameClaim failed', err);
  }
};

export const checkUsernameAvailable = async (username: string): Promise<boolean> => {
  const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase()));
  return !usernameDoc.exists();
};

// Moderate a signup username + display name via the OpenAI Moderation API
// (server-side callable). Returns true if flagged. Fail-open: any error (unset
// key, network, not deployed) returns false so moderation never blocks signup.
export const moderateUsername = async (
  username: string,
  displayName: string
): Promise<boolean> => {
  try {
    const functions = getFunctions();
    const fn = httpsCallable<
      { username: string; displayName: string },
      { flagged: boolean }
    >(functions, 'moderateUsername');
    const res = await fn({ username, displayName });
    return !!res.data?.flagged;
  } catch (err) {
    console.warn('[MainWRLD] moderateUsername failed (fail-open):', err);
    return false;
  }
};

export const getUserProfile = async (uid: string) => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) return null;
  return { uid, ...userDoc.data() };
};

export const updateUserProfile = async (uid: string, data: Partial<DocumentData>) => {
  await updateDoc(doc(db, 'users', uid), data);
};

// Push device tokens (X01). One per device; the sendPushOnNotification trigger
// fans out to all and prunes stale ones server-side.
export const addFcmToken = async (uid: string, token: string) => {
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
};

export const removeFcmToken = async (uid: string, token: string) => {
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
};

// Atomic array operations for library (order-independent, no race conditions).
//
// Ownership model (F01):
//   ownedBookIds     — books currently shown in the Library tab (saved).
//                      Add/remove freely.
//   purchasedBookIds — books PAID FOR (points or cash). Append-only; never
//                      arrayRemove. This is the permanence source of truth, so
//                      removing a purchased book from the library never revokes
//                      read access (getUserOwnedBookIds unions both sets).
//
// Saving a free book must NOT mark it purchased, so addBookToLibrary writes
// only ownedBookIds. recordBookPurchase is the only client path that appends
// to purchasedBookIds (cash purchases additionally get a server-side grant
// from the Stripe webhook / points callable).
export const addBookToLibrary = async (uid: string, bookId: string) => {
  await updateDoc(doc(db, 'users', uid), {
    ownedBookIds: arrayUnion(bookId),
  });
};

export const recordBookPurchase = async (uid: string, bookId: string) => {
  await updateDoc(doc(db, 'users', uid), {
    ownedBookIds: arrayUnion(bookId),
    purchasedBookIds: arrayUnion(bookId),
  });
};

export const removeBookFromLibrary = async (uid: string, bookId: string) => {
  // Owned-only: a purchased book stays in purchasedBookIds forever so the
  // permanent-purchase guarantee survives library removal.
  await updateDoc(doc(db, 'users', uid), {
    ownedBookIds: arrayRemove(bookId),
  });
};

// Buyer-side purchase history (cash + points rails), written only by the
// Stripe webhook / purchaseBooksWithPoints callable. Sorted client-side to
// avoid needing a composite index.
export const getBookPurchases = async (uid: string) => {
  const q = query(collection(db, 'bookPurchases'), where('buyerUid', '==', uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
};

export const changePassword = async (newPassword: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  await updatePassword(user, newPassword);
};

// Password-reset landing flow. The reset email lands on the app as
// ?mode=resetPassword&oobCode=…; ResetPasswordView verifies the out-of-band
// code first (this surfaces the target email and rejects expired/used links)
// and then commits the new password. Unlike changePassword these work
// pre-auth, off the oobCode rather than the current session.
export const verifyResetCode = async (oobCode: string): Promise<string> => {
  return verifyPasswordResetCode(auth, oobCode);
};

export const completePasswordReset = async (
  oobCode: string,
  newPassword: string
): Promise<void> => {
  await confirmPasswordReset(auth, oobCode, newPassword);
};

// Calls the `deleteAccount` Cloud Function (Stage 2b). The function
// scrubs the user's data from Firestore and deletes the Auth record,
// satisfying App Store guideline 5.1.1(v). After this returns the
// client's ID token is invalid, so we sign out unconditionally.
export const deleteCurrentAccount = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const functions = getFunctions();
  const deleteAccountFn = httpsCallable<void, { deletedUid: string }>(
    functions,
    'deleteAccount'
  );
  try {
    await deleteAccountFn();
  } finally {
    // Even if the function partly failed, the auth record may already
    // be gone — sign out so the UI does not try to act as the user.
    await signOut(auth).catch(() => {});
  }
};

// Calls the `verifyAppleReceipt` Cloud Function (Stage 3c). The
// function verifies the receipt with Apple's App Store Server API,
// credits points (or extends the premium subscription) inside a
// Firestore transaction, and returns the new balance. We pass the
// full base64 receipt rather than the transactionId alone because
// the App Store Server API supports both StoreKit 1 and 2 via
// receipts.
export const verifyAppleReceipt = async (params: {
  productId: string;
  transactionId: string;
  appStoreReceipt: string;
}): Promise<{
  credited: boolean;
  pointsAdded?: number;
  isPremium?: boolean;
  couponAdded?: { id: string; value: number; used: boolean };
}> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const functions = getFunctions();
  const verify = httpsCallable<
    typeof params,
    {
      credited: boolean;
      pointsAdded?: number;
      isPremium?: boolean;
      couponAdded?: { id: string; value: number; used: boolean };
    }
  >(functions, 'verifyAppleReceipt');
  const res = await verify(params);
  return res.data;
};

// ==================== USER QUERY FUNCTIONS ====================

export const getAllUsers = async () => {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
};

export const subscribeToUsers = (callback: (users: any[]) => void): FsUnsubscribe => {
  return onSnapshot(collection(db, 'users'), (snapshot: QuerySnapshot) => {
    callback(snapshot.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
};

export const getUserByUsername = async (username: string) => {
  const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase()));
  if (!usernameDoc.exists()) return null;
  const uid = usernameDoc.data().uid;
  return getUserProfile(uid);
};

// ==================== BOOK FUNCTIONS ====================

// Pre-allocate a book id so the caller can upload a cover into
// book-covers/{uid}/{bookId}/… and reference it before the doc exists.
export const newBookId = (): string => doc(collection(db, 'books')).id;

export const createBook = async (bookData: any) => {
  // Honour a caller-supplied id (from newBookId) so cover/chapter writes can be
  // keyed on it before creation; otherwise allocate a fresh one.
  const bookRef = bookData.id
    ? doc(db, 'books', bookData.id)
    : doc(collection(db, 'books'));
  const bookWithId = {
    ...bookData,
    id: bookRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(bookRef, bookWithId);
  return bookWithId;
};

// NOTE: createBook stores `id` === documentId, so we address books DIRECTLY
// by documentId. We must NOT look them up with query(where('id','==',bookId)):
// the security rules grant draft access only to the author, and Firestore can
// only prove that for queries whose *filters* establish it (authorUid / isDraft).
// A query keyed on the `id` field proves nothing and is rejected wholesale with
// permission-denied for any draft. A direct doc ref is evaluated per-document.
export const updateBook = async (bookId: string, data: any) => {
  await updateDoc(doc(db, 'books', bookId), { ...data, updatedAt: serverTimestamp() });
};

export const deleteBook = async (bookId: string) => {
  // Delete the chapter subcollection alongside the book doc so no orphaned
  // chapter bodies linger (client SDK has no recursive delete).
  const chapterSnap = await getDocs(collection(db, 'books', bookId, 'chapters'));
  if (!chapterSnap.empty) {
    const batch = writeBatch(db);
    chapterSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'books', bookId));
};

export const getBook = async (bookId: string) => {
  const snap = await getDoc(doc(db, 'books', bookId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const getAllBooks = async () => {
  const snapshot = await getDocs(collection(db, 'books'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ==================== CHAPTER SUBCOLLECTION (schema 2) ====================
//
// Chapter bodies live in books/{bookId}/chapters/{chapterId}, keyed by a STABLE
// id (not a positional index) so deleting a middle chapter never renumbers the
// rest. The parent book doc keeps only `chapterMeta` (id + title + order) and
// `chaptersCount`. Reader access to other people's chapter bodies goes through
// the getChapterContent callable (paywall enforcement); authors read directly.

const chaptersCol = (bookId: string) => collection(db, 'books', bookId, 'chapters');

export const newChapterId = (bookId: string): string => doc(chaptersCol(bookId)).id;

export const getChapter = async (bookId: string, chapterId: string) => {
  const snap = await getDoc(doc(db, 'books', bookId, 'chapters', chapterId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as any;
};

export const getChapters = async (bookId: string) => {
  const snapshot = await getDocs(query(chaptersCol(bookId), orderBy('order')));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const saveChapter = async (
  bookId: string,
  chapterId: string,
  data: {
    content: string;
    order: number;
    title: string;
    authorUsername?: string;
  }
) => {
  await setDoc(
    doc(db, 'books', bookId, 'chapters', chapterId),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
};

export const deleteChapterDoc = async (bookId: string, chapterId: string) => {
  await deleteDoc(doc(db, 'books', bookId, 'chapters', chapterId));
};

// Atomically write a chapter body AND the parent book's light metadata
// (chapterMeta, chaptersCount, cover, status…). Also strips the legacy heavy
// fields (chapters/content) and stamps schemaVersion 2, so any edited book is
// migrated forward on the fly. Keeps the chaptersCount <= chapterMeta.length
// invariant by writing both sides in one batch.
export const commitChapterWrite = async (
  bookId: string,
  chapterId: string,
  chapterData: {
    content: string;
    order: number;
    title: string;
    authorUsername?: string;
    isDraft?: boolean;
  },
  bookUpdates: Record<string, any>
) => {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'books', bookId, 'chapters', chapterId),
    { ...chapterData, updatedAt: serverTimestamp() },
    { merge: true }
  );
  batch.update(doc(db, 'books', bookId), {
    ...bookUpdates,
    chapters: deleteField(),
    content: deleteField(),
    schemaVersion: 2,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
};

// Atomically delete a chapter body and update the parent book's metadata.
export const commitChapterDelete = async (
  bookId: string,
  chapterId: string,
  bookUpdates: Record<string, any>
) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'books', bookId, 'chapters', chapterId));
  batch.update(doc(db, 'books', bookId), {
    ...bookUpdates,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
};

// Reader path: fetch a chapter body through the server, which enforces the
// paywall (author/admin, free book, preview chapter, or purchased). Throws a
// functions error (e.g. 'permission-denied') when access is not allowed.
export const fetchChapterContent = async (
  bookId: string,
  chapterId: string
): Promise<{ title: string; content: string }> => {
  const functions = getFunctions();
  const fn = httpsCallable<
    { bookId: string; chapterId: string },
    { title: string; content: string }
  >(functions, 'getChapterContent');
  const res = await fn({ bookId, chapterId });
  return res.data;
};

// ==================== COVER IMAGES (Firebase Storage) ====================

// Upload a base64 data URL cover to Storage and return its download URL + path.
// Path embeds the author uid so Storage rules can enforce write-ownership.
export const uploadCover = async (
  authorUid: string,
  bookId: string,
  dataUrl: string
): Promise<{ url: string; path: string }> => {
  const path = `book-covers/${authorUid}/${bookId}/${crypto.randomUUID()}.jpg`;
  const r = storageRef(storage, path);
  await uploadString(r, dataUrl, 'data_url');
  const url = await getDownloadURL(r);
  return { url, path };
};

// Best-effort delete of a previous cover when it is replaced. Never throws.
export const deleteCoverByPath = async (path: string): Promise<void> => {
  try {
    await deleteObject(storageRef(storage, path));
  } catch (err) {
    console.warn('[MainWRLD] Failed to delete old cover:', err);
  }
};

// Real-time listener for books the current user is allowed to read.
//
// A listen on the *whole* books collection is rejected by the security
// rules, because draft visibility is conditional (author-only) and Firestore
// can't prove every document in an unfiltered listen is readable. So we run
// two rule-satisfiable listeners and merge them:
//   1. all published books      (isDraft == false)  → readable by anyone
//   2. all of MY books          (authorUid == uid)  → includes my drafts
// Results are merged by id (my own published books appear in both).
export const subscribeToBooksChanges = (
  uid: string,
  callback: (books: any[]) => void
): Unsubscribe => {
  let published: any[] = [];
  let mine: any[] = [];
  const emit = () => {
    const byId = new Map<string, any>();
    for (const b of published) byId.set(b.id, b);
    for (const b of mine) byId.set(b.id, b); // own drafts/edits win
    callback(Array.from(byId.values()));
  };
  const onErr = (label: string) => (err: any) => {
    console.error('subscribeToBooksChanges: listener failed', {
      label,
      code: err?.code,
      message: err?.message
    });
  };
  const unsubPublished = onSnapshot(
    query(collection(db, 'books'), where('isDraft', '==', false)),
    (snapshot: QuerySnapshot) => {
      published = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      emit();
    },
    onErr('published')
  );
  const unsubMine = onSnapshot(
    query(collection(db, 'books'), where('authorUid', '==', uid)),
    (snapshot: QuerySnapshot) => {
      mine = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      emit();
    },
    onErr('mine')
  );
  return () => {
    unsubPublished();
    unsubMine();
  };
};

// ==================== GLOBAL SPOTLIGHT ====================

type SpotlightDoc = {
  spotlightBookId?: string;
  weekEpoch?: number;
  chosenIds?: string[];
  score?: number;
  source?: string;
};

// The Star of the Week is now selected SERVER-SIDE by the scheduled
// rotateSpotlight Cloud Function (functions/src/spotlight.ts), which is the
// single writer of appConfig/spotlight. The client only reads it via this
// subscription — there is no client-side selection / transaction anymore.
export const subscribeToGlobalSpotlight = (
  callback: (spotlight: SpotlightDoc | null) => void
): Unsubscribe => {
  return onSnapshot(
    doc(db, 'appConfig', 'spotlight'),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(snapshot.data() as SpotlightDoc);
    },
    () => {
      // Permission errors should not break app rendering.
      callback(null);
    }
  );
};

// Best-effort per-book favorites counter so the spotlight ranking has a real
// signal (favorites are otherwise stored only per-user). Fire-and-forget — must
// never gate the favorite UX. Mirrors the where('id','==') lookup used elsewhere.
export const adjustBookFavorite = async (bookId: string, delta: 1 | -1) => {
  const q = query(collection(db, 'books'), where('id', '==', bookId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  await updateDoc(snapshot.docs[0].ref, { favoritesTotal: increment(delta) });
};

// ==================== RELATIONSHIPS ====================

export const addRelationship = async (admirer: string, target: string) => {
  await addDoc(collection(db, 'relationships'), {
    admirer,
    target,
    timestamp: new Date().toISOString()
  });
};

export const removeRelationship = async (admirer: string, target: string) => {
  const q = query(collection(db, 'relationships'), where('admirer', '==', admirer), where('target', '==', target));
  const snapshot = await getDocs(q);
  for (const d of snapshot.docs) await deleteDoc(d.ref);
};

export const removeAllRelationshipsForUser = async (username: string) => {
  // Remove where user is admirer
  const q1 = query(collection(db, 'relationships'), where('admirer', '==', username));
  const s1 = await getDocs(q1);
  for (const d of s1.docs) await deleteDoc(d.ref);
  // Remove where user is target
  const q2 = query(collection(db, 'relationships'), where('target', '==', username));
  const s2 = await getDocs(q2);
  for (const d of s2.docs) await deleteDoc(d.ref);
};

export const removeRelationshipsBetween = async (user1: string, user2: string) => {
  await removeRelationship(user1, user2);
  await removeRelationship(user2, user1);
};

export const checkRelationshipExists = async (admirer: string, target: string): Promise<boolean> => {
  const q = query(collection(db, 'relationships'), where('admirer', '==', admirer), where('target', '==', target));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const subscribeToRelationships = (callback: (rels: any[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, 'relationships'), (snapshot: QuerySnapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

// ==================== CHAT MESSAGES ====================

export const sendChatMessage = async (from: string, to: string, text: string) => {
  const msg = {
    id: Math.random().toString(36).substr(2, 9),
    from,
    to,
    text,
    timestamp: new Date().toISOString(),
    read: false
  };
  await addDoc(collection(db, 'chatMessages'), msg);
  return msg;
};

export const markMessagesRead = async (from: string, to: string) => {
  const q = query(collection(db, 'chatMessages'), where('from', '==', from), where('to', '==', to));
  const snapshot = await getDocs(q);
  for (const d of snapshot.docs) {
    if (!d.data().read) await updateDoc(d.ref, { read: true });
  }
};

// Expire the current user's old DMs. A read/delete over the whole collection
// is rejected by the rules (only a participant may read/delete a message), so
// scope to messages the user sent or received — keyed by username.
export const deleteChatMessagesOlderThan = async (
  username: string,
  cutoffDate: string
) => {
  const queries = [
    query(collection(db, 'chatMessages'), where('from', '==', username)),
    query(collection(db, 'chatMessages'), where('to', '==', username))
  ];
  const seen = new Set<string>();
  for (const q of queries) {
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
      if (seen.has(d.ref.path)) continue;
      seen.add(d.ref.path);
      if (d.data().timestamp < cutoffDate) await deleteDoc(d.ref);
    }
  }
};

// Real-time listener for the current user's DMs.
//
// A listen on the whole chatMessages collection is rejected by the rules
// (read is limited to the two participants). The data model keys messages by
// USERNAME, so we run two rule-satisfiable listeners — messages I sent and
// messages I received — and merge them. Requires the `username` custom claim
// on the token (see ensureUsernameClaim); without it both listens are denied.
export const subscribeToChatMessages = (
  username: string,
  callback: (msgs: any[]) => void
): Unsubscribe => {
  let sent: any[] = [];
  let received: any[] = [];
  const emit = () => {
    const byId = new Map<string, any>();
    for (const m of sent) byId.set(m.id, m);
    for (const m of received) byId.set(m.id, m);
    callback(Array.from(byId.values()));
  };
  const onErr = (label: string) => (err: any) => {
    console.error('[chat] subscribeToChatMessages listener failed', {
      label,
      code: err?.code,
      message: err?.message
    });
  };
  const unsubSent = onSnapshot(
    query(collection(db, 'chatMessages'), where('from', '==', username)),
    (snapshot: QuerySnapshot) => {
      sent = snapshot.docs.map(d => ({ ...d.data() }));
      emit();
    },
    onErr('sent')
  );
  const unsubReceived = onSnapshot(
    query(collection(db, 'chatMessages'), where('to', '==', username)),
    (snapshot: QuerySnapshot) => {
      received = snapshot.docs.map(d => ({ ...d.data() }));
      emit();
    },
    onErr('received')
  );
  return () => {
    unsubSent();
    unsubReceived();
  };
};

// ==================== NOTIFICATIONS ====================

export const addNotificationDoc = async (notif: any) => {
  const sanitizedNotif = Object.fromEntries(
    Object.entries(notif).filter(([, value]) => value !== undefined)
  );
  await addDoc(collection(db, 'notifications'), sanitizedNotif);
};

export const markNotificationsRead = async (recipientUsername: string) => {
  const q = query(collection(db, 'notifications'), where('recipient', '==', recipientUsername));
  const snapshot = await getDocs(q);
  for (const d of snapshot.docs) {
    if (!d.data().read) await updateDoc(d.ref, { read: true });
  }
};

export const markNotificationRead = async (notificationId: string) => {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (err: any) {
    console.error('[MainWRLD] Failed to mark notification as read:', err);
  }
};

// Real-time listener for the current user's notifications.
//
// A listen on the whole notifications collection is rejected by the rules
// (read is limited to the recipient). Scope the listen to documents whose
// `recipient` is the current username. Requires the `username` custom claim
// on the token (see ensureUsernameClaim); without it the listen is denied.
export const subscribeToNotifications = (
  username: string,
  callback: (notifs: any[]) => void
): Unsubscribe => {
  return onSnapshot(
    query(collection(db, 'notifications'), where('recipient', '==', username)),
    (snapshot: QuerySnapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (err: any) => {
      console.error('[notifications] subscribeToNotifications listener failed', {
        code: err?.code,
        message: err?.message
      });
    }
  );
};

// ==================== COMMENTS ====================

export const addCommentDoc = async (comment: any) => {
  const commentRef = doc(collection(db, 'comments'));
  const commentWithId = {
    ...comment,
    id: comment.id || commentRef.id,
  };
  await setDoc(commentRef, commentWithId);
  return commentWithId.id;
};

export const updateComment = async (commentId: string, data: any) => {
  const commentRef = doc(db, 'comments', commentId);
  const commentDoc = await getDoc(commentRef);
  if (commentDoc.exists()) {
    await updateDoc(commentRef, data);
    return;
  }
  const q = query(collection(db, 'comments'), where('id', '==', commentId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) await updateDoc(snapshot.docs[0].ref, data);
};

export const removeCommentDoc = async (commentId: string) => {
  const commentRef = doc(db, 'comments', commentId);
  const commentDoc = await getDoc(commentRef);
  if (commentDoc.exists()) {
    await deleteDoc(commentRef);
    return;
  }
  const q = query(collection(db, 'comments'), where('id', '==', commentId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) await deleteDoc(snapshot.docs[0].ref);
};

export const removeCommentsByAuthor = async (authorUsername: string) => {
  const q = query(collection(db, 'comments'), where('authorUsername', '==', authorUsername));
  const snapshot = await getDocs(q);
  for (const d of snapshot.docs) await deleteDoc(d.ref);
};

export const subscribeToComments = (callback: (comments: any[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, 'comments'), (snapshot: QuerySnapshot) => {
    callback(snapshot.docs.map(d => {
      const data = d.data();
      return {
        docId: d.id,
        ...data,
        id: data.id || d.id,
      };
    }));
  });
};

// ==================== REPORTS ====================

export const addReportDoc = async (report: any) => {
  await addDoc(collection(db, 'reports'), report);
};

export const updateReportStatus = async (reportId: string, status: string) => {
  const q = query(collection(db, 'reports'), where('id', '==', reportId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) await updateDoc(snapshot.docs[0].ref, { status });
};

export const subscribeToReports = (callback: (reports: any[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, 'reports'), (snapshot: QuerySnapshot) => {
    callback(snapshot.docs.map(d => ({ ...d.data() })));
  });
};

// ==================== MODERATION: STRIKES & BANS (F04) ====================

// Increment a user's strike count by one (server-side increment() so two
// concurrent strikes can't clobber each other). `reportId`, when given, is
// recorded on the doc so the same report can't strike twice (idempotency,
// read back in useAdmin.applyStrike). Admin-path write — allowed by the
// `isAdmin()` branch of the users update rule.
export const addStrikeToUser = async (uid: string, reportId?: string) => {
  await updateDoc(doc(db, 'users', uid), {
    strikes: increment(1),
    lastStrikeAt: new Date().toISOString(),
    ...(reportId ? { struckByReportIds: arrayUnion(reportId) } : {}),
  });
};

// Permanently ban a user via the admin-only `banUser` Cloud Function. The
// function (Admin SDK) sets the `banned` custom claim, disables the Auth
// record, revokes refresh tokens and writes the profile mirror — none of
// which a client can do. Content is retained (no scrub); reversible via
// unbanUser. Mirrors the deleteCurrentAccount callable pattern.
export const banUser = async (uid: string): Promise<{ bannedUid: string }> => {
  const fn = httpsCallable<{ targetUid: string }, { bannedUid: string }>(
    getFunctions(),
    'banUser'
  );
  const res = await fn({ targetUid: uid });
  return res.data;
};

// Reverse a ban: clears the `banned` claim, re-enables the Auth record and
// resets strikes/ban fields on the profile. Admin-only (server-enforced).
export const unbanUser = async (uid: string): Promise<{ unbannedUid: string }> => {
  const fn = httpsCallable<{ targetUid: string }, { unbannedUid: string }>(
    getFunctions(),
    'unbanUser'
  );
  const res = await fn({ targetUid: uid });
  return res.data;
};
