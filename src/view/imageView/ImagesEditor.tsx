import { useEffect, useState } from "react";
import { MdBrush } from "react-icons/md";
import { useModelStore } from "../../model/Model";
import { ExtractedImageEntity, ImageEntitiesExtractor } from "../../model/prompts/textExtractors/ImageEntitiesExtractor";
import { ComfyImageEditApi } from "./ComfyImageEditApi";
import ImagePaintEditor, { ImagePaintSavePayload } from "./ImagePaintEditor";

type PendingImageEdit = {
	baseImageDataUrl: string;
	paintedGuideImageDataUrl: string;
	maskImageDataUrl: string;
	drawLayerImageDataUrl: string;
	editPromptText: string;
	updatedAt: number;
};

const normalizeTrait = (value: string): string =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		replace(/^[,;:\-]+|[,;:\-]+$/g, "");

const dedupeTraits = (traits: string[], limit = 6): string[] => {
	const seen = new Set<string>();
	const output: string[] = [];
	for (const raw of traits) {
		const trait = normalizeTrait(raw);
		if (!trait) continue;
		const key = trait.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		output.push(trait);
		if (output.length >= limit) break;
	}
	return output;
};

const extractJsonBlock = (raw: string): string => {
	const text = String(raw || "").trim();
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fenced?.[1]) return fenced[1].trim();
	return text;
};

const fallbackInferTraitsFromEditPrompt = (currentTraits: string[], prompt: string): string[] => {
	const next = [...currentTraits];
	const lower = prompt.toLowerCase();

	const colors = ["red", "blue", "green", "black", "white", "gray", "grey", "brown", "blond", "blonde", "golden", "pink", "purple", "ginger", "auburn"];
	const textures = ["curly", "wavy", "straight", "short", "long", "braided", "messy"];
	const findFirst = (list: string[]) => list.find((item) => lower.includes(item));

	const removeHairTraits = () =>
		next.splice(
			0,
			next.length,
			...next.filter((trait) => !/\bhair\b|\bbald\b/i.test(trait)),
		);

	if (/\bbald\b/.test(lower)) {
		removeHairTraits();
		next.push("bald");
	}

	if (/\bhair\b/.test(lower) || /\bhairstyle\b/.test(lower)) {
		removeHairTraits();
		const color = findFirst(colors);
		const texture = findFirst(textures);
		const chunks = [color, texture, "hair"].filter(Boolean);
		if (chunks.length > 0) {
			next.push(chunks.join(" "));
		}
	}

	const beardMatch = lower.match(/\b(?:add|with|has|have|make)\s+([a-z\s-]{1,30})\s+beard\b/);
	if (beardMatch) {
		const beardColor = findFirst(colors);
		next.push(`${beardColor ? `${beardColor} ` : ""}beard`.trim());
	}

	const eyeColor = findFirst(colors);
	if (/\beyes?\b/.test(lower) && eyeColor) {
		next.push(`${eyeColor} eyes`);
	}

	if (/\b(remove|without)\b/.test(lower)) {
		if (/\bbeard\b/.test(lower)) {
			const kept = next.filter((trait) => !/\bbeard\b/i.test(trait));
			next.splice(0, next.length, ...kept);
		}
		if (/\bhair\b/.test(lower)) {
			const kept = next.filter((trait) => !/\bhair\b/i.test(trait));
			next.splice(0, next.length, ...kept);
		}
	}

	return dedupeTraits(next);
};

export default function ImagesEditor(props: { refreshToken?: number; clearToken?: number; onRefreshDone?: () => void; onEntitiesChange?: (entities: ExtractedImageEntity[]) => void }) {
	const text = useModelStore((state) => state.text);
	const graphEntities = useModelStore((state) => state.entityNodes);
	const [entities, setEntities] = useState<ExtractedImageEntity[]>([]);
	const [imageByEntityKey, setImageByEntityKey] = useState<Record<string, string>>({});
	const [pendingEditByEntityKey, setPendingEditByEntityKey] = useState<Record<string, PendingImageEdit>>({});
	const [loadingByEntityKey, setLoadingByEntityKey] = useState<Record<string, boolean>>({});
	const [errorByEntityKey, setErrorByEntityKey] = useState<Record<string, string>>({});
	const [isExtracting, setIsExtracting] = useState(false);
	const [extractError, setExtractError] = useState("");
	const [isGeneratingAnyImage, setIsGeneratingAnyImage] = useState(false);
	const [editingEntityKey, setEditingEntityKey] = useState<string | null>(null);

	const clearImageSectionState = (clearImages = false) => {
		setEntities([]);
		setLoadingByEntityKey({});
		setErrorByEntityKey({});
		setExtractError("");
		setIsExtracting(false);
		setIsGeneratingAnyImage(false);
		setEditingEntityKey(null);
		if (clearImages) {
			setImageByEntityKey({});
			setPendingEditByEntityKey({});
		}
	};

	const getEntityKey = (entity: ExtractedImageEntity): string => entity.name.trim().toLowerCase().replace(/\s+/g, " ");

	const imageUrlToDataUrl = async (url: string): Promise<string> => {
		try {
			const separator = url.includes("?") ? "&" : "?";
			const cacheBustedUrl = `${url}${separator}_ts=${Date.now()}`;
			const resp = await fetch(cacheBustedUrl, { cache: "no-store" });
			if (!resp.ok) return url;
			const blob = await resp.blob();
			return await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(String(reader.result || url));
				reader.onerror = () => reject(new Error("Failed to convert image blob to base64."));
				reader.readAsDataURL(blob);
			});
		} catch {
			return url;
		}
	};

	const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
		new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error("Failed to load image from data URL."));
			img.src = dataUrl;
		});

	const maskHasEditableArea = async (maskDataUrl: string): Promise<boolean> => {
		const image = await loadImageFromDataUrl(maskDataUrl);
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return false;
		ctx.drawImage(image, 0, 0);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 0; i < imageData.data.length; i += 4) {
			if (imageData.data[i + 3] < 255) {
				return true;
			}
		}
		return false;
	};

	const buildImagePrompt = (entity: ExtractedImageEntity): string => {
		const normalizedTraits = (entity.traits || []).map((trait) => trait.trim()).filter((trait) => trait.length > 0);
		const traitsSuffix = normalizedTraits.length > 0 ? `, ${normalizedTraits.join(", ")}` : "";
		return `${entity.name}${traitsSuffix}, highly detailed cinematic portrait, clean background`;
	};

	const updateTraitAt = (entityId: string, traitIndex: number, value: string) => {
		setEntities((state) =>
			state.map((entity) => {
				if (entity.id !== entityId) return entity;
				const nextTraits = [...entity.traits];
				nextTraits[traitIndex] = value;
				return { ...entity, traits: nextTraits };
			}),
		);
	};

	const removeTraitAt = (entityId: string, traitIndex: number) => {
		setEntities((state) =>
			state.map((entity) => {
				if (entity.id !== entityId) return entity;
				const nextTraits = entity.traits.filter((_, index) => index !== traitIndex);
				return { ...entity, traits: nextTraits };
			}),
		);
	};

	const addTrait = (entityId: string) => {
		setEntities((state) =>
			state.map((entity) => {
				if (entity.id !== entityId) return entity;
				return { ...entity, traits: [...entity.traits, ""] };
			}),
		);
	};

	const inferTraitsWithLocalLlm = async (params: {
		entityName: string;
		currentTraits: string[];
		editPromptText: string;
	}): Promise<string[] | null> => {
		const llmInstruction =
			`Entity: ${params.entityName}\n` +
			`Current visual traits labels: ${params.currentTraits.length > 0 ? params.currentTraits.join(", ") : "(none)"}\n` +
			`User edit intent: ${params.editPromptText}\n\n` +
			`Task: Update only the visual trait labels so they reflect the edit intent.\n` +
			`Rules:\n` +
			`- Keep concise visual labels only.\n` +
			`- Remove labels contradicted by the edit intent.\n` +
			`- Keep unrelated labels when possible.\n` +
			`- Max 6 labels.\n` +
			`- Output STRICT JSON only with shape: {"traits":["trait 1","trait 2"]}`;

		try {
			const response = await fetch("http://127.0.0.1:3001/api/llm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "user", content: llmInstruction }],
					temperature: 0.1,
					timeout_ms: 20000,
				}),
			});

			if (!response.ok) return null;
			const raw = await response.text();
			let json: any;
			try {
				json = JSON.parse(raw);
			} catch {
				return null;
			}

			const content = String(json?.choices?.[0]?.message?.content || "");
			if (!content.trim()) return null;
			const jsonBlock = extractJsonBlock(content);
			const parsed = JSON.parse(jsonBlock);
			const traits = Array.isArray(parsed?.traits)
				? parsed.traits.map((value: unknown) => normalizeTrait(String(value || ""))).filter((value: string) => value.length > 0)
				: [];

			return dedupeTraits(traits);
		} catch {
			return null;
		}
	};

	const syncTraitsFromEditPrompt = async (entity: ExtractedImageEntity, editPromptText: string) => {
		const prompt = String(editPromptText || "").trim();
		if (!prompt) return;

		const fromLlm = await inferTraitsWithLocalLlm({
			entityName: entity.name,
			currentTraits: entity.traits,
			editPromptText: prompt,
		});

		const nextTraits =
			fromLlm && fromLlm.length > 0
				? fromLlm
				: fallbackInferTraitsFromEditPrompt(entity.traits, prompt);

		if (nextTraits.length === 0) return;

		setEntities((state) =>
			state.map((item) => {
				if (item.id !== entity.id) return item;
				return { ...item, traits: nextTraits };
			}),
		);
	};

	const buildPendingEditFromPayload = (payload: ImagePaintSavePayload): PendingImageEdit => ({
		baseImageDataUrl: payload.baseImageDataUrl,
		paintedGuideImageDataUrl: payload.drawLayerImageDataUrl,
		maskImageDataUrl: payload.maskImageDataUrl,
		drawLayerImageDataUrl: payload.drawLayerImageDataUrl,
		editPromptText: payload.editPromptText,
		updatedAt: Date.now(),
	});

	const applyPendingEditWithComfy = async (entity: ExtractedImageEntity, pendingEdit: PendingImageEdit): Promise<string> => {
		if (!pendingEdit.editPromptText.trim()) {
			throw new Error("Le texte d'edition est obligatoire avant la regeneration ComfyAI.");
		}
		const hasMaskArea = await maskHasEditableArea(pendingEdit.maskImageDataUrl);
		if (!hasMaskArea) {
			throw new Error("Dessine d'abord sur l'image avant d'envoyer a ComfyAI.");
		}

		return await ComfyImageEditApi.edit({
			prompt: pendingEdit.editPromptText,
			entityName: entity.name,
			baseImageDataUrl: pendingEdit.baseImageDataUrl,
			maskImageDataUrl: pendingEdit.maskImageDataUrl,
			paintedGuideImageDataUrl: pendingEdit.paintedGuideImageDataUrl,
		});
	};

	const applyPendingEdit = async (entity: ExtractedImageEntity, pendingEditOverride?: PendingImageEdit) => {
		if (isGeneratingAnyImage) return;
		const key = getEntityKey(entity);
		const pendingEdit = pendingEditOverride ?? pendingEditByEntityKey[key];
		if (!pendingEdit) {
			await generateEntityImage(entity);
			return;
		}

		setIsGeneratingAnyImage(true);
		setLoadingByEntityKey((state) => ({ ...state, [key]: true }));
		setErrorByEntityKey((state) => ({ ...state, [key]: "" }));

		try {
			const editedImageDataUrl = await applyPendingEditWithComfy(entity, pendingEdit);
			setImageByEntityKey((state) => ({ ...state, [key]: editedImageDataUrl }));
			setPendingEditByEntityKey((state) => {
				const next = { ...state };
				delete next[key];
				return next;
			});
		} catch (error) {
			setErrorByEntityKey((state) => ({ ...state, [key]: error instanceof Error ? error.message : String(error) }));
		} finally {
			setLoadingByEntityKey((state) => ({ ...state, [key]: false }));
			setIsGeneratingAnyImage(false);
		}
	};

	const generateEntityImage = async (entity: ExtractedImageEntity) => {
		if (isGeneratingAnyImage) return;
		const key = getEntityKey(entity);
		const prompt = buildImagePrompt(entity);
		setIsGeneratingAnyImage(true);
		setLoadingByEntityKey((state) => ({ ...state, [key]: true }));
		setErrorByEntityKey((state) => ({ ...state, [key]: "" }));
		try {
			const resp = await fetch("http://127.0.0.1:3001/api/image", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt, seed: Math.floor(Math.random() * 2_147_483_647) }),
			});

			const raw = await resp.text();
			if (!resp.ok) throw new Error(raw);
			const data = JSON.parse(raw);
			const imageUrl = String(data?.image_url || "");
			if (!imageUrl) throw new Error("Image URL missing from ComfyAI response.");
			const dataUrl = await imageUrlToDataUrl(imageUrl);

			// Card image source of truth is only ComfyAI output.
			setImageByEntityKey((state) => ({ ...state, [key]: dataUrl }));
			setPendingEditByEntityKey((state) => {
				const next = { ...state };
				delete next[key];
				return next;
			});
		} catch (error) {
			setErrorByEntityKey((state) => ({ ...state, [key]: error instanceof Error ? error.message : String(error) }));
		} finally {
			setLoadingByEntityKey((state) => ({ ...state, [key]: false }));
			setIsGeneratingAnyImage(false);
		}
	};

	const refreshFromText = async () => {
		if (!text.trim()) {
			clearImageSectionState(false);
			return;
		}

		setIsExtracting(true);
		setExtractError("");
		try {
			const seededFromGraph = ImageEntitiesExtractor.fromModelEntities(graphEntities);
			if (seededFromGraph.length > 0) {
				setEntities(seededFromGraph);
				return;
			}
			const extracted = await ImageEntitiesExtractor.extract(text, seededFromGraph);
			setEntities(extracted);
		} catch (error) {
			setEntities([]);
			setExtractError(error instanceof Error ? error.message : String(error));
		} finally {
			setIsExtracting(false);
			props.onRefreshDone?.();
		}
	};

	useEffect(() => {
		if (!props.refreshToken) return;
		refreshFromText();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.refreshToken]);

	useEffect(() => {
		if (!text.trim()) clearImageSectionState(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [text]);

	useEffect(() => {
		if (!props.clearToken) return;
		clearImageSectionState(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.clearToken]);

	useEffect(() => {
		if (!editingEntityKey) return;
		if (!imageByEntityKey[editingEntityKey]) setEditingEntityKey(null);
	}, [editingEntityKey, imageByEntityKey]);

	useEffect(() => {
		props.onEntitiesChange?.(
			entities.map((entity) => ({
				...entity,
				traits: entity.traits.map((trait) => trait.trim()).filter((trait) => trait.length > 0),
			})),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entities]);

	if (editingEntityKey) {
		const editingEntity = entities.find((entity) => getEntityKey(entity) === editingEntityKey);
		const imageSrc = imageByEntityKey[editingEntityKey];
		if (editingEntity && imageSrc) {
			const currentPendingEdit = pendingEditByEntityKey[editingEntityKey];
			return (
				<div style={{ padding: 24, height: "100%" }}>
					<ImagePaintEditor
						entityName={editingEntity.name}
						imageSrc={imageSrc}
						initialEditPrompt={currentPendingEdit?.editPromptText || ""}
						initialDrawLayerDataUrl={currentPendingEdit?.drawLayerImageDataUrl || ""}
						onCancel={() => setEditingEntityKey(null)}
						onSave={(payload: ImagePaintSavePayload) => {
							const pendingEdit = buildPendingEditFromPayload(payload);
							setPendingEditByEntityKey((state) => ({
								...state,
								[editingEntityKey]: pendingEdit,
							}));
							void syncTraitsFromEditPrompt(editingEntity, pendingEdit.editPromptText);
							setEditingEntityKey(null);
						}}
						onSaveAndApply={(payload: ImagePaintSavePayload) => {
							const pendingEdit = buildPendingEditFromPayload(payload);
							setPendingEditByEntityKey((state) => ({
								...state,
								[editingEntityKey]: pendingEdit,
							}));
							void syncTraitsFromEditPrompt(editingEntity, pendingEdit.editPromptText);
							setEditingEntityKey(null);
							void applyPendingEdit(editingEntity, pendingEdit);
						}}
					/>
				</div>
			);
		}
	}

	return (
		<div style={{ padding: 24, height: "100%", overflow: "auto" }}>
			{isExtracting && <div style={{ color: "#6b7280", marginBottom: 12 }}>Extracting entities...</div>}

			{!isExtracting && entities.length === 0 && !extractError && (
				<div style={{ color: "#6b7280" }}>
					{text.trim().length === 0 ? "No entities: the story text is empty." : (
						<>
							Click <strong>Refresh from text</strong> to extract entities for image generation.
						</>
					)}
				</div>
			)}

			{extractError && (
				<div style={{ color: "#dc2626", whiteSpace: "pre-wrap", marginBottom: 12 }}>
					Failed to extract entities: {extractError}
				</div>
			)}

			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
				{entities.map((entity) => {
					const entityKey = getEntityKey(entity);
					const hasPendingEdit = !!pendingEditByEntityKey[entityKey];
					return (
						<div
							key={entity.id}
							style={{
								background: "white",
								border: "1px solid #e5e7eb",
								borderRadius: 10,
								padding: 14,
								boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
								display: "flex",
								flexDirection: "column",
								gap: 10,
							}}
						>
							<div style={{ fontWeight: 700, fontSize: 16 }}>
								{entity.emoji} {entity.name}
							</div>

							<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
								{entity.traits.map((trait, traitIndex) => (
									<div
										key={`${entity.id}-${traitIndex}`}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											background: "#eef2ff",
											color: "#3730a3",
											border: "1px solid #c7d2fe",
											borderRadius: 999,
											padding: "2px 6px",
											fontSize: 12,
											fontWeight: 600,
										}}
									>
										<input
											value={trait}
											onChange={(e) => updateTraitAt(entity.id, traitIndex, e.target.value)}
											style={{
												background: "transparent",
												border: "none",
												outline: "none",
												minWidth: 40,
												color: "inherit",
												fontSize: 12,
												fontWeight: 600,
											}}
										/>
										<button
											type="button"
											onClick={() => removeTraitAt(entity.id, traitIndex)}
											style={{
												border: "none",
												background: "transparent",
												color: "#4338ca",
												fontWeight: 700,
												cursor: "pointer",
												lineHeight: 1,
											}}
											aria-label="Remove trait"
										>
											x
										</button>
									</div>
								))}
								<button
									type="button"
									onClick={() => addTrait(entity.id)}
									style={{
										border: "1px dashed #a5b4fc",
										borderRadius: 999,
										padding: "2px 8px",
										fontSize: 12,
										color: "#4338ca",
										background: "white",
										cursor: "pointer",
									}}
								>
									+ trait
								</button>
							</div>

							<div>
								<button
									type="button"
									onClick={() => {
										if (hasPendingEdit) {
											void applyPendingEdit(entity);
											return;
										}
										void generateEntityImage(entity);
									}}
									disabled={isGeneratingAnyImage}
									style={{
										border: "1px solid #9ca3af",
										borderRadius: 8,
										padding: "6px 10px",
										fontWeight: 600,
										background: isGeneratingAnyImage ? "#e5e7eb" : "white",
										cursor: isGeneratingAnyImage ? "wait" : "pointer",
									}}
								>
								{loadingByEntityKey[entityKey]
									? "Generating..."
									: hasPendingEdit
										? "Redraw from Drawing (ComfyAI)"
										: imageByEntityKey[entityKey]
											? "Regenerate with ComfyAI"
											: "Generate with ComfyAI"}
								</button>
								{imageByEntityKey[entityKey] && (
									<button
										type="button"
										onClick={() => setEditingEntityKey(entityKey)}
										style={{
											border: "1px solid #9ca3af",
											borderRadius: 8,
											padding: "6px 10px",
											fontWeight: 600,
											background: "white",
											cursor: "pointer",
											marginLeft: 8,
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
										}}
										aria-label={`Edit ${entity.name} image`}
									>
										<MdBrush />
										Edit
									</button>
								)}
							</div>

							{errorByEntityKey[entityKey] && (
								<div style={{ color: "#dc2626", whiteSpace: "pre-wrap", fontSize: 12 }}>
									{errorByEntityKey[entityKey]}
								</div>
							)}

							{hasPendingEdit && (
								<div style={{ color: "#7c3aed", fontSize: 12 }}>
									Drawing saved. Next regenerate will run a full-image faithful redraw with your requested trait changes.
								</div>
							)}

							{imageByEntityKey[entityKey] && (
								<img
									src={imageByEntityKey[entityKey]}
									alt={`${entity.name} generated`}
									style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
