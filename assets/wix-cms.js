/* ===================================================================
   Thiink Media Graphics — Wix Headless CMS connector
   -------------------------------------------------------------------
   This file provides two paths to populate the News/Blog page:

   1) LIVE — Wix Headless via the OAuth Visitor Token flow.
      Plug in your client ID below, and (optionally) the Blog or
      Data Collection ID, and the page will fetch live from Wix.

      Docs: https://dev.wix.com/docs/sdk/api-reference/sdk/wix-blog
            https://dev.wix.com/docs/rest/articles/getting-started/headless

   2) MOCK — graceful fallback that loads from data/news.json,
      shown when no client ID is set, when Wix returns nothing,
      or when the user is offline / opens via file:// during dev.

   The public API: window.TMGNews.load({ container, onItem })
   =================================================================== */
(function () {
  'use strict';

  // ---------------- CONFIG --------------------------------------------------
  const WIX = {
    // Paste your Wix Headless OAuth client ID here.
    // From: Wix Dashboard → Settings → Headless Settings → OAuth Apps
    clientId: '',                       // e.g. '11111111-aaaa-bbbb-cccc-222222222222'

    // Optional: pin to a specific blog or data collection.
    // If left blank we'll just pull recent blog posts.
    blogId:   '',
    site:     'https://www.thiinkmediagraphics.com',

    // CDN base for the OAuth + SDK rest endpoints.
    apiBase:  'https://www.wixapis.com',
    authBase: 'https://www.wixapis.com/oauth2'
  };

  // ---------------- OAuth visitor token cache ------------------------------
  async function getVisitorToken() {
    if (!WIX.clientId) return null;
    const cached = sessionStorage.getItem('tmg-wix-token');
    const exp    = +sessionStorage.getItem('tmg-wix-exp') || 0;
    if (cached && exp > Date.now() + 30_000) return cached;

    try {
      const res = await fetch(`${WIX.authBase}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: WIX.clientId,
          grantType: 'anonymous'
        })
      });
      if (!res.ok) throw new Error('Wix token ' + res.status);
      const json = await res.json();
      const ttl  = (json.expires_in || 240) * 1000;
      sessionStorage.setItem('tmg-wix-token', json.access_token);
      sessionStorage.setItem('tmg-wix-exp', String(Date.now() + ttl));
      return json.access_token;
    } catch (err) {
      console.warn('[TMG] Wix auth failed — falling back to local content.', err);
      return null;
    }
  }

  // ---------------- Fetch posts from Wix ------------------------------------
  async function fetchWixPosts() {
    const token = await getVisitorToken();
    if (!token) return null;

    try {
      const res = await fetch(`${WIX.apiBase}/blog/v3/posts/query`, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: {
            sort: [{ fieldName: 'firstPublishedDate', order: 'DESC' }],
            paging: { limit: 24 }
          },
          fieldsets: ['URL', 'METRICS', 'CONTENT_TEXT', 'RICH_CONTENT']
        })
      });
      if (!res.ok) throw new Error('Wix query ' + res.status);
      const json = await res.json();
      return (json.posts || []).map(p => ({
        id: p.id,
        title: p.title,
        category: (p.categoryIds && p.categoryIds[0]) || 'Insight',
        excerpt: p.excerpt || p.contentText?.slice(0, 220) || '',
        date: p.firstPublishedDate || p.lastPublishedDate,
        cover: p.media?.wixMedia?.image?.url || p.coverImage || '',
        url: `${WIX.site}/post/${p.slug || p.id}`,
        readTime: (p.minutesToRead || 5) + ' min read'
      }));
    } catch (err) {
      console.warn('[TMG] Wix fetch failed — using local content.', err);
      return null;
    }
  }

  // ---------------- Local fallback content ----------------------------------
  async function fetchMock() {
    try {
      const res = await fetch('data/news.json');
      if (!res.ok) throw new Error('mock ' + res.status);
      return await res.json();
    } catch (err) {
      // Inline fallback (so even file:// works)
      return INLINE_FALLBACK;
    }
  }

  // ---------------- Render helpers ------------------------------------------
  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      });
    } catch { return iso; }
  }

  function renderRows(container, items) {
    container.innerHTML = '';
    items.forEach((p, i) => {
      const a = document.createElement('a');
      a.className = 'news-row';
      a.href = p.url || '#';
      a.target = p.url?.startsWith('http') ? '_blank' : '_self';
      a.rel = 'noopener';
      a.setAttribute('data-reveal', '');
      a.innerHTML = `
        <span class="news-row__num">${String(i + 1).padStart(2,'0')}</span>
        <span class="news-row__cat">${p.category || 'Insight'}</span>
        <span class="news-row__title">${p.title}</span>
        <span class="news-row__date">${fmtDate(p.date)} <em class="muted serif-italic">· ${p.readTime || '5 min read'}</em></span>
        <span class="news-row__arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </span>
      `;
      container.appendChild(a);
    });

    // re-trigger reveal observer for the just-injected rows
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
      }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
      container.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
    }
  }

  function renderFeatured(slot, post) {
    if (!slot || !post) return;
    slot.querySelector('[data-feat-cat]').textContent      = post.category;
    slot.querySelector('[data-feat-title]').textContent    = post.title;
    slot.querySelector('[data-feat-excerpt]').textContent  = post.excerpt;
    slot.querySelector('[data-feat-date]').textContent     = fmtDate(post.date) + ' · ' + (post.readTime || '5 min read');
    const link = slot.querySelector('[data-feat-link]');
    if (link) link.href = post.url || '#';
    const img = slot.querySelector('[data-feat-img]');
    if (img && post.cover) img.style.backgroundImage = `url("${post.cover}")`;
  }

  // ---------------- Public loader -------------------------------------------
  async function load({ rowsContainer, featuredSlot, statusEl } = {}) {
    if (statusEl) statusEl.textContent = 'Drawing from the archives…';

    let posts = await fetchWixPosts();
    let src = 'wix';
    if (!posts || !posts.length) {
      posts = await fetchMock();
      src = 'archive';
    }

    if (statusEl) {
      statusEl.innerHTML = src === 'wix'
        ? `<span class="gold">●</span> Live · Wix CMS · ${posts.length} entries`
        : `<span class="gold">●</span> Curated archive · ${posts.length} entries`;
    }

    if (featuredSlot && posts[0]) {
      renderFeatured(featuredSlot, posts[0]);
      if (rowsContainer) renderRows(rowsContainer, posts.slice(1));
    } else if (rowsContainer) {
      renderRows(rowsContainer, posts);
    }
  }

  // ---------------- Inline fallback content ---------------------------------
  const INLINE_FALLBACK = [
    {
      id: 'monumentality',
      title: 'On Monumentality — Why brands that endure feel carved, not printed.',
      category: 'Philosophy',
      excerpt: 'Three rules from Roman architecture that apply to every modern brand system we build — and the one most studios get exactly backwards.',
      date: '2026-05-12',
      readTime: '7 min read',
      cover: 'assets/img/pantheon.jpg',
      url: 'https://www.thiinkmediagraphics.com/post/monumentality'
    },
    {
      id: 'two-eyes',
      title: 'The second I is the discipline — A note on seeing twice.',
      category: 'Studio Notes',
      excerpt: 'Why we spell the studio name with two I\'s, and why most design decisions in 2026 are made too quickly to be true.',
      date: '2026-04-22',
      readTime: '4 min read',
      cover: 'assets/img/caesar.jpg',
      url: '#'
    },
    {
      id: 'restraint',
      title: 'Restraint as a luxury good.',
      category: 'Design Principles',
      excerpt: 'The clients who let us remove the most are the ones who keep coming back. A case study in saying no to your own ideas.',
      date: '2026-03-30',
      readTime: '6 min read',
      cover: 'assets/img/colosseum.jpg',
      url: '#'
    },
    {
      id: 'ten-year',
      title: 'The ten-year benchmark — A test we run on every visual decision.',
      category: 'Process',
      excerpt: 'If a logo, layout, or campaign won\'t still look right a decade from now, we don\'t ship it. Here is how we apply the test.',
      date: '2026-03-08',
      readTime: '5 min read',
      cover: '',
      url: '#'
    },
    {
      id: 'gold-on-black',
      title: 'Gold on black — The signature contrast and why it works.',
      category: 'Color Theory',
      excerpt: 'The optical case for our most-used color pair, and the four lighting conditions where it falls apart.',
      date: '2026-02-14',
      readTime: '4 min read',
      cover: '',
      url: '#'
    },
    {
      id: 'wix-headless',
      title: 'Why our 2026 site is built on Wix Headless.',
      category: 'Engineering',
      excerpt: 'A note from the build: how we decoupled content from presentation while keeping the editorial workflow we love.',
      date: '2026-01-29',
      readTime: '8 min read',
      cover: '',
      url: '#'
    },
    {
      id: 'classical-imagery',
      title: 'Marble, chiaroscuro, and the museum-not-stock approach.',
      category: 'Imagery',
      excerpt: 'Why we never use a stock library — and the small art history reading list every junior on the team gets handed.',
      date: '2026-01-10',
      readTime: '6 min read',
      cover: '',
      url: '#'
    },
    {
      id: 'spartan-voice',
      title: 'No exclamation points — A short manual on Spartan voice.',
      category: 'Tone of Voice',
      excerpt: 'The four-word voice rule we apply to every line of brand copy, and a before/after from a real client document.',
      date: '2025-12-18',
      readTime: '5 min read',
      cover: '',
      url: '#'
    }
  ];

  window.TMGNews = { load };
})();
