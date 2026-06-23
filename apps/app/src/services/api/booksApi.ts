import { api } from '@/lib/apiClient';

// Raw book/chapter docs (same wire shape the client already converts in hooks).
export const booksApi = {
  list: () => api.get<any[]>('/books'),
  get: (id: string) => api.get<any>(`/books/${id}`),
  create: (data: any) => api.post<any>('/books', data),
  update: (id: string, data: any) => api.patch<any>(`/books/${id}`, data),
  remove: (id: string) => api.del<void>(`/books/${id}`),
  uploadCover: (id: string, dataUrl: string, oldPath?: string) =>
    api.post<{ url: string; path: string }>(`/books/${id}/cover`, {
      dataUrl,
      oldPath,
    }),
  favorite: (id: string, delta: 1 | -1) =>
    api.post<void>(`/books/${id}/favorite`, { delta }),

  // ---- chapters subcollection ----
  listChapters: (bookId: string) =>
    api.get<any[]>(`/books/${bookId}/chapters`),
  getChapter: (bookId: string, chapterId: string) =>
    api.get<any>(`/books/${bookId}/chapters/${chapterId}`),
  // Reader gateway (paywall-enforced).
  getChapterContent: (bookId: string, chapterId: string) =>
    api.get<{ title: string; content: string }>(
      `/books/${bookId}/chapters/${chapterId}/content`
    ),
  commitChapter: (
    bookId: string,
    chapterId: string,
    data: {
      content: string;
      order: number;
      title: string;
      authorUsername?: string;
      isDraft?: boolean;
      bookUpdates?: Record<string, unknown>;
    }
  ) => api.put<void>(`/books/${bookId}/chapters/${chapterId}`, data),
  deleteChapter: (
    bookId: string,
    chapterId: string,
    bookUpdates?: Record<string, unknown>
  ) =>
    api.del<void>(`/books/${bookId}/chapters/${chapterId}`, { bookUpdates }),

  // ---- spotlight ----
  getSpotlight: () =>
    api.get<{ spotlightBookId?: string } | null>('/spotlight'),
};
