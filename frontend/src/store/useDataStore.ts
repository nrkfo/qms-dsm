import { create } from 'zustand';
import { api } from '../utils/api';

export interface Lot {
  id: number;
  name: string;
  tv_model_id?: number;
  status: string;
  created_at?: string;
}

interface DataState {
  lots: Lot[];
  activeLot: Lot | null;
  fetchLots: () => Promise<void>;
  setActiveLot: (lot: Lot | null) => void;
  createLot: (name: string, tv_model_id?: number) => Promise<void>;
  editLot: (id: number, name: string, tv_model_id?: number, status?: string) => Promise<void>;
  deleteLot: (id: number) => Promise<void>;
  lastLabelCheckTime: number;
  setLastLabelCheckTime: (time: number) => void;
  lastLabelCheckTimestamp: number;
  setLastLabelCheckTimestamp: (time: number) => void;
  isLabelAlarmActive: () => boolean;
  fetchLastLabelCheckTime: () => Promise<void>;

  saveLog: (moduleId: string, data: any, status: string) => Promise<void>;
  fetchLogs: (moduleId: string) => Promise<any[]>;
  fetchAllLogs: (moduleId: string) => Promise<any[]>;
  deleteLog: (moduleId: string, id: number) => Promise<void>;
  updateLog: (moduleId: string, id: number, data: any, status: string) => Promise<void>;
  // Suppliers & Articles
  suppliers: any[];
  fetchSuppliers: () => Promise<void>;
  addSupplier: (name: string) => Promise<any>;
  updateSupplier: (id: number, name: string, is_active: number) => Promise<void>;
  deleteSupplier: (id: number) => Promise<void>;
  fetchArticles: (supplierId?: number) => Promise<any[]>;
  addArticle: (supplierId: number, name: string, extra?: any) => Promise<any>;
  importArticles: (supplierId: number, articles: any[]) => Promise<void>;
  updateArticle: (id: number, data: any) => Promise<void>;
  deleteArticle: (id: number) => Promise<void>;
  // Global Settings
  settings: any;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: any) => Promise<void>;
  auditLogs: any[];
  fetchAuditLogs: () => Promise<void>;
  downloadBackup: () => void;
  // TV Models & Tests
  tvModels: any[];
  tvTests: any[];
  fetchTvModels: () => Promise<void>;
  addTvModel: (modelData: any) => Promise<void>;
  updateTvModel: (id: number, modelData: any) => Promise<void>;
  deleteTvModel: (id: number) => Promise<void>;
  fetchTvTests: () => Promise<void>;
  addTvTest: (name: string, description: string) => Promise<void>;
  updateTvTest: (id: number, name: string, description: string) => Promise<void>;
  deleteTvTest: (id: number) => Promise<void>;
  // Components Master
  componentsMaster: any[];
  fetchComponentsMaster: (modelId?: number) => Promise<void>;
  addComponentMaster: (article: string, name: string, modelId: number) => Promise<void>;
  importComponentsMaster: (modelId: number, components: any[]) => Promise<void>;
  deleteComponentMaster: (id: number) => Promise<void>;
  // MES Integration
  mesFact: number | null;
  mesLoading: boolean;
  fetchMesFact: (dateFilter?: string) => Promise<void>;
  saveKpiFacts: (date: string, mesFact: number, aqlPlan: number) => Promise<void>;
  
  // Global UI
  toast: { message: string, type: 'success' | 'error' | 'warning', id: number } | null;
  notifExiting: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
  hideToast: () => void;
  
  confirmation: { message: string, type?: 'danger' | 'info', onConfirm: () => void, onCancel?: () => void } | null;
  showConfirm: (message: string, onConfirm: () => void, onCancel?: () => void, type?: 'danger' | 'info') => void;
  hideConfirm: () => void;
}

export const LOT_INDEPENDENT_MODULES = ['iqc_aql', 'iqc_eps', 'iqc_covers'];

export const useDataStore = create<DataState>((set, get) => {
  const today8AM = new Date();
  today8AM.setHours(8, 0, 0, 0);

  // Load states from localStorage safely
  const savedLot = localStorage.getItem('activeLot_dsm');
  const savedLabelTime = localStorage.getItem('lastLabelCheckTimestamp_dsm') || localStorage.getItem('lastLabelCheckTime_dsm');
  
  let initialLot = null;
  try { if (savedLot) initialLot = JSON.parse(savedLot); } catch { /* ignore */ }
  
  let initialLabelTime = today8AM.getTime();
  if (savedLabelTime) initialLabelTime = Number(savedLabelTime);

  return {
    lots: [],
    activeLot: initialLot,
    lastLabelCheckTime: initialLabelTime,
    lastLabelCheckTimestamp: initialLabelTime,
    componentsMaster: [],
    mesFact: null,
    mesLoading: false,
    setLastLabelCheckTime: (time) => {
      set({ lastLabelCheckTime: time, lastLabelCheckTimestamp: time });
      localStorage.setItem('lastLabelCheckTime_dsm', time.toString());
      localStorage.setItem('lastLabelCheckTimestamp_dsm', time.toString());
    },
    setLastLabelCheckTimestamp: (time) => {
      set({ lastLabelCheckTime: time, lastLabelCheckTimestamp: time });
      localStorage.setItem('lastLabelCheckTime_dsm', time.toString());
      localStorage.setItem('lastLabelCheckTimestamp_dsm', time.toString());
    },
    isLabelAlarmActive: () => {
      const lastCheck = get().lastLabelCheckTimestamp;
      const limit = Number(get().settings?.label_timer_limit) || 3600000;
      return (Date.now() - lastCheck) >= limit;
    },
    fetchLastLabelCheckTime: async () => {
      try {
        const res = await api.get('/logs/oqa_labels/last-success');
        if (res && res.timestamp) {
          const time = new Date(res.timestamp).getTime();
          set({ lastLabelCheckTime: time, lastLabelCheckTimestamp: time });
          localStorage.setItem('lastLabelCheckTime_dsm', time.toString());
          localStorage.setItem('lastLabelCheckTimestamp_dsm', time.toString());
        }
      } catch (e) {
        console.error('Failed to fetch last label check time', e);
      }
    },
    
    fetchLots: async () => {
      try {
        const data = await api.get('/lots');
        set({ lots: data });
        
        // Auto-select first lot if none active OR if saved lot is not in the list anymore
        const currentActive = get().activeLot;
        if (data.length > 0) {
           const exists = data.find((l: Lot) => l.id === currentActive?.id);
           if (!currentActive || !exists) {
              set({ activeLot: data[0] });
              localStorage.setItem('activeLot_dsm', JSON.stringify(data[0]));
           }
        }
      } catch (e) {
        console.error('Failed to fetch lots', e);
      }
    },

    setActiveLot: (lot) => {
      set({ activeLot: lot });
      if (lot) localStorage.setItem('activeLot_dsm', JSON.stringify(lot));
      else localStorage.removeItem('activeLot_dsm');
    },

    createLot: async (name, tv_model_id) => {
      try {
        const newLot = await api.post('/lots', { name, tv_model_id });
        set((state) => ({ lots: [newLot, ...state.lots] }));
      } catch (e) {
        console.error('Failed to create lot', e);
      }
    },

    editLot: async (id, name, tv_model_id, status) => {
      try {
        await api.put(`/lots/${id}`, { name, tv_model_id, status });
        set((state) => ({
          lots: state.lots.map(l => l.id === id ? { ...l, name, tv_model_id, status: status || l.status } : l),
          activeLot: state.activeLot?.id === id ? { ...state.activeLot, name, tv_model_id, status: status || state.activeLot.status } : state.activeLot
        }));
      } catch (e) {
        console.error('Failed to edit lot', e);
      }
    },

    deleteLot: async (id) => {
      try {
        await api.delete(`/lots/${id}`);
        set((state) => ({
          lots: state.lots.filter(l => l.id !== id),
          activeLot: state.activeLot?.id === id ? null : state.activeLot
        }));
      } catch (e) {
        console.error('Failed to delete lot', e);
      }
    },

    saveLog: async (moduleId, data, status) => {
      const isIndependent = LOT_INDEPENDENT_MODULES.includes(moduleId);
      const lotId = isIndependent ? null : (get().activeLot ? get().activeLot!.id : 1);
      const today = new Date().toISOString().split('T')[0];
      try {
        await api.post(`/logs/${moduleId}`, {
          lot_id: lotId,
          date: today,
          data,
          status
        });
        if (moduleId === 'oqa_labels' && status === 'OK') {
          get().setLastLabelCheckTimestamp(Date.now());
        }
      } catch (e) {
        console.error(`Failed to save ${moduleId} log`, e);
        throw e;
      }
    },
    updateLog: async (moduleId, id, data, status) => {
      try {
        if (data instanceof FormData) {
          if (!data.has('status')) {
            data.append('status', status);
          }
          await api.put(`/logs/${moduleId}/${id}`, data);
        } else {
          const updatedData = {
            ...data,
            updates: (data.updates || 0) + 1,
            is_edited: true
          };
          await api.put(`/logs/${moduleId}/${id}`, { data: updatedData, status });
        }
      } catch (e) {
        console.error(`Failed to update ${moduleId} log`, e);
        throw e;
      }
    },
    deleteLog: async (moduleId, id) => {
      try {
        await api.delete(`/logs/${moduleId}/${id}`);
      } catch (e) {
        console.error(`Failed to delete ${moduleId} log`, e);
        throw e;
      }
    },

    fetchLogs: async (moduleId) => {
      const isIndependent = LOT_INDEPENDENT_MODULES.includes(moduleId);
      const lotId = isIndependent ? null : get().activeLot?.id;
      try {
        return await api.get(`/logs/${moduleId}?lot_id=${lotId || ''}&t=${Date.now()}`);
      } catch (e) {
        console.error(`Failed to fetch ${moduleId} logs`, e);
        return [];
      }
    },
    fetchAllLogs: async (moduleId) => {
      try {
        return await api.get(`/logs/${moduleId}?full=true&t=${Date.now()}`);
      } catch (e) {
        console.error(`Failed to fetch all ${moduleId} logs`, e);
        return [];
      }
    },
    // Suppliers & Articles Impl
    suppliers: [],
    fetchSuppliers: async () => {
      try {
        const data = await api.get('/suppliers');
        set({ suppliers: data });
      } catch (e) { console.error(e); }
    },
    addSupplier: async (name) => {
      const res = await api.post('/suppliers', { name });
      set(s => ({ suppliers: [...s.suppliers, res] }));
      return res;
    },
    updateSupplier: async (id, name, is_active) => {
      await api.put(`/suppliers/${id}`, { name, is_active });
      set(s => ({ suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, name, is_active } : sup) }));
    },
    deleteSupplier: async (id) => {
      await api.delete(`/suppliers/${id}`);
      set(s => ({ suppliers: s.suppliers.filter(sup => sup.id !== id) }));
    },
    fetchArticles: async (supplierId) => {
      return await api.get(`/articles?supplier_id=${supplierId || ''}`);
    },
    addArticle: async (supplierId, name, extra = {}) => {
      return await api.post('/articles', { supplier_id: supplierId, name, ...extra });
    },
    importArticles: async (supplierId, articles) => {
      await api.post('/articles/bulk', { supplier_id: supplierId, articles });
    },
    updateArticle: async (id, data) => {
      await api.put(`/articles/${id}`, data);
    },
    deleteArticle: async (id) => {
      await api.delete(`/articles/${id}`);
    },
    // Global Settings Impl
    settings: {},
    fetchSettings: async () => {
      const data = await api.get('/settings');
      set({ settings: data });
      await get().fetchLastLabelCheckTime();
    },
    updateSettings: async (newSettings) => {
      await api.put('/settings', newSettings);
      set({ settings: { ...get().settings, ...newSettings } });
    },
    auditLogs: [],
    fetchAuditLogs: async () => {
      const data = await api.get('/audit-logs');
      set({ auditLogs: data });
    },
    downloadBackup: () => {
      const token = localStorage.getItem('dsm_qms_token');
      window.open(`/api/backup/download?token=${token}`, '_blank');
    },
    // TV Models & Tests Impl
    tvModels: [],
    tvTests: [],
    fetchTvModels: async () => {
      try {
        const data = await api.get('/tv/models');
        set({ tvModels: data });
      } catch(e) { console.error(e); }
    },
    addTvModel: async (modelData) => {
      const res = await api.post('/tv/models', modelData);
      set(s => ({ tvModels: [...s.tvModels, res] }));
    },
    updateTvModel: async (id, modelData) => {
      await api.put(`/tv/models/${id}`, modelData);
      set(s => ({ tvModels: s.tvModels.map(m => m.id === id ? { ...m, ...modelData } : m) }));
    },
    deleteTvModel: async (id) => {
      await api.delete(`/tv/models/${id}`);
      set(s => ({ tvModels: s.tvModels.filter(m => m.id !== id) }));
    },
    fetchTvTests: async () => {
      try {
        const data = await api.get('/tv/tests');
        set({ tvTests: data });
      } catch(e) { console.error(e); }
    },
    addTvTest: async (name, description) => {
      const res = await api.post('/tv/tests', { name, description });
      set(s => ({ tvTests: [...s.tvTests, res] }));
    },
    updateTvTest: async (id, name, description) => {
      await api.put(`/tv/tests/${id}`, { name, description });
      set(s => ({ tvTests: s.tvTests.map(t => t.id === id ? { ...t, name, description } : t) }));
    },
    deleteTvTest: async (id) => {
      await api.delete(`/tv/tests/${id}`);
      get().fetchTvTests();
    },
    fetchComponentsMaster: async (modelId) => {
      try {
        const url = modelId ? `/components-master?tv_model_id=${modelId}` : '/components-master';
        const data = await api.get(url);
        set({ componentsMaster: data });
      } catch (e) { console.error(e); }
    },
    addComponentMaster: async (article, name, modelId) => {
      await api.post('/components-master', { article, name, tv_model_id: modelId });
      get().fetchComponentsMaster(modelId);
    },
    importComponentsMaster: async (modelId, components) => {
      await api.post('/components-master/bulk', { tv_model_id: modelId, components });
      get().fetchComponentsMaster(modelId);
    },
    deleteComponentMaster: async (id) => {
      // We need to know the current model to refresh properly, or just fetch all
      await api.delete(`/components-master/${id}`);
      set(s => ({ componentsMaster: s.componentsMaster.filter(c => c.id !== id) }));
    },
    fetchMesFact: async (dateFilter) => {
      const activeLot = get().activeLot;
      if (activeLot?.status === 'closed') {
        set({ mesFact: null, mesLoading: false });
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const targetDate = dateFilter || today;
      
      set({ mesLoading: true });
      
      // If it's a past date, fetch strictly from the database
      if (targetDate !== today) {
        try {
          const dbFact = await api.get(`/kpi/facts?date=${targetDate}`);
          if (dbFact && dbFact.mes_fact !== null && dbFact.mes_fact !== undefined) {
            set({ mesFact: dbFact.mes_fact });
          } else {
            set({ mesFact: 0 });
          }
        } catch (e) {
          console.error('Failed to fetch past KPI facts', e);
          set({ mesFact: 0 });
        } finally {
          set({ mesLoading: false });
        }
        return;
      }

      // If it's today, try live MES proxy, but also check database
      try {
        const url = get().settings?.mes_dashboard_url || 'http://192.168.210.210:8000/tablo/lines/1/dashboard/';
        const res = await api.post('/mes/proxy', { url });
        let factVal = 0;
        
        if (res && res.html) {
          const html = res.html;
          
          // The dashboard uses a JSON.parse('...') pattern in a script tag
          const jsonMatch = html.match(/initialDashboardData\s*=\s*JSON\.parse\(\s*'(.*?)'\s*\)/s);
          
          if (jsonMatch && jsonMatch[1]) {
            try {
              const unescaped = jsonMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (match: string, grp: string) => String.fromCharCode(parseInt(grp, 16)));
              const data = JSON.parse(unescaped);
              const fact = data.metrics?.curr_device_count;
              if (typeof fact === 'number') {
                factVal = fact;
              }
            } catch (e) {
              console.error('Failed to parse MES JSON', e);
            }
          }
          
          if (factVal === 0) {
            const labelIndex = html.indexOf('ФАКТ (ШТ)');
            if (labelIndex !== -1) {
              const contentBefore = html.substring(0, labelIndex);
              const matches = [...contentBefore.matchAll(/>(\d{1,5})</g)];
              if (matches.length > 0) {
                const val = parseInt(matches[matches.length - 1][1]);
                if (val > 0) factVal = val;
              }
            }
          }
          
          if (factVal === 0) {
            const fallbackMatch = html.match(/(\d{1,5})\s*ФАКТ\s*\(ШТ\)/i) || 
                                  html.match(/ФАКТ\s*\(ШТ\)[\s\S]*?>(\d{1,5})</i);
            if (fallbackMatch && fallbackMatch[1]) {
              factVal = parseInt(fallbackMatch[1]);
            }
          }
        }

        if (factVal > 0) {
          set({ mesFact: factVal });
          
          // Save it automatically to the database for today so it's persisted!
          let planVal = 0;
          if (get().settings.oqa_shift_config) {
            try {
              const config = JSON.parse(get().settings.oqa_shift_config);
              const ratio = (config.ratio_checked || 13) / (config.ratio_produced || 280);
              planVal = Math.round(factVal * ratio);
            } catch { /* ignored */ }
          }
          
          await api.post('/kpi/facts', { date: today, mes_fact: factVal, aql_plan: planVal, lot_id: get().activeLot?.id });
        } else {
          // If live fetch fails or is 0, fallback to database saved today value
          const dbFact = await api.get(`/kpi/facts?date=${today}`);
          if (dbFact && dbFact.mes_fact !== null && dbFact.mes_fact !== undefined) {
            set({ mesFact: dbFact.mes_fact });
          } else {
            set({ mesFact: 0 });
          }
        }
      } catch (e) {
        console.error('Failed to fetch live MES Fact, loading from DB fallback', e);
        // DB fallback
        try {
          const dbFact = await api.get(`/kpi/facts?date=${today}`);
          if (dbFact && dbFact.mes_fact !== null && dbFact.mes_fact !== undefined) {
            set({ mesFact: dbFact.mes_fact });
          } else {
            set({ mesFact: 0 });
          }
        } catch {
          set({ mesFact: 0 });
        }
      } finally {
        set({ mesLoading: false });
      }
    },
    saveKpiFacts: async (date, mesFact, aqlPlan) => {
      try {
        await api.post('/kpi/facts', { date, mes_fact: mesFact, aql_plan: aqlPlan, lot_id: get().activeLot?.id });
        set({ mesFact: mesFact });
        get().showToast('KPI показатели успешно сохранены в базе', 'success');
      } catch (e) {
        console.error('Failed to save KPI facts manually', e);
        get().showToast('Ошибка при сохранении KPI показателей', 'error');
      }
    },

    // Global UI Impl
    toast: null,
    notifExiting: false,
    showToast: (message, type = 'success') => {
      const id = Date.now();
      set({ toast: { message, type, id }, notifExiting: false });
      setTimeout(() => {
        set({ notifExiting: true });
        setTimeout(() => {
          if (get().toast?.id === id) set({ toast: null, notifExiting: false });
        }, 300);
      }, 3000);
    },
    hideToast: () => set({ toast: null, notifExiting: false }),

    confirmation: null,
    showConfirm: (message, onConfirm, onCancel, type = 'info') => {
      set({ confirmation: { message, onConfirm, onCancel, type } });
    },
    hideConfirm: () => set({ confirmation: null })
  };
});
