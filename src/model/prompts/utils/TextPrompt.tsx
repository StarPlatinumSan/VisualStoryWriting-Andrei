import { openai } from "../../Model";
import { useModelStore } from "../../Model";
import { BasePrompt, ExecutablePrompt, PromptResult } from "./BasePrompt";

const LOCAL_LLM_ENDPOINT = "http://127.0.0.1:3001/api/llm";
const LOCAL_DEFAULT_MODEL = "mistral-7b-instruct-v0.2";

export class TextPrompt extends BasePrompt<PromptResult<string>> {
    prompt: ExecutablePrompt;
    onPartialResponse: null | ((partialResult : PromptResult<string>) => void);
    constructor(prompt: ExecutablePrompt) {
        super();
        this.prompt = prompt;
        this.onPartialResponse = null
    }

    execute(): Promise<PromptResult<string>> {
        return new Promise<PromptResult<string>>((resolve, reject) => {
            
            (async () => {
                try {
                if (useModelStore.getState().aiProvider === "local") {
                    const resp = await fetch(LOCAL_LLM_ENDPOINT, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: this.prompt.model || LOCAL_DEFAULT_MODEL,
                            messages: [{ role: "user", content: this.prompt.prompt }],
                            temperature: 0,
                        }),
                    });

                    const raw = await resp.text();
                    if (!resp.ok) {
                        reject(new Error(raw));
                        return;
                    }
                    const data = JSON.parse(raw);
                    const response = data?.choices?.[0]?.message?.content || "";
                    if (this.onPartialResponse) {
                        this.onPartialResponse({ result: response });
                    }
                    resolve({ result: response });
                    return;
                }

                const stream = await openai.chat.completions.create({
                    model: this.prompt.model || "gpt-4o-2024-08-06",
                    messages: [{ role: 'user', content: this.prompt.prompt }],
                    temperature: 0,
                    stream: true,
                });
                let response = '';
                for await (const chunk of stream) {
                    response += chunk.choices[0]?.delta?.content || '';
                    if (this.onPartialResponse) {
                        this.onPartialResponse({ result: response });
                    }
                }
                resolve({ result: response });
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                    return;
                }
              })();
            
        });
    }
}
