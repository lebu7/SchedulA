/* backend/scripts/train-model.js */
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. CONFIGURATION
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_PATH = path.join(__dirname, '../data/hair_salon_no_show_wrangled_df.csv');
const MODEL_DIR = path.join(__dirname, '../src/ai-models/no-show-model');

const CATEGORY_MAP = { 'COLOR': 0, 'STYLE': 1, 'MISC': 2 };
const TOD_MAP = { 'morning': 0, 'afternoon': 1, 'evening': 2 };
const DOW_MAP = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6 };

const data = [];

// --- CUSTOM FILE SAVER FOR NODE 24 (Pure JS) ---
const saveModelToDisk = async (model, dirPath) => {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    
    // We use a simpler strategy: Get the artifacts and write them manually
    const artifacts = await model.save(tf.io.withSaveHandler(async (artifacts) => {
        return artifacts; // Just return them to the caller
    }));

    // 1. Save Weights
    const weightData = Buffer.from(artifacts.weightData);
    const weightFileName = 'weights.bin';
    fs.writeFileSync(path.join(dirPath, weightFileName), weightData);

    // 2. Prepare JSON structure
    // Ensure weightsManifest exists
    if (!artifacts.weightSpecs) artifacts.weightSpecs = [];
    
    const weightsManifest = [{
        paths: ['./' + weightFileName],
        weights: artifacts.weightSpecs
    }];

    const modelJson = {
        modelTopology: artifacts.modelTopology,
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
        weightsManifest: weightsManifest 
    };

    // 3. Save JSON
    fs.writeFileSync(path.join(dirPath, 'model.json'), JSON.stringify(modelJson, null, 2));
    console.log(`Model saved successfully to ${dirPath}`);
};
// ----------------------------------------------

console.log('Loading dataset from:', CSV_PATH);
if (!fs.existsSync(CSV_PATH)) {
    console.error(`ERROR: File not found at ${CSV_PATH}`);
    process.exit(1);
}

fs.createReadStream(CSV_PATH)
  .pipe(csv())
  .on('data', (row) => {
    const book_tod = TOD_MAP[row.book_tod] || 1; 
    const book_dow = DOW_MAP[row.book_dow] || 0;
    const book_category = CATEGORY_MAP[row.book_category] || 1;
    const recency = parseFloat(row.recency) || 0;
    const last_receipt_tot = parseFloat(row.last_receipt_tot) || 0;
    const last_noshow = parseFloat(row.last_noshow) || 0;
    const last_cancel = parseFloat(row.last_cumcancel) || 0; 
    const noshow = parseInt(row.noshow) || 0;

    data.push({
      features: [book_tod, book_dow, book_category, recency, last_receipt_tot, last_noshow, last_cancel],
      label: noshow
    });
  })
  .on('end', async () => {
    console.log(`Data loaded: ${data.length} rows.`);
    await trainModel(data);
  });

async function trainModel(dataset) {
  const inputs = dataset.map(d => d.features);
  const labels = dataset.map(d => d.label);
  
  const inputTensor = tf.tensor2d(inputs, [inputs.length, 7]);
  const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

  const model = tf.sequential();
  
  model.add(tf.layers.dense({ inputShape: [7], units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 12, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });

  console.log('Training started...');
  await model.fit(inputTensor, labelTensor, {
    epochs: 20,
    batchSize: 32,
    shuffle: true,
    validationSplit: 0.2,
    callbacks: {
        onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch + 1}: Loss=${logs.loss.toFixed(4)} Acc=${logs.acc.toFixed(4)}`)
    }
  });

  console.log('Training complete. Saving model...');
  
  // Use corrected saver
  await saveModelToDisk(model, MODEL_DIR);
  
  inputTensor.dispose();
  labelTensor.dispose();
}