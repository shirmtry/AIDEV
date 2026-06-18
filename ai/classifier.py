import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Union
import base64
import os
from PIL import Image
import torch
from transformers import AutoImageProcessor, AutoModelForImageClassification
import anthropic
from dataclasses import dataclass

@dataclass
class PredictionResult:
    """Stores the result of a disease prediction."""
    label: str
    confidence: float
    top_k: List[Tuple[str, float]]
    raw_response: Optional[Dict] = None

class DiseaseClassifier:
    """
    Supports two backends:
    1. HuggingFace model (for local inference)
    2. Claude Vision API (for advanced image analysis)
    """
    
    def __init__(
        self,
        model_path: Optional[Path] = None,
        use_claude: bool = False,
        claude_api_key: Optional[str] = None,
    ):
        self.use_claude = use_claude
        self.claude_api_key = claude_api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = None
        self.processor = None
        self.id2label = None

        if not use_claude and model_path:
            self._load_hf_model(model_path)
        elif use_claude and not self.claude_api_key:
            raise ValueError("Claude API key required for Claude Vision backend")
    
    def _load_hf_model(self, model_path: Path):
        """Load HuggingFace model from directory."""
        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        # Load label map
        label_map_path = model_path / "label_map.json"
        if label_map_path.exists():
            with open(label_map_path, 'r', encoding='utf-8') as f:
                label_map = json.load(f)
            self.id2label = {int(k): v for k, v in label_map.items()}
        
        # Load processor and model
        try:
            self.processor = AutoImageProcessor.from_pretrained(model_path)
            self.model = AutoModelForImageClassification.from_pretrained(model_path)
            self.model.eval()
        except Exception as e:
            raise RuntimeError(f"Failed to load HF model: {e}")
    
    def predict(self, image_path: Union[str, Path], top_k: int = 5) -> PredictionResult:
        """Predict using selected backend."""
        if self.use_claude:
            return self._predict_claude(image_path, top_k)
        else:
            return self._predict_hf(image_path, top_k)
    
    def _predict_hf(self, image_path: Union[str, Path], top_k: int) -> PredictionResult:
        """HuggingFace inference."""
        image = Image.open(image_path).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)
        top_probs, top_indices = torch.topk(probs, k=top_k, dim=-1)
        top_probs = top_probs.cpu().numpy().flatten()
        top_indices = top_indices.cpu().numpy().flatten()
        
        predictions = []
        for idx, prob in zip(top_indices, top_probs):
            label = self.id2label.get(idx, f"class_{idx}") if self.id2label else f"class_{idx}"
            predictions.append((label, float(prob)))
        
        return PredictionResult(
            label=predictions[0][0],
            confidence=predictions[0][1],
            top_k=predictions
        )
    
    def _predict_claude(self, image_path: Union[str, Path], top_k: int) -> PredictionResult:
        """Claude Vision inference."""
        if not self.claude_api_key:
            raise ValueError("Claude API key not set")
        
        client = anthropic.Anthropic(api_key=self.claude_api_key)
        with open(image_path, "rb") as f:
            img_data = base64.standard_b64encode(f.read()).decode("utf-8")
        
        # Determine media type
        ext = Path(image_path).suffix.lower()
        media_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp"
        }.get(ext, "image/jpeg")
        
        prompt = (
            "Analyze this plant image and return a JSON with the following fields: "
            "plant_type, detected_diseases (list), symptoms_visible (list), confidence (Cao/Trung bình/Thấp), "
            "severity (Nhẹ/Trung bình/Nặng/Rất nặng), treatment_urgent (list), prevention (list), note. "
            "If no disease, return empty list for detected_diseases."
        )
        
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1000,
            system="You are a plant disease expert. Respond only with valid JSON.",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_data}},
                        {"type": "text", "text": prompt}
                    ]
                }
            ]
        )
        raw = message.content[0].text.strip()
        # Parse JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        detected = result.get("detected_diseases", [])
        label = detected[0] if detected else "No disease detected"
        confidence = 0.85 if detected else 0.95  # heuristic
        top_k_predictions = [(label, confidence)] if detected else [("Healthy", 0.95)]
        return PredictionResult(
            label=label,
            confidence=confidence,
            top_k=top_k_predictions,
            raw_response=result
        )