const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createRequire } = require("node:module");

// Revisión visual local con React Native Web. No permite guardar operaciones.
const mobile = path.resolve(__dirname, "..");
const root = path.resolve(mobile, "..");
const webRequire = createRequire(path.join(root, "web/package.json"));
const mobileRequire = createRequire(path.join(mobile, "package.json"));
const esbuild = webRequire("esbuild");
const output = path.join(root, "tmp/pro-native-preview");
const posix = (value) => value.replaceAll("\\", "/");

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const metadata = JSON.parse(
    fs.readFileSync(path.join(root, "tmp/local-pro-ui.json"), "utf8"),
  );
  if (metadata.supabaseUrl !== "http://127.0.0.1:3109")
    throw new Error("Solo se admite la base local desechable.");
  const runtime = await esbuild.build({
    stdin: {
      contents: `export {loadProWorkspace} from './shared/pro/remote-data'; export * from './shared/pro/format';`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    nodePaths: [path.join(mobile, "node_modules")],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", runtime.outputFiles[0].text)(
    module,
    module.exports,
    mobileRequire,
  );
  const api = module.exports;
  const client = {
    async rpc(name, args = {}) {
      const response = await fetch(
        `${metadata.supabaseUrl}/rest/v1/rpc/${name}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${metadata.session.access_token}`,
          },
          body: JSON.stringify(args),
        },
      );
      const data = await response.json();
      return response.ok ? { data, error: null } : { data: null, error: data };
    },
  };
  const date = api.localDate(new Date());
  const snapshot = await api.loadProWorkspace(
    client,
    metadata.organizationId,
    api.atLocal(api.addDays(date, -1), 0),
    api.atLocal(api.addDays(date, 3), 0),
  );
  const slots = {};
  for (const service of snapshot.data.services)
    for (const staff of service.staffIds) {
      const day = api.addDays(date, 1);
      const result = await client.rpc("professional_get_slots", {
        p_organization_id: metadata.organizationId,
        p_service_id: service.id,
        p_date: day,
        p_resource_ids: [staff],
        p_party_size: 1,
      });
      slots[`${service.id}:${staff}:${day}`] = result.data ?? [];
    }
  fs.writeFileSync(
    path.join(output, "snapshot.json"),
    JSON.stringify({ snapshot, slots }),
  );
  const virtual = {
    provider: `import React from 'react'; import fixture from '${posix(path.join(output, "snapshot.json"))}';
      import {canProCommand} from '${posix(path.join(root, "shared/pro/remote-actions"))}';
      import {localDate} from '${posix(path.join(root, "shared/pro/format"))}';
      const Context=React.createContext(null); export function useNativePro(){return React.useContext(Context)};
      export function PreviewProvider({children}){const [date,changeDate]=React.useState(localDate(new Date()));
        const client=React.useMemo(()=>({rpc:async(name,args)=>({data: fixture.slots[args.p_service_id+':'+args.p_resource_ids[0]+':'+args.p_date]??[],error:null})}),[]);
        const value={snapshot:fixture.snapshot,date,now:new Date(),client,pending:false,loading:false,error:null,
          changeDate,refresh:async()=>{},can:label=>canProCommand(fixture.snapshot.permissions,label),update:async()=>false};
        return <Context.Provider value={value}>{children}</Context.Provider>}`,
    router: `const router={push(){},replace(){},back(){},canGoBack:()=>true}; export const useRouter=()=>router;`,
    workspace: `import React from 'react'; import {Text} from 'react-native'; export const WorkspaceSwitch=()=> <Text>Atelier Campus</Text>;`,
    banner: `export const SocialDemoBanner=()=>null;`,
    haptics: `export const selectionAsync=async()=>{}; export const impactAsync=async()=>{}; export const notificationAsync=async()=>{}; export const ImpactFeedbackStyle={Light:'light'}; export const NotificationFeedbackType={Success:'success'};`,
  };
  await esbuild.build({
    stdin: {
      loader: "tsx",
      resolveDir: root,
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SafeAreaProvider} from 'react-native-safe-area-context';
      import {AgendaScreen} from './mobile/src/components/pro/AgendaScreen'; import {PreviewProvider} from 'preview:provider';
      createRoot(document.getElementById('root')).render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:innerWidth,height:innerHeight},insets:{top:0,left:0,right:0,bottom:0}}}><PreviewProvider><AgendaScreen/></PreviewProvider></SafeAreaProvider>);`,
    },
    bundle: true,
    outfile: path.join(output, "app.js"),
    format: "iife",
    platform: "browser",
    nodePaths: [path.join(mobile, "node_modules")],
    resolveExtensions: [
      ".web.tsx",
      ".web.ts",
      ".web.js",
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".json",
    ],
    define: {
      global: "globalThis",
      __DEV__: "false",
      "process.env.NODE_ENV": '"production"',
      "process.env.EXPO_OS": '"web"',
    },
    loader: { ".js": "jsx", ".png": "dataurl", ".ttf": "dataurl" },
    plugins: [
      {
        name: "native-preview",
        setup(build) {
          build.onResolve({ filter: /.*/ }, ({ path: name, importer }) => {
            if (name.startsWith("preview:"))
              return { path: name.slice(8), namespace: "preview" };
            if (
              name === "./ProProvider" &&
              importer.includes(
                `${path.sep}components${path.sep}pro${path.sep}`,
              )
            )
              return { path: "provider", namespace: "preview" };
            if (name === "expo-router")
              return { path: "router", namespace: "preview" };
            if (name === "@/components/WorkspaceScreens")
              return { path: "workspace", namespace: "preview" };
            if (name.endsWith("SocialDemoBanner"))
              return { path: "banner", namespace: "preview" };
            if (name === "expo-haptics")
              return { path: "haptics", namespace: "preview" };
            if (name === "react-native")
              return { path: mobileRequire.resolve("react-native-web") };
            if (name === "react-native-svg")
              return {
                path: path.join(
                  mobile,
                  "node_modules/react-native-svg/src/ReactNativeSVG.web.ts",
                ),
              };
            if (name === "lucide-react-native")
              return { path: mobileRequire.resolve(name) };
            if (
              name === "react" ||
              name.startsWith("react/") ||
              name.startsWith("react-dom")
            )
              return { path: mobileRequire.resolve(name) };
            if (name.startsWith("@/")) {
              const base = path.join(mobile, "src", name.slice(2));
              for (const suffix of [
                ".tsx",
                ".ts",
                ".js",
                "/index.tsx",
                "/index.ts",
              ])
                if (fs.existsSync(base + suffix))
                  return { path: base + suffix };
            }
          });
          build.onLoad(
            { filter: /.*/, namespace: "preview" },
            ({ path: name }) => ({
              contents: virtual[name],
              loader: "tsx",
              resolveDir: mobile,
            }),
          );
        },
      },
    ],
  });
  const fontFamilies = [
    ["500Medium", "Outfit_500Medium"],
    ["600SemiBold", "Outfit_600SemiBold"],
    ["700Bold", "Outfit_700Bold"],
    ["800ExtraBold", "Outfit_800ExtraBold"],
  ];
  const fonts = new Map(
    fontFamilies.map(([folder, name]) => [
      `/fonts/${name}.ttf`,
      path.join(
        mobile,
        `node_modules/@expo-google-fonts/outfit/${folder}/${name}.ttf`,
      ),
    ]),
  );
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${fontFamilies.map(([, name]) => `@font-face{font-family:${name};src:url('/fonts/${name}.ttf')}`).join("\n")}
    html,body,#root{margin:0;width:100%;height:100%;}#root{display:flex;}body{font-family:Arial,sans-serif;}</style><div id="root"></div><script src="/app.js"></script></html>`;
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, "http://localhost").pathname;
    if (fonts.has(route)) {
      response.setHeader("content-type", "font/ttf");
      return response.end(fs.readFileSync(fonts.get(route)));
    }
    if (route === "/app.js") {
      response.setHeader("content-type", "text/javascript");
      return response.end(fs.readFileSync(path.join(output, "app.js")));
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  });
  server.listen(3111, "127.0.0.1", () =>
    console.log(
      "Vista nativa local: http://127.0.0.1:3111. Solo lectura y capturas, sin guardado.",
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
