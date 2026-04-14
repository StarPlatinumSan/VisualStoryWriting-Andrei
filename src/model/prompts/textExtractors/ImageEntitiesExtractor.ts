import { z } from "zod";
import { getEntityEmoji } from "../../../view/utils/display";
import { EntityNode } from "../../Model";
import { JSONPrompt } from "../utils/JSONPrompt";

const IMAGE_ENTITIES_SCHEMA = z.object({
	entities: z.array(
		z.object({
			name: z.string(),
			emoji: z.string(),
			traits: z.array(z.string()),
		}),
	),
});

export type ExtractedImageEntity = {
	id: string;
	name: string;
	emoji: string;
	traits: string[];
};

export class ImageEntitiesExtractor {
	static getPrompt(text: string): string {
		return `${text}

Extract ALL distinct visually representable entities from this story.

For each entity, return:
- name
- emoji
- traits (short visual traits, e.g. old, tall, armored, red-haired)

Rules:
- Return only distinct entities like characters, objects and locations (merge duplicate mentions).
- Exclude actions, emotions, intentions, personality, relationships.
- Return ONLY valid JSON following the required schema.
`;
	}

	static normalize(entities: z.infer<typeof IMAGE_ENTITIES_SCHEMA>["entities"]): ExtractedImageEntity[] {
		const dedup = new Map<string, { name: string; emoji: string; traits: string[] }>();

		for (const entity of entities) {
			const name = String(entity.name || "").trim();
			if (name.length === 0) continue;

			const key = name.toLowerCase();
			const emoji = getEntityEmoji(String(entity.emoji || "").trim());
			const traits = Array.isArray(entity.traits)
				? entity.traits
						.map((t) => String(t).trim())
						.filter((t) => t.length > 0)
						.slice()
				: [];

			if (!dedup.has(key)) {
				dedup.set(key, { name, emoji, traits });
			} else {
				const prev = dedup.get(key)!;
				const mergedTraits = Array.from(new Set([...(prev.traits || []), ...traits]));
				dedup.set(key, { name: prev.name, emoji: prev.emoji, traits: mergedTraits });
			}
		}

		return Array.from(dedup.values()).map((entity, index) => ({
			id: `image-entity-${index}-${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
			name: entity.name,
			emoji: entity.emoji,
			traits: entity.traits || [],
		}));
	}

	static fromModelEntities(entityNodes: EntityNode[]): ExtractedImageEntity[] {
		return entityNodes.map((entityNode, index) => ({
			id: `image-entity-${index}-${entityNode.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
			name: entityNode.data.name,
			emoji: getEntityEmoji(entityNode.data.emoji || ""),
			traits: (entityNode.data.properties || [])
				.slice()
				.sort((a, b) => b.value - a.value)
				.map((p) => p.name.trim())
				.filter((name) => name.length > 0),
		}));
	}

	static mergeEntities(primary: ExtractedImageEntity[], secondary: ExtractedImageEntity[]): ExtractedImageEntity[] {
		const merged = new Map<string, ExtractedImageEntity>();
		for (const entity of [...primary, ...secondary]) {
			const key = entity.name.toLowerCase();
			if (!merged.has(key)) {
				merged.set(key, { ...entity, traits: Array.from(new Set(entity.traits || [])) });
				continue;
			}
			const prev = merged.get(key)!;
			merged.set(key, {
				...prev,
				emoji: prev.emoji || entity.emoji,
				traits: Array.from(new Set([...(prev.traits || []), ...(entity.traits || [])])),
			});
		}
		return Array.from(merged.values());
	}

	static async extract(text: string, seedEntities: ExtractedImageEntity[] = []): Promise<ExtractedImageEntity[]> {
		if (!text.trim()) return [];

		const prompt = new JSONPrompt(
			{
				prompt: ImageEntitiesExtractor.getPrompt(text),
			},
			IMAGE_ENTITIES_SCHEMA,
		);

		(prompt as any).localTimeoutMs = 900000;

		const result = await prompt.execute();
		const extracted = ImageEntitiesExtractor.normalize(result.result.entities);
		return ImageEntitiesExtractor.mergeEntities(seedEntities, extracted);
	}
}
