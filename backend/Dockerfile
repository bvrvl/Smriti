# FINAL, DEFINITIVE DOCKERFILE using the optimal Gemma 3 QAT model

# Use a standard Python 3.11 image
FROM python:3.11-slim

# Install system tools needed to build the language model library from source
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    git-lfs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# --- Dependency Installation ---
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# ---
# CRITICAL STEP: Install Experimental Gemma 3 Support
# ---
# This command uses the correct GGML_NATIVE flag to succeed.
RUN pip install "git+https://github.com/kossum/llama-cpp-python.git@main" \
    --no-cache-dir --force-reinstall --upgrade \
    --config-settings="cmake.args=-DGGML_NATIVE=OFF"

# --- Model & Data Download ---
# THE FOLLOWING LAYERS WILL REMAIN CACHED
RUN pip install huggingface-hub
ARG HF_TOKEN
RUN mkdir -p /models && mkdir -p /tmp_models
RUN hf auth login --token $HF_TOKEN && \
    hf download bartowski/google_gemma-3-4b-it-qat-GGUF \
    --include="google_gemma-3-4b-it-qat-Q4_K_M.gguf" \
    --local-dir /tmp_models
RUN mv /tmp_models/google_gemma-3-4b-it-qat-Q4_K_M.gguf /models/gemma-3b-it.gguf
RUN rm -rf /tmp_models

# ---
# FINAL, CACHE-FRIENDLY FIX
# ---
# We forcefully reinstall the correct numpy version AFTER the heavy model download.
# This fixes the binary incompatibility with Scipy without invalidating the cache.
RUN pip install --no-cache-dir --force-reinstall numpy==1.26.4

# Download the other NLP models for spaCy and NLTK
RUN python -m spacy download en_core_web_sm
COPY ./nltk_data /root/nltk_data

# --- Application Code ---
COPY . .

# Finally, define the command to run your application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]