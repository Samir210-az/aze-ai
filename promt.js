(function () {
  var form = document.getElementById("pr-form");
  if (!form) return;
  var d = form.dataset;
  var idea = document.getElementById("pr-idea");
  var goBtn = document.getElementById("pr-go");
  var clearBtn = document.getElementById("pr-clear");
  var out = document.getElementById("pr-out");
  var msg = document.getElementById("pr-msg");

  function say(text) {
    msg.textContent = text || "";
  }

  function show(joke, prompt) {
    out.textContent = "";
    if (joke) {
      var j = document.createElement("p");
      j.className = "pr-joke";
      var tag = document.createElement("span");
      tag.textContent = d.joke;
      j.appendChild(tag);
      j.appendChild(document.createTextNode(joke));
      out.appendChild(j);
    }
    var card = document.createElement("div");
    card.className = "pr-card";
    var head = document.createElement("div");
    head.className = "pr-card-h";
    var h = document.createElement("h2");
    h.textContent = d.result;
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "pr-copy";
    copy.textContent = d.copy;
    head.appendChild(h);
    head.appendChild(copy);
    var pre = document.createElement("pre");
    pre.textContent = prompt;
    card.appendChild(head);
    card.appendChild(pre);
    out.appendChild(card);
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = d.copied;
        setTimeout(function () { copy.textContent = d.copy; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prompt).then(done, function () {});
      }
    });
    card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = idea.value.trim();
    say("");
    if (text.length < 3) {
      say(d.eShort);
      idea.focus();
      return;
    }
    out.textContent = "";
    goBtn.disabled = true;
    goBtn.textContent = d.busy;
    fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: text,
        target: form.elements.target.value,
        tone: form.elements.tone.value,
        plang: form.elements.plang.value,
        lang: document.documentElement.lang
      })
    })
      .then(function (res) {
        if (res.status === 429) throw new Error("rate");
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (b) {
            var e = new Error("srv");
            e.info = [res.status, b.error, b.detail].filter(Boolean).join(" ");
            throw e;
          });
        }
        return res.json();
      })
      .then(function (data) {
        show(data.joke, data.prompt);
      })
      .catch(function (err) {
        say(err.message === "rate" ? d.eRate : err.message === "srv" ? d.eSrv + (err.info ? " (" + err.info + ")" : "") : d.eNet);
      })
      .then(function () {
        goBtn.disabled = false;
        goBtn.textContent = d.go;
      });
  });

  clearBtn.addEventListener("click", function () {
    idea.value = "";
    out.textContent = "";
    say("");
    idea.focus();
  });
})();
