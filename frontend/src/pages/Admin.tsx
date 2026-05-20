import { useEffect, useState } from 'react';
import { useDataStore } from '../store/useDataStore';
import { api } from '../utils/api';
import * as XLSX from 'xlsx';
import { ModalPortal } from '../components/ui/ModalPortal';

const MODULES = [
  { id: 'dashboard', label: 'Дашборд (Общая статистика)' },
  { id: 'oqa_tv', label: 'Выборочный контроль ГП' },
  { id: 'oqa_pallets', label: 'Приемка паллет ГП' },
  { id: 'oqa_labels', label: 'Проверка этикетки' },
  { id: 'oqa_patrol', label: 'Журнал обхода' },
  { id: 'iqc_aql', label: 'Журнал входного контроля AQL' },
  { id: 'iqc_panels', label: 'Проверка панелей' },
  { id: 'iqc_eps', label: 'Замеры пеновкладышей' },
  { id: 'iqc_covers', label: 'Замеры крышек' },
  { id: 'iqc_components', label: 'Проверка комплектующих' },
  { id: 'iqc_aql_calculator', label: 'Калькулятор AQL' },
  { id: 'view_all_lots', label: 'Доступ ко всем лотам (вкл. архивные)' },
  { id: 'admin_panel', label: 'Админ-панель' }
];

const Admin = () => {
  const { 
    lots, fetchLots, createLot, deleteLot, editLot,
    suppliers, fetchSuppliers, addSupplier, deleteSupplier, updateSupplier,
    fetchArticles, addArticle, deleteArticle, updateArticle, importArticles,
    settings, fetchSettings, updateSettings,
    downloadBackup,
    tvModels, fetchTvModels, tvTests, fetchTvTests, addTvTest, deleteTvTest,
    componentsMaster, fetchComponentsMaster, addComponentMaster, deleteComponentMaster,
    showToast, showConfirm
  } = useDataStore();

  const [activeTab, setActiveTab] = useState('settings');
  const [localSettings, setLocalSettings] = useState<any>({});

  useEffect(() => {
    fetchLots();
    fetchSuppliers();
    fetchSettings();
    if (activeTab === 'lots' || activeTab === 'tv_settings' || activeTab === 'labels_settings' || activeTab === 'pallets_settings') {
      fetchTvModels();
    }
    if (activeTab === 'tv_settings') {
      fetchTvTests();
    }
    if (activeTab === 'components_settings') {
      fetchComponentsMaster();
    }
  }, [activeTab]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSaveSettings = async () => {
    await updateSettings(localSettings);
    showToast('Настройки сохранены');
  };

  const TabButton = ({ id, label, icon }: { id: string, label: string, icon: string }) => (
    <button 
      onClick={() => setActiveTab(id)} 
      style={{ 
        padding: '8px 16px', 
        background: activeTab === id ? 'rgba(var(--c-accent-rgb), 0.15)' : 'transparent', 
        color: activeTab === id ? 'var(--c-accent)' : 'var(--c-text-muted)', 
        border: 'none', 
        borderBottom: activeTab === id ? '2px solid var(--c-accent)' : '2px solid transparent',
        borderRadius: '0', 
        cursor: 'pointer', 
        fontWeight: activeTab === id ? 'bold' : 'normal', 
        transition: 'all 0.2s', 
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px'
      }}
    > 
      <span style={{ fontSize: '16px' }}>{icon}</span>
      {label} 
    </button>
  );

  return (
    <div className="animate-fade-in responsive-flex-container" style={{ 
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--c-bg-base)',
      overflow: 'hidden'
    }}>
      <div className="glass-panel" style={{ padding: '0 30px', borderBottom: '1px solid var(--c-border)', borderRadius: 0, display: 'flex', gap: '20px', alignItems: 'center', overflowX: 'auto', minHeight: '60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '20px', borderRight: '1px solid var(--c-border)', paddingRight: '20px', height: '30px' }}>
          <span style={{ fontSize: '20px' }}>⚙️</span>
          <h2 style={{ margin: 0, fontSize: '1.1rem', whiteSpace: 'nowrap', color: 'var(--c-text-primary)' }}>Admin</h2>
        </div>

        <div style={{ display: 'flex', gap: '5px', height: '100%' }}>
          <div style={{ display: 'flex', gap: '2px', paddingRight: '15px', borderRight: '1px solid var(--c-border-muted)' }}>
            <TabButton id="settings" label="Система" icon="🛠️" />
            <TabButton id="master" label="Справочники" icon="📚" />
            <TabButton id="translations" label="Переводчик" icon="🌍" />
            <TabButton id="breaks" label="Перерывы" icon="⏱️" />
          </div>

          <div style={{ display: 'flex', gap: '2px', padding: '0 15px', borderRight: '1px solid var(--c-border-muted)' }}>
            <TabButton id="tv_settings" label="TV" icon="📺" />
            <TabButton id="labels_settings" label="Этикетки" icon="🏷️" />
            <TabButton id="pallets_settings" label="Паллеты" icon="📦" />
            <TabButton id="patrol_settings" label="Обход" icon="🚶" />
          </div>

          <div style={{ display: 'flex', gap: '2px', paddingLeft: '15px' }}>
            <TabButton id="panels_settings" label="Панели" icon="📱" />
            <TabButton id="components_settings" label="Комплектующие" icon="🧩" />
          </div>
        </div>

        <div style={{ flex: 1 }} />
        
        <button onClick={downloadBackup} className="glass" style={{ padding: '6px 12px', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}> 
          <span>💾</span> Бэкап
        </button>
      </div>

      <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>

        {activeTab === 'master' && <MasterDataManagement />}
        {activeTab === 'tv_settings' && <TvSettingsManagement />}
        {activeTab === 'labels_settings' && <LabelSettingsManagement />}
        {activeTab === 'pallets_settings' && <PalletSettingsManagement />}
        {activeTab === 'patrol_settings' && <PatrolSettingsManagement />}
        {activeTab === 'panels_settings' && <PanelsSettingsManagement />}
        {activeTab === 'components_settings' && <ComponentsSettingsManagement />}
        {activeTab === 'translations' && <TranslationsManagement />}
        {activeTab === 'breaks' && <BreaksManagement />}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', alignItems: 'start' }}>
               <UserManagement />
               <LotManagement />
            </div>

            <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px' }}>
            <h3 style={{ marginBottom: '25px' }}>Системные настройки и уведомления</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div><label style={{display:'block', fontSize:'12px', marginBottom:'8px'}}>Лимит проверки этикеток (мс)</label><input className="glass" type="number" value={localSettings.label_timer_limit || ''} onChange={e=>setLocalSettings({...localSettings, label_timer_limit: e.target.value})} style={{ width: '100%', padding: '12px' }} /></div>
                <div><label style={{display:'block', fontSize:'12px', marginBottom:'8px'}}>Хранение данных (дней)</label><input className="glass" type="number" value={localSettings.data_retention_days || ''} onChange={e=>setLocalSettings({...localSettings, data_retention_days: e.target.value})} style={{ width: '100%', padding: '12px' }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div><label style={{display:'block', fontSize:'12px', marginBottom:'8px'}}>Политика AQL</label>
                  <select className="glass" value={localSettings.aql_mode || 'Normal'} onChange={e=>setLocalSettings({...localSettings, aql_mode: e.target.value})} style={{ width: '100%', padding: '12px' }}>
                    <option value="Normal">Normal (Нормальный)</option>
                    <option value="Tightened">Tightened (Усиленный)</option>
                    <option value="Reduced">Reduced (Ослабленный)</option>
                  </select>
                </div>
                <div><label style={{display:'block', fontSize:'12px', marginBottom:'8px'}}>Время бэкапа (ЧЧ:ММ)</label><input className="glass" type="text" placeholder="03:00" value={localSettings.backup_schedule || ''} onChange={e=>setLocalSettings({...localSettings, backup_schedule: e.target.value})} style={{ width: '100%', padding: '12px' }} /></div>
              </div>



              <h4 style={{ margin: '10px 0 0 0', color: 'var(--c-accent)' }}>Внешний доступ (API / MES)</h4>
              <div style={{ background: 'var(--c-bg-surface-elevated)', padding: '15px', borderRadius: '6px', border: '1px solid var(--c-border)' }}>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--c-text-muted)' }}>Статический API ключ (для MES)</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input className="glass" value={localSettings.api_key || ''} onChange={e => setLocalSettings({...localSettings, api_key: e.target.value})} placeholder="Введите статический ключ..." style={{ flex: 1, padding: '12px', fontFamily: 'monospace', fontSize: '14px', border: '1px solid var(--c-accent)' }} />
                    <button type="button" onClick={() => { if (localSettings.api_key) { navigator.clipboard.writeText(localSettings.api_key); showToast('Ключ скопирован!'); } }} style={{ padding: '0 20px', background: 'var(--c-bg-surface-elevated)', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>КОПИРОВАТЬ</button>
                  </div>
                </div>
              </div>
              
              <h4 style={{ margin: '15px 0 0 0', color: 'var(--c-accent)' }}>Резервное копирование и экспорт</h4>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button 
                  type="button" 
                  onClick={() => {
                    const token = localStorage.getItem('dsm_qms_token');
                    window.open(`/api/admin/backup-zip?token=${token}`, '_blank');
                    showToast('Запрос на бэкап отправлен!');
                  }} 
                  style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface-elevated)', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  📦 СКАЧАТЬ БЭКАП (.ZIP)
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    const token = localStorage.getItem('dsm_qms_token');
                    window.open(`/api/backup/download?token=${token}`, '_blank');
                    showToast('Скачивание базы данных...');
                  }} 
                  style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface-elevated)', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  🗄️ СКАЧАТЬ БД (.SQLITE)
                </button>
              </div>
              
              <button onClick={handleSaveSettings} style={{ padding: '15px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}> Сохранить </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

const UserManagement = () => {
  const { showConfirm } = useDataStore();
  const [users, setUsers] = useState<any[]>([]);
  const [newUname, setNewUname] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('Inspector');
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [draftPerms, setDraftPerms] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editUname, setEditUname] = useState('');
  const [editPass, setEditPass] = useState('');
  const [editRole, setEditRole] = useState('Inspector');

  useEffect(() => { fetchUsers(); }, []);
  const fetchUsers = async () => { const data = await api.get('/users'); setUsers(data); };
  const handleCreateUser = async (e: React.FormEvent) => { e.preventDefault(); const defaultPerms = newRole === 'Admin' ? MODULES.map(m => m.id) : []; await api.post('/users', { username: newUname, password: newPass, role: newRole, permissions: defaultPerms }); fetchUsers(); setNewUname(''); setNewPass(''); };
  const handleUpdateUser = async (e: React.FormEvent, userId: number) => { e.preventDefault(); await api.put(`/users/${userId}`, { username: editUname, password: editPass, role: editRole }); fetchUsers(); setEditingUser(null); };
  const savePermissions = async (userId: number) => { await api.put(`/users/${userId}/permissions`, { permissions: draftPerms }); fetchUsers(); setExpandedUser(null); };
  const handleDeleteUser = async (userId: number) => { 
    showConfirm('Вы уверены, что хотите удалить пользователя?', async () => { 
      await api.delete(`/users/${userId}`); 
      fetchUsers(); 
    }, undefined, 'danger'); 
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      <div className="glass-panel" style={{ padding: '25px', marginBottom: '25px' }}>
        <h3>Новый пользователь</h3>
        <form onSubmit={handleCreateUser} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
          <input className="glass" placeholder="Логин" value={newUname} onChange={e=>setNewUname(e.target.value)} style={{flex:'1 1 200px', padding:'10px'}} />
          <input className="glass" type="password" placeholder="Пароль" value={newPass} onChange={e=>setNewPass(e.target.value)} style={{flex:'1 1 200px', padding:'10px'}} />
          <select className="glass" value={newRole} onChange={e=>setNewRole(e.target.value)} style={{flex:'1 1 150px', padding:'10px'}}> <option value="Inspector">Инспектор</option> <option value="Admin">Админ</option> </select>
          <button type="submit" style={{flex:'1 1 120px', padding:'10px 20px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000'}}>Создать</button>
        </form>
      </div>
      {users.map(u => (
        <div key={u.id} className="glass-panel" style={{ padding: '15px', marginBottom:'10px' }}>
          {editingUser === u.id ? (
            <form onSubmit={(e) => handleUpdateUser(e, u.id)} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <input className="glass" value={editUname} onChange={e=>setEditUname(e.target.value)} style={{flex:'1 1 180px', padding:'8px'}} required />
              <input className="glass" type="password" placeholder="Новый пароль" value={editPass} onChange={e=>setEditPass(e.target.value)} style={{flex:'1 1 180px', padding:'8px'}} />
              <select className="glass" value={editRole} onChange={e=>setEditRole(e.target.value)} style={{flex:'1 1 120px', padding:'8px'}}> <option value="Inspector">Инспектор</option> <option value="Admin">Админ</option> </select>
              <button type="submit" style={{flex:'1 1 100px', padding:'8px 15px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000'}}>Сохранить</button>
              <button type="button" onClick={() => setEditingUser(null)} className="glass" style={{flex:'1 1 100px', padding:'8px 15px'}}>Отмена</button>
            </form>
          ) : (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span><strong>{u.username}</strong> ({u.role})</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setEditingUser(u.id); setEditUname(u.username); setEditPass(''); setEditRole(u.role); }} className="glass" style={{ padding: '5px 15px', fontSize: '0.8rem' }}>Изменить</button>
                <button onClick={() => { setExpandedUser(expandedUser === u.id ? null : u.id); setDraftPerms(u.role === 'Admin' ? MODULES.map(m => m.id) : (u.permissions || [])); }} className="glass" style={{ padding: '5px 15px', fontSize: '0.8rem' }}>Права</button>
                <button onClick={() => handleDeleteUser(u.id)} className="glass" style={{ padding: '5px 15px', fontSize: '0.8rem', color: 'var(--c-danger)' }}>Удалить</button>
              </div>
            </div>
          )}
          {expandedUser === u.id && (
            <div style={{ marginTop:'15px', borderTop:'1px solid var(--c-border)', paddingTop:'15px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'10px' }}>
                {MODULES.map(m => ( <label key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'0.8rem' }}> <input type="checkbox" checked={draftPerms.includes(m.id)} onChange={() => setDraftPerms(prev => prev.includes(m.id) ? prev.filter(p=>p!==m.id) : [...prev, m.id])} /> {m.label} </label> ))}
              </div>
              <button onClick={() => savePermissions(u.id)} style={{ marginTop:'15px', padding:'10px 20px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000' }}>Сохранить</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const LotManagement = () => {
  const { lots, createLot, editLot, deleteLot, tvModels, fetchTvModels, showToast, showConfirm } = useDataStore();
  const [name, setName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<number | ''>('');
  const [editingLot, setEditingLot] = useState<any>(null);
  const [deletingLot, setDeletingLot] = useState<any>(null);

  useEffect(() => { fetchTvModels(); }, []);
  const handleCreate = async () => { if (!name) return showToast('Введите название лота', 'warning'); await createLot(name, selectedModelId || undefined); setName(''); setSelectedModelId(''); };
  const handleUpdate = async () => { if (!editingLot.name) return showToast('Введите название лота', 'warning'); await editLot(editingLot.id, editingLot.name, editingLot.tv_model_id, editingLot.status); setEditingLot(null); };

  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <div className="glass-panel" style={{ padding: '25px', marginBottom: '25px' }}>
        <h3>{editingLot ? 'Редактировать Лот' : 'Новый Лот / Заказ'}</h3>
        <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: editingLot ? '1fr 1fr 1fr auto' : '1fr 1fr auto', gap: '15px', marginTop: '15px' }}>
          <input className="glass" placeholder="Название лота" value={editingLot ? editingLot.name : name} onChange={e => editingLot ? setEditingLot({...editingLot, name: e.target.value}) : setName(e.target.value)} style={{padding:'10px'}} />
          <select className="glass" value={editingLot ? (editingLot.tv_model_id || '') : selectedModelId} onChange={e => { const val = e.target.value === '' ? '' : Number(e.target.value); editingLot ? setEditingLot({...editingLot, tv_model_id: val}) : setSelectedModelId(val); }} style={{ padding: '10px' }}>
            <option value="">Не выбрана</option>
            {tvModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {editingLot && (
            <select className="glass" value={editingLot.status || 'active'} onChange={e => setEditingLot({...editingLot, status: e.target.value})} style={{ padding: '10px' }}>
              <option value="active">🟢 Активен</option>
              <option value="closed">🔒 Закрыт</option>
            </select>
          )}
          <button onClick={editingLot ? handleUpdate : handleCreate} style={{padding:'10px 20px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000', fontWeight: 'bold'}}>{editingLot ? 'Сохранить' : 'Создать'}</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
        {lots.map(l => (
          <div key={l.id} className="glass-panel" style={{ padding: '15px 25px', display:'flex', justifyContent:'space-between', alignItems: 'center' }}> 
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <strong>{l.name}</strong>
              <span style={{ color: 'var(--c-text-muted)' }}>—</span>
              <span>{tvModels.find(m => m.id == l.tv_model_id)?.name || '—'}</span>
              <span style={{ 
                marginLeft: '15px', 
                padding: '3px 8px', 
                borderRadius: '4px', 
                fontSize: '0.75rem', 
                fontWeight: 'bold',
                background: l.status === 'closed' ? 'rgba(255, 77, 77, 0.15)' : 'rgba(77, 255, 77, 0.15)',
                color: l.status === 'closed' ? 'var(--c-danger)' : 'var(--c-success)',
                border: l.status === 'closed' ? '1px solid var(--c-danger)' : '1px solid var(--c-success)'
              }}>
                {l.status === 'closed' ? '🔒 Закрыт' : '🟢 Активен'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={() => editLot(l.id, l.name, l.tv_model_id, l.status === 'closed' ? 'active' : 'closed')} 
                style={{ 
                  color: l.status === 'closed' ? 'var(--c-success)' : 'var(--c-text-muted)', 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {l.status === 'closed' ? '🔑 Открыть' : '🔒 Закрыть'}
              </button>
              <button onClick={() => setEditingLot(l)} style={{ color:'var(--c-accent)', background:'none', border:'none', cursor: 'pointer' }}>Изменить</button>
              <button onClick={() => setDeletingLot(l)} style={{ color:'var(--c-danger)', background:'none', border:'none', cursor: 'pointer' }}>Удалить</button> 
            </div>
          </div>
        ))}
      </div>
      {deletingLot && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(5px)' }}>
            <div className="glass-panel" style={{ width: '400px', padding: '30px', textAlign: 'center' }}>
              <h3>Удалить Лот {deletingLot.name}?</h3>
              <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                <button onClick={async () => { await deleteLot(deletingLot.id); setDeletingLot(null); }} style={{ flex: 1, padding: '12px', background: 'var(--c-danger)', color: '#fff', border: 'none', borderRadius: '4px' }}>Да</button>
                <button onClick={() => setDeletingLot(null)} style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface-elevated)', border: 'none', borderRadius: '4px' }}>Отмена</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

const BreaksManagement = () => {
  const { showToast, showConfirm } = useDataStore();
  const [breaks, setBreaks] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editingBreak, setEditingBreak] = useState<any>(null);

  useEffect(() => {
    fetchBreaks();
  }, []);

  const fetchBreaks = async () => {
    try {
      const data = await api.get('/breaks');
      setBreaks(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startTime || !endTime) {
      return showToast('Заполните все поля', 'warning');
    }
    try {
      await api.post('/breaks', { name, start_time: startTime, end_time: endTime });
      showToast('Перерыв успешно добавлен');
      setName('');
      setStartTime('');
      setEndTime('');
      fetchBreaks();
    } catch (err) {
      showToast('Ошибка при создании', 'error');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBreak.name || !editingBreak.start_time || !editingBreak.end_time) {
      return showToast('Заполните все поля', 'warning');
    }
    try {
      await api.put(`/breaks/${editingBreak.id}`, {
        name: editingBreak.name,
        start_time: editingBreak.start_time,
        end_time: editingBreak.end_time
      });
      showToast('Перерыв обновлен');
      setEditingBreak(null);
      fetchBreaks();
    } catch (err) {
      showToast('Ошибка при обновлении', 'error');
    }
  };

  const handleDelete = (id: number) => {
    showConfirm('Вы уверены, что хотите удалить этот перерыв?', async () => {
      try {
        await api.delete(`/breaks/${id}`);
        showToast('Перерыв удален');
        fetchBreaks();
      } catch (err) {
        showToast('Ошибка при удалении', 'error');
      }
    }, undefined, 'danger');
  };

  return (
    <div style={{ maxWidth: '800px' }}>
      <div className="glass-panel" style={{ padding: '25px', marginBottom: '25px' }}>
        <h3>{editingBreak ? 'Редактировать перерыв / обед' : 'Новый перерыв / обед'}</h3>
        <form onSubmit={editingBreak ? handleUpdate : handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginTop: '15px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>Название</label>
            <input 
              className="glass" 
              placeholder="Например, Обед" 
              value={editingBreak ? editingBreak.name : name} 
              onChange={e => editingBreak ? setEditingBreak({ ...editingBreak, name: e.target.value }) : setName(e.target.value)} 
              style={{ padding: '10px' }} 
              required
            />
          </div>
          <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>Начало</label>
            <input 
              type="time"
              className="glass" 
              value={editingBreak ? editingBreak.start_time : startTime} 
              onChange={e => editingBreak ? setEditingBreak({ ...editingBreak, start_time: e.target.value }) : setStartTime(e.target.value)} 
              style={{ padding: '10px', colorScheme: 'dark' }} 
              required
            />
          </div>
          <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>Окончание</label>
            <input 
              type="time"
              className="glass" 
              value={editingBreak ? editingBreak.end_time : endTime} 
              onChange={e => editingBreak ? setEditingBreak({ ...editingBreak, end_time: e.target.value }) : setEndTime(e.target.value)} 
              style={{ padding: '10px', colorScheme: 'dark' }} 
              required
            />
          </div>
          <div style={{ flex: '1 1 150px', display: 'flex', gap: '10px' }}>
            <button type="submit" style={{ flex: 1, padding: '10px 20px', background: 'var(--c-accent)', border: 'none', borderRadius: '4px', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
              {editingBreak ? 'Сохранить' : 'Создать'}
            </button>
            {editingBreak && (
              <button type="button" onClick={() => setEditingBreak(null)} className="glass" style={{ flex: 1, padding: '10px 20px', border: '1px solid var(--c-border)', cursor: 'pointer' }}>
                Отмена
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
        {breaks.map(b => (
          <div key={b.id} className="glass-panel" style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ fontSize: '20px' }}>⏱️</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong>{b.name}</strong>
                <span style={{ fontSize: '13px', color: 'var(--c-text-muted)', marginTop: '2px' }}>
                  Интервал: {b.start_time} — {b.end_time}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => setEditingBreak(b)} style={{ color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Изменить</button>
              <button onClick={() => handleDelete(b.id)} style={{ color: 'var(--c-danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Удалить</button>
            </div>
          </div>
        ))}
        {breaks.length === 0 && (
          <p style={{ color: 'var(--c-text-muted)', textAlign: 'center', marginTop: '20px' }}>Нет запланированных перерывов</p>
        )}
      </div>
    </div>
  );
};

const MasterDataManagement = () => {
  const { suppliers, addSupplier, deleteSupplier, updateSupplier, fetchArticles, addArticle, deleteArticle, updateArticle, importArticles } = useDataStore();
  const [viewingSupId, setViewingSupId] = useState<number | null>(null);
  const [supName, setSupName] = useState('');
  const [articles, setArticles] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [artForm, setArtForm] = useState({ name: '', category: 'General', drawing_url: '', specs: '' });

  useEffect(() => { if (viewingSupId) fetchArticles(viewingSupId).then(setArticles); }, [viewingSupId]);
  const handleExcelImport = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      if (viewingSupId) {
        await importArticles(viewingSupId, data.map((d: any) => ({ name: String(d.Name || d.Артикул || ''), category: String(d.Category || d.Категория || 'General') })));
        const up = await fetchArticles(viewingSupId); setArticles(up);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '30px' }}>
       <div className="glass-panel" style={{ padding: '25px', display:'flex', flexDirection:'column' }}>
          <h3>Поставщики</h3>
          <input className="glass" placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'10px'}} />
          <div style={{ display:'flex', gap:'10px' }}>
             <input className="glass" placeholder="Новый..." value={supName} onChange={e=>setSupName(e.target.value)} style={{flex:1, padding:'10px'}} />
             <button onClick={() => { addSupplier(supName); setSupName(''); }} style={{padding:'10px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000'}}>＋</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', marginTop: '10px' }}>
            {suppliers.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())).map(s => (
               <div key={s.id} onClick={() => setViewingSupId(s.id)} style={{ display:'flex', justifyContent:'space-between', padding:'12px', background: viewingSupId===s.id ? 'var(--c-accent-muted)' : 'transparent', border:'1px solid var(--c-border)', borderRadius:'6px', marginBottom:'8px', cursor:'pointer' }}>
                 <span>{s.name}</span>
                 <button onClick={(e) => { e.stopPropagation(); deleteSupplier(s.id); }} style={{ color:'var(--c-danger)', background:'none', border:'none' }}>✕</button>
               </div>
            ))}
          </div>
       </div>
       <div className="glass-panel" style={{ padding: '25px', display:'flex', flexDirection:'column' }}>
          {viewingSupId ? (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px' }}>
                <h3>Артикулы: {suppliers.find(s=>s.id===viewingSupId)?.name}</h3>
                <label className="glass" style={{ padding:'8px 15px', borderRadius:'4px', cursor:'pointer', border:'1px solid var(--c-accent)', color:'var(--c-accent)', fontSize:'0.8rem' }}> 📥 Excel <input type="file" hidden onChange={handleExcelImport} /> </label>
              </div>
              <div className="glass" style={{ padding:'15px', borderRadius:'8px', marginBottom:'20px', display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'10px' }}>
                 <input className="glass" placeholder="Название" value={artForm.name} onChange={e=>setArtForm({...artForm, name:e.target.value})} style={{padding:'8px'}} />
                 <input className="glass" placeholder="Категория" value={artForm.category} onChange={e=>setArtForm({...artForm, category:e.target.value})} style={{padding:'8px'}} />
                 <button onClick={async () => { await addArticle(viewingSupId, artForm.name, artForm); setArtForm({name:'', category:'General', drawing_url:'', specs:''}); const up = await fetchArticles(viewingSupId); setArticles(up); }} style={{padding:'0 20px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000'}}>Добавить</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {articles.map(a => (
                  <div key={a.id} style={{ padding:'10px', borderBottom:'1px solid var(--c-border)', display:'flex', justifyContent:'space-between' }}>
                    <span>{a.name} ({a.category})</span>
                    <button onClick={async () => { await deleteArticle(a.id); const up = await fetchArticles(viewingSupId); setArticles(up); }} style={{ color:'var(--c-danger)', background:'none', border:'none' }}>✕</button>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ color:'var(--c-text-muted)', textAlign:'center', marginTop:'100px' }}>Выберите поставщика</div>}
       </div>
    </div>
  );
};

const DetailsCell = ({ details }: { details: any }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!expanded) {
    const preview = JSON.stringify(details).substring(0, 100);
    return (
      <div style={{ cursor: 'pointer' }} onClick={() => setExpanded(true)}>
        <span style={{ color: 'var(--c-text-muted)' }}>{preview}...</span>
        <button style={{ color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 10px', fontSize: '0.75rem', fontWeight: 'bold' }}>[ РАЗВЕРНУТЬ ]</button>
      </div>
    );
  }
  
  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={{ whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', border: '1px solid var(--c-border)' }}>
        {JSON.stringify(details, null, 2)}
        <button onClick={() => setExpanded(false)} style={{ display: 'block', color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 0 0', fontSize: '0.75rem', fontWeight: 'bold' }}>[ СВЕРНУТЬ ]</button>
      </div>
    </div>
  );
};



const defaultShift = {
  ratio_produced: 280,
  ratio_checked: 13
};

const TvSettingsManagement = () => {
  const {
    tvModels, fetchTvModels, addTvModel, updateTvModel, deleteTvModel,
    tvTests, fetchTvTests, addTvTest, updateTvTest, deleteTvTest,
    settings, updateSettings, showToast, showConfirm
  } = useDataStore();
  
  const [modelName, setModelName] = useState('');
  const [mnKeyword, setMnKeyword] = useState('');
  const [palletKeyword, setPalletKeyword] = useState('');
  const [testName, setTestName] = useState('');
  
  const [editingModel, setEditingModel] = useState<any>(null);
  const [editingTest, setEditingTest] = useState<any>(null);

  const [localShiftConfig, setLocalShiftConfig] = useState<any>(defaultShift);

  useEffect(() => {
    try {
      if (settings.oqa_shift_config) {
        setLocalShiftConfig(JSON.parse(settings.oqa_shift_config));
      }
    } catch {}
  }, [settings.oqa_shift_config]);

  const saveShiftConfig = async () => {
    await updateSettings({ ...settings, oqa_shift_config: JSON.stringify(localShiftConfig) });
    showToast('Настройки плана сохранены!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      <div className="glass-panel" style={{ padding: '25px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Настройка плана (MES Integration)</h3>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '25px', padding: '15px', background: 'var(--c-bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--c-accent-muted)' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '5px' }}>Базовый выпуск (шт)</label>
            <input type="number" className="glass" value={localShiftConfig.ratio_produced} onChange={e => setLocalShiftConfig({...localShiftConfig, ratio_produced: Number(e.target.value)})} style={{ width: '120px', padding: '8px', border: '1px solid var(--c-accent)' }} />
          </div>
          <div style={{ alignSelf: 'center', fontSize: '20px', color: 'var(--c-text-muted)' }}>➔</div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '5px' }}>Кол-во проверок (шт)</label>
            <input type="number" className="glass" value={localShiftConfig.ratio_checked} onChange={e => setLocalShiftConfig({...localShiftConfig, ratio_checked: Number(e.target.value)})} style={{ width: '120px', padding: '8px', border: '1px solid var(--c-accent)' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', color: 'var(--c-text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
            * План AQL теперь рассчитывается автоматически на основе реальных данных из MES ({localShiftConfig.ratio_checked} ТВ на каждые {localShiftConfig.ratio_produced} шт выпуска).
          </div>
        </div>

        <div style={{ marginBottom: '25px', padding: '15px', background: 'var(--c-bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--c-border)' }}>
           <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--c-accent)' }}>Источник данных MES (URL для парсинга выпуска)</label>
           <input 
              className="glass" 
              value={settings.mes_dashboard_url || ''} 
              onChange={e => updateSettings({ ...settings, mes_dashboard_url: e.target.value })} 
              placeholder="http://192.168.210.210:8000/tablo/lines/1/dashboard/" 
              style={{ width: '100%', padding: '10px' }} 
           />
        </div>


        <button onClick={saveShiftConfig} style={{ marginTop: '25px', padding: '12px 30px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>СОХРАНИТЬ ВСЕ НАСТРОЙКИ ПЛАНА</button>
      </div>

      <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        <div className="glass-panel" style={{ padding: '25px', display: 'flex', flexDirection: 'column' }}>
          <h3>Модели</h3>
          <div className="glass" style={{ padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input className="glass" placeholder="Модель" value={modelName} onChange={e=>setModelName(e.target.value)} style={{padding:'10px'}} />
            <input className="glass" placeholder="Ключ MN (Этикетка)" value={mnKeyword} onChange={e=>setMnKeyword(e.target.value)} style={{padding:'10px'}} />
            <input className="glass" placeholder="Ключ Pallet (Паллета)" value={palletKeyword} onChange={e=>setPalletKeyword(e.target.value)} style={{padding:'10px'}} />
            <button onClick={async () => { 
              if (editingModel) { 
                await updateTvModel(editingModel.id, { name: modelName, mn_keyword: mnKeyword, pallet_keyword: palletKeyword }); 
                setEditingModel(null); 
              } else { 
                await addTvModel({ name: modelName, mn_keyword: mnKeyword, pallet_keyword: palletKeyword }); 
              } 
              setModelName(''); 
              setMnKeyword(''); 
              setPalletKeyword('');
            }} style={{ padding:'10px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000', fontWeight:'bold' }}>{editingModel ? 'Сохранить' : 'Добавить'}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tvModels.map(m => (
              <div key={m.id} style={{ display:'flex', justifyContent:'space-between', padding:'12px', borderBottom:'1px solid var(--c-border)' }}>
                <span>{m.name} (MN: {m.mn_keyword}, PL: {m.pallet_keyword || '-'})</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setEditingModel(m); setModelName(m.name); setMnKeyword(m.mn_keyword); setPalletKeyword(m.pallet_keyword || ''); }} style={{ color:'var(--c-accent)', background:'none', border:'none' }}>✎</button>
                  <button onClick={() => deleteTvModel(m.id)} style={{ color:'var(--c-danger)', background:'none', border:'none' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '25px', display: 'flex', flexDirection: 'column' }}>
          <h3>Тесты</h3>
          <div className="glass" style={{ padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '10px' }}>
            <input className="glass" placeholder="Название теста" value={testName} onChange={e=>setTestName(e.target.value)} style={{flex:1, padding:'10px'}} />
            <button onClick={async () => { if (editingTest) { await updateTvTest(editingTest.id, testName, ''); setEditingTest(null); } else { await addTvTest(testName, ''); } setTestName(''); }} style={{ padding:'10px 20px', background:'var(--c-accent)', border:'none', borderRadius:'4px', color:'#000', fontWeight:'bold' }}>{editingTest ? 'ОК' : '＋'}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tvTests.map(t => (
              <div key={t.id} style={{ display:'flex', justifyContent:'space-between', padding:'12px', borderBottom:'1px solid var(--c-border)' }}>
                <span>{t.name}</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setEditingTest(t); setTestName(t.name); }} style={{ color:'var(--c-accent)', background:'none', border:'none' }}>✎</button>
                  <button onClick={() => deleteTvTest(t.id)} style={{ color:'var(--c-danger)', background:'none', border:'none' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const LabelSettingsManagement = () => {
  const { tvModels, updateTvModel, settings, updateSettings, showToast, showConfirm } = useDataStore();
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [localConfig, setLocalConfig] = useState<any>(null);

  const model = tvModels.find(m => m.id === selectedModelId);

  useEffect(() => {
    if (model) {
      setLocalConfig({
        label_sn_len: model.label_sn_len || '',
        label_mn_len: model.label_mn_len || '',
        label_ean_len: model.label_ean_len || '',
        label_sn_fix: JSON.parse(model.label_sn_fix || '[]'),
        label_mn_fix: JSON.parse(model.label_mn_fix || '[]'),
        label_ean_fix: JSON.parse(model.label_ean_fix || '[]'),
        label_parsing_config: JSON.parse(model.label_parsing_config || '{"sn":[], "mn":[]}'),
      });
    } else {
      setLocalConfig(null);
    }
  }, [selectedModelId]);

  const handleSaveModelConfig = async () => {
    if (!selectedModelId || !localConfig) return;
    await updateTvModel(selectedModelId, {
      ...model,
      label_sn_len: localConfig.label_sn_len === '' ? null : Number(localConfig.label_sn_len),
      label_mn_len: localConfig.label_mn_len === '' ? null : Number(localConfig.label_mn_len),
      label_ean_len: localConfig.label_ean_len === '' ? null : Number(localConfig.label_ean_len),
      label_sn_fix: JSON.stringify(localConfig.label_sn_fix),
      label_mn_fix: JSON.stringify(localConfig.label_mn_fix),
      label_ean_fix: JSON.stringify(localConfig.label_ean_fix),
      label_parsing_config: JSON.stringify(localConfig.label_parsing_config),
    });
    showToast('Настройки модели сохранены');
  };

  const renderFixEditor = (type: 'sn' | 'mn' | 'ean', title: string) => {
    if (!localConfig) return null;
    const field = `label_${type}_fix` as keyof typeof localConfig;
    const items = localConfig[field] as any[];

    return (
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '0.85rem', color: 'var(--c-accent)', marginBottom: '10px' }}>Правила для {title}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((fix, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 40px', gap: '8px', alignItems: 'center', background: 'var(--c-bg-base)', padding: '8px', borderRadius: '4px' }}>
              <select className="glass" value={fix.matchType} onChange={e => {
                const newFixes = [...items];
                newFixes[idx].matchType = e.target.value;
                setLocalConfig({ ...localConfig, [field]: newFixes });
              }} style={{ padding: '4px', fontSize: '0.75rem' }}>
                <option value="contains">Содержит</option>
                <option value="startsWith">Начинается на</option>
                <option value="endsWith">Заканчивается на</option>
                <option value="exact">Равно</option>
                <option value="regex">Regex (сложное)</option>
              </select>
              <input className="glass" placeholder="Значение" value={fix.value} onChange={e => {
                const newFixes = [...items];
                newFixes[idx].value = e.target.value;
                setLocalConfig({ ...localConfig, [field]: newFixes });
              }} style={{ padding: '4px', fontSize: '0.75rem' }} />
              <input className="glass" placeholder="Пояснение ошибки" value={fix.explanation} onChange={e => {
                const newFixes = [...items];
                newFixes[idx].explanation = e.target.value;
                setLocalConfig({ ...localConfig, [field]: newFixes });
              }} style={{ padding: '4px', fontSize: '0.75rem' }} />
              <button onClick={() => {
                const newFixes = items.filter((_, i) => i !== idx);
                setLocalConfig({ ...localConfig, [field]: newFixes });
              }} style={{ background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => {
            const newFixes = [...items, { matchType: 'startsWith', value: '', explanation: '' }];
            setLocalConfig({ ...localConfig, [field]: newFixes });
          }} style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'var(--c-bg-surface-elevated)', border: '1px dashed var(--c-border)', color: 'var(--c-text-muted)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>+ Добавить правило</button>
        </div>
      </div>
    );
  };

  const renderParsingEditor = (type: 'sn' | 'mn') => {
    if (!localConfig) return null;
    const items = localConfig.label_parsing_config[type] as any[];

    return (
      <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--c-border)' }}>
        <h4 style={{ fontSize: '0.85rem', color: 'var(--c-accent)', marginBottom: '10px' }}>Парсинг {type.toUpperCase()} (Извлечение данных)</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((field, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 40px', gap: '8px', alignItems: 'center' }}>
              <input className="glass" placeholder="Название (напр. Завод)" value={field.name} onChange={e => {
                const newCfg = { ...localConfig.label_parsing_config };
                newCfg[type][idx].name = e.target.value;
                setLocalConfig({ ...localConfig, label_parsing_config: newCfg });
              }} style={{ padding: '6px', fontSize: '0.8rem' }} />
              <input className="glass" type="number" placeholder="Старт" value={field.start} onChange={e => {
                const newCfg = { ...localConfig.label_parsing_config };
                newCfg[type][idx].start = Number(e.target.value);
                setLocalConfig({ ...localConfig, label_parsing_config: newCfg });
              }} style={{ padding: '6px', fontSize: '0.8rem' }} />
              <input className="glass" type="number" placeholder="Длина" value={field.len} onChange={e => {
                const newCfg = { ...localConfig.label_parsing_config };
                newCfg[type][idx].len = Number(e.target.value);
                setLocalConfig({ ...localConfig, label_parsing_config: newCfg });
              }} style={{ padding: '6px', fontSize: '0.8rem' }} />
              <button onClick={() => {
                const newCfg = { ...localConfig.label_parsing_config };
                newCfg[type] = newCfg[type].filter((_:any, i:number) => i !== idx);
                setLocalConfig({ ...localConfig, label_parsing_config: newCfg });
              }} style={{ background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => {
            const newCfg = { ...localConfig.label_parsing_config };
            newCfg[type] = [...newCfg[type], { name: '', start: 0, len: 1 }];
            setLocalConfig({ ...localConfig, label_parsing_config: newCfg });
          }} style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'var(--c-bg-surface-elevated)', border: '1px dashed var(--c-border)', color: 'var(--c-text-muted)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>+ Добавить поле парсинга</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div className="glass-panel" style={{ padding: '25px' }}>
        <h3 style={{ marginBottom: '20px' }}>Глобальные длины штрихкодов</h3>
        <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>SN Default Length</label>
            <input className="glass" type="number" value={settings.label_sn_len} onChange={e => updateSettings({ label_sn_len: e.target.value })} style={{ width: '100%', padding: '10px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>MN Default Length</label>
            <input className="glass" type="number" value={settings.label_mn_len} onChange={e => updateSettings({ label_mn_len: e.target.value })} style={{ width: '100%', padding: '10px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>EAN Default Length</label>
            <input className="glass" type="number" value={settings.label_ean_len} onChange={e => updateSettings({ label_ean_len: e.target.value })} style={{ width: '100%', padding: '10px' }} />
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '25px' }}>
        <h3 style={{ marginBottom: '20px' }}>Помодельные настройки и правила</h3>
        <select className="glass" value={selectedModelId || ''} onChange={e => setSelectedModelId(Number(e.target.value))} style={{ width: '100%', padding: '12px', marginBottom: '20px', fontSize: '1rem' }}>
          <option value="">Выберите модель для настройки...</option>
          {tvModels.map(m => <option key={m.id} value={m.id}>{m.name} ({m.mn_keyword})</option>)}
        </select>

        {localConfig && (
          <div className="animate-fade-in">
            <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '25px', padding: '15px', background: 'var(--c-bg-surface-elevated)', borderRadius: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>SN Length (Model)</label>
                <input className="glass" type="number" placeholder="Глобально" value={localConfig.label_sn_len} onChange={e => setLocalConfig({ ...localConfig, label_sn_len: e.target.value })} style={{ width: '100%', padding: '8px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>MN Length (Model)</label>
                <input className="glass" type="number" placeholder="Глобально" value={localConfig.label_mn_len} onChange={e => setLocalConfig({ ...localConfig, label_mn_len: e.target.value })} style={{ width: '100%', padding: '8px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>EAN Length (Model)</label>
                <input className="glass" type="number" placeholder="Глобально" value={localConfig.label_ean_len} onChange={e => setLocalConfig({ ...localConfig, label_ean_len: e.target.value })} style={{ width: '100%', padding: '8px' }} />
              </div>
            </div>

            <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
              <div>
                {renderFixEditor('sn', 'SN')}
                {renderParsingEditor('sn')}
              </div>
              <div>
                {renderFixEditor('mn', 'MN')}
                {renderParsingEditor('mn')}
              </div>
            </div>
            {renderFixEditor('ean', 'EAN')}

            <button onClick={handleSaveModelConfig} style={{ width: '100%', padding: '15px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: '10px' }}>
              СОХРАНИТЬ ПРАВИЛА ДЛЯ МОДЕЛИ: {model?.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ComponentsSettingsManagement = () => {
  const { tvModels, componentsMaster, fetchComponentsMaster, addComponentMaster, importComponentsMaster, deleteComponentMaster, showToast, showConfirm } = useDataStore();
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [article, setArticle] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedModelId) {
      fetchComponentsMaster(selectedModelId);
    }
  }, [selectedModelId]);

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedModelId) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        console.log('Raw Excel rows:', rows);

        // Find header row (the first row that contains both 'артикул' and 'наименование' in any column)
        let headerRowIndex = -1;
        let artColIndex = -1;
        let nameColIndex = -1;

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i];
          if (!row) continue;
          const artIdx = row.findIndex(cell => {
            const s = String(cell || '').toLowerCase();
            return s.includes('артикул') || s.includes('article') || s.includes('part number') || s.includes('p/n');
          });
          const nameIdx = row.findIndex(cell => {
            const s = String(cell || '').toLowerCase();
            return s.includes('наименование') || s.includes('name') || s.includes('description') || s.includes('название');
          });

          if (artIdx !== -1 && nameIdx !== -1) {
            headerRowIndex = i;
            artColIndex = artIdx;
            nameColIndex = nameIdx;
            break;
          }
        }

        if (headerRowIndex === -1) {
          showToast('Не удалось определить заголовки столбцов. Убедитесь, что в файле есть столбцы "Артикул" и "Наименование".', 'error');
          return;
        }

        const components = rows.slice(headerRowIndex + 1).map(row => ({
          article: String(row[artColIndex] || '').trim(),
          name: String(row[nameColIndex] || '').trim()
        })).filter(c => c.article && c.name);

        console.log('Detected components:', components);

        if (components.length === 0) {
          showToast('В файле не найдено данных под заголовками.', 'error');
          return;
        }

        setLoading(true);
        await importComponentsMaster(selectedModelId, components);
        showToast(`Успешно импортировано ${components.length} компонентов`);
      } catch (err) {
        console.error(err);
        showToast('Ошибка при чтении файла', 'error');
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div className="glass-panel" style={{ padding: '25px' }}>
        <h3 style={{ marginBottom: '20px' }}>Справочник комплектующих</h3>
        
        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Выберите модель для управления комплектующими:</label>
          <select 
            className="glass" 
            value={selectedModelId || ''} 
            onChange={e => setSelectedModelId(Number(e.target.value) || null)}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', background: 'var(--c-bg-surface-elevated)', border: '1px solid var(--c-accent-muted)' }}
          >
            <option value="">-- Выберите модель --</option>
            {tvModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {selectedModelId && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '25px', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Артикул</label>
                <input className="glass" placeholder="Напр. 1.01.123" value={article} onChange={e => setArticle(e.target.value)} style={{ padding: '10px', width: '100%' }} />
              </div>
              <div style={{ flex: '1 1 250px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Наименование</label>
                <input className="glass" placeholder="Напр. Main Board" value={name} onChange={e => setName(e.target.value)} style={{ padding: '10px', width: '100%' }} />
              </div>
              <button 
                onClick={async () => {
                  if (!article || !name) return showToast('Заполните все поля', 'warning');
                  await addComponentMaster(article, name, selectedModelId);
                  setArticle('');
                  setName('');
                }} 
                style={{ flex: '1 1 120px', padding: '10px 30px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', height: '40px' }}
              >
                Добавить
              </button>
              
              <div style={{ flex: '1 1 150px', position: 'relative' }}>
                <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} style={{ display: 'none' }} id="excel-import" />
                <label 
                  htmlFor="excel-import" 
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', 
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--c-accent)', 
                    borderRadius: '4px', color: 'var(--c-accent)', fontWeight: 'bold', 
                    cursor: loading ? 'not-allowed' : 'pointer', height: '40px', fontSize: '0.9rem' 
                  }}
                >
                  {loading ? 'ЗАГРУЗКА...' : 'ИМПОРТ EXCEL'}
                </label>
              </div>
            </div>

            <div className="table-mobile-responsive">
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text-secondary)', fontSize: '0.9rem' }}>
                    <th style={{ padding: '12px' }}>Артикул</th>
                    <th style={{ padding: '12px' }}>Наименование</th>
                    <th style={{ padding: '12px', textAlign: 'center', width: '80px' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {componentsMaster.map(comp => (
                    <tr key={comp.id} style={{ borderBottom: '1px solid var(--c-border)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{comp.article}</td>
                      <td style={{ padding: '12px' }}>{comp.name}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button onClick={() => { showConfirm('Удалить этот компонент?', () => deleteComponentMaster(comp.id), undefined, 'danger'); }} style={{ color: 'var(--c-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {componentsMaster.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: 'var(--c-text-muted)' }}>Для этой модели пока нет комплектующих.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        
        {!selectedModelId && (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--c-text-muted)', border: '1px dashed var(--c-border)', borderRadius: '8px' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}>🧩</span>
            Выберите модель из списка выше, чтобы увидеть список комплектующих.
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;

const PalletSettingsManagement = () => {
  const { tvModels, updateTvModel, showToast, showConfirm } = useDataStore();
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [localConfig, setLocalConfig] = useState<any>(null);

  const model = tvModels.find(m => m.id === selectedModelId);

  useEffect(() => {
    if (model) {
      setLocalConfig({
        pallet_barcode_len: model.pallet_barcode_len || '',
        pallet_barcode_fix: JSON.parse(model.pallet_barcode_fix || '[]'),
        pallet_parsing_config: JSON.parse(model.pallet_parsing_config || '{"model_start":0, "model_len":13, "sn_start":13, "sn_len":6}'),
        pallet_keyword: model.pallet_keyword || ''
      });
    } else {
      setLocalConfig(null);
    }
  }, [selectedModelId]);

  const handleSaveModelConfig = async () => {
    if (!selectedModelId || !localConfig) return;
    await updateTvModel(selectedModelId, {
      ...model,
      pallet_barcode_len: localConfig.pallet_barcode_len === '' ? null : Number(localConfig.pallet_barcode_len),
      pallet_barcode_fix: JSON.stringify(localConfig.pallet_barcode_fix),
      pallet_parsing_config: JSON.stringify(localConfig.pallet_parsing_config),
      pallet_keyword: localConfig.pallet_keyword
    });
    showToast('Настройки паллет сохранены');
  };

  const renderFixEditor = (title: string) => {
    if (!localConfig) return null;
    const items = localConfig.pallet_barcode_fix as any[];

    return (
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '0.85rem', color: 'var(--c-accent)', marginBottom: '10px' }}>Правила для {title}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((fix, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 40px', gap: '8px', alignItems: 'center', background: 'var(--c-bg-base)', padding: '8px', borderRadius: '4px' }}>
              <select className="glass" value={fix.matchType} onChange={e => {
                const newFixes = [...items];
                newFixes[idx].matchType = e.target.value;
                setLocalConfig({ ...localConfig, pallet_barcode_fix: newFixes });
              }} style={{ padding: '4px', fontSize: '0.75rem' }}>
                <option value="contains">Содержит</option>
                <option value="startsWith">Начинается на</option>
                <option value="endsWith">Заканчивается на</option>
                <option value="exact">Равно</option>
                <option value="regex">Regex (сложное)</option>
              </select>
              <input className="glass" placeholder="Значение" value={fix.value} onChange={e => {
                const newFixes = [...items];
                newFixes[idx].value = e.target.value;
                setLocalConfig({ ...localConfig, pallet_barcode_fix: newFixes });
              }} style={{ padding: '4px', fontSize: '0.75rem' }} />
              <input className="glass" placeholder="Пояснение ошибки" value={fix.explanation} onChange={e => {
                const newFixes = [...items];
                newFixes[idx].explanation = e.target.value;
                setLocalConfig({ ...localConfig, pallet_barcode_fix: newFixes });
              }} style={{ padding: '4px', fontSize: '0.75rem' }} />
              <button onClick={() => {
                const newFixes = items.filter((_, i) => i !== idx);
                setLocalConfig({ ...localConfig, pallet_barcode_fix: newFixes });
              }} style={{ background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => {
            const newFixes = [...items, { matchType: 'startsWith', value: '', explanation: '' }];
            setLocalConfig({ ...localConfig, pallet_barcode_fix: newFixes });
          }} style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'var(--c-bg-surface-elevated)', border: '1px dashed var(--c-border)', color: 'var(--c-text-muted)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>+ Добавить правило</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div className="glass-panel" style={{ padding: '25px' }}>
        <h3 style={{ marginBottom: '20px' }}>Настройки штрихкодов паллет</h3>
        <select className="glass" value={selectedModelId || ''} onChange={e => setSelectedModelId(Number(e.target.value))} style={{ width: '100%', padding: '12px', marginBottom: '20px', fontSize: '1rem' }}>
          <option value="">Выберите модель для настройки паллет...</option>
          {tvModels.map(m => <option key={m.id} value={m.id}>{m.name} ({m.mn_keyword})</option>)}
        </select>

        {localConfig && (
          <div className="animate-fade-in">
            <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '25px', padding: '15px', background: 'var(--c-bg-surface-elevated)', borderRadius: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-accent)', marginBottom: '5px', fontWeight: 'bold' }}>PALLET Length (Model)</label>
                <input className="glass" type="number" placeholder="Длина штрихкода паллеты" value={localConfig.pallet_barcode_len} onChange={e => setLocalConfig({ ...localConfig, pallet_barcode_len: e.target.value })} style={{ width: '100%', padding: '8px', borderColor: 'var(--c-accent)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--c-accent)', marginBottom: '5px', fontWeight: 'bold' }}>PALLET Key (Barcode Prefix)</label>
                <input className="glass" placeholder="Напр: PELA5944RU" value={localConfig.pallet_keyword} onChange={e => setLocalConfig({ ...localConfig, pallet_keyword: e.target.value })} style={{ width: '100%', padding: '8px', borderColor: 'var(--c-accent)' }} />
              </div>
            </div>

            {renderFixEditor('PALLET Barcode')}
            
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '25px', background: 'rgba(255,255,255,0.03)' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--c-accent)', marginBottom: '15px' }}>Парсинг штрихкода (Извлечение данных)</h4>
              <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                <div style={{ background: 'var(--c-bg-base)', padding: '10px', borderRadius: '4px' }}>
                  <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Модель: Начало (позиция)</label>
                  <input className="glass" type="number" value={localConfig.pallet_parsing_config?.model_start ?? 0} onChange={e => setLocalConfig({...localConfig, pallet_parsing_config: {...localConfig.pallet_parsing_config, model_start: Number(e.target.value)}})} style={{ width: '100%', padding: '8px' }} />
                  <label style={{ display: 'block', fontSize: '11px', marginTop: '10px', marginBottom: '8px' }}>Модель: Длина</label>
                  <input className="glass" type="number" value={localConfig.pallet_parsing_config?.model_len ?? 0} onChange={e => setLocalConfig({...localConfig, pallet_parsing_config: {...localConfig.pallet_parsing_config, model_len: Number(e.target.value)}})} style={{ width: '100%', padding: '8px' }} />
                </div>
                <div style={{ background: 'var(--c-bg-base)', padding: '10px', borderRadius: '4px' }}>
                  <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Порядковый №: Начало (позиция)</label>
                  <input className="glass" type="number" value={localConfig.pallet_parsing_config?.sn_start ?? 0} onChange={e => setLocalConfig({...localConfig, pallet_parsing_config: {...localConfig.pallet_parsing_config, sn_start: Number(e.target.value)}})} style={{ width: '100%', padding: '8px' }} />
                  <label style={{ display: 'block', fontSize: '11px', marginTop: '10px', marginBottom: '8px' }}>Порядковый №: Длина</label>
                  <input className="glass" type="number" value={localConfig.pallet_parsing_config?.sn_len ?? 0} onChange={e => setLocalConfig({...localConfig, pallet_parsing_config: {...localConfig.pallet_parsing_config, sn_len: Number(e.target.value)}})} style={{ width: '100%', padding: '8px' }} />
                </div>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--c-text-muted)', marginTop: '10px' }}>* Позиция начинается с 0. Для "PELA58..." начало модели = 0, длина = 13.</p>
            </div>

            <button onClick={handleSaveModelConfig} style={{ width: '100%', padding: '15px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: '10px' }}>
              СОХРАНИТЬ ПРАВИЛА ПАЛЛЕТ ДЛЯ МОДЕЛИ: {model?.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const PatrolSettingsManagement = () => {
  const { settings, updateSettings, showToast, showConfirm } = useDataStore();
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [newCp, setNewCp] = useState('');

  useEffect(() => {
    try {
      if (settings.oqa_patrol_checkpoints) {
        setCheckpoints(JSON.parse(settings.oqa_patrol_checkpoints));
      } else {
        // Fallback to defaults if not set yet
        setCheckpoints([
          "Антистатическая защита (браслеты/коврики)",
          "Электрический винтоверт (график усилия)",
          "Ионизаторы (исправность/график чистки)",
          "LCM Panel (проверка подсветки)",
          "Сверка спецификации с факт.значением.",
          "Проверка винтов",
          "Детали из пластика",
          "Проверка паттернов",
          "Термокамера",
          "Баланс белого",
          "Тест электробезопасности (HiPot, пробой)",
          "Тест энергопотребления",
          "Соблюдение технологической дисциплины",
          "Этикетки и защитная пленка",
          "Упаковка",
          "Зона ремонта",
          "Бережливое производство"
        ]);
      }
    } catch (e) {
      console.error('Failed to parse patrol checkpoints', e);
    }
  }, [settings.oqa_patrol_checkpoints]);

  const handleSave = async (updatedList: string[]) => {
    await updateSettings({ ...settings, oqa_patrol_checkpoints: JSON.stringify(updatedList) });
    showToast('Список контрольных точек сохранен');
  };

  const addCp = () => {
    if (!newCp.trim()) return;
    const newList = [...checkpoints, newCp.trim()];
    setCheckpoints(newList);
    setNewCp('');
    handleSave(newList);
  };

  const removeCp = (index: number) => {
    showConfirm('Удалить эту контрольную точку?', () => {
      const updated = checkpoints.filter((_, i) => i !== index);
      setCheckpoints(updated);
      updateSettings({ oqa_patrol_checkpoints: JSON.stringify(updated) });
    }, undefined, 'danger');
  };

  const moveCp = (index: number, direction: 'up' | 'down') => {
    const newList = [...checkpoints];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newList.length) return;
    [newList[index], newList[targetIdx]] = [newList[targetIdx], newList[index]];
    setCheckpoints(newList);
    handleSave(newList);
  };

  return (
    <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px' }}>
      <h3 style={{ marginBottom: '20px' }}>Контрольные точки журнала обхода</h3>
      <p style={{ color: 'var(--c-text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
        Эти точки будут отображаться в форме заполнения журнала обхода в модуле OQA.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          className="glass" 
          placeholder="Новая контрольная точка..." 
          value={newCp} 
          onChange={e => setNewCp(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && addCp()}
          style={{ flex: 1, padding: '12px' }} 
        />
        <button 
          onClick={addCp}
          style={{ padding: '0 25px', background: 'var(--c-accent)', border: 'none', borderRadius: '4px', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Добавить
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {checkpoints.map((cp, idx) => (
          <div 
            key={idx} 
            className="glass" 
            style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '10px 15px', borderRadius: '6px', background: 'var(--c-bg-surface-elevated)' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem', width: '20px' }}>{idx + 1}.</span>
              <span>{cp}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                disabled={idx === 0}
                onClick={() => moveCp(idx, 'up')}
                style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--c-text-muted)' : 'var(--c-accent)', cursor: 'pointer' }}
              >↑</button>
              <button 
                disabled={idx === checkpoints.length - 1}
                onClick={() => moveCp(idx, 'down')}
                style={{ background: 'none', border: 'none', color: idx === checkpoints.length - 1 ? 'var(--c-text-muted)' : 'var(--c-accent)', cursor: 'pointer' }}
              >↓</button>
              <button 
                onClick={() => removeCp(idx)}
                style={{ background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', marginLeft: '10px' }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>
      
      {checkpoints.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--c-text-muted)', border: '1px dashed var(--c-border)', borderRadius: '8px' }}>
          Список пуст. Добавьте первую контрольную точку выше.
        </div>
      )}
    </div>
  );
};

const PanelsSettingsManagement = () => {
  const { settings, updateSettings, showToast, showConfirm } = useDataStore();
  const [defects, setDefects] = useState<string[]>([]);
  const [newDefect, setNewDefect] = useState('');

  useEffect(() => {
    try {
      if (settings.iqc_panels_defects) {
        setDefects(JSON.parse(settings.iqc_panels_defects));
      } else {
        // Fallback to defaults
        setDefects(["OK", "Line", "Point", "Broken", "Other"]);
      }
    } catch (e) {
      console.error('Failed to parse panels defects', e);
    }
  }, [settings.iqc_panels_defects]);

  const handleSave = async (updatedList: string[]) => {
    await updateSettings({ ...settings, iqc_panels_defects: JSON.stringify(updatedList) });
    showToast('Список дефектов сохранен');
  };

  const addDefect = () => {
    if (!newDefect.trim()) return;
    const newList = [...defects, newDefect.trim()];
    setDefects(newList);
    setNewDefect('');
    handleSave(newList);
  };

  const removeDefect = (index: number) => {
    showConfirm('Удалить это определение дефекта?', () => {
      const updated = defects.filter((_, i) => i !== index);
      setDefects(updated);
      updateSettings({ iqc_panels_defects: JSON.stringify(updated) });
    }, undefined, 'danger');
  };

  const moveDefect = (index: number, direction: 'up' | 'down') => {
    const newList = [...defects];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newList.length) return;
    [newList[index], newList[targetIdx]] = [newList[targetIdx], newList[index]];
    setDefects(newList);
    handleSave(newList);
  };

  return (
    <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px' }}>
      <h3 style={{ marginBottom: '20px' }}>Определение дефектов (Defect Definition)</h3>
      <p style={{ color: 'var(--c-text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
        Эти дефекты будут доступны в выпадающем списке модуля "Проверка панелей".
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          className="glass" 
          placeholder="Новое название дефекта..." 
          value={newDefect} 
          onChange={e => setNewDefect(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && addDefect()}
          style={{ flex: 1, padding: '12px' }} 
        />
        <button 
          onClick={addDefect}
          style={{ padding: '0 25px', background: 'var(--c-accent)', border: 'none', borderRadius: '4px', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Добавить
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {defects.map((d, idx) => (
          <div 
            key={idx} 
            className="glass" 
            style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '10px 15px', borderRadius: '6px', background: 'var(--c-bg-surface-elevated)' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem', width: '20px' }}>{idx + 1}.</span>
              <span style={{ color: d === 'OK' ? 'var(--c-success)' : 'inherit', fontWeight: d === 'OK' ? 'bold' : 'normal' }}>{d}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                disabled={idx === 0}
                onClick={() => moveDefect(idx, 'up')}
                style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--c-text-muted)' : 'var(--c-accent)', cursor: 'pointer' }}
              >↑</button>
              <button 
                disabled={idx === defects.length - 1}
                onClick={() => moveDefect(idx, 'down')}
                style={{ background: 'none', border: 'none', color: idx === defects.length - 1 ? 'var(--c-text-muted)' : 'var(--c-accent)', cursor: 'pointer' }}
              >↓</button>
              <button 
                onClick={() => removeDefect(idx)}
                style={{ background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', marginLeft: '10px' }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>
      
      {defects.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--c-text-muted)', border: '1px dashed var(--c-border)', borderRadius: '8px' }}>
          Список пуст. Добавьте первый дефект выше.
        </div>
      )}
    </div>
  );
};

const TranslationsManagement = () => {
  const { settings, updateSettings, showToast, showConfirm } = useDataStore();
  const [dict, setDict] = useState<Record<string, string>>({});
  const [newRu, setNewRu] = useState('');
  const [newEn, setNewEn] = useState('');

  useEffect(() => {
    try {
      if (settings.custom_translations) {
        setDict(JSON.parse(settings.custom_translations));
      } else {
        setDict({});
      }
    } catch (e) {
      console.error('Failed to parse custom_translations', e);
      setDict({});
    }
  }, [settings.custom_translations]);

  const handleSave = async (updatedDict: Record<string, string>) => {
    await updateSettings({ ...settings, custom_translations: JSON.stringify(updatedDict) });
    showToast('Словарь обновлен');
  };

  const addTranslation = () => {
    if (!newRu.trim() || !newEn.trim()) {
      showToast('Заполните оба поля', 'warning');
      return;
    }
    const key = newRu.trim().toLowerCase();
    const updated = { ...dict, [key]: newEn.trim() };
    setDict(updated);
    setNewRu('');
    setNewEn('');
    handleSave(updated);
  };

  const removeTranslation = (key: string) => {
    showConfirm('Удалить этот перевод?', () => {
      const updated = { ...dict };
      delete updated[key];
      setDict(updated);
      handleSave(updated);
    }, undefined, 'danger');
  };

  const entries = Object.entries(dict);

  return (
    <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px' }}>
      <h3 style={{ marginBottom: '20px' }}>Локальный словарь (Offline Переводчик)</h3>
      <p style={{ color: 'var(--c-text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
        Эти термины будут автоматически переводиться без использования интернета и имеют высший приоритет над онлайн-переводчиком.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          className="glass" 
          placeholder="Слово на русском (например: дребезг)" 
          value={newRu} 
          onChange={e => setNewRu(e.target.value)} 
          style={{ flex: 1, padding: '12px' }} 
        />
        <input 
          className="glass" 
          placeholder="Перевод (например: vibration)" 
          value={newEn} 
          onChange={e => setNewEn(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && addTranslation()}
          style={{ flex: 1, padding: '12px' }} 
        />
        <button 
          onClick={addTranslation}
          style={{ padding: '0 25px', background: 'var(--c-accent)', border: 'none', borderRadius: '4px', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Добавить
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entries.map(([ru, en], idx) => (
          <div 
            key={idx} 
            className="glass" 
            style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '10px 15px', borderRadius: '6px', background: 'var(--c-bg-surface-elevated)' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <span style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem', width: '20px' }}>{idx + 1}.</span>
              <span style={{ fontWeight: 'bold', width: '40%' }}>{ru}</span>
              <span style={{ color: 'var(--c-text-muted)' }}>→</span>
              <span style={{ color: 'var(--c-accent)', marginLeft: '10px' }}>{en}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => removeTranslation(ru)}
                style={{ background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', padding: '5px' }}
              >✕ Удалить</button>
            </div>
          </div>
        ))}
      </div>
      
      {entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--c-text-muted)', border: '1px dashed var(--c-border)', borderRadius: '8px' }}>
          Словарь пуст. Добавьте первый перевод выше.
        </div>
      )}
    </div>
  );
};

