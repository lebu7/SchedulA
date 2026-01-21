/* backend/src/services/aiPredictor.js */
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let model = null;

// --- CUSTOM FILE LOADER (ROBUST VERSION) ---
const loadModelFromDisk = async (dirPath) => {
    const modelJsonPath = path.join(dirPath, 'model.json');
    const weightsPath = path.join(dirPath, 'weights.bin');

    if (!fs.existsSync(modelJsonPath) || !fs.existsSync(weightsPath)) {
        throw new Error(`Model files not found at ${dirPath}`);
    }

    // 1. Read files
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    const weightsBuffer = fs.readFileSync(weightsPath);

    // 2. Convert Buffer to ArrayBuffer (Required for TFJS in Node)
    const weightData = new Uint8Array(weightsBuffer).buffer;

    const modelArtifacts = {
        modelTopology: modelJson.modelTopology,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
        weightSpecs: modelJson.weightsManifest[0].weights,
        weightData: weightData 
    };

    return await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
};

export const loadModel = async () => {
    if (model) return;
    const modelDir = path.join(__dirname, '../ai-models/no-show-model');
    try {
        model = await loadModelFromDisk(modelDir);
        console.log("✅ AI Model Loaded Successfully");
    } catch (err) {
        console.error("❌ Failed to load AI model:", err.message);
    }
};

const encodeFeatures = (details) => {
    const TOD_MAP = { 'morning': 0, 'afternoon': 1, 'evening': 2 };
    const DOW_MAP = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6 };
    const CATEGORY_MAP = { 'COLOR': 0, 'STYLE': 1, 'MISC': 2 };

    const timeOfDay = (details.timeOfDay || 'afternoon').toLowerCase();
    const category = (details.category || 'MISC').toUpperCase(); 
    
    const feat_tod = TOD_MAP[timeOfDay] ?? 1;
    const feat_dow = DOW_MAP[details.dayOfWeek] ?? 0;
    
    let feat_cat = CATEGORY_MAP[category];
    if (feat_cat === undefined) {
        if (category.includes('COLOR') || category.includes('HIGHLIGHT')) feat_cat = 0;
        else if (category.includes('CUT') || category.includes('STYLE')) feat_cat = 1;
        else feat_cat = 2; 
    }

    const recency = parseFloat(details.recency) || 30;
    const lastReceipt = parseFloat(details.lastReceipt) || 50;
    const histNoShow = parseFloat(details.historyNoShow) || 0;
    const histCancel = parseFloat(details.historyCancel) || 0;

    return [
        feat_tod,       
        feat_dow,       
        feat_cat,       
        recency,        
        lastReceipt,    
        histNoShow,     
        histCancel      
    ];
};

export const predictNoShow = async (appointmentDetails) => {
    try {
        if (!model) await loadModel();
        if (!model) return 0; // Fail safe

        const features = encodeFeatures(appointmentDetails);
        
        // Run prediction in tidy block
        const riskScore = tf.tidy(() => {
            const inputTensor = tf.tensor2d([features], [1, 7]);
            const prediction = model.predict(inputTensor);
            return prediction.dataSync()[0];
        });

        // 🛡️ Safety Check: Ensure result is a valid number
        if (isNaN(riskScore) || riskScore === undefined) {
            console.warn("⚠️ AI returned NaN. Defaulting to 0.");
            return 0;
        }

        return riskScore;

    } catch (error) {
        console.error("❌ Prediction Error:", error);
        return 0; // Return Low Risk on crash so booking continues
    }
};