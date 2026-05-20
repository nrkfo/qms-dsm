import { useState, useEffect } from 'react';
import { DsmTable } from '../../components/ui/DsmTable';
import { useDataStore } from '../../store/useDataStore';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';
import { api, translateToEnglish } from '../../utils/api';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useAuthStore } from '../../store/useAuthStore';

export const CoversCheck = () => {
  const { fetchLogs, fetchAllLogs, saveLog, suppliers, fetchSuppliers, fetchArticles, deleteLog, updateLog, showToast, showConfirm } = useDataStore();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passInputValue, setPassInputValue] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete', record: any } | null>(null);

  // Master Data
  const [selectedSupplier, setSelectedSupplier] = useState<number | ''>('');
  const [availableArticles, setAvailableArticles] = useState<any[]>([]);

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [articleId, setArticleId] = useState<number | ''>('');
  const [lotDesc, setLotDesc] = useState('');
  const [weightDist, setWeightDist] = useState('');
  const [dims, setDims] = useState('');

  useEffect(() => {
    loadData();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (selectedSupplier) {
      fetchArticles(Number(selectedSupplier)).then(setAvailableArticles);
    } else {
      setAvailableArticles([]);
    }
  }, [selectedSupplier]);

  const loadData = async () => {
    setLoading(true);
    const logs = await fetchAllLogs('iqc_covers');
    setRecords(logs.map(l => ({ id: l.id, ...l.data })));
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!articleId || !weightDist) return showToast('Заполните обязательные поля', 'warning');
    const articleName = availableArticles.find(a => a.id === Number(articleId))?.name || '—';
    const supplierObj = suppliers.find(s => s.id === Number(selectedSupplier));
    const supplierName = supplierObj?.name || '—';

    let finalDims = dims;
    if (dims.trim()) {
      const en = await translateToEnglish(dims.trim());
      if (en && en.toLowerCase() !== dims.trim().toLowerCase()) {
        finalDims = `${dims.trim()} / ${en}`;
      }
    }

    const data = { 
      supplier: supplierName,
      article: articleName,
      date, 
      lotDesc, 
      weightDist, 
      dims: finalDims 
    };
    await saveLog('iqc_covers', data, 'OK');
    setArticleId('');
    setLotDesc('');
    setWeightDist('');
    setDims('');
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
            await deleteLog('iqc_covers', recordId);
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
    await updateLog('iqc_covers', id, data, status || 'OK');
    setEditingRecord(null);
    loadData();
  };

  const exportExcel = async () => {
    const logs = await fetchAllLogs('iqc_covers');
    const records = logs.map(l => ({ id: l.id, ...l.data }));

    const exportData = records.map(r => ({
       'Date': formatDate(r.date),
       'Supplier': r.supplier,
       'Article': r.article,
       'Lot / Prod Date': r.lotDesc,
       'Weight (Dist)': r.weightDist,
       'Dimensions / Comment': r.dims
    }));
    const fileName = `Covers_Report_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(exportData, fileName, 'Covers');
  };

  const columns = [
    { key: 'date', label: 'Дата проверки' },
    { key: 'supplier', label: 'Поставщик' },
    { key: 'article', label: 'Артикул' },
    { key: 'lotDesc', label: 'Партия / Дата изг.' },
    { key: 'weightDist', label: 'Вес, г (Распр.)' },
    { key: 'dims', label: 'Размеры' },
  ];

  return (
    <div className="animate-fade-in responsive-flex-container" style={{ gap: '24px' }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: 'var(--c-accent)' }}>Замеры задних крышек</h2>
          <button onClick={exportExcel} className="glass" style={{ padding: '8px 15px', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px' }}>Выгрузить Excel</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Дата проверки</label>
            <input className="glass" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Поставщик</label>
            <select className="glass" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: '100%', padding: '8px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)' }}>
              <option value="">Выберите...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Артикул</label>
            <select className="glass" value={articleId} onChange={e => setArticleId(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: '100%', padding: '8px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)' }} disabled={!selectedSupplier}>
              <option value="">Выберите...</option>
              {availableArticles.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Информация о партии</label>
            <input className="glass" value={lotDesc} onChange={e => setLotDesc(e.target.value)} placeholder="Партия от 15.11 (1000 шт)" style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Распределение веса</label>
            <input className="glass" value={weightDist} onChange={e => setWeightDist(e.target.value)} placeholder="0.094 (9), 0.098 (1)" style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Размеры / Комментарий</label>
            <input className="glass" value={dims} onChange={e => setDims(e.target.value)} placeholder="В пределах нормы (Рус/Eng)..." style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
          </div>
          <button onClick={handleAdd} style={{ padding: '10px', background: 'var(--c-accent)', color: 'black', border: 'none', borderRadius: '4px', fontWeight: 'bold', height: '37px', alignSelf: 'end', cursor: 'pointer' }}>
            Добавить
          </button>
        </div>
      </div>

      <div className="responsive-flex-content table-mobile-responsive" style={{ flex: 1 }}>
        <DsmTable 
          title="История замеров крышек" 
          columns={columns} 
          data={records} 
          loading={loading}
          hideAdd
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      </div>

      {editingRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '400px', padding: '30px' }}>
            <h3>Редактировать замер</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div><label style={{ fontSize: '12px' }}>Информация о партии</label><input className="glass" value={editingRecord.lotDesc} onChange={e => setEditingRecord({...editingRecord, lotDesc: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              <div><label style={{ fontSize: '12px' }}>Распределение веса</label><input className="glass" value={editingRecord.weightDist} onChange={e => setEditingRecord({...editingRecord, weightDist: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              <div><label style={{ fontSize: '12px' }}>Размеры / Комментарий</label><input className="glass" value={editingRecord.dims} onChange={e => setEditingRecord({...editingRecord, dims: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Сохранить</button>
                <button onClick={() => setEditingRecord(null)} style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface-elevated)', border: 'none', borderRadius: '4px' }}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
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

