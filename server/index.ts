import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { handleVisitorStatsRequest } from "./visitorStats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use("/api/visitor-stats", (req, res, next) => {
    void handleVisitorStatsRequest(req, res, next);
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing, while keeping missing static assets as real 404s.
  app.get("*", (req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type("text/plain").send("Not found");
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
