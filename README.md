# Smriti: The Entire History of You
*A local-first, privacy-focused journal intelligence tool.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Status: WIP](https://img.shields.io/badge/status-work_in_progress-orange.svg)](https://github.com/bvrvl/Smriti)

---

### Current Status

**Smriti is in active early development.**  
The codebase is evolving rapidly. Features may break, change, or disappear. This is not yet ready for general use — but you're welcome to explore or contribute.

---

Smriti is a personal data analytics project — built out of a desire to explore, analyze, and visualize over **500 digital journal entries** written between **August 2021 and July 2025**.  
It’s an ongoing experiment in self-reflection, data analysis, and pushing the limits of personal insight through software.

---
Smriti will always be local, private, and smart in handling sensitive data.

*   **Zero Persistence:** No data is ever saved to your disk by the application. The database exists only in the container's temporary memory and is **completely destroyed** when you shut down the app.

*   **No Cloud:** No data is ever sent to the cloud. All processing happens locally.

## Using Gemma Models

To use Gemma models, you must have a Hugging Face account and an access token because Google’s license requires user consent.

Steps to set up:
	1.	Visit the [Gemma 3 4B IT model](https://huggingface.co/google/gemma-3-4b-it) page.
	2.	Accept the Terms and Conditions and sign the consent form.
	3.	Generate a Hugging Face access token:
	•	Go to Settings → Access Tokens.
	•	Set the token permission to Read (this is sufficient for Smriti).
	•	See Hugging Face Docs for details.
	4.	In your project root, create a .env file and add:
    ```env
    HF_TOKEN=<your-access-token>
    ```
## ⚠️ Important Note on Gemma 3 Support

This project uses Google's new **Gemma 3** language model, which is on the cutting edge. As of July 2025, official support for this model has **not** been merged into the main `llama-cpp-python` library.

To make this project work, we are using a special, un-merged Pull Request from a community contributor.

### How It Works

1.  **Experimental Code:** Instead of installing `llama-cpp-python` from the official registry, the `backend/Dockerfile` pulls the code directly from a specific branch on GitHub that contains the necessary changes. This is the key line:
    ```dockerfile
    # Install the experimental gemma3 support directly from the developer's PR branch
    RUN pip install "git+https://github.com/kossum/llama-cpp-python.git@gemma3-fix" \
        --no-cache-dir --force-reinstall --upgrade
    ```

2.  **Custom Chat Handler:** The Python code in `backend/main.py` has been modified to use a special `Gemma3ChatHandler` class, which is provided by the experimental code.

### What This Means For You

*   **It Works!** This setup successfully runs the Gemma 3 model.
*   **Potential for Change:** Since we are relying on an un-merged Pull Request, this code could change or break in the future. If the official library is updated, this project will need to be updated to use the new, official method.
*   **Credit:** All credit for the Gemma 3 implementation goes to GitHub user **kossum** and the other contributors in [Pull Request #1989](https://github.com/abetlen/llama-cpp-python/pull/1989).

Contributions, ideas, and feedback are always welcome.  
If you find a bug or have a feature request, feel free to open an issue or submit a pull request.

---

### License

This project is licensed under the MIT License.  
See the [LICENSE](LICENSE.md) file for more details.