/**
 * Types for host-identity.mjs.
 *
 * The runtime module stays plain ESM so the Node scripts, the Playwright config, and the
 * release manifest all read one implementation of the games-site prefix contract. This
 * declaration lets the TypeScript config import it without widening the project's
 * `allowJs` setting, which would pull every script into the application program.
 */

export interface HostIdentity {
  readonly schemaVersion: number;
  readonly gameSlug: string;
  readonly entryFile: string;
  readonly assetPrefixBase: string;
  readonly releaseQualifier: string;
  readonly notes: string;
}

export const ROOT: string;
export const identity: HostIdentity;
export const packageJson: { readonly version: string };
export function releaseVersion(): string;
export function assetPrefix(version?: string): string;
export function objectPrefix(version?: string): string;
export function entryFile(): string;
