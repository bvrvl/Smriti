FROM python:3.11-slim

# Install OS dependencies for C++ compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy our pre-downloaded NLTK data into the default user's home directory.
# This is the first place NLTK looks by default. Refactor later or keep as is.
COPY ./nltk_data /root/nltk_data

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install spaCy model
RUN python -m spacy download en_core_web_sm

# Copy the rest of the application code
COPY . .

# Tell Docker what command to run
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]