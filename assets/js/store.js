/* ==========================================================================
   校园食堂点评推荐 —— 数据层 / 评分引擎
   评分口径：
     单条评价 = 口味35% + 分量20% + 环境15% + 服务15% + 性价比15%
     综合分  = 学生(权重0.6) + 教师(权重0.4) 加权平均，再做贝叶斯平滑（防止 1 条好评刷榜）
   门店得分 = 该门店全部菜品评价的同样加权汇总（平滑先验更强）
   ========================================================================== */

/* -------------------- 常量 -------------------- */
const DAY = 86400000;
const ROLE_WEIGHT = { student: 0.6, teacher: 0.4 };   // 学生 / 教师 在排名中的话语权
const ROLE_NAME = { student: '学生', teacher: '教师', staff: '店员' };
const SUB_WEIGHT = 3;      // 菜品平滑先验强度
const STORE_PRIOR = 8;     // 门店平滑先验强度
const STORAGE = {
    reviews: 'cr_reviews_v2',
    users: 'cr_users_v2',
    session: 'cr_session_v2',
    liked: 'cr_liked_v2'
};

/* -------------------- 工具 -------------------- */
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashCode(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function pick(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }
function uid(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
function maskName(name) { return name ? name.charAt(0) + '*'.repeat(Math.max(1, name.length - 1)) : '同学'; }

/* -------------------- 解析种子门店 -------------------- */
function parseSeed() {
    const stores = [];
    STORE_SEED.forEach(function (row) {
        const [id, name, canteen, floor, tagline, heat, quality, dishList] = row;
        const dishes = dishList.map(function (item, idx) {
            const p = item.split('|');
            const dish = {
                id: id + '-D' + (idx + 1),
                storeId: id,
                name: p[0],
                price: parseFloat(p[1]) || 0,
                tag: p[2] || '',
                base: p[3] ? parseFloat(p[3]) : null,
                index: idx
            };
            return dish;
        });
        stores.push({
            id: id, name: name, canteen: canteen, floor: floor,
            tagline: tagline, heat: heat, quality: quality, dishes: dishes,
            // 口碑基准偏低的门店，构造“近期踩雷窗口”
            recentDrop: quality < 3.8
        });
    });
    // 归入三大类：门店 id 前缀 L/H/S
    stores.forEach(function (s) {
        s.category = s.id.charAt(0) === 'L' ? 'light' : (s.id.charAt(0) === 'H' ? 'health' : 'sichuan');
    });
    return stores;
}

/* -------------------- 生成历史评价（确定性随机，每次刷新完全一致） -------------------- */
function buildSeedReviews(stores) {
    const reviews = [];
    const now = Date.now();
    stores.forEach(function (store) {
        store.dishes.forEach(function (dish) {
            const rnd = mulberry32(hashCode(dish.id));
            // 该菜品的“真实口碑基准”：显式指定 > 门店基准 + 波动
            const base = dish.base !== null ? dish.base : clamp(store.quality + (rnd() - 0.5) * 1.1, 1.8, 5);
            dish._base = base;

            const isNewHot = rnd() < 0.16;
            const isNewDish = NEW_DISH_IDS.indexOf(dish.id) >= 0;
            // 新上架的菜：评价样本极少（3~7 条），全部集中在最近一周
            const count = isNewDish ? 3 + Math.floor(rnd() * 5) : Math.round(store.heat * 2.4 + rnd() * 9);

            for (let i = 0; i < count; i++) {
                let age;
                if (isNewDish) age = rnd() * 6.8 + 0.2;            // 新菜：评价都集中在最近一周
                else {
                    age = rnd() * 170 + 1;                          // 1~171 天前
                    if (isNewHot && rnd() < 0.45) age = rnd() * 7 + 0.2;
                }
                let score = base + (rnd() + rnd() + rnd() - 1.5) * 0.85; // 近似正态
                if (store.recentDrop && age < 30) score -= 0.75;          // 近期集体踩雷
                score = clamp(score, 1, 5);
                const r = score - base;
                reviews.push(makeReview(dish, score, r, now - age * DAY, rnd));
            }
        });
    });
    return reviews;

    function makeReview(dish, score, drift, ts, rnd) {
        const role = rnd() < 0.76 ? 'student' : 'teacher';
        const near = (w) => clamp(Math.round(score + (rnd() - 0.5) * w), 1, 5);
        const text = score >= 4.2 ? pick(REVIEW_TEXTS.high, rnd)
            : score >= 3.2 ? pick(REVIEW_TEXTS.mid, rnd)
                : pick(REVIEW_TEXTS.low, rnd);
        return {
            id: 'seed-' + dish.id + '-' + ts.toFixed(0) + '-' + Math.floor(rnd() * 1e5),
            dishId: dish.id,
            storeId: dish.storeId,
            userId: 'seed_' + Math.floor(rnd() * 1e6),
            userName: role === 'student' ? '同学' : '老师',
            role: role,
            anonymous: rnd() < 0.78,
            taste: near(0.8), portion: near(1.0), env: near(1.2),
            service: near(1.2), value: near(1.0),
            drift: drift,
            text: text,
            ts: Math.round(ts),
            seed: true
        };
    }
}

/* -------------------- 评分聚合 -------------------- */
function reviewScore(r) {
    return r.taste * 0.35 + r.portion * 0.2 + r.env * 0.15 + r.service * 0.15 + r.value * 0.15;
}

/**
 * 聚合一组评价
 * @returns {avg, score, count, student:{avg,count}, teacher:{avg,count}, recent:{avg,count}, drops}
 */
function aggregate(reviews, priorWeight, globalMean) {
    const gm = globalMean || 3.9;
    const box = { student: { s: 0, w: 0, n: 0 }, teacher: { s: 0, w: 0, n: 0 } };
    let sum = 0, wsum = 0, recentSum = 0, recentW = 0, recentDropCount = 0;
    const cutoff30 = Date.now() - 30 * DAY;

    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        const w = ROLE_WEIGHT[r.role] || 0;
        if (!w) continue;                      // 店员评价不参与任何计分
        const s = reviewScore(r);
        sum += s * w; wsum += w;
        box[r.role].s += s * w; box[r.role].w += w; box[r.role].n++;
        if (r.ts >= cutoff30) {
            recentSum += s * w; recentW += w;
            if (s < 3.0) recentDropCount++;
        }
    }

    const avg = wsum > 0 ? sum / wsum : null;
    const score = wsum > 0 ? (wsum * avg + priorWeight * gm) / (wsum + priorWeight) : gm;
    const recentAvg = recentW > 0 ? recentSum / recentW : null;

    return {
        avg: avg,
        score: score,
        count: reviews.length,
        weightedCount: wsum,
        student: { avg: box.student.w > 0 ? box.student.s / box.student.w : null, count: box.student.n },
        teacher: { avg: box.teacher.w > 0 ? box.teacher.s / box.teacher.w : null, count: box.teacher.n },
        recent: { avg: recentAvg, count: Math.round(recentW / (ROLE_WEIGHT.student)) },
        recentBad: recentDropCount,
        // 近期评分跌幅（用于“踩雷窗口”预警）
        drop: (avg !== null && recentAvg !== null && recentW > 1.2) ? (avg - recentAvg) : 0
    };
}

/* -------------------- 全局状态 -------------------- */
const App = {
    stores: [],
    dishMap: {},
    storeMap: {},
    seedReviews: [],
    reviews: [],       // 全部评价 = 历史种子 + 用户真实评价
    userReviews: [],
    globalMean: 3.9,
    user: null,
    liked: {},

    init() {
        this.stores = parseSeed();
        this.stores.forEach(s => {
            this.storeMap[s.id] = s;
            s.dishes.forEach(d => { this.dishMap[d.id] = d; });
        });
        this.seedReviews = buildSeedReviews(this.stores);

        this.userReviews = this.load(STORAGE.reviews, []);
        this.liked = this.load(STORAGE.liked, {});
        this.reviews = this.seedReviews.concat(this.userReviews);
        this.globalMean = this.computeGlobalMean();
        this.user = this.load(STORAGE.session, null);
    },

    computeGlobalMean() {
        let s = 0, w = 0;
        this.reviews.forEach(function (r) {
            const ww = ROLE_WEIGHT[r.role] || 0;
            s += reviewScore(r) * ww; w += ww;
        });
        return w ? s / w : 3.9;
    },

    load(key, def) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : def;
        } catch (e) { return def; }
    },
    save(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
    },

    /* -------- 查询 -------- */
    reviewsOfDish(dishId) {
        return this.reviews.filter(r => r.dishId === dishId).sort((a, b) => b.ts - a.ts);
    },
    reviewsOfStore(storeId) {
        return this.reviews.filter(r => r.storeId === storeId).sort((a, b) => b.ts - a.ts);
    },

    dishStats(dishId) {
        const list = this.reviewsOfDish(dishId);
        const a = aggregate(list, SUB_WEIGHT, this.globalMean);
        a.ratingCount = list.length;
        // 近 7 天新增评价数 → “最近被翻牌”
        const c7 = Date.now() - 7 * DAY;
        a.weekCount = list.filter(r => r.ts >= c7).length;
        a.isNew = a.ratingCount > 0 && a.ratingCount <= 12 && a.weekCount > 0;
        return a;
    },

    storeStats(storeId) {
        const s = this.storeMap[storeId];
        const list = this.reviews.filter(r => r.storeId === storeId);
        const a = aggregate(list, STORE_PRIOR, this.globalMean);
        const dishAgg = s.dishes.map(d => this.dishStats(d.id));
        a.topDishes = s.dishes
            .map((d, i) => ({ dish: d, stats: dishAgg[i] }))
            .sort((x, y) => y.stats.score - x.stats.score);
        a.badDishes = a.topDishes.filter(x => x.stats.count >= 3).slice(-3).reverse();
        return a;
    },

    /** 分类排行：TOP10 */
    ranking(categoryKey, limit) {
        const list = this.stores
            .filter(s => !categoryKey || s.category === categoryKey)
            .map(s => ({ store: s, stats: this.storeStats(s.id) }))
            .sort((a, b) => b.stats.score - a.stats.score);
        const out = [];
        list.forEach(function (x, i) {
            x.rank = i + 1;
            out.push(x);
        });
        return limit ? out.slice(0, limit) : out;
    },

    /** 全站 TOP10（跨三大类） */
    globalTop(limit) {
        const list = this.stores
            .map(s => ({ store: s, stats: this.storeStats(s.id) }))
            .sort((a, b) => b.stats.score - a.stats.score)
            .slice(0, limit || 10);
        list.forEach(function (x, i) { x.rank = i + 1; });
        return list;
    },

    /** 新菜品雷达 */
    newDishes(limit) {
        const out = [];
        this.stores.forEach(s => s.dishes.forEach(d => {
            const st = this.dishStats(d.id);
            if (st.isNew) out.push({ store: s, dish: d, stats: st });
        }));
        return out
            .sort((a, b) => (b.stats.weekCount - a.stats.weekCount) || (b.stats.score - a.stats.score))
            .slice(0, limit || 12);
    },

    /** 踩雷预警榜 */
    warnDishes(limit) {
        const out = [];
        this.stores.forEach(s => s.dishes.forEach(d => {
            const st = this.dishStats(d.id);
            const reason = [];
            if (st.drop >= 0.35) reason.push(WARN_TEXTS.recentDrop);
            if (st.avg !== null && st.avg < 3.3 && st.count >= 3) reason.push(WARN_TEXTS.lowAvg);
            const lowTexts = this.reviewsOfDish(d.id).filter(r => reviewScore(r) < 2.8).length;
            if (lowTexts >= 2 && st.count >= 3) reason.push(WARN_TEXTS.highOil);
            if (reason.length) {
                const risk = (st.drop || 0) * 2 + (3.6 - (st.avg === null ? 3.6 : st.avg)) + lowTexts * 0.08;
                out.push({ store: s, dish: d, stats: st, reasons: reason, risk: risk });
            }
        }));
        return out.sort((a, b) => b.risk - a.risk).slice(0, limit || 10);
    },

    search(kw) {
        if (!kw) return [];
        kw = kw.trim().toLowerCase();
        const stores = this.stores.filter(s =>
            (s.name + s.canteen + s.floor + s.tagline).toLowerCase().indexOf(kw) >= 0);
        const dishes = [];
        this.stores.forEach(s => s.dishes.forEach(d => {
            if ((d.name + d.tag).toLowerCase().indexOf(kw) >= 0) dishes.push({ store: s, dish: d });
        }));
        return { stores: stores, dishes: dishes };
    },

    /* -------- 用户 / 评价 -------- */
    login(account, name) {
        account = (account || '').trim();
        name = (name || '').trim();
        if (!account) return { ok: false, msg: '请输入学号 / 工号' };
        let role = 'student';
        if (/^T\d/i.test(account)) role = 'teacher';
        else if (/^S\d/i.test(account)) role = 'staff';
        const users = this.load(STORAGE.users, {});
        if (!users[account]) {
            users[account] = {
                account: account, name: name || defaultName(account, role),
                role: role, joinTs: Date.now()
            };
            this.save(STORAGE.users, users);
        } else if (name) { users[account].name = name; this.save(STORAGE.users, users); }
        this.user = Object.assign({ joinedAt: Date.now() }, users[account]);
        this.save(STORAGE.session, this.user);
        return { ok: true, role: role, user: this.user };
    },

    logout() {
        this.user = null;
        localStorage.removeItem(STORAGE.session);
    },

    canReview() {
        if (!this.user) return { ok: false, code: 'guest', msg: '请先登录后再评价' };
        if (this.user.role === 'staff') return { ok: false, code: 'staff', msg: '门店店员不可参与评价' };
        if (this.user.role !== 'student' && this.user.role !== 'teacher')
            return { ok: false, code: 'other', msg: '当前身份不可评价' };
        return { ok: true };
    },

    myReview(dishId) {
        if (!this.user) return null;
        return this.userReviews.find(r => r.dishId === dishId && r.userId === this.user.account) || null;
    },

    submitReview(payload) {
        const guard = this.canReview();
        if (!guard.ok) return guard;

        const scores = {
            taste: clamp(+payload.taste || 0, 1, 5),
            portion: clamp(+payload.portion || 0, 1, 5),
            env: clamp(+payload.env || 0, 1, 5),
            service: clamp(+payload.service || 0, 1, 5),
            value: clamp(+payload.value || 0, 1, 5)
        };
        const text = (payload.text || '').trim();
        if (!text) return { ok: false, msg: '说点什么吧，哪怕只写两个字' };
        if (text.length < 2) return { ok: false, msg: '评价内容太短了' };

        const dish = this.dishMap[payload.dishId];
        if (!dish) return { ok: false, msg: '菜品不存在' };

        const exist = this.myReview(payload.dishId);
        const rec = {
            id: exist ? exist.id : uid('r_'),
            dishId: dish.id,
            storeId: dish.storeId,
            userId: this.user.account,
            userName: this.user.name,
            role: this.user.role,
            anonymous: payload.anonymous !== false,
            taste: scores.taste, portion: scores.portion, env: scores.env,
            service: scores.service, value: scores.value,
            text: text,
            ts: Date.now(),
            seed: false
        };
        if (exist) {
            const i = this.userReviews.indexOf(exist);
            this.userReviews[i] = rec;
        } else {
            this.userReviews.push(rec);
        }
        this.save(STORAGE.reviews, this.userReviews);
        this.reviews = this.seedReviews.concat(this.userReviews);
        this.globalMean = this.computeGlobalMean();
        return { ok: true, updated: !!exist, id: rec.id };
    },

    deleteMyReview(reviewId) {
        if (!this.user) return { ok: false, msg: '请先登录' };
        if (this.user.role === 'staff') return { ok: false, msg: '门店店员不可参与评价' };
        const i = this.userReviews.findIndex(r => r.id === reviewId);
        if (i < 0) return { ok: false, msg: '未找到该评价' };
        this.userReviews.splice(i, 1);
        this.save(STORAGE.reviews, this.userReviews);
        this.reviews = this.seedReviews.concat(this.userReviews);
        this.globalMean = this.computeGlobalMean();
        return { ok: true };
    },

    toggleLike(reviewId) {
        const k = 'like_' + reviewId;
        this.liked[k] = !this.liked[k];
        this.save(STORAGE.liked, this.liked);
        return this.liked[k];
    },
    isLiked(reviewId) { return !!this.liked['like_' + reviewId]; }
};

function defaultName(account, role) {
    const pool = role === 'teacher' ? ['张老师', '刘老师', '王老师', '李老师']
        : role === 'staff' ? ['周师傅', '吴店长', '郑大厨']
            : ['李同学', '王同学', '陈同学', '张同学'];
    let h = hashCode(account);
    return pool[h % pool.length];
}

/* -------------------- 展示辅助 -------------------- */
function stars(v, size) {
    if (v === null || v === undefined) return '<span class="muted">暂无</span>';
    const full = Math.floor(v), half = v - full >= 0.35 ? 1 : 0;
    let html = '';
    for (let i = 0; i < 5; i++) {
        html += '<i class="star' + (i < full + half ? ' on' : '') + (i === full && half ? ' half' : '') + '" style="' +
            (size ? 'font-size:' + size + 'px' : '') + '"></i>';
    }
    return '<span class="stars">' + html + '<b>' + v.toFixed(1) + '</b></span>';
}
function scoreColor(v) {
    if (v >= 4.4) return '#16a34a';
    if (v >= 4.0) return '#65a30d';
    if (v >= 3.6) return '#d97706';
    return '#dc2626';
}
function fmtTime(ts) {
    const d = Date.now() - ts;
    if (d < 3600000) return Math.max(1, Math.round(d / 60000)) + ' 分钟前';
    if (d < DAY) return Math.round(d / 3600000) + ' 小时前';
    if (d < 30 * DAY) return Math.round(d / DAY) + ' 天前';
    const dt = new Date(ts);
    return (dt.getMonth() + 1) + ' 月 ' + dt.getDate() + ' 日';
}
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}