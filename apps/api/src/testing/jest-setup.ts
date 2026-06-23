// Replace the firebase-admin FieldValue sentinels with plain { __fv__ } markers
// that FakeFirestore understands, while keeping the rest of the module real.
jest.mock('firebase-admin/firestore', () => {
  const actual = jest.requireActual('firebase-admin/firestore');
  const FieldValue = {
    serverTimestamp: () => ({ __fv__: 'serverTimestamp' }),
    increment: (n: number) => ({ __fv__: 'increment', n }),
    arrayUnion: (...v: unknown[]) => ({ __fv__: 'arrayUnion', v }),
    arrayRemove: (...v: unknown[]) => ({ __fv__: 'arrayRemove', v }),
    delete: () => ({ __fv__: 'delete' }),
  };
  return { ...actual, FieldValue };
});
