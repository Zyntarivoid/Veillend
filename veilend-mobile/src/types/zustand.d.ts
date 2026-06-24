declare module 'zustand' {
  type StateCreator<T> = (
    set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
    get: () => T,
    store: any
  ) => T;

  type UseStore<T> = {
    (): T;
    <U>(selector: (state: T) => U): U;
    setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
    getState: () => T;
  };

  export function create<T>(stateCreator: StateCreator<T>): UseStore<T>;
}
