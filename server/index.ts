import express from "express";
import cors from "cors";
import "dotenv/config";

import fs from "fs/promises";
import path from "path";

const app = express();
const port = Number(process.env.PORT ?? 3001);

const LLM_URL = process.env.LLM_URL || "http://127.0.0.1:1234/v1/chat/completions";
const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";
const COMFY_CKPT = process.env.COMFY_CKPT || "sd_xl_base_0.9.safetensors";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* Vérifie que le serveur par défaut fonctionne */
app.get("/", (req, res) => {
  res.send("Local AI proxy running");
});

/* Vérifie que le status d'un endpoint arbitraire health fonctionne */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/* Le endpoint vers le LLM Mistral sur LM Studio qui se connecte au serveur local */
app.post("/api/llm", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const upstream = await fetch(LLM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
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
      detail: err?.message ?? String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
});

/* Le endpoint vers l'IA image (ComfyUI) et qui prend un prompt pour générer une image IA */
app.post("/api/image", async (req, res) => {
  const promptText = String(req.body?.prompt || "").trim();
  if (!promptText) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  const workflow = {
    prompt: {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: COMFY_CKPT } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "blurry, low quality", clip: ["1", 1] } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 768, batch_size: 1 } },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: 12345,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { filename_prefix: "api_test", images: ["6", 0] } },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const upstream = await fetch(`${COMFY_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
      signal: controller.signal,
    });

    const submitText = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).type(upstream.headers.get("content-type") || "text/plain").send(submitText);
      return;
    }

    let submitJson: any;
    try {
      submitJson = JSON.parse(submitText);
    } catch {
      res.status(502).json({ error: "Invalid ComfyUI response", raw: submitText });
      return;
    }

    const promptId = submitJson.prompt_id as string | undefined;
    if (!promptId) {
      res.status(502).json({ error: "Missing prompt_id from ComfyUI", raw: submitJson });
      return;
    }

    const start = Date.now();
    let imageInfo: { filename: string; subfolder: string; type: string } | null = null;

    while (Date.now() - start < 120_000) {
      const historyResp = await fetch(`${COMFY_URL}/history/${promptId}`, { signal: controller.signal });
      if (historyResp.ok) {
        const history = await historyResp.json();
        const entry = history?.[promptId];
        const outputs = entry?.outputs;
        if (outputs) {
          for (const nodeId of Object.keys(outputs)) {
            const node = outputs[nodeId];
            if (node?.images?.length) {
              const img = node.images[0];
              imageInfo = { filename: img.filename, subfolder: img.subfolder ?? "", type: img.type ?? "output" };
              break;
            }
          }
        }
      }

      if (imageInfo) break;
      await sleep(1000);
    }

    if (!imageInfo) {
      res.status(504).json({ error: "ComfyUI generation timeout" });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imageUrl = `${baseUrl}/api/image/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${encodeURIComponent(imageInfo.type)}`;

    res.json({
      prompt_id: promptId,
      image_url: imageUrl,
      image: imageInfo,
    });
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    res.status(isAbort ? 504 : 502).json({
      error: isAbort ? "ComfyUI timeout" : "ComfyUI error",
      detail: err?.message ?? String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
});

/* Le endpoint qui permet d'afficher l'image IA à partir de son URL créé sur ComfyAI */
app.get("/api/image/view", async (req, res) => {
  const filename = String(req.query.filename || "");
  const subfolder = String(req.query.subfolder || "");
  const type = String(req.query.type || "output");

  if (!filename) {
    res.status(400).json({ error: "Missing filename" });
    return;
  }

  const params = new URLSearchParams({ filename, subfolder, type });

  try {
    const upstream = await fetch(`${COMFY_URL}/view?${params.toString()}`);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-type") res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err: any) {
    res.status(502).json({ error: "ComfyUI view error", detail: err?.message ?? String(err) });
  }
});

/* Endpoint pour afficher toute la liste des images générées par IA sur ComfyAI */
app.get("/api/image/list", async (req, res) => {
  const outputDir = process.env.COMFY_OUTPUT_DIR;
  if (!outputDir) {
    res.status(500).json({ error: "COMFY_OUTPUT_DIR not set" });
    return;
  }

  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const images = await Promise.all(
      entries
        .filter(e => e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name))
        .map(async e => {
          const full = path.join(outputDir, e.name);
          const stat = await fs.stat(full);
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          const url = `${baseUrl}/api/image/view?filename=${encodeURIComponent(e.name)}&subfolder=&type=output`;
          return { filename: e.name, url, mtime: stat.mtimeMs };
        })
    );

    images.sort((a, b) => b.mtime - a.mtime);
    res.json({ images });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to read output dir", detail: err?.message ?? String(err) });
  }
});


/* dev listen endpoint */
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
