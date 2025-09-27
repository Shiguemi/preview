document.addEventListener('DOMContentLoaded', () => {
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const gallery = document.getElementById('gallery');
  const hideUnknownCheckbox = document.getElementById('hide-unknown-checkbox');

  let files = [];
  let imageExtensions = [];

  const renderGallery = () => {
    gallery.innerHTML = '';
    const hideUnknown = hideUnknownCheckbox.checked;

    files.forEach(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      const isImage = imageExtensions.includes(extension);

      if (hideUnknown && !isImage) {
        return;
      }

      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.title = file.name;

      if (isImage) {
        const img = document.createElement('img');
        window.electron.getThumbnail(file.path).then(thumbnailUrl => {
          if (thumbnailUrl) {
            img.src = thumbnailUrl;
          } else {
            img.src = file.url;
          }
        }).catch(error => {
            console.error('Error getting thumbnail:', error);
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
  };

  selectFolderBtn.addEventListener('click', async () => {
    const result = await window.electron.selectFolder();
    if (result && result.files) {
      files = result.files;
      imageExtensions = result.imageExtensions || [];
      renderGallery();
    }
  });

  hideUnknownCheckbox.addEventListener('change', renderGallery);
});