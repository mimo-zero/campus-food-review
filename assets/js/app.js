/* ==========================================================================
   校园食堂点评推荐 —— 视图与路由
   ========================================================================== */

const state = {
    view: 'rank',
    param: 'all',
    keyword: '',
    modal: null,     // {type:'review'|'dish', id}
    toast: null
};

const DEMO_ACCOUNTS = [
    { account: '2023010101', name: '李思远', role: 'student', desc: '学生 · 可评价' },
    { account: '2022010202', name: '王雨桐', role: 'student', desc: '学生 · 可评价' },
    { account: 'T1001', name: '张老师', role: 'teacher', desc: '教师 · 可评价' },
    { account: 'S2001', name: '周师傅', role: 'staff', desc: '店员 · 不可评价' }
];

/* -------------------- 启动 -------------------- */
document.addEventListener('DOMContentLoaded', function () {
    App.init();
    window.addEventListener('hashchange', function () { parseHash(); render(); });
    document.addEventListener('click', onClick);
    document.addEventListener('submit', function (e) {
        if (e.target.id === 'loginForm') { e.preventDefault(); doLogin(); }
        if (e.target.id === 'reviewForm') { e.preventDefault(); doReview(); }
        if (e.target.id === 'searchForm') { e.preventDefault(); doSearch(); }
    });
    parseHash();
    render();
});

function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/');
    if (!h) { state.view = 'rank'; state.param = 'all'; state.keyword = ''; return; }
    if (parts[0] === 'store' && parts[1]) { state.view = 'store'; state.param = parts[1]; }
    else if (parts[0] === 'search') { state.view = 'search'; state.param = parts[1] ? decodeURIComponent(parts[1]) : ''; state.keyword = state.param; }
    else { state.view = parts[0] || 'rank'; state.param = parts[1] || 'all'; }
}

/* -------------------- 全局事件委托 -------------------- */
function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const arg = t.dataset.arg;

    if (act === 'nav') { location.hash = t.dataset.hash; return; }
    if (act === 'cat') { location.hash = '#/rank/' + arg; return; }
    if (act === 'goStore') { state.modal = null; location.hash = '#/store/' + arg; return; }
    if (act === 'openDish') { openModal('dish', arg); return; }
    if (act === 'openReview') { openModal('review', arg); return; }
    if (act === 'closeModal') { state.modal = null; render(); return; }
    if (act === 'demoLogin') { loginByAccount(arg); return; }
    if (act === 'logout') { App.logout(); location.hash = '#/rank/all'; location.reload(); return; }
    if (act === 'pickStar') { pickStar(t); return; }
    if (act === 'like') {
        const on = App.toggleLike(arg);
        const el = document.querySelector('[data-act="like"][data-arg="' + arg + '"]');
        if (el) el.classList.toggle('on', on);
        return;
    }
    if (act === 'delReview') {
        if (confirm('确定删除这条评价？删除后排名会重新计算。')) {
            const r = App.deleteMyReview(arg);
            toast(r.ok ? '已删除，排名已更新' : r.msg);
            render();
        }
        return;
    }
    if (act === 'resetDemo') {
        if (confirm('清空本机所有评价数据并恢复演示状态？')) {
            Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
            location.reload();
        }
        return;
    }
}

function openModal(type, id) { state.modal = { type: type, id: id }; render(); }
function closeModal() { state.modal = null; render(); }

function toast(msg) {
    const box = document.getElementById('toast');
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('show'); }, 2400);
}

/* -------------------- 登录 -------------------- */
function loginByAccount(account) {
    const d = DEMO_ACCOUNTS.find(a => a.account === account);
    App.login(account, d ? d.name : '');
    toast('登录成功：' + (d ? d.name : account) + '（' + ROLE_NAME[d ? d.role : 'student'] + '）');
    location.hash = '#/rank/all';
    render();
}

function doLogin() {
    const acc = document.getElementById('acc').value.trim();
    const nm = document.getElementById('uname').value.trim();
    const r = App.login(acc, nm);
    if (!r.ok) { toast(r.msg); return; }
    toast('登录成功：' + r.user.name + '（' + ROLE_NAME[r.role] + '）');
    render();
}

/* -------------------- 评价提交 -------------------- */
function doReview() {
    const f = document.getElementById('reviewForm');
    const payload = {
        dishId: f.dataset.dish,
        text: document.getElementById('rvText').value,
        anonymous: document.getElementById('rvAnon').checked,
        taste: f.dataset.taste, portion: f.dataset.portion, env: f.dataset.env,
        service: f.dataset.service, value: f.dataset.value
    };
    if (!payload.taste || !payload.portion || !payload.env || !payload.service || !payload.value) {
        toast('请为 5 个维度都打分'); return;
    }
    const r = App.submitReview(payload);
    if (!r.ok) { toast(r.msg); return; }
    const dish = App.dishMap[payload.dishId];
    const st = App.dishStats(dish.id);
    toast((r.updated ? '评价已更新' : '评价已匿名提交') + ' · 该菜品新评分 ' + st.score.toFixed(2) +
        '（' + ROLE_NAME[App.user.role] + '）');
    state.modal = null;
    render();
}

function pickStar(el) {
    const box = el.closest('.star-picker');
    const v = +el.dataset.v;
    box.dataset.value = v;
    box.querySelectorAll('.star').forEach(function (s, i) { s.classList.toggle('on', i < v); });
    box.querySelector('.val').textContent = v + ' 分';
}

/* -------------------- 搜索 -------------------- */
function doSearch() {
    const kw = document.getElementById('kw').value.trim();
    if (!kw) { toast('输入关键词再搜'); return; }
    location.hash = '#/search/' + encodeURIComponent(kw);
}

/* ==========================================================================
   渲染
   ========================================================================== */
function render() {
    const app = document.getElementById('app');
    app.innerHTML = headerHTML() + '<main class="wrap">' + viewHTML() + '</main>' + footerHTML() + modalHTML();
    window.scrollTo(0, 0);
}

function headerHTML() {
    const u = App.user;
    const roleChip = u
        ? '<span class="chip ' + u.role + '">' + ROLE_NAME[u.role] + '</span>'
        : '<span class="chip guest">游客</span>';
    const nav = [
        ['rank', '排行榜', '#/rank/all'],
        ['new', '新品雷达', '#/new'],
        ['warn', '踩雷预警', '#/warn'],
        ['mine', '我的评价', '#/mine']
    ].map(n => '<a class="nav-link' + (state.view === n[0] ? ' on' : '') + '" href="' + n[2] + '">' + n[1] + '</a>').join('');

    return '<header class="site-head">' +
        '<div class="head-inner">' +
        '<a class="brand" href="#/rank/all"><span class="logo">🍜</span>' +
        '<span><b>校园食堂点评推荐</b><i>发现新菜品 · 避开踩雷窗口</i></span></a>' +
        '<nav class="nav">' + nav + '</nav>' +
        '<form class="search" id="searchForm">' +
        '<input id="kw" type="text" placeholder="搜门店 / 菜品，如“水煮牛肉”" value="' + escapeHtml(state.keyword) + '">' +
        '<button type="submit">搜索</button></form>' +
        '<div class="user-box">' + roleChip +
        (u ? '<b class="uname">' + escapeHtml(u.name) + '</b><button class="link" data-act="logout">退出</button>'
            : '<button class="link" data-act="nav" data-hash="#/login">登录</button>') +
        '</div></div></header>';
}

function footerHTML() {
    return '<footer class="site-foot"><div class="wrap foot-inner">' +
        '<span>本站为课程演示作品 · 数据为模拟生成，仅用于产品原型展示</span>' +
        '<span>评分口径：口味35% + 分量20% + 环境15% + 服务15% + 性价比15%，学生:教师 = 0.6:0.4 加权</span>' +
        '<button class="link" data-act="resetDemo">重置演示数据</button>' +
        '</div></footer>';
}

function viewHTML() {
    switch (state.view) {
        case 'login': return loginHTML();
        case 'store': return storeHTML(state.param);
        case 'new': return newHTML();
        case 'warn': return warnHTML();
        case 'mine': return mineHTML();
        case 'search': return searchHTML(state.param);
        default: return rankHTML(state.param);
    }
}

/* -------------------- 排行榜 -------------------- */
function rankHTML(cat) {
    const cats = [{ key: 'all', name: '全站总榜', icon: '🏆', color: '#f59e0b', desc: '三大类门店放在一起，按学生+教师综合评分排序。' }]
        .concat(CATEGORIES);

    const tabs = cats.map(c =>
        '<button class="cat-tab' + (cat === c.key ? ' on' : '') + '" data-act="cat" data-arg="' + c.key +
        '" style="--c:' + c.color + '"><span class="ci">' + c.icon + '</span><b>' + c.name + '</b>' +
        (c.key === 'all' ? '' : '<i>' + c.sub + '</i>') + '</button>').join('');

    const active = cats.find(c => c.key === cat) || cats[0];
    const list = cat === 'all' ? App.globalTop(10) : App.ranking(cat, 10);

    return '<section class="hero" style="--c:' + active.color + '">' +
        '<h2>' + active.icon + ' ' + active.name + ' · TOP10</h2>' +
        '<p>' + active.desc + '</p></section>' +
        '<div class="cat-tabs">' + tabs + '</div>' +
        '<div class="tipbar">榜单由 <b>学生 0.6 + 教师 0.4</b> 加权综合评分排序（已做平滑处理，新店不会因为一两条好评就冲榜）。点击任意门店可进入并匿名评价。</div>' +
        rankingListHTML(list);
}

function rankingListHTML(list) {
    if (!list.length) return '<div class="empty">该分类暂无门店</div>';
    const top = list[0].stats.score || 1;
    return '<ol class="rank-list">' + list.map(function (x, i) {
        const s = x.store, st = x.stats;
        const gap = i > 0 ? list[i - 1].stats.score - st.score : 0;
        const bars = roleBarsHTML(st);
        return '<li class="rank-item r' + (x.rank <= 3 ? x.rank : 'n') + '">' +
            '<div class="rk-no">' + (x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : '<span>' + x.rank + '</span>') + '</div>' +
            '<div class="rk-main">' +
            '<div class="rk-title"><a href="#/store/' + s.id + '">' + escapeHtml(s.name) + '</a>' +
            '<span class="cat-badge ' + s.category + '">' + catIcon(s.category) + catName(s.category) + '</span>' +
            '<span class="loc">' + escapeHtml(s.canteen) + ' · ' + escapeHtml(s.floor) + '</span></div>' +
            '<div class="rk-tag">' + escapeHtml(s.tagline) + '</div>' +
            bars +
            '<div class="rk-foot">' +
            '<span class="mini">综合评分 <b style="color:' + scoreColor(st.score) + '">' + st.score.toFixed(2) + '</b></span>' +
            '<span class="mini">学生 ' + (st.student.avg === null ? '—' : st.student.avg.toFixed(2)) +
            ' <i>(' + st.student.count + ')</i></span>' +
            '<span class="mini">教师 ' + (st.teacher.avg === null ? '—' : st.teacher.avg.toFixed(2)) +
            ' <i>(' + st.teacher.count + ')</i></span>' +
            '<span class="mini">共 ' + st.count + ' 条评价</span>' +
            (st.drop >= 0.35 ? '<span class="mini warn">⚠ 近期评分下滑 ' + st.drop.toFixed(2) + '</span>' : '') +
            '</div></div>' +
            '<div class="rk-score">' +
            '<div class="ring" style="--p:' + Math.round((st.score / 5) * 100) + ';--c:' + scoreColor(st.score) + '">' +
            '<b>' + st.score.toFixed(2) + '</b></div>' +
            (i > 0 && gap > 0 ? '<span class="gap">距上一名 -' + gap.toFixed(2) + '</span>' : '<span class="gap top">榜首</span>') +
            '<a class="btn primary" href="#/store/' + s.id + '">进入门店 · 去评价</a>' +
            '</div></li>';
    }).join('') + '</ol>';
}

function roleBarsHTML(st) {
    const mk = function (label, a, n, color) {
        const pct = a === null ? 0 : Math.round((a / 5) * 100);
        return '<div class="rbar"><span class="rl">' + label + '</span>' +
            '<span class="track"><i style="width:' + pct + '%;background:' + color + '"></i></span>' +
            '<span class="rv">' + (a === null ? '—' : a.toFixed(2)) + '<i>' + n + '评</i></span></div>';
    };
    return '<div class="rolebars">' +
        mk('学生', st.student.avg, st.student.count, '#3b82f6') +
        mk('教师', st.teacher.avg, st.teacher.count, '#8b5cf6') +
        '</div>';
}

function catIcon(k) { const c = CATEGORIES.find(x => x.key === k); return c ? c.icon : ''; }
function catName(k) { const c = CATEGORIES.find(x => x.key === k); return c ? c.name : ''; }
function catColor(k) { const c = CATEGORIES.find(x => x.key === k); return c ? c.color : '#64748b'; }

/* -------------------- 门店详情 -------------------- */
function storeHTML(id) {
    const s = App.storeMap[id];
    if (!s) return '<div class="empty">门店不存在，<a href="#/rank/all">返回排行榜</a></div>';
    const st = App.storeStats(id);
    const c = CATEGORIES.find(x => x.key === s.category);
    const can = App.canReview();
    const top = st.topDishes;

    const dishRows = top.map(function (x, i) {
        const d = x.dish, ds = x.stats;
        const mine = App.myReview(d.id);
        return '<tr>' +
            '<td class="dno">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : '<span>' + (i + 1) + '</span>') + '</td>' +
            '<td><a href="javascript:;" data-act="openDish" data-arg="' + d.id + '">' + escapeHtml(d.name) + '</a>' +
            (d.tag ? '<span class="tag">' + escapeHtml(d.tag) + '</span>' : '') +
            (mine ? '<span class="mine-tag">你评过</span>' : '') + '</td>' +
            '<td class="price">¥' + d.price + '</td>' +
            '<td class="score" style="color:' + scoreColor(ds.score) + '"><b>' + ds.score.toFixed(2) + '</b></td>' +
            '<td>' + stars(ds.avg) + '</td>' +
            '<td class="cnt">' + ds.count + '<i>评</i></td>' +
            '<td class="act">' +
            '<button class="btn tiny" data-act="openDish" data-arg="' + d.id + '">看评价</button>' +
            (can.ok
                ? '<button class="btn tiny primary" data-act="openReview" data-arg="' + d.id + '">' +
                (mine ? '修改' : '评价') + '</button>'
                : '<button class="btn tiny" disabled title="' + can.msg + '">' +
                (can.code === 'staff' ? '店员不可评价' : '登录后可评价') + '</button>') +
            '</td></tr>';
    }).join('');

    const storeReviews = App.reviewsOfStore(id).slice(0, 60);

    return '<nav class="crumb"><a href="#/rank/all">排行榜</a> › <a href="#/rank/' + s.category + '">' +
        catName(s.category) + '</a> › ' + escapeHtml(s.name) + '</nav>' +

        '<section class="store-hero" style="--c:' + c.color + '">' +
        '<div class="sh-left">' +
        '<h2>' + escapeHtml(s.name) + '<span class="cat-badge ' + s.category + '">' + c.icon + c.name + '</span></h2>' +
        '<p class="loc">' + escapeHtml(s.canteen) + ' · ' + escapeHtml(s.floor) + ' ｜ ' + escapeHtml(s.tagline) + '</p>' +
        '<div class="rankline">当前 <b>' + catName(s.category) + ' TOP10 排名：第 ' +
        (App.ranking(s.category).findIndex(x => x.store.id === id) + 1) + ' 名</b>' +
        (st.drop >= 0.35 ? ' <span class="mini warn">⚠ 近期踩雷窗口，评分下滑 ' + st.drop.toFixed(2) + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="sh-right"><div class="bigscore" style="color:' + scoreColor(st.score) + '">' +
        st.score.toFixed(2) + '<span>综合评分</span></div>' + roleBarsHTML(st) +
        '<div class="cntline">共 ' + st.count + ' 条学生/教师评价</div></div>' +
        '</section>' +

        (!can.ok ? '<div class="notice ' + (can.code === 'staff' ? 'danger' : 'info') + '">' +
            (can.code === 'staff' ? '🚫 你当前的身份是<b>门店店员</b>，按规定不可参与菜品评价，排行分数只由学生与教师产生。'
                : 'ℹ️ ' + can.msg + '（<a href="#/login">去登录</a>）后才能匿名评价。') + '</div>' : '') +

        '<div class="panel">' +
        '<h3>菜品 TOP10 排行</h3>' +
        '<table class="dtable"><thead><tr><th>排名</th><th>菜品</th><th>价格</th><th>综合评分</th>' +
        '<th>原始星级</th><th>评价数</th><th>操作</th></tr></thead><tbody>' + dishRows + '</tbody></table>' +
        '</div>' +

        (st.badDishes.length ? '<div class="panel warn-panel"><h3>⚠ 本店踩雷预警</h3>' +
            st.badDishes.map(x => '<div class="warnrow">' +
                '<b>' + escapeHtml(x.dish.name) + '</b>' +
                '<span style="color:' + scoreColor(x.stats.score) + '">' + x.stats.score.toFixed(2) + '</span>' +
                '<span class="dim">' + (x.stats.avg === null ? '—' : x.stats.avg.toFixed(2)) + ' 分 · ' + x.stats.count + ' 条评价</span>' +
                '<span class="dim">' + (x.stats.drop >= 0.35 ? '近 30 天下滑 ' + x.stats.drop.toFixed(2) : '口碑长期偏低') + '</span>' +
                '<button class="btn tiny" data-act="openDish" data-arg="' + x.dish.id + '">看评价</button>' +
                '</div>').join('') + '</div>' : '') +

        '<div class="panel"><h3>门店评价（匿名展示）</h3>' + reviewListHTML(storeReviews) + '</div>';
}

/* -------------------- 评价列表 -------------------- */
function reviewListHTML(list) {
    if (!list.length) return '<div class="empty">还没有评价</div>';
    return '<ul class="reviews">' + list.map(function (r) {
        const s = reviewScore(r);
        const mine = App.user && r.userId === App.user.account;
        return '<li class="review">' +
            '<div class="rv-head">' +
            '<span class="avatar ' + r.role + '">' + (r.anonymous ? '匿' : escapeHtml((r.userName || '友').charAt(0))) + '</span>' +
            '<span class="rv-name">' + (r.anonymous ? '匿名用户' : escapeHtml(r.userName || '用户')) +
            (r.anonymous && !r.seed ? '<i class="anon">已匿名</i>' : '') + '</span>' +
            '<span class="chip ' + r.role + '">' + ROLE_NAME[r.role] + '</span>' +
            '<span class="rv-score" style="color:' + scoreColor(s) + '">' + s.toFixed(1) + '</span>' +
            '<span class="rv-time">' + fmtTime(r.ts) + '</span>' +
            '</div>' +
            '<div class="rv-text">' + escapeHtml(r.text) + '</div>' +
            '<div class="rv-sub">' + subTagsHTML(r) + '</div>' +
            '<div class="rv-foot">' +
            '<button class="like' + (App.isLiked(r.id) ? ' on' : '') + '" data-act="like" data-arg="' + r.id + '">👍 有用</button>' +
            (mine ? '<button class="link danger" data-act="delReview" data-arg="' + r.id + '">删除我的评价</button>' : '') +
            '</div></li>';
    }).join('') + '</ul>';
}

function subTagsHTML(r) {
    const items = [['口味', r.taste], ['分量', r.portion], ['环境', r.env], ['服务', r.service], ['性价比', r.value]];
    return items.map(i => '<span class="sub' + (i[1] >= 4 ? ' good' : (i[1] <= 2 ? ' bad' : '')) + '">' +
        i[0] + ' ' + i[1] + '</span>').join('');
}

/* -------------------- 新品雷达 -------------------- */
function newHTML() {
    const list = App.newDishes(15);
    return '<section class="hero" style="--c:#10b981"><h2>🥬 新菜品雷达</h2>' +
        '<p>近 7 天被同学翻牌、但评价样本还不多（≤12 条）的菜品。分数高说明潜力大，值得你当第一个试吃的人。</p></section>' +
        '<div class="tipbar">算法口径：<b>近 7 天新增评价数</b> 优先，其次综合评分；样本少的菜品已做平滑，不会轻易虚高。</div>' +
        (list.length ? '<div class="card-grid">' + list.map(function (x) {
            return '<article class="dish-card" style="--c:' + catColor(x.store.category) + '">' +
                '<div class="dc-cat">' + catIcon(x.store.category) + escapeHtml(x.store.name) +
                '<i>' + x.store.canteen + ' ' + x.store.floor + '</i></div>' +
                '<h4>' + escapeHtml(x.dish.name) + (x.dish.tag ? '<span class="tag">' + escapeHtml(x.dish.tag) + '</span>' : '') + '</h4>' +
                '<div class="dc-price">¥' + x.dish.price + '</div>' +
                '<div class="dc-score" style="color:' + scoreColor(x.stats.score) + '">' + x.stats.score.toFixed(2) +
                '<span>综合评分</span></div>' +
                '<div class="dc-week">近 7 天 <b>' + x.stats.weekCount + '</b> 条新评价 · 累计 ' + x.stats.count + ' 条</div>' +
                '<div class="dc-acts">' +
                '<button class="btn tiny" data-act="openDish" data-arg="' + x.dish.id + '">看评价</button>' +
                '<button class="btn tiny primary" data-act="openReview" data-arg="' + x.dish.id + '">抢鲜评价</button>' +
                '</div></article>';
        }).join('') + '</div>' : '<div class="empty">暂无新品，逛逛门店页吃点评价就有啦</div>');
}

/* -------------------- 踩雷预警 -------------------- */
function warnHTML() {
    const list = App.warnDishes(12);
    return '<section class="hero" style="--c:#ef4444"><h2>⚠️ 踩雷预警 · 避雷窗口</h2>' +
        '<p>这些菜品近 30 天出现明显负反馈或长期口碑偏低。点进去看看具体是谁在骂，绕开它们。</p></section>' +
        '<div class="tipbar">判定口径：<b>近 30 天均分</b> 低于历史均分 0.35 以上，或历史均分低于 3.30 且有多条差评。</div>' +
        (list.length ? '<ol class="warn-list">' + list.map(function (x, i) {
            const risky = x.stats.drop >= 0.35;
            return '<li class="warn-item">' +
                '<div class="wi-no">' + (i + 1) + '</div>' +
                '<div class="wi-main">' +
                '<h4><a href="javascript:;" data-act="openDish" data-arg="' + x.dish.id + '">' + escapeHtml(x.dish.name) + '</a>' +
                '<span class="cat-badge ' + x.store.category + '">' + catIcon(x.store.category) + escapeHtml(x.store.name) + '</span></h4>' +
                '<div class="wi-reasons">' + x.reasons.map(r => '<span>' + r + '</span>').join('') + '</div>' +
                '<div class="wi-bar"><span>历史 ' + (x.stats.avg === null ? '—' : x.stats.avg.toFixed(2)) + '</span>' +
                '<span class="track"><i style="width:' + Math.round((x.stats.avg / 5) * 100) + '%;background:#dc2626"></i></span>' +
                '<span>近30天 ' + (x.stats.recent.avg === null ? '—' : x.stats.recent.avg.toFixed(2)) + '</span>' +
                '<span class="track"><i style="width:' + Math.round(((x.stats.recent.avg || 0) / 5) * 100) + '%;background:#f97316"></i></span>' +
                '</div></div>' +
                '<div class="wi-right">' +
                '<div class="bigscore small" style="color:' + scoreColor(x.stats.score) + '">' + x.stats.score.toFixed(2) + '</div>' +
                '<div class="mini">' + x.stats.count + ' 条评价</div>' +
                (risky ? '<div class="mini warn">近 30 天 -' + x.stats.drop.toFixed(2) + '</div>' : '') +
                '<button class="btn tiny" data-act="openDish" data-arg="' + x.dish.id + '">看差评</button>' +
                '</div></li>';
        }).join('') + '</ol>' : '<div class="empty">全站暂无踩雷预警，值得表扬 👍</div>');
}

/* -------------------- 我的评价 -------------------- */
function mineHTML() {
    if (!App.user) {
        return '<section class="hero" style="--c:#8b5cf6"><h2>👤 我的评价</h2><p>登录后可查看、修改或删除自己发布过的匿名评价。</p></section>' +
            '<div class="empty"><a class="btn primary" href="#/login">去登录</a></div>';
    }
    if (App.user.role === 'staff') {
        return '<section class="hero" style="--c:#8b5cf6"><h2>👤 我的评价</h2>' +
            '<p>当前登录身份：<b>' + escapeHtml(App.user.name) + '（门店店员）</b></p></section>' +
            '<div class="notice danger">🚫 <b>门店店员不可评价</b>。为了保证榜单公正性，店员账号既不能发布评价，' +
            '其发布内容也不会计入门店综合评分。榜单只由学生（权重 0.6）与教师（权重 0.4）的评价决定。</div>';
    }
    const mine = App.userReviews.filter(r => r.userId === App.user.account)
        .sort((a, b) => b.ts - a.ts);
    const avg = mine.length ? mine.reduce((s, r) => s + reviewScore(r), 0) / mine.length : 0;
    return '<section class="hero" style="--c:#8b5cf6"><h2>👤 我的评价</h2>' +
        '<p>' + escapeHtml(App.user.name) + '（' + ROLE_NAME[App.user.role] + '）共发布 ' + mine.length +
        ' 条评价，平均 ' + (mine.length ? avg.toFixed(2) : '—') + ' 分，已影响对应门店排行。</p></section>' +
        (mine.length ? reviewListHTML(mine) : '<div class="empty">你还没有评价过菜品，去排行榜逛逛吧 →<br>' +
            '<a class="btn primary" href="#/rank/all">去排行榜</a></div>');
}

/* -------------------- 搜索结果 -------------------- */
function searchHTML(kw) {
    const r = App.search(kw);
    if (!kw) return '<div class="empty">请输入关键词</div>';
    return '<section class="hero" style="--c:#0ea5e9"><h2>🔍 搜索：' + escapeHtml(kw) + '</h2>' +
        '<p>找到 ' + r.stores.length + ' 家门店、' + r.dishes.length + ' 个菜品</p></section>' +
        (r.stores.length ? '<div class="panel"><h3>门店</h3><div class="link-list">' + r.stores.map(s =>
            '<a href="#/store/' + s.id + '"><b>' + escapeHtml(s.name) + '</b>' +
            '<span>' + escapeHtml(s.canteen) + ' · ' + escapeHtml(s.floor) + '</span></a>').join('') + '</div></div>' : '') +
        (r.dishes.length ? '<div class="panel"><h3>菜品</h3><div class="link-list">' + r.dishes.map(x =>
            '<a href="javascript:;" data-act="openDish" data-arg="' + x.dish.id + '"><b>' + escapeHtml(x.dish.name) + '</b>' +
            '<span>' + escapeHtml(x.store.name) + ' · ¥' + x.dish.price + '</span></a>').join('') + '</div></div>' : '') +
        (!r.stores.length && !r.dishes.length ? '<div class="empty">没有找到相关内容，换个词试试</div>' : '');
}

/* -------------------- 登录页 -------------------- */
function loginHTML() {
    const u = App.user;
    return '<section class="hero" style="--c:#8b5cf6"><h2>🔑 身份验证</h2>' +
        '<p>本平台<b>仅开放给在校学生与教师</b>。门店店员账号无法发布评价，其内容也不会计入排行分数。</p></section>' +
        '<div class="login-wrap">' +
        '<div class="panel">' +
        (u ? '<div class="notice info">当前已登录：<b>' + escapeHtml(u.name) + '</b> <span class="chip ' + u.role + '">' +
            ROLE_NAME[u.role] + '</span></div>' : '') +
        '<form id="loginForm">' +
        '<label>学号 / 工号<span class="req">*</span><input id="acc" type="text" placeholder="例如 2023010101 或 T1001"></label>' +
        '<label>昵称（可选）<input id="uname" type="text" placeholder="显示在评价上，默认匿名"></label>' +
        '<button class="btn primary block" type="submit">登录</button>' +
        '</form>' +
        '<div class="rule-box"><b>身份自动识别规则</b>' +
        '<div>T 开头 = 教师（可评价）</div>' +
        '<div>S 开头 = 门店店员（<b class="danger">不可评价</b>）</div>' +
        '<div>其它 = 学生（可评价）</div></div>' +
        '</div>' +
        '<div class="panel"><h3>一键体验不同身份</h3><div class="demo-list">' +
        DEMO_ACCOUNTS.map(d => '<button class="demo' + (d.role === 'staff' ? ' off' : '') + '" data-act="demoLogin" data-arg="' + d.account + '">' +
            '<b>' + escapeHtml(d.name) + '</b>' +
            '<span>' + d.account + '</span>' +
            '<i class="' + d.role + '">' + d.desc + '</i></button>').join('') +
        '</div></div></div>';
}

/* -------------------- 弹层：菜品详情 / 写评价 -------------------- */
function modalHTML() {
    if (!state.modal) return '';
    const box = document.getElementById('modal');
    const html = state.modal.type === 'dish' ? dishModalHTML(state.modal.id) : reviewModalHTML(state.modal.id);
    return '<div class="modal-mask" data-act="closeModal"></div>' +
        '<div class="modal" id="modal"><button class="modal-x" data-act="closeModal">×</button>' + html + '</div>';
}

function dishModalHTML(dishId) {
    const d = App.dishMap[dishId];
    if (!d) return '';
    const s = App.storeMap[d.storeId];
    const st = App.dishStats(d.id);
    const list = App.reviewsOfDish(d.id);
    const can = App.canReview();
    const mine = App.myReview(d.id);
    return '<div class="m-head" style="--c:' + catColor(s.category) + '">' +
        '<h3>' + escapeHtml(d.name) + '</h3>' +
        '<p>' + catIcon(s.category) + ' <a href="#/store/' + s.id + '" data-act="closeModal">' + escapeHtml(s.name) + '</a>' +
        ' ｜ ' + escapeHtml(s.canteen) + ' ' + escapeHtml(s.floor) + ' ｜ ¥' + d.price + '</p></div>' +
        '<div class="m-score">' +
        '<div class="ring" style="--p:' + Math.round((st.score / 5) * 100) + ';--c:' + scoreColor(st.score) + '"><b>' + st.score.toFixed(2) + '</b></div>' +
        '<div>' + stars(st.avg) + '<div class="dim">共 ' + st.count + ' 条评价 · 近 7 天新增 ' + st.weekCount + ' 条</div>' +
        roleBarsHTML(st) + '</div></div>' +
        (st.drop >= 0.35 ? '<div class="notice danger">⚠ 近 30 天评分下滑 ' + st.drop.toFixed(2) + '：' + WARN_TEXTS.recentDrop + '</div>' : '') +
        '<div class="m-acts">' +
        (can.ok
            ? '<button class="btn primary" data-act="openReview" data-arg="' + d.id + '">' + (mine ? '修改我的评价' : '✍️ 匿名评价这道菜') + '</button>'
            : '<button class="btn" disabled>✍️ ' + (can.code === 'staff' ? '店员不可评价' : '登录后可评价') + '</button>') +
        '</div>' +
        '<div class="m-reviews">' + reviewListHTML(list.slice(0, 40)) + '</div>';
}

function reviewModalHTML(dishId) {
    const d = App.dishMap[dishId];
    if (!d) return '';
    const s = App.storeMap[d.storeId];
    const can = App.canReview();
    const mine = App.myReview(d.id);

    if (!can.ok) {
        return '<div class="m-head" style="--c:#ef4444"><h3>🚫 无法评价</h3>' +
            '<p>' + escapeHtml(d.name) + ' · ' + escapeHtml(s.name) + '</p></div>' +
            '<div class="notice danger">' + can.msg +
            (can.code === 'guest' ? '，<a href="#/login" data-act="closeModal">请先登录</a>。' : '。') + '</div>' +
            '<div class="m-body">' + reviewListHTML(App.reviewsOfDish(d.id).slice(0, 10)) + '</div>';
    }

    const dims = [
        ['taste', '口味'], ['portion', '分量'], ['env', '环境'],
        ['service', '服务'], ['value', '性价比']
    ];
    const starPicker = function (key, label, v) {
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) starsHTML += '<span class="star' + (i <= (v || 0) ? ' on' : '') + '" data-act="pickStar" data-v="' + i + '"></span>';
        return '<div class="rp-row"><label>' + label + '</label><div class="star-picker" data-field="' + key +
            '" data-value="' + (v || 0) + '">' + starsHTML + '<em class="val">' + (v ? v + ' 分' : '未评分') + '</em></div></div>';
    };

    return '<div class="m-head" style="--c:' + catColor(s.category) + '">' +
        '<h3>' + (mine ? '修改评价' : '匿名评价') + '</h3>' +
        '<p>' + escapeHtml(d.name) + ' · ' + escapeHtml(s.name) + '（' + ROLE_NAME[App.user.role] + '）' +
        (mine ? ' · 你的原评价：' + escapeHtml(mine.text) : '') + '</p></div>' +
        '<form id="reviewForm" class="review-form" data-dish="' + d.id + '"' +
        dims.map(k => ' data-' + k[0] + '="' + (mine ? mine[k[0]] : 0) + '"').join('') + '>' +
        dims.map(k => starPicker(k[0], k[1], mine ? mine[k[0]] : 0)).join('') +
        '<label class="rp-text">评价内容<textarea id="rvText" maxlength="200" placeholder="说说真实感受：口味、分量、排队时间…">' +
        (mine ? escapeHtml(mine.text) : '') + '</textarea><span class="cnt" id="rvCnt">' +
        (mine ? mine.text.length : 0) + '/200</span></label>' +
        '<label class="rp-anon"><input type="checkbox" id="rvAnon"' + (mine ? (mine.anonymous ? ' checked' : '') : ' checked') + '>' +
        ' 匿名发布（推荐：其他同学看不到你的昵称与学号）</label>' +
        '<div class="rp-note">你的身份标签 <span class="chip ' + App.user.role + '">' + ROLE_NAME[App.user.role] + '</span>' +
        ' 仍会参与权重计算：' + (App.user.role === 'student' ? '学生 0.6' : '教师 0.4') + '</div>' +
        '<div class="rp-acts"><button type="button" class="btn" data-act="closeModal">取消</button>' +
        '<button type="submit" class="btn primary">' + (mine ? '保存修改' : '匿名提交') + '</button></div>' +
        '</form>';
}