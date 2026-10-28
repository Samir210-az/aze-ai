(function(){
  try { if (localStorage.getItem('aze_nohit') === '1') return; } catch(e){}
  if (navigator.doNotTrack === '1') return;
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var fresh = 1;
  try {
    if (sessionStorage.getItem('aze_v')) fresh = 0;
    else sessionStorage.setItem('aze_v', '1');
  } catch(e){}
  fetch('/api/hit', {
    method: 'POST',
    headers: {'Content-Type': 'text/plain'},
    body: JSON.stringify({p: path, n: fresh}),
    keepalive: true
  }).catch(function(){});
})();
