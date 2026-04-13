/**
 * 简搜 - 免费电子书聚合搜索
 * 支持多API并发搜索，动态获取电子书信息
 */

// ===== 全局配置 =====
const CONFIG = {
    // API 端点
    apis: {
        gutenberg: {
            name: 'Gutenberg',
            baseUrl: 'https://gutendex.com/books',
            color: 'gutenberg'
        },
        openlibrary: {
            name: 'Open Library',
            baseUrl: 'https://openlibrary.org/search.json',
            color: 'openlibrary'
        },
        google: {
            name: 'Google Books',
            baseUrl: 'https://www.googleapis.com/books/v1/volumes',
            color: 'google'
        }
    },
    // 每页结果数
    pageSize: 20
};

// ===== 全局状态 =====
let state = {
    currentQuery: '',
    currentPage: 1,
    totalResults: 0,
    selectedSources: ['gutenberg', 'openlibrary', 'google'],
    selectedLanguage: '',
    allResults: [],
    groupedResults: { gutenberg: [], openlibrary: [], google: [] }
};

// ===== DOM 元素 =====
const elements = {
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    clearBtn: document.getElementById('clearBtn'),
    langSelect: document.getElementById('langSelect'),
    resultsContainer: document.getElementById('resultsContainer'),
    statusMessage: document.getElementById('statusMessage'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    pagination: document.getElementById('pagination'),
    modal: document.getElementById('bookModal'),
    modalBody: document.getElementById('modalBody'),
    modalClose: document.querySelector('.modal-close'),
    modalOverlay: document.querySelector('.modal-overlay')
};

// ===== 初始化 =====
function init() {
    // 绑定事件
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    elements.clearBtn.addEventListener('click', clearFilters);
    
    // 数据源复选框事件
    document.querySelectorAll('.source-checkboxes input').forEach(cb => {
        cb.addEventListener('change', updateSelectedSources);
    });
    
    // 示例搜索标签
    document.querySelectorAll('.example-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            elements.searchInput.value = tag.dataset.query;
            handleSearch();
        });
    });
    
    // 模态框事件
    elements.modalClose?.addEventListener('click', closeModal);
    elements.modalOverlay?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
    
    updateSelectedSources();
}

// ===== 更新选中的数据源 =====
function updateSelectedSources() {
    state.selectedSources = Array.from(
        document.querySelectorAll('.source-checkboxes input:checked')
    ).map(cb => cb.value);
}

// ===== 清除筛选 =====
function clearFilters() {
    document.querySelectorAll('.source-checkboxes input').forEach(cb => cb.checked = true);
    elements.langSelect.value = '';
    state.selectedSources = ['gutenberg', 'openlibrary', 'google'];
    state.selectedLanguage = '';
}

// ===== 显示状态消息 =====
function showStatus(message, type = 'info') {
    elements.statusMessage.style.display = 'block';
    elements.statusMessage.className = `status-message ${type}`;
    elements.statusMessage.textContent = message;
}

function hideStatus() {
    elements.statusMessage.style.display = 'none';
}

// ===== 显示/隐藏加载动画 =====
function showLoading() {
    elements.loadingIndicator.style.display = 'flex';
    elements.resultsContainer.innerHTML = '';
    elements.pagination.style.display = 'none';
}

function hideLoading() {
    elements.loadingIndicator.style.display = 'none';
}

// ===== 搜索处理 =====
async function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (!query) {
        showStatus('请输入搜索关键词', 'warning');
        return;
    }
    
    state.currentQuery = query;
    state.currentPage = 1;
    state.selectedLanguage = elements.langSelect.value;
    
    hideStatus();
    showLoading();
    
    try {
        // 并发请求所有选中的数据源
        const promises = [];
        const sources = [];
        
        if (state.selectedSources.includes('gutenberg')) {
            promises.push(searchGutenberg(query));
            sources.push('gutenberg');
        }
        if (state.selectedSources.includes('openlibrary')) {
            promises.push(searchOpenLibrary(query));
            sources.push('openlibrary');
        }
        if (state.selectedSources.includes('google')) {
            promises.push(searchGoogleBooks(query));
            sources.push('google');
        }
        
        if (promises.length === 0) {
            showStatus('请至少选择一个数据源', 'warning');
            hideLoading();
            return;
        }
        
        // 等待所有请求完成（使用 allSettled 避免单个失败影响整体）
        const results = await Promise.allSettled(promises);
        
        // 处理结果
        state.groupedResults = { gutenberg: [], openlibrary: [], google: [] };
        
        results.forEach((result, index) => {
            const source = sources[index];
            if (result.status === 'fulfilled' && result.value) {
                state.groupedResults[source] = result.value;
            } else {
                console.warn(`搜索 ${source} 失败:`, result.reason);
            }
        });
        
        // 计算总数
        state.totalResults = Object.values(state.groupedResults).reduce((sum, arr) => sum + arr.length, 0);
        
        // 渲染结果
        renderResults();
        
        if (state.totalResults === 0) {
            showStatus('未找到相关书籍，请尝试其他关键词', 'info');
        }
        
    } catch (error) {
        console.error('搜索出错:', error);
        showStatus('搜索时发生错误，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

// ===== 搜索 Gutenberg (Gutendex API) =====
async function searchGutenberg(query) {
    const url = new URL(CONFIG.apis.gutenberg.baseUrl);
    url.searchParams.append('search', query);
    if (state.selectedLanguage) {
        url.searchParams.append('languages', state.selectedLanguage);
    }
    
    try {
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        return (data.results || []).map(book => ({
            id: `gutenberg_${book.id}`,
            source: 'gutenberg',
            sourceName: 'Project Gutenberg',
            title: book.title || '未知书名',
            authors: (book.authors || []).map(a => a.name).join(', ') || '未知作者',
            description: book.subjects?.slice(0, 3).join(', ') || '经典公共版权书籍',
            coverUrl: book.formats?.['image/jpeg'] || null,
            downloadLinks: book.formats || {},
            downloadCount: book.download_count || 0,
            language: book.languages?.[0] || 'unknown',
            rawData: book
        }));
    } catch (error) {
        console.error('Gutenberg搜索失败:', error);
        return [];
    }
}

// ===== 搜索 Open Library =====
async function searchOpenLibrary(query) {
    const url = new URL(CONFIG.apis.openlibrary.baseUrl);
    url.searchParams.append('q', query);
    url.searchParams.append('limit', '40');
    if (state.selectedLanguage) {
        url.searchParams.append('language', state.selectedLanguage);
    }
    
    try {
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        return (data.docs || []).map(book => {
            const coverId = book.cover_i;
            const coverUrl = coverId 
                ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
                : null;
            
            return {
                id: `openlibrary_${book.key}`,
                source: 'openlibrary',
                sourceName: 'Open Library',
                title: book.title || '未知书名',
                authors: book.author_name?.join(', ') || '未知作者',
                description: book.subject?.slice(0, 3).join(', ') || '暂无描述',
                coverUrl: coverUrl,
                downloadLinks: {
                    read: `https://openlibrary.org${book.key}`,
                    borrow: book.ia?.length ? `https://archive.org/details/${book.ia[0]}` : null
                },
                publishYear: book.first_publish_year,
                language: book.language?.[0] || 'unknown',
                rawData: book
            };
        });
    } catch (error) {
        console.error('Open Library搜索失败:', error);
        return [];
    }
}

// ===== 搜索 Google Books =====
async function searchGoogleBooks(query) {
    const url = new URL(CONFIG.apis.google.baseUrl);
    url.searchParams.append('q', query);
    url.searchParams.append('maxResults', '40');
    if (state.selectedLanguage) {
        url.searchParams.append('langRestrict', state.selectedLanguage);
    }
    
    try {
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        return (data.items || []).map(item => {
            const info = item.volumeInfo;
            return {
                id: `google_${item.id}`,
                source: 'google',
                sourceName: 'Google Books',
                title: info.title || '未知书名',
                authors: info.authors?.join(', ') || '未知作者',
                description: info.description?.substring(0, 200) + '...' || '暂无描述',
                coverUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
                downloadLinks: {
                    preview: info.previewLink,
                    info: info.infoLink
                },
                publishDate: info.publishedDate,
                language: info.language || 'unknown',
                rawData: item
            };
        });
    } catch (error) {
        console.error('Google Books搜索失败:', error);
        return [];
    }
}

// ===== 渲染结果 =====
function renderResults() {
    if (state.totalResults === 0) {
        renderNoResults();
        return;
    }
    
    let html = `
        <div class="results-header">
            <div class="results-count">共找到 ${state.totalResults} 本相关书籍</div>
            <div class="source-tabs">
                <span class="source-tab ${getActiveTabClass('all')}" data-tab="all">
                    全部 (${state.totalResults})
                </span>
                ${renderSourceTab('gutenberg')}
                ${renderSourceTab('openlibrary')}
                ${renderSourceTab('google')}
            </div>
        </div>
        <div class="books-grid" id="booksGrid">
            ${renderBookCards()}
        </div>
    `;
    
    elements.resultsContainer.innerHTML = html;
    
    // 绑定标签切换事件
    document.querySelectorAll('.source-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // 绑定卡片点击事件
    document.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.btn')) {
                showBookDetail(card.dataset.id);
            }
        });
    });
}

// ===== 辅助渲染函数 =====
function renderSourceTab(source) {
    const count = state.groupedResults[source]?.length || 0;
    if (count === 0) return '';
    return `<span class="source-tab" data-tab="${source}">${CONFIG.apis[source]?.name || source} (${count})</span>`;
}

function getActiveTabClass(tab) {
    return state.currentTab === tab ? 'active' : '';
}

function renderBookCards(source = 'all') {
    let books = [];
    if (source === 'all') {
        books = [
            ...state.groupedResults.gutenberg,
            ...state.groupedResults.openlibrary,
            ...state.groupedResults.google
        ];
    } else {
        books = state.groupedResults[source] || [];
    }
    
    return books.map(book => `
        <div class="book-card" data-id="${book.id}">
            <span class="book-source ${book.source}">${book.sourceName}</span>
            ${renderBookCover(book)}
            <div class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</div>
            <div class="book-author" title="${escapeHtml(book.authors)}">${escapeHtml(book.authors)}</div>
            <div class="book-meta">
                ${book.publishYear ? `<span>📅 ${book.publishYear}</span>` : ''}
                ${book.downloadCount ? `<span>⬇ ${formatNumber(book.downloadCount)}</span>` : ''}
            </div>
            <div class="book-actions">
                ${renderDownloadButtons(book)}
            </div>
        </div>
    `).join('');
}

function renderBookCover(book) {
    if (book.coverUrl) {
        return `<img class="book-cover" src="${book.coverUrl}" alt="${escapeHtml(book.title)}" loading="lazy" onerror="this.parentElement.innerHTML='${renderPlaceholder(book)}'">`;
    }
    return renderPlaceholder(book);
}

function renderPlaceholder(book) {
    const initial = book.title?.charAt(0) || '📖';
    return `<div class="book-cover-placeholder">${initial}</div>`;
}

function renderDownloadButtons(book) {
    const buttons = [];
    
    if (book.source === 'gutenberg') {
        const formats = book.downloadLinks || {};
        if (formats['application/epub+zip']) {
            buttons.push(`<a href="${formats['application/epub+zip']}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">⬇ EPUB</a>`);
        }
        if (formats['text/plain; charset=utf-8']) {
            buttons.push(`<a href="${formats['text/plain; charset=utf-8']}" target="_blank" class="btn btn-secondary" onclick="event.stopPropagation()">TXT</a>`);
        }
    } else if (book.source === 'openlibrary') {
        if (book.downloadLinks?.read) {
            buttons.push(`<a href="${book.downloadLinks.read}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">📖 阅读</a>`);
        }
    } else if (book.source === 'google') {
        if (book.downloadLinks?.preview) {
            buttons.push(`<a href="${book.downloadLinks.preview}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">👁 预览</a>`);
        }
    }
    
    // 详情按钮
    buttons.push(`<button class="btn btn-secondary" onclick="event.stopPropagation();showBookDetail('${book.id}')">详情</button>`);
    
    return buttons.join('');
}

// ===== 切换标签 =====
function switchTab(source) {
    state.currentTab = source;
    const grid = document.getElementById('booksGrid');
    if (grid) {
        grid.innerHTML = renderBookCards(source);
        grid.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.btn')) {
                    showBookDetail(card.dataset.id);
                }
            });
        });
    }
    
    // 更新标签激活状态
    document.querySelectorAll('.source-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === source);
    });
}

// ===== 显示无结果 =====
function renderNoResults() {
    elements.resultsContainer.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">📭</div>
            <h3>暂无搜索结果</h3>
            <p>尝试使用其他关键词，或调整筛选条件</p>
            <div class="example-searches" style="margin-top: 1.5rem;">
                <span class="example-tag" data-query="1984">1984</span>
                <span class="example-tag" data-query="Pride and Prejudice">Pride and Prejudice</span>
                <span class="example-tag" data-query="Sherlock Holmes">Sherlock Holmes</span>
            </div>
        </div>
    `;
    
    document.querySelectorAll('.example-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            elements.searchInput.value = tag.dataset.query;
            handleSearch();
        });
    });
}

// ===== 显示书籍详情 =====
function showBookDetail(bookId) {
    // 查找书籍
    let book = null;
    for (const source of ['gutenberg', 'openlibrary', 'google']) {
        book = state.groupedResults[source]?.find(b => b.id === bookId);
        if (book) break;
    }
    
    if (!book) return;
    
    const detailHtml = `
        <div class="book-detail">
            <div class="book-detail-header">
                ${book.coverUrl 
                    ? `<img src="${book.coverUrl}" alt="${escapeHtml(book.title)}" style="width: 120px; border-radius: 8px;">`
                    : renderPlaceholder(book)
                }
                <div>
                    <span class="book-source ${book.source}" style="display: inline-block; margin-bottom: 0.5rem;">${book.sourceName}</span>
                    <h2>${escapeHtml(book.title)}</h2>
                    <p><strong>作者：</strong>${escapeHtml(book.authors)}</p>
                    ${book.publishYear ? `<p><strong>出版年份：</strong>${book.publishYear}</p>` : ''}
                    ${book.publishDate ? `<p><strong>出版日期：</strong>${book.publishDate}</p>` : ''}
                    ${book.language ? `<p><strong>语言：</strong>${book.language}</p>` : ''}
                    ${book.downloadCount ? `<p><strong>下载次数：</strong>${formatNumber(book.downloadCount)}</p>` : ''}
                </div>
            </div>
            <div class="book-detail-description">
                <h3>简介</h3>
                <p>${escapeHtml(book.description || '暂无简介')}</p>
            </div>
            <div class="book-detail-downloads">
                <h3>下载/阅读</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
                    ${renderDetailDownloadButtons(book)}
                </div>
            </div>
        </div>
    `;
    
    elements.modalBody.innerHTML = detailHtml;
    elements.modal.style.display = 'flex';
}

function renderDetailDownloadButtons(book) {
    const buttons = [];
    
    if (book.source === 'gutenberg') {
        const formats = book.downloadLinks || {};
        Object.entries(formats).forEach(([mime, url]) => {
            if (mime.startsWith('application/') || mime.startsWith('text/')) {
                const formatName = mime.includes('epub') ? 'EPUB' 
                    : mime.includes('pdf') ? 'PDF'
                    : mime.includes('text') ? 'TXT'
                    : mime.includes('kindle') ? 'Kindle'
                    : '下载';
                buttons.push(`<a href="${url}" target="_blank" class="btn btn-primary">⬇ ${formatName}</a>`);
            }
        });
    } else if (book.source === 'openlibrary') {
        if (book.downloadLinks?.read) {
            buttons.push(`<a href="${book.downloadLinks.read}" target="_blank" class="btn btn-primary">📖 在线阅读</a>`);
        }
        if (book.downloadLinks?.borrow) {
            buttons.push(`<a href="${book.downloadLinks.borrow}" target="_blank" class="btn btn-secondary">📚 借阅</a>`);
        }
    } else if (book.source === 'google') {
        if (book.downloadLinks?.preview) {
            buttons.push(`<a href="${book.downloadLinks.preview}" target="_blank" class="btn btn-primary">👁 预览</a>`);
        }
        if (book.downloadLinks?.info) {
            buttons.push(`<a href="${book.downloadLinks.info}" target="_blank" class="btn btn-secondary">ℹ️ 详情</a>`);
        }
    }
    
    return buttons.join('');
}

function closeModal() {
    elements.modal.style.display = 'none';
}

// ===== 工具函数 =====
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// ===== 启动应用 =====
init();