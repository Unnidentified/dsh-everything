window.__ModuleLoader__.load({
	id: "dsh-filesnap",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		_deepseek_ai_dsh_client_ui_primitives = __toESM(_deepseek_ai_dsh_client_ui_primitives, 1);
		//#region lib/types/client/redo-menu.js
		/** A bare /redo selects a prepared restore; applying it belongs to the dialog. */
		function redoMenu(read, open, label, emptyLabel = () => "No rewind to reverse in this conversation") {
			const previews = /* @__PURE__ */ new WeakMap();
			return {
				name: "redo",
				available: () => true,
				ui: {
					kind: "popupSelect",
					options: async (session, signal) => {
						previews.delete(session);
						const reply = await read(session.sessionId);
						signal.throwIfAborted();
						if (!reply.ok && reply.errorCode === "no-restore") return [{
							id: "no-restore",
							label: emptyLabel()
						}];
						if (!reply.ok || reply.redoPreview === void 0) throw new Error(reply.error ?? "Could not preview redo.");
						previews.set(session, {
							preview: reply.redoPreview,
							signal
						});
						return [{
							id: reply.redoPreview.token,
							label: label()
						}];
					},
					onSelect: (option, session) => {
						if (option.id === "no-restore") return;
						const saved = previews.get(session);
						if (saved === void 0 || saved.preview.token !== option.id) throw new Error("Reopen /redo to preview again.");
						saved.signal.throwIfAborted();
						open(session.sessionId, saved.preview);
					}
				}
			};
		}
		function redoSelection() {
			let value = null;
			let sequence = 0;
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				for (const listener of listeners) listener();
			};
			return {
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				snapshot: () => value,
				open: (preview) => {
					value = {
						preview,
						sequence: ++sequence
					};
					publish();
				},
				close: () => {
					value = null;
					publish();
				}
			};
		}
		//#endregion
		//#region lib/types/client/rewind-menu.js
		/** Decorate only bare /rewind; the host continues to own argued commands. */
		function rewindMenu(read, open, turnLabel) {
			const signals = /* @__PURE__ */ new WeakMap();
			const points = async (sessionId) => {
				const result = await read(sessionId);
				if (!result.ok) throw new Error(result.error ?? "Could not load rewind points.");
				return (result.points ?? []).filter((point) => point.boundary !== void 0);
			};
			return {
				name: "rewind",
				available: () => true,
				ui: {
					kind: "popupSelect",
					options: async (session, signal) => {
						signals.set(session, signal);
						const available = await points(session.sessionId);
						signal.throwIfAborted();
						return available.sort((a, b) => b.turn - a.turn).map((point) => ({
							id: point.point,
							label: `${turnLabel(point.turn)}${point.label ? ` · ${point.label}` : ""}`,
							detail: new Date(point.at).toLocaleString()
						}));
					},
					onSelect: async (option, session) => {
						const signal = signals.get(session);
						signal?.throwIfAborted();
						const target = (await points(session.sessionId)).find((point) => point.point === option.id);
						signal?.throwIfAborted();
						if (target === void 0) throw new Error("This rewind point is no longer available. Reopen /rewind.");
						open(session.sessionId, target);
					}
				}
			};
		}
		/** Session-scoped transient selection; never stored in conversation history. */
		function rewindSelection() {
			let selection = null;
			let sequence = 0;
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				for (const listener of listeners) listener();
			};
			return {
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				snapshot: () => selection,
				open: (point) => {
					selection = {
						point,
						sequence: ++sequence
					};
					publish();
				},
				close: () => {
					selection = null;
					publish();
				}
			};
		}
		//#endregion
		//#region lib/types/client/icon-pick.js
		/**
		* The first candidate the module actually exports.
		*
		* Icon exports are components, so anything else under a candidate name is not
		* an answer. Returning `undefined` rather than a throw or a placeholder lets
		* the caller decide what a missing glyph should look like.
		*
		* @param source - the module namespace to read.
		* @param names - candidate export names, most preferred first.
		* @returns the icon, or undefined when the module exports none of the names.
		*/
		function pickIcon(source, names) {
			for (const name of names) {
				const candidate = source[name];
				if (typeof candidate === "function" || typeof candidate === "object" && candidate !== null) return candidate;
			}
		}
		//#endregion
		//#region lib/types/client/icons.js
		/**
		* The icons this plugin's controls render, bound once.
		*
		* The harness renamed its icon set across the generations this plugin spans:
		* the train this plugin was built against names a glyph by its pixel size
		* (`IconRefreshOutline16`), the desktop client now shipping names it by stroke
		* weight (`IconRefreshOutlineRegular`), and neither exports the other's name.
		* Resolving both here keeps a renamed glyph from taking its whole control down
		* with it — an unresolved element type is React error #130, not a missing dot,
		* and a control that crashes renders nothing at all.
		*
		* @module
		*/
		const table = _deepseek_ai_dsh_client_ui_primitives;
		/** A quiet stand-in so a future rename costs the glyph, never the button. */
		const Plain = () => null;
		/** The refresh mark on the rewind and redo controls. */
		const IconRefresh = pickIcon(table, ["IconRefreshOutlineRegular", "IconRefreshOutline16"]) ?? Plain;
		/** The data mark on the snapshot panel control. */
		const IconData = pickIcon(table, ["IconDataOutlineRegular", "IconDataOutline16"]) ?? Plain;
		//#endregion
		//#region \0dsh-css:/home/runner/work/dsh-filesnap/dsh-filesnap/src/client/RewindAction.module.css.mjs
		const css = ".rnpTaW_action{border-radius:var(--dsw-radius-sm);color:var(--dsw-text-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:4px;display:inline-flex}.rnpTaW_action:hover:not(:disabled){background:var(--dsw-fill-hover);color:var(--dsw-text-primary)}.rnpTaW_action:disabled{cursor:default;opacity:.5}.rnpTaW_failure{color:var(--dsw-alias-state-error-primary,#c33);font-size:var(--dsw-font-size-xs);margin-left:4px}.rnpTaW_dialog{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1,#888);width:min(640px,100vw - 48px);max-height:calc(100dvh - 48px);color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-1,Canvas);text-align:start;border-radius:12px;padding:24px;font-size:14px;line-height:1.5;overflow:auto}.rnpTaW_dialog::backdrop{background:#00000073}.rnpTaW_dialog h2{margin:0 0 12px;font-size:18px}.rnpTaW_changes{max-height:40dvh;padding:0;list-style:none;overflow:auto}.rnpTaW_changes li{gap:12px;padding:8px 0;display:flex}.rnpTaW_changes strong{flex:0 0 100px}.rnpTaW_changes code{white-space:pre-wrap;overflow-wrap:anywhere;unicode-bidi:plaintext}.rnpTaW_deletion{color:var(--dsw-alias-state-error-primary,#c33)}.rnpTaW_path{overflow-wrap:anywhere}.rnpTaW_buttons{flex-wrap:wrap;justify-content:flex-end;gap:12px;margin-top:20px;display:flex}.rnpTaW_buttons button{border:1px solid var(--dsw-alias-border-l1,#888);color:inherit;font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:8px 12px}.rnpTaW_buttons button:hover:not(:disabled){background:var(--dsw-fill-hover,#8080801f)}.rnpTaW_buttons button:disabled{cursor:default;opacity:.5}.rnpTaW_report{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:65vh;overflow:auto}.rnpTaW_metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0 8px;display:grid}.rnpTaW_metrics div{border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:10px;padding:16px}.rnpTaW_metrics dt,.rnpTaW_muted{opacity:.75;font-size:12px}.rnpTaW_metrics dd{margin:6px 0 0;font-size:24px;font-weight:600}.rnpTaW_sessions{max-height:28vh;padding:0;list-style:none;overflow:auto}.rnpTaW_sessions li{border-bottom:1px solid var(--dsw-alias-border-l1,#ddd);flex-wrap:wrap;justify-content:space-between;gap:8px;padding:10px 0;display:flex}.rnpTaW_sessions code{overflow-wrap:anywhere;min-width:0}.rnpTaW_exclusions{margin:16px 0}.rnpTaW_exclusions summary{cursor:pointer}.rnpTaW_cleanupSection{border-top:1px solid var(--dsw-alias-border-l1,#ddd);margin-top:20px;padding-top:8px}.rnpTaW_cleanupSection .rnpTaW_action{border:1px solid var(--dsw-alias-border-l1,#ddd);color:inherit;padding:8px 12px}@media (width<=420px){.rnpTaW_metrics{grid-template-columns:1fr}}.rnpTaW_settings{max-width:760px;color:inherit;padding:20px}.rnpTaW_settings select{width:100%;color:inherit;background:var(--dsw-alias-bg-layer-1,Canvas);border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:6px;margin-top:8px;padding:10px;display:block}.rnpTaW_sessions small{flex-basis:100%}.rnpTaW_recoveryItem{border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:10px;margin:12px 0;padding:16px}";
		const tagId = "dsh-filesnap/RewindAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-filesnap";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var RewindAction_module_css_default = {
			"action": "rnpTaW_action",
			"buttons": "rnpTaW_buttons",
			"changes": "rnpTaW_changes",
			"cleanupSection": "rnpTaW_cleanupSection",
			"deletion": "rnpTaW_deletion",
			"dialog": "rnpTaW_dialog",
			"exclusions": "rnpTaW_exclusions",
			"failure": "rnpTaW_failure",
			"metrics": "rnpTaW_metrics",
			"muted": "rnpTaW_muted",
			"path": "rnpTaW_path",
			"recoveryItem": "rnpTaW_recoveryItem",
			"report": "rnpTaW_report",
			"sessions": "rnpTaW_sessions",
			"settings": "rnpTaW_settings"
		};
		//#endregion
		//#region lib/types/client/RewindAction.js
		/**
		* The rewind control, one per turn, in the assistant message's own icon row.
		*
		* A message with no point renders nothing. Only the assistant message that
		* closed a turn carries one, so the control appears once per turn — under the
		* last bubble of that turn, which is where "undo this" belongs.
		*
		* @module
		*/
		/**
		* What this turn's snapshot covered, as one line for the tooltip.
		*
		* `reused + hashed` is the file count: every tracked file is one or the other.
		* The split is still worth showing, because a turn that hashed hundreds of
		* files is doing something a turn that reused them is not.
		*
		* @param point - the point under this message.
		* @param t - the locale seat.
		* @returns the summary line, or undefined when the capture predates coverage reporting.
		*/
		function coverageLine(point, t) {
			const coverage = point.coverage;
			if (coverage === void 0) return void 0;
			const tracked = coverage.reused + coverage.hashed;
			const base = t("covered", {
				tracked: String(tracked),
				hashed: String(coverage.hashed)
			});
			return coverage.dropped === 0 ? base : `${base} · ${t("dropped", { dropped: String(coverage.dropped) })}`;
		}
		/**
		* One message's rewind control.
		*
		* @param props - the message identity, the rewind verb, the projection seat, and the locale seat.
		* @returns the icon button, or nothing when this message closes no captured turn.
		*/
		function RewindAction({ messageId, onPreview, onRewind, usePoints, useProjection, t }) {
			const point = usePoints(useProjection("filesnap")).find((candidate) => candidate.messageId === messageId);
			return point === void 0 ? null : (0, react_jsx_runtime.jsx)(RewindControl, {
				point,
				onPreview,
				onRewind,
				t
			});
		}
		/** Shared preview/confirmation flow for message buttons and the slash menu. */
		function RewindControl({ point, onPreview, onRewind, t, autoOpen = false, onClose }) {
			const [phase, setPhase] = (0, react.useState)("idle");
			const [preview, setPreview] = (0, react.useState)(null);
			const [failure, setFailure] = (0, react.useState)(null);
			const dialog = (0, react.useRef)(null);
			const busy = (0, react.useRef)(false);
			const generation = (0, react.useRef)(0);
			const titleId = (0, react.useId)();
			const descriptionId = (0, react.useId)();
			(0, react.useEffect)(() => () => {
				generation.current++;
				busy.current = false;
			}, []);
			const close = () => {
				if (phase === "confirming") return;
				generation.current++;
				busy.current = false;
				setPhase("idle");
				setPreview(null);
				dialog.current?.close();
				onClose?.();
			};
			const load = async (target) => {
				if (busy.current) return;
				busy.current = true;
				const attempt = ++generation.current;
				setPhase("loading");
				setPreview(null);
				setFailure(null);
				dialog.current?.showModal();
				try {
					const result = await onPreview(target);
					if (attempt !== generation.current) return;
					if (result.ok && result.preview !== void 0 && result.preview.point === target.point) setPreview(result.preview);
					else setFailure(result.error ?? t("previewUnavailable"));
				} catch (error) {
					if (attempt === generation.current) setFailure(String(error));
				} finally {
					if (attempt === generation.current) {
						busy.current = false;
						setPhase("ready");
					}
				}
			};
			const confirm = async (target) => {
				if (busy.current || preview === null) return;
				busy.current = true;
				const attempt = generation.current;
				setPhase("confirming");
				setFailure(null);
				try {
					const result = await onRewind(target, preview.token);
					if (attempt !== generation.current) return;
					setPreview(null);
					if (result.ok) {
						dialog.current?.close();
						onClose?.();
					} else setFailure(result.error ?? t("previewUnavailable"));
				} catch (error) {
					if (attempt === generation.current) {
						setPreview(null);
						setFailure(String(error));
					}
				} finally {
					if (attempt === generation.current) {
						busy.current = false;
						setPhase("ready");
					}
				}
			};
			(0, react.useEffect)(() => {
				if (autoOpen) load(point);
			}, []);
			const covered = coverageLine(point, t);
			const label = point.label === void 0 ? t("rewindHere") : t("rewindTo", { label: point.label });
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [!autoOpen && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: covered === void 0 ? label : `${label}\n${covered}`,
				side: "bottom",
				delayMs: 500,
				children: (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: RewindAction_module_css_default.action,
					disabled: phase === "loading" || phase === "confirming",
					"aria-label": label,
					onClick: () => {
						load(point);
					},
					children: (0, react_jsx_runtime.jsx)(IconRefresh, { size: 14 })
				})
			}), (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: RewindAction_module_css_default.dialog,
				"aria-labelledby": titleId,
				"aria-describedby": descriptionId,
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						id: titleId,
						children: t("previewTitle", { turn: String(point.turn) })
					}),
					(0, react_jsx_runtime.jsx)("p", { children: label }),
					(0, react_jsx_runtime.jsx)("p", {
						id: descriptionId,
						children: t("previewExplanation")
					}),
					phase === "loading" && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("previewLoading")
					}),
					preview !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", { children: t("previewCounts", {
							written: String(preview.changes.filter((change) => change.action === "write").length),
							deleted: String(preview.changes.filter((change) => change.action === "delete").length)
						}) }),
						preview.changes.length === 0 ? (0, react_jsx_runtime.jsx)("p", { children: t("previewEmpty") }) : (0, react_jsx_runtime.jsx)("ul", {
							className: RewindAction_module_css_default.changes,
							"aria-label": t("previewFiles"),
							children: preview.changes.map((change) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("strong", {
								className: change.action === "delete" ? RewindAction_module_css_default.deletion : void 0,
								children: t(change.action === "delete" ? "previewDelete" : "previewWrite")
							}), (0, react_jsx_runtime.jsx)("code", { children: change.path })] }, change.path))
						}),
						(0, react_jsx_runtime.jsx)("p", { children: t("previewRefreshNotice") })
					] }),
					failure !== null && (0, react_jsx_runtime.jsx)("p", {
						className: RewindAction_module_css_default.failure,
						role: "alert",
						children: t("failed", { reason: failure })
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: RewindAction_module_css_default.buttons,
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: phase === "confirming",
								onClick: close,
								children: t("cancel")
							}),
							failure !== null && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: phase !== "ready",
								onClick: () => {
									load(point);
								},
								children: t("previewRetry")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: preview === null || phase !== "ready",
								onClick: () => {
									confirm(point);
								},
								children: t(phase === "confirming" ? "rewinding" : "confirmRewind")
							})
						]
					})
				]
			})] });
		}
		//#endregion
		//#region lib/types/client/CommandRewindPreview.js
		/** The menu chooses a target; this independent dialog owns file confirmation. */
		function CommandRewindPreview({ selection, onPreview, onRewind, t }) {
			const current = (0, react.useSyncExternalStore)(selection.subscribe, selection.snapshot);
			(0, react.useEffect)(() => () => {
				selection.close();
			}, [selection]);
			return current === null ? null : (0, react_jsx_runtime.jsx)(RewindControl, {
				point: current.point,
				autoOpen: true,
				onClose: selection.close,
				onPreview,
				onRewind,
				t
			}, current.sequence);
		}
		//#endregion
		//#region lib/types/client/CleanupAction.js
		function bytes(value) {
			return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`;
		}
		/** Explicit store-wide collection, with usage and protection boundaries visible before confirmation. */
		function CleanupAction({ onCleanupPreview, onCleanupConfirm, onComplete, t }) {
			const dialog = (0, react.useRef)(null);
			const busy = (0, react.useRef)(false);
			const generation = (0, react.useRef)(0);
			(0, react.useEffect)(() => () => {
				generation.current++;
			}, []);
			const [pending, setPending] = (0, react.useState)(false);
			const [preview, setPreview] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const titleId = (0, react.useId)();
			const descriptionId = (0, react.useId)();
			const run = async (confirm) => {
				if (busy.current || confirm && preview === null) return;
				busy.current = true;
				const ticket = ++generation.current;
				setPending(true);
				setError(null);
				setResult(null);
				if (!confirm) {
					setPreview(null);
					dialog.current?.showModal();
				}
				try {
					const outcome = confirm ? await onCleanupConfirm(preview.token) : await onCleanupPreview();
					if (ticket !== generation.current) return;
					if (!outcome.ok) {
						setPreview(null);
						setError(outcome.error ?? t("previewUnavailable"));
					} else if (confirm && outcome.cleaned !== void 0) {
						setPreview(null);
						setResult(outcome.cleaned);
						onComplete?.();
					} else if (!confirm && outcome.cleanup !== void 0) setPreview(outcome.cleanup);
					else {
						setPreview(null);
						setError(t("previewUnavailable"));
					}
				} catch (failure) {
					if (ticket !== generation.current) return;
					setPreview(null);
					setError(String(failure));
				} finally {
					if (ticket === generation.current) {
						busy.current = false;
						setPending(false);
					}
				}
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: RewindAction_module_css_default.action,
				disabled: pending,
				onClick: () => {
					run(false);
				},
				children: t("cleanup")
			}), (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: RewindAction_module_css_default.dialog,
				"aria-labelledby": titleId,
				"aria-describedby": descriptionId,
				onCancel: (event) => {
					if (pending) event.preventDefault();
				},
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						id: titleId,
						children: t("cleanup")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						id: descriptionId,
						children: t("cleanupScope")
					}),
					(0, react_jsx_runtime.jsx)("p", { children: t("cleanupKeeps") }),
					preview !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", {
							className: RewindAction_module_css_default.path,
							children: preview.workspace
						}),
						(0, react_jsx_runtime.jsx)("p", { children: t("cleanupUsage", {
							records: bytes(preview.recordsBytes),
							shared: bytes(preview.sharedContentBytes)
						}) }),
						(0, react_jsx_runtime.jsx)("p", { children: t("cleanupEstimate") })
					] }),
					pending && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("cleanupWorking")
					}),
					result !== null && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("cleanupDone", {
							manifests: String(result.manifestsRemoved),
							blobs: String(result.blobsRemoved)
						})
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						className: RewindAction_module_css_default.failure,
						role: "alert",
						children: error
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: RewindAction_module_css_default.buttons,
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: pending,
								onClick: () => dialog.current?.close(),
								children: t(result === null ? "cancel" : "close")
							}),
							error !== null && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: pending,
								onClick: () => {
									run(false);
								},
								children: t("previewRetry")
							}),
							result === null && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: pending || preview === null,
								onClick: () => {
									run(true);
								},
								children: t("cleanupConfirm")
							})
						]
					})
				]
			})] });
		}
		//#endregion
		//#region lib/types/client/SnapshotPanel.js
		function formatBytes(value) {
			const units = [
				"B",
				"KiB",
				"MiB",
				"GiB",
				"TiB"
			];
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit++;
			}
			return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
		}
		/** Workspace storage UI. All data is transient and fetched outside the conversation. */
		function SnapshotPanel({ onStatus, onCleanupPreview, onCleanupConfirm, t }) {
			const dialog = (0, react.useRef)(null);
			const generation = (0, react.useRef)(0);
			const busy = (0, react.useRef)(false);
			const [pending, setPending] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const title = (0, react.useId)();
			(0, react.useEffect)(() => () => {
				generation.current++;
			}, []);
			const load = async () => {
				if (busy.current) return;
				busy.current = true;
				const ticket = ++generation.current;
				setPending(true);
				setError(null);
				try {
					const result = await onStatus();
					if (ticket !== generation.current) return;
					if (!result.ok || result.status === void 0) setError(result.error ?? t("previewUnavailable"));
					else setStatus(result.status);
				} catch (failure) {
					if (ticket === generation.current) setError(String(failure));
				} finally {
					if (ticket === generation.current) {
						busy.current = false;
						setPending(false);
					}
				}
			};
			const close = () => {
				generation.current++;
				busy.current = false;
				setPending(false);
				dialog.current?.close();
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("status"),
				side: "bottom",
				delayMs: 500,
				children: (0, react_jsx_runtime.jsx)("button", {
					className: RewindAction_module_css_default.action,
					type: "button",
					"aria-label": t("status"),
					onClick: () => {
						dialog.current?.showModal();
						load();
					},
					children: (0, react_jsx_runtime.jsx)(IconData, { size: 14 })
				})
			}), (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: RewindAction_module_css_default.dialog,
				"aria-labelledby": title,
				onCancel: close,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						id: title,
						children: t("snapshotTitle")
					}),
					pending && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("snapshotLoading")
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: RewindAction_module_css_default.failure,
						children: error
					}),
					status !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", {
							className: RewindAction_module_css_default.path,
							children: status.workspace
						}),
						(0, react_jsx_runtime.jsxs)("dl", {
							className: RewindAction_module_css_default.metrics,
							children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: t("workspaceRecords") }), (0, react_jsx_runtime.jsx)("dd", { children: formatBytes(status.recordsBytes) })] }), (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: t("sharedContent") }), (0, react_jsx_runtime.jsx)("dd", { children: formatBytes(status.sharedContentBytes) })] })]
						}),
						(0, react_jsx_runtime.jsx)("p", {
							className: RewindAction_module_css_default.muted,
							children: t("sharedExplanation")
						}),
						(0, react_jsx_runtime.jsx)("h3", { children: t("snapshotSessions") }),
						status.sessions.length === 0 ? (0, react_jsx_runtime.jsx)("p", { children: t("snapshotNoSessions") }) : (0, react_jsx_runtime.jsx)("ul", {
							className: RewindAction_module_css_default.sessions,
							children: status.sessions.map((session) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("code", { children: session.session }), (0, react_jsx_runtime.jsx)("span", { children: t("snapshotTurns", { count: String(session.turns) }) })] }, session.session))
						}),
						(0, react_jsx_runtime.jsxs)("details", {
							className: RewindAction_module_css_default.exclusions,
							children: [(0, react_jsx_runtime.jsx)("summary", { children: t("snapshotExcluded", { count: String(status.unprotected.length) }) }), (0, react_jsx_runtime.jsx)("ul", {
								className: RewindAction_module_css_default.changes,
								children: status.unprotected.map((file) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("code", { children: file.path }), (0, react_jsx_runtime.jsx)("span", { children: file.reason })] }, file.path))
							})]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: RewindAction_module_css_default.cleanupSection,
							children: [
								(0, react_jsx_runtime.jsx)("h3", { children: t("cleanup") }),
								(0, react_jsx_runtime.jsx)("p", { children: t("cleanupKeeps") }),
								(0, react_jsx_runtime.jsx)(CleanupAction, {
									onCleanupPreview,
									onCleanupConfirm,
									onComplete: () => {
										load();
									},
									t
								})
							]
						})
					] }),
					(0, react_jsx_runtime.jsxs)("div", {
						className: RewindAction_module_css_default.buttons,
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: pending,
							onClick: () => {
								load();
							},
							children: t("snapshotRefresh")
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: close,
							children: t("close")
						})]
					})
				]
			})] });
		}
		//#endregion
		//#region lib/types/client/RedoAction.js
		function RedoAction({ redoSelection: selection, onRedoPreview, onRedoConfirm, onOpenSession, t }) {
			const selected = (0, react.useSyncExternalStore)(selection.subscribe, selection.snapshot);
			const dialog = (0, react.useRef)(null);
			const titleId = (0, react.useId)();
			const busy = (0, react.useRef)(false);
			const generation = (0, react.useRef)(0);
			const [phase, setPhase] = (0, react.useState)("ready");
			const [preview, setPreview] = (0, react.useState)(null);
			const [noRestore, setNoRestore] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			(0, react.useEffect)(() => () => {
				generation.current++;
				busy.current = false;
				selection.close();
			}, [selection]);
			(0, react.useEffect)(() => {
				if (selected === null || busy.current) return;
				generation.current++;
				setNoRestore(false);
				setPreview(selected.preview);
				setError(null);
				setResult(null);
				setPhase("ready");
				dialog.current?.showModal();
			}, [selected]);
			const close = () => {
				if (phase === "confirming") return;
				generation.current++;
				busy.current = false;
				selection.close();
				setPreview(null);
				setPhase("ready");
				dialog.current?.close();
			};
			const load = async () => {
				if (busy.current) return;
				busy.current = true;
				const attempt = ++generation.current;
				setNoRestore(false);
				setPhase("loading");
				setPreview(null);
				setError(null);
				setResult(null);
				dialog.current?.showModal();
				try {
					const reply = await onRedoPreview();
					if (attempt !== generation.current) return;
					if (reply.ok && reply.redoPreview !== void 0) setPreview(reply.redoPreview);
					else if (reply.errorCode === "no-restore") setNoRestore(true);
					else setError(reply.error ?? t("redoUnavailable"));
				} catch (failure) {
					if (attempt === generation.current) setError(String(failure));
				} finally {
					if (attempt === generation.current) {
						busy.current = false;
						setPhase("ready");
					}
				}
			};
			const confirm = async () => {
				if (busy.current || preview === null) return;
				busy.current = true;
				const attempt = ++generation.current;
				setPhase("confirming");
				setError(null);
				try {
					const reply = await onRedoConfirm(preview.token);
					if (attempt !== generation.current) return;
					setPreview(null);
					selection.close();
					if (reply.ok) setResult({
						message: reply.message ?? t("redoDone"),
						child: reply.child
					});
					else if (reply.errorCode === "no-restore") setNoRestore(true);
					else setError(reply.error ?? t("redoUnavailable"));
				} catch (failure) {
					if (attempt === generation.current) {
						setPreview(null);
						setError(String(failure));
					}
				} finally {
					if (attempt === generation.current) {
						busy.current = false;
						setPhase("ready");
					}
				}
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("undo"),
				side: "bottom",
				delayMs: 500,
				children: (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: RewindAction_module_css_default.action,
					"aria-label": t("undo"),
					disabled: phase !== "ready",
					onClick: () => {
						load();
					},
					children: (0, react_jsx_runtime.jsx)(IconRefresh, { size: 14 })
				})
			}), (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: RewindAction_module_css_default.dialog,
				"aria-labelledby": titleId,
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						id: titleId,
						children: t(noRestore ? "redoNoRestore" : "redoTitle")
					}),
					noRestore && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("redoNoRestoreDetail")
					}),
					preview !== null && (0, react_jsx_runtime.jsx)("p", { children: t("redoExplanation") }),
					phase === "loading" && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("previewLoading")
					}),
					preview !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", { children: t("previewCounts", {
							written: String(preview.changes.filter((change) => change.action === "write").length),
							deleted: String(preview.changes.filter((change) => change.action === "delete").length)
						}) }),
						preview.returnedTo !== void 0 && (0, react_jsx_runtime.jsx)("p", { children: t("redoDestination", { session: preview.returnedTo }) }),
						preview.changes.length === 0 ? (0, react_jsx_runtime.jsx)("p", { children: t("redoEmpty") }) : (0, react_jsx_runtime.jsx)("ul", {
							className: RewindAction_module_css_default.changes,
							"aria-label": t("previewFiles"),
							children: preview.changes.map((change) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("strong", {
								className: change.action === "delete" ? RewindAction_module_css_default.deletion : void 0,
								children: t(change.action === "delete" ? "previewDelete" : "previewWrite")
							}), (0, react_jsx_runtime.jsx)("code", { children: change.path })] }, change.path))
						}),
						(0, react_jsx_runtime.jsx)("p", { children: t("previewRefreshNotice") })
					] }),
					result !== null && (0, react_jsx_runtime.jsx)("pre", {
						className: RewindAction_module_css_default.report,
						children: result.message
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						className: RewindAction_module_css_default.failure,
						role: "alert",
						children: error
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: RewindAction_module_css_default.buttons,
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: phase === "confirming",
								onClick: close,
								children: t(result === null && !noRestore ? "cancel" : "close")
							}),
							error !== null && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: phase !== "ready",
								onClick: () => {
									load();
								},
								children: t("previewRetry")
							}),
							result === null && !noRestore && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: preview === null || phase !== "ready",
								onClick: () => {
									confirm();
								},
								children: t(phase === "confirming" ? "redoWorking" : "redoConfirm")
							}),
							result?.child !== void 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									const child = result.child;
									close();
									if (child !== void 0) onOpenSession(child);
								},
								children: t("openOriginal")
							})
						]
					})
				]
			})] });
		}
		//#endregion
		//#region lib/types/client/RewindHeader.js
		function RewindHeader(props) {
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(RedoAction, { ...props }), (0, react_jsx_runtime.jsx)(SnapshotPanel, {
				onStatus: props.onStatus,
				onCleanupPreview: props.onCleanupPreview,
				onCleanupConfirm: props.onCleanupConfirm,
				t: props.t
			})] });
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* `filesnap` namespace dictionaries. Product copy is Chinese, so `zh` is the
		* key-set source of truth and `en` is checked complete against it.
		*
		* @module
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"recoveryTitle": "中断恢复",
			"recoveryIntro": "查看未完成的文件还原，选择继续或回到操作前。恢复记录独立保存，不进入对话历史。",
			"recoveryWorking": "正在检查或还原文件…",
			"recoveryEmpty": "没有未完成的还原。",
			"recoveryRewind": "中断的回退",
			"recoveryRedo": "中断的撤销回退",
			"recoveryResume": "预览继续还原",
			"recoveryRollback": "预览回滚到操作前",
			"recoveryConfirmIntro": "确认后按以下清单还原文件。请先停止共用此目录的其他程序写入。",
			"recoveryWrite": "还原文件",
			"recoveryDelete": "删除文件",
			"recoveryNoChanges": "文件已到达目标状态；确认后完成恢复记录。",
			"recoveryConflicts": "这些文件在中断后又有修改。请先保留并处理这些修改，再刷新预览。为避免覆盖，当前无法确认。",
			"recoveryConfirm": "确认恢复",
			"recoveryDone": "恢复完成。",
			"recoveryOpen": "打开对应对话",
			"migrationAutoRunning": "正在自动迁移旧数据…",
			"migrationAutoDone": "本次启动的自动迁移已完成。跳过或失败的数据可手动扫描重试。",
			"migrationAutoOff": "自动迁移未运行。",
			"migrationAutoCounts": "已迁移 {migrated} 项，跳过或失败 {skipped} 项",
			"redoMenu": "查看撤销回退的文件清单并确认",
			"redoTitle": "撤销回退：还原内容确认",
			"redoExplanation": "将文件还原到上次回退之前的状态。回退之后的编辑可能被覆盖；确认后会先保存安全快照。原对话保留。还原成功且无剩余撤销记录时，将归档旧分支并返回原对话。",
			"redoDestination": "原对话：{session}",
			"redoEmpty": "已跟踪文件没有变化；确认后会消费本次撤销记录。",
			"redoConfirm": "确认还原到回退前",
			"redoWorking": "正在还原…",
			"redoDone": "已撤销回退。",
			"redoUnavailable": "无法预览撤销回退，请重新预览。",
			"redoNoRestore": "当前会话没有可撤销的回退",
			"redoNoRestoreDetail": "可能尚未回退，或这次回退已经撤销。请在回退后创建的分支中使用撤销回退。",
			"menuTurn": "回退到第 {turn} 轮之前",
			"openOriginal": "打开原对话",
			"migrationTitle": "数据迁移",
			"migrationIntro": "新版插件加载时自动迁移旧数据。在这里查看结果，或选择任务扫描并重试。",
			"migrationTask": "迁移任务",
			"migrationSafety": "仅处理未加载的会话；请先停止共用目录的其他 DSH 进程。迁移前保存原始备份。已兼容的数据自动跳过，不修改消息内容或分支编号。扫描结果五分钟内有效。",
			"migrationWorking": "正在处理迁移任务…",
			"migrationScanned": "已扫描 {count} 个会话，其中 {ready} 个可迁移。",
			"migrationNone": "没有需要迁移的数据。",
			"migrationFinished": "迁移已结束，请查看逐项结果。",
			"migrationBackup": "原始备份",
			"migrationScan": "扫描旧版数据",
			"migrationConfirm": "确认迁移清单中的会话",
			"migration_ready": "待迁移",
			"migration_busy": "会话已加载，请关闭后重试",
			"migration_unsupported": "暂不支持",
			"migration_error": "失败",
			"migration_migrated": "已迁移",
			"migration_skipped": "已跳过",
			"snapshotTitle": "工作区快照",
			"snapshotLoading": "正在读取磁盘占用和快照…",
			"workspaceRecords": "当前工作区索引",
			"sharedContent": "共享文件内容",
			"sharedExplanation": "文件内容由所有工作区去重共享，不能全部计入当前工作区。",
			"snapshotSessions": "持有快照的会话",
			"snapshotNoSessions": "此工作区还没有快照。",
			"snapshotTurns": "{count} 个快照轮次",
			"snapshotExcluded": "未保护的文件（{count}）",
			"snapshotRefresh": "刷新",
			"cleanup": "清理快照存储",
			"cleanupScope": "回收同一数据目录中、所有工作区已无引用的数据。此操作不会删除会话或保留的恢复点。",
			"cleanupKeeps": "仍被快照或 redo 使用的内容、对话记录和工作区文件会保留。不会自动清理旧会话。",
			"cleanupUsage": "本工作区记录：{records}；所有工作区共享内容：{shared}",
			"cleanupEstimate": "以上是当前占用，不是预计可释放空间。仍被保留的检查点不会被回收，可能没有数据可清理。",
			"cleanupConfirm": "确认回收未引用数据",
			"cleanupWorking": "正在处理快照存储…",
			"cleanupDone": "清理完成：回收 {manifests} 份无引用清单、{blobs} 个内容对象。",
			"close": "关闭",
			"previewTitle": "回退到第 {turn} 轮之前：文件变更清单",
			"previewExplanation": "确认后将恢复对话和以下文件，并打开新分支。原对话保留，可用 /redo 撤销回退。",
			"previewLoading": "正在检查文件变更…",
			"previewUnavailable": "无法获取完整文件清单，请重新预览。",
			"previewCounts": "写回或恢复 {written} 个文件，删除 {deleted} 个文件",
			"previewEmpty": "已跟踪文件没有变化；确认后仍会回退对话。",
			"previewFiles": "将变更的文件",
			"previewWrite": "写回 / 恢复",
			"previewDelete": "删除",
			"previewRefreshNotice": "清单根据当前文件状态计算。若文件变化或预览超过 5 分钟，需要重新预览。",
			"previewRetry": "重新预览",
			"cancel": "取消",
			"confirmRewind": "确认回退对话和文件",
			"rewinding": "正在回退…",
			"rewindHere": "回退到这一轮之前",
			"rewindTo": "回退到「{label}」之前",
			"covered": "本轮跟踪 {tracked} 个文件（新哈希 {hashed}）",
			"dropped": "跳过 {dropped} 个",
			"failed": "回退未完成：{reason}",
			"undo": "撤销回退",
			"undoFrom": "撤销回退到「{label}」",
			"status": "查看快照状态"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"recoveryTitle": "Interrupted restores",
			"recoveryIntro": "Inspect unfinished file restores, then continue or return to the state before the operation. Recovery records are stored outside conversation history.",
			"recoveryWorking": "Checking or restoring files…",
			"recoveryEmpty": "No unfinished restores.",
			"recoveryRewind": "Interrupted rewind",
			"recoveryRedo": "Interrupted redo",
			"recoveryResume": "Preview continuing restore",
			"recoveryRollback": "Preview rollback",
			"recoveryConfirmIntro": "Confirmation restores the files listed below. Stop other programs writing to this directory first.",
			"recoveryWrite": "Restore file",
			"recoveryDelete": "Delete file",
			"recoveryNoChanges": "Files already match the destination; confirm to finalize recovery.",
			"recoveryConflicts": "These files changed after the interruption. Preserve and resolve those edits, then refresh the preview. Confirmation is disabled to avoid overwriting them.",
			"recoveryConfirm": "Confirm recovery",
			"recoveryDone": "Recovery completed.",
			"recoveryOpen": "Open conversation",
			"migrationAutoRunning": "Migrating legacy data automatically…",
			"migrationAutoDone": "Startup migrations finished. Scan to retry skipped or failed data.",
			"migrationAutoOff": "Automatic migration has not run.",
			"migrationAutoCounts": "{migrated} migrated, {skipped} skipped or failed",
			"redoMenu": "Review files and confirm reversing the rewind",
			"redoTitle": "Reverse rewind: confirm restored content",
			"redoExplanation": "Restore files to their state before the last rewind. Edits made since then may be overwritten; a safety snapshot is saved before applying. The original conversation is preserved. After a successful restore with no remaining undo records, the old branch is archived and the original conversation opens.",
			"redoDestination": "Original conversation: {session}",
			"redoEmpty": "No tracked file changes; confirmation still consumes this undo record.",
			"redoConfirm": "Confirm restore to before the rewind",
			"redoWorking": "Restoring…",
			"redoDone": "Rewind reversed.",
			"redoUnavailable": "Could not preview redo. Preview again.",
			"redoNoRestore": "No rewind to reverse in this conversation",
			"redoNoRestoreDetail": "There may be no rewind yet, or it has already been reversed. Use redo in the branch created by a rewind.",
			"menuTurn": "Before turn {turn}",
			"openOriginal": "Open original conversation",
			"migrationTitle": "Data migrations",
			"migrationIntro": "Upgrade migrations run automatically when the plugin loads. Review their results here, or select a task to scan and retry.",
			"migrationTask": "Migration task",
			"migrationSafety": "Only unloaded sessions are modified. Stop other DSH processes sharing this directory first. An original backup is saved before each change. Compatible data is skipped. Message content and fork boundaries stay intact. Scan confirmations expire after five minutes.",
			"migrationWorking": "Processing migration…",
			"migrationScanned": "Scanned {count} sessions; {ready} can be migrated.",
			"migrationNone": "No data needs this migration.",
			"migrationFinished": "Migration finished. Review the individual results below.",
			"migrationBackup": "Original backup",
			"migrationScan": "Scan legacy data",
			"migrationConfirm": "Confirm migration of the listed sessions",
			"migration_ready": "Ready",
			"migration_busy": "Loaded; close and retry",
			"migration_unsupported": "Unsupported",
			"migration_error": "Failed",
			"migration_migrated": "Migrated",
			"migration_skipped": "Skipped",
			"snapshotTitle": "Workspace snapshots",
			"snapshotLoading": "Reading storage and snapshots…",
			"workspaceRecords": "Workspace records",
			"sharedContent": "Shared file content",
			"sharedExplanation": "File content is deduplicated across all workspaces. This is not the size of this workspace alone.",
			"snapshotSessions": "Sessions with snapshots",
			"snapshotNoSessions": "No snapshots in this workspace yet.",
			"snapshotTurns": "{count} snapshot turns",
			"snapshotExcluded": "Unprotected files ({count})",
			"snapshotRefresh": "Refresh",
			"cleanup": "Clean up snapshot storage",
			"cleanupScope": "Reclaim unreferenced data across every workspace in this data directory. Sessions and retained recovery points are kept.",
			"cleanupKeeps": "Content needed by snapshots or redo, conversation logs and workspace files are kept. Old sessions are not automatically deleted.",
			"cleanupUsage": "Workspace records: {records}; content shared across all workspaces: {shared}",
			"cleanupEstimate": "These are current usage figures, not estimated savings. Retained checkpoints stay; there may be nothing to reclaim.",
			"cleanupConfirm": "Confirm collection of unreferenced data",
			"cleanupWorking": "Processing snapshot storage…",
			"cleanupDone": "Cleanup complete: {manifests} unreferenced manifests and {blobs} content objects reclaimed.",
			"close": "Close",
			"previewTitle": "Rewind to before turn {turn}: file changes",
			"previewExplanation": "Confirmation restores the conversation and these files, then opens a new branch. The original conversation is kept; /redo reverses the rewind.",
			"previewLoading": "Checking file changes…",
			"previewUnavailable": "Could not read the complete file list. Preview again.",
			"previewCounts": "{written} files to write or restore, {deleted} files to delete",
			"previewEmpty": "No tracked file changes. Confirmation will still rewind the conversation.",
			"previewFiles": "Files that will change",
			"previewWrite": "Write / restore",
			"previewDelete": "Delete",
			"previewRefreshNotice": "This list reflects current files. Preview again if files change or more than 5 minutes pass.",
			"previewRetry": "Refresh preview",
			"cancel": "Cancel",
			"confirmRewind": "Confirm conversation and file rewind",
			"rewinding": "Rewinding…",
			"rewindHere": "Rewind to before this turn",
			"rewindTo": "Rewind to before “{label}”",
			"covered": "{tracked} files tracked this turn ({hashed} newly hashed)",
			"dropped": "{dropped} skipped",
			"failed": "The rewind did not complete: {reason}",
			"undo": "Undo the rewind",
			"undoFrom": "Undo the rewind to “{label}”",
			"status": "Show snapshot status"
		};
		//#endregion
		//#region lib/types/client/MigrationPanel.js
		/** Shared settings entry for present and future versioned migrations. */
		function MigrationPanel({ list, scan, migrate, automaticStatus, t }) {
			const [automatic, setAutomatic] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (automaticStatus === void 0) return;
				let disposed = false;
				let timer;
				const refresh = async () => {
					try {
						const status = await automaticStatus();
						if (!disposed) {
							setAutomatic(status);
							if (status.running) timer = setTimeout(() => {
								refresh();
							}, 500);
						}
					} catch (error) {
						if (!disposed) setAutomatic({
							running: false,
							started: false,
							reports: [],
							error: String(error)
						});
					}
				};
				refresh();
				return () => {
					disposed = true;
					clearTimeout(timer);
				};
			}, [automaticStatus]);
			const [tasks, setTasks] = (0, react.useState)([]);
			const [task, setTask] = (0, react.useState)("");
			const [plan, setPlan] = (0, react.useState)(null);
			const [report, setReport] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const busy = (0, react.useRef)(false);
			const generation = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				const ticket = ++generation.current;
				list().then((rows) => {
					if (ticket !== generation.current) return;
					setTasks(rows);
					setTask(rows[0]?.id ?? "");
				}).catch((e) => {
					if (ticket === generation.current) setError(String(e));
				});
				return () => {
					generation.current++;
				};
			}, [list]);
			const run = async (confirm) => {
				if (automatic?.running || busy.current || task === "" || confirm && plan === null) return;
				busy.current = true;
				setPending(true);
				setError(null);
				setReport(null);
				const ticket = ++generation.current;
				try {
					if (confirm) {
						const result = await migrate(plan.token);
						if (ticket === generation.current) {
							setReport(result);
							setPlan(null);
						}
					} else {
						setPlan(null);
						const result = await scan(task);
						if (ticket === generation.current) setPlan(result);
					}
				} catch (failure) {
					if (ticket === generation.current) {
						setError(String(failure));
						setPlan(null);
					}
				} finally {
					if (ticket === generation.current) {
						busy.current = false;
						setPending(false);
					}
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: RewindAction_module_css_default.settings,
				children: [
					(0, react_jsx_runtime.jsx)("h2", { children: t("migrationTitle") }),
					(0, react_jsx_runtime.jsx)("p", { children: t("migrationIntro") }),
					automatic !== null && (0, react_jsx_runtime.jsxs)("div", {
						role: "status",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: t(automatic.running ? "migrationAutoRunning" : automatic.started ? "migrationAutoDone" : "migrationAutoOff") }),
							automatic.reports.map((report) => (0, react_jsx_runtime.jsxs)("p", { children: [
								tasks.find((task) => task.id === report.task)?.nameZh ?? report.task,
								": ",
								t("migrationAutoCounts", {
									migrated: String(report.entries.filter((row) => row.state === "migrated").length),
									skipped: String(report.entries.filter((row) => row.state !== "migrated").length)
								})
							] }, report.task)),
							automatic.error !== void 0 && (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								children: automatic.error
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("label", { children: [t("migrationTask"), (0, react_jsx_runtime.jsx)("select", {
						value: task,
						disabled: pending || automatic?.running,
						onChange: (e) => {
							setTask(e.target.value);
							setPlan(null);
							setReport(null);
						},
						children: tasks.map((row) => (0, react_jsx_runtime.jsxs)("option", {
							value: row.id,
							children: [
								row.from,
								" → ",
								row.to,
								" · ",
								row.nameZh,
								" / ",
								row.name
							]
						}, row.id))
					})] }),
					(0, react_jsx_runtime.jsx)("p", {
						className: RewindAction_module_css_default.muted,
						children: t("migrationSafety")
					}),
					pending && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("migrationWorking")
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: RewindAction_module_css_default.failure,
						children: error
					}),
					plan !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", { children: t("migrationScanned", {
							count: String(plan.scanned),
							ready: String(plan.entries.filter((row) => row.state === "ready").length)
						}) }),
						plan.entries.length === 0 && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: t("migrationNone")
						}),
						(0, react_jsx_runtime.jsx)("ul", {
							className: RewindAction_module_css_default.sessions,
							children: plan.entries.map((row) => (0, react_jsx_runtime.jsxs)("li", { children: [
								(0, react_jsx_runtime.jsx)("code", { children: row.session }),
								(0, react_jsx_runtime.jsxs)("span", { children: [
									t(`migration_${row.state}`),
									" · ",
									row.events
								] }),
								row.detail !== void 0 && (0, react_jsx_runtime.jsx)("small", {
									className: RewindAction_module_css_default.path,
									children: row.detail
								})
							] }, row.session))
						})
					] }),
					report !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("migrationFinished")
					}), (0, react_jsx_runtime.jsx)("ul", {
						className: RewindAction_module_css_default.sessions,
						children: report.entries.map((row) => (0, react_jsx_runtime.jsxs)("li", { children: [
							(0, react_jsx_runtime.jsx)("code", { children: row.session }),
							(0, react_jsx_runtime.jsx)("span", { children: t(`migration_${row.state}`) }),
							row.backup !== void 0 && (0, react_jsx_runtime.jsxs)("small", {
								className: RewindAction_module_css_default.path,
								children: [
									t("migrationBackup"),
									": ",
									row.backup
								]
							}),
							row.detail !== void 0 && (0, react_jsx_runtime.jsx)("small", {
								className: RewindAction_module_css_default.path,
								children: row.detail
							})
						] }, row.session))
					})] }),
					(0, react_jsx_runtime.jsxs)("div", {
						className: RewindAction_module_css_default.buttons,
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: pending || task === "",
							onClick: () => {
								run(false);
							},
							children: t("migrationScan")
						}), plan !== null && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: pending || !plan.entries.some((row) => row.state === "ready"),
							onClick: () => {
								run(true);
							},
							children: t("migrationConfirm")
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/RecoveryPanel.js
		function FileSnapSettings(props) {
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(RecoveryPanel, { ...props }), (0, react_jsx_runtime.jsx)(MigrationPanel, { ...props })] });
		}
		/** Recovery stays outside the conversation, including when the source session is cold. */
		function RecoveryPanel({ listRecovery, previewRecovery, applyRecovery, openSession, t }) {
			const [items, setItems] = (0, react.useState)([]);
			const [preview, setPreview] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(false);
			const [destination, setDestination] = (0, react.useState)(null);
			const busy = (0, react.useRef)(false), generation = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				const ticket = ++generation.current;
				listRecovery().then((rows) => {
					if (ticket === generation.current) setItems(rows);
				}).catch((e) => {
					if (ticket === generation.current) setError(String(e));
				});
				return () => {
					generation.current++;
				};
			}, [listRecovery]);
			const run = async (task) => {
				if (busy.current) return;
				busy.current = true;
				setPending(true);
				setError(null);
				const ticket = generation.current;
				try {
					await task();
				} catch (e) {
					if (ticket === generation.current) {
						setError(String(e));
						setPreview(null);
					}
				} finally {
					busy.current = false;
					if (ticket === generation.current) setPending(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: RewindAction_module_css_default.settings,
				children: [
					(0, react_jsx_runtime.jsx)("h2", { children: t("recoveryTitle") }),
					(0, react_jsx_runtime.jsx)("p", { children: t("recoveryIntro") }),
					pending && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("recoveryWorking")
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: RewindAction_module_css_default.failure,
						children: error
					}),
					items.length === 0 && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("recoveryEmpty")
					}),
					items.map((item) => (0, react_jsx_runtime.jsxs)("article", {
						className: RewindAction_module_css_default.recoveryItem,
						children: [
							(0, react_jsx_runtime.jsx)("strong", { children: t(item.kind === "rewind" ? "recoveryRewind" : "recoveryRedo") }),
							(0, react_jsx_runtime.jsx)("p", {
								className: RewindAction_module_css_default.path,
								children: item.cwd
							}),
							(0, react_jsx_runtime.jsxs)("p", {
								className: RewindAction_module_css_default.muted,
								children: [
									new Date(item.createdAt).toLocaleString(),
									" · ",
									item.source,
									" → ",
									item.destination
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: RewindAction_module_css_default.buttons,
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: pending || item.phase === "rollback",
									onClick: () => {
										run(async () => {
											setPreview(null);
											setPreview(await previewRecovery(item.id, "apply"));
										});
									},
									children: t("recoveryResume")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: pending,
									onClick: () => {
										run(async () => {
											setPreview(null);
											setPreview(await previewRecovery(item.id, "rollback"));
										});
									},
									children: t("recoveryRollback")
								})]
							})
						]
					}, item.id)),
					preview !== null && (0, react_jsx_runtime.jsxs)("section", {
						className: RewindAction_module_css_default.cleanupSection,
						children: [
							(0, react_jsx_runtime.jsx)("h3", { children: t(preview.mode === "apply" ? "recoveryResume" : "recoveryRollback") }),
							(0, react_jsx_runtime.jsx)("p", { children: t("recoveryConfirmIntro") }),
							(0, react_jsx_runtime.jsx)("ul", {
								className: RewindAction_module_css_default.changes,
								children: preview.changes.map((row) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t(row.action === "write" ? "recoveryWrite" : "recoveryDelete") }), (0, react_jsx_runtime.jsx)("code", { children: row.path })] }, row.path))
							}),
							preview.changes.length === 0 && (0, react_jsx_runtime.jsx)("p", { children: t("recoveryNoChanges") }),
							preview.conflicts.length > 0 && (0, react_jsx_runtime.jsxs)("div", {
								role: "alert",
								children: [(0, react_jsx_runtime.jsx)("p", { children: t("recoveryConflicts") }), (0, react_jsx_runtime.jsx)("ul", { children: preview.conflicts.map((path) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsx)("code", { children: path }) }, path)) })]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: RewindAction_module_css_default.buttons,
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: pending,
									onClick: () => setPreview(null),
									children: t("cancel")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: pending || preview.conflicts.length > 0,
									onClick: () => {
										run(async () => {
											const result = await applyRecovery(preview.token);
											setPreview(null);
											setDestination(result.openSession);
											setItems(await listRecovery());
										});
									},
									children: t("recoveryConfirm")
								})]
							})
						]
					}),
					destination !== null && (0, react_jsx_runtime.jsxs)("p", {
						role: "status",
						children: [
							t("recoveryDone"),
							" ",
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => openSession(destination),
								children: t("recoveryOpen")
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: RewindAction_module_css_default.buttons,
						children: (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: pending,
							onClick: () => {
								run(async () => {
									setPreview(null);
									setItems(await listRecovery());
								});
							},
							children: t("snapshotRefresh")
						})
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/point-store.js
		/** How long a failed read waits before one retry, with the view still on screen. */
		const RETRY_DELAY = 2500;
		function pointStore(read) {
			let revision;
			let latest;
			let points = [];
			let generation = 0;
			let retry;
			const listeners = /* @__PURE__ */ new Set();
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const snapshot = () => points;
			const cancelRetry = () => {
				if (retry === void 0) return;
				clearTimeout(retry);
				retry = void 0;
			};
			const publish = (next) => {
				points = next;
				for (const listener of listeners) listener();
			};
			const attempt = (ticket, again) => {
				const failed = () => {
					if (ticket !== generation) return;
					revision = void 0;
					publish([]);
					if (again) schedule(ticket);
				};
				read().then((result) => {
					if (ticket !== generation) return;
					if (!result.ok) {
						failed();
						return;
					}
					cancelRetry();
					revision = latest;
					publish(result.points ?? []);
				}).catch(failed);
			};
			const schedule = (ticket) => {
				if (ticket !== generation || retry !== void 0) return;
				retry = setTimeout(() => {
					retry = void 0;
					if (ticket !== generation) return;
					if (listeners.size === 0) return;
					revision = latest;
					attempt(++generation, false);
				}, RETRY_DELAY);
			};
			const refresh = (projection) => {
				if (projection === void 0) return;
				latest = projection;
				if (revision === projection) return;
				cancelRetry();
				revision = projection;
				attempt(++generation, true);
			};
			return {
				refresh,
				snapshot,
				subscribe
			};
		}
		//#endregion
		//#region lib/types/client/points.js
		/** React binding of the shared points store; one reader per session. */
		function pointReader(read) {
			const store = pointStore(read);
			return function usePoints(projection) {
				(0, react.useEffect)(() => store.refresh(projection), [projection]);
				return (0, react.useSyncExternalStore)(store.subscribe, store.snapshot, store.snapshot);
			};
		}
		//#endregion
		//#region lib/types/client/refill.js
		/** Fill only an idle, empty child composer; never replace a newly written draft. */
		function refillPrompt(input, text) {
			if (text === void 0 || text === "") return false;
			const current = input.state.getSnapshot();
			const attachments = current.attachmentIds ?? current.imageIds ?? [];
			if (current.draft !== "" || attachments.length !== 0 || current.phase !== "plain") return false;
			input.setDraft(text);
			return true;
		}
		//#endregion
		//#region lib/types/client/open-session.js
		/**
		* Reveal a session, whichever navigation API the client has.
		*
		* Navigation moved out of the session controller: current clients keep the
		* controller's `sessions` surface free of view concerns — "view selection
		* remains outside the Controller" — and expose `uiWorkspace.openSession`
		* instead, while the generation whose `sessions` still carries `open(id)`
		* remains in the supported range. Probe the workspace first, fall back to the
		* controller, and never throw when neither exists: a rewind that already
		* restored files and forked a conversation must not be reported as failed
		* because the client could not switch views.
		*
		* @param host - the client context (service lookup and logging).
		* @param sessions - the injected `sessions` service.
		* @param id - the session to reveal.
		* @returns whether any navigation API accepted the target.
		*/
		function revealSession(host, sessions, id) {
			const workspace = host.get("uiWorkspace");
			if (typeof workspace?.openSession === "function") try {
				workspace.openSession(id);
				return true;
			} catch (error) {
				host.logger.warn("filesnap: uiWorkspace.openSession refused: %s", String(error));
			}
			const legacy = sessions.open;
			if (typeof legacy === "function") try {
				legacy.call(sessions, id);
				return true;
			} catch (error) {
				host.logger.warn("filesnap: sessions.open refused: %s", String(error));
			}
			return false;
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "filesnap";
		/** Required services: the slot system, session control, and copy. */
		const inject = [
			"slots",
			"sessions",
			"locale",
			"conversation",
			"connection",
			"commandUi"
		];
		/**
		* Client plugin body: the per-turn rewind control and the session-level strip.
		*
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-filesnap: dictionaries");
			const sessions = ctx.sessions;
			const connection = ctx.get("connection");
			const readers = /* @__PURE__ */ new Map();
			const request = async (sessionId, endpoint, args = {}) => {
				try {
					const result = await connection.rpc.call("/filesnap", endpoint, {
						sessionId,
						...args
					});
					if (!result.ok) return {
						ok: false,
						error: result.error.message
					};
					const reply = result.value;
					return typeof reply?.ok === "boolean" ? reply : {
						ok: false,
						error: "Invalid FileSnap response."
					};
				} catch (error) {
					return {
						ok: false,
						error: String(error)
					};
				}
			};
			const reader = (sessionId) => {
				let usePoints = readers.get(sessionId);
				if (usePoints === void 0) {
					usePoints = pointReader(() => request(sessionId, "points"));
					readers.set(sessionId, usePoints);
				}
				return usePoints;
			};
			ctx.effect(() => () => {
				readers.clear();
			});
			const maintenance = async (endpoint, payload) => {
				const result = await connection.rpc.call("/filesnap", endpoint, payload);
				if (!result.ok) throw new Error(result.error.message);
				const refusal = result.value;
				if (refusal?.ok === false) throw new Error(refusal.error ?? "Migration failed.");
				return result.value;
			};
			const migrationActions = {
				automaticStatus: () => maintenance("migration-auto-status", {}),
				list: () => maintenance("migration-list", {}),
				scan: (task) => maintenance("migration-scan", { task }),
				migrate: (token) => maintenance("migration-apply", { token })
			};
			const recoveryActions = {
				listRecovery: () => maintenance("recovery-list", {}),
				previewRecovery: (id, mode) => maintenance("recovery-preview", {
					id,
					mode
				}),
				applyRecovery: (token) => maintenance("recovery-apply", { token }),
				openSession: (id) => {
					revealSession(ctx, sessions, id);
				}
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "filesnap",
				order: 60,
				label: "FileSnap",
				locale: NS,
				inject: () => ({
					...migrationActions,
					...recoveryActions
				})
			}, FileSnapSettings));
			const actions = (sessionId) => ({
				usePoints: reader(sessionId),
				onPreview: (point) => request(sessionId, "preview", { point: point.point }),
				onRewind: async (point, token) => {
					const atSeq = point.boundary;
					if (atSeq === void 0) return {
						ok: false,
						error: `turn ${String(point.turn)} has no completed turn before it to fork from`
					};
					let child;
					try {
						child = await sessions.fork({
							sessionId,
							atSeq,
							increaseTitle: true
						});
					} catch (error) {
						return {
							ok: false,
							error: String(error)
						};
					}
					const done = await request(sessionId, "rewind", {
						point: point.point,
						child,
						token
					});
					if (done.ok && done.message !== void 0) return {
						ok: false,
						error: done.message
					};
					if (done.ok) {
						revealSession(ctx, sessions, child);
						const binding = sessions.binding(child);
						if (binding !== void 0) try {
							refillPrompt(ctx.conversation.input.for(binding.ctx), done.promptText);
						} catch (error) {
							ctx.logger.warn("filesnap: could not refill the prompt: %s", String(error));
						}
					}
					return done;
				}
			});
			const selections = /* @__PURE__ */ new Map();
			const selectionFor = (sessionId) => {
				let selection = selections.get(sessionId);
				if (selection === void 0) {
					selection = rewindSelection();
					selections.set(sessionId, selection);
				}
				return selection;
			};
			ctx.effect(() => () => {
				selections.clear();
			});
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.commandUi.decorate(rewindMenu((sessionId) => request(sessionId, "points"), (sessionId, point) => selectionFor(sessionId).open(point), (turn) => t("menuTurn", { turn: String(turn) }))), "filesnap: /rewind picker");
			const redoSelections = /* @__PURE__ */ new Map();
			const redoSelectionFor = (sessionId) => {
				let selection = redoSelections.get(sessionId);
				if (selection === void 0) {
					selection = redoSelection();
					redoSelections.set(sessionId, selection);
				}
				return selection;
			};
			ctx.effect(() => () => {
				redoSelections.clear();
			});
			ctx.effect(() => ctx.commandUi.decorate(redoMenu((sessionId) => request(sessionId, "redo-preview"), (sessionId, preview) => redoSelectionFor(sessionId).open(preview), () => t("redoMenu"), () => t("redoNoRestore"))), "filesnap: /redo confirmation");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "filesnap-command-preview",
				order: 21,
				locale: NS,
				inject: (sessionId) => ({
					selection: selectionFor(sessionId),
					...actions(sessionId)
				})
			}, CommandRewindPreview));
			ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
				name: "conversation.chat.assistant-actions",
				id: "filesnap",
				order: 30,
				locale: NS,
				inject: actions
			}, RewindAction));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "filesnap",
				order: 20,
				locale: NS,
				inject: (sessionId) => ({
					onOpenSession: (id) => {
						revealSession(ctx, sessions, id);
					},
					onCleanupPreview: () => request(sessionId, "cleanup-preview"),
					onCleanupConfirm: (token) => request(sessionId, "cleanup", { token }),
					redoSelection: redoSelectionFor(sessionId),
					onRedoPreview: () => request(sessionId, "redo-preview"),
					onRedoConfirm: async (token) => {
						const result = await request(sessionId, "redo", { token });
						if (result.ok && result.archived && result.child !== void 0) revealSession(ctx, sessions, result.child);
						return result;
					},
					onStatus: () => request(sessionId, "status")
				})
			}, RewindHeader));
		}
		//#endregion
		exports.RewindAction = RewindAction;
		exports.RewindHeader = RewindHeader;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map