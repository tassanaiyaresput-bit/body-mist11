/* ==========================================================================
   Body Scent — shared script (use on every page)
   Each section runs only if its elements exist on the current page.

   Element IDs used:
   - product.html : #filter-bar, #product-list
   - order.html   : #orderForm, #customerName, #contact, #items, #total, #note
   - admin.html   : #ordersTable  (rows are written into its <tbody>)
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Config
     ------------------------------------------------------------------------ */
  var PRODUCTS_URL = 'products.json';

  var ORDER_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbwmLeTEchf1CR3D5XQ6UCEUozmZeJ5UYFKfa58BDQDwC0iKA3yG4oTaMGDVHxdDjs5LRg/exec';

  var ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTISBklDA_Q9AUvOriawAWONzyJAPS6ag37ifa_qobDDIPidp1ogfbIk5qOgi0NXFKjvJYcVCk2KsKq/pub?gid=0&single=true&output=csv';

  var MOODS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'fresh', label: 'Fresh' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'confident', label: 'Confident' },
    { key: 'romance', label: 'Romance' }
  ];

  var MOOD_LABELS = {
    fresh: 'Fresh',
    sweet: 'Sweet',
    confident: 'Confident',
    romance: 'Romance'
  };

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(value) {
    var n = Number(value);
    return isNaN(n) ? String(value) : n.toLocaleString('th-TH');
  }

  /* ========================================================================
     1) product.html — product cards + mood filter
     ======================================================================== */
  function initProductPage() {
    var filterBar = document.getElementById('filter-bar');
    var list = document.getElementById('product-list');
    if (!filterBar || !list) return;

    var products = [];
    var currentMood = 'all';

    function isValidMood(m) {
      return MOODS.some(function (x) {
        return x.key === m;
      });
    }

    function buildCard(p) {
      var card = el('article', 'card');
      card.setAttribute('data-mood', p.mood);

      var media = el('div', 'card__media');
      var img = el('img');
      img.src = p.image;
      img.alt = p.name;
      img.loading = 'lazy';
      media.appendChild(img);

      var body = el('div', 'card__body');

      var meta = el('div', 'card__meta');
      var moodLabel = el('span', 'mood-label', MOOD_LABELS[p.mood] || p.mood);
      moodLabel.setAttribute('data-mood', p.mood);
      meta.appendChild(moodLabel);
      meta.appendChild(el('span', 'tag', p.size ? p.size : 'โรลออน'));

      var title = el('h3', 'card__title', p.name);

      var footer = el('div', 'card__footer');
      var price = el('span', 'price', formatPrice(p.price));
      price.appendChild(el('small', null, 'บาท'));

      var buy = el('a', 'btn btn--small', 'สั่งซื้อ');
      buy.href =
        'order.html?item=' +
        encodeURIComponent(p.name) +
        '&price=' +
        encodeURIComponent(p.price);

      footer.appendChild(price);
      footer.appendChild(buy);

      body.appendChild(meta);
      body.appendChild(title);
      body.appendChild(footer);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.innerHTML = '';
      var shown = products.filter(function (p) {
        return currentMood === 'all' || p.mood === currentMood;
      });

      if (!shown.length) {
        list.appendChild(el('p', 'small', 'ไม่พบสินค้าในหมวดนี้'));
        return;
      }
      shown.forEach(function (p) {
        list.appendChild(buildCard(p));
      });
    }

    function updateButtons() {
      var buttons = filterBar.querySelectorAll('.filter__btn');
      Array.prototype.forEach.call(buttons, function (btn) {
        var active = btn.getAttribute('data-mood') === currentMood;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setMood(mood) {
      currentMood = isValidMood(mood) ? mood : 'all';
      updateButtons();
      render();

      // keep ?mood= in the address bar in sync (ignored if not supported)
      try {
        var url = new URL(window.location.href);
        if (currentMood === 'all') {
          url.searchParams.delete('mood');
        } else {
          url.searchParams.set('mood', currentMood);
        }
        window.history.replaceState(null, '', url);
      } catch (e) {
        /* no-op */
      }
    }

    function buildFilterBar() {
      filterBar.innerHTML = '';
      MOODS.forEach(function (m) {
        var btn = el('button', 'filter__btn');
        btn.type = 'button';
        btn.setAttribute('data-mood', m.key);

        if (m.key !== 'all') {
          var dot = el('span', 'mood-dot');
          dot.setAttribute('data-mood', m.key);
          btn.appendChild(dot);
        }
        btn.appendChild(document.createTextNode(m.label));

        btn.addEventListener('click', function () {
          setMood(m.key);
        });
        filterBar.appendChild(btn);
      });
    }

    buildFilterBar();

    var initialMood = new URLSearchParams(window.location.search).get('mood');
    currentMood = initialMood && isValidMood(initialMood.toLowerCase())
      ? initialMood.toLowerCase()
      : 'all';
    updateButtons();

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        render();
      })
      .catch(function (error) {
        console.error(error);
        list.innerHTML = '';
        list.appendChild(
          el('p', 'small', 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง')
        );
      });
  }

  /* ========================================================================
     2) order.html — prefill form from URL + submit to Apps Script
     ======================================================================== */
  function initOrderPage() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    var itemsInput = document.getElementById('items');
    var totalInput = document.getElementById('total');

    // Prefill from ?item=...&price=... (both fields)
    var params = new URLSearchParams(window.location.search);
    var item = params.get('item');
    var price = params.get('price');

    if (itemsInput && item !== null) itemsInput.value = item;
    if (totalInput && price !== null) totalInput.value = price;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
        return;
      }

      var payload = {
        customerName: document.getElementById('customerName').value,
        contact: document.getElementById('contact').value,
        items: document.getElementById('items').value,
        total: document.getElementById('total').value,
        note: document.getElementById('note').value
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
        .then(() => {
          window.location.href = 'thankyou.html';
        })
        .catch(error => {
          console.error(error);
          alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  /* ========================================================================
     3) admin.html — load orders from published CSV, newest first
     ======================================================================== */

  // Minimal CSV parser: handles quoted fields, "" escapes,
  // commas and line breaks inside quotes, CRLF / LF endings.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    // strip BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }

    // last field / row without trailing newline
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function initAdminPage() {
    var table = document.getElementById('ordersTable');
    if (!table) return;

    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var COLUMNS = 6; // time, name, contact, items, total, note

    function message(text) {
      tbody.innerHTML = '';
      var tr = el('tr');
      var td = el('td', 'small', text);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    message('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL + '&_=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text).filter(function (r) {
          return r.some(function (cell) {
            return cell.trim() !== '';
          });
        });

        rows.shift(); // first row = header

        if (!rows.length) {
          message('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        rows.reverse(); // newest (last appended) first
        tbody.innerHTML = '';

        rows.forEach(function (r) {
          var tr = el('tr');
          for (var i = 0; i < COLUMNS; i++) {
            var value = r[i] !== undefined ? r[i] : '';
            if (i === 4 && value !== '' && !isNaN(Number(value))) {
              value = formatPrice(value);
            }
            tr.appendChild(el('td', null, value));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        message('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
