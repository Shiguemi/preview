import os
from playwright.sync_api import sync_playwright, expect

def verify_drag_and_drop():
    with sync_playwright() as p:
        # Launch the Electron application
        electron_app = p.electron.launch(args=['main.js'])

        # Wait for the first window to open
        page = electron_app.first_window()

        # Check that the gallery is initially empty
        gallery_initial = page.locator('#gallery .gallery-item')
        expect(gallery_initial).to_have_count(0)

        # Get the absolute path to the test-folder
        test_folder_path = os.path.abspath('test-folder')

        # Use evaluate to call the openFolder function directly
        # We need to pass the path as an argument to the evaluate function
        page.evaluate("path => window.electron.openFolder(path)", test_folder_path)

        # Wait for the gallery to be updated
        gallery_updated = page.locator('#gallery .gallery-item')
        expect(gallery_updated).to_have_count(2) # There are two images in test-folder

        # Take a screenshot to visually verify the result
        page.screenshot(path='jules-scratch/verification/verification.png')

        # Close the application
        electron_app.close()

if __name__ == '__main__':
    verify_drag_and_drop()