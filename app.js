(() => {
  const PAGE_LOADED_AT = Date.now();
  const MIN_SUBMIT_DELAY_MS = 900;

  const CONFIG = {
    companyName: "MASTER ELEVADORES",
    whatsapp: {
      phoneE164: "5561995755944",
      defaultMsg:
        "Olá! Quero solicitar um orçamento. Tipo de serviço: {{servico}}. Cidade: {{cidade}}. Nome: {{nome}}. Telefone: {{telefone}}. Mensagem: {{mensagem}}",
      urgentMsg:
        "Olá! Preciso de atendimento urgente para elevador. Pode me retornar o quanto antes? Nome: {{nome}}. Telefone: {{telefone}}. Cidade: {{cidade}}. Detalhes: {{mensagem}}",
    },
    tracking: {
      ga4MeasurementId: "", // ex: "G-XXXXXXXXXX"
      metaPixelId: "", // ex: "1234567890"
      clarityProjectId: "", // ex: "abcd1234"
    },
    recaptchaSiteKey: "", // reCAPTCHA v3 (invisível): https://www.google.com/recaptcha/admin
    abTest: {
      param: "v",
      variants: {
        "1": {
          headline: "Manutenção de elevadores com segurança e resposta rápida",
          subheadline:
            "Reduza falhas, reclamações e riscos de multa com equipe técnica qualificada, conformidade com normas e atendimento ágil.",
          cta: "Solicitar orçamento",
        },
        "2": {
          headline: "Menos paradas, mais segurança: manutenção de elevadores com SLA",
          subheadline:
            "Atendimento rápido e manutenção preventiva para reduzir falhas e dar previsibilidade ao seu condomínio ou empresa.",
          cta: "Quero uma proposta",
        },
      },
      defaultVariant: "1",
    },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function qs(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function clamp(str, max) {
    const s = (str ?? "").toString().trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function normalizePhoneDigits(v) {
    return (v ?? "").toString().replace(/\D+/g, "");
  }

  function sanitizePlainText(str, max) {
    const cleaned = (str ?? "")
      .toString()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return clamp(cleaned, max);
  }

  function sanitizeName(str) {
    return sanitizePlainText(str, 60);
  }

  function hasDangerousText(str) {
    const t = (str ?? "").toString();
    return /<script|<\/|javascript:|on\w+\s*=/i.test(t) || /[<>]/.test(t);
  }

  let recaptchaReadyPromise = null;
  function ensureRecaptchaLoaded(siteKey) {
    if (!siteKey) return Promise.resolve();
    if (window.grecaptcha && window.grecaptcha.execute) return Promise.resolve();
    if (!recaptchaReadyPromise) {
      recaptchaReadyPromise = new Promise((resolve, reject) => {
        if (document.querySelector('script[src*="recaptcha/api.js"]')) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("recaptcha_script"));
        document.head.appendChild(s);
      }).then(
        () =>
          new Promise((resolve, reject) => {
            const t0 = Date.now();
            (function wait() {
              if (window.grecaptcha && window.grecaptcha.execute) return resolve();
              if (Date.now() - t0 > 12000) return reject(new Error("recaptcha_timeout"));
              setTimeout(wait, 40);
            })();
          })
      );
    }
    return recaptchaReadyPromise;
  }

  async function runRecaptchaV3(siteKey) {
    if (!siteKey) return null;
    await ensureRecaptchaLoaded(siteKey);
    await new Promise((resolve) => {
      if (window.grecaptcha && window.grecaptcha.ready) window.grecaptcha.ready(resolve);
      else resolve();
    });
    return window.grecaptcha.execute(siteKey, { action: "lead_submit" });
  }

  function hardenExternalLinks() {
    $$('a[href^="http"]').forEach((a) => {
      if (a.getAttribute("target") !== "_blank") return;
      const parts = (a.getAttribute("rel") || "")
        .split(/\s+/)
        .filter(Boolean);
      if (!parts.includes("noopener")) parts.push("noopener");
      if (!parts.includes("noreferrer")) parts.push("noreferrer");
      a.setAttribute("rel", [...new Set(parts)].join(" "));
    });
  }

  function waLink(msg) {
    const lpPhone = window.LP_CONFIG && window.LP_CONFIG.whatsappPhoneE164;
    const phone =
      (typeof lpPhone === "string" && lpPhone.trim() ? lpPhone.trim() : "") || CONFIG.whatsapp.phoneE164;
    const base = `https://wa.me/${phone}`;
    const text = encodeURIComponent(msg);
    return `${base}?text=${text}`;
  }

  async function submitLeadToApi(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok && data && data.ok, status: r.status, data };
    } finally {
      clearTimeout(timeout);
    }
  }

  function template(str, data) {
    return (str ?? "").replace(/\{\{(\w+)\}\}/g, (_, k) => (data[k] ?? "").toString());
  }

  function loadGA4(id) {
    if (!id) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
  }

  function loadMetaPixel(id) {
    if (!id) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function loadClarity(projectId) {
    if (!projectId) return;
    (function (c, l, a, r, i, t, y) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments);
        };
      t = l.createElement(r);
      t.async = 1;
      t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", projectId);
  }

  function track(name, params = {}) {
    const payload = { ...params, event_name: name };
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params);
    } catch {}
    try {
      if (typeof window.fbq === "function") window.fbq("trackCustom", name, params);
    } catch {}
    try {
      if (typeof window.clarity === "function") window.clarity("set", "event", payload);
    } catch {}
  }

  function bindAutoTrackClicks() {
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target && e.target.closest && e.target.closest("[data-track]");
        if (!el) return;
        const name = el.getAttribute("data-track");
        track("click", { name });
      },
      { passive: true }
    );
  }

  function applyABVariant() {
    const v = qs(CONFIG.abTest.param) || CONFIG.abTest.defaultVariant;
    const variant = CONFIG.abTest.variants[v] || CONFIG.abTest.variants[CONFIG.abTest.defaultVariant];
    const h = $("#heroHeadline");
    if (h) h.textContent = variant.headline;
    $$(".btn-primary").forEach((b) => {
      if ((b.textContent || "").toLowerCase().includes("orçamento") || (b.textContent || "").toLowerCase().includes("proposta")) {
        b.textContent = variant.cta;
      }
    });
    track("ab_variant", { variant: v });
  }

  function setYear() {
    const el = $("#year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function getLeadData() {
    const nome = sanitizeName($("#nome")?.value);
    const telefone = normalizePhoneDigits($("#telefone")?.value).slice(0, 13);
    const servico = sanitizePlainText($("#servico")?.value, 40);
    const cidade = sanitizePlainText($("#cidade")?.value, 60);
    const mensagem = sanitizePlainText($("#mensagem")?.value, 500);
    return { nome, telefone, servico, cidade, mensagem };
  }

  function validateField(input) {
    if (!input) return true;
    const id = input.id;
    const err = $(`#err-${id}`);
    const raw = (input.value ?? "").toString();
    const value = raw.trim();

    let msg = "";
    if (input.hasAttribute("required") && !value) msg = "Campo obrigatório.";
    if (!msg && input.minLength > 0 && value && value.length < input.minLength) msg = "Preencha com mais detalhes.";

    if (!msg && (id === "nome" || id === "cidade" || id === "mensagem")) {
      if (hasDangerousText(raw)) msg = "Remova caracteres ou trechos não permitidos.";
    }

    if (!msg && id === "nome" && value && !sanitizeName(raw)) msg = "Informe um nome válido.";

    if (!msg && id === "telefone") {
      const digits = normalizePhoneDigits(value);
      if (!/^\d{10,13}$/.test(digits)) msg = "Informe um telefone válido (somente números, com DDD).";
    }

    if (err) err.textContent = msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }

  function bindForm() {
    const form = $("#leadForm");
    if (!form) return;
    const inputs = $$("input,select,textarea", form);
    const tel = $("#telefone");
    const honeypot = form.querySelector('input[name="address"]');

    if (tel) {
      tel.addEventListener(
        "input",
        () => {
          const digits = normalizePhoneDigits(tel.value).slice(0, 13);
          if (tel.value !== digits) tel.value = digits;
        },
        { passive: true }
      );
    }

    inputs.forEach((i) => {
      i.addEventListener(
        "input",
        () => {
          validateField(i);
          updateWhatsAppLinks();
          updateUrgentLinks();
        },
        { passive: true }
      );
      i.addEventListener("blur", () => validateField(i), { passive: true });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errRecaptcha = $("#err-recaptcha");
      if (errRecaptcha) errRecaptcha.textContent = "";
      const btn = form.querySelector('button[type="submit"]');
      const btnText = btn ? btn.textContent : "";
      const setBusy = (busy) => {
        if (!btn) return;
        btn.disabled = !!busy;
        btn.setAttribute("aria-busy", busy ? "true" : "false");
        btn.textContent = busy ? "Enviando..." : btnText;
      };

      if (Date.now() - PAGE_LOADED_AT < MIN_SUBMIT_DELAY_MS) {
        track("spam_blocked", { reason: "too_fast" });
        if (errRecaptcha) errRecaptcha.textContent = "Aguarde um instante e tente novamente.";
        return;
      }

      if (honeypot && (honeypot.value ?? "").toString().trim()) {
        track("spam_blocked", { reason: "honeypot" });
        if (errRecaptcha) errRecaptcha.textContent = "Não foi possível validar o envio.";
        return;
      }

      const ok = inputs.map(validateField).every(Boolean);
      if (!ok) {
        track("form_error", {});
        const firstInvalid = inputs.find((i) => i.getAttribute("aria-invalid") === "true");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const lp = window.LP_CONFIG && window.LP_CONFIG.recaptchaSiteKey;
      const siteKey =
        (typeof lp === "string" && lp.trim() ? lp.trim() : "") || CONFIG.recaptchaSiteKey || "";

      setBusy(true);
      let recaptchaToken = null;
      if (siteKey) {
        try {
          recaptchaToken = await runRecaptchaV3(siteKey);
          if (!recaptchaToken) throw new Error("no_token");
          track("recaptcha_ok", {});
        } catch {
          track("form_recaptcha_error", {});
          if (errRecaptcha) {
            errRecaptcha.textContent = "Não foi possível validar o envio. Atualize a página e tente de novo.";
          }
          setBusy(false);
          return;
        }
      }

      const data = getLeadData();
      track("form_submit", { servico: data.servico, cidade: data.cidade });

      const apiRes = await submitLeadToApi({
        ...data,
        address: honeypot ? (honeypot.value ?? "").toString() : "",
        recaptchaToken,
      }).catch(() => ({ ok: false, status: 0, data: {} }));

      const msg = template(CONFIG.whatsapp.defaultMsg, {
        ...data,
        mensagem: data.mensagem || "(sem mensagem)",
      });

      if (apiRes.ok) {
        track("lead_api_ok", {});
        setBusy(false);
        // Mantém o comportamento esperado da landing: seguir para o WhatsApp.
        window.location.href = waLink(msg);
        return;
      }
      track("lead_api_fail", { status: apiRes.status });

      setBusy(false);
      window.location.href = waLink(msg);
    });
  }

  function updateWhatsAppLinks() {
    const ids = [
      "whatsTop",
      "whatsHero",
      "whatsSolution",
      "whatsTrust",
      "whatsFormDirect",
      "whatsFinal",
      "whatsFooter",
      "whatsSticky",
    ];
    ids.forEach((id) => {
      const el = $(`#${id}`);
      if (!el) return;
      el.setAttribute("href", waLink(template(CONFIG.whatsapp.defaultMsg, getLeadData())));
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    });
  }

  function updateUrgentLinks() {
    const ids = ["urgentHero", "urgentAside"];
    ids.forEach((id) => {
      const el = $(`#${id}`);
      if (!el) return;
      const data = getLeadData();
      el.setAttribute(
        "href",
        waLink(
          template(CONFIG.whatsapp.urgentMsg, {
            ...data,
            mensagem: data.mensagem || "Sem detalhes no momento.",
          })
        )
      );
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    });
  }

  function animateStats() {
    const nodes = $$(".stat-number");
    if (!nodes.length) return;

    const prefersReduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const mobileMq = window.matchMedia && window.matchMedia("(max-width: 859px)");
    const observerOptions = mobileMq && mobileMq.matches
      ? { threshold: 0.2, rootMargin: "0px 0px 12% 0px" }
      : { threshold: 0.35, rootMargin: "0px" };

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = Number(el.getAttribute("data-count") || "0");
          if (!target || el.dataset.animated === "1") {
            obs.unobserve(el);
            return;
          }
          el.dataset.animated = "1";

          const hasPlus = (el.textContent || "").trim().endsWith("+");
          const duration = mobileMq && mobileMq.matches ? 3400 : 2800;
          const start = performance.now();
          let lastShown = -1;

          function easeOutQuart(t) {
            return 1 - Math.pow(1 - t, 4);
          }

          function frame(now) {
            const progress = Math.min(1, (now - start) / duration);
            const eased = easeOutQuart(progress);
            const value = Math.round(target * eased);
            if (value !== lastShown) {
              lastShown = value;
              el.textContent = hasPlus ? `${value}+` : String(value);
            }
            if (progress < 1) requestAnimationFrame(frame);
            else {
              const finalVal = target;
              if (lastShown !== finalVal) {
                el.textContent = hasPlus ? `${finalVal}+` : String(finalVal);
              }
            }
          }

          requestAnimationFrame(frame);
          obs.unobserve(el);
        });
      },
      observerOptions
    );

    nodes.forEach((n) => observer.observe(n));
  }

  function init() {
    // Permite configurar IDs via `window.LP_CONFIG.tracking` (index.html já cria `window.LP_CONFIG`).
    // Se estiverem vazios, mantém o placeholder do CONFIG.
    const lpTracking = window.LP_CONFIG && window.LP_CONFIG.tracking ? window.LP_CONFIG.tracking : {};
    const pickId = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");

    const trackingIds = {
      ga4MeasurementId: pickId(lpTracking.ga4MeasurementId) || CONFIG.tracking.ga4MeasurementId,
      metaPixelId: pickId(lpTracking.metaPixelId) || CONFIG.tracking.metaPixelId,
      clarityProjectId: pickId(lpTracking.clarityProjectId) || CONFIG.tracking.clarityProjectId,
    };

    loadGA4(trackingIds.ga4MeasurementId);
    loadMetaPixel(trackingIds.metaPixelId);
    loadClarity(trackingIds.clarityProjectId);

    setYear();
    // A/B desativado: mantém sempre os textos do HTML.
    // applyABVariant();
    bindAutoTrackClicks();
    bindForm();
    updateWhatsAppLinks();
    updateUrgentLinks();
    hardenExternalLinks();
    animateStats();

    track("page_view", { path: window.location.pathname });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

