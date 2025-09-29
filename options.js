document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";

  // --- Element Selectors ---
  const addBookmarkForm = document.getElementById('add-bookmark-form');
  const bookmarkTitleInput = document.getElementById('bookmark-title');
  const bookmarkUrlInput = document.getElementById('bookmark-url');
  const bookmarkCategorySelect = document.getElementById('bookmark-category-select');
  const bookmarksManagementList = document.getElementById('bookmarks-management-list');

  const addCategoryForm = document.getElementById('add-category-form');
  const categoryNameInput = document.getElementById('category-name');
  const categoriesManagementList = document.getElementById('categories-management-list');

  const fontColorForm = document.getElementById('font-color-form');
  const fontColorPicker = document.getElementById('font-color-picker');

  // --- State ---
  let dashboardFolderId = null;

  // --- Helper Functions ---

  /**
   * Finds or creates the main folder for the extension's bookmarks.
   * @returns {Promise<BookmarkTreeNode>} A promise that resolves with the folder node.
   */
  function getDashboardFolder() {
    return new Promise((resolve, reject) => {
      // The Bookmarks Bar is always folder '1'. We get its sub-tree to find our dashboard folder.
      chrome.bookmarks.getSubTree('1', (results) => {
        if (chrome.runtime.lastError || !results || results.length === 0) {
          return reject("Could not access the Bookmarks Bar: " + (chrome.runtime.lastError?.message || 'Unknown error'));
        }

        const bookmarksBarNode = results[0];
        const appFolder = bookmarksBarNode.children.find(node => node.title === DASHBOARD_FOLDER_NAME);

        if (appFolder) {
          dashboardFolderId = appFolder.id;
          resolve(appFolder);
        } else {
          // If it doesn't exist, create it inside the Bookmarks Bar.
          chrome.bookmarks.create({ parentId: '1', title: DASHBOARD_FOLDER_NAME }, newFolder => {
            dashboardFolderId = newFolder.id;
            resolve(newFolder);
          });
        }
      });
    });
  }

  // --- Main Functions ---

  async function loadAll() {
    await loadCategories();
    loadBookmarks();
    loadColorSettings();
  }

  // --- Category Functions ---

  async function loadCategories() {
    categoriesManagementList.innerHTML = '';
    bookmarkCategorySelect.innerHTML = '';

    try {
      const appFolder = await getDashboardFolder();

      // Add "No Category" option, which points to the root dashboard folder
      const defaultOption = document.createElement('option');
      defaultOption.value = appFolder.id;
      defaultOption.textContent = "No Category";
      bookmarkCategorySelect.appendChild(defaultOption);

      // Add each sub-folder as a category option
      (appFolder.children || []).filter(child => !child.url).forEach(addCategoryOption);

    } catch (error) {
      console.error("Error loading categories:", error);
    }
  }

  function addCategoryOption(categoryNode) {
      // Add to select dropdown
      const option = document.createElement('option');
      option.value = categoryNode.id;
      option.textContent = categoryNode.title;
      bookmarkCategorySelect.appendChild(option);

      // Add to management list
      const categoryItem = document.createElement('div');
      categoryItem.className = 'category-item';
      categoryItem.innerHTML = `
        <span>${categoryNode.title}</span>
        <div class="item-actions">
          <button class="delete-btn" data-id="${categoryNode.id}">Delete</button>
        </div>
      `;
      categoriesManagementList.appendChild(categoryItem);
  }

  addCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoryName = categoryNameInput.value.trim();
    if (!categoryName) return;

    try {
      const appFolder = await getDashboardFolder();
      chrome.bookmarks.create({ parentId: appFolder.id, title: categoryName }, () => {
          categoryNameInput.value = '';
          loadCategories(); // Reload to show the new category
      });
    } catch (error) {
      console.error("Could not create category:", error);
    }
  });

  categoriesManagementList.addEventListener('click', e => {
    if (e.target.classList.contains('delete-btn')) {
      const categoryId = e.target.dataset.id;
      if (confirm('Are you sure you want to delete this category and all its bookmarks?')) {
        chrome.bookmarks.removeTree(categoryId, () => {
          loadAll();
        });
      }
    }
  });

  // --- Bookmark Functions ---

  let editingBookmarkId = null; // To track which bookmark is being edited

  async function loadBookmarks() {
    bookmarksManagementList.innerHTML = '';
    try {
        const appFolder = await getDashboardFolder();
        processNodeForManagement(appFolder);
    } catch(error) {
        console.error("Could not load bookmarks:", error);
    }
  }

  function processNodeForManagement(node) {
    // If it's a bookmark, add it to the list
    if (node.url) {
      const bookmarkItem = document.createElement('div');
      bookmarkItem.className = 'bookmark-item';
      bookmarkItem.innerHTML = `
        <span>${node.title} - <em>${node.url}</em></span>
        <div class="item-actions">
          <button class="edit-btn" data-id="${node.id}">Edit</button>
          <button class="delete-btn" data-id="${node.id}">Delete</button>
        </div>
      `;
      bookmarksManagementList.appendChild(bookmarkItem);
    }
    // If it's a folder, recurse through its children
    if (node.children) {
      node.children.forEach(processNodeForManagement);
    }
  }

  addBookmarkForm.addEventListener('submit', e => {
    e.preventDefault();
    const title = bookmarkTitleInput.value.trim();
    const url = bookmarkUrlInput.value.trim();
    const categoryId = bookmarkCategorySelect.value;
    if (!title || !url) return;

    if (editingBookmarkId) {
      // Update existing bookmark
      chrome.bookmarks.update(editingBookmarkId, {
        title: title,
        url: url
      }, (updatedBookmark) => {
        // Move bookmark if category was changed
        if (updatedBookmark.parentId !== categoryId) {
          chrome.bookmarks.move(updatedBookmark.id, { parentId: categoryId }, () => {
             loadBookmarks(); // Reload after moving
          });
        } else {
            loadBookmarks(); // Reload if no move was needed
        }
        // Reset form state
        addBookmarkForm.reset();
        addBookmarkForm.querySelector('button').textContent = "Add Bookmark";
        editingBookmarkId = null;
      });
    } else {
      // Create new bookmark
      chrome.bookmarks.create({
        parentId: categoryId,
        title: title,
        url: url
      }, () => {
        addBookmarkForm.reset();
        loadBookmarks();
      });
    }
  });

  bookmarksManagementList.addEventListener('click', e => {
    const target = e.target;
    const bookmarkId = target.dataset.id;

    if (target.classList.contains('delete-btn')) {
      chrome.bookmarks.remove(bookmarkId, () => {
        loadBookmarks();
      });
    } else if (target.classList.contains('edit-btn')) {
      chrome.bookmarks.get(bookmarkId, (bookmarks) => {
        if (bookmarks && bookmarks.length > 0) {
          const bookmark = bookmarks[0];
          editingBookmarkId = bookmark.id;
          bookmarkTitleInput.value = bookmark.title;
          bookmarkUrlInput.value = bookmark.url;
          bookmarkCategorySelect.value = bookmark.parentId;

          addBookmarkForm.querySelector('button').textContent = "Save Changes";
          bookmarkTitleInput.focus();
          addBookmarkForm.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  });

  // --- Color Settings Functions ---
  const colorSettingsForm = document.getElementById('color-settings-form');
  const sectionTitleColorPicker = document.getElementById('section-title-color-picker');
  const categoryTitleColorPicker = document.getElementById('category-title-color-picker');
  const fontSizePicker = document.getElementById('font-size-picker');
  const sectionTitleSizePicker = document.getElementById('section-title-size-picker');
  const categoryTitleSizePicker = document.getElementById('category-title-size-picker');
  const resetStylesBtn = document.getElementById('reset-styles-btn');

  const defaultStyles = {
      fontColor: '#f8f8f2',
      sectionTitleColor: '#50fa7b',
      categoryTitleColor: '#bd93f9',
      fontSize: '16',
      sectionTitleSize: '16',
      categoryTitleSize: '16'
  };

  function loadColorSettings() {
      chrome.storage.sync.get(defaultStyles, data => {
          fontColorPicker.value = data.fontColor;
          sectionTitleColorPicker.value = data.sectionTitleColor;
          categoryTitleColorPicker.value = data.categoryTitleColor;
          fontSizePicker.value = data.fontSize;
          sectionTitleSizePicker.value = data.sectionTitleSize;
          categoryTitleSizePicker.value = data.categoryTitleSize;
      });
  }

  colorSettingsForm.addEventListener('submit', e => {
      e.preventDefault();
      const styles = {
        fontColor: fontColorPicker.value,
        sectionTitleColor: sectionTitleColorPicker.value,
        categoryTitleColor: categoryTitleColorPicker.value,
        fontSize: fontSizePicker.value,
        sectionTitleSize: sectionTitleSizePicker.value,
        categoryTitleSize: categoryTitleSizePicker.value
      };
      chrome.storage.sync.set(styles, () => {
          alert('Style settings saved!');
      });
  });

  resetStylesBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset all style settings to their defaults?")) {
        chrome.storage.sync.set(defaultStyles, () => {
            loadColorSettings();
            alert("Styles have been reset to default.");
        });
    }
  });

  // --- Import Functions ---
  const importBookmarksBtn = document.getElementById('import-bookmarks-btn');

  /**
   * Recursively imports bookmarks from a source node to a destination parent folder.
   * @param {BookmarkTreeNode} sourceNode The node to import from.
   * @param {string} destinationParentId The ID of the folder to import into.
   */
  async function importBookmarksRecursive(sourceNode, destinationParentId) {
    // If it's a folder with children, create it and recurse
    if (sourceNode.children) {
      // Don't re-import the main dashboard folder itself
      if (sourceNode.title === DASHBOARD_FOLDER_NAME) {
        return;
      }

      const newFolder = await new Promise(resolve => {
        chrome.bookmarks.create({ parentId: destinationParentId, title: sourceNode.title || "Untitled Folder" }, resolve);
      });

      for (const child of sourceNode.children) {
        await importBookmarksRecursive(child, newFolder.id);
      }
    }
    // If it's a bookmark, create it
    else if (sourceNode.url) {
      await new Promise(resolve => {
        chrome.bookmarks.create({ parentId: destinationParentId, title: sourceNode.title, url: sourceNode.url }, resolve);
      });
    }
  }

  importBookmarksBtn.addEventListener('click', async () => {
    if (confirm("This will import all bookmarks from your Bookmarks Bar into the dashboard. This may create duplicates if you've already added some. Continue?")) {
      try {
        importBookmarksBtn.textContent = "Importing...";
        importBookmarksBtn.disabled = true;

        const appFolder = await getDashboardFolder();
        const bookmarksBarTree = await new Promise(resolve => chrome.bookmarks.getSubTree('1', resolve));

        for (const node of bookmarksBarTree[0].children) {
            await importBookmarksRecursive(node, appFolder.id);
        }

        alert("Import complete!");
        loadAll(); // Reload everything to show the new data
      } catch (error) {
        console.error("Bookmark import failed:", error);
        alert("Bookmark import failed. See the console for details.");
      } finally {
        importBookmarksBtn.textContent = "Import Now";
        importBookmarksBtn.disabled = false;
      }
    }
  });


  // --- Reset Functions ---
  const clearBookmarksBtn = document.getElementById('clear-bookmarks-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');

  /**
   * Finds the dashboard folder and removes all its children (bookmarks and sub-folders).
   */
  async function clearDashboardBookmarks() {
    if (confirm("Are you sure you want to delete all bookmarks and categories from the dashboard? This cannot be undone.")) {
      try {
        const appFolder = await getDashboardFolder();
        if (appFolder.children) {
          for (const child of appFolder.children) {
            await new Promise(resolve => chrome.bookmarks.removeTree(child.id, resolve));
          }
        }
        alert("Dashboard bookmarks cleared.");
        loadAll(); // Refresh the lists
      } catch (error) {
        console.error("Failed to clear bookmarks:", error);
        alert("Failed to clear bookmarks. See console for details.");
      }
    }
  }

  /**
   * Clears all extension data, including bookmarks and settings.
   */
  async function resetAllSettings() {
    if (confirm("DANGER: This will delete all dashboard bookmarks, categories, and reset all settings (colors, pinned items). Are you absolutely sure?")) {
      await clearDashboardBookmarks();
      chrome.storage.sync.clear(() => console.log("Sync storage cleared."));
      chrome.storage.local.clear(() => console.log("Local storage cleared."));
      alert("Extension has been reset to default state.");
      // Reload to apply default settings visually
      loadAll();
    }
  }

  clearBookmarksBtn.addEventListener('click', clearDashboardBookmarks);
  resetAllBtn.addEventListener('click', resetAllSettings);

  // --- Initial Load ---
  loadAll();
});