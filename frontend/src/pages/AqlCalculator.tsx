import { useState, useEffect } from 'react';
import { Calculator, Info, CheckCircle, AlertTriangle } from 'lucide-react';

// ISO 2859-1 Sample Size Code Letters
const CODE_LETTERS: any = [
  { min: 2, max: 8, levels: { s1: 'A', s2: 'A', s3: 'A', s4: 'A', i: 'A', ii: 'A', iii: 'B' } },
  { min: 9, max: 15, levels: { s1: 'A', s2: 'A', s3: 'A', s4: 'A', i: 'A', ii: 'B', iii: 'C' } },
  { min: 16, max: 25, levels: { s1: 'A', s2: 'A', s3: 'B', s4: 'B', i: 'B', ii: 'C', iii: 'D' } },
  { min: 26, max: 50, levels: { s1: 'A', s2: 'B', s3: 'B', s4: 'C', i: 'C', ii: 'D', iii: 'E' } },
  { min: 51, max: 90, levels: { s1: 'B', s2: 'B', s3: 'C', s4: 'C', i: 'C', ii: 'E', iii: 'F' } },
  { min: 91, max: 150, levels: { s1: 'B', s2: 'C', s3: 'C', s4: 'D', i: 'D', ii: 'F', iii: 'G' } },
  { min: 151, max: 280, levels: { s1: 'B', s2: 'C', s3: 'D', s4: 'E', i: 'E', ii: 'G', iii: 'H' } },
  { min: 281, max: 500, levels: { s1: 'B', s2: 'C', s3: 'D', s4: 'E', i: 'F', ii: 'H', iii: 'J' } },
  { min: 501, max: 1200, levels: { s1: 'C', s2: 'C', s3: 'E', s4: 'F', i: 'G', ii: 'J', iii: 'K' } },
  { min: 1201, max: 3200, levels: { s1: 'C', s2: 'D', s3: 'E', s4: 'G', i: 'H', ii: 'K', iii: 'L' } },
  { min: 3201, max: 10000, levels: { s1: 'C', s2: 'D', s3: 'F', s4: 'H', i: 'J', ii: 'L', iii: 'M' } },
  { min: 10001, max: 35000, levels: { s1: 'C', s2: 'D', s3: 'G', s4: 'J', i: 'K', ii: 'M', iii: 'N' } },
  { min: 35001, max: 150000, levels: { s1: 'D', s2: 'E', s3: 'G', s4: 'K', i: 'L', ii: 'N', iii: 'P' } },
  { min: 150001, max: 500000, levels: { s1: 'D', s2: 'E', s3: 'H', s4: 'L', i: 'M', ii: 'P', iii: 'Q' } },
  { min: 500001, max: Infinity, levels: { s1: 'D', s2: 'E', s3: 'H', s4: 'M', i: 'N', ii: 'Q', iii: 'R' } },
];

const SAMPLE_SIZES: any = {
  A: 2, B: 3, C: 5, D: 8, E: 13, F: 20, G: 32, H: 50, J: 80, K: 125, L: 200, M: 315, N: 500, P: 800, Q: 1250, R: 2000
};

// Simplified AQL Table (Normal Inspection, Single Sampling)
// Structure: [CodeLetter]: { [AQL]: [Ac, Re] }
const AQL_TABLE: any = {
  A: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [0,1], 1.0: [0,1], 1.5: [0,1], 2.5: [0,1], 4.0: [0,1], 6.5: [0,1] },
  B: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [0,1], 1.0: [0,1], 1.5: [0,1], 2.5: [0,1], 4.0: [0,1], 6.5: [0,1] },
  C: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [0,1], 1.0: [0,1], 1.5: [0,1], 2.5: [0,1], 4.0: [1,2], 6.5: [1,2] },
  D: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [0,1], 1.0: [0,1], 1.5: [0,1], 2.5: [1,2], 4.0: [1,2], 6.5: [2,3] },
  E: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [0,1], 1.0: [0,1], 1.5: [1,2], 2.5: [1,2], 4.0: [2,3], 6.5: [3,4] },
  F: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [0,1], 1.0: [1,2], 1.5: [1,2], 2.5: [2,3], 4.0: [3,4], 6.5: [5,6] },
  G: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [0,1], 0.65: [1,2], 1.0: [1,2], 1.5: [2,3], 2.5: [3,4], 4.0: [5,6], 6.5: [7,8] },
  H: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [0,1], 0.40: [1,2], 0.65: [1,2], 1.0: [2,3], 1.5: [3,4], 2.5: [5,6], 4.0: [7,8], 6.5: [10,11] },
  J: { 0.065: [0,1], 0.10: [0,1], 0.15: [0,1], 0.25: [1,2], 0.40: [1,2], 0.65: [2,3], 1.0: [3,4], 1.5: [5,6], 2.5: [7,8], 4.0: [10,11], 6.5: [14,15] },
  K: { 0.065: [0,1], 0.10: [0,1], 0.15: [1,2], 0.25: [1,2], 0.40: [2,3], 0.65: [3,4], 1.0: [5,6], 1.5: [7,8], 2.5: [10,11], 4.0: [14,15], 6.5: [21,22] },
  L: { 0.065: [0,1], 0.10: [1,2], 0.15: [1,2], 0.25: [2,3], 0.40: [3,4], 0.65: [5,6], 1.0: [7,8], 1.5: [10,11], 2.5: [14,15], 4.0: [21,22], 6.5: [21,22] },
  M: { 0.065: [1,2], 0.10: [1,2], 0.15: [2,3], 0.25: [3,4], 0.40: [5,6], 0.65: [7,8], 1.0: [10,11], 1.5: [14,15], 2.5: [21,22], 4.0: [21,22], 6.5: [21,22] },
  N: { 0.065: [1,2], 0.10: [2,3], 0.15: [3,4], 0.25: [5,6], 0.40: [7,8], 0.65: [10,11], 1.0: [14,15], 1.5: [21,22], 2.5: [21,22], 4.0: [21,22], 6.5: [21,22] },
  P: { 0.065: [2,3], 0.10: [3,4], 0.15: [5,6], 0.25: [7,8], 0.40: [10,11], 0.65: [14,15], 1.0: [21,22], 1.5: [21,22], 2.5: [21,22], 4.0: [21,22], 6.5: [21,22] },
  Q: { 0.065: [3,4], 0.10: [5,6], 0.15: [7,8], 0.25: [10,11], 0.40: [14,15], 0.65: [21,22], 1.0: [21,22], 1.5: [21,22], 2.5: [21,22], 4.0: [21,22], 6.5: [21,22] },
  R: { 0.065: [5,6], 0.10: [7,8], 0.15: [10,11], 0.25: [14,15], 0.40: [21,22], 0.65: [21,22], 1.0: [21,22], 1.5: [21,22], 2.5: [21,22], 4.0: [21,22], 6.5: [21,22] },
};

export const AqlCalculator = () => {
  const [lotSize, setLotSize] = useState<number | ''>(1000);
  const [level, setLevel] = useState<string>('ii');
  const [aql, setAql] = useState<number>(1.0);
  
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    calculate();
  }, [lotSize, level, aql]);

  const calculate = () => {
    if (!lotSize || lotSize < 2) {
      setResult(null);
      return;
    }

    const range = CODE_LETTERS.find((r: any) => lotSize >= r.min && lotSize <= r.max);
    if (!range) return;

    const letter = range.levels[level];
    const sampleSize = SAMPLE_SIZES[letter];
    const limits = AQL_TABLE[letter][aql];

    setResult({
      letter,
      sampleSize,
      ac: limits[0],
      re: limits[1]
    });
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--c-accent)', padding: '12px', borderRadius: '12px', color: '#000' }}>
          <Calculator size={28} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--c-text-primary)' }}>Калькулятор AQL</h1>
          <p style={{ margin: 0, color: 'var(--c-text-secondary)', fontSize: '0.9rem' }}>ISO 2859-1 (ГОСТ Р ИСО 2859-1-2007)</p>
        </div>
      </div>

      <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '30px' }}>
        {/* Inputs */}
        <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Размер партии (Lot Size)</label>
            <input 
              type="number" className="glass" value={lotSize} onChange={e => setLotSize(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ width: '100%', padding: '12px', fontSize: '1.1rem', color: 'var(--c-accent)', fontWeight: 'bold', border: '1px solid var(--c-border)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Уровень контроля (Level)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {['i', 'ii', 'iii'].map(l => (
                <button 
                  key={l} onClick={() => setLevel(l)}
                  style={{ 
                    padding: '10px', borderRadius: '6px', border: '1px solid var(--c-border)', cursor: 'pointer',
                    background: level === l ? 'var(--c-accent)' : 'transparent',
                    color: level === l ? '#000' : 'var(--c-text-primary)',
                    fontWeight: 'bold', textTransform: 'uppercase'
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--c-text-muted)', fontStyle: 'italic' }}>
              * II - Основной уровень
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Уровень AQL (Acceptance Quality Limit)</label>
            <select 
              className="glass" value={aql} onChange={e => setAql(Number(e.target.value))}
              style={{ width: '100%', padding: '12px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)', fontSize: '1rem' }}
            >
              {[0.065, 0.10, 0.15, 0.25, 0.40, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5].map(v => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {result ? (
            <div className="glass-panel" style={{ padding: '30px', border: '1px solid var(--c-accent)', boxShadow: '0 0 30px rgba(0,255,136,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h3 style={{ margin: 0 }}>Результат расчета</h3>
                <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--c-accent)' }}>{result.letter}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--c-border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Объем выборки</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--c-accent)' }}>{result.sampleSize}</div>
                  <div style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>шт. для проверки</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(0,255,136,0.05)', borderRadius: '8px', border: '1px solid var(--c-success)' }}>
                    <span style={{ color: 'var(--c-success)', fontWeight: 'bold' }}>Ac (Приемочное)</span>
                    <span style={{ fontWeight: 'bold' }}>{result.ac}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,71,87,0.05)', borderRadius: '8px', border: '1px solid var(--c-danger)' }}>
                    <span style={{ color: 'var(--c-danger)', fontWeight: 'bold' }}>Re (Браковочное)</span>
                    <span style={{ fontWeight: 'bold' }}>{result.re}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderLeft: '3px solid var(--c-accent)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Info size={16} color="var(--c-accent)" style={{ marginTop: '2' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--c-text-secondary)', lineHeight: '1.5' }}>
                    При обнаружении <b>{result.ac}</b> и менее дефектов — партия <b>принимается</b>.<br />
                    При обнаружении <b>{result.re}</b> и более дефектов — партия <b>бракуется</b>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px', opacity: 0.5 }}>
              <Calculator size={48} />
              <span>Введите корректный размер партии</span>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--c-text-primary)' }}>Быстрые подсказки:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <CheckCircle size={14} color="var(--c-success)" />
                <span><b>Level II:</b> Стандартный уровень для большинства проверок.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <AlertTriangle size={14} color="var(--c-warning)" />
                <span><b>AQL 1.0:</b> Рекомендуемый уровень для критических дефектов.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <AlertTriangle size={14} color="var(--c-warning)" />
                <span><b>AQL 2.5 / 4.0:</b> Рекомендуемый уровень для незначительных дефектов.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--c-text-muted)', textAlign: 'center' }}>
        Данный расчет произведен по стандарту <b>Single Sampling Plans for Normal Inspection</b>.
      </div>
    </div>
  );
};
