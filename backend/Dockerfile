# Use the official Python 3.11 slim image as a base.
FROM python:3.11-slim

# Install system-level dependencies required for building C++ extensions,
# specifically for compiling llama-cpp-python from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    git-lfs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory for the application.
WORKDIR /app

# --- Dependency Installation ---

# Copy and install the Python requirements first to leverage Docker's build cache.
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Install the experimental llama-cpp-python fork with Gemma 3 support.
# The --config-settings flag is critical to pass the GGML_NATIVE=OFF argument,
# which disables hardware-specific optimizations and prevents build failures on
# ARM/Apple Silicon architectures.
RUN pip install "git+https://github.com/kossum/llama-cpp-python.git@main" \
    --no-cache-dir --force-reinstall --upgrade \
    --config-settings="cmake.args=-DGGML_NATIVE=OFF"

# --- Model & Data Download ---

# Install huggingface-hub to download the model from the Hub.
RUN pip install huggingface-hub

# ARG allows the HF_TOKEN to be passed in securely from docker-compose at build time.
ARG HF_TOKEN

# Create separate temporary and final model directories.
# This protects the download cache in the subsequent step.
RUN mkdir -p /models && mkdir -p /tmp_models

# Download the Gemma 3 GGUF model file into a temporary directory.
# This expensive step is cached. If any subsequent steps fail, this layer
# will not be re-run, saving significant time and bandwidth.
RUN hf auth login --token $HF_TOKEN && \
    hf download bartowski/google_gemma-3-4b-it-qat-GGUF \
    --include="google_gemma-3-4b-it-qat-Q4_K_M.gguf" \
    --local-dir /tmp_models

# Move the model to its final destination.
RUN mv /tmp_models/google_gemma-3-4b-it-qat-Q4_K_M.gguf /models/gemma-3b-it.gguf

# Clean up the temporary directory.
RUN rm -rf /tmp_models

# Force-reinstall a specific numpy version. This is a crucial compatibility fix.
# It runs after llama-cpp-python is installed to ensure that its build-time
# numpy dependency is overwritten with the version required by Scipy at runtime.
RUN pip install --no-cache-dir --force-reinstall numpy==1.26.4

# Download and copy pre-packaged data for other NLP libraries.
RUN python -m spacy download en_core_web_sm
COPY ./nltk_data /root/nltk_data

# --- Application Setup ---

# Copy the rest of the application source code into the container.
COPY . .

# Define the command to run the FastAPI application using uvicorn.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]