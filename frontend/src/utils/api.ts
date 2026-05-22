import { useAuthStore } from '../store/useAuthStore';

const BASE_URL = '/api';

async function request(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('dsm_qms_token');
  
  const headers: Record<string, string> = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers as Record<string, string>,
  };

  if (!options.headers || !('Content-Type' in options.headers)) {
    headers['Content-Type'] = 'application/json';
  } else if (headers['Content-Type'] === 'multipart/form-data') {
    delete headers['Content-Type']; // Let browser set it with boundary
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (response.status === 401 && !endpoint.includes('/auth/')) {
    // Optional: handle auto-logout on expired token
    useAuthStore.getState().logout();
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: (endpoint: string) => request(endpoint, { method: 'GET' }),
  post: (endpoint: string, body: unknown) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, { 
      method: 'POST', 
      body: isFormData ? body : JSON.stringify(body),
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
  },
  postBlob: (endpoint: string, body: unknown): Promise<Blob> => {
    const token = localStorage.getItem('dsm_qms_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
    return fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }).then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.blob();
    });
  },
  put: (endpoint: string, body: unknown) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, { 
      method: 'PUT', 
      body: isFormData ? body : JSON.stringify(body),
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
  },
  delete: (endpoint: string) => request(endpoint, { method: 'DELETE' }),
};

const LOCAL_DICT: Record<string, string> = {
  'дребезг': 'vibration/rattle',
  'засвет': 'light bleed',
  'битый пиксель': 'dead pixel',
  'мусор': 'dust/debris',
  'скол': 'chip',
  'царапина': 'scratch',
  'внешний вид': 'appearance',
  'электробезопасность': 'electrical safety',
  'первое включение': 'first power on',
  'линза/кнопки пду': 'lens/remote buttons',
  'антенна/модуль ci': 'antenna/ci module',
  'звук': 'audio/sound',
  'usb/mkv плеер/матрица': 'usb/mkv player/panel',
  'сброс настроек/вес': 'reset/weight',
  'аксессуары/наклейки': 'accessories/stickers',
  'упаковка': 'packaging',
  'малозначительный': 'minor',
  'значительный': 'major',
  'критический': 'critical',
  'термопрогон': 'thermal run'
};

export const translateToEnglish = async (text: string): Promise<string> => {
  if (!text || !text.trim()) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  
  // 1. Check custom DB dictionary first (highest priority)
  try {
    const { useDataStore } = await import('../store/useDataStore');
    const settings = useDataStore.getState().settings;
    if (settings && settings.custom_translations) {
      const customDict = JSON.parse(settings.custom_translations);
      if (customDict[lower]) {
        return customDict[lower];
      }
    }
  } catch (e) {
    console.error('Failed to parse custom translations from settings', e);
  }

  // 2. Check hardcoded fallback dictionary
  if (LOCAL_DICT[lower]) {
    return LOCAL_DICT[lower];
  }

  // 3. Fallback to online translation API
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=ru|en`);
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated && translated.toLowerCase() !== trimmed.toLowerCase()) {
      return translated;
    }
    return '';
  } catch (e) {
    console.error('Translation failed', e);
    return '';
  }
};
