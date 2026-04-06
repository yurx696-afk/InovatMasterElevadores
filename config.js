// Public (non-secret) config for the landing page.
// You can safely edit this file and deploy.
window.LP_CONFIG = window.LP_CONFIG || {};

// Tracking IDs (optional)
window.LP_CONFIG.tracking = window.LP_CONFIG.tracking || {
  ga4MeasurementId: "",
  metaPixelId: "",
  clarityProjectId: "",
};

// reCAPTCHA v3 site key (public). Secret key must be configured on the backend via env var.
window.LP_CONFIG.recaptchaSiteKey = window.LP_CONFIG.recaptchaSiteKey || "";

// WhatsApp phone (E.164 digits only) and domain (used by backend allowlist, optional).
window.LP_CONFIG.whatsappPhoneE164 = window.LP_CONFIG.whatsappPhoneE164 || "5561995755944";
window.LP_CONFIG.allowedDomain = window.LP_CONFIG.allowedDomain || "inovatelevadoresmaster.com.br";

