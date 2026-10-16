export interface MovementType { id: string; description: string; coefficient: 1 | -1 }
export interface Account { id: string; code: string; description: string }
export interface Catalogs { movementTypes: MovementType[]; accounts: Account[]; taxAccounts: Account[] }
export interface HistoryDbg { id: string; date: string; movementType: string; coefficient: 1 | -1; amountCents: number; vatCents: number; perceptionCents: number; accountCode: string | null; accountName: string; detail: string | null }
export interface AccountPair { movementTypeId: string | null; accountId: string | null; vatAccountId: string | null; perceptionAccountId: string | null }
export type Origin = "decision" | "history" | "catalog" | "none";
export type DecisionResult = "accepted" | "corrected" | "rejected";
export type ChosenKind = "match" | "dbg" | "pending";
/** Lo que se había propuesto: `review` es un a-revisar del apareo, que como un apareo no enseña. */
export type ProposedKind = ChosenKind | "review";
/** Una decisión guardada, ya filtrada por empresa y banco. `lineRef` es `${statementId}:${lineId}` del cargo. */
export interface DecisionRow { lineRef: string; conceptKey: string; result: DecisionResult; proposedKind: ProposedKind; proposedPair: AccountPair | null; chosenKind: ChosenKind; chosenPair: AccountPair | null; decidedAt: string }
export const DBG_LIMITS = { decisions: 1500, decisionReconciliations: 50, history: 5000, accounts: 10000, movementTypes: 100, decisionsRead: 5000 } as const;
