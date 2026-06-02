import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// A simple health check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Configure Asset Serving and Dev/Prod Server Lifecycles
 */
const startAppServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    // Local development: mount Vite dev server in middlewareMode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[LocalDev] Express server running on port ${PORT}`);
    });
  } else {
    // Production lifecycle
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Fallback index.html router for client-side routing
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    // In Vercel, we must NEVER listen to a port manually because the port is automatically
    // bounded by Vercel serverless containers. Doing it anyway crashes the function.
    if (!process.env.VERCEL) {
      const PORT = 3000;
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[LocalProd] Express server running on port ${PORT}`);
      });
    } else {
      console.log("[VercelDeploy] Server loaded successfully in serverless environment!");
    }
  }
};

startAppServer().catch(err => {
  console.error("Critical error starting application server:", err);
});

// Export default app for Vercel Serverless runtime to hook directly
export default app;
