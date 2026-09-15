/**
 * i18n.js — string-table i18n (Section 4: multi-language UI, EN+HI).
 *
 * Applies to static UI chrome (nav, headings, buttons, notices, intake
 * field labels) via data-i18n / data-i18n-placeholder attributes.
 * Patient-entered data, PDF report body text, and dynamically-rendered
 * case content are NOT translated in this pass -- flagged as a known
 * gap, not silently incomplete. Hindi strings are a reasonable-effort
 * translation, not reviewed by a certified medical translator; treat
 * strings/hi.json as a draft a clinical reviewer should sign off on
 * before real deployment.
 */

const LANG_KEY = 'dr_pwa_lang';
const SUPPORTED_LANGS = ['en', 'hi'];
let i18nDict = {};
let currentLang = 'en';

async function loadLangDict(lang) {
  const res = await fetch(`strings/${lang}.json`);
  return res.json();
}

function t(key) {
  return i18nDict[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.documentElement.lang = currentLang;
}

async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'en';
  currentLang = lang;
  i18nDict = await loadLangDict(lang);
  localStorage.setItem(LANG_KEY, lang);
  applyTranslations();
}

async function initI18n() {
  const saved = localStorage.getItem(LANG_KEY) || 'en';
  await setLanguage(saved);
}

if (typeof window !== 'undefined') {
  window.t = t;
  window.setLanguage = setLanguage;
  window.initI18n = initI18n;
  window.applyTranslations = applyTranslations;
  window.getCurrentLang = () => currentLang;
}
