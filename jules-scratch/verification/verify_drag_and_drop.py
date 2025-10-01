import os
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.connect_over_cdp("http://localhost:9222")
    context = browser.contexts[0]
    page = context.pages[0]

    # Get the absolute path to the test folder
    test_folder_path = os.path.abspath('test-folder')

    # Call the exposed handleFolderOpen function
    page.evaluate(f"""
        const folderPath = '{test_folder_path}';
        window.electron.openFolder(folderPath).then(result => {{
            window.handleFolderOpen(result);
        }});
    """)

    # Wait for the gallery to be populated
    expect(page.locator('.gallery-item')).to_have_count(2)

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)