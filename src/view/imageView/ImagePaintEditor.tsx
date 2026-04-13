import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type PaintTool = "brush" | "eraser";
export type ImagePaintSavePayload = {
	mergedImageDataUrl: string;
	baseImageDataUrl: string;
	maskImageDataUrl: string;
	drawLayerImageDataUrl: string;
	editPromptText: string;
};

export default function ImagePaintEditor(props: {
	entityName: string;
	imageSrc: string;
	initialEditPrompt?: string;
	initialDrawLayerDataUrl?: string;
	onCancel: () => void;
	onSave: (payload: ImagePaintSavePayload) => void;
	onSaveAndApply?: (payload: ImagePaintSavePayload) => void;
}) {
	const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const [isReady, setIsReady] = useState(false);
	const [isDrawing, setIsDrawing] = useState(false);
	const [tool, setTool] = useState<PaintTool>("brush");
	const [color, setColor] = useState("#ff0000");
	const [brushSize, setBrushSize] = useState(18);
	const [undoStack, setUndoStack] = useState<string[]>([]);
	const [redoStack, setRedoStack] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [editPromptText, setEditPromptText] = useState(props.initialEditPrompt || "");
	const pointerIdRef = useRef<number | null>(null);
	const lastPointRef = useRef<{ x: number; y: number } | null>(null);

	const hasUndo = undoStack.length > 1;
	const hasRedo = redoStack.length > 0;

	const currentSnapshot = useMemo(() => {
		return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
	}, [undoStack]);

	const getContext2D = (canvas: HTMLCanvasElement | null) => {
		if (!canvas) return null;
		return canvas.getContext("2d", { willReadFrequently: true });
	};

	const drawSnapshotOnLayer = (snapshot: string) => {
		const drawCanvas = drawCanvasRef.current;
		if (!drawCanvas) return;
		const ctx = getContext2D(drawCanvas);
		if (!ctx) return;

		const img = new Image();
		img.onload = () => {
			ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
			ctx.drawImage(img, 0, 0);
		};
		img.src = snapshot;
	};

	const pushHistorySnapshot = () => {
		const drawCanvas = drawCanvasRef.current;
		if (!drawCanvas) return;
		const snapshot = drawCanvas.toDataURL("image/png");
		setUndoStack((prev) => {
			const next = [...prev, snapshot];
			return next.length > 50 ? next.slice(next.length - 50) : next;
		});
		setRedoStack([]);
	};

	const getPointFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
		const drawCanvas = drawCanvasRef.current;
		if (!drawCanvas) return null;
		const rect = drawCanvas.getBoundingClientRect();
		const scaleX = drawCanvas.width / rect.width;
		const scaleY = drawCanvas.height / rect.height;
		return {
			x: (event.clientX - rect.left) * scaleX,
			y: (event.clientY - rect.top) * scaleY,
		};
	};

	const startStroke = (event: PointerEvent<HTMLCanvasElement>) => {
		const drawCanvas = drawCanvasRef.current;
		if (!drawCanvas || !isReady) return;
		const ctx = getContext2D(drawCanvas);
		if (!ctx) return;
		const point = getPointFromEvent(event);
		if (!point) return;

		drawCanvas.setPointerCapture(event.pointerId);
		pointerIdRef.current = event.pointerId;
		lastPointRef.current = point;
		setIsDrawing(true);
		if (error) setError("");

		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = color;
		ctx.lineWidth = brushSize;
		ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
		ctx.beginPath();
		ctx.moveTo(point.x, point.y);
		ctx.lineTo(point.x, point.y);
		ctx.stroke();
	};

	const moveStroke = (event: PointerEvent<HTMLCanvasElement>) => {
		if (!isDrawing) return;
		const drawCanvas = drawCanvasRef.current;
		if (!drawCanvas) return;
		const ctx = getContext2D(drawCanvas);
		if (!ctx) return;
		const point = getPointFromEvent(event);
		if (!point) return;

		const last = lastPointRef.current ?? point;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = color;
		ctx.lineWidth = brushSize;
		ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
		ctx.beginPath();
		ctx.moveTo(last.x, last.y);
		ctx.lineTo(point.x, point.y);
		ctx.stroke();
		lastPointRef.current = point;
	};

	const endStroke = (event?: PointerEvent<HTMLCanvasElement>) => {
		const drawCanvas = drawCanvasRef.current;
		if (event && drawCanvas && pointerIdRef.current !== null) {
			try {
				drawCanvas.releasePointerCapture(pointerIdRef.current);
			} catch {
				// ignore pointer capture release issues
			}
		}
		pointerIdRef.current = null;
		lastPointRef.current = null;
		if (isDrawing) {
			pushHistorySnapshot();
		}
		setIsDrawing(false);
	};

	const undo = () => {
		setUndoStack((prevUndo) => {
			if (prevUndo.length <= 1) return prevUndo;
			const previousSnapshot = prevUndo[prevUndo.length - 2];
			const popped = prevUndo[prevUndo.length - 1];
			setRedoStack((prevRedo) => [popped, ...prevRedo].slice(0, 50));
			drawSnapshotOnLayer(previousSnapshot);
			return prevUndo.slice(0, prevUndo.length - 1);
		});
	};

	const redo = () => {
		setRedoStack((prevRedo) => {
			if (prevRedo.length === 0) return prevRedo;
			const [nextSnapshot, ...rest] = prevRedo;
			setUndoStack((prevUndo) => {
				const nextUndo = [...prevUndo, nextSnapshot];
				drawSnapshotOnLayer(nextSnapshot);
				return nextUndo.length > 50 ? nextUndo.slice(nextUndo.length - 50) : nextUndo;
			});
			return rest;
		});
	};

	const clearLayer = () => {
		const drawCanvas = drawCanvasRef.current;
		const ctx = getContext2D(drawCanvas);
		if (!drawCanvas || !ctx) return;
		ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
		pushHistorySnapshot();
	};

	const buildExpandedDrawCanvas = (drawCanvas: HTMLCanvasElement, radius: number): HTMLCanvasElement | null => {
		const expandedCanvas = document.createElement("canvas");
		expandedCanvas.width = drawCanvas.width;
		expandedCanvas.height = drawCanvas.height;
		const expandedCtx = expandedCanvas.getContext("2d");
		if (!expandedCtx) return null;
		expandedCtx.clearRect(0, 0, expandedCanvas.width, expandedCanvas.height);

		const step = Math.max(1, Math.floor(radius / 6));
		for (let y = -radius; y <= radius; y += step) {
			for (let x = -radius; x <= radius; x += step) {
				if (x * x + y * y > radius * radius) continue;
				expandedCtx.drawImage(drawCanvas, x, y);
			}
		}
		return expandedCanvas;
	};

	const buildSavePayload = (requireDrawMarks = false, requirePromptText = false): ImagePaintSavePayload | null => {
		const baseCanvas = baseCanvasRef.current;
		const drawCanvas = drawCanvasRef.current;
		if (!baseCanvas || !drawCanvas) return null;

		const drawCtx = getContext2D(drawCanvas);
		if (!drawCtx) return null;

		const exportCanvas = document.createElement("canvas");
		exportCanvas.width = baseCanvas.width;
		exportCanvas.height = baseCanvas.height;
		const exportCtx = exportCanvas.getContext("2d");
		if (!exportCtx) return null;
		exportCtx.drawImage(baseCanvas, 0, 0);
		exportCtx.drawImage(drawCanvas, 0, 0);

		const maskCanvas = document.createElement("canvas");
		maskCanvas.width = baseCanvas.width;
		maskCanvas.height = baseCanvas.height;
		const maskCtx = maskCanvas.getContext("2d");
		if (!maskCtx) return null;

		const drawImageData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
		let hasDrawMarks = false;
		for (let i = 0; i < drawImageData.data.length; i += 4) {
			if (drawImageData.data[i + 3] > 0) {
				hasDrawMarks = true;
				break;
			}
		}
		if (requireDrawMarks && !hasDrawMarks) {
			setError("Dessine d'abord sur l'image avant d'envoyer a ComfyAI.");
			return null;
		}
		if (requirePromptText && editPromptText.trim().length === 0) {
			setError("Le texte d'edition est obligatoire avant d'envoyer a ComfyAI.");
			return null;
		}

		// Expand the editable area around brush strokes so inpainting can affect the full target region.
		const expansionRadius = Math.max(10, Math.floor(brushSize * 1.5));
		const expandedDrawCanvas = buildExpandedDrawCanvas(drawCanvas, expansionRadius);
		const expandedDrawCtx = getContext2D(expandedDrawCanvas);
		const maskSourceCtx = expandedDrawCtx || drawCtx;
		const maskSourceImageData = maskSourceCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
		const maskImageData = maskCtx.createImageData(drawCanvas.width, drawCanvas.height);
		const drawPixels = maskSourceImageData.data;
		const maskPixels = maskImageData.data;

		for (let i = 0; i < drawPixels.length; i += 4) {
			const alpha = drawPixels[i + 3];
			maskPixels[i] = 255;
			maskPixels[i + 1] = 255;
			maskPixels[i + 2] = 255;
			// Transparent area of the mask indicates where edits can happen.
			maskPixels[i + 3] = alpha > 0 ? 0 : 255;
		}
		maskCtx.putImageData(maskImageData, 0, 0);

		return {
			mergedImageDataUrl: exportCanvas.toDataURL("image/png"),
			baseImageDataUrl: baseCanvas.toDataURL("image/png"),
			maskImageDataUrl: maskCanvas.toDataURL("image/png"),
			drawLayerImageDataUrl: drawCanvas.toDataURL("image/png"),
			editPromptText: editPromptText.trim(),
		};
	};

	const saveMergedImage = () => {
		const payload = buildSavePayload(false, false);
		if (!payload) return;
		props.onSave(payload);
	};

	const saveAndApply = () => {
		if (!props.onSaveAndApply) return;
		const payload = buildSavePayload(true, true);
		if (!payload) return;
		props.onSaveAndApply(payload);
	};

	useEffect(() => {
		let mounted = true;
		setIsReady(false);
		setError("");
		setUndoStack([]);
		setRedoStack([]);

		const baseCanvas = baseCanvasRef.current;
		const drawCanvas = drawCanvasRef.current;
		if (!baseCanvas || !drawCanvas) return;

		const baseCtx = getContext2D(baseCanvas);
		const drawCtx = getContext2D(drawCanvas);
		if (!baseCtx || !drawCtx) {
			setError("Canvas API indisponible dans ce navigateur.");
			return;
		}

		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			if (!mounted) return;
			baseCanvas.width = img.naturalWidth;
			baseCanvas.height = img.naturalHeight;
			drawCanvas.width = img.naturalWidth;
			drawCanvas.height = img.naturalHeight;
			baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
			drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
			baseCtx.drawImage(img, 0, 0);
			setIsReady(true);
			const initialSnapshot = drawCanvas.toDataURL("image/png");
			setUndoStack([initialSnapshot]);
			setRedoStack([]);
		};
		img.onerror = () => {
			if (!mounted) return;
			setError("Impossible de charger l'image dans l'editeur.");
		};
		img.src = props.imageSrc;

		return () => {
			mounted = false;
		};
	}, [props.imageSrc]);

	useEffect(() => {
		if (!currentSnapshot || !isReady) return;
		drawSnapshotOnLayer(currentSnapshot);
	}, [currentSnapshot, isReady]);

	useEffect(() => {
		if (!isReady) return;
		const initialDrawLayerDataUrl = props.initialDrawLayerDataUrl?.trim();
		if (!initialDrawLayerDataUrl) return;

		const drawCanvas = drawCanvasRef.current;
		const drawCtx = getContext2D(drawCanvas);
		if (!drawCanvas || !drawCtx) return;

		const img = new Image();
		img.onload = () => {
			drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
			drawCtx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
			const snapshot = drawCanvas.toDataURL("image/png");
			setUndoStack([snapshot]);
			setRedoStack([]);
		};
		img.src = initialDrawLayerDataUrl;
	}, [isReady, props.initialDrawLayerDataUrl]);

	useEffect(() => {
		setEditPromptText(props.initialEditPrompt || "");
	}, [props.initialEditPrompt]);

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
				<div style={{ fontWeight: 700 }}>Edition image: {props.entityName}</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button type="button" onClick={props.onCancel} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", background: "white", cursor: "pointer" }}>
						Retour
					</button>
					<button type="button" onClick={saveMergedImage} style={{ border: "1px solid #2563eb", borderRadius: 8, padding: "6px 10px", background: "#2563eb", color: "white", cursor: "pointer" }}>
						Sauvegarder l'image
					</button>
					{props.onSaveAndApply && (
						<button type="button" onClick={saveAndApply} style={{ border: "1px solid #0f766e", borderRadius: 8, padding: "6px 10px", background: "#0f766e", color: "white", cursor: "pointer" }}>
							Sauvegarder et envoyer ComfyAI
						</button>
					)}
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: 10 }}>
				<button
					type="button"
					onClick={() => setTool("brush")}
					style={{
						border: "1px solid #d1d5db",
						borderRadius: 8,
						padding: "6px 10px",
						background: tool === "brush" ? "#dbeafe" : "white",
						cursor: "pointer",
					}}
				>
					Pinceau
				</button>
				<button
					type="button"
					onClick={() => setTool("eraser")}
					style={{
						border: "1px solid #d1d5db",
						borderRadius: 8,
						padding: "6px 10px",
						background: tool === "eraser" ? "#fee2e2" : "white",
						cursor: "pointer",
					}}
				>
					Gomme
				</button>
				<label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
					Couleur
					<input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
				</label>
				<label style={{ display: "flex", alignItems: "center", gap: 6 }}>
					Taille
					<input type="range" min={2} max={80} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
					<span style={{ minWidth: 30, textAlign: "right" }}>{brushSize}</span>
				</label>
				<button type="button" onClick={undo} disabled={!hasUndo} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", background: hasUndo ? "white" : "#f3f4f6", cursor: hasUndo ? "pointer" : "not-allowed" }}>
					Undo
				</button>
				<button type="button" onClick={redo} disabled={!hasRedo} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", background: hasRedo ? "white" : "#f3f4f6", cursor: hasRedo ? "pointer" : "not-allowed" }}>
					Redo
				</button>
				<button type="button" onClick={clearLayer} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", background: "white", cursor: "pointer" }}>
					Effacer les dessins
				</button>
			</div>

			{error && <div style={{ color: "#dc2626", whiteSpace: "pre-wrap" }}>{error}</div>}

			<div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: 10 }}>
				<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Prompt d'edition (obligatoire pour ComfyAI)</div>
				<textarea
					value={editPromptText}
					onChange={(e) => {
						setEditPromptText(e.target.value);
						if (error) setError("");
					}}
					rows={3}
					placeholder="Ex: transforme ce trait rouge sur le crane en cheveux rouges boucles realistes, en conservant le meme personnage et le meme style global."
					style={{
						width: "100%",
						resize: "vertical",
						border: "1px solid #d1d5db",
						borderRadius: 8,
						padding: 8,
						fontSize: 13,
						outline: "none",
					}}
				/>
			</div>

			<div
				style={{
					flex: 1,
					minHeight: 360,
					border: "1px solid #e5e7eb",
					borderRadius: 12,
					background: "repeating-conic-gradient(#f8fafc 0% 25%, #eef2f7 0% 50%) 50% / 24px 24px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					overflow: "hidden",
					position: "relative",
				}}
			>
				<canvas ref={baseCanvasRef} style={{ maxWidth: "100%", maxHeight: "100%", display: isReady ? "block" : "none" }} />
				<canvas
					ref={drawCanvasRef}
					onPointerDown={startStroke}
					onPointerMove={moveStroke}
					onPointerUp={endStroke}
					onPointerCancel={() => endStroke()}
					onPointerLeave={() => {
						if (isDrawing) endStroke();
					}}
					style={{
						maxWidth: "100%",
						maxHeight: "100%",
						display: isReady ? "block" : "none",
						position: "absolute",
						touchAction: "none",
						cursor: tool === "eraser" ? "cell" : "crosshair",
					}}
				/>
				{!isReady && !error && <div style={{ color: "#6b7280" }}>Chargement de l'image...</div>}
			</div>
		</div>
	);
}
