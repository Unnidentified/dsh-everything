/** Host-side Antigravity risk gate, OAuth coordinator, and credential commit boundary. */
import type { AntigravityAuthStore } from './auth-store.ts';
import { type CredentialCoordinatorOptions, type HostCredential } from './credential-coordinator.ts';
import type { OAuthFlowCompletionResult, OAuthFlowOptions } from './oauth-flow.ts';
import type { ProjectDiscoveryOptions } from './project-context.ts';
import type { AntigravityStatusView, BootstrapStatusService, RiskAcknowledgementResult, LoginActionResult, LoginStartResult, CapabilityGateEvidence, LlmFamilyId } from './status.ts';
import { type QuotaServiceOptions } from './quota.ts';
import { type CapabilityGateRegistry } from './capability-gates.ts';
import type { CapabilityGateOutcome, CapabilityRowId } from './status.ts';
export declare const USERINFO_ENDPOINT: "https://www.googleapis.com/oauth2/v3/userinfo";
/**
 * Fetch the account email through the Google userinfo endpoint. Antigravity
 * requests `userinfo.email` but not `openid`, so the token exchange never
 * carries an `id_token`; userinfo is the only email source for this flow.
 * @param accessToken - live bearer token for the current account.
 * @returns the raw email, or undefined when the probe cannot answer.
 */
export declare function fetchUserEmail(accessToken: string): Promise<string | undefined>;
export interface AntigravityAuthServiceOptions {
    readonly store?: AntigravityAuthStore;
    readonly storePath?: string;
    /** Multi-account cache; in-memory when the auth store is injected without a path. */
    readonly accountStore?: AntigravityAccountStore;
    readonly flowOptions?: Omit<OAuthFlowOptions, 'commit' | 'validateProject'>;
    /** Inject a complete private transport only for deterministic Host tests. */
    readonly projectOptions?: ProjectDiscoveryOptions;
    readonly credentialOptions?: Omit<CredentialCoordinatorOptions, 'store'>;
    readonly quotaOptions?: Omit<QuotaServiceOptions, 'auth'>;
    readonly gates?: CapabilityGateRegistry;
    readonly gatePath?: string;
    readonly autoActivateGates?: boolean;
    /**
     * Resolve the account email from a live access token. Absent by default so
     * unit compositions never egress; the production mount wires
     * {@link fetchUserEmail}.
     */
    readonly fetchEmail?: (accessToken: string) => Promise<string | undefined>;
}
import { type AntigravityAccountStore, type CachedAccount } from './account-store.ts';
export type { CachedAccount } from './account-store.ts';
export declare class AntigravityAuthService implements BootstrapStatusService {
    private readonly store;
    private readonly credentials;
    private readonly flow;
    private readonly quota;
    private readonly gates;
    private readonly autoActivate;
    readonly accountStore: AntigravityAccountStore;
    private readonly fetchEmail;
    private emailBackfillAttempted;
    private riskAcknowledged;
    private activeFlowGeneration;
    private disposed;
    private readonly statusListeners;
    constructor(options?: AntigravityAuthServiceOptions);
    listAccounts(): Promise<{
        activeId: string | undefined;
        accounts: readonly (CachedAccount & {
            isActive: boolean;
            index: number;
        })[];
    }>;
    /**
     * Backfill the active account's email through the injected fetcher, once per
     * process. Accounts saved before the email probe existed (or seeded from an
     * email-less auth.json) stay usable without it; the fetcher failure only
     * leaves the email unset.
     */
    private backfillActiveAccountEmail;
    private accountForRecord;
    private bindCredentialMutation;
    switchAccount(idOrEmailOrIndex: string): Promise<{
        ok: boolean;
        message: string;
        account?: CachedAccount;
    }>;
    removeAccount(idOrEmailOrIndex: string): Promise<{
        ok: boolean;
        message: string;
    }>;
    status(): Promise<AntigravityStatusView>;
    acknowledgeRisk(): Promise<RiskAcknowledgementResult>;
    /** Observe value-safe gate changes so capability rows can register without polling secrets. */
    watchStatus(listener: () => void): () => void;
    recordGate0(outcome: CapabilityGateOutcome): Promise<void>;
    recordLlmFamilyGate(family: LlmFamilyId, outcome: CapabilityGateOutcome): Promise<void>;
    recordCapabilityGate(id: CapabilityRowId, outcome: CapabilityGateOutcome): Promise<void>;
    capabilityGateEvidence(): Promise<CapabilityGateEvidence>;
    gate0Passed(): Promise<boolean>;
    capabilityAvailable(id: CapabilityRowId): Promise<boolean>;
    startLogin(): Promise<LoginStartResult>;
    completeCallback(callbackUrl: string): Promise<OAuthFlowCompletionResult>;
    cancelLogin(): Promise<LoginActionResult>;
    credential(signal?: AbortSignal, options?: {
        readonly forceRefresh?: boolean;
    }): Promise<HostCredential | undefined>;
    usage(signal?: AbortSignal, force?: boolean): Promise<import('./quota.ts').QuotaStatusView>;
    logout(): Promise<import('./credential-coordinator.ts').LogoutResult>;
    revoke(confirmed: boolean, signal?: AbortSignal): Promise<import('./credential-coordinator.ts').RevokeActionResult>;
    dispose(): Promise<void>;
    private commitCredential;
    private notifyStatus;
    private gateEvidenceFor;
    private autoActivateGates;
    private requireRecord;
    private readRecord;
}
export declare function createAntigravityAuthService(options?: AntigravityAuthServiceOptions): AntigravityAuthService;
export declare function maskEmail(value: string | undefined): string | undefined;
//# sourceMappingURL=auth-service.d.ts.map