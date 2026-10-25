(function(){
  var C = window.AZE_FB; if (!C) return;
  var DB = C.db.replace(/\/$/, ''), KEY = C.key;
  var YT = /^[A-Za-z0-9_-]{11}$/;
  var SKEY = 'aze_adm';
  var LANGS = ['ru', 'en', 'tr'];
  var LNAME = {ru:'Rus', en:'İngilis', tr:'Türk'};
  var PAGE = (document.documentElement.lang || 'az').slice(0, 2);

  function el(tag, attrs, kids){
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k){
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0,2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function(c){ if (c) n.appendChild(c); });
    return n;
  }

  function parseYt(s){
    s = (s || '').trim();
    if (YT.test(s)) return s;
    var m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function fetchVideos(){
    return fetch(DB + '/videos.json').then(function(r){
      if (!r.ok) throw new Error('db');
      return r.json();
    }).then(function(d){
      var out = [];
      Object.keys(d || {}).forEach(function(k){
        var v = d[k];
        if (v && YT.test(v.yt || '') && typeof v.title === 'string') {
          var o = {k:k, yt:v.yt, title:v.title, desc:typeof v.desc === 'string' ? v.desc : '', order:Number(v.order) || 0, tr:{}};
          LANGS.forEach(function(l){
            o.tr[l] = {title:typeof v['title_' + l] === 'string' ? v['title_' + l] : '', desc:typeof v['desc_' + l] === 'string' ? v['desc_' + l] : ''};
          });
          out.push(o);
        }
      });
      out.sort(function(a,b){ return a.order - b.order; });
      return out;
    });
  }

  var PLAY = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#201400" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

  function localized(v){
    var t = v.tr && v.tr[PAGE];
    if (!t) return v;
    return {k:v.k, yt:v.yt, order:v.order, title:t.title || v.title, desc:t.title || t.desc ? t.desc : v.desc};
  }

  function card(v, playLabel){
    v = localized(v);
    var a = el('a', {'class':'vid-box', href:'https://www.youtube.com/watch?v=' + v.yt, target:'_blank', rel:'noopener noreferrer', 'aria-label':playLabel + ': ' + v.title}, [
      el('img', {src:'https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg', alt:'', loading:'lazy', width:'480', height:'360'})
    ]);
    var p = el('span', {'class':'play'}); p.innerHTML = PLAY; a.appendChild(p);
    a.addEventListener('click', function(e){
      e.preventDefault();
      var f = el('iframe', {src:'https://www.youtube-nocookie.com/embed/' + v.yt + '?autoplay=1&rel=0', allow:'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen:'', title:v.title});
      a.replaceWith(el('div', {'class':'vid-box'}, [f]));
    });
    var art = el('article', {'class':'vid in'}, [a, el('h3', {text:v.title})]);
    if (v.desc) art.appendChild(el('p', {text:v.desc}));
    return art;
  }

  function renderPublic(){
    var box = document.getElementById('vids'); if (!box) return;
    fetchVideos().then(function(list){
      box.textContent = '';
      if (!list.length){ box.appendChild(el('p', {'class':'vids-note', text:box.dataset.empty})); return; }
      list.forEach(function(v){ box.appendChild(card(v, box.dataset.play)); });
    }).catch(function(){
      box.textContent = '';
      box.appendChild(el('p', {'class':'vids-note', text:box.dataset.err}));
    });
  }

  function post(url, body){
    return fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}).then(function(r){
      return r.json().then(function(j){ if (!r.ok) throw new Error((j.error && j.error.message) || 'err'); return j; });
    });
  }
  function saveSession(j){
    var exp = Date.now() + (parseInt(j.expires_in || j.expiresIn, 10) - 60) * 1000;
    var s = {t:j.idToken || j.id_token, r:j.refreshToken || j.refresh_token, e:exp};
    try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch(e){}
    return s;
  }
  function session(){ try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch(e){ return null; } }
  function token(){
    var s = session(); if (!s) return Promise.reject(new Error('auth'));
    if (Date.now() < s.e) return Promise.resolve(s.t);
    return post('https://securetoken.googleapis.com/v1/token?key=' + KEY, {grant_type:'refresh_token', refresh_token:s.r})
      .then(function(j){ return saveSession(j).t; })
      .catch(function(){ try { sessionStorage.removeItem(SKEY); } catch(e){} throw new Error('auth'); });
  }
  function api(method, path, body){
    return token().then(function(t){
      return fetch(DB + path + '.json?auth=' + encodeURIComponent(t), {method:method, headers:{'Content-Type':'application/json'}, body:body !== undefined ? JSON.stringify(body) : undefined});
    }).then(function(r){ if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'perm' : 'db'); return r.json(); });
  }

  var dlg = null;
  function close(){ if (dlg){ dlg.remove(); dlg = null; document.removeEventListener('keydown', onKey); } }
  function onKey(e){ if (e.key === 'Escape') close(); }

  function open(){
    if (dlg) return;
    dlg = el('div', {'class':'adm', role:'dialog', 'aria-modal':'true', 'aria-label':'Admin'});
    dlg.addEventListener('click', function(e){ if (e.target === dlg) close(); });
    document.body.appendChild(dlg);
    document.addEventListener('keydown', onKey);
    if (session()) panel(); else login();
  }

  function shell(title, nodes){
    dlg.textContent = '';
    var head = el('div', {'class':'adm-head'}, [el('h2', {text:title}), el('button', {type:'button', 'aria-label':'Bağla', text:'×', onclick:close})]);
    dlg.appendChild(el('div', {'class':'adm-box'}, [head].concat(nodes)));
  }

  function login(){
    var msg = el('p', {'class':'adm-msg', role:'alert'});
    var email = el('input', {type:'email', required:'', autocomplete:'username', id:'adm-e'});
    var pass = el('input', {type:'password', required:'', autocomplete:'current-password', id:'adm-p'});
    var btn = el('button', {type:'submit', 'class':'pill', text:'Daxil ol'});
    var f = el('form', {'class':'adm-form'}, [
      el('label', {'for':'adm-e', text:'E-poçt'}), email,
      el('label', {'for':'adm-p', text:'Parol'}), pass, btn, msg
    ]);
    f.addEventListener('submit', function(e){
      e.preventDefault(); btn.disabled = true; msg.textContent = '';
      post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY, {email:email.value.trim(), password:pass.value, returnSecureToken:true})
        .then(function(j){ saveSession(j); panel(); })
        .catch(function(){ msg.textContent = 'E-poçt və ya parol yanlışdır.'; btn.disabled = false; });
    });
    shell('Admin girişi', [f]);
    email.focus();
  }

  function panel(){
    var list = el('div', {'class':'adm-list'});
    var msg = el('p', {'class':'adm-msg', role:'status'});
    var url = el('input', {type:'text', id:'adm-u', placeholder:'https://youtu.be/...', required:'', autocomplete:'off'});
    var title = el('input', {type:'text', id:'adm-t', maxlength:'120', required:'', autocomplete:'off'});
    var desc = el('textarea', {id:'adm-d', maxlength:'400', rows:'2'});
    var btn = el('button', {type:'submit', 'class':'pill', text:'Yadda saxla'});
    var tr = {};
    var more = el('details', {'class':'adm-tr'}, [el('summary', {text:'Digər dillər (istəyə görə)'})]);
    LANGS.forEach(function(l){
      tr[l] = {t:el('input', {type:'text', id:'adm-t-' + l, maxlength:'120', autocomplete:'off'}), d:el('textarea', {id:'adm-d-' + l, maxlength:'400', rows:'2'})};
      more.appendChild(el('label', {'for':'adm-t-' + l, text:LNAME[l] + ' dilində ad'}));
      more.appendChild(tr[l].t);
      more.appendChild(el('label', {'for':'adm-d-' + l, text:LNAME[l] + ' dilində təsvir'}));
      more.appendChild(tr[l].d);
    });
    var f = el('form', {'class':'adm-form'}, [
      el('label', {'for':'adm-u', text:'YouTube linki'}), url,
      el('label', {'for':'adm-t', text:'Ad (Azərbaycan dilində)'}), title,
      el('label', {'for':'adm-d', text:'Qısa təsvir (istəyə görə)'}), desc,
      more, btn, cancel, msg
    ]);
    var current = [];
    var editKey = null;
    var cancel = el('button', {type:'button', 'class':'adm-out', text:'Redaktəni ləğv et', hidden:'', onclick:function(){ resetForm(); }});

    function resetForm(){
      editKey = null;
      url.value = title.value = desc.value = '';
      LANGS.forEach(function(l){ tr[l].t.value = tr[l].d.value = ''; });
      btn.textContent = 'Yadda saxla'; cancel.hidden = true; more.open = false; msg.textContent = '';
    }
    function startEdit(v){
      editKey = v.k;
      url.value = 'https://youtu.be/' + v.yt; title.value = v.title; desc.value = v.desc;
      LANGS.forEach(function(l){ tr[l].t.value = v.tr[l].title; tr[l].d.value = v.tr[l].desc; });
      more.open = LANGS.some(function(l){ return v.tr[l].title || v.tr[l].desc; });
      btn.textContent = 'Yenilə'; cancel.hidden = false; msg.textContent = '';
      dlg.scrollTop = 0; (dlg.firstChild || dlg).scrollTop = 0; url.focus();
    }

    function fail(e){
      if (e.message === 'auth'){ login(); return; }
      msg.textContent = e.message === 'perm' ? 'Bu hesabın yazmaq icazəsi yoxdur.' : 'Əməliyyat alınmadı. İnternet bağlantısını yoxlayın.';
    }
    function refresh(){
      return fetchVideos().then(function(v){ current = v; drawList(); renderPublic(); }).catch(function(){ msg.textContent = 'Siyahı yüklənmədi.'; });
    }
    function move(i, d){
      var a = current[i], b = current[i + d]; if (!b) return;
      Promise.all([api('PUT', '/videos/' + a.k + '/order', b.order), api('PUT', '/videos/' + b.k + '/order', a.order)]).then(refresh).catch(fail);
    }
    function drawList(){
      list.textContent = '';
      if (!current.length){ list.appendChild(el('p', {'class':'adm-note', text:'Hələ video yoxdur.'})); return; }
      current.forEach(function(v, i){
        list.appendChild(el('div', {'class':'adm-row'}, [
          el('span', {text:v.title}),
          el('button', {type:'button', 'aria-label':'Redaktə et', text:'Redaktə', onclick:function(){ startEdit(v); }}),
          el('button', {type:'button', 'aria-label':'Yuxarı', text:'↑', onclick:function(){ move(i, -1); }}),
          el('button', {type:'button', 'aria-label':'Aşağı', text:'↓', onclick:function(){ move(i, 1); }}),
          el('button', {type:'button', 'aria-label':'Sil', text:'Sil', onclick:function(){
            if (!confirm('«' + v.title + '» silinsin?')) return;
            api('DELETE', '/videos/' + v.k).then(refresh).catch(fail);
          }})
        ]));
      });
    }
    f.addEventListener('submit', function(e){
      e.preventDefault(); msg.textContent = '';
      var id = parseYt(url.value);
      if (!id){ msg.textContent = 'YouTube linki tanınmadı.'; return; }
      var min = current.length ? current[0].order : 0;
      btn.disabled = true;
      if (editKey){
        var upd = {yt:id, title:title.value.trim(), desc:desc.value.trim()};
        LANGS.forEach(function(l){
          upd['title_' + l] = tr[l].t.value.trim() || null;
          upd['desc_' + l] = tr[l].d.value.trim() || null;
        });
        api('PATCH', '/videos/' + editKey, upd).then(function(){
          resetForm(); msg.textContent = 'Yeniləndi.'; return refresh();
        }).catch(fail).then(function(){ btn.disabled = false; });
        return;
      }
      var body = {yt:id, title:title.value.trim(), desc:desc.value.trim(), order:min - 1};
      LANGS.forEach(function(l){
        var t = tr[l].t.value.trim(), d = tr[l].d.value.trim();
        if (t) body['title_' + l] = t;
        if (d) body['desc_' + l] = d;
      });
      api('POST', '/videos', body).then(function(){
        url.value = title.value = desc.value = '';
        LANGS.forEach(function(l){ tr[l].t.value = tr[l].d.value = ''; }); msg.textContent = 'Yadda saxlanıldı.'; return refresh();
      }).catch(fail).then(function(){ btn.disabled = false; });
    });
    var out = el('button', {type:'button', 'class':'adm-out', text:'Çıxış', onclick:function(){ try { sessionStorage.removeItem(SKEY); } catch(e){} close(); }});
    shell('Təqdimat videoları', [f, el('h3', {text:'Siyahı'}), list, out]);
    url.focus();
    refresh();
  }

  function hookLogo(){
    var logo = document.querySelector('.logo'); if (!logo) return;
    logo.addEventListener('click', function(e){
      var now = Date.now(), n = 0;
      try { var s = JSON.parse(sessionStorage.getItem('aze_lc') || 'null'); if (s && now - s.t < 2500) n = s.n; } catch(x){}
      n++;
      if (n >= 5){ e.preventDefault(); try { sessionStorage.removeItem('aze_lc'); } catch(x){} open(); return; }
      try { sessionStorage.setItem('aze_lc', JSON.stringify({n:n, t:now})); } catch(x){}
    });
  }

  if (KEY) hookLogo();
  renderPublic();
})();
