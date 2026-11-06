import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** Execute the actual native TS module with explicitly injected platform adapters. */
export function nativeLoader(mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const cache = new Map<string, any>();
  function load(file: string): any {
    const filename = resolve(file); if (cache.has(filename)) return cache.get(filename);
    const mod = { exports: {} }; cache.set(filename, mod.exports);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { module: mod, exports: mod.exports, console, Date, Error, Set, Map, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, ...globals,
      require(name: string) {
        if (name in mocks) return mocks[name];
        if (name.startsWith('@/lib/')) return load(`../mobile/src/lib/${name.slice(6)}.ts`);
        if (name.startsWith('.')) return load(resolve(dirname(filename), `${name}.ts`));
        throw Error(`Native fixture dependency must be explicit: ${name}`);
      },
    }, { filename });
    return mod.exports;
  }
  return load;
}
