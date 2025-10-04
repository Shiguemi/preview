document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== Renderer: DOMContentLoaded ===');

  // Listen for Python backend status
  window.electron.onPythonBackendReady(() => {
    console.log('✓ Python backend is ready for EXR conversion!');
  });

  window.electron.onPythonBackendError((error) => {
    console.error('✗ Python backend failed to initialize:', error);
  });

  const selectFolderBtn = document.getElementById('select-folder-btn');
  const gallery = document.getElementById('gallery');
  const hideUnknownBtn = document.getElementById('hide-unknown-btn');
  const recursiveBtn = document.getElementById('recursive-btn');
  const zoomSlider = document.getElementById('zoom-slider');
  const progressFloatBtn = document.getElementById('progress-float-btn');
  const progressText = document.getElementById('progress-text');
  const currentFolder = document.getElementById('current-folder');
  const imageViewer = document.getElementById('image-viewer');
  const fullImage = document.getElementById('full-image');
  const closeBtn = document.querySelector('.close-btn');
  const prevBtn = document.querySelector('.prev-btn');
  const nextBtn = document.querySelector('.next-btn');
  const menuOpenFolderBtn = document.getElementById('menu-open-folder');
  const recentFoldersList = document.getElementById('recent-folders-list');
  const menuExitBtn = document.getElementById('menu-exit');
  const menuShortcutsBtn = document.getElementById('menu-shortcuts');
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const closeShortcutsBtn = document.querySelector('.close-shortcuts-btn');
  const fileMenuItem = document.getElementById('file-menu-item');

  let files = [];
  let imageExtensions = [];
  let currentImageIndex = -1;
  let scale = 1;
  let posX = 0;
  let posY = 0;
  let isDragging = false;
  let startDragX = 0;
  let startDragY = 0;
  let currentFolderPath = null;
  let thumbnailObserver = null;
  let loadedThumbnailsCount = 0;
  let progressHideTimeout = null;

  const DEFAULT_THUMBNAIL_SIZE = 150;
  let thumbnailSize = DEFAULT_THUMBNAIL_SIZE;

  const getImageFiles = () => files.filter(file => imageExtensions.includes(file.name.split('.').pop().toLowerCase()));

  const updateThumbnailSize = () => {
    gallery.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`;
  };

  const resetImageTransform = () => {
    scale = 1;
    posX = 0;
    posY = 0;
    fullImage.style.transform = '';
    fullImage.classList.remove('pannable');
  };

  const openImageViewer = async (index) => {
    const imageFiles = getImageFiles();
    if (index >= 0 && index < imageFiles.length) {
      currentImageIndex = index;
      try {
        const imageData = await window.electron.getImageData(imageFiles[currentImageIndex].path);
        fullImage.src = imageData;
        imageViewer.classList.add('visible');
        resetImageTransform(); // Reset transform when a new image is opened

        // Preload next and previous images
        const nextIndex = (currentImageIndex + 1) % imageFiles.length;
        const prevIndex = (currentImageIndex - 1 + imageFiles.length) % imageFiles.length;
        window.electron.preloadImages([
            imageFiles[nextIndex].path,
            imageFiles[prevIndex].path
        ]);

      } catch (error) {
        console.error('Error loading full image:', error);
        // Optionally, you can display an error message to the user in the UI
      }
    }
  };

  const closeImageViewer = () => {
    imageViewer.classList.remove('visible');
  };

  const showNextImage = () => {
    const imageFiles = getImageFiles();
    const nextIndex = (currentImageIndex + 1) % imageFiles.length;
    openImageViewer(nextIndex);
  };

  const showPrevImage = () => {
    const imageFiles = getImageFiles();
    const prevIndex = (currentImageIndex - 1 + imageFiles.length) % imageFiles.length;
    openImageViewer(prevIndex);
  };

  const gallerySentinel = document.createElement('div');
  gallerySentinel.id = 'gallery-sentinel';
  let scanComplete = false;
  let isRequestingFiles = false;

  const requestMoreFilesIfNeeded = () => {
    if (scanComplete || isRequestingFiles) return;

    const rect = gallerySentinel.getBoundingClientRect();
    const isVisible = rect.top <= (window.innerHeight || document.documentElement.clientHeight);

    if (isVisible) {
      console.log('Sentinel is visible, requesting more files...');
      isRequestingFiles = true;
      window.electron.requestMoreFiles();
    }
  };

  const resetGallery = () => {
    gallery.innerHTML = '';
    files = [];
    scanComplete = false;
    isRequestingFiles = false;
    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
    }
    setupThumbnailObserver();
    gallery.appendChild(gallerySentinel);
  };

  const appendFilesToGallery = (fileBatch, imageFileIndex = 0) => {
    const hideUnknown = hideUnknownBtn.dataset.active === 'true';

    const filesToDisplay = fileBatch.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      const isImage = imageExtensions.includes(extension);
      return !hideUnknown || isImage;
    });

    for (const file of filesToDisplay) {
      const extension = file.name.split('.').pop().toLowerCase();
      const isImage = imageExtensions.includes(extension);

      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.title = file.name;
      item.dataset.filePath = file.path;
      item.dataset.fileUrl = file.url;
      item.dataset.isImage = isImage;

      if (isImage) {
        const currentIndex = imageFileIndex++;
        item.classList.add('placeholder');

        const spinner = document.createElement('i');
        spinner.className = 'bi bi-arrow-clockwise loading-spinner';
        item.appendChild(spinner);

        const img = document.createElement('img');
        item.appendChild(img);

        item.addEventListener('click', () => openImageViewer(currentIndex));
      } else {
        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.textContent = extension.toUpperCase();
        item.appendChild(icon);
      }

      gallery.insertBefore(item, gallerySentinel);
      thumbnailObserver.observe(item);
    }
  };

  const setupThumbnailObserver = () => {
    thumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          thumbnailObserver.unobserve(item);

          const filePath = item.dataset.filePath;
          const fileUrl = item.dataset.fileUrl;
          const isImage = item.dataset.isImage === 'true';

          if (isImage && !item.dataset.loaded) {
            item.dataset.loaded = 'true';
            const img = item.querySelector('img');
            const spinner = item.querySelector('.loading-spinner');

            window.electron.getThumbnail(filePath).then(thumbnailUrl => {
              img.src = thumbnailUrl || fileUrl;
              img.onload = () => {
                if (spinner) spinner.remove();
                img.classList.add('loaded');
                item.classList.remove('placeholder');
              };
            }).catch(error => {
              console.error(`Error getting thumbnail for ${filePath}:`, error);
              img.src = fileUrl;
              img.onload = () => {
                if (spinner) spinner.remove();
                img.classList.add('loaded');
                item.classList.remove('placeholder');
              };
            });
          }
        }
      });
    }, { rootMargin: '300px' });
  };

  // IPC Listeners for asynchronous folder scanning
  window.electron.onFolderOpened((data) => {
    resetGallery();
    imageExtensions = data.imageExtensions || [];
    currentFolderPath = data.folderPath;
    currentFolder.textContent = data.folderPath.split(/[\\/]/).pop();
    updateThumbnailSize();
    requestMoreFilesIfNeeded();
  });

  window.electron.onFolderScanUpdate((fileBatch) => {
    isRequestingFiles = false;
    const imageFileCountBeforeBatch = getImageFiles().length;
    files.push(...fileBatch);
    appendFilesToGallery(fileBatch, imageFileCountBeforeBatch);
    requestMoreFilesIfNeeded();
  });

  window.electron.onFolderScanComplete(() => {
    console.log('Folder scan complete.');
    isRequestingFiles = false;
    scanComplete = true;
  });

  window.electron.onFolderScanError((error) => {
    console.error('File scan error in main process:', error);
    isRequestingFiles = false;
    scanComplete = true;
  });

  window.addEventListener('resize', requestMoreFilesIfNeeded);
  document.addEventListener('scroll', requestMoreFilesIfNeeded, { passive: true });


  selectFolderBtn.addEventListener('click', () => {
    const recursive = recursiveBtn.dataset.active === 'true';
    window.electron.selectFolder(recursive);
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const filePath = droppedFiles[0].path;
      if (filePath) {
        const recursive = recursiveBtn.dataset.active === 'true';
        window.electron.openFolder(filePath, recursive);
      }
    }
  });

  const renderGallery = () => {
    gallery.innerHTML = ''; // Clear the gallery
    gallery.appendChild(gallerySentinel);
    appendFilesToGallery(files);
  };

  hideUnknownBtn.addEventListener('click', () => {
    const isActive = hideUnknownBtn.dataset.active === 'true';
    hideUnknownBtn.dataset.active = !isActive;
    hideUnknownBtn.classList.toggle('active');

    // Update icon
    const icon = hideUnknownBtn.querySelector('i');
    if (!isActive) {
      icon.className = 'bi bi-eye-slash-fill';
      hideUnknownBtn.title = 'Hide unknown file types';
    } else {
      icon.className = 'bi bi-eye-fill';
      hideUnknownBtn.title = 'Show all file types';
    }

    renderGallery();
  });

  recursiveBtn.addEventListener('click', async () => {
    const isActive = recursiveBtn.dataset.active === 'true';
    recursiveBtn.dataset.active = !isActive;
    recursiveBtn.classList.toggle('active');

    // Update icon and tooltip
    const icon = recursiveBtn.querySelector('i');
    if (!isActive) {
      icon.className = 'bi bi-arrow-repeat';
      recursiveBtn.title = 'Disable recursive folder scanning';
    } else {
      icon.className = 'bi bi-arrow-repeat';
      recursiveBtn.title = 'Enable recursive folder scanning';
    }

    // Reload folder if one is already loaded
    if (currentFolderPath) {
      const recursive = recursiveBtn.dataset.active === 'true';
      window.electron.openFolder(currentFolderPath, recursive);
    }
  });

  closeBtn.addEventListener('click', closeImageViewer);
  prevBtn.addEventListener('click', showPrevImage);
  nextBtn.addEventListener('click', showNextImage);

  window.addEventListener('keydown', (e) => {
    if (imageViewer.classList.contains('visible')) {
      if (e.key === 'ArrowRight') {
        showNextImage();
      } else if (e.key === 'ArrowLeft') {
        showPrevImage();
      } else if (e.key === 'Escape') {
        closeImageViewer();
      } else if (e.key === '0') {
        resetImageTransform();
      }
    } else {
      if (e.key === '0') {
        thumbnailSize = DEFAULT_THUMBNAIL_SIZE;
        updateThumbnailSize();
      }
    }
  });

  imageViewer.addEventListener('wheel', (e) => {
    e.preventDefault();

    const rect = imageViewer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(1, scale + wheel * zoomFactor);

    if (newScale === 1) {
      resetImageTransform();
      return;
    }

    // Adjust position to keep the point under the cursor stationary
    const imageRect = fullImage.getBoundingClientRect();
    // The transformations are applied to the top-left corner of the image.
    // To calculate the new position, we need to find the cursor's position relative to the image's top-left corner (including previous translations),
    // then scale this relative position by the zoom factor, and add it to the current position.
    const relativeMouseX = (e.clientX - imageRect.left);
    const relativeMouseY = (e.clientY - imageRect.top);

    const newPosX = posX - (relativeMouseX * (newScale - scale)) / scale;
    const newPosY = posY - (relativeMouseY * (newScale - scale)) / scale;

    posX = newPosX;
    posY = newPosY;
    scale = newScale;

    fullImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    fullImage.classList.add('pannable');
  });

  fullImage.addEventListener('mousedown', (e) => {
    if (scale > 1) {
      e.preventDefault();
      isDragging = true;
      startDragX = e.clientX - posX;
      startDragY = e.clientY - posY;
      fullImage.classList.add('panning');
    }
  });

  imageViewer.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      posX = e.clientX - startDragX;
      posY = e.clientY - startDragY;
      fullImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    }
  });

  imageViewer.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      fullImage.classList.remove('panning');
    }
  });

  imageViewer.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      fullImage.classList.remove('panning');
    }
  });


  zoomSlider.addEventListener('input', (e) => {
    thumbnailSize = parseInt(e.target.value, 10);
    updateThumbnailSize();
  });

  // Recent folders menu functionality
  const updateRecentFoldersMenu = async () => {
    const recentFolders = await window.electron.getRecentFolders();
    recentFoldersList.innerHTML = '';

    if (recentFolders.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'menu-option disabled';
      emptyItem.textContent = 'No recent folders';
      recentFoldersList.appendChild(emptyItem);
    } else {
      recentFolders.forEach(folderPath => {
        const item = document.createElement('div');
        item.className = 'menu-option recent-folder-item';

        const icon = document.createElement('i');
        icon.className = 'bi bi-folder';

        const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
        const span = document.createElement('span');
        span.textContent = folderName;
        span.title = folderPath;

        item.appendChild(icon);
        item.appendChild(span);

        item.addEventListener('click', async () => {
          // Hide the menu immediately
          fileMenuItem.classList.add('force-hide-menu');
          setTimeout(() => {
            fileMenuItem.classList.remove('force-hide-menu');
          }, 100);

          const recursive = recursiveBtn.dataset.active === 'true';
          window.electron.openFolder(folderPath, recursive);
        });

        recentFoldersList.appendChild(item);
      });
    }
  };

  // Menu open folder button
  menuOpenFolderBtn.addEventListener('click', async () => {
    const recursive = recursiveBtn.dataset.active === 'true';
    window.electron.selectFolder(recursive);
  });

  // Menu exit button
  menuExitBtn.addEventListener('click', () => {
    window.electron.quitApp();
  });

  // Menu shortcuts button
  menuShortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.add('visible');
  });

  // Close shortcuts modal
  closeShortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.remove('visible');
  });

  // Close shortcuts modal when clicking outside
  shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) {
      shortcutsModal.classList.remove('visible');
    }
  });

  // Keyboard shortcut: Ctrl+Q to quit
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
      e.preventDefault();
      window.electron.quitApp();
    }
  });

  // Listen for recent folders updates
  window.electron.onRecentFoldersUpdated((folders) => {
    updateRecentFoldersMenu();
  });

  // Load initial recent folders
  updateRecentFoldersMenu();
});