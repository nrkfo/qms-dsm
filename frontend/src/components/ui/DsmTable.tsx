/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download, X } from 'lucide-react';
import { useDataStore } from '../../store/useDataStore';

interface Column {
  key: string;
  label: string;
  render?: (val: any, row: any) => React.ReactNode;
}

interface DsmTableProps {
  title: string;
  columns: Column[];
  data: any[];
  hideAdd?: boolean; 
  hideExport?: boolean;
  loading?: boolean;
  onDelete?: (id: number) => void;
  onEdit?: (row: any) => void;
}

export const DsmTable: React.FC<DsmTableProps> = ({ title, columns, data, hideAdd, hideExport, loading, onDelete, onEdit }) => {
  const { activeLot } = useDataStore();
  const [internalData, setInternalData] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    setInternalData(data);
  }, [data]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(internalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
    const lotName = activeLot?.name || 'NO-LOT';
    const sanitizedTitle = title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
    XLSX.writeFile(wb, `${sanitizedTitle}_${lotName}_${ts}.xlsx`);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord = { id: Date.now(), ...formData };
    setInternalData([newRecord, ...internalData]);
    setFormData({});
    setIsModalOpen(false);
  };

  return (
    <div className="glass-panel" style={{ borderRadius: 'var(--radius-lg)', padding: '20px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--c-accent)' }}>
          {title} <span style={{ fontSize: '0.9rem', color: 'var(--c-text-muted)', marginLeft: '10px' }}>{activeLot ? `[ Лот: ${activeLot.name} ]` : ''}</span>
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {!hideAdd && (
            <button onClick={() => setIsModalOpen(true)} style={{ padding: '8px 16px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}> + Добавить запись </button>
          )}
          {!hideExport && (
            <button onClick={exportExcel} className="glass" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', background: 'transparent' }}> <Download size={16} /> Excel </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text-secondary)' }}>
              {columns.map(col => (
                <th key={col.key} style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
              {(onDelete || onEdit) && <th style={{ padding: '12px 16px', textAlign: 'right' }}>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} style={{ padding: '40px', textAlign: 'center' }}><div className="spinner"></div></td></tr>
            ) : internalData.length === 0 ? (
              <tr><td colSpan={columns.length + 1} style={{ padding: '30px', textAlign: 'center', color: 'var(--c-text-muted)' }}>Нет данных</td></tr>
            ) : (
              internalData.map((row, idx) => (
                <tr key={row.id || idx} style={{ borderBottom: '1px solid var(--c-border)', background: row.status === 'NG' ? 'var(--c-danger-muted)' : 'transparent' }}>
                  {columns.map(col => (
                    <td key={col.key} style={{ padding: '12px 16px' }} onClick={() => onEdit && onEdit(row)}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                  {(onDelete || onEdit) && (
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        {onEdit && <button onClick={() => onEdit(row)} style={{ color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>✎</button>}
                        {onDelete && <button onClick={() => onDelete(row.id)} style={{ color: 'var(--c-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>



      {/* Add Modal (Fallback) */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '400px', padding: '30px', borderRadius: 'var(--radius-lg)', background: 'var(--c-bg-surface)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}><h3 style={{ margin: 0, color: 'var(--c-text-primary)' }}>Новая запись</h3><button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--c-text-muted)' }}><X size={20} /></button></div>
             <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
               {columns.map(col => (
                 <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><label style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>{col.label}</label><input required className="glass" value={formData[col.key] || ''} onChange={(e) => setFormData({...formData, [col.key]: e.target.value})} style={{ padding: '10px', color: 'var(--c-text-primary)' }}/></div>
               ))}
               <button type="submit" style={{ marginTop: '10px', padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Сохранить</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
