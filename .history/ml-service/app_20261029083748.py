from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
import shap

app = FastAPI(
    title="DiaRisk VN ML Service", 
    version="1.2.1", 
    description="Hệ thống hỗ trợ phân tích và dự đoán nguy cơ đái tháo đường"
)

MODEL_DIR = Path("model")
bundles = {}

# Load mô hình an toàn khi khởi động server (Không khởi tạo shap ở đây nữa)
for mode in ["nonclinical", "clinical"]:
    bundle_path = MODEL_DIR / f"{mode}_bundle.joblib"
    if bundle_path.exists():
        bundles[mode] = joblib.load(bundle_path)

def is_missing(value):
    return value is None or (isinstance(value, str) and not value.strip()) or bool(pd.isna(value))

def normalize_record(payload: dict, mode: str):
    if mode not in bundles:
        raise ValueError(f"Mode '{mode}' không hợp lệ hoặc chưa được load.")
    
    features = bundles[mode]["features"]
    row = {c: np.nan for c in features}
    
    age = payload.get("age")
    if is_missing(age):
        raise ValueError("Thiếu trường bắt buộc: age")
    try:
        age_val = float(age)
    except ValueError:
        raise ValueError("age phải là số")
    
    if not (18 <= age_val <= 120):
        raise ValueError("age phải nằm trong khoảng từ 18 đến 120")
    
    row["age_group"] = int(np.searchsorted([25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80], age_val, side="right") + 1)
    
    sex = str(payload.get("sex", "")).strip().lower()
    if sex not in ("male", "female"):
        raise ValueError("sex chỉ nhận giá trị 'Male' hoặc 'Female'")
    row["sex"] = int(sex == "male")
    
    bmi = payload.get("bmi")
    if is_missing(bmi):
        raise ValueError("Thiếu trường bắt buộc: bmi")
    try:
        bmi_val = float(bmi)
    except ValueError:
        raise ValueError("bmi phải là số")
    if not (10 <= bmi_val <= 100):
        raise ValueError("bmi phải nằm trong khoảng từ 10 đến 100")
    row["bmi"] = bmi_val
    
    for c in features:
        if c in ("age_group", "sex", "bmi"):
            continue
        v = payload.get(c)
        if is_missing(v):
            continue
        if c == "smoker_status":
            v = str(v).strip().lower()
            if v not in ("current", "former", "never"):
                raise ValueError("smoker_status phải là 'current', 'former' hoặc 'never'")
            row[c] = v
        else:
            try:
                row[c] = float(v)
            except ValueError:
                raise ValueError(f"Trường {c} phải có giá trị dạng số")
                
    if mode == "clinical":
        if row.get("high_bp") == 0 and pd.isna(row.get("bp_meds")):
            row["bp_meds"] = 0
        if row.get("high_bp") == 0 and row.get("bp_meds") == 1:
            raise ValueError("high_bp = 0 mâu thuẫn với bp_meds = 1")
            
    frame = pd.DataFrame([row], columns=features)
    return frame

def logit_feature(p):
    p = np.clip(np.asarray(p), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p)).reshape(-1, 1)

def probabilities(bundle, frame):
    xt = bundle["preprocessor"].transform(frame[bundle["features"]])
    raw = bundle["model"].predict_proba(xt)[:, 1]
    calibrator = bundle["calibrator"]
    
    # Vá lỗi tương thích ngược phiên bản scikit-learn cho LogisticRegression calibrator
    try:
        return calibrator.predict_proba(logit_feature(raw))[:, 1]
    except AttributeError:
        if not hasattr(calibrator, "multi_class"):
            calibrator.multi_class = "ovr"
        if not hasattr(calibrator, "classes_"):
            calibrator.classes_ = np.array([0, 1])
        return calibrator.predict_proba(logit_feature(raw))[:, 1]

class PredictionRequest(BaseModel):
    mode: str = Field("nonclinical", description="Chọn 'nonclinical' hoặc 'clinical'")
    data: dict = Field(..., description="Dictionary chứa chỉ số sức khỏe đầu vào")

@app.get("/health")
def health():
    return {"status": "ok", "loaded_modes": list(bundles.keys())}

@app.post("/predict")
def predict(req: PredictionRequest):
    mode = req.mode
    if mode not in bundles:
        raise HTTPException(status_code=400, detail=f"Mode '{mode}' không tồn tại.")
    
    bundle = bundles[mode]
    
    try:
        frame = normalize_record(req.data, mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Tính xác suất dự đoán
    prob = float(probabilities(bundle, frame)[0])
    threshold = float(bundle["threshold"])
    screen_positive = bool(prob >= threshold)
    
    # Tính SHAP an toàn bên trong hàm predict
    explanation_list = []
    try:
        X_transformed = bundle["preprocessor"].transform(frame)
        explainer = shap.TreeExplainer(bundle["model"])
        shap_values = explainer.shap_values(X_transformed)
        feature_names = bundle["preprocessor"].get_feature_names_out()
        
        shap_df = pd.DataFrame({
            "feature": feature_names,
            "shap_value": shap_values[0]
        })
        shap_df["impact_magnitude"] = shap_df["shap_value"].abs()
        top_shap = shap_df.sort_values("impact_magnitude", ascending=False).head(5)
        
        for _, row in top_shap.iterrows():
            explanation_list.append({
                "feature": row["feature"],
                "shap_value": round(float(row["shap_value"]), 4),
                "effect": "Tăng nguy cơ" if row["shap_value"] > 0 else "Giảm nguy cơ"
            })
    except Exception:
        pass

    return {
        "mode": mode,
        "probability_pct": round(prob * 100, 2),
        "screen_positive": screen_positive,
        "threshold": threshold,
        "top_influencing_factors": explanation_list,
        "model_version": bundle["version"]
    }from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import numpy as np
import pandas as pd
import joblib
import os
import shap

app = FastAPI(title="DiaRisk VN - Machine Learning Service")

# Danh sách chuẩn hóa theo đặc tả yêu cầu
NONCLINICAL_COLS = [
    "age_group", "sex", "bmi", "smoker_status", "physical_activity",
    "fruits_daily", "veggies_daily", "heavy_alcohol", "gen_health",
    "ment_hlth_days", "phys_hlth_days", "diff_walk", "education",
    "income", "any_healthcare", "no_doc_cost"
]

CLINICAL_COLS = NONCLINICAL_COLS + [
    "high_bp", "bp_meds", "high_chol", "chol_check", "stroke",
    "heart_disease", "heart_attack", "kidney_disease", "depressive_disorder",
    "asthma", "arthritis", "copd", "last_checkup"
]

# Tải Model & Scaler
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
model_path = os.path.join(MODEL_DIR, "xgboost_model.pkl")

# Load model thực tế
try:
    xgb_model = joblib.load(model_path)
    explainer = shap.TreeExplainer(xgb_model)
except Exception:
    xgb_model = None
    explainer = None

class PredictionRequest(BaseModel):
    mode: str = Field(..., description="'non-clinical' hoặc 'clinical'")
    features: Dict[str, Any]

def generate_recommendations(features: Dict[str, Any], prob: float) -> List[str]:
    recs = []
    if prob > 0.5:
        recs.append("Khuyến nghị đến cơ sở y tế để thực hiện xét nghiệm định lượng Glucose và HbA1c.")
    if features.get("bmi", 0) >= 25.0:
        recs.append("Kiểm soát chỉ số khối cơ thể (BMI) thông qua khẩu phần ăn giảm tinh bột tinh chế và chất béo bão hòa.")
    if features.get("physical_activity") == 2:
        recs.append("Tăng cường vận động thể lực tối thiểu 150 phút/tuần (đi bộ nhanh, bơi lội, đạp xe).")
    if features.get("heavy_alcohol") == 2:
        recs.append("Hạn chế tiêu thụ đồ uống có cồn.")
    if not recs:
        recs.append("Duy trì chế độ dinh dưỡng lành mạnh và tái khám định kỳ hàng năm.")
    return recs

@app.post("/predict")
async def predict(payload: PredictionRequest):
    if xgb_model is None:
        raise HTTPException(status_code=503, detail="Mô hình ML chưa sẵn sàng hoặc file artifact thiếu.")

    expected_cols = CLINICAL_COLS if payload.mode == "clinical" else NONCLINICAL_COLS
    
    # Rà soát thiếu dữ liệu
    missing = [c for c in expected_cols if c not in payload.features]
    if missing:
        raise HTTPException(status_code=422, detail=f"Thiếu các chỉ số: {', '.join(missing)}")

    # Tạo DataFrame đúng thứ tự cột
    df = pd.DataFrame([{col: payload.features[col] for col in expected_cols}])
    
    # Dự đoán xác suất
    prob = float(xgb_model.predict_proba(df)[0][1])
    
    # Phân ngưỡng nguy cơ
    if prob < 0.30:
        risk_level = "Thấp"
    elif prob <= 0.60:
        risk_level = "Trung bình"
    else:
        risk_level = "Cao"

    # Trích xuất SHAP
    shap_dict = {}
    if explainer:
        shap_values = explainer.shap_values(df)
        for idx, col in enumerate(expected_cols):
            shap_dict[col] = float(shap_values[0][idx])

    return {
        "mode": payload.mode,
        "probability": prob,
        "riskLevel": risk_level,
        "shapValues": shap_dict,
        "recommendations": generate_recommendations(payload.features, prob)
    }