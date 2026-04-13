(function(){
    "use strict";

    // ---------- API 配置 ----------
    const CONFIG = {
        saltyleo: {
            name: 'SaltyLeo 书库',
            baseUrl: 'https://book-db-v1.saltyleo.com/',
            color: 'saltyleo',
            desc: '图书元数据库'
        }
    };

    // ---------- 全局状态 ----------
    let state = {
        currentQuery: '',
        groupedResults: { saltyleo: [] },
        totalResults: 0,
        isLoading: false
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
        sourceCheckboxes: document.querySelectorAll('.source-checkboxes input')
    };

    // ---------- 辅助函数 ----------
    const escapeHtml = (text) => {
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
        state.isLoading = true;
        elements.loadingIndicator.style.display = 'flex';
        elements.resultsContainer.innerHTML = '';
    };
    
    const hideLoading = () => {
        state.isLoading = false;
        elements.loadingIndicator.style.display = 'none';
    };

    // ---------- API 请求：SaltyLeo ----------
    async function searchSaltyLeo(query) {
        const url = new URL(CONFIG.saltyleo.baseUrl);
        url.searchParams.append('keyword', query);
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            
            if (!data || !data.data || !Array.isArray(data.data)) {
                console.warn('SaltyLeo返回的数据格式不正确:', data);
                return [];
            }
            
            return data.data.map(book => ({
                id: `saltyleo_${book.id || Math.random()}`,
                source: 'saltyleo',
                sourceName: 'SaltyLeo 书库',
                title: book.title || '未知书名',
                authors: book.author || '未知作者',
                description: book.desc || '暂无描述',
                coverUrl: book.cover || null,
                publisher: book.publisher,
                rating: book.score,
                downloadLinks: {
                    detail: book.link
                },
                language: 'zh'
            }));
        } catch(e) {
            console.warn('SaltyLeo 搜索失败:', e);
            return [];
        }
    }

    // ---------- 搜索主流程 ----------
    async function handleSearch() {
        const query = elements.searchInput.value.trim();
        if (!query) return showStatus('请输入搜索关键词', 'warning');
        
        // 检查是否选中了数据源
        const selectedSource = Array.from(elements.sourceCheckboxes).find(cb => cb.checked);
        if (!selectedSource) return showStatus('请至少选择一个数据源', 'warning');

        state.currentQuery = query;
        hideStatus();
        showLoading();

        try {
            state.groupedResults = { saltyleo: [] };
            
            // 目前只有一个源，直接调用
            const results = await searchSaltyLeo(query);
            state.groupedResults.saltyleo = results;
            state.totalResults = results.length;
            
            renderResults(results);

            if (state.totalResults === 0) {
                showStatus(`未找到与 "${query}" 相关的书籍，试试其他关键词`, 'info');
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
            elements.resultsContainer.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">📭</div>
                    <h3>暂无中文书籍</h3>
                    <p>试试搜索 "三体"、"活着" 或 "刘慈欣"</p>
                </div>`;
            return;
        }

        let html = `
            <div class="results-header">
                <div class="results-count">共找到 ${books.length} 本相关书籍</div>
            </div>
            <div class="books-grid">${renderBookCards(books)}</div>
        `;
        elements.resultsContainer.innerHTML = html;

        // 卡片详情事件
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
                    ${book.publisher ? `<span>📚 ${book.publisher}</span>` : ''}
                    ${book.rating ? `<span>⭐ ${book.rating}</span>` : ''}
                </div>
                <div class="book-actions">
                    ${renderActionButtons(book)}
                    <button class="btn btn-secondary" onclick="event.stopPropagation();showBookDetail('${book.id}')">详情</button>
                </div>
            </div>
        `).join('');
    }

    function renderActionButtons(book) {
        if (book.source === 'saltyleo' && book.downloadLinks.detail) {
            return `<a href="${book.downloadLinks.detail}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">🔗 查看详情</a>`;
        }
        return '';
    }

    window.showBookDetail = function(bookId) {
        const book = state.groupedResults.saltyleo.find(b => b.id === bookId);
        if (!book) return;
        
        const detailHtml = `
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                <div style="flex-shrink:0;">${book.coverUrl ? `<img src="${book.coverUrl}" style="width:120px;border-radius:8px;">` : `<div class="book-cover-placeholder" style="width:120px;">${book.title?.charAt(0)||'📖'}</div>`}</div>
                <div style="flex:1;">
                    <span class="book-source ${book.source}">${book.sourceName}</span>
                    <h2>${escapeHtml(book.title)}</h2>
                    <p><strong>作者：</strong>${escapeHtml(book.authors)}</p>
                    ${book.publisher ? `<p><strong>出版社：</strong>${escapeHtml(book.publisher)}</p>` : ''}
                    ${book.rating ? `<p><strong>评分：</strong>${escapeHtml(book.rating)}</p>` : ''}
                    <p><strong>简介：</strong>${escapeHtml(book.description)}</p>
                    <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                        <a href="${book.downloadLinks.detail}" target="_blank" class="btn btn-primary">🔗 查看详情页</a>
                    </div>
                </div>
            </div>
        `;
        elements.modalBody.innerHTML = detailHtml;
        elements.modal.style.display = 'flex';
    };

    function closeModal() { elements.modal.style.display = 'none'; }

    // ---------- 初始化 ----------
    function init() {
        // 更新复选框，默认只选中 SaltyLeo
        const sourceDiv = document.querySelector('.source-checkboxes');
        if (sourceDiv) {
            sourceDiv.innerHTML = `
                <label class="checkbox-item"><input type="checkbox" value="saltyleo" id="chkSaltyleo" checked> SaltyLeo (中文)</label>
                <label class="checkbox-item"><input type="checkbox" value="gutenberg" id="chkGutenberg"> Gutenberg (英文)</label>
            `;
            elements.sourceCheckboxes = document.querySelectorAll('.source-checkboxes input');
        }

        elements.searchBtn.addEventListener('click', handleSearch);
        elements.searchInput.addEventListener('keypress', e => e.key==='Enter' && handleSearch());
        elements.clearBtn.addEventListener('click', ()=>{
            document.getElementById('chkSaltyleo').checked = true;
            document.getElementById('chkGutenberg').checked = false;
            elements.langSelect.value = '';
        });
        
        elements.modalClose?.addEventListener('click', closeModal);
        elements.modalOverlay?.addEventListener('click', closeModal);
        document.addEventListener('keydown', e => e.key==='Escape' && closeModal());
        
        // 示例搜索标签
        document.querySelectorAll('.example-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                elements.searchInput.value = tag.dataset.query;
                handleSearch();
            });
        });
    }

    init();
})();