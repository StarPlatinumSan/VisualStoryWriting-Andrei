import express from 'express';
import cors from 'cors';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json( { limit: '10mb' } ));

/* Vérifie que le serveur par défaut fonctionne */
app.get("/", (req, res) => {
  res.send("Local AI proxy running");
});

/* Vérifie que le status d'un endpoint arbitraire health fonctionne */
app.get('/api/health', (req, res) => {
   res.json({ status: "ok" });
});

/* Le endpoint vers le LLM Mistral sur LM Studio qui se connecte au serveur local */
app.post("/api/llm", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid request body" });
        return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    (async () => {
        try {
            const upstream = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            const contentType = upstream.headers.get("content-type") || "";
            const text = await upstream.text();

            res.status(upstream.status);
            if (contentType.includes("application/json")) {
                try {
                    res.json(JSON.parse(text));
                } catch {
                    res.type(contentType).send(text);
                }
            } else {
                res.type(contentType || "text/plain").send(text);
            }
        } catch (err: any) {
            const isAbort = err?.name === "AbortError";
            res.status(isAbort ? 504 : 502).json({
                error: isAbort ? "Upstream timeout" : "Upstream error",
                detail: err?.message ?? String(err)
            });
        } finally {
            clearTimeout(timeout);
        }
    })();
});

/* Le endpoint vers le LLM sur LM Studio qui permettra lui de générer des images */
app.post("/api/image", (req, res) => {
    res.json({
        message: "Image generation endpoint",
        received: true,
    });
});

/* dev listen endpoint */
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
