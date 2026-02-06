
export interface PromptResult<T> {
    result: T;
}

export interface ExecutablePrompt {
    prompt: string;
    model?: string;
}

export interface MessageGPT {
    role: "user" | "assistant" | "system",
    content: string
}


export class BasePrompt<O> {
    execute(): Promise<O> {
        return new Promise<O>((resolve, reject) => {
            resolve(null as any);
        });
    }
}