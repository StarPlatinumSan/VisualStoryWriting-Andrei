import { useEffect, useState } from "react";
import { useModelStore } from "../../model/Model";
import { ExtractedImageEntity, ImageEntitiesExtractor } from "../../model/prompts/textExtractors/ImageEntitiesExtractor";

export default function ImagesEditor(props: { refreshToken?: number; onRefreshDone?: () => void; onEntitiesChange?: (entities: ExtractedImageEntity[]) => void }) {
  const text = useModelStore((state) => state.text);
  const graphEntities = useModelStore((state) => state.entityNodes);
  const [entities, setEntities] = useState<ExtractedImageEntity[]>([]);
  const [imageByEntityKey, setImageByEntityKey] = useState<Record<string, string>>({});
  const [loadingByEntityKey, setLoadingByEntityKey] = useState<Record<string, boolean>>({});
  const [errorByEntityKey, setErrorByEntityKey] = useState<Record<string, string>>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [isGeneratingAnyImage, setIsGeneratingAnyImage] = useState(false);

  const getEntityKey = (entity: ExtractedImageEntity): string =>
    entity.name.trim().toLowerCase().replace(/\s+/g, " ");

  const buildImagePrompt = (entity: ExtractedImageEntity): string => {
    const traits = entity.traits.length > 0 ? `, ${entity.traits.join(", ")}` : "";
    return `${entity.name}${traits}, highly detailed cinematic portrait, clean background`;
  };

  const generateEntityImage = async (entity: ExtractedImageEntity) => {
    if (isGeneratingAnyImage) return;
    const normalizedEntity: ExtractedImageEntity = {
      ...entity,
      traits: entity.traits.map((trait) => trait.trim()).filter((trait) => trait.length > 0),
    };
    const key = getEntityKey(normalizedEntity);
    const prompt = buildImagePrompt(normalizedEntity);
    setIsGeneratingAnyImage(true);
    setLoadingByEntityKey((state) => ({ ...state, [key]: true }));
    setErrorByEntityKey((state) => ({ ...state, [key]: "" }));
    try {
      const resp = await fetch("http://127.0.0.1:3001/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const raw = await resp.text();
      if (!resp.ok) {
        throw new Error(raw);
      }
      const data = JSON.parse(raw);
      const imageUrl = String(data?.image_url || "");
      if (!imageUrl) {
        throw new Error("Image URL missing from ComfyAI response.");
      }
      setImageByEntityKey((state) => ({ ...state, [key]: imageUrl }));
    } catch (error) {
      setErrorByEntityKey((state) => ({ ...state, [key]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setLoadingByEntityKey((state) => ({ ...state, [key]: false }));
      setIsGeneratingAnyImage(false);
    }
  };

  const updateTraitAt = (entityId: string, traitIndex: number, value: string) => {
    setEntities((state) =>
      state.map((entity) => {
        if (entity.id !== entityId) return entity;
        const nextTraits = [...entity.traits];
        nextTraits[traitIndex] = value;
        return { ...entity, traits: nextTraits };
      })
    );
  };

  const removeTraitAt = (entityId: string, traitIndex: number) => {
    setEntities((state) =>
      state.map((entity) => {
        if (entity.id !== entityId) return entity;
        return { ...entity, traits: entity.traits.filter((_, i) => i !== traitIndex) };
      })
    );
  };

  const addTrait = (entityId: string) => {
    setEntities((state) =>
      state.map((entity) => {
        if (entity.id !== entityId) return entity;
        if (entity.traits.length >= 8) return entity;
        return { ...entity, traits: [...entity.traits, ""] };
      })
    );
  };

  const refreshFromText = async () => {
    if (!text.trim()) {
      setEntities([]);
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
    props.onEntitiesChange?.(
      entities.map((entity) => ({
        ...entity,
        traits: entity.traits.map((trait) => trait.trim()).filter((trait) => trait.length > 0),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

  return (
    <div style={{ padding: 24, height: "100%", overflow: "auto" }}>
      {isExtracting && <div style={{ color: "#6b7280", marginBottom: 12 }}>Extracting entities...</div>}

      {!isExtracting && entities.length === 0 && !extractError && (
        <div style={{ color: "#6b7280" }}>
          Click <strong>Refresh from text</strong> to extract entities for image generation.
        </div>
      )}

      {extractError && (
        <div style={{ color: "#dc2626", whiteSpace: "pre-wrap", marginBottom: 12 }}>
          Failed to extract entities: {extractError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {entities.map((entity) => (
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
                onClick={() => generateEntityImage(entity)}
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
                {loadingByEntityKey[getEntityKey(entity)]
                  ? "Generating..."
                  : imageByEntityKey[getEntityKey(entity)]
                    ? "Regenerate with ComfyAI"
                    : "Generate with ComfyAI"}
              </button>
            </div>
            {errorByEntityKey[getEntityKey(entity)] && (
              <div style={{ color: "#dc2626", whiteSpace: "pre-wrap", fontSize: 12 }}>
                {errorByEntityKey[getEntityKey(entity)]}
              </div>
            )}
            {imageByEntityKey[getEntityKey(entity)] && (
              <img
                src={imageByEntityKey[getEntityKey(entity)]}
                alt={`${entity.name} generated`}
                style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
