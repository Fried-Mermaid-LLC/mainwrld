import { api } from '@/lib/apiClient';
import type { ChatMessage } from '@mainwrld/types';

export const chatApi = {
  // Server-merged sent + received for the current user.
  list: () => api.get<ChatMessage[]>('/chat/messages'),
  send: (to: string, text: string) =>
    api.post<ChatMessage>('/chat/messages', { to, text }),
  markRead: (peer: string) =>
    api.post<void>(`/chat/conversations/${encodeURIComponent(peer)}/read`),
};
