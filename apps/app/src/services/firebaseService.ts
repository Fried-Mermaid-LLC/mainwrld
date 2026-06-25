// REST facade. Keeps the exact public API the hooks/views already import, but
// every call now goes through the NestJS API (apps/api) instead of the Firebase
// client SDK. The `subscribeTo*` functions preserve their callback contract:
// chat/notifications use SSE; the rest poll. Pure Firebase Auth stays in
// authService. This lets the hooks + AppProvider stay untouched.
import * as authService from '@/services/authService';
import { usersApi } from '@/services/api/usersApi';
import { booksApi } from '@/services/api/booksApi';
import { socialApi } from '@/services/api/socialApi';
import { chatApi } from '@/services/api/chatApi';
import { notificationsApi } from '@/services/api/notificationsApi';
import { commentsApi } from '@/services/api/commentsApi';
import { adminApi } from '@/services/api/adminApi';
import { paymentsApi } from '@/services/api/paymentsApi';
import { sseClient } from '@/lib/sseClient';

type Unsub = () => void;
type Cb<T> = (data: T) => void;

// Generic poller: fires immediately, then on an interval. Swallows errors.
function poll<T>(
  fetcher: () => Promise<T>,
  cb: Cb<T>,
  intervalMs: number
): Unsub {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const data = await fetcher();
      if (!stopped) cb(data);
    } catch {
      /* transient — next tick retries */
    }
  };
  void tick();
  const id = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}

// ==================== AUTH ====================

export const signUp = async (
  email: string,
  password: string,
  username: string,
  displayName: string,
  birthDate: string
) => {
  const credential = await authService.signUpAuth(email, password);
  const uid = credential.user.uid;
  // Create the profile + username claim server-side (COPPA enforced there).
  await usersApi.createProfile({ username, displayName, birthDate });
  // Refresh so the username claim lands in the token before scoped requests.
  try {
    await credential.user.getIdToken(true);
  } catch {
    /* claim lands on next rotation */
  }
  return { uid, username, displayName, email, birthDate };
};

export const logIn = async (emailOrUsername: string, password: string) => {
  let email = emailOrUsername;
  if (!emailOrUsername.includes('@')) {
    const resolved = await authService.resolveUsernameEmail(emailOrUsername);
    if (!resolved) {
      throw new Error('Please log in with your email address instead of username.');
    }
    email = resolved;
  }
  const credential = await authService.logInAuth(email, password);
  const uid = credential.user.uid;
  // getMe enforces the ban gate server-side (403 banned).
  let profile: any;
  try {
    profile = await usersApi.getMe();
  } catch (err: any) {
    if (err?.code === 'banned' || err?.status === 403) {
      await authService.logOut().catch(() => {});
      throw new Error(
        'This account has been suspended for repeated community guideline violations.'
      );
    }
    throw err;
  }
  return { uid, ...profile };
};

export const logOut = authService.logOut;
export const onAuthChange = authService.onAuthChange;
export const getCurrentFirebaseUser = authService.getCurrentFirebaseUser;
export const ensureUsernameClaim = authService.ensureUsernameClaim;
export const changePassword = authService.changePassword;
export const changeEmail = authService.changeEmail;
export const verifyResetCode = authService.verifyResetCode;
export const completePasswordReset = authService.completePasswordReset;
export const moderateUsername = authService.moderateUsername;

export const checkUsernameAvailable = async (
  username: string
): Promise<boolean> => {
  try {
    const res = await usersApi.checkUsername(username);
    return res.available;
  } catch {
    return false;
  }
};

export const getUserProfile = async (uid: string) => {
  try {
    return await usersApi.getById(uid);
  } catch {
    return null;
  }
};

export const updateUserProfile = async (uid: string, data: any) => {
  const current = authService.getCurrentFirebaseUser();
  if (current && current.uid === uid) {
    await usersApi.patchMe(data);
    return;
  }
  // Admin edits to ANOTHER user's profile (e.g. handleRemoveStrike) have no
  // self-patch path; ban/unban/strikes/setAdmin use dedicated admin endpoints.
  console.warn(
    '[firebaseService] updateUserProfile for non-self uid is a no-op (needs admin endpoint):',
    uid
  );
};

// Server-authoritative daily points claim (cooldown + 25/day cap enforced
// server-side). Returns the claim outcome + refreshed profile.
export const claimDailyPoints = () => usersApi.claimDaily();

// Spend 150 points for a coupon-wheel spin (the coupon itself stays
// client-managed; this only debits the server-owned balance).
export const spinCouponWheel = () => usersApi.spin();

export const deleteCurrentAccount = async () => {
  try {
    await usersApi.deleteMe();
  } finally {
    await authService.logOut().catch(() => {});
  }
};

export const verifyAppleReceipt = (params: {
  productId: string;
  transactionId: string;
  appStoreReceipt: string;
}) => paymentsApi.verifyAppleReceipt(params);

// ==================== USERS ====================

export const getAllUsers = () => usersApi.list();
export const getUserByUsername = async (username: string) => {
  try {
    return await usersApi.getByUsername(username);
  } catch {
    return null;
  }
};
export const subscribeToUsers = (cb: Cb<any[]>): Unsub =>
  poll(() => usersApi.list(), cb, 60_000);

export const addFcmToken = (_uid: string, token: string) =>
  usersApi.addFcmToken(token);
export const removeFcmToken = (_uid: string, token: string) =>
  usersApi.removeFcmToken(token);
export const addBookToLibrary = (_uid: string, bookId: string) =>
  usersApi.addToLibrary(bookId);
export const recordBookPurchase = (_uid: string, bookId: string) =>
  // Library add only; permanent purchasedBookIds is server-granted.
  usersApi.addToLibrary(bookId);
export const removeBookFromLibrary = (_uid: string, bookId: string) =>
  usersApi.removeFromLibrary(bookId);
export const getBookPurchases = (_uid: string) => usersApi.getPurchases();

// ==================== BOOKS ====================

export const newBookId = (): string => crypto.randomUUID();
export const createBook = (data: any) => booksApi.create(data);
export const updateBook = (id: string, data: any) => booksApi.update(id, data);
export const deleteBook = (id: string) => booksApi.remove(id);
export const getBook = async (id: string) => {
  try {
    return await booksApi.get(id);
  } catch {
    return null;
  }
};
export const getAllBooks = () => booksApi.list();
export const adjustBookFavorite = (bookId: string, delta: 1 | -1) =>
  booksApi.favorite(bookId, delta);
// Server-authoritative per-chapter like toggle (replaces writing the likes array
// directly). Awards the author points + notifies on milestones server-side.
export const likeChapter = (bookId: string, chapterIndex: number) =>
  booksApi.likeChapter(bookId, chapterIndex);

// ---- chapters ----
export const newChapterId = (_bookId: string): string => crypto.randomUUID();
export const getChapter = async (bookId: string, chapterId: string) => {
  try {
    return await booksApi.getChapter(bookId, chapterId);
  } catch {
    return null;
  }
};
export const getChapters = (bookId: string) => booksApi.listChapters(bookId);
export const saveChapter = (
  bookId: string,
  chapterId: string,
  data: { content: string; order: number; title: string; authorUsername?: string }
) => booksApi.commitChapter(bookId, chapterId, data);
export const deleteChapterDoc = (bookId: string, chapterId: string) =>
  booksApi.deleteChapter(bookId, chapterId);
export const commitChapterWrite = (
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
) => booksApi.commitChapter(bookId, chapterId, { ...chapterData, bookUpdates });
export const commitChapterDelete = (
  bookId: string,
  chapterId: string,
  bookUpdates: Record<string, any>
) => booksApi.deleteChapter(bookId, chapterId, bookUpdates);
export const fetchChapterContent = (bookId: string, chapterId: string) =>
  booksApi.getChapterContent(bookId, chapterId);

// ---- covers ----
export const uploadCover = (
  _authorUid: string,
  bookId: string,
  dataUrl: string
): Promise<{ url: string; path: string }> =>
  booksApi.uploadCover(bookId, dataUrl);
export const deleteCoverByPath = async (_path: string): Promise<void> => {
  // Old-cover cleanup now happens server-side when a new cover is uploaded with
  // its oldPath; a standalone delete endpoint isn't exposed. No-op (best-effort).
};

export const subscribeToBooksChanges = (
  _uid: string,
  cb: Cb<any[]>
): Unsub => poll(() => booksApi.list(), cb, 30_000);

export const subscribeToGlobalSpotlight = (
  cb: Cb<{ spotlightBookId?: string } | null>
): Unsub => poll(() => booksApi.getSpotlight(), cb, 60 * 60_000);

// ==================== RELATIONSHIPS ====================

export const addRelationship = (_admirer: string, target: string) =>
  socialApi.add(target);
export const removeRelationship = (_admirer: string, target: string) =>
  socialApi.remove(target);
export const removeRelationshipsBetween = (_user1: string, user2: string) =>
  // Server scopes removal to the caller's outgoing edge.
  socialApi.remove(user2);
export const removeAllRelationshipsForUser = async (_username: string) => {
  // Handled server-side by account deletion; no standalone client path.
};
export const checkRelationshipExists = async (
  _admirer: string,
  target: string
): Promise<boolean> => {
  try {
    return (await socialApi.exists(target)).exists;
  } catch {
    return false;
  }
};
export const subscribeToRelationships = (cb: Cb<any[]>): Unsub =>
  poll(() => socialApi.list(), cb, 30_000);

// ==================== CHAT (SSE) ====================

export const sendChatMessage = (
  _from: string,
  to: string,
  text: string,
  _senderIsPremium = false
) => chatApi.send(to, text);

export const markMessagesRead = (from: string, _to: string) =>
  chatApi.markRead(from);

export const subscribeToChatMessages = (
  _username: string,
  cb: Cb<any[]>
): Unsub => {
  let messages: any[] = [];
  const load = async () => {
    try {
      messages = await chatApi.list();
      cb([...messages]);
    } catch {
      /* ignore */
    }
  };
  void load();
  const sse = sseClient.subscribeChat((data) => {
    const m = data as any;
    if (!m?.id) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx >= 0) messages[idx] = m;
    else messages = [...messages, m];
    cb([...messages]);
  });
  const fallback = setInterval(() => void load(), 60_000);
  return () => {
    sse.close();
    clearInterval(fallback);
  };
};

// ==================== NOTIFICATIONS (SSE) ====================

export const addNotificationDoc = (notif: any) =>
  notificationsApi.create(notif);
export const markNotificationsRead = (_recipient: string) =>
  notificationsApi.markAllRead();
export const markNotificationRead = (id: string) =>
  notificationsApi.markRead(id).catch(() => {});

export const subscribeToNotifications = (
  _username: string,
  cb: Cb<any[]>
): Unsub => {
  let items: any[] = [];
  const load = async () => {
    try {
      items = await notificationsApi.list();
      cb([...items]);
    } catch {
      /* ignore */
    }
  };
  void load();
  const sse = sseClient.subscribeNotifications((data) => {
    const n = data as any;
    if (!n?.id) return;
    const idx = items.findIndex((x) => x.id === n.id);
    if (idx >= 0) items[idx] = n;
    else items = [n, ...items];
    cb([...items]);
  });
  const fallback = setInterval(() => void load(), 60_000);
  return () => {
    sse.close();
    clearInterval(fallback);
  };
};

// ==================== COMMENTS ====================

export const addCommentDoc = async (comment: any): Promise<string> => {
  const res = await commentsApi.create({
    bookId: comment.bookId,
    chapterIndex: comment.chapterIndex,
    author: comment.author,
    text: comment.text,
  });
  return res.id;
};
export const updateComment = (commentId: string, data: any) =>
  commentsApi.update(commentId, data);
export const removeCommentDoc = (commentId: string) =>
  commentsApi.remove(commentId);
export const removeCommentsByAuthor = async (_authorUsername: string) => {
  // Handled server-side by account deletion.
};
export const subscribeToComments = (cb: Cb<any[]>): Unsub =>
  poll(() => commentsApi.list(), cb, 20_000);

// ==================== REPORTS ====================

export const addReportDoc = (report: any) =>
  adminApi.fileReport({
    type: report.type,
    targetId: report.targetId,
    ...(report.reason ? { reason: report.reason } : {})
  });
export const updateReportStatus = (reportId: string, status: string) =>
  adminApi.updateReportStatus(
    reportId,
    status as 'pending' | 'resolved' | 'dismissed'
  );
export const subscribeToReports = (cb: Cb<any[]>): Unsub =>
  poll(() => adminApi.listReports(), cb, 30_000);

// ==================== MODERATION: STRIKES & BANS ====================

export const addStrikeToUser = (uid: string, reportId?: string) =>
  adminApi.addStrike(uid, reportId);
export const removeStrikeFromUser = (uid: string) =>
  adminApi.removeStrike(uid);
export const banUser = (uid: string) => adminApi.ban(uid);
export const unbanUser = (uid: string) => adminApi.unban(uid);
export const takeDownBook = (bookId: string) => adminApi.takeDownBook(bookId);
