import type { Volatile } from '@deepseek-ai/cordis';
/** Loader-owned live settings, while direct fixture configurations stay plain values. */
export type LiveValue<T> = T | Volatile<T>;
export declare function liveValue<T>(value: LiveValue<T>): T;
//# sourceMappingURL=volatile-config.d.ts.map