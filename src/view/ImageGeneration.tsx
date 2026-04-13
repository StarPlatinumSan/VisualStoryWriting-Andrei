import { Button, Divider } from "@nextui-org/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { openai } from "../model/Model";

export default function ImageGeneration() {
	const [prompt, setPrompt] = useState("");
	const [llmPrompt, setLlmPrompt] = useState("");
	const [llmResponse, setLlmResponse] = useState("");
	const [llmError, setLlmError] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [images, setImages] = useState<{ filename: string; url: string }[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isAskingLLM, setIsAskingLLM] = useState(false);
	const [openAiPrompt, setOpenAiPrompt] = useState("A cinematic portrait photo of a bald man wearing a jacket, neutral background, realistic lighting.");
	const [openAiImageUrl, setOpenAiImageUrl] = useState("");
	const [openAiImageDataUrl, setOpenAiImageDataUrl] = useState("");
	const [openAiModelUsed, setOpenAiModelUsed] = useState("");
	const [openAiError, setOpenAiError] = useState("");
	const [isOpenAiGenerating, setIsOpenAiGenerating] = useState(false);
	const navigate = useNavigate();
	const sanitizeLlmOutput = (content: string) => {
		return content
			.replace(/<think[\s\S]*?<\/think>/gi, "")
			.replace(/^\s+|\s+$/g, "");
	};

	return (
		<div className="box imageGenRoot">
			<Button className="backButton" onClick={() => navigate("/")}>
				Back
			</Button>
			<h2 className="mediumTitle">Image Generation Testing Ground</h2>
			<p className="text">This is a testing ground for image generation features. It serves for the dev phase to test the local AI.</p>

			<section className="box padding-1rem width-50">
				<p className="text">Local LLM (LM Studio / Mistral)</p>
				<textarea
					className="promptInput width-100"
					rows={4}
					value={llmPrompt}
					onChange={(e) => setLlmPrompt(e.target.value)}
					placeholder="Prompt your local Mistral model here."
				/>
				<Button
					isDisabled={isAskingLLM || llmPrompt.trim().length === 0}
					onClick={async () => {
						setIsAskingLLM(true);
						setLlmError("");
						try {
							const resp = await fetch("http://127.0.0.1:3001/api/llm", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									model: "mistral-7b-instruct-v0.2",
									messages: [{ role: "user", content: llmPrompt }],
									temperature: 0,
								}),
							});

							const raw = await resp.text();
							if (!resp.ok) {
								throw new Error(raw);
							}

							const data = JSON.parse(raw);
							const content = data?.choices?.[0]?.message?.content || "";
							const sanitized = sanitizeLlmOutput(content);
							setLlmResponse(sanitized);
						} catch (error) {
							setLlmResponse("");
							setLlmError(error instanceof Error ? error.message : String(error));
						} finally {
							setIsAskingLLM(false);
						}
					}}
				>
					Ask Local Mistral
				</Button>
				<div className="box darkBox">
					<p>Mistral response:</p>
					{isAskingLLM && <p>Generating response...</p>}
					{llmError && <pre style={{ color: "#ef4444", whiteSpace: "pre-wrap" }}>{llmError}</pre>}
					{llmResponse && <pre style={{ whiteSpace: "pre-wrap" }}>{llmResponse}</pre>}
				</div>

				<Divider />
				<p className="text">OpenAI Image generation test</p>
				<textarea
					className="promptInput width-100"
					rows={3}
					value={openAiPrompt}
					onChange={(e) => setOpenAiPrompt(e.target.value)}
					placeholder="Prompt OpenAI image generation here."
				/>
				<Button
					isDisabled={isOpenAiGenerating || openAiPrompt.trim().length === 0}
					onClick={async () => {
						setIsOpenAiGenerating(true);
						setOpenAiError("");
						setOpenAiImageUrl("");
						setOpenAiImageDataUrl("");
						setOpenAiModelUsed("");

						try {
							if (!openai.apiKey || String(openai.apiKey).trim().length === 0) {
								throw new Error("OpenAI key missing. Add your key on the launcher page.");
							}

							const modelCandidates = ["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini", "dall-e-3", "dall-e-2"];
							const errors: string[] = [];
							let didSucceed = false;

							for (const model of modelCandidates) {
								try {
									const requestBody: any = {
										model: model as any,
										prompt: openAiPrompt,
										n: 1,
										response_format: "b64_json",
									};
									if (model.startsWith("dall-e-")) {
										requestBody.size = "1024x1024";
									}
									const result = await openai.images.generate(requestBody);

									const first = result.data?.[0];
									if (first?.b64_json) {
										setOpenAiImageDataUrl(`data:image/png;base64,${first.b64_json}`);
										setOpenAiModelUsed(model);
										didSucceed = true;
										break;
									}
									if (first?.url) {
										setOpenAiImageUrl(String(first.url));
										setOpenAiModelUsed(model);
										didSucceed = true;
										break;
									}
									errors.push(`${model}: no image in response`);
								} catch (error) {
									errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
								}
							}

							if (!didSucceed && errors.length > 0) {
								throw new Error(errors.join(" | "));
							}
						} catch (error) {
							setOpenAiError(error instanceof Error ? error.message : String(error));
						} finally {
							setIsOpenAiGenerating(false);
						}
					}}
				>
					Test OpenAI Image
				</Button>
				<div className="box darkBox">
					<p>OpenAI test result:</p>
					{isOpenAiGenerating && <p>Generating image with OpenAI...</p>}
					{openAiModelUsed && <p>Model used: {openAiModelUsed}</p>}
					{openAiError && <pre style={{ color: "#ef4444", whiteSpace: "pre-wrap" }}>{openAiError}</pre>}
					<div className="imageArea">
						{openAiImageDataUrl && <img src={openAiImageDataUrl} className="image" alt="openai-generated" />}
						{!openAiImageDataUrl && openAiImageUrl && <img src={openAiImageUrl} className="image" alt="openai-generated" />}
					</div>
				</div>

				<Divider />

				<p className="text">Local Image generation (ComfyUI)</p>
				<input className="promptInput width-100" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt your image here." />
				<Button
					isDisabled={isGenerating || prompt.trim().length === 0}
					onClick={async () => {
						setIsGenerating(true);
						try {
							const resp = await fetch("http://127.0.0.1:3001/api/image", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ prompt }),
							});

							const raw = await resp.text();
							console.log("RAW /api/image response:", raw);

							if (!resp.ok) {
								throw new Error(raw);
							}

							const data = JSON.parse(raw);
							setImageUrl(data.image_url);
						} finally {
							setIsGenerating(false);
						}
					}}
				>
					Generate Image
				</Button>
				<div className="box darkBox">
					<p>Generated image will appear here.</p>
					<div className="imageArea">
						{isGenerating && (
							<div className="loadingOverlay">
								<div className="spinnerRing"></div>
								<div className="loadingLabel">Generating image...</div>
							</div>
						)}
						{imageUrl && <img src={imageUrl} className="image" alt="generated" />}
					</div>
				</div>
				<Divider />
				<div className="box darkBox">
					<Button
						onClick={async () => {
							const resp = await fetch("http://127.0.0.1:3001/api/image/list");
							const data = await resp.json();
							setImages(data.images || []);
						}}
					>
						Load All Images
					</Button>

					<div className="boxHorizontal">
						{images.map((img) => (
							<img key={img.filename} src={img.url} alt={img.filename} className="image" />
						))}
					</div>
				</div>
			</section>
		</div>
	);
}
