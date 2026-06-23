/* eslint-disable @typescript-eslint/no-explicit-any */
// Lightweight in-memory Firestore double for unit tests. Supports the subset the
// services use: collection/doc/get/set(merge)/update/delete, where/orderBy/limit,
// add, count, runTransaction, batch, recursiveDelete, subcollections, and the
// FieldValue sentinels (mocked in jest-setup.ts as { __fv__ }). Not a complete
// Firestore — just enough to exercise real service logic deterministically.

type Doc = Record<string, any>;

function deepEq(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Apply a write payload onto an existing doc, resolving FieldValue sentinels.
function applyOps(target: Doc, data: Doc, merge: boolean): Doc {
  const out: Doc = merge ? { ...target } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && '__fv__' in v) {
      const fv = v as any;
      switch (fv.__fv__) {
        case 'delete':
          delete out[k];
          continue;
        case 'serverTimestamp':
          out[k] = new Date('2026-01-01T00:00:00.000Z');
          continue;
        case 'increment':
          out[k] = (Number(out[k]) || 0) + fv.n;
          continue;
        case 'arrayUnion': {
          const arr = Array.isArray(out[k]) ? [...out[k]] : [];
          for (const x of fv.v) if (!arr.some((e) => deepEq(e, x))) arr.push(x);
          out[k] = arr;
          continue;
        }
        case 'arrayRemove': {
          const arr = Array.isArray(out[k]) ? [...out[k]] : [];
          out[k] = arr.filter((e) => !fv.v.some((x: any) => deepEq(e, x)));
          continue;
        }
      }
    }
    out[k] = v;
  }
  return out;
}

interface WhereClause {
  field: string;
  op: string;
  value: any;
}

function matches(data: Doc, clauses: WhereClause[]): boolean {
  return clauses.every(({ field, op, value }) => {
    const v = data[field];
    switch (op) {
      case '==':
        return v === value;
      case '!=':
        return v !== value;
      case '>':
        return v > value;
      case '>=':
        return v >= value;
      case '<':
        return v < value;
      case '<=':
        return v <= value;
      case 'array-contains':
        return Array.isArray(v) && v.includes(value);
      case 'in':
        return Array.isArray(value) && value.includes(v);
      default:
        return false;
    }
  });
}

export class FakeSnapshot {
  constructor(
    public readonly id: string,
    private readonly _data: Doc | undefined,
    public readonly ref: FakeDocRef,
  ) {}
  get exists() {
    return this._data !== undefined;
  }
  data() {
    return this._data ? { ...this._data } : undefined;
  }
}

export class FakeDocRef {
  constructor(
    public readonly id: string,
    private readonly store: FakeFirestore,
    private readonly path: string,
  ) {}

  collection(name: string) {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }

  async get(): Promise<FakeSnapshot> {
    return new FakeSnapshot(this.id, this.store._read(this.path), this);
  }

  async set(data: Doc, opts?: { merge?: boolean }): Promise<void> {
    const existing = this.store._read(this.path);
    this.store._write(this.path, applyOps(existing ?? {}, data, !!opts?.merge));
  }

  async update(data: Doc): Promise<void> {
    const existing = this.store._read(this.path);
    if (existing === undefined) throw new Error('No document to update');
    this.store._write(this.path, applyOps(existing, data, true));
  }

  async delete(): Promise<void> {
    this.store._delete(this.path);
  }
}

class FakeQuery {
  constructor(
    private readonly store: FakeFirestore,
    private readonly collectionPath: string,
    private readonly clauses: WhereClause[] = [],
    private readonly orderField?: string,
    private readonly limitN?: number,
  ) {}

  where(field: string, op: string, value: any) {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      [...this.clauses, { field, op, value }],
      this.orderField,
      this.limitN,
    );
  }
  orderBy(field: string) {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      this.clauses,
      field,
      this.limitN,
    );
  }
  limit(n: number) {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      this.clauses,
      this.orderField,
      n,
    );
  }

  private resolve(): FakeSnapshot[] {
    let entries = this.store._collectionDocs(this.collectionPath).filter((e) =>
      matches(e.data, this.clauses),
    );
    if (this.orderField) {
      entries = [...entries].sort((a, b) => {
        const av = a.data[this.orderField!];
        const bv = b.data[this.orderField!];
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }
    if (this.limitN !== undefined) entries = entries.slice(0, this.limitN);
    return entries.map(
      (e) =>
        new FakeSnapshot(
          e.id,
          e.data,
          new FakeDocRef(e.id, this.store, `${this.collectionPath}/${e.id}`),
        ),
    );
  }

  async get() {
    const docs = this.resolve();
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (cb: (d: FakeSnapshot) => void) => docs.forEach(cb),
    };
  }

  count() {
    return {
      get: async () => ({ data: () => ({ count: this.resolve().length }) }),
    };
  }
}

export class FakeCollectionRef extends FakeQuery {
  constructor(
    private readonly _store: FakeFirestore,
    private readonly _path: string,
  ) {
    super(_store, _path);
  }
  doc(id?: string) {
    const realId = id ?? this._store._autoId();
    return new FakeDocRef(realId, this._store, `${this._path}/${realId}`);
  }
  async add(data: Doc) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class FakeBatch {
  private ops: Array<() => void> = [];
  constructor(private readonly store: FakeFirestore) {}
  set(ref: FakeDocRef, data: Doc, opts?: { merge?: boolean }) {
    this.ops.push(() => void ref.set(data, opts));
  }
  update(ref: FakeDocRef, data: Doc) {
    this.ops.push(() => void ref.update(data));
  }
  delete(ref: FakeDocRef) {
    this.ops.push(() => void ref.delete());
  }
  async commit() {
    for (const op of this.ops) op();
  }
}

export class FakeFirestore {
  // path -> doc data. Subcollections are encoded in the path.
  private data = new Map<string, Doc>();
  private idCounter = 0;

  _autoId() {
    return `auto_${++this.idCounter}`;
  }
  _read(path: string): Doc | undefined {
    const v = this.data.get(path);
    return v ? { ...v } : undefined;
  }
  _write(path: string, doc: Doc) {
    this.data.set(path, doc);
  }
  _delete(path: string) {
    this.data.delete(path);
  }
  _collectionDocs(collectionPath: string): Array<{ id: string; data: Doc }> {
    const out: Array<{ id: string; data: Doc }> = [];
    for (const [path, doc] of this.data.entries()) {
      const rest = path.startsWith(`${collectionPath}/`)
        ? path.slice(collectionPath.length + 1)
        : null;
      // Direct child only (no nested subcollection segments).
      if (rest && !rest.includes('/')) out.push({ id: rest, data: doc });
    }
    return out;
  }

  collection(name: string) {
    return new FakeCollectionRef(this, name);
  }
  doc(path: string) {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    return new FakeDocRef(id, this, path);
  }
  batch() {
    return new FakeBatch(this);
  }
  async runTransaction<T>(fn: (t: any) => Promise<T>): Promise<T> {
    // Applies writes immediately (no isolation) — sufficient for replay/idempotency tests.
    const t = {
      get: (ref: FakeDocRef) => ref.get(),
      set: (ref: FakeDocRef, data: Doc, opts?: { merge?: boolean }) =>
        void ref.set(data, opts),
      update: (ref: FakeDocRef, data: Doc) => void ref.update(data),
      delete: (ref: FakeDocRef) => void ref.delete(),
    };
    return fn(t);
  }
  async recursiveDelete(ref: FakeDocRef) {
    const path = (ref as any).path as string;
    for (const key of [...this.data.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) this.data.delete(key);
    }
  }
  settings() {
    /* no-op */
  }

  // ---- test helpers ----
  seed(path: string, doc: Doc) {
    this.data.set(path, doc);
    return this;
  }
  dump(path: string) {
    return this._read(path);
  }
  all() {
    return new Map(this.data);
  }
}
