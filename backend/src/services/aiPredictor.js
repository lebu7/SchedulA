/* backend/src/services/aiPredictor.js */
import tf from '@tensorflow/tfjs-node';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let model = null;

// Load model once when server starts
export const loadModel = async () => {
    if (model) return;
    // Fix path to point to the saved model correctly
    const modelPath = 'file://' + path.join(__dirname, '../ai-models/no-show-model/model.json');
    try {
        model = await tf.loadLayersModel(modelPath);
        console.log("AI Model Loaded Successfully");
    } catch (err) {
        console.error("Failed to load AI model:", err);
    }
};

// Maps text inputs to the numbers the AI expects
const encodeFeatures = (details) => {
    const TOD_MAP = { 'morning': 0, 'afternoon': 1, 'evening': 2 };
    const DOW_MAP = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6 };
    const CATEGORY_MAP = { 'COLOR': 0, 'STYLE': 1, 'MISC': 2 };

    return [
        TOD_MAP[details.timeOfDay] || 1,        // book_tod
        DOW_MAP[details.dayOfWeek] || 0,        // book_dow
        CATEGORY_MAP[details.category] || 1,    // book_category
        details.recency || 30,                  // recency (default 30 days if new)
        details.lastReceipt || 50,              // last_receipt_tot
        details.historyNoShow || 0,             // last_noshow count
        details.historyCancel || 0              // last_cumcancel count
    ];
};

export const predictNoShow = async (appointmentDetails) => {
    if (!model) await loadModel();
    
    // If model still failed to load, return safe default (0 risk)
    if (!model) return 0;

    const features = encodeFeatures(appointmentDetails);
    const inputTensor = tf.tensor2d([features], [1, 7]);
    
    const prediction = model.predict(inputTensor);
    const riskScore = prediction.dataSync()[0]; // Returns number between 0 and 1
    
    return riskScore; 
};