/** Owner-only, versioned, multi-account persistence for Google Antigravity. */
export declare const ACCOUNTS_RECORD_VERSION: 1;
export interface CachedAccount {
    readonly id: string;
    readonly email?: string | undefined;
    readonly maskedEmail?: string | undefined;
    readonly projectId: string;
    readonly refreshToken: string;
    readonly updatedAt: string;
    readonly lineage?: string | undefined;
}
export interface AccountsData {
    readonly version: typeof ACCOUNTS_RECORD_VERSION;
    readonly activeId: string | undefined;
    readonly accounts: readonly CachedAccount[];
}
export interface AccountStoreOptions {
    readonly now?: () => number;
    readonly platform?: NodeJS.Platform;
}
export interface RefreshTokenSync {
    readonly accountId: string;
    readonly refreshToken: string;
    readonly previousRefreshToken?: string;
    readonly lineage?: string | undefined;
}
export interface AntigravityAccountStore {
    readonly path: string;
    read(): Promise<AccountsData>;
    saveAccount(draft: {
        readonly email?: string | undefined;
        readonly projectId: string;
        readonly refreshToken: string;
        readonly updatedAt?: string | undefined;
        readonly lineage?: string | undefined;
        readonly id?: string | undefined;
    }): Promise<{
        activeId: string;
        account: CachedAccount;
        isNew: boolean;
    }>;
    setActive(idOrEmailOrIndex: string): Promise<CachedAccount | undefined>;
    removeAccount(idOrEmailOrIndex: string, expected?: CachedAccount): Promise<CachedAccount | undefined>;
    /** Update one cached account by stable id. Never falls back to the current active account. */
    syncRefreshToken(update: RefreshTokenSync): Promise<boolean>;
    list(): Promise<{
        activeId: string | undefined;
        accounts: readonly (CachedAccount & {
            isActive: boolean;
            index: number;
        })[];
    }>;
}
/** Resolve the companion accounts.json path next to auth.json. */
export declare function defaultAccountStorePath(authStorePath: string): string;
/** Generate a guaranteed unique account ID that never collides with deleted or existing accounts. */
export declare function nextAccountId(accounts: readonly CachedAccount[]): string;
/** Match an account by 1-based index, id, or email (exact or prefix). */
export declare function findMatchingAccount(accounts: readonly CachedAccount[], query: string): {
    account: CachedAccount;
    index: number;
} | undefined;
/** Create the multi-account store managing accounts.json. */
export declare function createAccountStore(accountsPath: string, authStorePath: string, options?: AccountStoreOptions): AntigravityAccountStore;
/** In-memory account store for tests and in-memory auth compositions. */
export declare function createMemoryAccountStore(authStore?: {
    read(): Promise<{
        refreshToken: string;
        projectId: string;
        email?: string;
        updatedAt?: string;
        lineage?: string;
    } | undefined>;
}): AntigravityAccountStore;
//# sourceMappingURL=account-store.d.ts.map