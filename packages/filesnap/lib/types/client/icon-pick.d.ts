/**
 * Pick an icon out of a client module whose export names moved across the
 * harness generations this plugin spans.
 *
 * @module
 */
import type { ComponentType } from 'react';
/** What this plugin needs from an icon: a decorative glyph drawn at a size. */
export type IconAsset = ComponentType<{
    size?: number;
}>;
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
export declare function pickIcon(source: Record<string, unknown>, names: readonly string[]): IconAsset | undefined;
