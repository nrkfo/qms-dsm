// ISO 2859-1 AQL Calculation Logic

export function getLetterFromTable1(qty: number, level: string): string {
  const table: Record<string, string[]> = {
    'I':  ['A','A','B','C','C','D','E','F','G','H','J','K','L','M','N'],
    'II': ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q'],
    'III':['B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R']
  };
  const ranges = [8, 15, 25, 50, 90, 150, 280, 500, 1200, 3200, 10000, 35000, 150000, 500000, Infinity];
  const idx = ranges.findIndex(r => qty <= r);
  return table[level][idx] || "A";
}

export function getAQLPlanWithArrows(letter: string, aql: string) {
  const sizes: Record<string, number> = {'A':2,'B':3,'C':5,'D':8,'E':13,'F':20,'G':32,'H':50,'J':80,'K':125,'L':200,'M':315,'N':500,'P':800,'Q':1250,'R':2000};
  const table: Record<string, Record<string, number[]>> = {
    '0.065': {'L':[0,1],'M':[0,1],'N':[0,1],'P':[1,2],'Q':[2,3],'R':[3,4]},
    '0.1':   {'K':[0,1],'L':[0,1],'M':[0,1],'N':[1,2],'P':[2,3],'Q':[3,4],'R':[5,6]},
    '0.15':  {'J':[0,1],'K':[0,1],'L':[0,1],'M':[1,2],'N':[2,3],'P':[3,4],'Q':[5,6],'R':[7,8]},
    '0.25':  {'H':[0,1],'J':[0,1],'K':[0,1],'L':[1,2],'M':[2,3],'N':[3,4],'P':[5,6],'Q':[7,8],'R':[10,11]},
    '0.4':   {'G':[0,1],'H':[0,1],'J':[0,1],'K':[1,2],'L':[2,3],'M':[3,4],'N':[5,6],'P':[7,8],'Q':[10,11],'R':[14,15]},
    '0.65':  {'F':[0,1],'G':[0,1],'H':[0,1],'J':[1,2],'K':[2,3],'L':[3,4],'M':[5,6],'N':[7,8],'P':[10,11],'Q':[14,15],'R':[21,22]},
    '1.0':   {'E':[0,1],'F':[0,1],'G':[0,1],'H':[1,2],'J':[2,3],'K':[3,4],'L':[5,6],'M':[7,8],'N':[10,11],'P':[14,15],'Q':[21,22]},
    '1.5':   {'D':[0,1],'E':[0,1],'F':[0,1],'G':[1,2],'H':[2,3],'J':[3,4],'K':[5,6],'L':[7,8],'M':[10,11],'N':[14,15],'P':[21,22]},
    '2.5':   {'C':[0,1],'D':[0,1],'E':[0,1],'F':[1,2],'G':[2,3],'H':[3,4],'J':[5,6],'K':[7,8],'L':[10,11],'M':[14,15],'N':[21,22]},
    '4.0':   {'B':[0,1],'C':[0,1],'D':[1,2],'E':[1,2],'F':[2,3],'G':[3,4],'H':[5,6],'J':[7,8],'K':[10,11],'L':[14,15],'M':[21,22]},
    '4':     {'B':[0,1],'C':[0,1],'D':[1,2],'E':[1,2],'F':[2,3],'G':[3,4],'H':[5,6],'J':[7,8],'K':[10,11],'L':[14,15],'M':[21,22]},
    '6.5':   {'A':[0,1],'B':[0,1],'C':[1,2],'D':[2,3],'E':[2,3],'F':[3,4],'G':[5,6],'H':[7,8],'J':[10,11],'K':[14,15],'L':[21,22]}
  };
  const aqlCol = table[aql];
  if (!aqlCol) return null;
  const letters = Object.keys(sizes);
  const idx = letters.indexOf(letter);
  for (let i = idx; i < letters.length; i++) if (aqlCol[letters[i]]) return { letter: letters[i], size: sizes[letters[i]], ac: aqlCol[letters[i]][0], re: aqlCol[letters[i]][1] };
  for (let i = idx; i >= 0; i--) if (aqlCol[letters[i]]) return { letter: letters[i], size: sizes[letters[i]], ac: aqlCol[letters[i]][0], re: aqlCol[letters[i]][1] };
  return null;
}
