//#region src/volatile-config.ts
function liveValue(value) {
	return typeof value === "object" && value !== null && "get" in value ? value.get() : value;
}
//#endregion
export { liveValue as t };
