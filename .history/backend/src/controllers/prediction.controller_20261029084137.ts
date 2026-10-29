import { Request, Response } from 'express';
import axios from 'axios';
import { getDb } from '../config/database';
import { env } from '../config/env';

export const predictForUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const inputData = req.body;
    const db = getDb();

    // Gọi sang ML-Service (FastAPI)
    const mlResponse = await axios.post(`${env.ML_SERVICE_URL}/predict`, {
      mode: 'non-clinical',
      features: inputData
    }, { timeout: 3000 });

    const { riskLevel, probability, shapValues, recommendations } = mlResponse.data;

    // Lưu vào bộ sưu tập Predictions
    const doc = {
      userId,
      mode: 'non-clinical',
      riskLevel,
      probability,
      shapJson: JSON.stringify(shapValues),
      inputFeatures: inputData,
      modelVersion: 'xgboost-brfss-v1.0',
      createdAt: new Date(),
      deletedAt: null
    };

    const saved = await db.collection('predictions').insertOne(doc);

    return res.status(200).json({
      predictionId: saved.insertedId,
      riskLevel,
      probability,
      shapValues,
      recommendations,
      createdAt: doc.createdAt
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi dự đoán từ ML Service.', error: error.message });
  }
};