type ComfyImageEditRequest = {
	prompt: string;
	entityName?: string;
	baseImageDataUrl: string;
	maskImageDataUrl: string;
	paintedGuideImageDataUrl?: string;
};

function dataUrlToBlob(dataUrl: string): Blob {
	const parts = String(dataUrl || "").split(",");
	if (parts.length < 2) {
		throw new Error("Invalid data URL.");
	}
	const mimeMatch = parts[0].match(/data:(.*?);base64/);
	const mimeType = mimeMatch?.[1] || "image/png";
	const bytes = atob(parts[1]);
	const out = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		out[i] = bytes.charCodeAt(i);
	}
	return new Blob([out], { type: mimeType });
}

export class ComfyImageEditApi {
	static async edit(request: ComfyImageEditRequest): Promise<string> {
		const prompt = String(request.prompt || "").trim();
		if (!prompt) {
			throw new Error("Le texte d'edition est obligatoire.");
		}

		const formData = new FormData();
		formData.append("prompt", prompt);
		if (request.entityName?.trim()) {
			formData.append("entityName", request.entityName.trim());
		}
		formData.append("baseImage", dataUrlToBlob(request.baseImageDataUrl), "base.png");
		formData.append("maskImage", dataUrlToBlob(request.maskImageDataUrl), "mask.png");
		if (request.paintedGuideImageDataUrl?.trim()) {
			formData.append("paintedGuideImage", dataUrlToBlob(request.paintedGuideImageDataUrl), "painted-guide.png");
		}

		const response = await fetch("http://127.0.0.1:3001/api/image/edit", {
			method: "POST",
			body: formData,
		});

		const raw = await response.text();
		if (!response.ok) {
			throw new Error(raw || "ComfyAI image edit request failed.");
		}

		let data: any;
		try {
			data = JSON.parse(raw);
		} catch {
			throw new Error(`Invalid JSON response from /api/image/edit: ${raw}`);
		}

		const imageDataUrl = String(data?.imageDataUrl || "");
		if (!imageDataUrl) {
			throw new Error("Missing imageDataUrl in /api/image/edit response.");
		}

		return imageDataUrl;
	}
}

