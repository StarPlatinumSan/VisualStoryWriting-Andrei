import { BasePrompt } from "./BasePrompt";



export class ParallelPrompts<O> extends BasePrompt<O[]> {
    prompts: BasePrompt<O>[];
    constructor(prompts: BasePrompt<O>[]) {
        super();
        this.prompts = prompts;
    }

    async runSequentiallyWithDelay() {
        const results = [];
        for (const prompt of this.prompts) {
            const result = await prompt.execute();
            results.push(result);
            //await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
        return results;
    }

    execute(): Promise<O[]> {
        return this.runSequentiallyWithDelay();
        //return Promise.all(this.prompts.map(prompt => prompt.execute()));
    }
}