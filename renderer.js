document.addEventListener('DOMContentLoaded', () => {
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const gallery = document.getElementById('gallery');

  selectFolderBtn.addEventListener('click', async () => {
    const result = await window.electron.selectFolder();
    if (!result) {
      return;
    }

    const { files } = result;
    gallery.innerHTML = '';

    files.forEach(file => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const extension = file.name.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'exr'].includes(extension)) {
        const img = document.createElement('img');
        window.electron.getThumbnail(file.path).then(thumbnailUrl => {
          if (thumbnailUrl) {
            img.src = thumbnailUrl;
          } else {
            // Fallback to the original file URL if no thumbnail is available
            img.src = file.url;
          }
        }).catch(error => {
            console.error('Error getting thumbnail:', error);
            // Fallback in case of an unexpected error
            img.src = file.url;
        });
        item.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.textContent = extension.toUpperCase();
        item.appendChild(icon);
      }

      const label = document.createElement('p');
      label.textContent = file.name;
      item.appendChild(label);

      gallery.appendChild(item);
    });
  });
});