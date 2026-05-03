/**
 * Build-stamped provenance, injected by vite.config.ts (and stubbed by
 * vitest.config.ts so the tree compiles under tests). The task pane
 * displays these so a sideloaded dev build and an admin-deployed prod
 * build can be told apart at a glance — both show up as "KATS" menus
 * in Word otherwise.
 */
declare const __KATS_GIT_DESCRIBE__: string;
declare const __KATS_GIT_BRANCH__: string;
declare const __KATS_BUILD_KIND__: 'dev' | 'prod' | 'test';

/** `git describe --always --dirty --broken` at build/serve time. */
export const KATS_ADDIN_VERSION: string = __KATS_GIT_DESCRIBE__;

/** Current git branch at build/serve time. */
export const KATS_GIT_BRANCH: string = __KATS_GIT_BRANCH__;

/**
 * `'dev'` when bundled by `yarn start` (Vite serve), `'prod'` when
 * bundled by `yarn build`, `'test'` under vitest.
 */
export const KATS_BUILD_KIND: 'dev' | 'prod' | 'test' = __KATS_BUILD_KIND__;
