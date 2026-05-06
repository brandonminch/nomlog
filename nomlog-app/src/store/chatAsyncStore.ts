import { create } from 'zustand';

type ChatAsyncState = {
  pendingRequestIds: string[];
  addPendingRequestId: (requestId: string) => void;
  removePendingRequestId: (requestId: string) => void;
  clearPendingRequestIds: () => void;
};

export const useChatAsyncStore = create<ChatAsyncState>((set) => ({
  pendingRequestIds: [],
  addPendingRequestId: (requestId) =>
    set((s) => {
      if (!requestId || typeof requestId !== 'string') return s;
      if (s.pendingRequestIds.includes(requestId)) return s;
      return { pendingRequestIds: [...s.pendingRequestIds, requestId] };
    }),
  removePendingRequestId: (requestId) =>
    set((s) => ({ pendingRequestIds: s.pendingRequestIds.filter((id) => id !== requestId) })),
  clearPendingRequestIds: () => set({ pendingRequestIds: [] }),
}));

