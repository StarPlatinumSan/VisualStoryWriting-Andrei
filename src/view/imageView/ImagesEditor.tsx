import { useEffect, useState } from "react";
import { useModelStore } from "../../model/Model";
import { ExtractedImageEntity, ImageEntitiesExtractor } from "../../model/prompts/textExtractors/ImageEntitiesExtractor";

export default function ImagesEditor(props: { refreshToken?: number; onRefreshDone?: () => void }) {
  const text = useModelStore((state) => state.text);
  const graphEntities = useModelStore((state) => state.entityNodes);
  const [entities, setEntities] = useState<ExtractedImageEntity[]>([]);
  const [imageByEntityId, setImageByEntityId] = useState<Record<string, string>>({});
  const [loadingByEntityId, setLoadingByEntityId] = useState<Record<string, boolean>>({});
  const [errorByEntityId, setErrorByEntityId] = useState<Record<string, string>>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");

  const buildImagePrompt = (entity: ExtractedImageEntity): string => {
    const traits = entity.traits.length > 0 ? `, ${entity.traits.join(", ")}` : "";
    return `${entity.name}${traits}, highly detailed cinematic portrait, clean background`;
  };

  const generateEntityImage = async (entity: ExtractedImageEntity) => {
    const prompt = buildImagePrompt(entity);
    setLoadingByEntityId((state) => ({ ...state, [entity.id]: true }));
    setErrorByEntityId((state) => ({ ...state, [entity.id]: "" }));
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
      setImageByEntityId((state) => ({ ...state, [entity.id]: imageUrl }));
    } catch (error) {
      setErrorByEntityId((state) => ({ ...state, [entity.id]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setLoadingByEntityId((state) => ({ ...state, [entity.id]: false }));
    }
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
            {entity.traits.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {entity.traits.map((trait) => (
                  <span
                    key={`${entity.id}-${trait}`}
                    style={{
                      background: "#eef2ff",
                      color: "#3730a3",
                      border: "1px solid #c7d2fe",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {trait}
                  </span>
                ))}
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => generateEntityImage(entity)}
                disabled={!!loadingByEntityId[entity.id]}
                style={{
                  border: "1px solid #9ca3af",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontWeight: 600,
                  background: loadingByEntityId[entity.id] ? "#e5e7eb" : "white",
                  cursor: loadingByEntityId[entity.id] ? "wait" : "pointer",
                }}
              >
                {loadingByEntityId[entity.id] ? "Generating..." : "Generate with ComfyAI"}
              </button>
            </div>
            {errorByEntityId[entity.id] && (
              <div style={{ color: "#dc2626", whiteSpace: "pre-wrap", fontSize: 12 }}>
                {errorByEntityId[entity.id]}
              </div>
            )}
            {imageByEntityId[entity.id] && (
              <img
                src={imageByEntityId[entity.id]}
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
