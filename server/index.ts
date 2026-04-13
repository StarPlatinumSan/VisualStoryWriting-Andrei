import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import sharp from "sharp";

const dotenvPath = path.resolve(__dirname, ".env");
const dotenvResult = dotenv.config({ path: dotenvPath, override: true });

const app = express();
const port = Number(process.env.PORT ?? 3001);

const LLM_URL = process.env.LLM_URL || "http://127.0.0.1:1234/v1/chat/completions";
const LOCAL_LLM_MODEL = process.env.LLM_MODEL || "mistral-7b-instruct-v0.2";
const DEFAULT_LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 900_000);
const MAX_LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MAX_MS ?? 86_400_000);
const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";
const COMFY_CKPT = process.env.COMFY_CKPT || "sd_xl_base_0.9.safetensors";
const COMFY_INPAINT_CKPT = process.env.COMFY_INPAINT_CKPT || COMFY_CKPT;
const COMFY_TIMEOUT_MS = Number(process.env.COMFY_TIMEOUT_MS ?? 900_000);
const COMFY_HISTORY_POLL_MS = Number(process.env.COMFY_HISTORY_POLL_MS ?? 450);
const COMFY_EDIT_MAIN_STEPS = Number(process.env.COMFY_EDIT_MAIN_STEPS ?? 22);
const COMFY_EDIT_STRONG_STEPS = Number(process.env.COMFY_EDIT_STRONG_STEPS ?? 30);
const COMFY_EDIT_CLEANUP_STEPS = Number(process.env.COMFY_EDIT_CLEANUP_STEPS ?? 12);
const COMFY_EDIT_MAIN_CFG = Number(process.env.COMFY_EDIT_MAIN_CFG ?? 8.6);
const COMFY_EDIT_STRONG_CFG = Number(process.env.COMFY_EDIT_STRONG_CFG ?? 9.5);
const COMFY_EDIT_CLEANUP_CFG = Number(process.env.COMFY_EDIT_CLEANUP_CFG ?? 7.4);
const COMFY_EDIT_MAIN_DENOISE_DEFAULT = Number(process.env.COMFY_EDIT_MAIN_DENOISE_DEFAULT ?? 0.55);
const COMFY_EDIT_CHANGE_THRESHOLD = Number(process.env.COMFY_EDIT_CHANGE_THRESHOLD ?? 0.03);
const COMFY_EDIT_AUTO_CLEANUP = String(process.env.COMFY_EDIT_AUTO_CLEANUP ?? "1").trim() !== "0";

console.log(
	`[env] dotenvLoaded=${!dotenvResult.error} path=${dotenvPath}`,
);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 12 * 1024 * 1024 },
});

app.get("/", (_req, res) => {
	res.send("Local AI proxy running");
});

app.get("/api/health", (_req, res) => {
	res.json({ status: "ok" });
});

type UploadedFile = {
	buffer: Buffer;
	mimetype: string;
	originalname: string;
};

type ComfyUploadedImage = {
	name: string;
	subfolder: string;
	type: string;
};

type GuideHints = {
	coverageRatio: number;
	dominantHex: string | null;
	paletteHex: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getFirstUploadFile = (files: unknown, key: string): UploadedFile | null => {
	if (!files || typeof files !== "object") return null;
	const bag = files as Record<string, unknown>;
	const maybeList = bag[key];
	if (!Array.isArray(maybeList) || maybeList.length === 0) return null;
	const file = maybeList[0] as Record<string, unknown>;
	if (!file || typeof file !== "object") return null;
	if (!Buffer.isBuffer(file.buffer)) return null;
	return {
		buffer: file.buffer,
		mimetype: String(file.mimetype || "image/png"),
		originalname: String(file.originalname || `${key}.png`),
	};
};

const ensurePngFilename = (name: string, fallback: string): string => {
	const candidate = String(name || "").trim();
	if (!candidate) return fallback;
	return /\.png$/i.test(candidate) ? candidate : `${candidate}.png`;
};

const uploadImageToComfy = async (file: UploadedFile): Promise<ComfyUploadedImage> => {
	const form = new FormData();
	const filename = ensurePngFilename(file.originalname, "upload.png");
	const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "image/png" });
	form.append("image", blob, filename);
	form.append("overwrite", "true");
	form.append("type", "input");

	const response = await fetch(`${COMFY_URL}/upload/image`, {
		method: "POST",
		body: form,
	});

	const raw = await response.text();
	if (!response.ok) {
		throw new Error(`ComfyUI upload failed: ${raw}`);
	}

	let data: any;
	try {
		data = JSON.parse(raw);
	} catch {
		throw new Error(`Invalid ComfyUI upload response: ${raw}`);
	}

	return {
		name: String(data?.name || filename),
		subfolder: String(data?.subfolder || ""),
		type: String(data?.type || "input"),
	};
};

const submitComfyWorkflow = async (workflow: any, signal: AbortSignal): Promise<string> => {
	const response = await fetch(`${COMFY_URL}/prompt`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt: workflow }),
		signal,
	});

	const raw = await response.text();
	if (!response.ok) {
		throw new Error(`ComfyUI prompt submission failed: ${raw}`);
	}

	let data: any;
	try {
		data = JSON.parse(raw);
	} catch {
		throw new Error(`Invalid ComfyUI /prompt response: ${raw}`);
	}

	const promptId = String(data?.prompt_id || "").trim();
	if (!promptId) {
		throw new Error(`Missing prompt_id from ComfyUI response: ${raw}`);
	}

	return promptId;
};

const waitForComfyImage = async (promptId: string, timeoutMs: number, signal: AbortSignal): Promise<{ filename: string; subfolder: string; type: string }> => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const historyResponse = await fetch(`${COMFY_URL}/history/${promptId}`, { signal });
		if (historyResponse.ok) {
			const history = await historyResponse.json();
			const entry = history?.[promptId];
			const outputs = entry?.outputs;
			if (outputs) {
				for (const nodeId of Object.keys(outputs)) {
					const node = outputs[nodeId];
					if (node?.images?.length) {
						const img = node.images[0];
						return {
							filename: String(img.filename || ""),
							subfolder: String(img.subfolder || ""),
							type: String(img.type || "output"),
						};
					}
				}
			}
		}
		await sleep(Math.max(150, COMFY_HISTORY_POLL_MS));
	}
	throw new Error("ComfyUI generation timeout");
};

const downloadComfyImageBuffer = async (image: { filename: string; subfolder: string; type: string }): Promise<Buffer> => {
	const params = new URLSearchParams({
		filename: image.filename,
		subfolder: image.subfolder,
		type: image.type,
	});
	const response = await fetch(`${COMFY_URL}/view?${params.toString()}`);
	if (!response.ok) {
		throw new Error(`ComfyUI image fetch failed with status ${response.status}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
};

const bufferToPngDataUrl = (buffer: Buffer): string => {
	const base64 = buffer.toString("base64");
	return `data:image/png;base64,${base64}`;
};

const rgbToHex = (r: number, g: number, b: number): string => {
	const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const analyzeGuideLayer = async (guideLayerFile: UploadedFile | null): Promise<GuideHints> => {
	if (!guideLayerFile) {
		return { coverageRatio: 0, dominantHex: null, paletteHex: [] };
	}

	const { data, info } = await sharp(guideLayerFile.buffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const totalPixels = Math.max(1, info.width * info.height);
	let paintedPixels = 0;
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	const buckets = new Map<string, number>();

	for (let i = 0; i < data.length; i += 4) {
		const alpha = data[i + 3];
		if (alpha < 32) continue;
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];

		paintedPixels += 1;
		sumR += r;
		sumG += g;
		sumB += b;

		const qr = Math.round(r / 32) * 32;
		const qg = Math.round(g / 32) * 32;
		const qb = Math.round(b / 32) * 32;
		const key = `${qr},${qg},${qb}`;
		buckets.set(key, (buckets.get(key) || 0) + 1);
	}

	if (paintedPixels === 0) {
		return { coverageRatio: 0, dominantHex: null, paletteHex: [] };
	}

	const dominantHex = rgbToHex(sumR / paintedPixels, sumG / paintedPixels, sumB / paintedPixels);
	const paletteHex = Array.from(buckets.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([key]) => {
			const [r, g, b] = key.split(",").map((v) => Number(v));
			return rgbToHex(r, g, b);
		});

	return {
		coverageRatio: paintedPixels / totalPixels,
		dominantHex,
		paletteHex,
	};
};

const buildComfyInpaintMaskFromEditorMask = async (editorMaskFile: UploadedFile): Promise<UploadedFile> => {
	// Editor mask convention (from frontend):
	// - alpha 0 => editable
	// - alpha 255 => locked
	// Comfy inpaint mask expects the inverse semantics on the loaded mask channel.
	const { data, info } = await sharp(editorMaskFile.buffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const out = Buffer.alloc(data.length);
	for (let i = 0; i < data.length; i += 4) {
		const originalAlpha = data[i + 3];
		const invertedAlpha = 255 - originalAlpha;
		out[i] = 255;
		out[i + 1] = 255;
		out[i + 2] = 255;
		out[i + 3] = invertedAlpha;
	}

	const pngBuffer = await sharp(out, {
		raw: {
			width: info.width,
			height: info.height,
			channels: 4,
		},
	})
		.png()
		.toBuffer();

	return {
		buffer: pngBuffer,
		mimetype: "image/png",
		originalname: "comfy-inpaint-mask.png",
	};
};

const buildStyleLockedPrompt = (params: {
	userPrompt: string;
	entityName?: string;
	guideHints: GuideHints;
}): string => {
	const lines = [
		`PRIMARY OBJECTIVE (MUST APPLY): ${params.userPrompt}`,
		params.entityName ? `Subject: ${params.entityName}` : "",
		"STYLE LOCK: keep the exact same image style, rendering method, lens, lighting, color grading, and texture fidelity as the original image.",
		"GLOBAL REDRAW MODE: regenerate the full image from the reference while preserving the same identity, pose, framing, camera angle, background, and materials.",
		"DELTA LOCK: only apply the explicitly requested trait changes; everything else must stay equivalent to the original.",
		"GUIDE INTERPRETATION: treat rough strokes as semantic guidance only, never as final painted texture.",
		"TRANSFORMATION RULE: convert rough marks into realistic integrated details matching surrounding style and material realism.",
		"QUALITY RULE: preserve identity, anatomy, materials, and scene coherence.",
		"DO NOT leave paint, marker, doodle, flat fill, or sketch traces.",
		params.guideHints.dominantHex ? `When applicable, honor the guide color intent around ${params.guideHints.dominantHex}.` : "",
		params.guideHints.paletteHex.length > 0 ? `Guide palette hints: ${params.guideHints.paletteHex.join(", ")}.` : "",
	];
	return lines.filter((line) => line.length > 0).join(" ");
};

const buildStyleLockedNegativePrompt = (): string =>
	[
		"paint patch",
		"flat color block",
		"doodle",
		"marker trace",
		"brush stroke",
		"cartoon scribble",
		"wrong hair texture",
		"wrong hairstyle geometry",
		"identity drift",
		"ignored edit request",
		"face distortion",
		"composition drift",
		"background drift",
		"pose drift",
		"watermark",
		"text artifact",
		"low quality",
		"blurry",
	]
		.join(", ");

const composeEditedRegionOverBase = async (params: {
	baseImageBuffer: Buffer;
	editedImageBuffer: Buffer;
	maskImageBuffer: Buffer;
}): Promise<Buffer> => {
	const baseMeta = await sharp(params.baseImageBuffer).metadata();
	const width = baseMeta.width;
	const height = baseMeta.height;
	if (!width || !height) {
		throw new Error("Could not read base image dimensions.");
	}

	const [baseRgba, editedRgba, maskRgba] = await Promise.all([
		sharp(params.baseImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
		sharp(params.editedImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
		sharp(params.maskImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.blur(1.2)
			.raw()
			.toBuffer(),
	]);

	const out = Buffer.alloc(baseRgba.length);
	for (let i = 0; i < out.length; i += 4) {
		// In our mask, alpha=0 means editable area, alpha=255 means locked area.
		const locked = maskRgba[i + 3] / 255;
		const editable = 1 - locked;

		out[i] = Math.round(baseRgba[i] * (1 - editable) + editedRgba[i] * editable);
		out[i + 1] = Math.round(baseRgba[i + 1] * (1 - editable) + editedRgba[i + 1] * editable);
		out[i + 2] = Math.round(baseRgba[i + 2] * (1 - editable) + editedRgba[i + 2] * editable);
		out[i + 3] = baseRgba[i + 3];
	}

	return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

const buildGuidedImg2ImgInput = async (baseImageFile: UploadedFile, paintedGuideFile: UploadedFile | null): Promise<UploadedFile> => {
	if (!paintedGuideFile) {
		return baseImageFile;
	}

	const baseMeta = await sharp(baseImageFile.buffer).metadata();
	const width = baseMeta.width;
	const height = baseMeta.height;
	if (!width || !height) {
		throw new Error("Could not read base image dimensions.");
	}

	const resizedGuidePng = await sharp(paintedGuideFile.buffer)
		.ensureAlpha()
		.resize(width, height, { fit: "fill" })
		.png()
		.toBuffer();

	const guidedPng = await sharp(baseImageFile.buffer)
		.ensureAlpha()
		.resize(width, height, { fit: "fill" })
		.composite([{ input: resizedGuidePng, blend: "over" }])
		.png()
		.toBuffer();

	return {
		buffer: guidedPng,
		mimetype: "image/png",
		originalname: "guided-base-for-global-redraw.png",
	};
};

const computeMaskedChangeScore = async (params: {
	baseImageBuffer: Buffer;
	editedImageBuffer: Buffer;
	maskImageBuffer: Buffer;
}): Promise<number> => {
	const baseMeta = await sharp(params.baseImageBuffer).metadata();
	const width = baseMeta.width;
	const height = baseMeta.height;
	if (!width || !height) return 0;

	const [baseRgba, editedRgba, maskRgba] = await Promise.all([
		sharp(params.baseImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
		sharp(params.editedImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
		sharp(params.maskImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
	]);

	let weightedDiff = 0;
	let weightSum = 0;
	for (let i = 0; i < baseRgba.length; i += 4) {
		// editor mask semantics: alpha 0 = editable, 255 = locked
		const editableWeight = 1 - maskRgba[i + 3] / 255;
		if (editableWeight <= 0.02) continue;
		const dr = Math.abs(baseRgba[i] - editedRgba[i]);
		const dg = Math.abs(baseRgba[i + 1] - editedRgba[i + 1]);
		const db = Math.abs(baseRgba[i + 2] - editedRgba[i + 2]);
		const pixelDiff = (dr + dg + db) / (255 * 3);
		weightedDiff += pixelDiff * editableWeight;
		weightSum += editableWeight;
	}

	if (weightSum <= 0) return 0;
	return weightedDiff / weightSum;
};

const computeGlobalChangeScore = async (params: {
	baseImageBuffer: Buffer;
	editedImageBuffer: Buffer;
}): Promise<number> => {
	const baseMeta = await sharp(params.baseImageBuffer).metadata();
	const width = baseMeta.width;
	const height = baseMeta.height;
	if (!width || !height) return 0;

	const [baseRgba, editedRgba] = await Promise.all([
		sharp(params.baseImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
		sharp(params.editedImageBuffer)
			.ensureAlpha()
			.resize(width, height, { fit: "fill" })
			.raw()
			.toBuffer(),
	]);

	let diff = 0;
	const pixelCount = Math.max(1, baseRgba.length / 4);
	for (let i = 0; i < baseRgba.length; i += 4) {
		const dr = Math.abs(baseRgba[i] - editedRgba[i]);
		const dg = Math.abs(baseRgba[i + 1] - editedRgba[i + 1]);
		const db = Math.abs(baseRgba[i + 2] - editedRgba[i + 2]);
		diff += (dr + dg + db) / (255 * 3);
	}
	return diff / pixelCount;
};

const parseDenoiseValue = (value: unknown, fallback: number): number => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0.05, Math.min(1, parsed));
};

const buildComfyInpaintWorkflow = (params: {
	positivePrompt: string;
	negativePrompt: string;
	seed: number;
	baseImage: ComfyUploadedImage;
	maskImage: ComfyUploadedImage;
	denoise: number;
	cfg: number;
	steps: number;
}): Record<string, any> => {
	return {
		"1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: COMFY_INPAINT_CKPT } },
		"2": { class_type: "CLIPTextEncode", inputs: { text: params.positivePrompt, clip: ["1", 1] } },
		"3": { class_type: "CLIPTextEncode", inputs: { text: params.negativePrompt, clip: ["1", 1] } },
		"4": { class_type: "LoadImage", inputs: { image: params.baseImage.name, upload: "image" } },
		"5": { class_type: "LoadImageMask", inputs: { image: params.maskImage.name, channel: "alpha", upload: "image" } },
		"6": { class_type: "VAEEncodeForInpaint", inputs: { pixels: ["4", 0], mask: ["5", 0], vae: ["1", 2] } },
		"7": {
			class_type: "KSampler",
			inputs: {
				seed: params.seed,
				steps: params.steps,
				cfg: params.cfg,
				sampler_name: "euler",
				scheduler: "normal",
				denoise: params.denoise,
				model: ["1", 0],
				positive: ["2", 0],
				negative: ["3", 0],
				latent_image: ["6", 0],
			},
		},
		"8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["1", 2] } },
		"9": { class_type: "SaveImage", inputs: { filename_prefix: "api_edit", images: ["8", 0] } },
	};
};

const buildComfyImg2ImgWorkflow = (params: {
	positivePrompt: string;
	negativePrompt: string;
	seed: number;
	baseImage: ComfyUploadedImage;
	denoise: number;
	cfg: number;
	steps: number;
}): Record<string, any> => {
	return {
		"1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: COMFY_CKPT } },
		"2": { class_type: "CLIPTextEncode", inputs: { text: params.positivePrompt, clip: ["1", 1] } },
		"3": { class_type: "CLIPTextEncode", inputs: { text: params.negativePrompt, clip: ["1", 1] } },
		"4": { class_type: "LoadImage", inputs: { image: params.baseImage.name, upload: "image" } },
		"5": { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } },
		"6": {
			class_type: "KSampler",
			inputs: {
				seed: params.seed,
				steps: params.steps,
				cfg: params.cfg,
				sampler_name: "euler",
				scheduler: "normal",
				denoise: params.denoise,
				model: ["1", 0],
				positive: ["2", 0],
				negative: ["3", 0],
				latent_image: ["5", 0],
			},
		},
		"7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
		"8": { class_type: "SaveImage", inputs: { filename_prefix: "api_edit_fallback", images: ["7", 0] } },
	};
};

app.post("/api/llm", async (req, res) => {
	const body = req.body;
	if (!body || typeof body !== "object") {
		res.status(400).json({ error: "Invalid request body" });
		return;
	}

	const requestedTimeout =
		typeof body.timeout_ms === "number" && Number.isFinite(body.timeout_ms)
			? Math.max(5_000, Math.min(body.timeout_ms, MAX_LLM_TIMEOUT_MS))
			: DEFAULT_LLM_TIMEOUT_MS;

	const { timeout_ms, ...upstreamBody } = body;
	if (!upstreamBody.model || typeof upstreamBody.model !== "string") {
		upstreamBody.model = LOCAL_LLM_MODEL;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestedTimeout);

	try {
		const upstream = await fetch(LLM_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(upstreamBody),
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

app.post("/api/image", async (req, res) => {
	const promptText = String(req.body?.prompt || "").trim();
	if (!promptText) {
		res.status(400).json({ error: "Prompt is required" });
		return;
	}

	const requestedSeed = Number(req.body?.seed);
	const seed = Number.isFinite(requestedSeed) && requestedSeed >= 0 ? Math.floor(requestedSeed) : Math.floor(Math.random() * 2_147_483_647);

	const workflow = {
		prompt: {
			"1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: COMFY_CKPT } },
			"2": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["1", 1] } },
			"3": { class_type: "CLIPTextEncode", inputs: { text: "blurry, low quality", clip: ["1", 1] } },
			"4": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 768, batch_size: 1 } },
			"5": {
				class_type: "KSampler",
				inputs: {
					seed: seed,
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
	const timeout = setTimeout(() => controller.abort(), COMFY_TIMEOUT_MS);

	try {
		const upstream = await fetch(`${COMFY_URL}/prompt`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(workflow),
			signal: controller.signal,
		});

		const submitText = await upstream.text();
		if (!upstream.ok) {
			res
				.status(upstream.status)
				.type(upstream.headers.get("content-type") || "text/plain")
				.send(submitText);
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

		while (Date.now() - start < COMFY_TIMEOUT_MS) {
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
							imageInfo = {
								filename: img.filename,
								subfolder: img.subfolder ?? "",
								type: img.type ?? "output",
							};
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
			seed,
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
		res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
		res.setHeader("Pragma", "no-cache");
		res.setHeader("Expires", "0");
		res.setHeader("Surrogate-Control", "no-store");
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

app.post(
	"/api/image/edit",
	upload.fields([
		{ name: "baseImage", maxCount: 1 },
		{ name: "maskImage", maxCount: 1 },
		{ name: "paintedGuideImage", maxCount: 1 },
	]),
	async (req, res) => {
		const reqAny = req as any;
		const userPrompt = String(req.body?.prompt || "").trim();
		const entityName = String(req.body?.entityName || "").trim();
		const baseImageFile = getFirstUploadFile(reqAny.files, "baseImage");
		const maskImageFile = getFirstUploadFile(reqAny.files, "maskImage");
		const paintedGuideFile = getFirstUploadFile(reqAny.files, "paintedGuideImage");

		if (!userPrompt) {
			res.status(400).json({ error: "prompt is required" });
			return;
		}
		if (!baseImageFile) {
			res.status(400).json({ error: "baseImage is required" });
			return;
		}
		if (!maskImageFile) {
			res.status(400).json({ error: "maskImage is required" });
			return;
		}

		const requestedSeed = Number(req.body?.seed);
		const seed = Number.isFinite(requestedSeed) && requestedSeed >= 0 ? Math.floor(requestedSeed) : Math.floor(Math.random() * 2_147_483_647);
		const redrawDenoise = parseDenoiseValue(req.body?.denoise, COMFY_EDIT_MAIN_DENOISE_DEFAULT);
		const strongerDenoise = parseDenoiseValue(req.body?.strong_denoise, Math.min(0.82, redrawDenoise + 0.1));
		const cleanupDenoise = parseDenoiseValue(req.body?.cleanup_denoise, 0.22);
		const guideHints = await analyzeGuideLayer(paintedGuideFile);
		const positivePrompt = buildStyleLockedPrompt({
			userPrompt,
			entityName,
			guideHints,
		});
		const negativePrompt = buildStyleLockedNegativePrompt();

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), COMFY_TIMEOUT_MS);

		try {
			// Global redraw mode:
			// Use base + optional painted guide as img2img input, then regenerate the full frame
			// while preserving identity/composition and applying only requested trait deltas.
			const guidedInputFile = await buildGuidedImg2ImgInput(baseImageFile, paintedGuideFile);
			const uploadedGuidedInput = await uploadImageToComfy(guidedInputFile);

			const firstPassWorkflow = buildComfyImg2ImgWorkflow({
				positivePrompt,
				negativePrompt,
				seed,
				baseImage: uploadedGuidedInput,
				denoise: redrawDenoise,
				cfg: COMFY_EDIT_MAIN_CFG,
				steps: COMFY_EDIT_MAIN_STEPS,
			});

			const startedAt = Date.now();
			let usedWorkflow: "global-img2img" | "global-img2img-strong" = "global-img2img";
			const debugErrors: string[] = [];

			const firstPassPromptId = await submitComfyWorkflow(firstPassWorkflow, controller.signal);
			const firstPassImageInfo = await waitForComfyImage(firstPassPromptId, COMFY_TIMEOUT_MS, controller.signal);
			let generatedBuffer = await downloadComfyImageBuffer(firstPassImageInfo);
			let changeScore = await computeGlobalChangeScore({
				baseImageBuffer: baseImageFile.buffer,
				editedImageBuffer: generatedBuffer,
			});

			// If the first pass is too conservative, force a stronger redraw pass.
			if (changeScore < COMFY_EDIT_CHANGE_THRESHOLD) {
				debugErrors.push(`first-pass-too-weak:${changeScore.toFixed(4)}`);
				const strongWorkflow = buildComfyImg2ImgWorkflow({
					positivePrompt: `${positivePrompt} MUST visibly apply the requested trait changes while preserving identity and overall scene authenticity.`,
					negativePrompt,
					seed: seed + 19,
					baseImage: uploadedGuidedInput,
					denoise: strongerDenoise,
					cfg: COMFY_EDIT_STRONG_CFG,
					steps: COMFY_EDIT_STRONG_STEPS,
				});
				const strongPromptId = await submitComfyWorkflow(strongWorkflow, controller.signal);
				const strongImageInfo = await waitForComfyImage(strongPromptId, COMFY_TIMEOUT_MS, controller.signal);
				generatedBuffer = await downloadComfyImageBuffer(strongImageInfo);
				changeScore = await computeGlobalChangeScore({
					baseImageBuffer: baseImageFile.buffer,
					editedImageBuffer: generatedBuffer,
				});
				usedWorkflow = "global-img2img-strong";
			}

			// Performance optimization:
			// run cleanup only when strong pass was needed (higher artifact risk),
			// or when explicitly forced from request.
			const forceCleanup = String(req.body?.force_cleanup ?? "").trim() === "1";
			const shouldRunCleanup = forceCleanup || (COMFY_EDIT_AUTO_CLEANUP && usedWorkflow === "global-img2img-strong");
			if (shouldRunCleanup) {
				const cleanupInputFile: UploadedFile = {
					buffer: generatedBuffer,
					mimetype: "image/png",
					originalname: "global-redraw-cleanup-input.png",
				};
				const uploadedCleanupInput = await uploadImageToComfy(cleanupInputFile);
				const cleanupWorkflow = buildComfyImg2ImgWorkflow({
					positivePrompt: `${positivePrompt} FINAL CLEANUP: no painted traces, no sketch traces, natural integrated details only.`,
					negativePrompt,
					seed: seed + 101,
					baseImage: uploadedCleanupInput,
					denoise: cleanupDenoise,
					cfg: COMFY_EDIT_CLEANUP_CFG,
					steps: COMFY_EDIT_CLEANUP_STEPS,
				});
				const cleanupPromptId = await submitComfyWorkflow(cleanupWorkflow, controller.signal);
				const cleanupImageInfo = await waitForComfyImage(cleanupPromptId, COMFY_TIMEOUT_MS, controller.signal);
				generatedBuffer = await downloadComfyImageBuffer(cleanupImageInfo);
			}

			const finalChangeScore = await computeGlobalChangeScore({
				baseImageBuffer: baseImageFile.buffer,
				editedImageBuffer: generatedBuffer,
			});
			const imageDataUrl = bufferToPngDataUrl(generatedBuffer);
			res.json({
				imageDataUrl,
				seed,
				workflow: usedWorkflow,
				debugErrors,
				guide: {
					coverageRatio: guideHints.coverageRatio,
					dominantHex: guideHints.dominantHex,
					paletteHex: guideHints.paletteHex,
				},
				changeScore: finalChangeScore,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			const isAbort = (error as any)?.name === "AbortError";
			res.status(isAbort ? 504 : 502).json({
				error: isAbort ? "ComfyUI edit timeout" : "ComfyUI edit failed",
				detail: error instanceof Error ? error.message : String(error),
			});
		} finally {
			clearTimeout(timeout);
		}
	},
);

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
				.filter((e) => e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name))
				.map(async (e) => {
					const full = path.join(outputDir, e.name);
					const stat = await fs.stat(full);
					const baseUrl = `${req.protocol}://${req.get("host")}`;
					const url = `${baseUrl}/api/image/view?filename=${encodeURIComponent(e.name)}&subfolder=&type=output`;
					return { filename: e.name, url, mtime: stat.mtimeMs };
				}),
		);

		images.sort((a, b) => b.mtime - a.mtime);
		res.json({ images });
	} catch (err: any) {
		res.status(500).json({ error: "Failed to read output dir", detail: err?.message ?? String(err) });
	}
});

app.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
