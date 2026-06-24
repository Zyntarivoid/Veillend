declare module 'zustand' {
  type StateCreator<T> = (
    set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
    get: () => T,
    store: any
  ) => T;

  interface UseStore<T> {
    (): T;
    setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
    getState: () => T;
  }

  export function create<T>(stateCreator: StateCreator<T>): UseStore<T>;
}
