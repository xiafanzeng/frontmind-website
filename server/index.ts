import express from "express";
import compression from "compression";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { handleVisitorStatsRequest } from "./visitorStats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(compression());

  app.use("/api/visitor-stats", (req, res, next) => {
    void handleVisitorStatsRequest(req, res, next);
  });

  app.get(
    [
      "/blogs",
      "/blogs/",
      "/research/community/blogs",
      "/research/community/blogs/",
    ],
    (req, res) => {
      res.redirect(301, `/blog${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`);
    },
  );

  app.get(
    [
      "/blogs/generative-engine-optimization/:slug",
      "/blogs/generative-engine-optimization/:slug/",
      "/blogs/:slug",
      "/blogs/:slug/",
      "/research/community/blogs/generative-engine-optimization/:slug",
      "/research/community/blogs/generative-engine-optimization/:slug/",
      "/research/community/blogs/:slug",
      "/research/community/blogs/:slug/",
    ],
    (req, res) => {
      const query = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
      res.redirect(301, `/blog/${req.params.slug}${query}`);
    },
  );

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath, {
    redirect: false,
    setHeaders(res, filePath) {
      const relativePath = path.relative(staticPath, filePath).split(path.sep).join("/");

      if (relativePath === "index.html" || relativePath.endsWith("/index.html")) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        return;
      }

      if (["robots.txt", "sitemap.xml", "llms.txt"].includes(relativePath)) {
        res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
        return;
      }

      if (relativePath.startsWith("assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }

      if (/\.(?:avif|webp|png|jpe?g|svg|gif|ico|css|js|woff2?)$/i.test(relativePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    },
  }));

  // Handle client-side routing, while keeping missing static assets as real 404s.
  app.get("*", (req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }

    const routePath = req.path === "/" ? "/" : req.path.replace(/\/+$/, "");
    const routeIndexPath = path.resolve(staticPath, `.${routePath}`, "index.html");
    const staticRoot = `${staticPath}${path.sep}`;

    if (routeIndexPath.startsWith(staticRoot) && existsSync(routeIndexPath)) {
      res.sendFile(routeIndexPath);
      return;
    }

    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 8888;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
