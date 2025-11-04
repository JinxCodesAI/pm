const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_DIR = path.join(__dirname);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

function resolvePath(requestUrl) {
  const rawPath = decodeURIComponent(requestUrl.split("?")[0]);
  if (rawPath === "/" || rawPath === "") {
    return path.join(BASE_DIR, "index.html");
  }

  const relativePath = rawPath.replace(/^\/+/, "");
  const absolutePath = path.join(BASE_DIR, relativePath);

  if (!absolutePath.startsWith(BASE_DIR)) {
    return null;
  }

  return absolutePath;
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
}

const server = http.createServer((req, res) => {
  const filePath = resolvePath(req.url);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr) {
      sendNotFound(res);
      return;
    }

    let resolvedPath = filePath;
    if (stats.isDirectory()) {
      resolvedPath = path.join(filePath, "index.html");
    }

    fs.readFile(resolvedPath, (readErr, data) => {
      if (readErr) {
        sendNotFound(res);
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Creative Co-Pilot mockup available at http://localhost:${PORT}`);
});
