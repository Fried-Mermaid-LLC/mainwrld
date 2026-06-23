import { api } from '@/lib/apiClient';

export const commentsApi = {
  list: (bookId?: string) =>
    api.get<any[]>(
      bookId ? `/comments?bookId=${encodeURIComponent(bookId)}` : '/comments'
    ),
  create: (data: {
    bookId: string;
    chapterIndex?: number;
    author: string;
    text: string;
  }) => api.post<{ id: string }>('/comments', data),
  update: (
    id: string,
    data: { text?: string; likes?: number; likedBy?: string[] }
  ) => api.patch<void>(`/comments/${encodeURIComponent(id)}`, data),
  remove: (id: string) => api.del<void>(`/comments/${encodeURIComponent(id)}`),
};
