/* ============================================
   OCTOPUX DRIVE - Main Script v2
   ============================================ */

let currentPath = '';
let currentView = 'list';
let currentSort = 'nome';
let sortAsc = true;
let currentItems = []; // cache dos itens atuais para re-sort
let contextTarget = null;
let searchTimeout = null;
let isExternalDrag = false; // true quando arrastando arquivos do SO
let externalDropTarget = null; // pasta que está recebendo o drop externo
let activeProgressItems = {}; // id -> { xhr, cancelled }

// --- Elementos ---
const treeDiv = document.getElementById('tree');
const breadcrumbDiv = document.getElementById('breadcrumb');
const fileListDiv = document.getElementById('file-list');
const fileGridDiv = document.getElementById('file-grid');
const emptyMsg = document.getElementById('empty-msg');
const loadingDiv = document.getElementById('loading');
const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const dropOverlay = document.getElementById('drop-overlay');
const toastContainer = document.getElementById('toast-container');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const contextMenu = document.getElementById('context-menu');
const bgContextMenu = document.getElementById('bg-context-menu');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');
const fileArea = document.getElementById('file-area');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const itemCount = document.getElementById('item-count');
const sortOrderBtn = document.getElementById('sort-order');
const progressPanel = document.getElementById('progress-panel');
const progressItems = document.getElementById('progress-items');
const sidebarResize = document.getElementById('sidebar-resize');

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se há caminho inicial na URL (History API)
    const initialPath = decodeURIComponent(location.pathname.slice(1));
    loadTree();
    navigateTo(initialPath, false);
    setupDragDrop();
    setupSidebarToggle();
    setupSortControls();
    setupHistoryNavigation();
    setupSidebarResize();
    loadStorageInfo();
});

// ============================================
// SIDEBAR RESIZE
// ============================================
function setupSidebarResize() {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    sidebarResize.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        sidebarResize.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const diff = e.clientX - startX;
        const newWidth = Math.max(180, Math.min(420, startWidth + diff));
        sidebar.style.width = newWidth + 'px';
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        progressPanel.style.left = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        sidebarResize.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

function setupSidebarToggle() {
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.getElementById('main-area').addEventListener('click', () => sidebar.classList.remove('open'));
}

// ============================================
// SORT CONTROLS
// ============================================
function setupSortControls() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.sort;
            if (currentSort === field) {
                sortAsc = !sortAsc;
            } else {
                currentSort = field;
                sortAsc = true;
            }
            updateSortUI();
            renderCurrentItems();
        });
    });

    sortOrderBtn.addEventListener('click', () => {
        sortAsc = !sortAsc;
        updateSortUI();
        renderCurrentItems();
    });
}

function updateSortUI() {
    document.querySelectorAll('.sort-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.sort === currentSort);
    });
    sortOrderBtn.classList.toggle('desc', !sortAsc);
}

function sortItems(itens) {
    const pastas = itens.filter(i => i.tipo === 'dir');
    const arquivos = itens.filter(i => i.tipo === 'file');

    const sorter = (a, b) => {
        let valA, valB;
        if (currentSort === 'nome') {
            valA = a.nome.toLowerCase();
            valB = b.nome.toLowerCase();
        } else if (currentSort === 'data_upload') {
            valA = a.data_upload || '';
            valB = b.data_upload || '';
        } else if (currentSort === 'ip_upload') {
            valA = a.ip_upload || '';
            valB = b.ip_upload || '';
        } else {
            valA = a.nome.toLowerCase();
            valB = b.nome.toLowerCase();
        }
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    };

    pastas.sort(sorter);
    arquivos.sort(sorter);
    return [...pastas, ...arquivos];
}

function renderCurrentItems() {
    const sorted = sortItems(currentItems);
    fileListDiv.innerHTML = '';
    fileGridDiv.innerHTML = '';

    if (sorted.length === 0) {
        emptyMsg.style.display = 'flex';
        fileListDiv.style.display = 'none';
        fileGridDiv.style.display = 'none';
        return;
    }
    emptyMsg.style.display = 'none';

    sorted.forEach((item, idx) => {
        const fullPath = currentPath ? `${currentPath}/${item.nome}` : item.nome;
        renderListItem(item, fullPath, idx);
        renderGridItem(item, fullPath, idx);
    });
}

// ============================================
// TOOLBAR BOTÕES
// ============================================
document.getElementById('btn-upload-file').addEventListener('click', () => fileInput.click());
document.getElementById('btn-upload-folder').addEventListener('click', () => folderInput.click());
document.getElementById('btn-mkdir').addEventListener('click', () => showNewFolderModal());

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) uploadFiles(fileInput.files, false, currentPath);
    fileInput.value = '';
});
folderInput.addEventListener('change', () => {
    if (folderInput.files.length > 0) uploadFiles(folderInput.files, true, currentPath);
    folderInput.value = '';
});

document.getElementById('view-list').addEventListener('click', () => switchView('list'));
document.getElementById('view-grid').addEventListener('click', () => switchView('grid'));

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(view === 'list' ? 'view-list' : 'view-grid').classList.add('active');
    fileListDiv.style.display = view === 'list' ? 'block' : 'none';
    fileGridDiv.style.display = view === 'grid' ? 'grid' : 'none';
}

// ============================================
// DRAG & DROP (global + para pastas)
// ============================================
function setupDragDrop() {
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        // Ignorar drags internos (da própria página) para o overlay
        if (e.dataTransfer.types.includes('application/drive-internal')) return;

        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            isExternalDrag = true;
            dragCounter++;
            // Verificar se estamos sobre uma pasta específica
            const folderTarget = getFolderDropTarget(e);
            if (folderTarget) {
                externalDropTarget = folderTarget;
                folderTarget.classList.add('sidebar-drop-target', 'drag-over-folder');
                // Não mostrar overlay se está sobre uma pasta
                return;
            }
            // Verificar se está sobre um folder item na lista/grid
            const itemFolder = getItemFolderDropTarget(e);
            if (itemFolder) {
                externalDropTarget = itemFolder;
                itemFolder.classList.add('drag-over-folder');
                return;
            }
            dropOverlay.classList.add('visible');
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!isExternalDrag) return;
        e.dataTransfer.dropEffect = 'copy';

        // Atualizar target visual
        const newFolder = getFolderDropTarget(e) || getItemFolderDropTarget(e);
        if (newFolder !== externalDropTarget) {
            if (externalDropTarget) {
                externalDropTarget.classList.remove('sidebar-drop-target', 'drag-over-folder');
            }
            externalDropTarget = newFolder;
            if (newFolder) {
                newFolder.classList.add('sidebar-drop-target', 'drag-over-folder');
                dropOverlay.classList.remove('visible');
            } else if (isExternalDrag) {
                dropOverlay.classList.add('visible');
            }
        }
    });

    document.addEventListener('dragleave', (e) => {
        if (!isExternalDrag) return;
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            cleanupExternalDrag();
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        isExternalDrag = false;
        dropOverlay.classList.remove('visible');

        if (e.dataTransfer.files.length > 0) {
            let targetPath = currentPath;
            // Verificar se soltou sobre uma pasta
            const folderEl = getFolderDropTarget(e) || getItemFolderDropTarget(e);
            if (folderEl) {
                targetPath = folderEl.dataset.path || folderEl.dataset.folderPath || currentPath;
                folderEl.classList.remove('sidebar-drop-target', 'drag-over-folder');
            }
            const hasRelativePath = Array.from(e.dataTransfer.files).some(f => f.webkitRelativePath);
            uploadFiles(e.dataTransfer.files, hasRelativePath, targetPath);
        }
        externalDropTarget = null;
    });
}

function cleanupExternalDrag() {
    dropOverlay.classList.remove('visible');
    if (externalDropTarget) {
        externalDropTarget.classList.remove('sidebar-drop-target', 'drag-over-folder');
        externalDropTarget = null;
    }
}

function getFolderDropTarget(e) {
    // Procurar tree-item mais próximo
    const el = e.target.closest('.tree-item');
    if (el && el.dataset.path !== undefined) {
        return el;
    }
    return null;
}

function getItemFolderDropTarget(e) {
    const el = e.target.closest('.item.folder, .grid-item[data-tipo="dir"]');
    if (el) {
        return el;
    }
    return null;
}

// ============================================
// DRAG & DROP INTERNO (mover arquivos entre pastas)
// ============================================
function setupInternalDrag(itemEl, fullPath, tipo, itemData) {
    itemEl.setAttribute('draggable', 'true');

    itemEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/drive-internal', JSON.stringify({
            path: fullPath, tipo: tipo
        }));
        e.dataTransfer.effectAllowed = 'move';
        // Esconder o overlay global para drags internos
        requestAnimationFrame(() => itemEl.classList.add('dragging'));
    });

    itemEl.addEventListener('dragend', () => {
        itemEl.classList.remove('dragging');
        document.querySelectorAll('.drag-over, .drag-over-folder, .sidebar-drop-target').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-folder', 'sidebar-drop-target');
        });
        fileArea.classList.remove('drag-active');
    });

    // Aceitar drop em pastas (na lista/grid)
    if (tipo === 'dir') {
        itemEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('application/drive-internal')) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                itemEl.classList.add('drag-over-folder');
            }
        });

        itemEl.addEventListener('dragleave', (e) => {
            if (!itemEl.contains(e.relatedTarget)) {
                itemEl.classList.remove('drag-over-folder');
            }
        });

        itemEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            itemEl.classList.remove('drag-over-folder');

            if (e.dataTransfer.types.includes('application/drive-internal')) {
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/drive-internal'));
                    if (data.path === fullPath) return;
                    if (fullPath.startsWith(data.path + '/')) return;
                    moveItem(data.path, fullPath);
                } catch (err) {}
            }
        });
    }
}

// ============================================
// SIDEBAR DROP TARGET (receber arrasto de itens internos e externos)
// ============================================
function setupSidebarDropTarget(treeItemEl, folderPath) {
    treeItemEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/drive-internal')) {
            e.dataTransfer.dropEffect = 'move';
        }
        treeItemEl.classList.add('sidebar-drop-target');
    });

    treeItemEl.addEventListener('dragleave', (e) => {
        if (!treeItemEl.contains(e.relatedTarget)) {
            treeItemEl.classList.remove('sidebar-drop-target');
        }
    });

    treeItemEl.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        treeItemEl.classList.remove('sidebar-drop-target');

        // Se é arrasto interno
        if (e.dataTransfer.types.includes('application/drive-internal')) {
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/drive-internal'));
                if (data.path === folderPath) return;
                if (folderPath.startsWith(data.path + '/')) return;
                moveItem(data.path, folderPath);
            } catch (err) {}
        }
        // Se é arrasto externo (arquivos do SO) — tratado pelo handler global
    });
}

// ============================================
// ÁRVORE LATERAL
// ============================================
async function loadTree(path = '') {
    try {
        const resp = await fetch(`/api/list?path=${encodeURIComponent(path)}&tipo=dir`);
        const data = await resp.json();
        if (!data.ok) return;
        renderTree(path, data.itens);
    } catch (err) {
        console.error('Erro ao carregar árvore:', err);
    }
}

function renderTree(parentPath, folders) {
    if (parentPath === '') {
        treeDiv.innerHTML = '';
        const rootItem = createTreeItem('', 'Meu Drive', 'root', true);
        treeDiv.appendChild(rootItem);
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tree-folder';
        childrenDiv.id = 'tree-children-root';
        treeDiv.appendChild(childrenDiv);
    }

    const container = parentPath === ''
        ? document.getElementById('tree-children-root')
        : document.getElementById(`tree-children-${CSS.escape(parentPath)}`);
    if (!container) return;

    container.innerHTML = '';
    folders.forEach(folder => {
        const fullPath = parentPath ? `${parentPath}/${folder.nome}` : folder.nome;
        const item = createTreeItem(fullPath, folder.nome, 'folder');
        container.appendChild(item);
        setupSidebarDropTarget(item, fullPath);

        const subContainer = document.createElement('div');
        subContainer.className = 'tree-folder';
        subContainer.id = `tree-children-${CSS.escape(fullPath)}`;
        subContainer.style.display = 'none';
        container.appendChild(subContainer);
    });
}

function createTreeItem(path, nome, type, isRoot = false) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    div.dataset.path = path;

    const arrowSvg = `<span class="tree-arrow">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </span>`;

    div.innerHTML = `
        ${!isRoot ? arrowSvg : ''}
        <span class="tree-icon">📁</span>
        <span class="tree-name">${escapeHtml(nome)}</span>
    `;

    div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (type === 'folder' || isRoot) {
            const arrow = div.querySelector('.tree-arrow');
            const subContainerId = `tree-children-${CSS.escape(path)}`;
            const subContainer = document.getElementById(subContainerId);
            if (subContainer) {
                if (subContainer.style.display === 'none' || subContainer.style.display === '') {
                    if (subContainer.children.length === 0) loadTree(path);
                    subContainer.style.display = 'block';
                    if (arrow) arrow.classList.add('expanded');
                } else {
                    subContainer.style.display = 'none';
                    if (arrow) arrow.classList.remove('expanded');
                }
            }
        }
        navigateTo(path);
        sidebar.classList.remove('open');
    });

    // Context menu na sidebar
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isRoot) {
            // Raiz: só navegar
            navigateTo('');
            sidebar.classList.remove('open');
            return;
        }
        // Pasta na sidebar: abrir, download, renomear, excluir
        showSidebarContextMenu(e.clientX, e.clientY, path, nome);
    });

    return div;
}

// ============================================
// SIDEBAR CONTEXT MENU
// ============================================
function showSidebarContextMenu(x, y, path, nome) {
    contextTarget = { path, name: nome, tipo: 'dir' };
    const menu = contextMenu;
    menu.classList.add('visible');

    // Atualizar label do download
    const downloadSpan = menu.querySelector('[data-action="download"] span');
    if (downloadSpan) downloadSpan.textContent = 'Download (.zip)';

    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';
}

// ============================================
// NAVEGAÇÃO + HISTORY API
// ============================================
function navigateTo(path, pushHistory = true) {
    currentPath = path;
    loadFileList(path);
    updateBreadcrumb(path);
    updateActiveTree(path);

    if (pushHistory) {
        const url = path ? '/' + path : '/';
        history.pushState({ path }, '', url);
    }
}

function setupHistoryNavigation() {
    // Botões voltar/avançar do navegador
    window.addEventListener('popstate', (e) => {
        const path = e.state?.path ?? decodeURIComponent(location.pathname.slice(1));
        currentPath = path;
        loadFileList(path);
        updateBreadcrumb(path);
        updateActiveTree(path);
    });

    // Alt+Seta esquerda/direita
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            history.back();
        }
        if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            history.forward();
        }
    });
}

async function loadFileList(path) {
    showLoading(true);
    fileListDiv.style.display = 'none';
    fileGridDiv.style.display = 'none';
    emptyMsg.style.display = 'none';
    itemCount.textContent = '';

    try {
        const resp = await fetch(`/api/list?path=${encodeURIComponent(path)}`);
        const data = await resp.json();
        if (!data.ok) {
            showToast('Erro: ' + data.erro, 'error');
            return;
        }
        currentItems = data.itens;
        renderCurrentItems();

        const total = data.itens.length;
        const pastas = data.itens.filter(i => i.tipo === 'dir').length;
        const arqs = total - pastas;
        if (total > 0) {
            const parts = [];
            if (pastas > 0) parts.push(`${pastas} pasta${pastas > 1 ? 's' : ''}`);
            if (arqs > 0) parts.push(`${arqs} arquivo${arqs > 1 ? 's' : ''}`);
            itemCount.textContent = parts.join(', ');
        }
    } catch (err) {
        showToast('Erro de conexão', 'error');
    } finally {
        showLoading(false);
        if (currentView === 'list') fileListDiv.style.display = 'block';
        else fileGridDiv.style.display = 'grid';
    }
}

// ============================================
// DETECÇÃO AUTOMÁTICA DE TIPO DE ARQUIVO
// ============================================
function getFileTypeInfo(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        pdf: { icon: '📕', cls: 'file-icon-pdf' },
        jpg: { icon: '🖼️', cls: 'file-icon-image' }, jpeg: { icon: '🖼️', cls: 'file-icon-image' },
        png: { icon: '🖼️', cls: 'file-icon-image' }, gif: { icon: '🖼️', cls: 'file-icon-image' },
        svg: { icon: '🖼️', cls: 'file-icon-image' }, webp: { icon: '🖼️', cls: 'file-icon-image' },
        bmp: { icon: '🖼️', cls: 'file-icon-image' }, ico: { icon: '🖼️', cls: 'file-icon-image' },
        mp4: { icon: '🎬', cls: 'file-icon-video' }, avi: { icon: '🎬', cls: 'file-icon-video' },
        mkv: { icon: '🎬', cls: 'file-icon-video' }, mov: { icon: '🎬', cls: 'file-icon-video' },
        wmv: { icon: '🎬', cls: 'file-icon-video' }, flv: { icon: '🎬', cls: 'file-icon-video' },
        webm: { icon: '🎬', cls: 'file-icon-video' },
        mp3: { icon: '🎵', cls: 'file-icon-audio' }, wav: { icon: '🎵', cls: 'file-icon-audio' },
        flac: { icon: '🎵', cls: 'file-icon-audio' }, ogg: { icon: '🎵', cls: 'file-icon-audio' },
        aac: { icon: '🎵', cls: 'file-icon-audio' },
        zip: { icon: '📦', cls: 'file-icon-zip' }, rar: { icon: '📦', cls: 'file-icon-zip' },
        '7z': { icon: '📦', cls: 'file-icon-zip' }, tar: { icon: '📦', cls: 'file-icon-zip' },
        gz: { icon: '📦', cls: 'file-icon-zip' },
        js: { icon: '💻', cls: 'file-icon-code' }, ts: { icon: '💻', cls: 'file-icon-code' },
        py: { icon: '🐍', cls: 'file-icon-code' }, html: { icon: '🌐', cls: 'file-icon-code' },
        css: { icon: '🎨', cls: 'file-icon-code' }, json: { icon: '📋', cls: 'file-icon-code' },
        xml: { icon: '📋', cls: 'file-icon-code' }, java: { icon: '☕', cls: 'file-icon-code' },
        cpp: { icon: '⚙️', cls: 'file-icon-code' }, c: { icon: '⚙️', cls: 'file-icon-code' },
        sh: { icon: '🖥️', cls: 'file-icon-code' }, sql: { icon: '🗃️', cls: 'file-icon-code' },
        php: { icon: '🐘', cls: 'file-icon-code' }, rb: { icon: '💎', cls: 'file-icon-code' },
        go: { icon: '🔷', cls: 'file-icon-code' }, rs: { icon: '🦀', cls: 'file-icon-code' },
        doc: { icon: '📝', cls: 'file-icon-doc' }, docx: { icon: '📝', cls: 'file-icon-doc' },
        odt: { icon: '📝', cls: 'file-icon-doc' }, rtf: { icon: '📝', cls: 'file-icon-doc' },
        txt: { icon: '📃', cls: 'file-icon-doc' }, md: { icon: '📃', cls: 'file-icon-doc' },
        xls: { icon: '📊', cls: 'file-icon-spreadsheet' }, xlsx: { icon: '📊', cls: 'file-icon-spreadsheet' },
        csv: { icon: '📊', cls: 'file-icon-spreadsheet' },
        ppt: { icon: '📽️', cls: 'file-icon-zip' }, pptx: { icon: '📽️', cls: 'file-icon-zip' },
        exe: { icon: '⚡', cls: 'file-icon-default' }, msi: { icon: '⚡', cls: 'file-icon-default' },
        ttf: { icon: '🔤', cls: 'file-icon-default' }, otf: { icon: '🔤', cls: 'file-icon-default' },
        woff: { icon: '🔤', cls: 'file-icon-default' },
    };
    return map[ext] || { icon: '📄', cls: 'file-icon-default' };
}

// ============================================
// RENDERIZAÇÃO DA LISTA
// ============================================
function renderListItem(item, fullPath, idx) {
    const row = document.createElement('div');
    row.className = 'item' + (item.tipo === 'dir' ? ' folder' : '');
    row.style.animationDelay = `${idx * 0.03}s`;
    if (item.tipo === 'dir') row.dataset.tipo = 'dir';

    const isDir = item.tipo === 'dir';
    const typeInfo = isDir ? { icon: '📁', cls: 'folder-icon' } : getFileTypeInfo(item.nome);

    const metaParts = [];
    if (!isDir && item.tamanho) metaParts.push(formatBytes(item.tamanho));
    if (item.data_upload) metaParts.push(item.data_upload);
    if (item.ip_upload) metaParts.push(item.ip_upload);

    row.innerHTML = `
        <div class="item-info">
            <div class="item-icon ${typeInfo.cls}">${typeInfo.icon}</div>
            <div class="item-details">
                <span class="item-name">${escapeHtml(item.nome)}</span>
                ${!isDir
                    ? `<span class="item-sub">${metaParts.join(' · ')}</span>`
                    : `<span class="item-sub">${item.data_upload ? item.data_upload : 'Pasta'}${item.ip_upload ? ' · ' + item.ip_upload : ''}</span>`}
            </div>
        </div>
        <div class="item-meta">
            ${!isDir && item.tamanho ? `<span class="meta-item">${formatBytes(item.tamanho)}</span>` : ''}
            ${item.data_upload ? `<span class="meta-item">${item.data_upload}</span>` : ''}
            ${item.ip_upload ? `<span class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>${escapeHtml(item.ip_upload)}</span>` : ''}
        </div>
        <div class="item-actions">
            ${!isDir ? `<button class="btn-download" data-path="${escapeAttr(fullPath)}" title="Download"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
            <button class="btn-delete" data-path="${escapeAttr(fullPath)}" data-tipo="${item.tipo}" data-name="${escapeAttr(item.nome)}" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
    `;

    row.querySelector('.item-info').addEventListener('click', () => {
        if (isDir) navigateTo(fullPath);
        else downloadFile(fullPath);
    });

    row.querySelector('.item-info').addEventListener('dblclick', (e) => {
        e.preventDefault();
        showRenameModal(fullPath, item.nome, item.tipo);
    });

    row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, {
            path: fullPath, name: item.nome, tipo: item.tipo,
            tamanho: item.tamanho, data_upload: item.data_upload, ip_upload: item.ip_upload
        });
    });

    const btnDl = row.querySelector('.btn-download');
    if (btnDl) btnDl.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(fullPath); });

    row.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteModal(fullPath, item.nome, item.tipo);
    });

    setupInternalDrag(row, fullPath, item.tipo, item);
    fileListDiv.appendChild(row);
}

function renderGridItem(item, fullPath, idx) {
    const card = document.createElement('div');
    card.className = 'grid-item';
    card.style.animationDelay = `${idx * 0.04}s`;
    card.dataset.tipo = item.tipo;

    const isDir = item.tipo === 'dir';
    const typeInfo = isDir ? { icon: '📁', cls: 'folder-icon' } : getFileTypeInfo(item.nome);

    card.innerHTML = `
        <div class="grid-actions">
            ${!isDir ? `<button class="btn-download" data-path="${escapeAttr(fullPath)}" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
            <button class="btn-delete" data-path="${escapeAttr(fullPath)}" data-tipo="${item.tipo}" data-name="${escapeAttr(item.nome)}" title="Excluir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
        <div class="grid-icon">${typeInfo.icon}</div>
        <div class="grid-name" title="${escapeAttr(item.nome)}">${escapeHtml(item.nome)}</div>
        ${!isDir ? `<div class="grid-meta">${formatBytes(item.tamanho)}</div>` : `<div class="grid-meta">Pasta</div>`}
    `;

    card.addEventListener('click', () => {
        if (isDir) navigateTo(fullPath);
        else downloadFile(fullPath);
    });

    card.addEventListener('dblclick', (e) => {
        e.preventDefault();
        showRenameModal(fullPath, item.nome, item.tipo);
    });

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, {
            path: fullPath, name: item.nome, tipo: item.tipo,
            tamanho: item.tamanho, data_upload: item.data_upload, ip_upload: item.ip_upload
        });
    });

    const btnDl = card.querySelector('.btn-download');
    if (btnDl) btnDl.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(fullPath); });

    card.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteModal(fullPath, item.nome, item.tipo);
    });

    setupInternalDrag(card, fullPath, item.tipo, item);
    fileGridDiv.appendChild(card);
}

// ============================================
// BREADCRUMB
// ============================================
function updateBreadcrumb(path) {
    breadcrumbDiv.innerHTML = '';
    const rootSpan = document.createElement('span');
    rootSpan.className = 'breadcrumb-item';
    rootSpan.textContent = 'Meu Drive';
    rootSpan.addEventListener('click', () => navigateTo(''));
    breadcrumbDiv.appendChild(rootSpan);

    if (path) {
        const parts = path.split('/').filter(p => p);
        let acc = '';
        parts.forEach(part => {
            acc += (acc ? '/' : '') + part;
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = ' / ';
            breadcrumbDiv.appendChild(sep);
            const span = document.createElement('span');
            span.className = 'breadcrumb-item';
            span.textContent = part;
            span.addEventListener('click', () => navigateTo(acc));
            breadcrumbDiv.appendChild(span);
        });
    }
}

function updateActiveTree(path) {
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    if (path === '') {
        const rootItem = document.querySelector('.tree-item[data-path=""]');
        if (rootItem) rootItem.classList.add('active');
    } else {
        const item = document.querySelector(`.tree-item[data-path="${CSS.escape(path)}"]`);
        if (item) item.classList.add('active');
    }
}

// ============================================
// UPLOAD (com progresso)
// ============================================
async function uploadFiles(files, isFolder, targetPath) {
    const formData = new FormData();
    formData.append('path', targetPath);
    let totalSize = 0;
    for (let file of files) {
        if (isFolder) formData.append('arquivos', file, file.webkitRelativePath || file.name);
        else formData.append('arquivos', file);
        totalSize += file.size;
    }

    const fileCount = files.length;
    const displayName = fileCount === 1
        ? (isFolder ? files[0].webkitRelativePath.split('/')[0] : files[0].name)
        : `${fileCount} itens`;

    // Criar item de progresso
    const progressId = createProgressItem('upload', displayName, totalSize);

    const targetName = targetPath ? targetPath.split('/').pop() : 'raiz';
    showToast(`Enviando ${fileCount} item(ns) para ${targetName}...`, 'info');

    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        activeProgressItems[progressId] = { xhr, cancelled: false };

        // Progresso do upload (client → server)
        let startTime = performance.now();
        let lastLoaded = 0;
        let lastTime = startTime;

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000;
                const dBytes = e.loaded - lastLoaded;
                const speed = dt > 0 ? dBytes / dt : 0;
                const remaining = speed > 0 ? (e.total - e.loaded) / speed : 0;

                updateProgressItem(progressId, {
                    loaded: e.loaded,
                    total: e.total,
                    speed: speed,
                    eta: remaining
                });

                lastLoaded = e.loaded;
                lastTime = now;
            }
        });

        xhr.addEventListener('load', () => {
            delete activeProgressItems[progressId];
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
                    const msg = data.salvos && data.salvos.length > 0
                        ? `${data.salvos.length} item(ns) enviado(s) com sucesso`
                        : 'Upload concluído';
                    completeProgressItem(progressId, true, msg);
                    showToast(msg, 'success');
                    loadFileList(currentPath);
                    const parentPath = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '';
                    loadTree(parentPath);
                    loadTree(targetPath);
                    if (targetPath !== currentPath) loadTree(currentPath);
                    loadStorageInfo();
                } else {
                    const errMsg = data.erro || 'Erro desconhecido';
                    completeProgressItem(progressId, false, errMsg);
                    showToast('Erro: ' + errMsg, 'error');
                }
            } catch (err) {
                completeProgressItem(progressId, false, 'Erro na resposta');
                showToast('Erro na resposta do servidor', 'error');
            }
            resolve();
        });

        xhr.addEventListener('error', () => {
            delete activeProgressItems[progressId];
            completeProgressItem(progressId, false, 'Erro de conexão');
            showToast('Erro de conexão', 'error');
            resolve();
        });

        xhr.addEventListener('abort', () => {
            delete activeProgressItems[progressId];
            removeProgressItem(progressId);
            showToast('Upload cancelado', 'info');
            resolve();
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);

        // Botão cancelar
        const cancelBtn = document.querySelector(`[data-progress-id="${progressId}"] .progress-cancel`);
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (activeProgressItems[progressId]) {
                    activeProgressItems[progressId].cancelled = true;
                    xhr.abort();
                }
            });
        }
    });
}

// ============================================
// CRIAR PASTA (modal)
// ============================================
function showNewFolderModal() {
    modalTitle.textContent = 'Nova pasta';
    modalBody.innerHTML = `
        <input type="text" class="modal-input" id="modal-folder-name" placeholder="Nome da pasta" autofocus>
        <div class="modal-actions">
            <button class="modal-btn" id="modal-cancel">Cancelar</button>
            <button class="modal-btn modal-btn-primary" id="modal-confirm">Criar</button>
        </div>
    `;
    showModal();

    const input = document.getElementById('modal-folder-name');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    setTimeout(() => input.focus(), 100);

    const doCreate = () => {
        const nome = input.value.trim();
        if (!nome) { input.style.borderColor = 'var(--danger)'; input.focus(); return; }
        hideModal();
        criarPasta(nome);
    };

    confirmBtn.addEventListener('click', doCreate);
    cancelBtn.addEventListener('click', hideModal);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doCreate();
        if (e.key === 'Escape') hideModal();
        input.style.borderColor = '';
    });
}

async function criarPasta(nome) {
    try {
        const resp = await fetch('/api/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentPath, nome })
        });
        const data = await resp.json();
        if (data.ok) {
            showToast(`Pasta "${nome}" criada`, 'success');
            loadFileList(currentPath);
            loadTree(currentPath);
            loadStorageInfo();
        } else {
            showToast('Erro: ' + data.erro, 'error');
        }
    } catch (err) {
        showToast('Erro de conexão', 'error');
    }
}

// ============================================
// RENOMEAR (modal)
// ============================================
function showRenameModal(fullPath, currentName, tipo) {
    modalTitle.textContent = 'Renomear';
    modalBody.innerHTML = `
        <input type="text" class="modal-input" id="modal-rename-input" value="${escapeAttr(currentName)}" autofocus>
        <div class="modal-actions">
            <button class="modal-btn" id="modal-cancel">Cancelar</button>
            <button class="modal-btn modal-btn-primary" id="modal-confirm">Renomear</button>
        </div>
    `;
    showModal();

    const input = document.getElementById('modal-rename-input');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    setTimeout(() => {
        input.focus();
        const dotIdx = currentName.lastIndexOf('.');
        if (dotIdx > 0 && tipo === 'file') input.setSelectionRange(0, dotIdx);
        else input.select();
    }, 100);

    const doRename = () => {
        const novoNome = input.value.trim();
        if (!novoNome || novoNome === currentName) { hideModal(); return; }
        hideModal();
        renameItem(fullPath, novoNome);
    };

    confirmBtn.addEventListener('click', doRename);
    cancelBtn.addEventListener('click', hideModal);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doRename();
        if (e.key === 'Escape') hideModal();
    });
}

async function renameItem(fullPath, novoNome) {
    try {
        const resp = await fetch('/api/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath, novo_nome: novoNome })
        });
        const data = await resp.json();
        if (data.ok) {
            showToast('Renomeado com sucesso', 'success');
            loadFileList(currentPath);
            const parentPath = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';
            loadTree(parentPath);
            loadTree(currentPath);
            loadStorageInfo();
        } else {
            showToast('Erro: ' + data.erro, 'error');
        }
    } catch (err) {
        showToast('Erro de conexão', 'error');
    }
}

// ============================================
// EXCLUIR (modal de confirmação)
// ============================================
function showDeleteModal(fullPath, nome, tipo) {
    modalTitle.textContent = 'Confirmar exclusão';
    const tipoMsg = tipo === 'dir' ? 'a pasta e todo seu conteúdo' : 'o arquivo';
    modalBody.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
            Tem certeza que deseja excluir ${tipoMsg}<br>
            <strong style="color: var(--text-primary);">"${escapeHtml(nome)}"</strong>?
        </p>
        <p style="color: var(--text-tertiary); font-size: 0.78rem; margin-top: 10px;">
            Esta ação não pode ser desfeita.
        </p>
        <div class="modal-actions">
            <button class="modal-btn" id="modal-cancel">Cancelar</button>
            <button class="modal-btn modal-btn-danger" id="modal-confirm">Excluir</button>
        </div>
    `;
    showModal();

    document.getElementById('modal-confirm').addEventListener('click', () => {
        hideModal();
        deleteItem(fullPath);
    });
    document.getElementById('modal-cancel').addEventListener('click', hideModal);
}

async function deleteItem(fullPath) {
    try {
        const resp = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath })
        });
        const data = await resp.json();
        if (data.ok) {
            showToast('Excluído com sucesso', 'success');
            loadFileList(currentPath);
            const parentPath = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : '';
            loadTree(parentPath);
            loadStorageInfo();
        } else {
            showToast('Erro: ' + data.erro, 'error');
        }
    } catch (err) {
        showToast('Erro de conexão', 'error');
    }
}

// ============================================
// MOVER (drag & drop interno)
// ============================================
async function moveItem(srcPath, destFolderPath) {
    try {
        const resp = await fetch('/api/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ src: srcPath, dest: destFolderPath })
        });
        const data = await resp.json();
        if (data.ok) {
            const nome = srcPath.split('/').pop();
            showToast(`"${nome}" movido com sucesso`, 'success');
            loadFileList(currentPath);
            const srcParent = srcPath.includes('/') ? srcPath.substring(0, srcPath.lastIndexOf('/')) : '';
            loadTree(srcParent);
            loadTree(destFolderPath);
            if (destFolderPath !== currentPath) loadTree(currentPath);
            loadStorageInfo();
        } else {
            showToast('Erro: ' + data.erro, 'error');
        }
    } catch (err) {
        showToast('Erro de conexão', 'error');
    }
}

// ============================================
// DOWNLOAD (com progresso via fetch + ReadableStream)
// ============================================
async function downloadFile(path) {
    const fileName = path.split('/').pop();
    const isDir = false; // será determinado pelo tipo de conteúdo

    // Criar item de progresso (indeterminado até saber o tamanho)
    const progressId = createProgressItem('download', fileName, 0);

    try {
        const resp = await fetch(`/api/download?path=${encodeURIComponent(path)}`, {
            method: 'GET'
        });

        if (!resp.ok) {
            completeProgressItem(progressId, false, `Erro ${resp.status}`);
            showToast('Erro ao baixar arquivo', 'error');
            return;
        }

        const contentLength = resp.headers.get('Content-Length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

        // Atualizar o total agora que sabemos o tamanho
        if (totalBytes > 0) {
            const totalEl = document.querySelector(`[data-progress-id="${progressId}"] .progress-stats-size`);
            if (totalEl) totalEl.textContent = formatBytes(totalBytes);
        }

        // Extrair nome do arquivo do header Content-Disposition
        const disposition = resp.headers.get('Content-Disposition') || '';
        let downloadName = fileName;
        const filenameMatch = disposition.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/);
        if (filenameMatch && filenameMatch[2]) {
            downloadName = filenameMatch[2].replace(/['"]/g, '');
            // Atualizar nome no progresso
            const nameEl = document.querySelector(`[data-progress-id="${progressId}"] .progress-name`);
            if (nameEl) nameEl.textContent = downloadName;
        }

        if (!resp.body) {
            // Fallback: browser nativo (não deveria acontecer em navegadores modernos)
            window.open(`/api/download?path=${encodeURIComponent(path)}`, '_blank');
            removeProgressItem(progressId);
            return;
        }

        const reader = resp.body.getReader();
        const chunks = [];
        let receivedBytes = 0;
        let lastTime = performance.now();
        let lastLoaded = 0;

        // Controle de cancelamento
        const controller = { cancelled: false };
        activeProgressItems[progressId] = { controller };

        const cancelBtn = document.querySelector(`[data-progress-id="${progressId}"] .progress-cancel`);
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                controller.cancelled = true;
                reader.cancel();
                delete activeProgressItems[progressId];
                removeProgressItem(progressId);
                showToast('Download cancelado', 'info');
            });
        }

        while (true) {
            if (controller.cancelled) break;

            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            receivedBytes += value.length;

            if (totalBytes > 0) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000;
                const dBytes = receivedBytes - lastLoaded;
                const speed = dt > 0 ? dBytes / dt : 0;
                const remaining = speed > 0 ? (totalBytes - receivedBytes) / speed : 0;

                updateProgressItem(progressId, {
                    loaded: receivedBytes,
                    total: totalBytes,
                    speed: speed,
                    eta: remaining
                });

                if (dt > 0.3) {
                    lastLoaded = receivedBytes;
                    lastTime = now;
                }
            } else {
                // Sem Content-Length: mostrar bytes recebidos
                updateProgressItem(progressId, {
                    loaded: receivedBytes,
                    total: 0,
                    speed: 0,
                    eta: -1
                });
            }
        }

        delete activeProgressItems[progressId];

        if (controller.cancelled) return;

        // Criar blob e baixar
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Limpar URL após um delay
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        completeProgressItem(progressId, true, 'Download concluído');
    } catch (err) {
        delete activeProgressItems[progressId];
        if (err.name !== 'AbortError') {
            completeProgressItem(progressId, false, 'Erro de conexão');
            showToast('Erro de conexão', 'error');
        }
    }
}

// ============================================
// CONTEXT MENU
// ============================================
function showContextMenu(x, y, target) {
    contextTarget = target;
    const menu = contextMenu;
    menu.classList.add('visible');

    // Download disponível para qualquer tipo (arquivo direto, pasta como zip)
    const downloadItem = menu.querySelector('[data-action="download"]');
    downloadItem.style.display = 'flex';
    downloadItem.querySelector('span').textContent = target.tipo === 'dir' ? 'Download (.zip)' : 'Download';

    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';
}

document.addEventListener('click', () => {
    contextMenu.classList.remove('visible');
    bgContextMenu.classList.remove('visible');
});

document.addEventListener('contextmenu', (e) => {
    // Se clicou no fundo da área de arquivos (não em um item)
    if (e.target.closest('.file-area') && !e.target.closest('.item') && !e.target.closest('.grid-item')) {
        contextMenu.classList.remove('visible');
        return; // o handler do file-area vai tratar
    }
    if (!e.target.closest('.item') && !e.target.closest('.grid-item')) {
        contextMenu.classList.remove('visible');
    }
    // Fechar menu de fundo se clicou em qualquer outro lugar
    if (!e.target.closest('.file-area') && !e.target.closest('#bg-context-menu')) {
        bgContextMenu.classList.remove('visible');
    }
});

contextMenu.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', () => {
        if (!contextTarget) return;
        const action = item.dataset.action;
        contextMenu.classList.remove('visible');

        switch (action) {
            case 'open':
                if (contextTarget.tipo === 'dir') navigateTo(contextTarget.path);
                else downloadFile(contextTarget.path);
                break;
            case 'download':
                downloadFile(contextTarget.path);
                break;
            case 'rename':
                showRenameModal(contextTarget.path, contextTarget.name, contextTarget.tipo);
                break;
            case 'info':
                showInfoModal(contextTarget);
                break;
            case 'delete':
                showDeleteModal(contextTarget.path, contextTarget.name, contextTarget.tipo);
                break;
        }
    });
});

// ============================================
// BACKGROUND CONTEXT MENU (clique direito no fundo)
// ============================================
fileArea.addEventListener('contextmenu', (e) => {
    // Só ativar se clicou no fundo, não em um item
    if (e.target.closest('.item') || e.target.closest('.grid-item')) return;
    if (e.target.closest('.sort-bar') || e.target.closest('.toolbar')) return;

    e.preventDefault();
    contextMenu.classList.remove('visible');

    const rect = bgContextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    bgContextMenu.style.left = Math.min(e.clientX, maxX) + 'px';
    bgContextMenu.style.top = Math.min(e.clientY, maxY) + 'px';
    bgContextMenu.classList.add('visible');
});

bgContextMenu.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', () => {
        const action = item.dataset.bgAction;
        bgContextMenu.classList.remove('visible');

        switch (action) {
            case 'upload-file':
                fileInput.click();
                break;
            case 'upload-folder':
                folderInput.click();
                break;
            case 'new-folder':
                showNewFolderModal();
                break;
            case 'refresh':
                loadFileList(currentPath);
                showToast('Pasta atualizada', 'info');
                break;
        }
    });
});

// ============================================
// INFO MODAL
// ============================================
function showInfoModal(target) {
    modalTitle.textContent = 'Detalhes';
    const tipoStr = target.tipo === 'dir' ? 'Pasta' : 'Arquivo';
    const typeInfo = target.tipo === 'dir' ? null : getFileTypeInfo(target.name);

    modalBody.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <span style="font-size:3rem;">${target.tipo === 'dir' ? '📁' : (typeInfo ? typeInfo.icon : '📄')}</span>
        </div>
        <div class="info-grid">
            <div class="info-row">
                <span class="info-label">Nome</span>
                <span class="info-value">${escapeHtml(target.name)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Tipo</span>
                <span class="info-value">${tipoStr}</span>
            </div>
            ${target.tamanho ? `<div class="info-row"><span class="info-label">Tamanho</span><span class="info-value">${formatBytes(target.tamanho)}</span></div>` : ''}
            ${target.data_upload ? `<div class="info-row"><span class="info-label">Data de upload</span><span class="info-value">${target.data_upload}</span></div>` : ''}
            ${target.ip_upload ? `<div class="info-row"><span class="info-label">IP de origem</span><span class="info-value">${escapeHtml(target.ip_upload)}</span></div>` : ''}
            <div class="info-row">
                <span class="info-label">Caminho</span>
                <span class="info-value" style="font-size:0.78rem; word-break:break-all;">/${escapeHtml(target.path)}</span>
            </div>
        </div>
        <div class="modal-actions">
            <button class="modal-btn modal-btn-primary" id="modal-confirm">Fechar</button>
        </div>
    `;
    showModal();
    document.getElementById('modal-confirm').addEventListener('click', hideModal);
}

// ============================================
// MODAL
// ============================================
function showModal() { modalBackdrop.classList.add('visible'); }
function hideModal() { modalBackdrop.classList.remove('visible'); }

modalClose.addEventListener('click', hideModal);
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideModal(); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideModal(); contextMenu.classList.remove('visible'); bgContextMenu.classList.remove('visible'); }
});

// ============================================
// BUSCA
// ============================================
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    searchClear.style.display = query ? 'flex' : 'none';
    clearTimeout(searchTimeout);
    if (!query) { searchResults.style.display = 'none'; return; }
    searchTimeout = setTimeout(() => performSearch(query), 300);
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchResults.style.display = 'none';
    searchInput.focus();
});

async function performSearch(query) {
    try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await resp.json();
        if (!data.ok) return;

        if (data.resultados.length === 0) {
            searchResults.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-tertiary); font-size:0.82rem;">Nenhum resultado</div>';
        } else {
            searchResults.innerHTML = data.resultados.slice(0, 20).map(r => {
                const typeInfo = r.tipo === 'dir' ? { icon: '📁' } : getFileTypeInfo(r.nome);
                return `
                    <div class="search-result-item" data-path="${escapeAttr(r.caminho)}">
                        <span class="result-icon">${typeInfo.icon}</span>
                        <div style="flex:1; min-width:0;">
                            <div class="result-name">${highlightMatch(r.nome, query)}</div>
                            <div class="result-path">/${escapeHtml(r.caminho)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const path = item.dataset.path;
                    searchResults.style.display = 'none';
                    searchInput.value = '';
                    searchClear.style.display = 'none';
                    if (path) {
                        const parts = path.split('/');
                        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                        navigateTo(parentPath);
                    }
                });
            });
        }
        searchResults.style.display = 'block';
    } catch (err) {
        console.error('Erro na busca:', err);
    }
}

function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    const idx = escaped.toLowerCase().indexOf(escapeHtml(query).toLowerCase());
    if (idx === -1) return escaped;
    return escaped.slice(0, idx) +
        '<span style="color:var(--accent-primary); font-weight:600;">' +
        escaped.slice(idx, idx + query.length) + '</span>' +
        escaped.slice(idx + query.length);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.sidebar-search')) searchResults.style.display = 'none';
});

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    });
    toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// ============================================
// PROGRESS PANEL MANAGEMENT
// ============================================
let progressCounter = 0;

function createProgressItem(type, name, totalBytes) {
    const id = 'prog-' + (++progressCounter) + '-' + Date.now();
    const icon = type === 'upload' ? '⬆️' : '⬇️';
    const iconClass = type === 'upload' ? 'upload' : 'download';
    const totalStr = totalBytes > 0 ? formatBytes(totalBytes) : '...';

    const el = document.createElement('div');
    el.className = 'progress-item';
    el.dataset.progressId = id;
    el.innerHTML = `
        <div class="progress-icon ${iconClass}">${icon}</div>
        <div class="progress-info">
            <div class="progress-header">
                <span class="progress-name">${escapeHtml(name)}</span>
                <div class="progress-stats">
                    <span class="progress-stats-size">${totalStr}</span>
                    <span class="progress-percent">0%</span>
                </div>
            </div>
            <div class="progress-bar-track">
                <div class="progress-bar-fill indeterminate" style="width: 0%;"></div>
            </div>
            <div class="progress-detail">
                <span class="progress-progress-text">Preparando...</span>
                <span class="progress-speed"></span>
                <span class="progress-eta"></span>
            </div>
        </div>
        <button class="progress-cancel" title="Cancelar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;

    progressItems.appendChild(el);
    return id;
}

function updateProgressItem(id, opts) {
    const el = progressItems.querySelector(`[data-progress-id="${id}"]`);
    if (!el) return;

    const fill = el.querySelector('.progress-bar-fill');
    const percent = el.querySelector('.progress-percent');
    const progressText = el.querySelector('.progress-progress-text');
    const speedEl = el.querySelector('.progress-speed');
    const etaEl = el.querySelector('.progress-eta');

    if (opts.total > 0 && opts.loaded >= 0) {
        const pct = Math.min(100, Math.round((opts.loaded / opts.total) * 100));
        fill.classList.remove('indeterminate');
        fill.style.width = pct + '%';
        percent.textContent = pct + '%';
        progressText.textContent = `${formatBytes(opts.loaded)} / ${formatBytes(opts.total)}`;

        if (opts.speed > 0) {
            speedEl.textContent = formatBytes(opts.speed) + '/s';
        }
        if (opts.eta > 0) {
            etaEl.textContent = '~' + formatEta(opts.eta);
        }
    } else if (opts.total === 0 && opts.loaded > 0) {
        // Sem tamanho total (streaming indeterminado)
        fill.classList.add('indeterminate');
        percent.textContent = '';
        progressText.textContent = `${formatBytes(opts.loaded)} recebidos`;
    }
}

function completeProgressItem(id, success, message) {
    const el = progressItems.querySelector(`[data-progress-id="${id}"]`);
    if (!el) return;

    const fill = el.querySelector('.progress-bar-fill');
    const percent = el.querySelector('.progress-percent');
    const progressText = el.querySelector('.progress-progress-text');
    const speedEl = el.querySelector('.progress-speed');
    const etaEl = el.querySelector('.progress-eta');
    const icon = el.querySelector('.progress-icon');
    const cancelBtn = el.querySelector('.progress-cancel');

    fill.classList.remove('indeterminate');
    fill.style.background = success ? 'var(--success)' : 'var(--danger)';
    fill.style.width = '100%';
    percent.textContent = success ? '100%' : '!';
    percent.style.color = success ? 'var(--success)' : 'var(--text-danger)';
    progressText.textContent = message;
    speedEl.textContent = '';
    etaEl.textContent = '';
    icon.className = 'progress-icon ' + (success ? 'done' : 'error');
    icon.textContent = success ? '✅' : '❌';

    // Esconder cancelar, mostrar fade-out
    if (cancelBtn) cancelBtn.style.display = 'none';

    // Auto-remover após 3 segundos
    setTimeout(() => removeProgressItem(id), 3000);
}

function removeProgressItem(id) {
    const el = progressItems.querySelector(`[data-progress-id="${id}"]`);
    if (!el) return;
    el.classList.add('removing');
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
}

function formatEta(seconds) {
    if (seconds < 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return Math.ceil(seconds) + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'min ' + Math.ceil(seconds % 60) + 's';
    return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'min';
}

// ============================================
// UTILITÁRIOS
// ============================================
function showLoading(show) {
    loadingDiv.style.display = show ? 'flex' : 'none';
    if (show) { fileListDiv.style.display = 'none'; fileGridDiv.style.display = 'none'; emptyMsg.style.display = 'none'; }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================
// STORAGE INFO
// ============================================
function loadStorageInfo() {
    const storageText = document.getElementById('storage-text');
    const storageFill = document.getElementById('storage-fill');
    fetch('/api/storage')
        .then(r => r.json())
        .then(data => {
            if (!data.ok) return;
            const used = formatBytes(data.used);
            const total = formatBytes(data.total);
            const free = formatBytes(data.free);
            storageText.textContent = `${used} / ${total} — ${free} livres`;
            storageFill.style.width = data.percent + '%';
            storageFill.classList.remove('yellow', 'orange', 'danger');
            if (data.percent >= 90) storageFill.classList.add('danger');
            else if (data.percent >= 80) storageFill.classList.add('orange');
            else if (data.percent >= 70) storageFill.classList.add('yellow');
        })
        .catch(() => {});
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'u') {
        e.preventDefault();
        fileInput.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        folderInput.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault();
        showNewFolderModal();
    }
    if (e.key === '/') {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === 'Backspace' && !e.target.closest('input')) {
        e.preventDefault();
        if (currentPath) {
            const parts = currentPath.split('/');
            parts.pop();
            navigateTo(parts.join('/'));
        }
    }
});
