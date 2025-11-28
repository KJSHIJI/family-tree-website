// script.js
// Family Tree: upload photos, edit names, drag & drop frames, connect lines, persistence

document.addEventListener('DOMContentLoaded', () => {
  const treeContainer = document.querySelector('.tree-container');
  const tree = document.querySelector('.tree');
  const linkLayer = document.getElementById('linkLayer');

  // Build toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  treeContainer.prepend(toolbar);

  // Buttons
  const resetBtn = makeButton('Reset All', onResetAll);
  const addBtn   = makeButton('Add New Member', onAddMember);
  const linkBtn  = makeButton('Link Mode', toggleLinkMode);
  const clearBtn = makeButton('Clear Lines', onClearLines);

  toolbar.append(resetBtn, addBtn, linkBtn, clearBtn);

  // Load existing members (initial ones already in DOM)
  document.querySelectorAll('.member').forEach(initializeMember);

  // Load saved connections and draw
  connections = loadConnections();
  updateAllLines();

  /** ---------------- Drag & Drop ---------------- */
  let drag = { el: null, startX: 0, startY: 0, origLeft: 0, origTop: 0 };

  function startDrag(e, member) {
    // Avoid starting drag when clicking on image (used for upload) or editable name
    const t = e.target;
    if (t.tagName === 'IMG') return;
    if (t.tagName === 'P' && t.isContentEditable) return;

    e.preventDefault();
    drag.el = member;
    drag.el.classList.add('dragging');
    const rect = member.getBoundingClientRect();
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.origLeft = rect.left - tree.getBoundingClientRect().left;
    drag.origTop  = rect.top  - tree.getBoundingClientRect().top;

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    if (!drag.el) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    // Bound within tree area
    const treeRect = tree.getBoundingClientRect();
    const elRect = drag.el.getBoundingClientRect();
    const newLeft = clamp(drag.origLeft + dx, 0, treeRect.width - elRect.width);
    const newTop  = clamp(drag.origTop  + dy, 0, treeRect.height - elRect.height);

    drag.el.style.left = `${newLeft}px`;
    drag.el.style.top  = `${newTop}px`;
    drag.el.style.transform = ''; // disable translate(-50%) from new members

    updateAllLines(); // live update connectors while dragging
  }

  function onDragEnd() {
    if (!drag.el) return;
    drag.el.classList.remove('dragging');

    // Persist position
    const id = drag.el.id;
    const left = parseFloat(drag.el.style.left || 0);
    const top  = parseFloat(drag.el.style.top  || 0);
    savePosition(id, { left, top });

    drag.el = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  /** ---------------- Upload & Name Edit ---------------- */

  function initializeMember(member) {
    const id = member.id;

    // Position from storage
    const pos = loadPosition(id);
    if (pos) {
      member.style.left = `${pos.left}px`;
      member.style.top  = `${pos.top}px`;
      member.style.transform = ''; // ensure no translate when restoring
    }

    // Hidden file input
    let fileInput = member.querySelector('input[type="file"]');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      member.appendChild(fileInput);
    }

    const imgEl  = member.querySelector('img');
    const nameEl = member.querySelector('p');

    // Load saved state
    loadState(id, imgEl, nameEl);

    // Click-to-upload
    imgEl.style.cursor = 'pointer';
    imgEl.title = 'Click to upload photo';
    imgEl.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        imgEl.src = reader.result;
        savePhoto(id, reader.result);
      };
      reader.readAsDataURL(file);
    });

    // Drag & drop positioning
    member.addEventListener('mousedown', (e) => startDrag(e, member));

    // Inline name edit
    nameEl.style.cursor = 'text';
    nameEl.title = 'Click to edit name';
    nameEl.addEventListener('click', () => {
      nameEl.setAttribute('contenteditable', 'true');
      nameEl.focus();
      selectAllText(nameEl);
    });

    const saveNameHandler = () => {
      nameEl.removeAttribute('contenteditable');
      const cleaned = (nameEl.textContent || '').trim();
      nameEl.textContent = cleaned || 'Name';
      saveName(id, nameEl.textContent);
      updateAllLines();
    };

    nameEl.addEventListener('blur', saveNameHandler);
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveNameHandler();
        nameEl.blur();
      }
    });
  }

  /** ---------------- Add New Member ---------------- */

  function onAddMember() {
    const newId = `member${document.querySelectorAll('.member').length + 1}`;
    const newMember = document.createElement('div');
    newMember.className = 'member';
    newMember.id = newId;

    // Default center-bottom placement
    newMember.style.top  = '500px';
    newMember.style.left = '50%';
    newMember.style.transform = 'translateX(-50%)';

    newMember.innerHTML = `
      <img src="images/placeholder.png" alt=">
    `;
    tree.appendChild(newMember);
    initializeMember(newMember);
  }

  /** ---------------- Link Mode & Connectors ---------------- */

  let linkMode = false;
  let pendingParentId = null;
  let connections = []; // {fromId, toId}

  function toggleLinkMode() {
    linkMode = !linkMode;
    pendingParentId = null;
    linkBtn.classList.toggle('active', linkMode);
    linkBtn.textContent = linkMode ? 'Link Mode (On)' : 'Link Mode';
    toolbar.title = linkMode
      ? 'Link Mode: click a parent, then a child to create a connector'
      : '';
  }

  // Click handler to select parent->child while in link mode
  tree.addEventListener('click', (e) => {
    if (!linkMode) return;
    const member = e.target.closest('.member');
    if (!member) return;

    const id = member.id;
    if (!pendingParentId) {
      pendingParentId = id;
      // Visual hint (optional): brief highlight
      member.style.outline = '2px solid #4a3c2a';
      setTimeout(() => (member.style.outline = ''), 500);
    } else {
      const parentId = pendingParentId;
      const childId = id;
      pendingParentId = null;

      if (parentId === childId) return; // ignore self

      // Add connection and persist
      connections.push({ fromId: parentId, toId: childId });
      saveConnections(connections);
      updateAllLines();
    }
  });

  function onClearLines() {
    if (!connections.length) return;
    if (!confirm('Remove all family connectors?')) return;
    connections = [];
    saveConnections(connections);
    updateAllLines();
  }

  // Draw all connectors on the SVG overlay
  function updateAllLines() {
    // Resize SVG to match tree size
    const rect = tree.getBoundingClientRect();
    linkLayer.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    linkLayer.innerHTML = ''; // clear

    connections.forEach(({ fromId, toId }) => {
      const fromEl = document.getElementById(fromId);
      const toEl   = document.getElementById(toId);
      if (!fromEl || !toEl) return;

      const a = centerBottom(fromEl);
      const b = centerTop(toEl);

      // Curved path (cubic Bezier): from parent bottom to child top
      const dx = (b.x - a.x) / 2;
      const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'link-path');
      linkLayer.appendChild(path);
    });
  }

  // Anchor helpers
  function centerBottom(el) {
    const tr = tree.getBoundingClientRect();
    const r  = el.getBoundingClientRect();
    return { x: r.left - tr.left + r.width / 2, y: r.top - tr.top + r.height };
  }
  function centerTop(el) {
    const tr = tree.getBoundingClientRect();
    const r  = el.getBoundingClientRect();
    return { x: r.left - tr.left + r.width / 2, y: r.top - tr.top };
  }

  /** ---------------- Persistence ---------------- */

  function savePhoto(id, dataUrl) {
    try { localStorage.setItem(`photo:${id}`, dataUrl); } catch (e) { console.warn(e); }
  }
  function saveName(id, name) {
    try { localStorage.setItem(`name:${id}`, name); } catch (e) { console.warn(e); }
  }
  function savePosition(id, pos) {
    try { localStorage.setItem(`pos:${id}`, JSON.stringify(pos)); } catch (e) { console.warn(e); }
  }
  function loadPosition(id) {
    const raw = localStorage.getItem(`pos:${id}`);
    return raw ? JSON.parse(raw) : null;
  }
  function loadState(id, imgEl, nameEl) {
    const savedPhoto = localStorage.getItem(`photo:${id}`);
    const savedName  = localStorage.getItem(`name:${id}`);
    if (savedPhoto) imgEl.src = savedPhoto;
    if (savedName)  nameEl.textContent = savedName;
  }

  function saveConnections(conns) {
    try { localStorage.setItem('connections', JSON.stringify(conns)); } catch (e) { console.warn(e); }
  }
  function loadConnections() {
    const raw = localStorage.getItem('connections');
    return raw ? JSON.parse(raw) : [];
  }

  /** ---------------- Utilities ---------------- */
  function makeButton(text, handler) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
  }
  function onResetAll() {
    if (!confirm('Clear all photos, names, positions, and connectors?')) return;

    // Clear storage
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('photo:') || k.startsWith('name:') || k.startsWith('pos:') || k === 'connections') {
        localStorage.removeItem(k);
      }
    });

    // Reset UI
    document.querySelectorAll('.member').forEach((member) => {
      member.style.left = '';
      member.style.top  = '';
      member.style.transform = '';
      member.querySelector('img').src = 'images/placeholder.png';
      member.querySelector('p').textContent = 'Name';
    });

    connections = [];
    updateAllLines();
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function selectAllText(el) {
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }

  // Keep connectors aligned if window resizes
  window.addEventListener('resize', updateAllLines);
});