import express from "express";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Local development: mount Vite dev server in middlewareMode
  const startDev = async () => {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[Dev] Server running at http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("Vite dev server failed:", err);
    }
  };
  startDev();
}

// In standard production environments (not Vercel), listen on PORT
if (!process.env.VERCEL && process.env.NODE_ENV === "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Production] Server running at http://localhost:${PORT}`);
  });
}

export default app;
