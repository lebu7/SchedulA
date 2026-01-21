/* backend/src/services/aiPredictor.js */
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let model = null;

// --- CUSTOM FILE LOADER (FIXED FOR NEW TFJS API) ---
const loadModelFromDisk = async (dirPath) => {
    const modelJsonPath = path.join(dirPath, 'model.json');
    const weightsPath = path.join(dirPath, 'weights.bin');

    // 1. Read files
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    const weightsBuffer = fs.readFileSync(weightsPath);

    // 2. Construct the specific "ModelArtifacts" object strictly
    // The previous error happened because we passed the raw JSON, 
    // but TF now wants these specific keys in one object.
    const modelArtifacts = {
        modelTopology: modelJson.modelTopology,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
        weightSpecs: modelJson.weightsManifest[0].weights, // Extract the weights definition
        weightData: weightsBuffer.buffer // Extract the raw binary data
    };

    // 3. Load using the single-argument signature
    const ioHandler = tf.io.fromMemory(modelArtifacts);

    return await tf.loadLayersModel(ioHandler);
};
// ----------------------------------------------

export const loadModel = async () => {
    if (model) return;
    const modelDir = path.join(__dirname, '../ai-models/no-show-model');
    try {
        model = await loadModelFromDisk(modelDir);
        console.log("✅ AI Model Loaded Successfully");
    } catch (err) {
        console.error("❌ Failed to load AI model:", err);
    }
};

const encodeFeatures = (details) => {
    const TOD_MAP = { 'morning': 0, 'afternoon': 1, 'evening': 2 };
    const DOW_MAP = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6 };
    const CATEGORY_MAP = { 'COLOR': 0, 'STYLE': 1, 'MISC': 2 };

    return [
        TOD_MAP[details.timeOfDay] || 1,        
        DOW_MAP[details.dayOfWeek] || 0,        
        CATEGORY_MAP[details.category] || 1,    
        details.recency || 30,                  
        details.lastReceipt || 50,              
        details.historyNoShow || 0,             
        details.historyCancel || 0              
    ];
};

export const predictNoShow = async (appointmentDetails) => {
    if (!model) await loadModel();
    if (!model) return 0; // Safe default

    const features = encodeFeatures(appointmentDetails);
    
    // Tidy up memory automatically
    return tf.tidy(() => {
        const inputTensor = tf.tensor2d([features], [1, 7]);
        const prediction = model.predict(inputTensor);
        return prediction.dataSync()[0]; // Returns risk score (0 to 1)
    });
};