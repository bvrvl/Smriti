import os
import re
import random
from datetime import datetime
from PIL import Image
import pytesseract
from pdf2image import convert_from_path

# --- Configuration ---
PDF_FILENAME = 'anne-frank-diary.pdf'
OUTPUT_FOLDER = '../anne_frank_diary_entries'

POPPLER_PATH = None 

def extract_text_from_pdf(pdf_path):
    """
    Converts a PDF to images and uses OCR to extract all text.
    """
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found at '{pdf_path}'")
        print("Please download it and place it in the same folder as the script.")
        return ""

    print("Converting PDF pages to images... (This may take a few minutes)")
    try:
        images = convert_from_path(pdf_path, poppler_path=POPPLER_PATH)
    except Exception as e:
        print(f"Error converting PDF. Is Poppler installed and in your PATH? Details: {e}")
        return ""

    full_text = ""
    total_pages = len(images)
    print(f"Starting OCR on {total_pages} pages...")

    for i, image in enumerate(images):
        text = pytesseract.image_to_string(image)
        full_text += text + "\n"
        print(f"  - Processed page {i + 1} of {total_pages}")
        
    return full_text

def create_markdown_files(text, output_folder):
    """
    Splits the text into entries and saves each as a formatted Markdown file.
    """
    if not text.strip():
        print("No text was extracted. Cannot create diary entries.")
        return

    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        
    date_pattern = r"^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY), (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d{1,2}, \d{4}"

    current_entry_lines = []
    current_date_str = None

    for line in text.splitlines():
        match = re.match(date_pattern, line.strip())
        if match:
            # If we find a new date, save the previous entry
            if current_date_str and current_entry_lines:
                save_entry(current_date_str, "\n".join(current_entry_lines), output_folder)
            
            # Start a new entry
            current_date_str = match.group(0)
            current_entry_lines = [line.strip()]
        elif current_date_str:
            # Continue adding lines to the current entry
            current_entry_lines.append(line)
            
    # Save the very last entry in the file
    if current_date_str and current_entry_lines:
        save_entry(current_date_str, "\n".join(current_entry_lines), output_folder)

    print(f"\nSuccess! All entries have been saved in the '{output_folder}' folder.")

def save_entry(date_str, content, output_folder):
    """
    Formats and saves a single diary entry to a file.
    """
    try:
        date_obj = datetime.strptime(date_str.strip(), '%A, %B %d, %Y')
    except ValueError:
        print(f"Skipping entry with unparsable date: {date_str}")
        return

    # Format filename: mon-dd-yyyy.md
    filename = date_obj.strftime("%b-%d-%Y").lower() + ".md"
    filepath = os.path.join(output_folder, filename)

    # Generate random time
    rand_hour = random.randint(1, 12)
    rand_minute = random.randint(0, 59)
    am_pm = random.choice(["AM", "PM"])
    time_str = f"{rand_hour}:{rand_minute:02d} {am_pm}"

    # Write the formatted content to the markdown file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(f"Created: {date_obj.strftime('%B %d, %Y')} {time_str}\n\n")
        f.write(content.strip())

if __name__ == "__main__":
    combined_text = extract_text_from_pdf(PDF_FILENAME)
    create_markdown_files(combined_text, OUTPUT_FOLDER)