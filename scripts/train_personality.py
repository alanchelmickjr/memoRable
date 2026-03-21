
import os
import argparse
import logging
from pymongo import MongoClient
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer
from datasets import Dataset
import torch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
DB_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "memorable")
MODEL_ID = "google/gemma-2-9b-it"
OUTPUT_DIR = "trained_models/chloe_personality"

def get_hume_data():
    """Fetch training data from MongoDB."""
    client = MongoClient(DB_URI)
    db = client[DB_NAME]
    collection = db["training_data"]
    
    # Flatten the data
    data_points = []
    # We expect documents with a 'data' array field
    cursor = collection.find({})
    
    for doc in cursor:
        if "data" in doc and isinstance(doc["data"], list):
            for entry in doc["data"]:
                # Extract relevant fields
                # entry structure based on customModelService.js:
                # { labels: [...], data: { language: "text", prosody: ..., expressions: ... } }
                
                user_text = entry.get("data", {}).get("language", "")
                emotions = entry.get("labels", [])
                
                # We need a target response. 
                # Ideally, this comes from a "Golden Set" or user feedback.
                # For now, we might need to skip if no target is present, 
                # or use a placeholder if we are just testing the pipeline.
                
                # TODO: Retrieve the Assistant's response associated with this interaction.
                # Currently customModelService only seems to store the USER's input for Hume training.
                # We need to link this back to the chat logs.
                
                if user_text:
                    data_points.append({
                        "user_input": user_text,
                        "emotions": ", ".join(emotions),
                        # "target_response": "..." # We need this!
                    })
    
    client.close()
    return data_points

def format_instruction(sample):
    """Format data into a prompt for the model."""
    # System prompt to bake in the personality
    system_prompt = (
        "You are Chloe, a social robot. You are observant, empathetic, but concise. "
        "Do not be overly chatty. Respond directly to the user's intent and emotional state."
    )
    
    emotion_context = f"[User Emotion: {sample['emotions']}]" if sample['emotions'] else ""
    
    # We need a target response for SFT. 
    # Since we don't have it yet, we'll mock it for the script structure.
    target_response = sample.get("target_response", "I understand.") 
    
    prompt = f"<start_of_turn>user\n{system_prompt}\n\n{emotion_context} {sample['user_input']}<end_of_turn>\n<start_of_turn>model\n{target_response}<end_of_turn>"
    
    return {"text": prompt}

def train():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=2e-4)
    args = parser.parse_args()

    # 1. Load Data
    raw_data = get_hume_data()
    if not raw_data:
        logger.warning("No data found in MongoDB. Creating dummy data for test.")
        raw_data = [
            {"user_input": "I had a long day.", "emotions": "Tired", "target_response": "I hear you. Rest is important."},
            {"user_input": "Look at this!", "emotions": "Excitement", "target_response": "Wow, that is cool!"},
        ]

    dataset = Dataset.from_list(raw_data)
    dataset = dataset.map(format_instruction)
    
    logger.info(f"Training on {len(dataset)} samples")

    # 2. Load Model (Int4)
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        use_cache=False
    )
    
    model = prepare_model_for_kbit_training(model)
    
    # 3. LoRA Config
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=['k_proj', 'q_proj', 'v_proj', 'o_proj', "gate_proj", "down_proj", "up_proj"]
    )
    
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    tokenizer.pad_token = tokenizer.eos_token

    # 4. Train
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        max_steps=100, # Short run for demo
        learning_rate=args.lr,
        fp16=True,
        logging_steps=1,
        save_strategy="epoch",
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=512,
        tokenizer=tokenizer,
        args=training_args,
    )

    trainer.train()
    
    # 5. Save
    trainer.save_model(OUTPUT_DIR)
    logger.info(f"Model saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    train()
