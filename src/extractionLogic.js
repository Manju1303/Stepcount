
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
  let cleaned = text.toLowerCase();

  // Handle smartwatch goal slashes like "3500/10000" -> "3500 / 10000"
  cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 / $2');
  
  // Normalize thousand separators iteratively (handles comma, period, or space followed by exactly 3 digits)
  // E.g., "5,117" -> "5117", "5.117" -> "5117", "5 117" -> "5117", "5. 117" -> "5117"
  const separatorRegex = /\b(\d{1,3})\s*[.,\s]\s*(\d{3})\b/g;
  while (separatorRegex.test(cleaned)) {
    cleaned = cleaned.replace(separatorRegex, '$1$2');
  }
  
  // Remove remaining commas
  cleaned = cleaned.replace(/,/g, '');
  
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

      // Check neighbors in range [-5, 5] to identify context
      for (let offset = -5; offset <= 5; offset++) {
        if (offset === 0) continue;
        const neighbor = tokens[i + offset];
        if (neighbor) {
          // Normalize neighbor by removing non-alphabetic characters (e.g. "steps:" -> "steps")
          const cleanNeighbor = neighbor.toLowerCase().replace(/[^a-z0-9]/g, '');

          if (UNITS.includes(cleanNeighbor)) {
            const dist = Math.abs(offset);
            // Units only apply to a value if they are directly adjacent (dist <= 2)
            // This prevents column layout cross-talk where a unit in another column is mistaken for this value's unit.
            if (dist <= 2) {
              isUnitValue = true;
              if (dist < unitDistance) {
                unitDistance = dist;
              }
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
          score = 9;
        } else if (stepsDistance === 3) {
          score = 8;
        } else if (stepsDistance === 4) {
          score = 7;
        } else {
          score = 6;
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

/**
 * Checks if a step submission has an identical step count recorded in the last N days (default 90 days).
 */
export const detect90DayDuplicates = (newRecord, existingRecords, windowDays = 90) => {
  if (!newRecord || !newRecord.steps || !Array.isArray(existingRecords)) {
    return { isDuplicate: false, matches: [] };
  }

  const targetDate = newRecord.date ? new Date(newRecord.date) : new Date();
  const msInDay = 1000 * 60 * 60 * 24;

  const matches = existingRecords.filter(rec => {
    // Exclude exact same submission record if re-checking
    if (rec.id && newRecord.id && rec.id === newRecord.id) return false;
    // Exclude same staff member on the exact same date
    if (rec.staff_id === newRecord.staff_id && rec.date === newRecord.date) return false;

    // Check step count equality
    if (Number(rec.steps) !== Number(newRecord.steps)) return false;

    // Check 90-day window
    const recDate = new Date(rec.date);
    const dayDiff = Math.abs((targetDate - recDate) / msInDay);
    return dayDiff <= windowDays;
  });

  return {
    isDuplicate: matches.length > 0,
    matches: matches.map(m => ({
      staff_id: m.staff_id,
      name: m.name,
      dept: m.dept,
      steps: m.steps,
      date: m.date,
      time: m.uploaded_time || m.time || 'N/A'
    }))
  };
};

/**
 * Scans all step records and returns alerts for any step counts repeated across staff members or dates in the last 90 days.
 */
export const findDuplicateAlertsInPeriod = (allRecords, windowDays = 90) => {
  if (!Array.isArray(allRecords) || allRecords.length === 0) return [];

  const alerts = [];
  const now = new Date();
  const msInDay = 1000 * 60 * 60 * 24;

  // Filter records within last 90 days
  const recentRecords = allRecords.filter(r => {
    if (!r.date) return false;
    const recDate = new Date(r.date);
    const daysAgo = (now - recDate) / msInDay;
    return daysAgo >= -1 && daysAgo <= windowDays; // Includes today & up to 90 days prior
  });

  // Group records by step count
  const stepGroups = {};
  recentRecords.forEach(rec => {
    const stepsKey = Number(rec.steps);
    if (!stepsKey || isNaN(stepsKey)) return;
    if (!stepGroups[stepsKey]) stepGroups[stepsKey] = [];
    stepGroups[stepsKey].push(rec);
  });

  // Identify duplicate occurrences (same step count submitted by same or different staff on different dates)
  Object.keys(stepGroups).forEach(stepsStr => {
    const group = stepGroups[stepsStr];
    if (group.length > 1) {
      // Sort chronologically ascending (oldest first, newest last)
      group.sort((a, b) => new Date(a.date) - new Date(b.date));

      const firstRecord = group[0];
      const lastRecord = group[group.length - 1];

      // Calculate date difference in days
      const firstDate = new Date(firstRecord.date);
      const lastDate = new Date(lastRecord.date);
      const daysDifference = Math.round(Math.abs((lastDate - firstDate) / msInDay));

      const isSameStaff = firstRecord.staff_id === lastRecord.staff_id;

      alerts.push({
        id: `dup-${lastRecord.id || lastRecord.staff_id}-${lastRecord.date}-${stepsStr}`,
        steps: Number(stepsStr),
        isSameStaff,
        daysDifference,
        firstUploaded: {
          id: firstRecord.id,
          staffId: firstRecord.staff_id,
          name: firstRecord.name,
          dept: firstRecord.dept,
          date: firstRecord.date,
          time: firstRecord.uploaded_time || firstRecord.time || 'N/A',
          timestampStr: `${firstRecord.date} at ${firstRecord.uploaded_time || firstRecord.time || 'N/A'}`
        },
        lastUploaded: {
          id: lastRecord.id,
          staffId: lastRecord.staff_id,
          name: lastRecord.name,
          dept: lastRecord.dept,
          date: lastRecord.date,
          time: lastRecord.uploaded_time || lastRecord.time || 'N/A',
          timestampStr: `${lastRecord.date} at ${lastRecord.uploaded_time || lastRecord.time || 'N/A'}`
        },
        allMatchedRecords: group.map(g => ({
          id: g.id,
          staffId: g.staff_id,
          name: g.name,
          dept: g.dept,
          date: g.date,
          time: g.uploaded_time || g.time || 'N/A'
        }))
      });
    }
  });

  return alerts.sort((a, b) => new Date(b.lastUploaded.date) - new Date(a.lastUploaded.date));
};



