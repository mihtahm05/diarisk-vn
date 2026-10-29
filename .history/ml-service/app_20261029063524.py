from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
import shap

app = FastAPI(
    title="DiaRisk VN ML Service", 
    version="1.1.0", 
    description="Hệ thống hỗ trợ phân tích và dự đoán nguy cơ đái tháo đường kèm giải thích SHAP"
)

# Thư mục chứa model nằm cùng cấp với app.py
MODEL_DIR = Path("model")
bundles = {}
tree_explainers = {}

# Load tự động mô hình và khởi tạo SHAP TreeExplainer
for mode in ["nonclinical", "clinical"]:
    bundle_path = MODEL_DIR / f"{mode}_bundle.joblib"
    if bundle_path.exists():
        bundle = joblib.load(bundle_path)
        bundles[mode] = bundle
        # Khởi tạo sẵn TreeExplainer của XGBoost để tăng tốc độ phản hồi API
        tree_explainers[mode] = shap.TreeExplainer(bundle["model"])

# Các hàm chuẩn hóa dữ liệu
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
    return bundle["calibrator"].predict_proba(logit_feature(raw))[:, 1]

# Cấu trúc API Request
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
    
    # 1. Biến đổi dữ liệu qua preprocessor
    X_transformed = bundle["preprocessor"].transform(frame)
    
    # 2. Tính xác suất dự đoán
    prob = float(probabilities(bundle, frame)[0])
    threshold = float(bundle["threshold"])
    screen_positive = bool(prob >= threshold)
    
    # 3. Tính toán SHAP values để giải thích nguyên nhân
    explainer = tree_explainers[mode]
    shap_values = explainer.shap_values(X_transformed)
    feature_names = bundle["preprocessor"].get_feature_names_out()
    
    # Đóng gói giá trị SHAP thành danh sách top yếu tố ảnh hưởng
    shap_df = pd.DataFrame({
        "feature": feature_names,
        "shap_value": shap_values[0]
    })
    shap_df["impact_magnitude"] = shap_df["shap_value"].abs()
    
    # Lấy top 5 yếu tố có tác động mạnh nhất
    top_shap = shap_df.sort_values("impact_magnitude", ascending=False).head(5)
    
    explanation_list = []
    for _, row in top_shap.iterrows():
        effect_desc = "Tăng nguy cơ" if row["shap_value"] > 0 else "Giảm nguy cơ"
        explanation_list.append({
            "feature": row["feature"],
            "shap_value": round(float(row["shap_value"]), 4),
            "effect": effect_desc
        })

    return {
        "mode": mode,
        "probability_pct": round(prob * 100, 2),
        "screen_positive": screen_positive,
        "threshold": threshold,
        "top_influencing_factors": explanation_list,
        "model_version": bundle["version"]
    }