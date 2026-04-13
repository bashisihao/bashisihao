(function(){
    "use strict";

    // ---------- 配置 ----------
    const CONFIG = {
        apis: {
            gutenberg: { name: 'Gutenberg', baseUrl: 'https://gutendex.com/books', color: 'gutenberg' },
            openlibrary: { name: 'Open Library', baseUrl: 'https://openlibrary.org/search.json', color: 'openlibrary' },
            google: { name: 'Google Books', baseUrl: 'https://www.googleapis.com/books/v1/volumes', color: 'google' }
        },
        // 热门书籍快捷映射
        hotBooks: [
            { title: '1984', query: 'Nineteen Eighty-Four George Orwell', author: 'George Orwell' },
            { title: 'Animal Farm', query: 'Animal Farm George Orwell', author: 'George Orwell' },
            { title: 'Pride and Prejudice', query: 'Pride and Prejudice Jane Austen', author: 'Jane Austen' },
            { title: 'Frankenstein', query: 'Frankenstein Mary Shelley', author: 'Mary Shelley' },
            { title: 'Dracula', query: 'Dracula Bram Stoker', author: 'Bram Stoker' }
        ],
        // 关键词映射表（用户输入 → 实际搜索词）
        keywordMap: {
            '1984': 'Nineteen Eighty-Four George Orwell',
            '动物农场': 'Animal Farm George Orwell',
            '动物庄园': 'Animal Farm George Orwell',
            '傲慢与偏见': 'Pride and Prejudice',
            '简爱': 'Jane Eyre',
            '呼啸山庄': 'Wuthering Heights',
            '了不起的盖茨比': 'The Great Gatsby',
            '三体': 'The Three-Body Problem'
        }
    };

    // ---------- 全局状态 ----------
    let state = {
        currentQuery: '',
        currentTab: 'all',
        selectedSources: ['gutenberg','openlibrary','google'],
        selectedLanguage: '',
        groupedResults: { gutenberg:[], openlibrary:[], google:[] },
        totalResults: 0
    };

    // ---------- DOM 元素 ----------
    const $ = id => document.getElementById(id);
    const elements = {
        searchInput: $('searchInput'),
        searchBtn: $('searchBtn'),
        clearBtn: $('clearBtn'),
        langSelect: $('langSelect'),
        resultsContainer: $('resultsContainer'),
        statusMessage: $('statusMessage'),
        loadingIndicator: $('loadingIndicator'),
        pagination: $('pagination'),
        modal: $('bookModal'),
        modalBody: $('modalBody'),
        modalClose: document.querySelector('.modal-close'),
        modalOverlay: document.querySelector('.modal-overlay')
    };

    // ---------- 辅助函数 ----------
    const escapeHtml = text => {
        if (!text) return '';
        const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
        return String(text).replace(/[&<>"']/g, m => map[m]);
    };
    const formatNumber = num => num >= 1e6 ? (num/1e6).toFixed(1)+'M' : num >= 1e3 ? (num/1e3).toFixed(1)+'K' : String(num);

    const showStatus = (msg, type='info') => {
        elements.statusMessage.style.display = 'block';
        elements.statusMessage.className = `status-message ${type}`;
        elements.statusMessage.textContent = msg;
    };
    const hideStatus = () => elements.statusMessage.style.display = 'none';
    const showLoading = () => {
        elements.loadingIndicator.style.display = 'flex';
        elements.resultsContainer.innerHTML = '';
        elements.pagination.style.display = 'none';
    };
    const hideLoading = () => elements.loadingIndicator.style.display = 'none';

    // 更新选中的数据源
    const updateSelectedSources = () => {
        state.selectedSources = Array.from(document.querySelectorAll('.source-checkboxes input:checked')).map(cb => cb.value);
    };

    // 智能处理搜索词（应用映射表）
    function smartQuery(rawQuery) {
        const trimmed = rawQuery.trim();
        // 优先检查完全匹配的映射
        if (CONFIG.keywordMap[trimmed]) {
            return CONFIG.keywordMap[trimmed];
        }
        // 模糊匹配：如果是纯数字年份，建议加上书名关键词
        if (/^\d{4}$/.test(trimmed)) {
            return `"${trimmed}" novel`; // 加引号搜索年份相关小说
        }
        return trimmed;
    }

    // ---------- API 请求（带超时控制） ----------
    const fetchWithTimeout = (url, timeout = 8000) => {
        return Promise.race([
            fetch(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), timeout))
        ]);
    };

    async function searchGutenberg(query) {
        const finalQuery = smartQuery(query);
        const url = new URL(CONFIG.apis.gutenberg.baseUrl);
        url.searchParams.append('search', finalQuery);
        if (state.selectedLanguage) url.searchParams.append('languages', state.selectedLanguage);
        try {
            const res = await fetchWithTimeout(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return (data.results || []).map(book => ({
                id: `gutenberg_${book.id}`,
                source: 'gutenberg',
                sourceName: 'Project Gutenberg',
                title: book.title || '未知书名',
                authors: (book.authors || []).map(a => a.name).join(', ') || '未知作者',
                description: (book.subjects || []).slice(0,3).join('、') || '经典公共版权书籍',
                coverUrl: book.formats?.['image/jpeg'] || null,
                downloadLinks: book.formats || {},
                downloadCount: book.download_count || 0,
                language: book.languages?.[0] || 'unknown'
            }));
        } catch(e) {
            console.warn('Gutenberg 搜索失败:', e);
            return [];
        }
    }

    async function searchOpenLibrary(query) {
        const finalQuery = smartQuery(query);
        const url = new URL(CONFIG.apis.openlibrary.baseUrl);
        url.searchParams.append('q', finalQuery);
        url.searchParams.append('limit', '30');
        if (state.selectedLanguage) url.searchParams.append('language', state.selectedLanguage);
        try {
            const res = await fetchWithTimeout(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return (data.docs || []).map(book => {
                const coverId = book.cover_i;
                return {
                    id: `openlibrary_${book.key}`,
                    source: 'openlibrary',
                    sourceName: 'Open Library',
                    title: book.title || '未知书名',
                    authors: (book.author_name || []).join(', ') || '未知作者',
                    description: (book.subject || []).slice(0,3).join('、') || '暂无描述',
                    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
                    downloadLinks: {
                        read: `https://openlibrary.org${book.key}`,
                        borrow: book.ia?.length ? `https://archive.org/details/${book.ia[0]}` : null
                    },
                    publishYear: book.first_publish_year,
                    language: book.language?.[0] || 'unknown'
                };
            });
        } catch(e) {
            console.warn('Open Library 搜索失败:', e);
            return [];
        }
    }

    async function searchGoogleBooks(query) {
        const finalQuery = smartQuery(query);
        const url = new URL(CONFIG.apis.google.baseUrl);
        url.searchParams.append('q', finalQuery);
        url.searchParams.append('maxResults', '30');
        if (state.selectedLanguage) url.searchParams.append('langRestrict', state.selectedLanguage);
        try {
            const res = await fetchWithTimeout(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return (data.items || []).map(item => {
                const info = item.volumeInfo;
                return {
                    id: `google_${item.id}`,
                    source: 'google',
                    sourceName: 'Google Books',
                    title: info.title || '未知书名',
                    authors: (info.authors || []).join(', ') || '未知作者',
                    description: info.description ? info.description.substring(0,200)+'...' : '暂无描述',
                    coverUrl: info.imageLinks?.thumbnail?.replace('http://','https://') || null,
                    downloadLinks: { preview: info.previewLink, info: info.infoLink },
                    publishDate: info.publishedDate,
                    language: info.language || 'unknown'
                };
            });
        } catch(e) {
            console.warn('Google Books 搜索失败:', e);
            return [];
        }
    }

    // ---------- 搜索主流程 ----------
    async function handleSearch() {
        const query = elements.searchInput.value.trim();
        if (!query) return showStatus('请输入搜索关键词', 'warning');
        
        state.currentQuery = query;
        state.selectedLanguage = elements.langSelect.value;
        updateSelectedSources();
        if (state.selectedSources.length === 0) return showStatus('请至少选择一个数据源', 'warning');

        hideStatus();
        showLoading();

        try {
            const promises = [];
            if (state.selectedSources.includes('gutenberg')) promises.push(searchGutenberg(query));
            if (state.selectedSources.includes('openlibrary')) promises.push(searchOpenLibrary(query));
            if (state.selectedSources.includes('google')) promises.push(searchGoogleBooks(query));

            const results = await Promise.allSettled(promises);
            state.groupedResults = { gutenberg:[], openlibrary:[], google:[] };
            
            let idx = 0;
            if (state.selectedSources.includes('gutenberg')) state.groupedResults.gutenberg = results[idx++]?.value || [];
            if (state.selectedSources.includes('openlibrary')) state.groupedResults.openlibrary = results[idx++]?.value || [];
            if (state.selectedSources.includes('google')) state.groupedResults.google = results[idx++]?.value || [];

            state.totalResults = Object.values(state.groupedResults).flat().length;
            state.currentTab = 'all';
            renderResults();

            if (state.totalResults === 0) {
                // 给出智能建议
                let suggestion = '';
                if (query === '1984') suggestion = ' 试试搜索 "Nineteen Eighty-Four" 或点击下方热门书籍';
                showStatus(`未找到与 "${query}" 相关的书籍。${suggestion}`, 'info');
            }
        } catch(e) {
            console.error(e);
            showStatus('搜索出错，请稍后重试', 'error');
        } finally {
            hideLoading();
        }
    }

    // ---------- 渲染结果 ----------
    function renderResults() {
        if (state.totalResults === 0) {
            // 显示热门书籍推荐
            const hotHtml = CONFIG.hotBooks.map(b => 
                `<span class="example-tag" data-query="${b.query}" style="margin:0.25rem;">📖 ${b.title}</span>`
            ).join('');
            elements.resultsContainer.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">📭</div>
                    <h3>暂无搜索结果</h3>
                    <p>试试下面的热门书籍，或调整关键词</p>
                    <div class="example-searches" style="margin-top:1rem;">${hotHtml}</div>
                </div>
            `;
            document.querySelectorAll('.example-tag').forEach(t => {
                t.addEventListener('click', ()=>{
                    elements.searchInput.value = t.dataset.query;
                    handleSearch();
                });
            });
            return;
        }

        const allBooks = [...state.groupedResults.gutenberg, ...state.groupedResults.openlibrary, ...state.groupedResults.google];
        const total = state.totalResults;
        
        let html = `
            <div class="results-header">
                <div class="results-count">共找到 ${total} 本相关书籍</div>
                <div class="source-tabs">
                    <span class="source-tab ${state.currentTab==='all'?'active':''}" data-tab="all">全部 (${total})</span>
                    ${state.groupedResults.gutenberg.length ? `<span class="source-tab" data-tab="gutenberg">Gutenberg (${state.groupedResults.gutenberg.length})</span>` : ''}
                    ${state.groupedResults.openlibrary.length ? `<span class="source-tab" data-tab="openlibrary">Open Library (${state.groupedResults.openlibrary.length})</span>` : ''}
                    ${state.groupedResults.google.length ? `<span class="source-tab" data-tab="google">Google Books (${state.groupedResults.google.length})</span>` : ''}
                </div>
            </div>
            <div class="books-grid">${renderBookCards(allBooks)}</div>
        `;
        elements.resultsContainer.innerHTML = html;

        // 标签切换
        document.querySelectorAll('.source-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });
        // 卡片详情
        document.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('click', e => {
                if (!e.target.closest('.btn')) showBookDetail(card.dataset.id);
            });
        });
    }

    function renderBookCards(books) {
        return books.map(book => `
            <div class="book-card" data-id="${book.id}">
                <span class="book-source ${book.source}">${book.sourceName}</span>
                ${book.coverUrl ? `<img class="book-cover" src="${book.coverUrl}" alt="${escapeHtml(book.title)}" loading="lazy" onerror="this.outerHTML='<div class=\\'book-cover-placeholder\\'>${book.title?.charAt(0)||'📖'}</div>'">` 
                               : `<div class="book-cover-placeholder">${book.title?.charAt(0)||'📖'}</div>`}
                <div class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</div>
                <div class="book-author" title="${escapeHtml(book.authors)}">${escapeHtml(book.authors)}</div>
                <div class="book-meta">
                    ${book.publishYear ? `<span>📅 ${book.publishYear}</span>` : ''}
                    ${book.downloadCount ? `<span>⬇ ${formatNumber(book.downloadCount)}</span>` : ''}
                </div>
                <div class="book-actions">
                    ${renderActionButtons(book)}
                    <button class="btn btn-secondary" onclick="event.stopPropagation();showBookDetail('${book.id}')">详情</button>
                </div>
            </div>
        `).join('');
    }

    function renderActionButtons(book) {
        const btns = [];
        if (book.source === 'gutenberg') {
            const fmt = book.downloadLinks;
            if (fmt['application/epub+zip']) {
                btns.push(`<a href="${fmt['application/epub+zip']}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">⬇ EPUB</a>`);
            } else if (fmt['text/plain; charset=utf-8']) {
                btns.push(`<a href="${fmt['text/plain; charset=utf-8']}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">⬇ TXT</a>`);
            } else {
                btns.push(`<a href="https://www.gutenberg.org/ebooks/${book.id.split('_')[1]}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">📖 前往</a>`);
            }
            // 如果有PDF也显示
            if (fmt['application/pdf']) {
                btns.push(`<a href="${fmt['application/pdf']}" target="_blank" class="btn btn-secondary" onclick="event.stopPropagation()">PDF</a>`);
            }
        } else if (book.source === 'openlibrary') {
            if (book.downloadLinks.read) btns.push(`<a href="${book.downloadLinks.read}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">📖 阅读</a>`);
        } else if (book.source === 'google') {
            if (book.downloadLinks.preview) btns.push(`<a href="${book.downloadLinks.preview}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">👁 预览</a>`);
        }
        return btns.join('');
    }

    function switchTab(source) {
        state.currentTab = source;
        let books = source === 'all' ? [...state.groupedResults.gutenberg, ...state.groupedResults.openlibrary, ...state.groupedResults.google] : state.groupedResults[source] || [];
        const gridHtml = `<div class="books-grid">${renderBookCards(books)}</div>`;
        document.querySelector('.books-grid').outerHTML = gridHtml;
        document.querySelectorAll('.source-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === source));
        document.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('click', e => {
                if (!e.target.closest('.btn')) showBookDetail(card.dataset.id);
            });
        });
    }

    window.showBookDetail = function(bookId) {
        let book = null;
        for (let src of ['gutenberg','openlibrary','google']) {
            book = state.groupedResults[src]?.find(b => b.id === bookId);
            if (book) break;
        }
        if (!book) return;
        const detailHtml = `
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                <div style="flex-shrink:0;">${book.coverUrl ? `<img src="${book.coverUrl}" style="width:120px;border-radius:8px;">` : `<div class="book-cover-placeholder" style="width:120px;">${book.title?.charAt(0)||'📖'}</div>`}</div>
                <div style="flex:1;">
                    <span class="book-source ${book.source}">${book.sourceName}</span>
                    <h2>${escapeHtml(book.title)}</h2>
                    <p><strong>作者：</strong>${escapeHtml(book.authors)}</p>
                    ${book.publishYear ? `<p><strong>出版年份：</strong>${book.publishYear}</p>` : ''}
                    ${book.publishDate ? `<p><strong>出版日期：</strong>${book.publishDate}</p>` : ''}
                    <p><strong>简介：</strong>${escapeHtml(book.description)}</p>
                    <div style="display:flex;gap:0.75rem;margin-top:1rem;flex-wrap:wrap;">
                        ${(()=>{
                            if(book.source==='gutenberg'){
                                const fmt = book.downloadLinks;
                                let btns = '';
                                if(fmt['application/epub+zip']) btns += `<a href="${fmt['application/epub+zip']}" target="_blank" class="btn btn-primary">⬇ EPUB</a>`;
                                if(fmt['text/plain; charset=utf-8']) btns += `<a href="${fmt['text/plain; charset=utf-8']}" target="_blank" class="btn btn-secondary">TXT</a>`;
                                if(fmt['application/pdf']) btns += `<a href="${fmt['application/pdf']}" target="_blank" class="btn btn-secondary">PDF</a>`;
                                if(fmt['application/x-mobipocket-ebook']) btns += `<a href="${fmt['application/x-mobipocket-ebook']}" target="_blank" class="btn btn-secondary">Kindle</a>`;
                                return btns || `<a href="https://www.gutenberg.org/ebooks/${book.id.split('_')[1]}" target="_blank" class="btn btn-primary">前往下载页</a>`;
                            }else if(book.source==='openlibrary'){
                                return book.downloadLinks.read ? `<a href="${book.downloadLinks.read}" target="_blank" class="btn btn-primary">在线阅读</a>` : '';
                            }else{
                                return book.downloadLinks.preview ? `<a href="${book.downloadLinks.preview}" target="_blank" class="btn btn-primary">预览</a>` : '';
                            }
                        })()}
                    </div>
                </div>
            </div>
        `;
        elements.modalBody.innerHTML = detailHtml;
        elements.modal.style.display = 'flex';
    };

    function closeModal() { elements.modal.style.display = 'none'; }

    // 添加热门书籍到欢迎面板
    function enhanceWelcomePanel() {
        const exampleDiv = document.querySelector('.example-searches');
        if (exampleDiv) {
            // 清空原有示例，替换为热门书籍
            const hotBooksHtml = CONFIG.hotBooks.map(b => 
                `<span class="example-tag" data-query="${b.query}">🔥 ${b.title}</span>`
            ).join('');
            exampleDiv.innerHTML = hotBooksHtml + `<span class="example-tag" data-query="Sherlock Holmes">Sherlock Holmes</span>`;
        }
    }

    // ---------- 初始化事件 ----------
    function init() {
        elements.searchBtn.addEventListener('click', handleSearch);
        elements.searchInput.addEventListener('keypress', e => e.key==='Enter' && handleSearch());
        elements.clearBtn.addEventListener('click', ()=>{
            document.querySelectorAll('.source-checkboxes input').forEach(cb => cb.checked = true);
            elements.langSelect.value = '';
            updateSelectedSources();
        });
        // 绑定所有示例标签（包括动态生成的）
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-tag')) {
                elements.searchInput.value = e.target.dataset.query;
                handleSearch();
            }
        });
        elements.modalClose?.addEventListener('click', closeModal);
        elements.modalOverlay?.addEventListener('click', closeModal);
        document.addEventListener('keydown', e => e.key==='Escape' && closeModal());
        updateSelectedSources();
        enhanceWelcomePanel();
    }

    init();
})();