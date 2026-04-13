(function(){
    "use strict";

    // ---------- 全局配置 ----------
    const CONFIG = {
        // 中文API配置 (主用)
        zhPrimary: {
            name: '追书神器 (中文)',
            baseUrl: 'https://api.zhuishushenqi.com/book/fuzzy-search',
            color: 'zhuishu'
        },
        // 备用API配置 (鸠摩搜书 - 仅供参考，直接调用较复杂，此处仅作示例)
        zhBackup: {
            name: '鸠摩搜书',
            baseUrl: 'https://www.jiumodiary.com/search',
            color: 'jiumo'
        },
        // 原英文API配置 (保留，用于搜索外文书)
        enApis: {
            gutenberg: { name: 'Gutenberg', baseUrl: 'https://gutendex.com/books', color: 'gutenberg' },
            openlibrary: { name: 'Open Library', baseUrl: 'https://openlibrary.org/search.json', color: 'openlibrary' }
        }
    };

    // ---------- 全局状态 ----------
    let state = {
        currentQuery: '',
        currentTab: 'all',
        searchMode: 'zh', // 'zh' 或 'en'
        selectedSources: ['zhuishu'], // 默认选中中文源
        groupedResults: { zhuishu: [] },
        totalResults: 0,
        // 为英文API预留状态
        enGroupedResults: { gutenberg: [], openlibrary: [] }
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
        modal: $('bookModal'),
        modalBody: $('modalBody'),
        modalClose: document.querySelector('.modal-close'),
        modalOverlay: document.querySelector('.modal-overlay'),
        // 复选框
        chkZhuishu: $('chkZhuishu'),
        chkGutenberg: $('chkGutenberg'),
        chkOpenlibrary: $('chkOpenlibrary'),
        chkGoogle: $('chkGoogle')
    };

    // ---------- 辅助函数 ----------
    const escapeHtml = text => {
        if (!text) return '';
        const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
        return String(text).replace(/[&<>"']/g, m => map[m]);
    };

    const showStatus = (msg, type='info') => {
        elements.statusMessage.style.display = 'block';
        elements.statusMessage.className = `status-message ${type}`;
        elements.statusMessage.textContent = msg;
    };
    const hideStatus = () => elements.statusMessage.style.display = 'none';
    const showLoading = () => {
        elements.loadingIndicator.style.display = 'flex';
        elements.resultsContainer.innerHTML = '';
    };
    const hideLoading = () => elements.loadingIndicator.style.display = 'none';

    // 更新选中的数据源
    const updateSelectedSources = () => {
        state.selectedSources = [];
        if (elements.chkZhuishu.checked) state.selectedSources.push('zhuishu');
        if (elements.chkGutenberg.checked) state.selectedSources.push('gutenberg');
        if (elements.chkOpenlibrary.checked) state.selectedSources.push('openlibrary');
        if (elements.chkGoogle.checked) state.selectedSources.push('google');
    };

    // ---------- 修改HTML，添加新的复选框 ----------
    function updateCheckboxes() {
        const sourceDiv = document.querySelector('.source-checkboxes');
        if (sourceDiv) {
            sourceDiv.innerHTML = `
                <label class="checkbox-item"><input type="checkbox" value="zhuishu" id="chkZhuishu" checked> 追书神器 (中文)</label>
                <label class="checkbox-item"><input type="checkbox" value="gutenberg" id="chkGutenberg"> Gutenberg</label>
                <label class="checkbox-item"><input type="checkbox" value="openlibrary" id="chkOpenlibrary"> Open Library</label>
                <label class="checkbox-item"><input type="checkbox" value="google" id="chkGoogle"> Google Books</label>
            `;
            // 重新获取元素
            elements.chkZhuishu = $('chkZhuishu');
            elements.chkGutenberg = $('chkGutenberg');
            elements.chkOpenlibrary = $('chkOpenlibrary');
            elements.chkGoogle = $('chkGoogle');
        }
    }

    // ---------- API 请求 ----------
    async function searchZhuiShu(query) {
        const url = new URL(CONFIG.zhPrimary.baseUrl);
        url.searchParams.append('query', query);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return (data.books || []).map(book => ({
                id: `zhuishu_${book._id}`,
                source: 'zhuishu',
                sourceName: '追书神器',
                title: book.title || '未知书名',
                authors: book.author || '未知作者',
                description: book.shortIntro || '暂无描述',
                coverUrl: book.cover ? `https://statics.zhuishushenqi.com${book.cover}` : null,
                // 追书神器API主要提供在线阅读，这里生成一个阅读链接
                downloadLinks: {
                    read: `https://www.zhuishushenqi.com/book/${book._id}`
                },
                language: 'zh',
                rawData: book
            }));
        } catch(e) {
            console.warn('追书神器搜索失败:', e);
            return [];
        }
    }

    // 英文API保留原函数，此处略...
    
    // ---------- 搜索主流程 ----------
    async function handleSearch() {
        const query = elements.searchInput.value.trim();
        if (!query) return showStatus('请输入搜索关键词', 'warning');
        
        state.currentQuery = query;
        updateSelectedSources();
        if (state.selectedSources.length === 0) return showStatus('请至少选择一个数据源', 'warning');

        hideStatus();
        showLoading();

        try {
            state.groupedResults = { zhuishu: [] };
            state.enGroupedResults = { gutenberg: [], openlibrary: [] };
            
            // 根据选中的源发起请求
            const promises = [];
            if (state.selectedSources.includes('zhuishu')) promises.push(searchZhuiShu(query));
            // 英文API的调用在此略...
            
            const results = await Promise.allSettled(promises);
            
            let idx = 0;
            if (state.selectedSources.includes('zhuishu')) state.groupedResults.zhuishu = results[idx++]?.value || [];
            // 英文结果处理略...
            
            // 合并所有结果用于显示
            const allResults = [...state.groupedResults.zhuishu];
            state.totalResults = allResults.length;
            state.currentTab = 'all';
            
            renderResults(allResults);

            if (state.totalResults === 0) {
                showStatus(`未找到与 "${query}" 相关的中文书籍。`, 'info');
            }
        } catch(e) {
            console.error(e);
            showStatus('搜索出错，请稍后重试', 'error');
        } finally {
            hideLoading();
        }
    }

    // ---------- 渲染结果 ----------
    function renderResults(books) {
        if (!books.length) {
            elements.resultsContainer.innerHTML = `<div class="no-results"><div class="no-results-icon">📭</div><h3>暂无中文书籍</h3><p>试试其他关键词</p></div>`;
            return;
        }

        let html = `
            <div class="results-header">
                <div class="results-count">共找到 ${books.length} 本相关书籍</div>
            </div>
            <div class="books-grid">${renderBookCards(books)}</div>
        `;
        elements.resultsContainer.innerHTML = html;

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
                <div class="book-actions">
                    ${renderActionButtons(book)}
                    <button class="btn btn-secondary" onclick="event.stopPropagation();showBookDetail('${book.id}')">详情</button>
                </div>
            </div>
        `).join('');
    }

    function renderActionButtons(book) {
        if (book.source === 'zhuishu') {
            return `<a href="${book.downloadLinks.read}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">📖 在线阅读</a>`;
        }
        return '';
    }

    window.showBookDetail = function(bookId) {
        let book = state.groupedResults.zhuishu.find(b => b.id === bookId);
        if (!book) return;
        
        const detailHtml = `
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                <div style="flex-shrink:0;">${book.coverUrl ? `<img src="${book.coverUrl}" style="width:120px;border-radius:8px;">` : `<div class="book-cover-placeholder" style="width:120px;">${book.title?.charAt(0)||'📖'}</div>`}</div>
                <div style="flex:1;">
                    <span class="book-source ${book.source}">${book.sourceName}</span>
                    <h2>${escapeHtml(book.title)}</h2>
                    <p><strong>作者：</strong>${escapeHtml(book.authors)}</p>
                    <p><strong>简介：</strong>${escapeHtml(book.description)}</p>
                    <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                        <a href="${book.downloadLinks.read}" target="_blank" class="btn btn-primary">📖 在线阅读</a>
                    </div>
                </div>
            </div>
        `;
        elements.modalBody.innerHTML = detailHtml;
        elements.modal.style.display = 'flex';
    };

    function closeModal() { elements.modal.style.display = 'none'; }

    // ---------- 初始化事件 ----------
    function init() {
        updateCheckboxes();
        elements.searchBtn.addEventListener('click', handleSearch);
        elements.searchInput.addEventListener('keypress', e => e.key==='Enter' && handleSearch());
        elements.clearBtn.addEventListener('click', ()=>{
            if (elements.chkZhuishu) elements.chkZhuishu.checked = true;
            if (elements.chkGutenberg) elements.chkGutenberg.checked = false;
            if (elements.chkOpenlibrary) elements.chkOpenlibrary.checked = false;
            if (elements.chkGoogle) elements.chkGoogle.checked = false;
            updateSelectedSources();
        });
        
        elements.modalClose?.addEventListener('click', closeModal);
        elements.modalOverlay?.addEventListener('click', closeModal);
        document.addEventListener('keydown', e => e.key==='Escape' && closeModal());
        updateSelectedSources();
    }

    init();
})();