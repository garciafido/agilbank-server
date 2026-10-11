import { ServiceContext } from "../../service-context";

export type ServiceListWithCursorArgs<W, O, S> = {
  where?: W | null | undefined;
  orderBy: O;
  select: S;
  cursorKey: string | null | undefined;
  context: ServiceContext;
  take: number;
};

export type ServiceListWithOffsetArgs<W, O, S> = {
  where?: W | null | undefined;
  orderBy: O;
  select: S;
  offset: number;
  context: ServiceContext;
  take: number;
};
