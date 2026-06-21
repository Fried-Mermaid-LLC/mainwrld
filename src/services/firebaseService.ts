import { auth, db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
  runTransaction,
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
    isOnline: true,
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

export const getUserProfile = async (uid: string) => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) return null;
  return { uid, ...userDoc.data() };
};

export const updateUserProfile = async (uid: string, data: Partial<DocumentData>) => {
  await updateDoc(doc(db, 'users', uid), data);
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

export const createBook = async (bookData: any) => {
  const bookRef = doc(collection(db, 'books'));
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
};

const SPOTLIGHT_MS = 7 * 24 * 60 * 60 * 1000;

const getWeekEpoch = () => Math.floor(Date.now() / SPOTLIGHT_MS);

const sortSpotlightCandidates = (books: any[]) => {
  return [...books].sort((a, b) => {
    const favDiff = (b.favoritesLastWeek || 0) - (a.favoritesLastWeek || 0);
    if (favDiff !== 0) return favDiff;
    return new Date(b.publishedDate || 0).getTime() - new Date(a.publishedDate || 0).getTime();
  });
};

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

export const ensureGlobalSpotlight = async (books: any[]) => {
  const candidates = sortSpotlightCandidates(books.filter((b: any) => b?.id && !b.isDraft));
  if (candidates.length === 0) return null;

  const spotlightRef = doc(db, 'appConfig', 'spotlight');
  const candidateIds = new Set(candidates.map((b: any) => b.id));
  const currentWeekEpoch = getWeekEpoch();

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(spotlightRef);
    const data = snapshot.exists() ? (snapshot.data() as SpotlightDoc) : {};

    const chosenIds = Array.isArray(data.chosenIds)
      ? data.chosenIds.filter((id: string) => candidateIds.has(id))
      : [];
    const storedWeekEpoch = typeof data.weekEpoch === 'number' ? data.weekEpoch : -1;
    const storedSpotlightBookId = typeof data.spotlightBookId === 'string' ? data.spotlightBookId : '';
    const storedStillValid = !!storedSpotlightBookId && candidateIds.has(storedSpotlightBookId);

    if (storedWeekEpoch === currentWeekEpoch && storedStillValid) {
      return {
        spotlightBookId: storedSpotlightBookId,
        weekEpoch: storedWeekEpoch,
        chosenIds,
      };
    }

    let nextChosenIds = [...chosenIds];
    let unchosen = candidates.filter((b: any) => !nextChosenIds.includes(b.id));
    if (unchosen.length === 0) {
      nextChosenIds = [];
      unchosen = [...candidates];
    }

    const chosen = unchosen[0] || candidates[0];
    const nextState = {
      spotlightBookId: chosen.id,
      weekEpoch: currentWeekEpoch,
      chosenIds: [...nextChosenIds, chosen.id],
      updatedAt: serverTimestamp(),
    };

    tx.set(spotlightRef, nextState, { merge: true });
    return nextState;
  });
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
