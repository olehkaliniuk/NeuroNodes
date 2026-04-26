// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

const wrap   = document.getElementById('canvas-wrap');
const canvas = document.getElementById('canvas');
const svg    = document.getElementById('svg-layer');

const kSelect     = document.getElementById('k-select');
const lengthInput = document.getElementById('length-input');

let nodes     = [];
let nodeCount = 0;

let selectedIds = new Set();
let interactionMode = 'select';

let scale = 1;
let posX  = 0;
let posY  = 0;

let maxDist = parseInt(lengthInput.value) || 500;

// ============================================================
//  УТИЛИТЫ: ID
// ============================================================

function makeId() { return 'n' + (++nodeCount); }

// ============================================================
//  УТИЛИТЫ: КООРДИНАТЫ
// ============================================================

function nodeCenter(node) {
  const el = node.el;
  return {
    x: parseFloat(el.style.left) + el.offsetWidth  / 2,
    y: parseFloat(el.style.top)  + el.offsetHeight / 2,
  };
}

function dist(a, b) {
  const ca = nodeCenter(a), cb = nodeCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

function edgePoint(node, target) {
  const el = node.el;
  const x  = parseFloat(el.style.left);
  const y  = parseFloat(el.style.top);
  const w  = el.offsetWidth;
  const h  = el.offsetHeight;
  const cx = x + w / 2, cy = y + h / 2;
  const dx = target.x - cx, dy = target.y - cy;
  const scaleX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(scaleX, scaleY);
  return { x: cx + dx * s, y: cy + dy * s };
}

function screenToCanvas(sx, sy) {
  const r = wrap.getBoundingClientRect();
  return {
    x: (sx - r.left - posX) / scale,
    y: (sy - r.top  - posY) / scale,
  };
}

// ============================================================
//  ПРОВЕРКА ПЕРЕСЕЧЕНИЙ
// ============================================================

function lineIntersectsRect(p1, p2, rect) {
  const { left, top, right, bottom } = rect;
  const edges = [
    [{ x: left,  y: top    }, { x: right, y: top    }],
    [{ x: right, y: top    }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: left,  y: bottom }],
    [{ x: left,  y: bottom }, { x: left,  y: top    }],
  ];
  function ccw(A, B, C) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }
  function seg(A, B, C, D) {
    return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
  }
  for (const [A, B] of edges) { if (seg(p1, p2, A, B)) return true; }
  return false;
}

function isBlockedLine(a, b) {
  const ca = nodeCenter(a), cb = nodeCenter(b);
  for (const n of nodes) {
    if (n.id === a.id || n.id === b.id) continue;
    const el = n.el;
    const rect = {
      left:   parseFloat(el.style.left),
      top:    parseFloat(el.style.top),
      right:  parseFloat(el.style.left) + el.offsetWidth,
      bottom: parseFloat(el.style.top)  + el.offsetHeight,
    };
    if (lineIntersectsRect(ca, cb, rect)) return true;
  }
  return false;
}

// ============================================================
//  РИСОВАНИЕ ЛИНИЙ
// ============================================================

function drawLines() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Все ноды выполнены?
  const allDone = nodes.length > 0 && nodes.every(n => n.isDone.checked);

  // Обновляем классы нодов
  nodes.forEach(n => {
    n.el.classList.toggle('all-done', allDone);
  });

  if (nodes.length < 2) return;

  const k = parseInt(kSelect.value);
  const edges = new Set();

  nodes.forEach(node => {
    const others = nodes
      .filter(n => n.id !== node.id)
      .map(n => ({ n, d: dist(node, n) }))
      .filter(o => o.d <= maxDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);

    others.forEach(({ n }) => {
      if (isBlockedLine(node, n)) return;
      edges.add([node.id, n.id].sort().join('-'));
    });
  });

  let pathIdx = 0;

  edges.forEach(key => {
    const [idA, idB] = key.split('-');
    const a = getNode(idA), b = getNode(idB);
    if (!a || !b) return;

    const active = a.isDone.checked && b.isDone.checked;
    const ca = nodeCenter(a), cb = nodeCenter(b);
    const e1 = edgePoint(a, cb);
    const e2 = edgePoint(b, ca);

    if (allDone) {
      // Все выполнены — зелёная линия
      const track = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      track.setAttribute('x1', e1.x); track.setAttribute('y1', e1.y);
      track.setAttribute('x2', e2.x); track.setAttribute('y2', e2.y);
      track.setAttribute('stroke', 'rgba(16,185,129,0.35)');
      track.setAttribute('stroke-width', '1.5');
      svg.appendChild(track);

      const pid = 'ep' + (pathIdx++);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('id', pid);
      path.setAttribute('d', `M${e1.x},${e1.y} L${e2.x},${e2.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'none');
      svg.appendChild(path);

      const lineLen = Math.hypot(e2.x - e1.x, e2.y - e1.y);
      const dur = Math.min(2.5, Math.max(0.6, lineLen / 120));

      for (let i = 0; i < 3; i++) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '2.5');
        dot.setAttribute('fill', '#10b981');
        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        anim.setAttribute('dur', dur + 's');
        anim.setAttribute('repeatCount', 'indefinite');
        anim.setAttribute('begin', (-dur * i / 3) + 's');
        const mpath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
        mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + pid);
        anim.appendChild(mpath);
        dot.appendChild(anim);
        svg.appendChild(dot);
      }

      [e1, e2].forEach(p => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
        c.setAttribute('r', 3);
        c.setAttribute('fill', '#059669');
        svg.appendChild(c);
      });

    } else if (active) {
      const track = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      track.setAttribute('x1', e1.x); track.setAttribute('y1', e1.y);
      track.setAttribute('x2', e2.x); track.setAttribute('y2', e2.y);
      track.setAttribute('stroke', 'rgba(139,92,246,0.25)');
      track.setAttribute('stroke-width', '1.5');
      svg.appendChild(track);

      const pid = 'ep' + (pathIdx++);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('id', pid);
      path.setAttribute('d', `M${e1.x},${e1.y} L${e2.x},${e2.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'none');
      svg.appendChild(path);

      const lineLen = Math.hypot(e2.x - e1.x, e2.y - e1.y);
      const dur = Math.min(2.5, Math.max(0.6, lineLen / 120));

      for (let i = 0; i < 3; i++) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '2.5');
        dot.setAttribute('fill', '#a855f7');
        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        anim.setAttribute('dur', dur + 's');
        anim.setAttribute('repeatCount', 'indefinite');
        anim.setAttribute('begin', (-dur * i / 3) + 's');
        const mpath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
        mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + pid);
        anim.appendChild(mpath);
        dot.appendChild(anim);
        svg.appendChild(dot);
      }

      [e1, e2].forEach(p => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
        c.setAttribute('r', 3);
        c.setAttribute('fill', '#7c3aed');
        svg.appendChild(c);
      });

    } else {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', e1.x); line.setAttribute('y1', e1.y);
      line.setAttribute('x2', e2.x); line.setAttribute('y2', e2.y);
      line.setAttribute('stroke', 'rgba(255,255,255,0.6)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      [e1, e2].forEach(p => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
        c.setAttribute('r', 2.5);
        c.setAttribute('fill', 'rgba(255,255,255,0.75)');
        svg.appendChild(c);
      });
    }
  });
}

// ============================================================
//  УПРАВЛЕНИЕ ВЫДЕЛЕНИЕМ
// ============================================================

function getNode(id) { return nodes.find(n => n.id === id); }

function refreshSelection() {
  nodes.forEach(n => {
    if (selectedIds.has(n.id)) {
      n.el.classList.add('selected');
    } else {
      n.el.classList.remove('selected');
    }
  });
}

function selectNode(id, additive) {
  if (additive) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
  } else {
    selectedIds.clear();
    selectedIds.add(id);
  }
  refreshSelection();
}

function clearSelection() {
  selectedIds.clear();
  refreshSelection();
}

// ============================================================
//  ПРОГРЕСС-БАР
// ============================================================

function updateProgress() {
  const total = nodes.length;
  const done  = nodes.filter(n => n.isDone.checked).length;
  const pct   = total === 0 ? 0 : (done / total) * 100;

  const fill  = document.getElementById('progress-bar-fill');
  const label = document.getElementById('progress-label');

  fill.style.width = pct + '%';
  label.textContent = done + ' / ' + total;

  fill.classList.toggle('empty', total === 0 || pct === 0);
  fill.classList.toggle('full',  total > 0 && done === total);
}

// ============================================================
//  СОЗДАНИЕ / УДАЛЕНИЕ УЗЛОВ
// ============================================================

let draggingNode    = null;
let groupDragStarts = null;
let dragStartCanvas = { x: 0, y: 0 };

function deleteNode(id) {
  const n = getNode(id);
  if (n) n.el.remove();
  nodes = nodes.filter(x => x.id !== id);
  selectedIds.delete(id);
  drawLines();
  updateProgress();
  scheduleSave();
}

function createNode(x, y, text, done) {
  const id = makeId();
  const el = document.createElement('div');
  el.className = 'node-box';
  el.id = id;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';

  const ta = document.createElement('textarea');
  ta.className   = 'node-textarea';
  ta.rows        = 2;
  ta.value       = text || '';
  ta.addEventListener('mousedown', e => {
    if (document.activeElement === ta) e.stopPropagation();
  });
  ta.addEventListener('dblclick', e => { e.stopPropagation(); ta.focus(); });
  ta.addEventListener('input', () => { autoResize(ta); scheduleSave(); });

  const divider = document.createElement('div');
  divider.className = 'node-divider';

  const footer = document.createElement('div');
  footer.className = 'node-footer';

  const checkWrap = document.createElement('label');
  checkWrap.className = 'node-check-wrap';
  checkWrap.title = 'Выполнено';

  const isDone = document.createElement('input');
  isDone.type      = 'checkbox';
  isDone.className = 'node-done';
  if (done) isDone.checked = true;

  const checkBox = document.createElement('span');
  checkBox.className = 'node-check-box';
  checkBox.innerHTML = `<svg viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 3.5L4 6.5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  checkWrap.appendChild(isDone);
  checkWrap.appendChild(checkBox);

  checkWrap.addEventListener('mousedown', e => e.stopPropagation());
  isDone.addEventListener('change', () => {
    el.classList.toggle('node-done-active', isDone.checked);
    drawLines();
    updateProgress();
    scheduleSave();
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'node-del-btn';
  delBtn.title = 'Удалить узел';
  delBtn.innerHTML = `<svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  delBtn.addEventListener('mousedown', e => e.stopPropagation());
  delBtn.addEventListener('click', e => { e.stopPropagation(); deleteNode(id); });

  footer.appendChild(checkWrap);
  footer.appendChild(delBtn);

  el.appendChild(ta);
  el.appendChild(divider);
  el.appendChild(footer);

  el.addEventListener('mousedown', e => {
    if (e.target === ta && document.activeElement === ta) return;
    if (e.target.closest('.node-footer')) return;
    e.preventDefault();
    e.stopPropagation();

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    if (!selectedIds.has(id)) {
      selectNode(id, additive);
    } else if (additive) {
      selectedIds.delete(id);
      refreshSelection();
      return;
    }

    if (document.activeElement === ta) ta.blur();

    const cp = screenToCanvas(e.clientX, e.clientY);
    dragStartCanvas = cp;

    groupDragStarts = {};
    selectedIds.forEach(sid => {
      const sn = getNode(sid);
      if (sn) {
        groupDragStarts[sid] = {
          x: parseFloat(sn.el.style.left),
          y: parseFloat(sn.el.style.top),
        };
      }
    });

    draggingNode = id;
  });

  // Применяем done-active если восстанавливаем из сохранения
  if (done) el.classList.add('node-done-active');

  canvas.appendChild(el);
  autoResize(ta);

  const node = { id, el, ta, isDone };
  nodes.push(node);
  selectNode(id, false);
  drawLines();
  updateProgress();
  return node;
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(32, ta.scrollHeight) + 'px';
  drawLines();
}

// ============================================================
//  ВЫДЕЛЕНИЕ РАМКОЙ
// ============================================================

let isSelecting = false;
let selStart    = { x: 0, y: 0 };
let selBox      = null;

function createSelBox() {
  selBox = document.createElement('div');
  selBox.className = 'sel-box';
  wrap.appendChild(selBox);
}

function removeSelBox() {
  if (selBox) { selBox.remove(); selBox = null; }
}

function updateSelBox(x1, y1, x2, y2) {
  if (!selBox) return;
  const r = wrap.getBoundingClientRect();
  const lx1 = x1 - r.left, ly1 = y1 - r.top;
  const lx2 = x2 - r.left, ly2 = y2 - r.top;
  selBox.style.left   = Math.min(lx1, lx2) + 'px';
  selBox.style.top    = Math.min(ly1, ly2) + 'px';
  selBox.style.width  = Math.abs(lx2 - lx1) + 'px';
  selBox.style.height = Math.abs(ly2 - ly1) + 'px';
}

function selectInRect(x1, y1, x2, y2, additive) {
  const left   = Math.min(x1, x2);
  const top    = Math.min(y1, y2);
  const right  = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  if (!additive) selectedIds.clear();

  nodes.forEach(n => {
    const c = nodeCenter(n);
    const sx = c.x * scale + posX;
    const sy = c.y * scale + posY;
    const wrapRect = wrap.getBoundingClientRect();
    const screenX = sx + wrapRect.left;
    const screenY = sy + wrapRect.top;

    if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) {
      selectedIds.add(n.id);
    }
  });

  refreshSelection();
}

// ============================================================
//  ТРАНСФОРМАЦИЯ ХОЛСТА
// ============================================================

function updateTransform() {
  canvas.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
}

wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const direction = e.deltaY > 0 ? -1 : 1;
  const newScale  = Math.min(Math.max(0.02, scale + direction * 0.1 * scale), 3);
  const wrapRect  = wrap.getBoundingClientRect();
  const mouseX    = e.clientX - wrapRect.left;
  const mouseY    = e.clientY - wrapRect.top;
  posX = mouseX - (mouseX - posX) * (newScale / scale);
  posY = mouseY - (mouseY - posY) * (newScale / scale);
  scale = newScale;
  updateTransform();
}, { passive: false });

// ============================================================
//  MOUSE EVENTS
// ============================================================

let isDraggingCanvas = false;
let canvasDragStart  = { x: 0, y: 0 };

wrap.addEventListener('mousedown', e => {
  if (e.target.closest('.node-box')) return;

  const additive = e.shiftKey || e.ctrlKey || e.metaKey;

  if (e.button === 1 || e.button === 2) {
    isDraggingCanvas  = true;
    canvasDragStart.x = e.clientX - posX;
    canvasDragStart.y = e.clientY - posY;
    wrap.style.cursor = 'grabbing';
    return;
  }

  if (interactionMode === 'pan') {
    isDraggingCanvas  = true;
    canvasDragStart.x = e.clientX - posX;
    canvasDragStart.y = e.clientY - posY;
    wrap.style.cursor = 'grabbing';
    return;
  }

  isSelecting = true;
  selStart    = { x: e.clientX, y: e.clientY };
  createSelBox();
  updateSelBox(e.clientX, e.clientY, e.clientX, e.clientY);

  if (!additive) clearSelection();
});

document.addEventListener('mousemove', e => {
  if (draggingNode && groupDragStarts) {
    const cp = screenToCanvas(e.clientX, e.clientY);
    const dx = cp.x - dragStartCanvas.x;
    const dy = cp.y - dragStartCanvas.y;

    selectedIds.forEach(sid => {
      const sn = getNode(sid);
      const start = groupDragStarts[sid];
      if (sn && start) {
        sn.el.style.left = (start.x + dx) + 'px';
        sn.el.style.top  = (start.y + dy) + 'px';
      }
    });
    drawLines();
    return;
  }

  if (isSelecting) {
    updateSelBox(selStart.x, selStart.y, e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    selectInRect(selStart.x, selStart.y, e.clientX, e.clientY, additive);
    return;
  }

  if (isDraggingCanvas) {
    posX = e.clientX - canvasDragStart.x;
    posY = e.clientY - canvasDragStart.y;
    updateTransform();
  }
});

document.addEventListener('mouseup', e => {
  if (draggingNode) scheduleSave(); // сохраняем после перетаскивания

  let selectionHappenedNow = false;
  if (isSelecting) {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    selectInRect(selStart.x, selStart.y, e.clientX, e.clientY, additive);
    removeSelBox();
    isSelecting = false;
    selectionHappenedNow = true;
  }

  draggingNode     = null;
  groupDragStarts  = null;
  isDraggingCanvas = false;
  wrap.style.cursor = interactionMode === 'pan' ? 'grab' : 'crosshair';

  if (selectionHappenedNow) {
    wrap._skipNextClick = true;
  }
});

wrap.addEventListener('click', e => {
  if (e.target.closest('.node-box')) return;
  if (wrap._skipNextClick) { wrap._skipNextClick = false; return; }
  clearSelection();
});

wrap.addEventListener('dblclick', e => {
  if (e.target.closest('.node-box')) return;
  const cp = screenToCanvas(e.clientX, e.clientY);
  createNode(cp.x - 50, cp.y - 25);
  scheduleSave();
});

let pinchStartDist  = 0;
let pinchStartScale = 1;

function getTouchDist(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

wrap.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    pinchStartDist  = getTouchDist(e.touches);
    pinchStartScale = scale;
  }
}, { passive: true });

wrap.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    scale = Math.min(Math.max(0.02, pinchStartScale * (getTouchDist(e.touches) / pinchStartDist)), 3);
    updateTransform();
  }
}, { passive: false });

// ============================================================
//  КНОПКИ ПАНЕЛИ
// ============================================================

document.getElementById('btn-add').addEventListener('click', () => {
  const offset = nodes.length * 30;
  createNode(40 + (offset % 300), 40 + Math.floor(offset / 300) * 100);
  scheduleSave();
});

const btnMode = document.getElementById('btn-mode');
function setMode(mode) {
  interactionMode = mode;
  if (mode === 'pan') {
    btnMode.innerHTML = '<i class="fa-solid fa-hand"></i> Pan';
    btnMode.classList.add('mode-active');
    wrap.style.cursor = 'grab';
  } else {
    btnMode.innerHTML = '<i class="fa-solid fa-object-group"></i> Select';
    btnMode.classList.remove('mode-active');
    wrap.style.cursor = 'crosshair';
  }
}
btnMode.addEventListener('click', () => {
  setMode(interactionMode === 'select' ? 'pan' : 'select');
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'TEXTAREA' && interactionMode === 'select') {
    setMode('pan');
  }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'TEXTAREA') {
    setMode('select');
  }
});

document.getElementById('btn-del').addEventListener('click', () => {
  const toDelete = [...selectedIds];
  toDelete.forEach(id => deleteNode(id));
});

document.getElementById('btn-clear').addEventListener('click', () => {
  nodes.forEach(n => n.el.remove());
  nodes = [];
  selectedIds.clear();
  drawLines();
  updateProgress();
  scheduleSave();
});

document.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'TEXTAREA') {
    const toDelete = [...selectedIds];
    toDelete.forEach(id => deleteNode(id));
  }
});

kSelect.addEventListener('change', drawLines);
lengthInput.addEventListener('change', () => {
  maxDist = parseInt(lengthInput.value) || 500;
  drawLines();
});

// ============================================================
//  СИСТЕМА ПРОЕКТОВ (localStorage)
// ============================================================

const LS_INDEX   = 'nodegraph_projects';   // массив { id, name }
const LS_CURRENT = 'nodegraph_current';    // id текущего проекта
const LS_PREFIX  = 'nodegraph_proj_';      // + id → данные проекта

let currentProjectId = null;
let saveTimer = null;

// ── Сохранение ──────────────────────────────────────────────

function serializeProject() {
  return {
    nodes: nodes.map(n => ({
      id:   n.id,
      x:    parseFloat(n.el.style.left),
      y:    parseFloat(n.el.style.top),
      text: n.ta.value,
      done: n.isDone.checked,
    })),
    nodeCount,
    scale, posX, posY,
  };
}

function setSaveIndicator(state) {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.className = 'saving' === state ? 'saving' : state === 'saved' ? 'saved' : '';
  if (state === 'saving') {
    el.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving…';
  } else if (state === 'saved') {
    el.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
    setTimeout(() => {
      el.className = '';
      el.innerHTML = '<i class="fa-regular fa-clock"></i> Auto-saved';
    }, 1500);
  } else {
    el.innerHTML = '<i class="fa-regular fa-clock"></i> Auto-saved';
  }
}

function saveCurrentProject() {
  if (!currentProjectId) return;
  setSaveIndicator('saving');
  try {
    const data = JSON.stringify(serializeProject());
    localStorage.setItem(LS_PREFIX + currentProjectId, data);
    setSaveIndicator('saved');
  } catch(e) {
    console.error('Save failed', e);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentProject, 500);
}

// ── Загрузка ──────────────────────────────────────────────

function clearCanvas() {
  nodes.forEach(n => n.el.remove());
  nodes = [];
  nodeCount = 0;
  selectedIds.clear();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function loadProject(id) {
  clearCanvas();
  currentProjectId = id;
  localStorage.setItem(LS_CURRENT, id);

  const raw = localStorage.getItem(LS_PREFIX + id);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      nodeCount = data.nodeCount || 0;
      scale = data.scale || 1;
      posX  = data.posX  || 0;
      posY  = data.posY  || 0;
      updateTransform();

      // Создаём ноды без вызова scheduleSave
      (data.nodes || []).forEach(nd => {
        const id = nd.id;
        // Временно подменяем makeId чтобы восстановить исходные id
        const el = document.createElement('div');
        el.className = 'node-box';
        el.id = id;
        el.style.left = nd.x + 'px';
        el.style.top  = nd.y + 'px';

        const ta = document.createElement('textarea');
        ta.className = 'node-textarea';
        ta.rows = 2;
        ta.value = nd.text || '';
        ta.addEventListener('mousedown', e => {
          if (document.activeElement === ta) e.stopPropagation();
        });
        ta.addEventListener('dblclick', e => { e.stopPropagation(); ta.focus(); });
        ta.addEventListener('input', () => { autoResize(ta); scheduleSave(); });

        const divider = document.createElement('div');
        divider.className = 'node-divider';

        const footer = document.createElement('div');
        footer.className = 'node-footer';

        const checkWrap = document.createElement('label');
        checkWrap.className = 'node-check-wrap';
        checkWrap.title = 'Выполнено';

        const isDone = document.createElement('input');
        isDone.type = 'checkbox';
        isDone.className = 'node-done';
        if (nd.done) { isDone.checked = true; el.classList.add('node-done-active'); }

        const checkBox = document.createElement('span');
        checkBox.className = 'node-check-box';
        checkBox.innerHTML = `<svg viewBox="0 0 10 8" fill="none"><path d="M1 3.5L4 6.5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        checkWrap.appendChild(isDone);
        checkWrap.appendChild(checkBox);
        checkWrap.addEventListener('mousedown', e => e.stopPropagation());
        isDone.addEventListener('change', () => {
          el.classList.toggle('node-done-active', isDone.checked);
          drawLines(); updateProgress(); scheduleSave();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'node-del-btn';
        delBtn.title = 'Удалить узел';
        delBtn.innerHTML = `<svg viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        delBtn.addEventListener('mousedown', e => e.stopPropagation());
        delBtn.addEventListener('click', e => { e.stopPropagation(); deleteNode(id); });

        footer.appendChild(checkWrap);
        footer.appendChild(delBtn);
        el.appendChild(ta);
        el.appendChild(divider);
        el.appendChild(footer);

        el.addEventListener('mousedown', evt => {
          if (evt.target === ta && document.activeElement === ta) return;
          if (evt.target.closest('.node-footer')) return;
          evt.preventDefault();
          evt.stopPropagation();

          const additive = evt.shiftKey || evt.ctrlKey || evt.metaKey;
          if (!selectedIds.has(id)) {
            selectNode(id, additive);
          } else if (additive) {
            selectedIds.delete(id);
            refreshSelection();
            return;
          }
          if (document.activeElement === ta) ta.blur();
          const cp = screenToCanvas(evt.clientX, evt.clientY);
          dragStartCanvas = cp;
          groupDragStarts = {};
          selectedIds.forEach(sid => {
            const sn = getNode(sid);
            if (sn) groupDragStarts[sid] = { x: parseFloat(sn.el.style.left), y: parseFloat(sn.el.style.top) };
          });
          draggingNode = id;
        });

        canvas.appendChild(el);
        autoResize(ta);
        nodes.push({ id, el, ta, isDone });
      });

    } catch(e) {
      console.error('Load failed', e);
    }
  }

  clearSelection();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    drawLines();
    updateProgress();
  }));

  renderProjectsList();
}

// ── Список проектов ──────────────────────────────────────────

function getProjectsIndex() {
  try { return JSON.parse(localStorage.getItem(LS_INDEX)) || []; }
  catch { return []; }
}

function saveProjectsIndex(list) {
  localStorage.setItem(LS_INDEX, JSON.stringify(list));
}

function createProject(name) {
  const id = 'p' + Date.now();
  const list = getProjectsIndex();
  list.push({ id, name: name || 'Project ' + (list.length + 1) });
  saveProjectsIndex(list);
  loadProject(id);
  return id;
}

function deleteProject(id) {
  let list = getProjectsIndex();
  list = list.filter(p => p.id !== id);
  saveProjectsIndex(list);
  localStorage.removeItem(LS_PREFIX + id);

  if (currentProjectId === id) {
    if (list.length > 0) {
      loadProject(list[list.length - 1].id);
    } else {
      createProject('Project 1');
    }
  } else {
    renderProjectsList();
  }
}

function renameProject(id, newName) {
  const list = getProjectsIndex();
  const proj = list.find(p => p.id === id);
  if (proj) {
    proj.name = newName;
    saveProjectsIndex(list);
    renderProjectsList();
  }
}

function renderProjectsList() {
  const container = document.getElementById('projects-list');
  container.innerHTML = '';
  const list = getProjectsIndex();

  list.forEach(proj => {
    const item = document.createElement('div');
    item.className = 'project-item' + (proj.id === currentProjectId ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'project-item-name';
    name.textContent = proj.name;

    const actions = document.createElement('div');
    actions.className = 'project-item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'project-action-btn';
    renameBtn.title = 'Rename';
    renameBtn.innerHTML = '<i class="fa-solid fa-pencil"></i>';
    renameBtn.addEventListener('click', e => {
      e.stopPropagation();
      openRenameModal(proj.id, proj.name);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'project-action-btn del';
    delBtn.title = 'Delete';
    delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteProject(proj.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    item.appendChild(name);
    item.appendChild(actions);

    item.addEventListener('click', () => {
      if (proj.id !== currentProjectId) {
        saveCurrentProject();
        loadProject(proj.id);
      }
    });

    container.appendChild(item);
  });

  // Индикатор сохранения внизу сайдбара
  let indicator = document.getElementById('save-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'save-indicator';
    document.getElementById('projects-sidebar').appendChild(indicator);
  }
  if (!indicator.textContent.trim()) {
    indicator.innerHTML = '<i class="fa-regular fa-clock"></i> Auto-saved';
  }
}

// ── Модалка переименования ───────────────────────────────────

function openRenameModal(id, currentName) {
  const overlay = document.getElementById('rename-overlay');
  const input   = document.getElementById('rename-input');
  overlay.classList.remove('hidden');
  input.value = currentName;
  input.focus();
  input.select();

  const confirm = document.getElementById('rename-confirm');
  const cancel  = document.getElementById('rename-cancel');

  function close() {
    overlay.classList.add('hidden');
    confirm.replaceWith(confirm.cloneNode(true));
    cancel.replaceWith(cancel.cloneNode(true));
  }

  document.getElementById('rename-confirm').addEventListener('click', () => {
    const val = input.value.trim();
    if (val) renameProject(id, val);
    close();
  });
  document.getElementById('rename-cancel').addEventListener('click', close);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const val = input.value.trim(); if (val) renameProject(id, val); close(); }
    if (e.key === 'Escape') close();
  });
}

// ── Кнопка "новый проект" ────────────────────────────────────

document.getElementById('btn-new-project').addEventListener('click', () => {
  const list = getProjectsIndex();
  const name = 'Project ' + (list.length + 1);
  createProject(name);
});

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ ПРОЕКТОВ
// ============================================================

(function init() {
  const list = getProjectsIndex();

  if (list.length === 0) {
    // Первый запуск — создаём проект с seed-нодами
    const id = 'p' + Date.now();
    const projects = [{ id, name: 'My First Project' }];
    saveProjectsIndex(projects);
    currentProjectId = id;
    localStorage.setItem(LS_CURRENT, id);

    renderProjectsList();

    createNode(60,  80,  'Task A', true);
    createNode(260, 180, 'Task B', true);
    createNode(140, 320, 'Task C');

    requestAnimationFrame(() => requestAnimationFrame(() => {
      drawLines();
      saveCurrentProject();
    }));

  } else {
    // Восстанавливаем последний открытый проект
    const lastId = localStorage.getItem(LS_CURRENT);
    const target = list.find(p => p.id === lastId) ? lastId : list[list.length - 1].id;
    loadProject(target);
  }
})();

// ============================================================
//  САЙДБАР — COLLAPSE / EXPAND
// ============================================================

(function initSidebarToggle() {
  const sidebar = document.getElementById('projects-sidebar');
  const btn     = document.getElementById('btn-sidebar-toggle');
  const LS_KEY  = 'nodegraph_sidebar_collapsed';

  // Восстанавливаем состояние
  if (localStorage.getItem(LS_KEY) === '1') {
    sidebar.classList.add('collapsed');
  }

  btn.addEventListener('click', () => {
    const isNowCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem(LS_KEY, isNowCollapsed ? '1' : '0');
  });
})();
