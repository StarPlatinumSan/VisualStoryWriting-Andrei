import { useModelStore } from "../../Model";
import { TextUtils } from "../../TextUtils";
import { TextEditPrompt } from "./TextEditPrompt";

export abstract class TargettedTextEditPrompt extends TextEditPrompt {
    splittedText: {precedingText: string, textToModify: string, followingText: string} | null;

    constructor() {
        super();
        this.splittedText = null;
    }

    isTargetted(): boolean {
        const actionSelection = useModelStore.getState().filteredActionsSegment;
        return actionSelection !== null;
    }

    splitTextBasedOnSelection(): {precedingText: string, textToModify: string, followingText: string} | null {
        const actionSelection = useModelStore.getState().filteredActionsSegment;
        if (actionSelection) {
            const firstActionMatch = useModelStore.getState().textActionMatches[actionSelection.start];
            const lastActionMatch = useModelStore.getState().textActionMatches[actionSelection.end];

            const precedingText = useModelStore.getState().text.slice(0, firstActionMatch.start);
            const textToModify = useModelStore.getState().text.slice(firstActionMatch.start, lastActionMatch.end);
            const followingText = useModelStore.getState().text.slice(lastActionMatch.end);

            return {precedingText, textToModify, followingText};
        }

        return null;
    }

    getPrompt(): string {
        this.splittedText = this.splitTextBasedOnSelection();

        if (this.splittedText) {
            return this.getTargettedPrompt(this.splittedText.precedingText, this.splittedText.textToModify, this.splittedText.followingText);
        }

        return this.getGlobalPrompt(useModelStore.getState().text);
    }

    reconstructResult(result: string): string {
        // Should be based on the splitted text at the time the prompt was executed
        if (this.splittedText) {
            return this.splittedText.precedingText + TextUtils.getFittingString(result, this.splittedText.textToModify) + this.splittedText.followingText;
        }

        return result;
    }

    abstract getTargettedPrompt(precedingText: string, textToModify: string, followingText: string): string
    abstract getGlobalPrompt(text: string): string
}