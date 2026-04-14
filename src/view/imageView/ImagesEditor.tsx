import { useEffect, useState } from "react";
import { MdBrush } from "react-icons/md";
import { openai, useModelStore } from "../../model/Model";
import { ExtractedImageEntity, ImageEntitiesExtractor } from "../../model/prompts/textExtractors/ImageEntitiesExtractor";
import { z } from "zod";
import ImagePaintEditor, { ImagePaintSavePayload } from "./ImagePaintEditor";

type PendingImageEdit = {
  baseImageDataUrl: string;
  paintedGuideImageDataUrl: string;
  maskImageDataUrl: string;
  drawLayerImageDataUrl: string;
  mergedImageDataUrl?: string;
  inferredTraits?: string[];
  editPromptText: string;
  updatedAt: number;
};

const normalizeTrait = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-]+|[,;:\-]+$/g, "");

const dedupeTraits = (traits: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of traits) {
    const trait = normalizeTrait(raw);
    if (!trait) continue;
    const key = trait.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(trait);
  }
  return output;
};

type TraitUpdate = {
  traits?: string[];
  addTraits?: string[];
  removeTraits?: string[];
};

const TRAIT_SCHEMA = z
  .object({
    traits: z.array(z.string()).optional(),
    add_traits: z.array(z.string()).optional(),
    remove_traits: z.array(z.string()).optional(),
  })
  .passthrough();

const parseTraitsFromContent = (content: string): TraitUpdate | null => {
  const sanitized = sanitizeModelTextResponse(content);
  if (!sanitized) return null;
  const extracted = extractJsonBlock(sanitized);
  const candidates = [extracted, normalizeJsonLikeString(extracted)];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = TRAIT_SCHEMA.safeParse(parsed);
      if (result.success) {
        const data = result.data as any;
        const traitsRaw = Array.isArray(data.traits) ? data.traits : null;
        const addRaw = Array.isArray(data.add_traits) ? data.add_traits : null;
        const removeRaw = Array.isArray(data.remove_traits) ? data.remove_traits : null;

        const traits = traitsRaw
          ? dedupeTraits(traitsRaw.map((value: unknown) => normalizeTrait(String(value || ""))).filter((value: string) => value.length > 0))
          : undefined;
        const addTraits = addRaw
          ? dedupeTraits(addRaw.map((value: unknown) => normalizeTrait(String(value || ""))).filter((value: string) => value.length > 0))
          : undefined;
        const removeTraits = removeRaw
          ? dedupeTraits(removeRaw.map((value: unknown) => normalizeTrait(String(value || ""))).filter((value: string) => value.length > 0))
          : undefined;

        return { traits, addTraits, removeTraits };
      }
    } catch {
      // keep trying
    }
  }

  return null;
};

const extractJsonBlock = (raw: string): string => {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text;
};

const sanitizeModelTextResponse = (content: string): string =>
  String(content || "")
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .trim();

const normalizeModelContent = (content: unknown): string => {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const maybeText = (part as any).text ?? (part as any).content ?? "";
          return typeof maybeText === "string" ? maybeText : String(maybeText);
        }
        return String(part ?? "");
      })
      .join("");
  }
  if (content && typeof content === "object") {
    const maybeText = (content as any).text ?? (content as any).content ?? "";
    return typeof maybeText === "string" ? maybeText : String(maybeText);
  }
  return String(content ?? "");
};

const normalizeJsonLikeString = (response: string): string =>
  response
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content) => `"${String(content).replace(/"/g, '\\"')}"`);

const applyTraitUpdate = (currentTraits: string[], update: TraitUpdate): string[] => {
  if (update.traits && update.traits.length > 0) {
    return dedupeTraits(update.traits);
  }
  if (update.traits && update.traits.length === 0 && currentTraits.length > 0) {
    // Treat empty full-list output as no-change to avoid accidental wipes.
    return dedupeTraits(currentTraits);
  }

  const addTraits = update.addTraits ?? [];
  const removeTraits = update.removeTraits ?? [];
  const removeKeys = new Set(removeTraits.map((trait) => normalizeTrait(trait).toLowerCase()));

  const kept = currentTraits.filter((trait) => !removeKeys.has(normalizeTrait(trait).toLowerCase()));
  return dedupeTraits([...kept, ...addTraits]);
};

const haveTraitDiff = (before: string[], after: string[]): boolean => {
  const beforeKeys = before.map((trait) => normalizeTrait(trait).toLowerCase()).filter(Boolean).sort();
  const afterKeys = after.map((trait) => normalizeTrait(trait).toLowerCase()).filter(Boolean).sort();
  if (beforeKeys.length !== afterKeys.length) return true;
  for (let i = 0; i < beforeKeys.length; i += 1) {
    if (beforeKeys[i] !== afterKeys[i]) return true;
  }
  return false;
};

const fallbackInferTraitsFromEditPrompt = (currentTraits: string[], prompt: string): string[] => {
  const next = [...currentTraits];
  const lower = prompt.toLowerCase();

  const colors = ["red", "blue", "green", "black", "white", "gray", "grey", "brown", "blond", "blonde", "golden", "pink", "purple", "ginger", "auburn"];
  const textures = ["curly", "wavy", "straight", "short", "long", "braided", "messy"];
  const findFirst = (list: string[]) => list.find((item) => lower.includes(item));

  const removeHairTraits = () => next.splice(0, next.length, ...next.filter((trait) => !/\bhair\b|\bbald\b/i.test(trait)));

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
  const aiProvider = useModelStore((state) => state.aiProvider);
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

  const hasOpenAiKey = (): boolean => {
    const key = (openai as any)?.apiKey;
    return String(key || "").trim().length > 0;
  };

  const ensureOpenAiKey = () => {
    if (!hasOpenAiKey()) {
      throw new Error("OpenAI key missing. Add your key on the launcher page.");
    }
  };

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

  const mergeGuideIntoBase = async (baseDataUrl: string, guideDataUrl?: string): Promise<string> => {
    if (!guideDataUrl) return baseDataUrl;
    const base = await loadImageFromDataUrl(baseDataUrl);
    const guide = await loadImageFromDataUrl(guideDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return baseDataUrl;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(guide, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };

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

  const buildTraitInstruction = (params: { entityName: string; currentTraits: string[]; editPromptText: string }, hasImage: boolean) => {
    const intent = String(params.editPromptText || "").trim() || "(none)";
    return (
      `Entity: ${params.entityName}\n` +
      `Current visual traits labels: ${params.currentTraits.length > 0 ? params.currentTraits.join(", ") : "(none)"}\n` +
      `User edit intent: ${intent}\n` +
      (intent === "(none)" ? `No text prompt provided; infer the intended change from the edited image alone.\n` : "") +
      (hasImage
        ? `Edited reference image: you are given an image with a sketch overlay showing what should change.\n`
        : "") +
      `\nTask: Determine which visual trait labels must be ADDED and which must be REMOVED to match the intended appearance.\n` +
      `Rules:\n` +
      `- Output ONLY JSON.\n` +
      `- Use concise visual labels.\n` +
      `- If no changes, return empty arrays.\n` +
      `- Output shape exactly:\n` +
      `{"add_traits":["trait 1"],"remove_traits":["trait 2"]}`
    );
  };

  const inferTraitsWithLocalLlm = async (
    params: { entityName: string; currentTraits: string[]; editPromptText: string },
    editedImageDataUrl?: string,
  ): Promise<TraitUpdate | null> => {
    const llmInstruction = buildTraitInstruction(params, !!editedImageDataUrl);
    const visionContent = editedImageDataUrl
      ? [
          { type: "text", text: llmInstruction },
          { type: "image_url", image_url: { url: editedImageDataUrl, detail: "high" } },
        ]
      : llmInstruction;

    const runRequest = async (content: any) => {
      const response = await fetch("http://127.0.0.1:3001/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
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

      const contentText = normalizeModelContent(json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.message?.text ?? json?.choices?.[0]?.text ?? "");
      return parseTraitsFromContent(contentText);
    };

    try {
      const traits = await runRequest(visionContent);
      if (traits) return traits;
      if (editedImageDataUrl) {
        return await runRequest(llmInstruction);
      }
      return null;
    } catch {
      if (editedImageDataUrl) {
        try {
          return await runRequest(llmInstruction);
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const inferTraitsWithOpenAi = async (
    params: { entityName: string; currentTraits: string[]; editPromptText: string },
    editedImageDataUrl?: string,
  ): Promise<TraitUpdate | null> => {
    if (!hasOpenAiKey()) return null;
    const llmInstruction = buildTraitInstruction(params, !!editedImageDataUrl);
    const content = editedImageDataUrl
      ? [
          { type: "text", text: llmInstruction },
          { type: "image_url", image_url: { url: editedImageDataUrl, detail: "high" } },
        ]
      : llmInstruction;

    try {
      const result = await openai.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: content as any }],
      });

      const contentText = normalizeModelContent(result.choices?.[0]?.message?.content ?? "");
      return parseTraitsFromContent(contentText);
    } catch {
      return null;
    }
  };

  const getPendingEditVisionImage = async (pendingEdit: PendingImageEdit): Promise<string | null> => {
    if (pendingEdit.mergedImageDataUrl) return pendingEdit.mergedImageDataUrl;
    if (pendingEdit.drawLayerImageDataUrl || pendingEdit.paintedGuideImageDataUrl) {
      return await mergeGuideIntoBase(pendingEdit.baseImageDataUrl, pendingEdit.drawLayerImageDataUrl || pendingEdit.paintedGuideImageDataUrl);
    }
    return null;
  };

  const inferNextTraitsFromEdit = async (
    entity: ExtractedImageEntity,
    editPromptText: string,
    pendingEdit?: PendingImageEdit,
    hasMaskAreaOverride?: boolean,
  ): Promise<string[] | null> => {
    const prompt = String(editPromptText || "").trim();
    const hasMaskArea = hasMaskAreaOverride ?? (pendingEdit ? await maskHasEditableArea(pendingEdit.maskImageDataUrl) : false);
    const visionImage = pendingEdit && hasMaskArea ? await getPendingEditVisionImage(pendingEdit) : null;

    if (!prompt && !visionImage) return null;

    const update =
      aiProvider === "openai"
        ? await inferTraitsWithOpenAi(
            {
              entityName: entity.name,
              currentTraits: entity.traits,
              editPromptText: prompt,
            },
            visionImage || undefined,
          )
        : await inferTraitsWithLocalLlm(
            {
              entityName: entity.name,
              currentTraits: entity.traits,
              editPromptText: prompt,
            },
            visionImage || undefined,
          );

    if (update) {
      const nextTraits = applyTraitUpdate(entity.traits, update);
      return nextTraits.length > 0 ? nextTraits : null;
    }

    if (prompt) {
      const fallback = fallbackInferTraitsFromEditPrompt(entity.traits, prompt);
      return fallback.length > 0 ? fallback : null;
    }

    return null;
  };

  const applyTraitsToEntity = (entityId: string, nextTraits: string[]) => {
    setEntities((state) =>
      state.map((item) => {
        if (item.id !== entityId) return item;
        return { ...item, traits: nextTraits };
      }),
    );
  };

  const syncTraitsFromEditPrompt = async (entity: ExtractedImageEntity, editPromptText: string, pendingEditKey?: string, pendingEdit?: PendingImageEdit) => {
    const nextTraits = await inferNextTraitsFromEdit(entity, editPromptText, pendingEdit);
    if (!nextTraits) return;

    applyTraitsToEntity(entity.id, nextTraits);

    if (pendingEditKey && pendingEdit) {
      setPendingEditByEntityKey((state) => ({
        ...state,
        [pendingEditKey]: { ...pendingEdit, inferredTraits: nextTraits },
      }));
    }
  };

  const buildPendingEditFromPayload = (payload: ImagePaintSavePayload): PendingImageEdit => ({
    baseImageDataUrl: payload.baseImageDataUrl,
    paintedGuideImageDataUrl: payload.drawLayerImageDataUrl,
    maskImageDataUrl: payload.maskImageDataUrl,
    drawLayerImageDataUrl: payload.drawLayerImageDataUrl,
    mergedImageDataUrl: payload.mergedImageDataUrl,
    editPromptText: payload.editPromptText,
    updatedAt: Date.now(),
  });

  const generateEntityImageWithComfy = async (prompt: string): Promise<string> => {
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
    return await imageUrlToDataUrl(imageUrl);
  };

  const generateEntityImageWithOpenAi = async (prompt: string): Promise<string> => {
    ensureOpenAiKey();

    const modelCandidates = ["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini", "dall-e-3", "dall-e-2"];
    const errors: string[] = [];

    for (const model of modelCandidates) {
      try {
        const requestBody: any = {
          model: model as any,
          prompt,
          n: 1,
          response_format: "b64_json",
        };
        if (String(model).startsWith("dall-e-")) {
          requestBody.size = "1024x1024";
        }

        const result = await openai.images.generate(requestBody);
        const first = result.data?.[0];
        if (first?.b64_json) {
          return `data:image/png;base64,${first.b64_json}`;
        }
        if (first?.url) {
          return await imageUrlToDataUrl(String(first.url));
        }
        errors.push(`${model}: no image in response`);
      } catch (error) {
        errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(errors.join(" | ") || "OpenAI image generation failed.");
  };

  const generateEntityImageDataUrl = async (entity: ExtractedImageEntity): Promise<string> => {
    const prompt = buildImagePrompt(entity);
    return aiProvider === "openai" ? await generateEntityImageWithOpenAi(prompt) : await generateEntityImageWithComfy(prompt);
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
      const promptText = pendingEdit.editPromptText.trim();
      const hasMaskArea = await maskHasEditableArea(pendingEdit.maskImageDataUrl);
      if (!promptText && !hasMaskArea) {
        throw new Error("Ajoute un texte d'edition ou dessine sur l'image avant de regenerer.");
      }

      const nextTraits = await inferNextTraitsFromEdit(entity, pendingEdit.editPromptText, pendingEdit, hasMaskArea);
      if (!nextTraits || nextTraits.length === 0) {
        throw new Error("Impossible de deduire les nouveaux traits. Ajoute un texte plus clair ou dessine plus nettement.");
      }
      if (!haveTraitDiff(entity.traits, nextTraits)) {
        throw new Error("Aucun nouveau trait detecte. Precise le changement dans le texte ou le dessin.");
      }

      applyTraitsToEntity(entity.id, nextTraits);
      setPendingEditByEntityKey((state) => ({
        ...state,
        [key]: { ...pendingEdit, inferredTraits: nextTraits },
      }));

      const entityForImage = { ...entity, traits: nextTraits };
      const dataUrl = await generateEntityImageDataUrl(entityForImage);

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

  const generateEntityImage = async (entity: ExtractedImageEntity) => {
    if (isGeneratingAnyImage) return;
    const key = getEntityKey(entity);
    setIsGeneratingAnyImage(true);
    setLoadingByEntityKey((state) => ({ ...state, [key]: true }));
    setErrorByEntityKey((state) => ({ ...state, [key]: "" }));
    try {
      const dataUrl = await generateEntityImageDataUrl(entity);

      // Card image source of truth is only the generated output.
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

    let seededFromGraph: ExtractedImageEntity[] = [];
    setIsExtracting(true);
    setExtractError("");
    try {
      seededFromGraph = ImageEntitiesExtractor.fromModelEntities(graphEntities);
      if (seededFromGraph.length > 0) {
        setEntities(seededFromGraph);
      }
      const extracted = await ImageEntitiesExtractor.extract(text, seededFromGraph);
      setEntities(extracted);
    } catch (error) {
      setEntities(seededFromGraph.length > 0 ? seededFromGraph : []);
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
              void syncTraitsFromEditPrompt(editingEntity, pendingEdit.editPromptText, editingEntityKey, pendingEdit);
              setEditingEntityKey(null);
            }}
            onSaveAndApply={(payload: ImagePaintSavePayload) => {
              const pendingEdit = buildPendingEditFromPayload(payload);
              setPendingEditByEntityKey((state) => ({
                ...state,
                [editingEntityKey]: pendingEdit,
              }));
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
          {text.trim().length === 0 ? (
            "No entities: the story text is empty."
          ) : (
            <>
              Click <strong>Refresh from text</strong> to extract entities for image generation.
            </>
          )}
        </div>
      )}

      {extractError && <div style={{ color: "#dc2626", whiteSpace: "pre-wrap", marginBottom: 12 }}>Failed to extract entities: {extractError}</div>}

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
                      ? "Redraw from Drawing"
                      : imageByEntityKey[entityKey]
                        ? "Regenerate image"
                        : "Generate image"}
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

              {errorByEntityKey[entityKey] && <div style={{ color: "#dc2626", whiteSpace: "pre-wrap", fontSize: 12 }}>{errorByEntityKey[entityKey]}</div>}

              {hasPendingEdit && <div style={{ color: "#7c3aed", fontSize: 12 }}>Drawing saved. Next regenerate will update traits from the sketch and regenerate the image.</div>}

              {imageByEntityKey[entityKey] && <img src={imageByEntityKey[entityKey]} alt={`${entity.name} generated`} style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
