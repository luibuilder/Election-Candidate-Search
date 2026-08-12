import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 8765);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    let file = normalize(join(root, pathname === "/" ? "index.html" : pathname.slice(1)));
    if (!file.startsWith(root)) throw new Error("invalid path");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
