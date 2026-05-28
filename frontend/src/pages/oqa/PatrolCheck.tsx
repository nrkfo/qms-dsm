import React, { useState, useEffect } from 'react';
import { useDataStore } from '../../store/useDataStore';
import { translateToEnglish } from '../../utils/api';
import { DsmTable } from '../../components/ui/DsmTable';
import { CheckCircle2, Save, History, LayoutGrid } from 'lucide-react';

const DEFAULT_CHECKPOINTS = [
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
];

export const PatrolCheck = () => {
  const { fetchLogs, saveLog, updateLog, activeLot, tvModels, fetchTvModels, settings, fetchSettings, showToast } = useDataStore();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');

  const checkpoints = settings.oqa_patrol_checkpoints 
    ? JSON.parse(settings.oqa_patrol_checkpoints) 
    : DEFAULT_CHECKPOINTS;

  // Form State
  const [model, setModel] = useState('');
  const [otkNum, setOtkNum] = useState('');
  const [checks, setChecks] = useState<Record<string, 'OK' | 'NG'>>({});
  const [comment, setComment] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [pendingEditRecord, setPendingEditRecord] = useState<any>(null);

  useEffect(() => {
    setChecks(checkpoints.reduce((acc: any, cp: string) => ({ ...acc, [cp]: 'OK' }), {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.oqa_patrol_checkpoints]);

  useEffect(() => {
    fetchTvModels();
    fetchSettings();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLot]);

  useEffect(() => {
    if (activeLot && tvModels.length > 0) {
      const foundModel = tvModels.find(m => m.id === activeLot.tv_model_id);
      if (foundModel) {
        setModel(foundModel.name);
      }
    }
  }, [activeLot, tvModels]);

  const loadData = async () => {
    setLoading(true);
    const logs = await fetchLogs('oqa_patrol');
    
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const todayLogs = logs.filter((l: any) => {
      if (l.timestamp) {
        const d = new Date(l.timestamp);
        return d.getFullYear() === todayYear &&
               d.getMonth() === todayMonth &&
               d.getDate() === todayDate;
      }
      if (l.date) {
        const parts = l.date.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          return y === todayYear && m === todayMonth && d === todayDate;
        }
      }
      return false;
    });

    setRecords(todayLogs.map(l => ({ 
      id: l.id, 
      timestamp: l.timestamp,
      user_id: l.user_id,
      status: l.status,
      ...l.data 
    })));
    setLoading(false);
  };

  const toggleCheck = (name: string) => {
    setChecks(prev => ({
      ...prev,
      [name]: prev[name] === 'OK' ? 'NG' : 'OK'
    }));
  };

  const handleEditClick = (row: any) => {
    setPendingEditRecord(row);
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handleVerifyEdit = async () => {
    setIsVerifying(true);
    setPasswordError('');
    try {
      // Import and use api directly or make sure it's available. Actually we need to import api.
      const { api } = await import('../../utils/api');
      await api.post('/auth/verify', { password: passwordInput });
      setShowPasswordModal(false);
      setPasswordInput('');
      
      const r = pendingEditRecord;
      setEditingId(r.id);
      setModel(r.model || '');
      setOtkNum(r.otkNum || '');
      setComment(r.comment || '');
      
      const newChecks = checkpoints.reduce((acc: any, cp: string) => ({ ...acc, [cp]: 'OK' }), {});
      if (r.checks) {
        Object.keys(r.checks).forEach(k => {
          if (newChecks[k] !== undefined) {
             newChecks[k] = r.checks[k];
          }
        });
      }
      setChecks(newChecks);
      setActiveTab('form');
    } catch {
      setPasswordError('Неверный пароль. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!activeLot) return showToast('Выберите текущий лот в боковом меню!', 'warning');
    if (!model) return showToast('Введите модель ТВ!', 'warning');
    if (!otkNum) return showToast('Выберите номер ОТК!', 'warning');

    const hasNG = Object.values(checks).some(v => v === 'NG');
    
    if (hasNG && !comment.trim()) {
      return showToast('При наличии NG (дефектов) необходимо обязательно заполнить поле комментария!', 'warning');
    }

    let finalComment = comment;
    if (comment.trim()) {
      const en = await translateToEnglish(comment.trim());
      if (en && en.toLowerCase() !== comment.trim().toLowerCase()) {
        finalComment = `${comment.trim()} / ${en}`;
      }
    }

    const ngOnlyChecks = Object.entries(checks)
      .filter(([, status]) => status === 'NG')
      .reduce((acc: any, [name, status]) => ({ ...acc, [name]: status }), {});

    const data = {
      model,
      otkNum,
      checks: ngOnlyChecks,
      comment: finalComment
    };

    if (editingId) {
      await updateLog('oqa_patrol', editingId, data, hasNG ? 'NG' : 'OK');
      showToast('Запись обновлена');
      setEditingId(null);
    } else {
      await saveLog('oqa_patrol', data, hasNG ? 'NG' : 'OK');
      showToast('Запись сохранена');
    }
    
    setModel('');
    setOtkNum('');
    setChecks(checkpoints.reduce((acc: any, cp: string) => ({ ...acc, [cp]: 'OK' }), {}));
    setComment('');
    loadData();
    setActiveTab('history');
  };

  const columns = [
    { key: 'timestamp', label: 'Время', render: (val: string) => val ? new Date(val).toLocaleTimeString() : '—' },
    { key: 'model', label: 'Модель' },
    { key: 'otkNum', label: 'ОТК №' },
    { 
      key: 'checks', 
      label: 'Результат обхода',
      render: (val: any) => {
        const ngItems = Object.entries(val || {})
          .filter(([, status]) => status === 'NG')
          .map(([name]) => name);
        
        if (ngItems.length === 0) return <span style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem' }}>—</span>;
        
        return (
          <div style={{ color: 'var(--c-danger)', fontSize: '0.75rem', fontWeight: 'bold', lineHeight: '1.2' }}>
            {ngItems.join(', ')}
          </div>
        );
      }
    },
    { key: 'comment', label: 'Комментарий' },
    { 
        key: 'status', 
        label: 'Статус', 
        render: (val: string) => (
          <span style={{ color: val === 'OK' ? 'var(--c-success)' : 'var(--c-danger)', fontWeight: 'bold' }}>{val}</span>
        )
    }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="responsive-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Журнал обхода (Patrol Log)</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.9rem' }}>Контроль технологической дисциплины на линии</p>
        </div>
        <div className="glass" style={{ display: 'flex', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => setActiveTab('form')}
            style={{ 
              padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
              background: activeTab === 'form' ? 'var(--c-accent)' : 'transparent',
              color: activeTab === 'form' ? '#000' : 'var(--c-text-primary)',
              display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', transition: '0.2s'
            }}
          >
            <LayoutGrid size={16} /> Форма
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            style={{ 
              padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
              background: activeTab === 'history' ? 'var(--c-accent)' : 'transparent',
              color: activeTab === 'history' ? '#000' : 'var(--c-text-primary)',
              display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', transition: '0.2s'
            }}
          >
            <History size={16} /> История за сегодня
          </button>
        </div>
      </div>

      {activeTab === 'form' ? (
        <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', flex: 1 }}>
          {/* Main Checklist */}
          <div className="glass-panel" style={{ padding: '20px', overflowY: 'auto', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={20} color="var(--c-accent)" /> 
                Контрольные точки
              </h3>
              {editingId && (
                <button 
                  onClick={() => {
                    setEditingId(null);
                    setModel('');
                    setOtkNum('');
                    setComment('');
                    setChecks(checkpoints.reduce((acc: any, cp: string) => ({ ...acc, [cp]: 'OK' }), {}));
                  }}
                  style={{
                    padding: '4px 10px',
                    background: 'transparent',
                    border: '1px solid var(--c-danger)',
                    color: 'var(--c-danger)',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Отменить ред.
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {checkpoints.map((cp: string) => (
                <div 
                  key={cp} 
                  onClick={() => toggleCheck(cp)}
                  className="glass-panel hover-scale"
                  style={{ 
                    padding: '12px 16px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    border: checks[cp] === 'NG' ? '1px solid var(--c-danger)' : '1px solid var(--c-border)',
                    background: checks[cp] === 'NG' ? 'rgba(255, 77, 77, 0.1)' : 'var(--c-bg-surface-glass)'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', flex: 1 }}>{cp}</span>
                  <div style={{ 
                    padding: '4px 10px', 
                    borderRadius: '4px', 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold',
                    background: checks[cp] === 'OK' ? 'var(--c-success)' : 'var(--c-danger)',
                    color: '#000',
                    marginLeft: '10px'
                  }}>
                    {checks[cp]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Sidebar Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
              <h4 style={{ margin: '0 0 15px 0' }}>Основная информация</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Модель ТВ</label>
                  <input 
                    className="glass" 
                    value={model} 
                    onChange={e => setModel(e.target.value)} 
                    placeholder="Напр. L32MB-ARU"
                    style={{ width: '100%', padding: '10px' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '5px', color: 'var(--c-text-muted)' }}>ОТК №</label>
                  <select 
                    className="glass" 
                    value={otkNum} 
                    onChange={e => setOtkNum(e.target.value)} 
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      background: 'var(--c-bg-surface-elevated)', 
                      color: 'var(--c-text-primary)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 'var(--radius-sm)'
                    }} 
                  >
                    <option value="" style={{ background: 'var(--c-bg-surface-elevated)', color: 'var(--c-text-primary)' }}>-- Выберите --</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num.toString()} style={{ background: 'var(--c-bg-surface-elevated)', color: 'var(--c-text-primary)' }}>{num}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Комментарии</label>
                  <textarea 
                    className="glass" 
                    value={comment} 
                    onChange={e => setComment(e.target.value)} 
                    placeholder="Комментарий (Русский/Eng)..."
                    style={{ width: '100%', padding: '10px', minHeight: '80px', resize: 'none' }} 
                  />
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--c-bg-surface-elevated)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                  <span style={{ fontSize: '0.85rem' }}>Итого:</span>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: Object.values(checks).some(v => v === 'NG') ? 'var(--c-danger)' : 'var(--c-success)' 
                  }}>
                    {Object.values(checks).some(v => v === 'NG') ? 'NG' : 'OK'}
                  </span>
               </div>
               <button 
                onClick={handleSave}
                style={{ 
                  width: '100%', padding: '15px', background: editingId ? 'var(--c-warning)' : 'var(--c-accent)', border: 'none', borderRadius: '8px', 
                  color: '#000', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
               >
                 <Save size={18} /> {editingId ? 'Обновить обход' : 'Сохранить обход'}
               </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="table-mobile-responsive" style={{ flex: 1 }}>
           <DsmTable 
             title="Последние обходы" 
             columns={columns} 
             data={records} 
             loading={loading} 
             hideAdd hideExport
             onEdit={handleEditClick}
           />
        </div>
      )}

      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fade-in 0.2s ease'
        }}>
          <div className="glass-panel animate-scale-in" style={{
            width: '400px',
            padding: '30px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--c-accent-muted)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🔒 Доступ к редактированию
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)', marginBottom: '20px' }}>
              Пожалуйста, введите ваш пароль, чтобы изменить запись обхода.
            </p>
            
            <input 
              type="password"
              placeholder="Введите ваш пароль"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyEdit();
              }}
              disabled={isVerifying}
              className="glass"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: passwordError ? '1px solid var(--c-danger)' : '1px solid var(--c-border)',
                background: 'var(--c-bg-surface-elevated)',
                color: 'var(--c-text-primary)',
                marginBottom: '15px',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              autoFocus
            />

            {passwordError && (
              <div style={{ color: 'var(--c-danger)', fontSize: '0.8rem', marginBottom: '15px', fontWeight: 'bold' }}>
                ⚠️ {passwordError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordInput('');
                  setPasswordError('');
                }}
                disabled={isVerifying}
                style={{
                  padding: '10px 18px',
                  background: 'transparent',
                  border: '1px solid var(--c-border)',
                  borderRadius: '6px',
                  color: 'var(--c-text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                Отмена
              </button>
              <button 
                onClick={handleVerifyEdit}
                disabled={isVerifying || !passwordInput}
                style={{
                  padding: '10px 18px',
                  background: 'var(--c-accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isVerifying ? 'Проверка...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
