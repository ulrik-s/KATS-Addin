import { type KatsDocument } from './kats-document.js';

/** Test-only KatsDocument. Mutates in-memory `body` on every replaceAll. */
export class FakeKatsDocument implements KatsDocument {
  body: string;

  constructor(initial = '') {
    this.body = initial;
  }

  replaceAll(search: string, replacement: string): Promise<number> {
    if (search.length === 0) return Promise.resolve(0);
    let count = 0;
    let result = '';
    let i = 0;
    while (i < this.body.length) {
      if (this.body.startsWith(search, i)) {
        result += replacement;
        i += search.length;
        count += 1;
      } else {
        result += this.body.charAt(i);
        i += 1;
      }
    }
    this.body = result;
    return Promise.resolve(count);
  }
}
