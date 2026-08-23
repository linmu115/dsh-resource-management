import { readFile } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { basename, dirname, resolve as resolvePath } from "node:path";
import type { UserConfig } from "tsdown";

const require = createRequire(import.meta.url);
const CLIENT_EXTERNALS = ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "cordis"];
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const CSS_PREFIX = "\0dsh-management-css:";
const CSS_SUFFIX = ".mjs";
const VFILE_SHIM_PREFIX = "\0dsh-vfile-browser:";

type BuildPlugin = NonNullable<UserConfig["plugins"]>;

function clientPurity(): BuildPlugin {
  return {
    name: "dsh-plugin-management-client-purity",
    resolveId(source: string, importer: string | undefined) {
      if (importer?.replaceAll("\\", "/").includes("/vfile/lib/min")) {
        if (source === "node:path") return `${VFILE_SHIM_PREFIX}path`;
        if (source === "node:process") return `${VFILE_SHIM_PREFIX}process`;
        if (source === "node:url") return `${VFILE_SHIM_PREFIX}url`;
      }
      if (NODE_BUILTINS.has(source)) throw new Error(`Node builtin cannot enter the DSH client bundle: ${source} from ${importer ?? "<entry>"}`);
      if (source.startsWith("@deepseek-ai/")) {
        throw new Error(`DSH platform value import must use a public client service instead: ${source}`);
      }
      return null;
    },
    load(id: string) {
      if (id === `${VFILE_SHIM_PREFIX}path`) {
        return "const minpath = { basename: (v) => String(v).split('/').pop() || '', dirname: (v) => { const p = String(v); const i = p.lastIndexOf('/'); return i < 1 ? '.' : p.slice(0, i) }, extname: (v) => { const b = String(v).split('/').pop() || ''; const i = b.lastIndexOf('.'); return i < 1 ? '' : b.slice(i) }, join: (...v) => v.filter(Boolean).join('/'), sep: '/' }; export default minpath;";
      }
      if (id === `${VFILE_SHIM_PREFIX}process`) return "export default { cwd: () => '/' };";
      if (id === `${VFILE_SHIM_PREFIX}url`) return "export const fileURLToPath = (v) => decodeURIComponent(new URL(v).pathname);";
      return null;
    },
  };
}

function inlineCss(pluginId: string): BuildPlugin {
  return {
    name: "dsh-plugin-management-inline-css",
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith(".css")) return null;
      const filename = source.startsWith(".")
        ? resolvePath(dirname(importer ?? import.meta.filename), source)
        : require.resolve(source);
      return `${CSS_PREFIX}${filename}${CSS_SUFFIX}`;
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null;
      const filename = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length);
      this.addWatchFile(filename);
      const css = await readFile(filename, "utf8");
      const tagId = `${pluginId}/${basename(filename)}`;
      return [
        `const css = ${JSON.stringify(css)};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
        "  const tag = document.createElement('style');",
        `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
        "  tag.dataset.pluginCss = tagId;",
        "  tag.textContent = css;",
        "  document.head.appendChild(tag);",
        "}",
        "export default '';",
      ].join("\n");
    },
  };
}

export default [
  {
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    target: "es2024",
    fixedExtension: false,
    clean: false,
    dts: false,
    external: ["@deepseek-ai/cordis"],
    noExternal: (id: string) => id === "@deepseek-ai/cordis" ? undefined : true,
  },
  {
    entry: { client: "src/client.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    clean: false,
    dts: false,
    sourcemap: true,
    external: CLIENT_EXTERNALS,
    noExternal: (id: string) => CLIENT_EXTERNALS.includes(id) ? undefined : true,
    plugins: [clientPurity(), inlineCss("dsh-resource-management")],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    inputOptions: {
      resolve: { conditionNames: ["browser", "import", "require", "default"] },
    },
    outputOptions: {
      codeSplitting: false,
      entryFileNames: "client.js",
      banner: "window.__ModuleLoader__.load({ id: 'dsh-resource-management', factory: (require) => {",
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
    },
  },
] satisfies UserConfig[];
