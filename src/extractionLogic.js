
export const cleanText = (text) => {
  return text.toLowerCase().replace(/,/g, '');
};

export const tokenize = (text) => {
  const rawTokens = text.split(/\s+/).filter(t => t.trim() !== '');
  let tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];

    if (/^(2023|2024|2025|2026)$/.test(t)) {
      continue;
    }

    if (t === '.' || t === ',') continue;

    // Join numbers like "10" and "537" if they were split
    if (tokens.length > 0 && /^\d{1,2}$/.test(tokens[tokens.length - 1]) && /^\d{3}$/.test(t)) {
      tokens[tokens.length - 1] = tokens[tokens.length - 1] + t;
      continue;
    }

    tokens.push(t);
  }
  return tokens;
};

const UNITS = ['cal', 'kcal', 'calories', 'mi', 'miles', 'km', 'kilometers', 'min', 'mins', 'minutes', 'bpm', 'kg', 'lbs', 'move'];

export const extractSteps = (tokens) => {
  let potentialSteps = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    
    // Check if token is a whole number
    if (/^\d+$/.test(t)) {
      const val = parseInt(t);
      if (val > 150000) continue; // Out of range

      let isUnitValue = false;
      
      // Look around (distance 1 and 2) for units to ignore
      const neighbors = [
        tokens[i - 1], tokens[i + 1],
        tokens[i - 2], tokens[i + 2]
      ];

      for (const n of neighbors) {
        if (n && UNITS.includes(n.toLowerCase())) {
          isUnitValue = true;
          break;
        }
      }

      // Special case: if "steps" is also nearby, it might be steps even if other units are near (unlikely but possible)
      const isStepsLabeled = (tokens[i-1] === 'steps' || tokens[i+1] === 'steps');
      
      if (isUnitValue && !isStepsLabeled) {
        continue;
      }
      
      potentialSteps.push(val);
    }
  }

  if (potentialSteps.length > 0) {
    // Priority 1: Numbers labeled with "steps"
    // (None in this basic implementation, we just use the candidates)
    
    const stepsCandidates = potentialSteps.filter(n => n > 100);
    if (stepsCandidates.length > 0) {
      return Math.max(...stepsCandidates);
    } else {
      return Math.max(...potentialSteps);
    }
  }
  return 0;
};
