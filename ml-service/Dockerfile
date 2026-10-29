FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
COPY model/nonclinical_bundle.joblib model/clinical_bundle.joblib model/nonclinical_schema.json model/clinical_schema.json ./model/
EXPOSE 8000
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000"]
