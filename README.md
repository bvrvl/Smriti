# Smriti: The Entire History of You

*An intimate, local-first, and privacy-focused intelligence tool to visualize and explore the entire history of your personal journal entries.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Status: WIP](https://img.shields.io/badge/status-work_in_progress-orange.svg)](https://github.com/bvrvl/Smriti)

---

### **Current Status**

**⚠️Smriti is in active early development.**
  
The codebase is evolving rapidly. **Features may break, change, or disappear**. This is not yet ready for general use—but you're welcome to explore or contribute.

---

Smriti is a personal data analytics project born from a desire to explore, analyze, and visualize over 500 digital journal entries written between August 2021 and July 2025. It’s an ongoing experiment in self-reflection and pushing the limits of personal insight through software.

Smriti's stance on privacy is simple: **your data is yours.** Smriti will always be local, private, and smart in its handling of your most sensitive information.

-   **Local First:** All models, data, and processing happen on your machine. Nothing is ever sent to the cloud.
-   **Zero Persistence:** The application database exists only in temporary memory while the app is running. It is **completely destroyed** when you shut it down, ensuring your journal data is never permanently stored by the app.

---

## Core Features

Smriti transforms your journal from a static archive into a dynamic, interactive digital twin of your own history.

-   **Generative Q&A ("Ask Your Journal Anything"):** Engage in a conversation with your digital self. Ask complex, open-ended questions like *"What have I learned about friendship over the years?"* and receive a natural, synthesized answer grounded in your own writing. *Note: Generating an answer can take a couple of minutes on typical hardware, but the detailed, reflective response is worth the wait!*

-   **Semantic Search ("Search by Feeling, Not Keyword"):** Go beyond simple keyword matching. Find entries based on the underlying meaning or feeling. Search for *"times I felt hopeful about the future"* and get truly relevant results.

-   **Connection Engine:** Discover the hidden relationships between the people, places, and organizations in your life. A Venn diagram visualization reveals how often entities are mentioned together, helping you uncover patterns you never knew existed.

-   **Sentiment Analysis:** Track your emotional landscape over time. A yearly heatmap provides a bird's-eye view of your mood, while interactive charts break down your average sentiment by month, day of the week, or even hour of the day.

-   **Automated Topic & Entity Discovery:** Smriti automatically reads all your entries and identifies recurring topics, as well as the key `People`, `Places`, and `Organizations` that populate your world.

---

## Tech Stack

Smriti is built with a modern, local-first AI stack.

-   **Backend:** **FastAPI** (Python) with **SQLAlchemy**.
-   **Frontend:** **React** (TypeScript) with **Vite**.
-   **Containerization:** **Docker** and **Docker-Compose** for a one-command setup.
-   **LLM Engine:** **`llama-cpp-python`** running a quantized version of **Google's Gemma 3 4B-IT** model locally.
-   **NLP & Vector Embeddings:** **Sentence-Transformers**, **spaCy**, **NLTK**, and **Gensim**.

---

## Getting Started

**Prerequisites:** You must have **Docker** and **Docker-Compose** installed on your system.

### 1. Set Up Your Hugging Face Token

To download the language model, you must have a Hugging Face account and agree to the Gemma license terms.

1.  Visit the [original Gemma 3 4B IT model page](https://huggingface.co/google/gemma-3-4b-it).
2.  Accept the Terms and Conditions to get access. You only need to do this once.
3.  Generate a Hugging Face Access Token. A token with `Read` permissions is sufficient.
4.  In the root of this project, create a file named `.env` and add your token:
    ```env
    HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```
    *Note: Smriti downloads a pre-quantized GGUF version of the model for efficiency, but you still need to accept the license on the original model page.*

### 2. Add Your Journal Data

Place your journal entries as `.txt` or `.md` files inside the `data/` directory. The application will attempt to parse the creation date from metadata (e.g., `Created: Month Day, Year H:M AM/PM`) or from the filename (e.g., `YYYY-MM-DD.md`).

### 3. Build and Run the Application

With Docker running, open your terminal in the project root and run:

```bash
docker-compose up --build
```

- The first build will take a significant amount of time as it needs to download the ~3GB language model and build the C++ extensions for it. Subsequent builds will be much faster.
- Once the build is complete, you can access the Smriti frontend at http://localhost:5173.

---

## Roadmap & Future Vision
Smriti is being developed with an ambitious goal: to provide the deepest possible personal insight. Here are some of the next-generation features being explored:


- Uncovering Internal Contradictions: Automatically identify and highlight moments of cognitive dissonance or conflicting thoughts across your entire journal history. This could help illuminate areas for personal growth by showing where your thoughts or feelings have been at odds over time.

- Mapping Core Beliefs & Values: Move beyond analyzing what you wrote to understanding why you wrote it. This feature aims to identify persistent, underlying belief systems and value patterns that implicitly guide your actions and reflections, even if never stated directly.


These features represent complex and exciting challenges in applied NLP. If you're interested in tackling them, your contributions are welcome!

---

## Important Note on Gemma 3 Support & Credits

This project relies on the work of the open-source community.

- Gemma 3 Model: This project uses a quantized GGUF version of Gemma 3 provided by [@bartowski](https://huggingface.co/bartowski) on Hugging Face. This makes it possible to run the model efficiently on consumer hardware.

- LLM Backend: As of July 2025, official support for Gemma 3 has not been merged into the main llama-cpp-python library. This project uses an experimental fork from GitHub user [@kossum](https://github.com/kossum) to enable Gemma 3 functionality.

- The backend/Dockerfile is configured to pull these specific dependencies. This means the project's core Q&A feature is dependent on this community-provided code and may change as official support is released.

---

## Contributing

Contributions, ideas, and feedback are always welcome. If you find a bug or have a feature request, feel free to open an issue or submit a pull request.

> *Led and developed by [@bvrvl](https://github.com/bvrvl) as part of [**Kritim Labs**](https://github.com/kritim-labs), an independent creative technology studio.*


## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.md) file for more details.