import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const futureTechTarget =
  process.env.FUTURETECH_CONSOLE_TARGET || "http://127.0.0.1:4096";
const futureTechAdminTarget =
  process.env.FUTURETECH_CONSOLE_PROXY || "http://127.0.0.1:5175";

const proxyPaths = [
  "/futuretech-console",
  "/assets",
  "/agent",
  "/auth",
  "/command",
  "/config",
  "/event",
  "/experimental",
  "/file",
  "/find",
  "/formatter",
  "/global",
  "/instance",
  "/log",
  "/lsp",
  "/mcp",
  "/path",
  "/permission",
  "/project",
  "/provider",
  "/pty",
  "/question",
  "/session",
  "/skill",
  "/sync",
  "/tui",
  "/vcs",
  "/favicon-96x96-v3.png",
  "/favicon-v3.svg",
  "/favicon-v3.ico",
  "/apple-touch-icon-v3.png",
  "/site.webmanifest",
  "/social-share.png",
];

function brandBody(buffer, contentType = "") {
  if (
    !/(text|javascript|json|svg|manifest)/i.test(contentType)
  ) {
    return buffer;
  }

  const text = buffer
    .toString("utf8")
    .replaceAll("OpenCode", "FutureTech")
    .replaceAll("openCode", "FutureTech")
    .replaceAll("opencode", "FutureTech");

  return Buffer.from(text, "utf8");
}

function brandedProxy(pathPrefix) {
  return {
    target: futureTechTarget,
    changeOrigin: true,
    selfHandleResponse: true,
    rewrite: (path) =>
      pathPrefix === "/futuretech-console"
        ? path.replace(/^\/futuretech-console\/?/, "/")
        : path,
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.setHeader("accept-encoding", "identity");
      });

      proxy.on("proxyRes", (proxyRes, req, res) => {
        const chunks = [];
        proxyRes.on("data", (chunk) => chunks.push(chunk));
        proxyRes.on("end", () => {
          const rawBody = Buffer.concat(chunks);
          const contentType = proxyRes.headers["content-type"] || "";
          const body = brandBody(rawBody, contentType);

          Object.entries(proxyRes.headers).forEach(([key, value]) => {
            if (
              ![
                "content-length",
                "content-encoding",
                "content-security-policy",
              ].includes(key)
            ) {
              res.setHeader(key, value);
            }
          });

          res.setHeader("content-length", body.length);
          res.statusCode = proxyRes.statusCode || 200;
          res.end(body);
        });
      });
    },
  };
}

const proxy = {
  "/futuretech-admin": {
    target: futureTechAdminTarget,
    changeOrigin: true,
  },
  ...Object.fromEntries(
    proxyPaths.map((pathPrefix) => [pathPrefix, brandedProxy(pathPrefix)])
  ),
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy,
  },
  preview: {
    proxy,
  },
});
