export const isNil = (x: any) => x === undefined || x === null;
export const nullToUndefined = <T>(x: T): Exclude<T, null> | undefined =>
  x === null ? undefined : (x as Exclude<T, null>);
export const nullToUndefinedRecursive = <T>(o: T): WithoutNull<T> => {
  if (Array.isArray(o)) {
    return o.map(nullToUndefinedRecursive) as WithoutNull<T>;
  }
  return o as WithoutNull<T>;
};

// Un Date (el escalar Date de GraphQL, en un where) queda como Date: sus métodos no
// son datos que haya que limpiar de null.
type WithoutNull<T> = T extends Date
  ? T
  : T extends Array<infer I>
  ? Array<WithoutNull<I>>
  : T extends object
  ? { [K in keyof T]: WithoutNull<T[K]> }
  : Exclude<T, null>;
