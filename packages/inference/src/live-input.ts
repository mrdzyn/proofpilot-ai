// C3-B2B P1: the provenance gate implementation moved unchanged into the neutral Zone P read-only module
// (`packages/provenance/src/provenance-input.ts`), whose transitive imports are statically allow-listed.
// This file keeps the exact public API by re-exporting that module, so the owner command (`live-proposal-cli.ts`)
// and every existing importer behave identically.
export * from '../../provenance/src/provenance-input.ts';
