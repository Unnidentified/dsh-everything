
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
//#region lib/types/index.js
/**
 * Vision relay for DeepSeek Harness.
 *
 * When a request is about to reach a model whose input modalities do not
 * include `image`, every image block in that request is first described by a
 * configured vision model (default: runinfra / glm-5-3-flash) and the image
 * block is replaced with a text block carrying that description. The session
 * log keeps the real image; only the wire request changes, so the user
 * interface still shows the attachment while the text-only model receives
 * words it can act on.
 *
 * The interception point is the `llm/stream` waterfall: the LLM service
 * dispatches every model call through it before adapter dispatch, and a
 * listener may transform the request (or replace the call entirely) before
 * calling `next()`. Requests that need no help — models with image input,
 * or calls with no image blocks — pass straight through.
 *
 * Storage: descriptions are cached in a plugin-owned JSON file under the
 * Harness home (`storages/vision-relay.json`) keyed by the durable
 * attachment id, so a re-sent image costs one vision call per image, ever,
 * not per turn. Settings persist in the same file so `/visionrelay`
 * commands and restarts share one source of truth.
 *
 * @module vision-relay
 */
/** Stable Cordis plugin name. */
const name = "vision-relay";
/** Services required before the listener and command can register. */
const inject = ["llm", "commands"];
/** Instruction for the vision model that describes images. */
const DESCRIPTION_SYSTEM_PROMPT = [
	"You transcribe images for a text-only language model that cannot see them.",
	"Describe the image completely and precisely so the reader can act on its contents:",
	"transcribe all visible text verbatim (code, errors, labels, captions); list interface",
	"elements and their states; describe layout, objects, colors, charts, and anything anomalous.",
	"For photographs, state the subject and the notable details. Do not speculate beyond what is visible.",
	"No preamble, no greeting, no commentary — output only the description."
].join("\n");
/** The per-image request line sent beside the image. */
const DESCRIPTION_REQUEST = "Describe this image.";
/** Storage file for settings and the description cache, under the Harness home. */
const STORE_PATH = dshHomePath("storages", "vision-relay.json");
/** Default settings for a fresh store. */
const DEFAULT_SETTINGS = Object.freeze({
	enabled: true,
	// Isoquant's own GLM: the provider that serves the text-only DeepSeek model,
	// so an image is described on the same account it was sent to.
	visionProvider: "isoquant",
	visionModel: "glm-5.3-flash",
	timeoutMs: 60000,
	maxOutputTokens: 2000,
	reasoningEffort: "off"
});
//#endregion
//#region lib/types/store.js
/** Read the store; a missing or corrupt file reads as empty defaults. */
async function readStore() {
	try {
		const raw = await readFile(STORE_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return {
			settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
			descriptions: parsed.descriptions && typeof parsed.descriptions === "object" ? parsed.descriptions : {}
		};
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	return { settings: { ...DEFAULT_SETTINGS }, descriptions: {} };
}
/** Write the store atomically (temp file + rename). */
async function writeStore(store) {
	await mkdir(dirname(STORE_PATH), { recursive: true });
	const temp = `${STORE_PATH}.${randomUUID()}.tmp`;
	await writeFile(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
	await rename(temp, STORE_PATH);
}
/** Read the current settings. */
async function readSettings() {
	return (await readStore()).settings;
}
/** Merge one patch into the settings and persist. */
async function updateSettings(patch) {
	const store = await readStore();
	store.settings = { ...store.settings, ...patch };
	await writeStore(store);
	return store.settings;
}
/**
 * Read one cached description by durable attachment id.
 *
 * The model that produced it must match the configured one: a description is
 * only as good as the model that wrote it, so switching the vision model has to
 * take effect on already-described images instead of being masked by the cache.
 *
 * @param attachmentId - durable normalized attachment reference id.
 * @param model - the vision model the current settings name.
 */
async function readDescription(attachmentId, model) {
	const entry = (await readStore()).descriptions[attachmentId];
	if (entry === undefined || typeof entry.description !== "string" || entry.description.length === 0) return undefined;
	if (typeof entry.model === "string" && entry.model !== model) return undefined;
	return entry.description;
}
/** Persist one description under its durable attachment id. */
async function saveDescription(attachmentId, description, model) {
	const store = await readStore();
	store.descriptions[attachmentId] = {
		description,
		model,
		createdAt: Date.now()
	};
	await writeStore(store);
}
/** Drop every cached description. */
async function clearDescriptions() {
	const store = await readStore();
	const count = Object.keys(store.descriptions).length;
	store.descriptions = {};
	await writeStore(store);
	return count;
}
//#endregion
//#region lib/types/relay.js
/**
 * The model-facing text that replaces one image block.
 * @param ref - durable normalized attachment reference.
 * @param description - the vision model's description.
 */
function imageDescriptionText(ref, description) {
	const label = ref.name === undefined ? "Image" : `Image ${JSON.stringify(ref.name)}`;
	return [
		`[${label} (${ref.width}x${ref.height}px, ${ref.mediaType}) — this model accepts text only, so a vision model described it:`,
		description.trim(),
		"End of image description.]"
	].join("\n");
}
/** Whether one message content array carries a real (non-offloaded) image block. */
function hasLiveImage(content) {
	return Array.isArray(content) && content.some((block) => block?.type === "image" && block.offloaded !== true);
}
/** Whether any request message carries a real image block. */
function requestHasImages(messages) {
	return messages.some((message) => hasLiveImage(message.content));
}
/**
 * Describe one image through the configured vision model.
 * @returns the description text, or undefined when the call failed.
 */
async function describeImage(ctx, ref, settings, signal) {
	const model = `${settings.visionProvider}/${settings.visionModel}`;
	const cached = await readDescription(ref.attachmentId, model);
	if (cached !== undefined) return cached;
	const timeoutMs = typeof settings.timeoutMs === "number" && settings.timeoutMs >= 1000 ? settings.timeoutMs : 60000;
	const timeoutControl = deadline(signal, timeoutMs, "VISION_RELAY_TIMEOUT");
	try {
		const options = {
			provider: settings.visionProvider,
			model: settings.visionModel,
			messages: [createUserMessage({
				content: [
					{ type: "text", text: DESCRIPTION_REQUEST },
					{ type: "image", attachment: ref }
				],
				source: { kind: "vision-relay" }
			})],
			system: DESCRIPTION_SYSTEM_PROMPT,
			maxTokens: typeof settings.maxOutputTokens === "number" && settings.maxOutputTokens >= 64 ? settings.maxOutputTokens : 2000,
			reasoningEffort: settings.reasoningEffort,
			purpose: "vision-relay",
			signal: timeoutControl.signal
		};
		timeoutControl.signal.throwIfAborted();
		const assembler = new BlockAssembler();
		for await (const chunk of ctx.llm.stream(options)) {
			timeoutControl.signal.throwIfAborted();
			assembler.push(chunk);
		}
		const finish = assembler.finish;
		if (finish !== undefined && finish.kind !== "stop") throw new Error(finish.kind === "error" || finish.kind === "aborted" ? finish.failure?.message ?? "vision call failed" : `vision call ended with ${finish.kind}`);
		const blocks = assembler.blocks();
		if (blocks.some((block) => block.type === "tool-call")) throw new Error("vision model requested a tool");
		const text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n\n").trim();
		if (text.length === 0) throw new Error("vision model produced no description");
		await saveDescription(ref.attachmentId, text, model);
		return text;
	} catch {
		return undefined;
	} finally {
		timeoutControl[Symbol.dispose]?.();
	}
}
/**
 * Replace every real image block in the request with its description.
 * Offloaded blocks are left for the built-in projection; blocks whose
 * description fails are left for the built-in projection too.
 * @returns the rewritten message list, or undefined when nothing changed.
 */
async function relayMessages(ctx, messages, settings, signal) {
	let changed = false;
	const out = [];
	for (const message of messages) {
		if (!hasLiveImage(message.content)) {
			out.push(message);
			continue;
		}
		const content = [];
		for (const block of message.content) {
			if (block?.type !== "image" || block.offloaded === true) {
				content.push(block);
				continue;
			}
			const description = await describeImage(ctx, block.attachment, settings, signal);
			if (description === undefined) {
				content.push(block);
			} else {
				content.push({ type: "text", text: imageDescriptionText(block.attachment, description) });
			}
			changed = true;
		}
		out.push({ ...message, content });
	}
	return changed ? out : undefined;
}
/** Whether one model route accepts image input, or undefined when unknown. */
async function acceptsImages(ctx, provider, model, signal) {
	try {
		const modelInfo = await ctx.llm.resolveModelInfo(provider, model, signal);
		const modalities = modelInfo?.inputModalities;
		return modalities === undefined ? undefined : modalities.includes("image");
	} catch {
		return undefined;
	}
}
//#endregion
//#region lib/types/plugin.js
/** Compose one command result. */
function result(kind, text) {
	return { kind, text };
}
/**
 * Register the `llm/stream` interceptor and the `/visionrelay` command.
 * @param ctx - Host plugin context.
 */
function apply(ctx) {
	/** Options objects this plugin created for its own vision calls. */
	const own = new WeakSet();
	/** Attachment ids with a description call already running. */
	const inFlight = new Map();
	/**
	 * Describe one image once per attachment id, sharing concurrent calls.
	 * @returns the description text, or undefined when the call failed.
	 */
	function describeOnce(ctx_, ref, settings, signal) {
		const cachedPromise = inFlight.get(ref.attachmentId);
		if (cachedPromise !== undefined) return cachedPromise;
		const operation = describeImage(ctx_, ref, settings, signal).finally(() => {
			if (inFlight.get(ref.attachmentId) === operation) inFlight.delete(ref.attachmentId);
		});
		inFlight.set(ref.attachmentId, operation);
		return operation;
	}
	ctx.on("llm/stream", async function* (options, next) {
		/** Whether this listener already produced the stream itself. */
		let handled = false;
		try {
			if (!own.has(options) && Array.isArray(options.messages) && requestHasImages(options.messages)) {
				const settings = await readSettings();
				if (settings.enabled === true && !(options.provider === settings.visionProvider && options.model === settings.visionModel)) {
					const imageInput = await acceptsImages(ctx, options.provider, options.model, options.signal);
					if (imageInput === false) {
						const relayed = await relayMessages(ctx, options.messages, settings, options.signal);
						if (relayed !== undefined) {
							ctx.logger?.info?.(`vision-relay: described image(s) for text-only model ${options.provider}/${options.model} via ${settings.visionProvider}/${settings.visionModel}`);
							if (Object.isFrozen(options)) {
								const inner = { ...options, messages: relayed, purpose: "vision-relay" };
								own.add(inner);
								yield* ctx.llm.stream(inner);
								handled = true;
							} else {
								options.messages = relayed;
							}
						}
					}
				}
			}
		} catch {
			/* Fall through and pass the original request through untouched; the
			   built-in text-only projection then handles any image blocks. */
		}
		if (!handled) yield* next();
	}, { global: true, prepend: true });
	/** Route one /visionrelay invocation. */
	async function handler(invocation) {
		const command = invocation.rawInput.trim();
		if (command === "") {
			const settings = await readSettings();
			return result("success", [
				`Vision relay is ${settings.enabled === true ? "on" : "off"}.`,
				`Vision model: ${settings.visionProvider} / ${settings.visionModel}`,
				"Images sent to text-only models are described by the vision model before the request is sent.",
				"Set one with /visionrelay model <provider> <model>; toggle with /visionrelay on|off; drop the cache with /visionrelay clear."
			].join("\n"));
		}
		if (command === "on" || command === "off") {
			await updateSettings({ enabled: command === "on" });
			return result("success", command === "on" ? "Vision relay is on." : "Vision relay is off; text-only models will see the built-in image placeholder again.");
		}
		if (command === "model") {
			const settings = await readSettings();
			const providers = ctx.llm.listProviders().map((entry) => entry.provider);
			return result("success", [
				`Vision model: ${settings.visionProvider} / ${settings.visionModel}`,
				`Providers: ${providers.length > 0 ? providers.join(", ") : "(none registered)"}`,
				"Set one with /visionrelay model <provider> <model>."
			].join("\n"));
		}
		if (command.startsWith("model ")) {
			const parts = command.slice(6).trim().split(/\s+/);
			if (parts.length !== 2 || parts.some((part) => part.length === 0)) return result("error", "Usage: /visionrelay model <provider> <model>");
			const [provider, model] = parts;
			const imageInput = await acceptsImages(ctx, provider, model, undefined);
			await updateSettings({ visionProvider: provider, visionModel: model });
			return result("success", `Vision model set to ${provider} / ${model}.${imageInput === false ? " Warning: that model does not accept image input." : ""}`);
		}
		if (command === "clear") {
			const count = await clearDescriptions();
			return result("success", count === 0 ? "No cached descriptions to clear." : `Cleared ${count} cached description(s).`);
		}
		return result("error", "Usage: /visionrelay [model <provider> <model>|on|off|clear]");
	}
	ctx.commands.register({
		name: "visionrelay",
		description: "Describe images for text-only models through a vision model, or configure the relay",
		input: { hint: "[model <provider> <model>|on|off|clear]" },
		recordInput: false,
		handler
	});
}
//#endregion
export { apply, inject, name };
