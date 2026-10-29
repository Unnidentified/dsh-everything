/**
 * Provider identity policy shared by account monitoring and session context.
 *
 * Identity is route-aware: a configured route id remains the account boundary,
 * even when two routes use the same upstream model. Classification follows one
 * strict precedence order: explicit monitor adapter, canonical route id,
 * canonical base-URL hostname, then unknown. Display labels are presentation
 * only and never participate in inference.
 *
 * @module dsh-usage-stats/provider-identity
 */

import { isPrivateHostname } from "./network.js";

/** Bump whenever route classification can change pricing eligibility. */
// 3: the official DeepSeek account route gained a pricing family, so the pricing
// fingerprint must change even for a cache written by the previous policy.
export const PROVIDER_IDENTITY_POLICY_VERSION = 4;

const ADAPTER_IDENTITIES = Object.freeze({
	"deepseek-balance": { providerFamily: "deepseek", pricingFamily: "deepseek" },
	// The DeepSeek Account adapter talks to the official api.deepseek.com and its
	// balance is read from there, so it belongs to the DeepSeek price catalog. It was
	// "unknown", which made every exact DeepSeek rule ineligible and left cost blank.
	"deepseek-account": { providerFamily: "deepseek", pricingFamily: "deepseek" },
	"openrouter-balance": { providerFamily: "openrouter", pricingFamily: "openrouter" },
	// Merge Gateway publishes its own billing surface (/v1/credits with a management
	// key, or the credit balance header on model responses), so the routes are
	// balance-capable. They stay outside the price catalog: which vendor served a
	// merge request is the gateway's decision, not a published per-model rate.
	"merge-balance": { providerFamily: "merge", pricingFamily: "unknown" },
	"moonshot-balance": { providerFamily: "moonshot", pricingFamily: "moonshot" },
	"zai-balance": { providerFamily: "zai", pricingFamily: "zai" },
	"orcarouter-balance": { providerFamily: "orcarouter", pricingFamily: "unknown" },
	"commandcode-goat": { providerFamily: "commandcode", pricingFamily: "unknown" },
	general: { providerFamily: "unknown", pricingFamily: "unknown" },
	"new-api": { providerFamily: "new-api", pricingFamily: "unknown" },
	sub2api: { providerFamily: "sub2api", pricingFamily: "unknown" },
	"sub2api-auth": { providerFamily: "sub2api", pricingFamily: "unknown" },
	"opencode-go": { providerFamily: "opencode-go", pricingFamily: "opencode-go" },
	"zai-token-plan": { providerFamily: "zai", pricingFamily: "zai" },
	"kimi-token-plan": { providerFamily: "kimi", pricingFamily: "kimi" },
	"minimax-token-plan": { providerFamily: "minimax", pricingFamily: "minimax" },
	ollama: { providerFamily: "ollama", pricingFamily: "ollama" },
	// codearts 系由宿主插件（dsh-codearts-auth）持有凭据与签名协议，本插件只读
	// 它算好的积分余额；定价侧不认识这些 route（它们不是公开 API 供应商）。
	"codearts-credits": { providerFamily: "codearts", pricingFamily: "unknown" },
	declarative: { providerFamily: "unknown", pricingFamily: "unknown" }
});

const CANONICAL_ROUTES = Object.freeze({
	"deepseek-official": { providerFamily: "deepseek", accountAdapter: "deepseek-balance", balanceScheme: "deepseek" },
	"deepseek-account": { providerFamily: "deepseek", accountAdapter: "deepseek-account", pricingFamily: "deepseek", balanceScheme: null },
	deepseek: { providerFamily: "deepseek", accountAdapter: "deepseek-balance", balanceScheme: "deepseek" },
	openrouter: { providerFamily: "openrouter", accountAdapter: "openrouter-balance", balanceScheme: "openrouter" },
	moonshotai: { providerFamily: "moonshot", accountAdapter: "moonshot-balance", balanceScheme: "moonshot" },
	"moonshotai-cn": { providerFamily: "moonshot", accountAdapter: "moonshot-balance", balanceScheme: "moonshot" },
	kimi: { providerFamily: "moonshot", accountAdapter: "moonshot-balance", balanceScheme: "moonshot" },
	"kimi-coding": { providerFamily: "kimi", accountAdapter: "kimi-token-plan", balanceScheme: "moonshot" },
	"kimi-for-coding": { providerFamily: "kimi", accountAdapter: "kimi-token-plan", balanceScheme: null },
	zai: { providerFamily: "zai", accountAdapter: "zai-token-plan", balanceScheme: "zai" },
	"zai-coding-cn": { providerFamily: "zai", accountAdapter: "zai-token-plan", balanceScheme: "zai" },
	"opencode-go": { providerFamily: "opencode-go", accountAdapter: "opencode-go", balanceScheme: null },
	// An id-only Host registry entry is still a legitimate API-key route.
	minimax: { providerFamily: "minimax", accountAdapter: "minimax-token-plan", balanceScheme: null },
	minimaxi: { providerFamily: "minimax", accountAdapter: "minimax-token-plan", balanceScheme: null },
	"minimax-cn": { providerFamily: "minimax", accountAdapter: "minimax-token-plan", balanceScheme: null },
	"minimax-coding": { providerFamily: "minimax", accountAdapter: "minimax-token-plan", balanceScheme: null },
	orcarouter: { providerFamily: "orcarouter", accountAdapter: "orcarouter-balance", pricingFamily: "unknown", balanceScheme: "orcarouter" },
	commandcode: { providerFamily: "commandcode", accountAdapter: "commandcode-goat", pricingFamily: "unknown" },
	passion: { providerFamily: "sub2api", accountAdapter: "sub2api", pricingFamily: "unknown", balanceScheme: null },
	// dsh-codearts-auth 注册的 12 条反代 route（provider id = 该插件的产品 id）。
	// ⚠️ 这份名单必须与 CreditBalanceService.supportedProviders() 同步；服务在时
	// usage-stats 以服务返回的清单为准（见 accounts.js 的 specs()），这里只负责
	// 「路由 id → adapter」的分类，使 providerViews 能给出 official 出处。
	codearts: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	buddy: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	workbuddy: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	lobsterai: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	qoder: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	qodercn: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	trae: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	cline: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	loomy: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	raccoon: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null },
	zcode: { providerFamily: "codearts", accountAdapter: "codearts-credits", balanceScheme: null }
});

/**
 * Route ids that name a family rather than one exact profile. The Command Code
 * provider plugins publish one route per subscription tier and wire protocol
 * (`commandcode-goat-autosync`, `commandcode-pro-anthropic`, …), so the
 * prefix is the stable fact and the suffix belongs to the deployment. A route
 * that is not recognized stays unknown; the prefix never widens into a
 * different vendor.
 */
const CANONICAL_ROUTE_PREFIXES = Object.freeze([
	Object.freeze(["commandcode-", Object.freeze({ providerFamily: "commandcode", accountAdapter: "commandcode-goat", pricingFamily: "unknown" })]),
	// `merge`, `merge-direct`, `merge-direct-2`, ... are the same gateway under
	// separate accounts, so the prefix is the stable signal, not one exact id.
	Object.freeze(["merge", Object.freeze({ providerFamily: "merge", accountAdapter: "merge-balance", pricingFamily: "unknown" })]),
	// Isoquant publishes its own per-model rates, so it prices itself instead of
	// falling back to the pinned gateway rate. It exposes no balance endpoint, so
	// there is no account adapter and the card reports that honestly.
	Object.freeze(["isoquant", Object.freeze({ providerFamily: "isoquant", pricingFamily: "isoquant" })])
]);

function routeRuleOf(routeId) {
	const exact = CANONICAL_ROUTES[routeId];
	if (exact !== void 0) return exact;
	const match = CANONICAL_ROUTE_PREFIXES.find(([prefix]) => routeId.startsWith(prefix));
	return match?.[1];
}

function nonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function hostnameOf(baseURL) {
	if (nonEmptyString(baseURL) === null) return null;
	try {
		return new URL(baseURL).hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		return null;
	}
}

function hostRule(hostname) {
	if (hostname === "api.deepseek.com") return { providerFamily: "deepseek", accountAdapter: "deepseek-balance" };
	if (hostname === "api.orcarouter.ai") return { providerFamily: "orcarouter", accountAdapter: "orcarouter-balance", pricingFamily: "unknown" };
	if (hostname === "api-gateway.merge.dev") return { providerFamily: "merge", accountAdapter: "merge-balance", pricingFamily: "unknown" };
	if (hostname === "api.isoquant.ai") return { providerFamily: "isoquant", pricingFamily: "isoquant" };
	if (hostname === "commandcode.ai" || hostname.endsWith(".commandcode.ai")) return { providerFamily: "commandcode", accountAdapter: "commandcode-goat", pricingFamily: "unknown" };
	if (hostname === "passionapi.com" || hostname.endsWith(".passionapi.com")) return { providerFamily: "sub2api", accountAdapter: "sub2api", pricingFamily: "unknown" };
	if (hostname === "ollama.com" || hostname.endsWith(".ollama.com")) return { providerFamily: "ollama", accountAdapter: "ollama" };
	return null;
}

function buildProviderIdentity(provider, rule, confidence) {
	const routeId = nonEmptyString(provider?.id) ?? "unknown";
	const displayName = nonEmptyString(provider?.displayName) ?? routeId;
	const baseURL = nonEmptyString(provider?.baseURL);
	const providerFamily = rule?.providerFamily ?? "unknown";
	return {
		routeId,
		displayName,
		providerFamily,
		accountAdapter: rule?.accountAdapter ?? null,
		pricingFamily: rule?.pricingFamily ?? providerFamily,
		baseURL,
		confidence
	};
}

/** Return the legacy built-in balance scheme without duplicating route policy. */
export function balanceSchemeForProviderId(providerId) {
	return CANONICAL_ROUTES[providerId]?.balanceScheme ?? null;
}

/**
 * Resolve one configured provider route to stable semantic boundaries.
 * Explicit monitor configuration always wins. Unknown or malformed inputs
 * remain unknown instead of falling back to the human-readable display name.
 */
export function resolveProviderIdentity(provider, config = { monitors: {} }) {
	const routeId = nonEmptyString(provider?.id) ?? "unknown";
	const monitor = config?.monitors?.[routeId];
	const explicitAdapter = nonEmptyString(monitor?.adapter);
	if (explicitAdapter !== null) {
		const identity = ADAPTER_IDENTITIES[explicitAdapter] ?? { providerFamily: "unknown", pricingFamily: "unknown" };
		return buildProviderIdentity(provider, { ...identity, accountAdapter: explicitAdapter }, "explicit");
	}

	// Only providers newly supplied by the Host service receive this marker.
	// A supported id alone cannot claim an already registered route (minimax
	// in particular); those collisions require an explicit monitor above.
	if (provider?.accountService === "creditBalance"
		&& nonEmptyString(provider?.apiKeyEnv) === null && nonEmptyString(provider?.baseURL) === null) {
		return buildProviderIdentity(provider, {
			...ADAPTER_IDENTITIES["codearts-credits"], accountAdapter: "codearts-credits"
		}, "host-service");
	}

	const canonical = routeRuleOf(routeId);
	if (canonical !== void 0) return buildProviderIdentity(provider, canonical, "canonical-id");

	const hostname = hostnameOf(provider?.baseURL);
	if (hostname !== null) {
		// The canonical Ollama id is meaningful only for a non-private cloud
		// endpoint. This deliberate safety gate prevents local Ollama from being
		// mistaken for a subscription account while retaining canonical-id
		// precedence for actual cloud routes.
		if (routeId === "ollama" && !isPrivateHostname(hostname)) {
			return buildProviderIdentity(provider, { providerFamily: "ollama", accountAdapter: "ollama" }, "canonical-id");
		}
		const canonicalHost = hostRule(hostname);
		if (canonicalHost !== null) return buildProviderIdentity(provider, canonicalHost, "canonical-host");
	}

	return buildProviderIdentity(provider, null, "unknown");
}
