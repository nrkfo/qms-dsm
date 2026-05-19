import { useState, useMemo, useEffect } from 'react';
import { playSound } from '../../utils/audio';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';
import { DsmTable } from '../../components/ui/DsmTable';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { api } from '../../utils/api';

import { getLetterFromTable1, getAQLPlanWithArrows } from '../../utils/aql';

export const AqlCheck = () => {
  const { fetchLogs, fetchAllLogs, saveLog, updateLog, deleteLog, suppliers, fetchSuppliers, fetchArticles, settings, fetchSettings, showToast, showConfirm, lots, fetchLots } = useDataStore();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);

  const [date, setDate] = useState(() => new Date().toLocaleString('ru-RU'));
  const [supplier, setSupplier] = useState('');
  const [article, setArticle] = useState('');
  const [lot, setLot] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [prodDate, setProdDate] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  const [level, setLevel] = useState('II');
  const [aql, setAql] = useState('');
  const [defects, setDefects] = useState<number | ''>('');
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | 'none'>('none');
  const [articles, setArticles] = useState<any[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<number | 'none'>('none');

  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passInputValue, setPassInputValue] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete', record: any } | null>(null);



  useEffect(() => {
    loadData();
    fetchSuppliers();
    fetchLots();
    fetchSettings();
  }, []);

  useEffect(() => {
    if (selectedSupplierId !== 'none') {
       fetchArticles(selectedSupplierId as number).then(setArticles);
    } else {
       setArticles([]);
    }
    setSelectedArticleId('none');
    setArticle('');
  }, [selectedSupplierId]);

  const loadData = async () => {
    setLoading(true);
    const logs = await fetchAllLogs('iqc_aql');
    setRecords(logs.map(l => ({ ...l.data, id: l.id, status: l.status })));
    setLoading(false);
  };

  const calculation = useMemo(() => {
    if (!qty || qty <= 0) return null;
    const letter = getLetterFromTable1(qty as number, level);
    const plan = getAQLPlanWithArrows(letter, aql);
    if (!plan) return null;
    let decision = '';
    if (defects !== '') decision = (defects as number) <= plan.ac ? 'OK' : 'NG';
    return { letter, plan, decision };
  }, [qty, level, aql, defects]);

  const addRecord = async () => {
    if (
      !calculation || 
      qty === '' || 
      defects === '' || 
      supplier === '' || 
      article === '' || 
      lot === '' || 
      invoiceNo.trim() === '' || 
      prodDate === '' || 
      aql === ''
    ) {
      return showToast('Заполните все данные!', 'warning');
    }
    
    const data = {
      date, supplier, article, lot, qty, level,
      sample: `${calculation.plan.letter} - ${calculation.plan.size}`,
      defects, aqlCrit: `Ac: ${calculation.plan.ac} / Re: ${calculation.plan.re}`,
      aql, decision: calculation.decision,
      invoiceNo,
      prodDate
    };
    
    await saveLog('iqc_aql', data, calculation.decision);
    playSound(calculation.decision === 'OK' ? 'ok' : 'ng');

    setDefects('');
    setInvoiceNo('');
    setProdDate('');
    setAql('');
    loadData();
  };

  const handleActionClick = (type: 'edit' | 'delete', record: any) => {
    setPendingAction({ type, record });
    setPassInputValue('');
    setIsPassModalOpen(true);
  };

  const confirmPassword = async () => {
    try {
      await api.post('/auth/verify', { password: passInputValue });
      if (pendingAction?.type === 'edit') {
        setEditingRecord(pendingAction.record);
      } else if (pendingAction?.type === 'delete') {
        const recordId = pendingAction.record.id;
        showConfirm('Вы уверены, что хотите удалить эту запись?', async () => {
          try {
            await deleteLog('iqc_aql', recordId);
            showToast('Запись удалена');
            loadData();
          } catch (e) {
            showToast('Ошибка при удалении', 'error');
          }
        }, undefined, 'danger');
      }
      setIsPassModalOpen(false);
      setPendingAction(null);
    } catch (e: any) {
      showToast(e.message || 'Неверный пароль', 'error');
    }
  };

  const handleDelete = (id: any) => {
    const record = records.find(r => Number(r.id) === Number(id));
    if (record) {
      handleActionClick('delete', record);
    }
  };
  
  const handleEdit = (row: any) => {
    handleActionClick('edit', row);
  };

  const handleUpdate = async () => {
    if (!editingRecord) return;
    const { id, status, ...data } = editingRecord;
    
    const letter = getLetterFromTable1(data.qty, data.level);
    const plan = getAQLPlanWithArrows(letter, data.aql);
    
    let decision = data.decision;
    let sample = data.sample;
    let aqlCrit = data.aqlCrit;
    
    if (plan) {
      decision = data.defects <= plan.ac ? 'OK' : 'NG';
      sample = `${plan.letter} - ${plan.size}`;
      aqlCrit = `Ac: ${plan.ac} / Re: ${plan.re}`;
    }
    
    const newStatus = decision;
    const updatedData = { ...data, decision, sample, aqlCrit };
    
    try {
      await updateLog('iqc_aql', id, updatedData, newStatus);
      playSound(newStatus === 'OK' ? 'ok' : 'ng');
      
      // Update local state immediately for better responsiveness
      setRecords(prev => prev.map(r => Number(r.id) === Number(id) ? { ...r, ...updatedData, status: newStatus } : r));
      setEditingRecord(null);
      
      // Removed reload to prevent "disappearing" changes.
      
      showToast('Запись успешно обновлена!');
    } catch (err) {
      console.error(err);
      showToast('Ошибка при сохранении', 'error');
    }
  };

  const exportExcel = async () => {
    const logs = await fetchAllLogs('iqc_aql');
    const records = logs.map(l => ({ ...l.data, id: l.id, status: l.status }));
    
    const exportData = records.map(r => ({
      'Date': formatDate(r.date), 
      'Supplier': r.supplier, 
      'Article': r.article, 
      'Lot': r.lot, 
      'Invoice No': r.invoiceNo || '—',
      'Prod Date': r.prodDate ? formatDate(r.prodDate) : '—',
      'Total Qty': r.qty,
      'Control Level': r.level, 
      'AQL %': r.aql, 
      'Sample Size': r.sample, 
      'Defects': r.defects,
      'Criteria (Ac/Re)': r.aqlCrit, 
      'Decision': r.decision
    }));
    const fileName = `AQL_Report_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(exportData, fileName, 'AQL_Report');
  };

  const columns = [
    { key: 'date', label: 'Дата' },
    { key: 'supplier', label: 'Поставщик' },
    { key: 'article', label: 'Артикул' },
    { key: 'lot', label: 'Лот' },
    { key: 'invoiceNo', label: '№ накладной' },
    { key: 'prodDate', label: 'Дата пр-ва', render: (val: string) => val ? formatDate(val) : '—' },
    { key: 'qty', label: 'Кол-во' },
    { key: 'level', label: 'Ур' },
    { key: 'aql', label: 'AQL' },
    { key: 'sample', label: 'Выборка' },
    { key: 'defects', label: 'Несоотв' },
    { key: 'aqlCrit', label: 'Ac/Re' },
    { key: 'decision', label: 'Решение', render: (val: string) => ( <span style={{ padding: '4px 8px', borderRadius: '4px', background: val === 'OK' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 0, 0, 0.1)', color: val === 'OK' ? 'var(--c-success)' : 'var(--c-danger)', fontWeight: 'bold', border: `1px solid ${val === 'OK' ? 'var(--c-success)' : 'var(--c-danger)'}` }}> {val} </span> ) }
  ];

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100% + 60px)', margin: '-30px', display: 'flex', flexDirection: 'column' }}>
      <div className="glass-panel" style={{ padding: '20px', borderRadius: 0, borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <h2 style={{ marginTop: 0, color: 'var(--c-accent)', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px'}}>
            <div>Журнал входного контроля AQL (ISO 2859-1)</div>
            <div style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'var(--c-bg-surface-elevated)', color: 'var(--c-accent)', border: '1px solid var(--c-accent)' }}>
              Режим: {settings.aql_mode || 'Normal'}
            </div>
          </div>
          <button onClick={exportExcel} className="glass" style={{ padding: '8px 15px', fontSize: '14px', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px', cursor:'pointer' }}>Выгрузить Excel</button>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div><label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Дата</label><input className="glass" type="text" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', fontWeight: 'bold' }} /></div>
          <div><label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Поставщик</label><select className="glass" value={selectedSupplierId} onChange={e => { const val = e.target.value; const idNum = val === 'none' ? 'none' : Number(val); setSelectedSupplierId(idNum); setSupplier((suppliers || []).find(s=>s.id === idNum)?.name || ''); }} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', fontWeight: 'bold' }}> <option value="none">-- Выбор --</option> {(suppliers || []).filter(s=>s.is_active !== 0).map(s => <option key={s.id} value={s.id}>{s.name}</option>)} </select></div>
          <div><label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Артикул</label><select className="glass" value={selectedArticleId} onChange={e => { const val = e.target.value; const idNum = val === 'none' ? 'none' : Number(val); setSelectedArticleId(idNum); setArticle((articles || []).find(a=>a.id === idNum)?.name || ''); }} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', fontWeight: 'bold' }}> <option value="none">-- Выбор --</option> {(articles || []).filter(a=>a.is_active !== 0).map(a => <option key={a.id} value={a.id}>{a.name}</option>)} </select></div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Лот</label>
            <select className="glass" value={lot} onChange={e => setLot(e.target.value)} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', fontWeight: 'bold' }}>
              <option value="">-- Выбор Лота --</option>
              {lots.filter(l => l.status === 'active').map(l => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>№ накладной</label>
            <input className="glass" type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder='Накл №...' style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Дата производства</label>
            <input className="glass" type="date" value={prodDate} onChange={e => setProdDate(e.target.value)} style={{ width: '100%', padding: '7px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '20px', alignItems: 'end' }}>
          <div><label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Кол-во получено</label><input className="glass" type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} placeholder='0' style={{ width: '100%', padding: '12px', fontSize: '18px', fontWeight: 'bold', color: 'var(--c-accent)' }} /></div>
          <div><label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Уровень</label><select className="glass" value={level} onChange={e => setLevel(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: '16px', fontWeight: 'bold' }}><option value="I">I</option><option value="II">II</option><option value="III">III</option></select></div>
          <div><label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>AQL %</label><select className="glass" value={aql} onChange={e => setAql(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: '16px' }}><option value="">-- Выбрать --</option>{['0.065','0.1','0.15','0.25','0.4','0.65','1.0','1.5','2.5','4.0','6.5'].map(a=><option key={a} value={a}>{a}%</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Несоотв. (Шт)</label><input className="glass" type="number" min="0" value={defects} onChange={e => setDefects(e.target.value===''?'':Number(e.target.value))} placeholder='0' style={{ width: '100%', padding: '12px', fontSize: '18px', fontWeight: 'bold' }} /></div>
          <button onClick={addRecord} style={{ height: '47px', padding: '0 30px', fontSize: '16px', fontWeight: 'bold', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Добавить</button>
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '20px', padding: '15px', background: 'var(--c-bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--c-border)' }}>
          <div style={{ flex: 1, textAlign: 'center' }}> <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Выборка (Буква - Шт)</div> <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{calculation && calculation.plan ? `${calculation.plan.letter} - ${calculation.plan.size}` : '-'}</div> </div>
          <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--c-border)', borderRight: '1px solid var(--c-border)' }}> <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Ac / Re (Критерий)</div> <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{calculation && calculation.plan ? `Ac: ${calculation.plan.ac} / Re: ${calculation.plan.re}` : '-'}</div> </div>
          <div style={{ flex: 1, textAlign: 'center' }}> <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Решение</div> <div style={{ fontSize: '24px', fontWeight: 'bold', color: calculation?.decision === 'OK' ? 'var(--c-success)' : calculation?.decision === 'NG' ? 'var(--c-danger)' : 'var(--c-text-muted)' }}>{calculation?.decision || 'В ОЖИДАНИИ'}</div> </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        <DsmTable title="История Журнала входного контроля AQL" columns={columns} data={records} loading={loading} hideAdd hideExport onDelete={handleDelete} onEdit={handleEdit} />
      </div>

      {editingRecord && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
            <div className="glass-panel" style={{ width: '400px', padding: '30px', background: 'white', color: '#000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#000' }}>Редактировать запись</h3>
              <button onClick={() => setEditingRecord(null)} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div><label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Кол-во</label><input className="glass" type="number" value={editingRecord.qty} onChange={e => setEditingRecord({...editingRecord, qty: Number(e.target.value)})} style={{ width: '100%', padding: '12px', fontSize: '16px', color: '#000', border: '1px solid #ccc', background: '#fff' }} /></div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Лот</label>
                <select 
                  className="glass" 
                  value={editingRecord.lot || ''} 
                  onChange={e => setEditingRecord({...editingRecord, lot: e.target.value})} 
                  style={{ width: '100%', padding: '12px', fontSize: '16px', color: '#000', border: '1px solid #ccc', background: '#fff' }}
                >
                  <option value="">-- Выбор Лота --</option>
                  {lots.map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>№ накладной</label>
                <input className="glass" type="text" value={editingRecord.invoiceNo || ''} onChange={e => setEditingRecord({...editingRecord, invoiceNo: e.target.value})} style={{ width: '100%', padding: '12px', fontSize: '16px', color: '#000', border: '1px solid #ccc', background: '#fff' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Дата производства</label>
                <input className="glass" type="date" value={editingRecord.prodDate ? editingRecord.prodDate.split('T')[0] : ''} onChange={e => setEditingRecord({...editingRecord, prodDate: e.target.value})} style={{ width: '100%', padding: '12px', fontSize: '16px', color: '#000', border: '1px solid #ccc', background: '#fff' }} />
              </div>
              <div><label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Несоотв. (Шт)</label><input className="glass" type="number" value={editingRecord.defects} onChange={e => setEditingRecord({...editingRecord, defects: Number(e.target.value)})} style={{ width: '100%', padding: '12px', fontSize: '16px', color: '#000', border: '1px solid #ccc', background: '#fff' }} /></div>
              <div style={{ marginTop: '10px' }}>
                <button 
                  onClick={handleUpdate} 
                  style={{ 
                    width: '100%', 
                    padding: '15px', 
                    background: 'var(--c-accent)', 
                    color: '#000', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 'bold',
                    fontSize: '16px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    cursor: 'pointer'
                  }}
                >
                  СОХРАНИТЬ ИЗМЕНЕНИЯ
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>
    )}

      {/* Password Modal */}
      {isPassModalOpen && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002, backdropFilter: 'blur(5px)' }}>
            <div className="glass-panel animate-scale-in" style={{ width: '320px', padding: '30px', textAlign: 'center', background: '#222' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Подтверждение доступа</h3>
              <p style={{ fontSize: '14px', color: 'var(--c-text-muted)', marginBottom: '20px' }}>Введите пароль Вашего аккаунта <b>{useAuthStore.getState().user?.username}</b></p>
              <input 
                type="password" 
                autoFocus
                className="glass"
                value={passInputValue} 
                onChange={e => setPassInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmPassword()}
                style={{ width: '100%', padding: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }} 
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={confirmPassword} style={{ flex: 2, padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>ВХОД</button>
                <button onClick={() => setIsPassModalOpen(false)} style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface-elevated)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>ОТМЕНА</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
