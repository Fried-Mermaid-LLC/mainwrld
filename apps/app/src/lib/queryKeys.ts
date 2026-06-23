// Query key factory — one place so invalidation stays consistent.
export const qk = {
  books: ['books'] as const,
  spotlight: ['spotlight'] as const,
  users: ['users'] as const,
  relationships: ['relationships'] as const,
  comments: ['comments'] as const,
  reports: ['reports'] as const,
  notifications: (username: string) => ['notifications', username] as const,
  chat: (username: string) => ['chat', username] as const,
  purchases: (uid: string) => ['purchases', uid] as const,
  chapterContent: (bookId: string, chapterId: string) =>
    ['chapter', bookId, chapterId] as const,
};
