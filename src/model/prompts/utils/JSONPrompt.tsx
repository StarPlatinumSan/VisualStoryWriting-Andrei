import { zodResponseFormat } from 'openai/helpers/zod';
import { Allow, parse } from "partial-json";
import { ZodObject, z } from "zod";
import { useStudyStore } from "../../../study/StudyModel";
import { openai } from "../../Model";
import { useModelStore } from "../../Model";
import { BasePrompt, ExecutablePrompt, PromptResult } from "./BasePrompt";

const LOCAL_LLM_ENDPOINT = "http://127.0.0.1:3001/api/llm";
const LOCAL_DEFAULT_MODEL = "mistral-7b-instruct-v0.2";
const LOCAL_DEFAULT_TIMEOUT_MS = 900000;
const LOCAL_MAX_RETRIES = 3;
const LOCAL_RETRY_DELAY_MS = 1200;

export class JSONPrompt<T> extends BasePrompt<PromptResult<T>> {
  prompt: ExecutablePrompt;
  schema: z.ZodType<T>;
  optionalSchema: ZodObject<any> | null;
  onPartialResponse: null | ((partialResult: PromptResult<T>) => void);
  localTimeoutMs: number | null;

  constructor(prompt: ExecutablePrompt, schema: z.ZodType<T>) {
    super();
    this.prompt = prompt;
    this.schema = schema;
    this.optionalSchema = null;
    this.onPartialResponse = null;
    this.localTimeoutMs = null;
  }

  sanitizeModelTextResponse(content: string): string {
    return content
      .replace(/<think[\s\S]*?<\/think>/gi, "")
      .replace(/^\s+|\s+$/g, "");
  }

  normalizeLocalContent(content: unknown): string {
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
  }

  getDefaultValue(field: z.ZodTypeAny): any {
    if (field instanceof z.ZodString) {
      return '';
    } else if (field instanceof z.ZodNumber) {
      return 0;
    } else if (field instanceof z.ZodBoolean) {
      return false;
    } else {
      // Default fallback for other types (e.g., ZodUnion, ZodEnum)
      return null;
    }
  };


  addMissingFields(partialResponse: any, schema: z.ZodType): any {
    const emptyObject = (schema as any as z.ZodObject<any>).shape;

    const filledData = Object.keys(emptyObject).reduce((acc, key) => {
      if (emptyObject[key] instanceof z.ZodObject) {
        acc[key] = this.addMissingFields(partialResponse[key] || {}, emptyObject[key]);
      } else if (emptyObject[key] instanceof z.ZodArray) {
        acc[key] = (partialResponse[key] || []).map((item: any) => this.addMissingFields(item, emptyObject[key].element));
      } else {
        acc[key] = partialResponse.hasOwnProperty(key) ? partialResponse[key] : this.getDefaultValue(emptyObject[key]);
      }
      return acc;
    }, {} as Record<string, z.ZodTypeAny>);


    return filledData;
  }

  partialParse(response: string): T | null {
    try {
      // Partial parse
      let partialResponse = parse(response, ~Allow.STR);
      // Try adding missing values to the partial response using sensible defaults
      return this.schema.parse(this.addMissingFields(partialResponse, this.schema)); // Should add the missing fields
    } catch (e) {
      // Do nothing if we could not parse the partial response
      /*if (e instanceof z.ZodError) {
        console.log(e.issues);
      }
      console.error("Partial parse error for ", response, e);*/
    }
    return null;
  }

  extractJsonString(response: string): string {
    const trimmed = response.trim();

    // Sometimes local models wrap JSON in markdown fences.
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch && fencedMatch[1]) {
      return fencedMatch[1].trim();
    }

    // Fallback: try to isolate first object/array substring.
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject !== -1 && lastObject !== -1 && lastObject > firstObject) {
      return trimmed.slice(firstObject, lastObject + 1);
    }

    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
      return trimmed.slice(firstArray, lastArray + 1);
    }

    return trimmed;
  }

  normalizeJsonLikeString(response: string): string {
    return response
      // Remove trailing commas before closing braces/brackets.
      .replace(/,\s*([}\]])/g, "$1")
      // Quote unquoted keys: { key: "x" } -> { "key": "x" }
      .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
      // Convert single-quoted strings to double-quoted strings.
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content) => `"${String(content).replace(/"/g, '\\"')}"`);
  }

  parseLocalResponse(response: string): T {
    const sanitized = this.sanitizeModelTextResponse(response);
    const extracted = this.extractJsonString(sanitized);

    // 1) Strict parse first.
    try {
      return this.schema.parse(JSON.parse(extracted));
    } catch (e) {
      // continue with relaxed strategies
    }

    // 2) Normalize common JSON-ish mistakes and parse again.
    const normalized = this.normalizeJsonLikeString(extracted);
    try {
      return this.schema.parse(JSON.parse(normalized));
    } catch (e) {
      // continue with partial parse
    }

    // 3) Partial parser fallback.
    const partialResult = this.partialParse(normalized);
    if (partialResult) {
      return partialResult;
    }

    throw new Error("Could not parse local model response into expected JSON schema.");
  }

  async executeLocalWithRetry(localPrompt: string): Promise<{ parsed: T; rawResponse: string }> {
    let lastError: Error | null = null;
    let attemptPrompt = localPrompt;

    for (let attempt = 1; attempt <= LOCAL_MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(LOCAL_LLM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.prompt.model || LOCAL_DEFAULT_MODEL,
            messages: [{ role: "user", content: attemptPrompt }],
            temperature: 0,
            max_tokens: 1600,
            timeout_ms: this.localTimeoutMs ?? LOCAL_DEFAULT_TIMEOUT_MS,
          }),
        });

        const raw = await resp.text();
        if (!resp.ok) {
          throw new Error(raw);
        }

        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`Invalid JSON envelope from local model: ${raw}`);
        }

        const rawContent =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.message?.text ??
          data?.choices?.[0]?.text ??
          "";
        const localResponse = this.sanitizeModelTextResponse(this.normalizeLocalContent(rawContent));
        const parsed = this.parseLocalResponse(localResponse);
        return { parsed, rawResponse: localResponse };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < LOCAL_MAX_RETRIES) {
          attemptPrompt =
            `${localPrompt}\n\n` +
            `Your previous answer was invalid or incomplete. ` +
            `Return ONLY one valid JSON object matching the required schema.`;
          await new Promise((resolve) => setTimeout(resolve, LOCAL_RETRY_DELAY_MS));
          continue;
        }
      }
    }

    throw lastError ?? new Error("Local JSON prompt failed.");
  }



  execute(): Promise<PromptResult<T>> {
    return new Promise<PromptResult<T>>((resolve, reject) => {
      (async () => {
        try {
        useStudyStore.getState().logEvent("PROMPT_TO_EXECUTE", { prompt: this.prompt.prompt });

        if (useModelStore.getState().aiProvider === "local") {
          const jsonShape = this.addMissingFields({}, this.schema);
          const localPrompt = `${this.prompt.prompt}\n\nReturn ONLY a valid JSON object (no markdown, no explanation) matching this exact shape:\n${JSON.stringify(jsonShape, null, 2)}`;

          const local = await this.executeLocalWithRetry(localPrompt);
          const parsedResponse = local.parsed;
          if (this.onPartialResponse) {
            this.onPartialResponse({ result: parsedResponse });
          }
          useStudyStore.getState().logEvent("PROMPT_EXECUTED", { prompt: this.prompt.prompt, response: local.rawResponse });
          this.onPartialResponse = null;
          resolve({ result: parsedResponse });
          return;
        }

        const stream = await openai.chat.completions.create({
          model: this.prompt.model || "gpt-4o-2024-08-06",
          messages: [{ role: 'user', content: this.prompt.prompt }],
          stream: true,
          temperature: 0,
          response_format: zodResponseFormat(this.schema, "response"),
        });

        let response = '';

        for await (const chunk of stream) {
          response += chunk.choices[0]?.delta?.content || '';
          if (this.onPartialResponse) {
            const partialResult = this.partialParse(response);
            if (partialResult) {
              this.onPartialResponse({ result: partialResult });
            }
          }
        }
        useStudyStore.getState().logEvent("PROMPT_EXECUTED", { prompt: this.prompt.prompt, response: response });
        this.onPartialResponse = null; // Reset the partial response callback     
        resolve({ result: JSON.parse(response) as T }); // The parsing should now never fail thanks to the new API. So no need for trying to fix / retrying the request by feeding the error anymore
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      })();
    });
  }
}
