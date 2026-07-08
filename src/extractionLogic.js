
export const getLevenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

export const cleanText = (text) => {
  let cleaned = text.toLowerCase().replace(/,/g, '');
  // Replace periods that act as thousand separators (followed by exactly 3 digits and no more digits)
  cleaned = cleaned.replace(/(\d+)\.(\d{3})(?!\d)/g, '$1$2');
  return cleaned;
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
const STEPS_KEYWORDS = ['steps', 'step', 'staps', 'stept', 'sleps', 'stepe', 'stps', 'slps', 'stept', 'stesp', 'sreps', 'siers', 's1eps'];

export const isStepsKeyword = (word) => {
  const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (STEPS_KEYWORDS.includes(cleanWord)) {
    return true;
  }

  // Check Levenshtein distance to "steps"
  if (cleanWord.length >= 4 && cleanWord.length <= 6) {
    const distToSteps = getLevenshteinDistance(cleanWord, 'steps');
    if (distToSteps <= 2) {
      const exclusions = ['sleep', 'stops', 'stop', 'steep', 'stems', 'stars', 'strip', 'state'];
      if (!exclusions.includes(cleanWord)) {
        return true;
      }
    }
  }
  
  // Check Levenshtein distance to "step"
  if (cleanWord.length === 3 || cleanWord.length === 4) {
    const distToStep = getLevenshteinDistance(cleanWord, 'step');
    if (distToStep <= 1) {
      const exclusions = ['stop', 'shop', 'ship', 'stem', 'site'];
      if (!exclusions.includes(cleanWord)) {
        return true;
      }
    }
  }

  return false;
};

export const extractSteps = (tokens) => {
  let candidates = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Check if token is a whole number
    if (/^\d+$/.test(t)) {
      const val = parseInt(t);
      if (val > 150000 || val < 1) continue; // Out of range

      let isUnitValue = false;
      let unitDistance = 99;
      let hasStepsKeyword = false;
      let stepsDistance = 99;

      // Check neighbors in range [-3, 3] to identify context
      for (let offset = -3; offset <= 3; offset++) {
        if (offset === 0) continue;
        const neighbor = tokens[i + offset];
        if (neighbor) {
          // Normalize neighbor by removing non-alphabetic characters (e.g. "steps:" -> "steps")
          const cleanNeighbor = neighbor.toLowerCase().replace(/[^a-z0-9]/g, '');

          if (UNITS.includes(cleanNeighbor)) {
            isUnitValue = true;
            const dist = Math.abs(offset);
            if (dist < unitDistance) {
              unitDistance = dist;
            }
          }

          if (isStepsKeyword(cleanNeighbor)) {
            hasStepsKeyword = true;
            const dist = Math.abs(offset);
            if (dist < stepsDistance) {
              stepsDistance = dist;
            }
          }
        }
      }

      let score = 0;
      // Only recognize steps keyword if it is closer or equal to any unit keyword (prevent calorie/distance confusion)
      if (hasStepsKeyword && stepsDistance <= unitDistance) {
        if (stepsDistance === 1) {
          score = 10;
        } else if (stepsDistance === 2) {
          score = 8;
        } else {
          score = 5;
        }
      } else if (!isUnitValue) {
        // Unlabeled candidate: give higher weight if it looks like a typical step count
        score = val >= 100 ? 1 : 0.1;
      }

      if (score > 0) {
        candidates.push({ val, score });
      }
    }
  }

  if (candidates.length === 0) {
    return 0;
  }

  // Find the highest score among all candidates
  const maxScore = Math.max(...candidates.map(c => c.score));

  if (maxScore >= 5) {
    // If we have step-labeled candidates, return the maximum value among them
    const labeledCandidates = candidates.filter(c => c.score >= 5);
    return Math.max(...labeledCandidates.map(c => c.val));
  } else {
    // Otherwise, return the maximum value of the unlabeled candidates (score >= 1)
    const unlabeledCandidates = candidates.filter(c => c.score >= 1);
    if (unlabeledCandidates.length > 0) {
      return Math.max(...unlabeledCandidates.map(c => c.val));
    }
  }

  // Fallback to the absolute maximum of whatever is left (e.g. values < 100)
  return Math.max(...candidates.map(c => c.val));
};

