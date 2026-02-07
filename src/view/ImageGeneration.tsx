import { Button, Card, CardBody, CardHeader, Divider, Input, Select, SelectItem } from "@nextui-org/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ImageGeneration() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [images, setImages] = useState<{ filename: string; url: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="box imageGenRoot">
      <Button className="backButton" onClick={() => navigate("/")}>
        Back
      </Button>
      <h2 className="mediumTitle">Image Generation Testing Ground</h2>
      <p className="text">This is a testing ground for image generation features. It serves for the dev phase to test the local AI.</p>

      <section className="box padding-1rem width-50">
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
              const data = await resp.json();
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
