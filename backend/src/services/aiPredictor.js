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

    // Check if model exists before crashing
    if (!fs.existsSync(modelJsonPath) || !fs.existsSync(weightsPath)) {
        throw new Error(`Model files not found at ${dirPath}. Did you run 'npm run train'?`);
    }

    // 1. Read files
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    const weightsBuffer = fs.readFileSync(weightsPath);

    // 2. Construct the specific "ModelArtifacts" object
    // We convert buffer to Uint8Array first to ensure we get the exact bytes
    // (Node Buffers can sometimes point to a larger shared memory pool)
    const weightData = new Uint8Array(weightsBuffer).buffer;

    const modelArtifacts = {
        modelTopology: modelJson.modelTopology,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
        weightSpecs: modelJson.weightsManifest[0].weights,
        weightData: weightData 
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
        console.error("❌ Failed to load AI model:", err.message);
    }
};

const encodeFeatures = (details) => {
    const TOD_MAP = { 'morning': 0, 'afternoon': 1, 'evening': 2 };
    const DOW_MAP = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6 };
    
    // 🧠 IMPROVED MAP: Handles case sensitivity and variations
    const mapCategory = (catString) => {
        if (!catString) return 2; // Default to Barbershop/Misc
        const lowerCat = catString.toLowerCase();
        
        // 0 = COLOR/SALON (High Value, Long Duration)
        if (lowerCat.includes('salon') || lowerCat.includes('color') || lowerCat.includes('braid')) return 0;
        
        // 1 = STYLE/SPA (Medium Value)
        if (lowerCat.includes('spa') || lowerCat.includes('style') || lowerCat.includes('nail') || lowerCat.includes('massage')) return 1;
        
        // 2 = MISC/BARBERSHOP (Quick, Walk-in)
        return 2; 
    };

    // 1. Normalize Inputs
    const timeOfDay = (details.timeOfDay || 'afternoon').toLowerCase();
    
    // 2. Map Categorical Data (With Safe Defaults)
    const feat_tod = TOD_MAP[timeOfDay] ?? 1;
    const feat_dow = DOW_MAP[details.dayOfWeek] ?? 0;
    const feat_cat = mapCategory(details.category);

    // 3. Normalize Numerical Data (Prevent Strings/Nulls/NaN)
    const recency = parseFloat(details.recency) || 30; // Default 30 days if new client
    const lastReceipt = parseFloat(details.lastReceipt) || 50; // Default 50 KES if no history
    const histNoShow = parseFloat(details.historyNoShow) || 0;
    const histCancel = parseFloat(details.historyCancel) || 0;

    return [
        feat_tod,       // book_tod
        feat_dow,       // book_dow
        feat_cat,       // book_category
        recency,        // recency
        lastReceipt,    // last_receipt_tot
        histNoShow,     // last_noshow count
        histCancel      // last_cumcancel count
    ];
};

export const predictNoShow = async (appointmentDetails) => {
    try {
        if (!model) await loadModel();
        if (!model) return 0; // Fail safe

        const features = encodeFeatures(appointmentDetails);
        
        // Run prediction in tidy block to free memory immediately
        const riskScore = tf.tidy(() => {
            const inputTensor = tf.tensor2d([features], [1, 7]);
            const prediction = model.predict(inputTensor);
            return prediction.dataSync()[0]; // Returns risk score (0 to 1)
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