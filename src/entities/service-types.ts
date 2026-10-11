import { ServiceContext } from "../service-context";

// export type ServiceOneArgs<S> = {
//     context: ServiceContext,
//     id: string
//     select: S,
// };

export type ServiceListArgs<W, O, S> = {
  context: ServiceContext;
  pageSize?: number | null;
  pageNumber?: number | null;
  lastSortedColumn?: string | null;
  nextValueOfSortedColumn?: string | null;
  where?: W | null | undefined;
  orderBy?: O | undefined;
  select: S;
};

export type ServiceCreateArgs<D> = {
  context: ServiceContext;
  data: D;
};

export type ServiceUpdateArgs<D, S> = {
  context: ServiceContext;
  data: D;
  select: S;
};

export type ServiceDeleteArgs = {
  context: ServiceContext;
  id: string;
};
