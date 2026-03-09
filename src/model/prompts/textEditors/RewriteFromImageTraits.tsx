import { useHistoryModelStore } from "../../HistoryModel";
import { useModelStore } from "../../Model";
import { useViewModelStore } from "../../ViewModel";
import { useStudyStore } from "../../../study/StudyModel";
import { ExtractedImageEntity } from "../textExtractors/ImageEntitiesExtractor";
import { TextEditPrompt } from "./TextEditPrompt";
import { VisualRefresher } from "../textExtractors/VisualRefresher";
import * as Diff from "diff";

export class RewriteFromImageTraits extends TextEditPrompt {
	entities: ExtractedImageEntity[];

	constructor(entities: ExtractedImageEntity[]) {
		super();
		this.entities = entities;
		useStudyStore.getState().logEvent("REWRITE_FROM_IMAGE_TRAITS_PROMPT", {
			entities: entities.map((entity) => ({ name: entity.name, traits: entity.traits })),
		});
	}

	getPrompt(): string {
		const text = useModelStore.getState().text;
		const entitiesDescription = this.entities.map((entity) => `- ${entity.name}: ${entity.traits.length > 0 ? entity.traits.join(", ") : "no specific physical traits"}`).join("\n");

		return (
			`STORY:\n${text}\n\n` +
			`Update only physical descriptions in STORY so each entity matches these traits:\n${entitiesDescription}\n\n` +
			`Rules:\n` +
			`- Make MINIMAL edits only.\n` +
			`- Keep plot, events, order, and locations unchanged.\n` +
			`- Keep names exactly as written.\n` +
			`- Keep the same language and overall style.\n` +
			`- Keep the same number of paragraphs as STORY.\n` +
			`- Keep sentence order and sentence count unchanged.\n` +
			`- Do not add any new events, scenes, or dialogue.\n` +
			`- Only modify short descriptive spans tied to physical appearance.\n` +
			`- Do not output explanations, thoughts, prompt text, or analysis.\n\n` +
			`Output format (strict):\n` +
			`<rewritten_story>\n` +
			`...rewritten full story only...\n` +
			`</rewritten_story>`
		);
	}

	canBeExecuted(): boolean {
		return useModelStore.getState().text.length > 0 && this.entities.length > 0;
	}

	onPartialResult(_result: string): void {}

	reconstructResult(result: string): string {
		const originalText = useModelStore.getState().text;
		const cleaned = result
			.replace(/<think[\s\S]*?<\/think>/gi, "")
			.replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
			.trim();

		const tagged = cleaned.match(/<rewritten_story>\s*([\s\S]*?)\s*<\/rewritten_story>/i);
		if (tagged && tagged[1]) {
			return this.clampToMinimalEdits(originalText, tagged[1].trim());
		}

		const lines = cleaned
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		const filteredLines = lines.filter((line) => {
			const lower = line.toLowerCase();
			if (lower.startsWith("story:")) return false;
			if (lower.startsWith("rules:")) return false;
			if (lower.startsWith("output format")) return false;
			if (lower.startsWith("update only physical descriptions")) return false;
			if (lower.startsWith("- keep ")) return false;
			if (line.startsWith("<rewritten_story>") || line.startsWith("</rewritten_story>")) return false;
			return true;
		});

		return this.clampToMinimalEdits(originalText, filteredLines.join("\n").trim());
	}

	isResultValid(result: string): boolean {
		const cleaned = result.trim();
		return cleaned.length > 0;
	}

	splitSentences(text: string): string[] {
		const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
		if (!matches) return [];
		return matches.map((s) => s.trim()).filter((s) => s.length > 0);
	}

	sentenceEditRatio(originalSentence: string, candidateSentence: string): number {
		const originalWords = originalSentence
			.trim()
			.split(/\s+/)
			.filter((w) => w.length > 0).length;
		if (originalWords === 0) return 0;
		const diff = Diff.diffWords(originalSentence, candidateSentence);
		const editedWords = diff
			.filter((part) => part.added || part.removed)
			.reduce((sum, part) => {
				const words = part.value
					.trim()
					.split(/\s+/)
					.filter((w) => w.length > 0).length;
				return sum + words;
			}, 0);
		return editedWords / originalWords;
	}

	clampToMinimalEdits(originalText: string, candidateText: string): string {
		const originalSentences = this.splitSentences(originalText);
		const candidateSentences = this.splitSentences(candidateText);
		if (originalSentences.length === 0 || candidateSentences.length === 0) {
			return originalText;
		}

		const entityNames = this.entities.map((entity) => entity.name.toLowerCase());
		const length = originalSentences.length;
		const clamped: string[] = [];

		for (let i = 0; i < length; i++) {
			const originalSentence = originalSentences[i];
			const candidateSentence = candidateSentences[i] || originalSentence;
			const lowerOriginal = originalSentence.toLowerCase();
			const lowerCandidate = candidateSentence.toLowerCase();
			const touchesTrackedEntity = entityNames.some((name) => lowerOriginal.includes(name) || lowerCandidate.includes(name));

			if (!touchesTrackedEntity) {
				clamped.push(originalSentence);
				continue;
			}

			const editRatio = this.sentenceEditRatio(originalSentence, candidateSentence);
			if (editRatio > 0.75) {
				clamped.push(originalSentence);
				continue;
			}

			clamped.push(candidateSentence);
		}

		return clamped.join(" ").trim();
	}

	finalize(): void {
		VisualRefresher.getInstance().refreshFromText(this.temporaryResult, undefined, () => {
			useModelStore.getState().suggestNextTextChanges();
			useModelStore.getState().setTextState([{ children: [{ text: this.temporaryResult }] }], true, false);
			useModelStore.getState().setIsStale(false);
			useHistoryModelStore.getState().addHistoryNode(useModelStore.getState());
			useViewModelStore.getState().setTextIsBeingEdited(false);
		});
	}
}
