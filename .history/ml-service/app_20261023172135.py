from typing import Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="DiaRisk VN ML Service", version="0.1.0-demo", description="Demo only; not clinically validated")
class PredictionRequest(BaseModel):
    features: Dict[str, Any] = Field(default_factory=dict)
    mode: str = "non_clinical"

@app.get("/health")
def health():
    return {"status":"ok", "model_status":"demo_not_clinically_validated"}

@app.post("/predict")
def predict(req: PredictionRequest):
    # DEMO ONLY: replace this rule with a persisted, validated XGBoost pipeline.
    # Never interpret this output as an actual medical risk estimate.
    f = req.features
    score = 0.12
    try:
        age = float(f.get("age", 0) or 0)
        bmi = float(f.get("bmi", 0) or 0)
        glucose = float(f.get("glucose", 0) or 0)
        if age >= 45: score += 0.12
        if bmi >= 30: score += 0.14
        if glucose >= 126: score += 0.30
        elif glucose >= 100: score += 0.12
        if str(f.get("family_history", "")).lower() in ("yes", "true", "1", "có"): score += 0.10
    except (TypeError, ValueError):
        pass
    score = max(0.01, min(score, 0.95))
    level = "Low" if score < 0.30 else ("Medium" if score < 0.60 else "High")
    factors = [{"feature":"age","value":f.get("age"),"impact":"demo"}, {"feature":"bmi","value":f.get("bmi"),"impact":"demo"}, {"feature":"glucose","value":f.get("glucose"),"impact":"demo"}]
    return {"risk_level":level,"probability":round(score*100,2),"shap_values":factors,"model_version":"demo-not-clinically-validated","warning":"KẾT QUẢ DEMO: không phải dự đoán y tế đã được huấn luyện hoặc kiểm định. Không dùng để chẩn đoán hay điều trị."}
