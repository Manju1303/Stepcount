
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

  // Separate numbers and steps keyword when glued together without space (e.g., "5036steps" -> "5036 steps")
  cleaned = cleaned.replace(/(\d+)\s*(steps|step|stes|staps|stps|stpes|sleps)/gi, '$1 $2');
  cleaned = cleaned.replace(/(steps|step|stes|staps|stps|stpes|sleps)\s*[:=]?\s*(\d+)/gi, '$1 $2');

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

// Map common OCR letter misreadings in numeric contexts
const fixOcrDigits = (str) => {
  return str
    .replace(/[oO]/g, '0')
    .replace(/[lIi]/g, '1')
    .replace(/[zZ]/g, '2')
    .replace(/[sS]/g, '5')
    .replace(/[bB]/g, '6')
    .replace(/[gq]/g, '9');
};

export const tokenize = (text) => {
  const rawTokens = text.split(/\s+/).filter(t => t.trim() !== '');
  let tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    let t = rawTokens[i];

    // Filter out calendar years (e.g. 1990 - 2099)
    if (/^(19\d\d|20\d\d)$/.test(t)) {
      continue;
    }

    if (t === '.' || t === ',') continue;

    // Join numbers like "10" and "537" if they were split
    if (tokens.length > 0 && /^\d{1,2}$/.test(tokens[tokens.length - 1]) && /^\d{3}$/.test(t)) {
      tokens[tokens.length - 1] = tokens[tokens.length - 1] + t;
      continue;
    }

    // Correct digit-letter confusion if token looks like a step count (e.g. "so36", "5o31", "s031")
    if (/^[0-9oOlIiZzSsBb]{3,6}$/.test(t) && /\d/.test(t)) {
      t = fixOcrDigits(t);
    } else if (/^[sS][oO]\d{2,4}$/.test(t)) {
      // e.g. "so36" -> "5036"
      t = fixOcrDigits(t);
    }

    tokens.push(t);
  }
  return tokens;
};

const UNITS = ['cal', 'kcal', 'calories', 'mi', 'miles', 'km', 'kilometers', 'min', 'mins', 'minutes', 'bpm', 'kg', 'lbs', 'move'];
const GOAL_KEYWORDS = ['goal', 'goals', 'target', 'targets', 'aim', 'limit'];
const STEPS_KEYWORDS = [
  'steps', 'step', 'staps', 'stept', 'sleps', 'stepe', 'stps', 'slps',
  'stesp', 'sreps', 'siers', 's1eps', 'stes', 'stecs', 'steos', 'stees',
  'steds', 'stpes', 'stepcount', 'dailysteps', 'totalsteps'
];

export const isStepsKeyword = (word) => {
  const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (STEPS_KEYWORDS.includes(cleanWord)) {
    return true;
  }

  // Check Levenshtein distance to "steps"
  if (cleanWord.length >= 4 && cleanWord.length <= 6) {
    const distToSteps = getLevenshteinDistance(cleanWord, 'steps');
    if (distToSteps <= 2) {
      const exclusions = ['sleep', 'stops', 'stop', 'steep', 'stems', 'stars', 'strip', 'state', 'speed'];
      if (!exclusions.includes(cleanWord)) {
        return true;
      }
    }
  }
  
  // Check Levenshtein distance to "step"
  if (cleanWord.length === 3 || cleanWord.length === 4) {
    const distToStep = getLevenshteinDistance(cleanWord, 'step');
    if (distToStep <= 1) {
      const exclusions = ['stop', 'shop', 'ship', 'stem', 'site', 'star'];
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
      let isGoalValue = false;

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

          if (GOAL_KEYWORDS.includes(cleanNeighbor)) {
            const dist = Math.abs(offset);
            if (dist <= 2) {
              isGoalValue = true;
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
        if (isGoalValue) {
          // Deprioritize goal / daily target values so actual steps walked take precedence
          score = 3;
        } else if (stepsDistance === 1) {
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
      } else if (!isUnitValue && !isGoalValue) {
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
 * Generates date and time formatted in Asia/Kolkata (Indian Standard Time).
 */
export const getIstDateTime = (dateObj = new Date()) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dateObj);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(dateObj);
  const uploadedTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(dateObj);
  return { date, time, uploadedTime };
};

/**
 * Checks if a step submission has an identical step count recorded in the previous 90-day calendar window
 * by the SAME staff member.
 * - Restricted to the same staff_id.
 * - Previous-90-day window is calendar-date based: inclusive lower boundary, exclusive current date.
 * - Same-day submissions and future-dated records are excluded from repeat matching.
 */
export const detect90DayDuplicates = (newRecord, existingRecords, windowDays = 90) => {
  if (!newRecord || !newRecord.steps || !Array.isArray(existingRecords)) {
    return { isDuplicate: false, matches: [] };
  }

  const newStaffId = newRecord.staff_id || newRecord.staffId;
  const targetDateStr = newRecord.date || getIstDateTime().date;
  const targetMidnight = new Date(`${targetDateStr}T00:00:00Z`);
  const msInDay = 1000 * 60 * 60 * 24;

  const matches = existingRecords.filter(rec => {
    const recStaffId = rec.staff_id || rec.staffId;
    // 1. Only considered duplicate if the submission is from the SAME staff member
    if (!newStaffId || recStaffId !== newStaffId) return false;

    // 2. Exclude exact same submission record if re-checking
    if (rec.id && newRecord.id && rec.id === newRecord.id) return false;

    // 3. Same-day submissions are excluded from the 90-day repeat check
    if (rec.date === targetDateStr) return false;

    // 4. Check step count equality
    if (Number(rec.steps) !== Number(newRecord.steps)) return false;

    // 5. Calendar-date based 90-day window:
    // Future-dated records cannot become repeat matches (dayDiff <= 0)
    // Inclusive lower boundary (dayDiff <= windowDays)
    // Exclusive current date (dayDiff > 0)
    const recMidnight = new Date(`${rec.date}T00:00:00Z`);
    const dayDiff = Math.round((targetMidnight - recMidnight) / msInDay);
    return dayDiff > 0 && dayDiff <= windowDays;
  });

  return {
    isDuplicate: matches.length > 0,
    matches: matches.map(m => ({
      staff_id: m.staff_id || m.staffId,
      staffId: m.staff_id || m.staffId,
      name: m.name,
      dept: m.dept,
      steps: m.steps,
      date: m.date,
      time: m.uploaded_time || m.time || 'N/A'
    }))
  };
};

/**
 * Scans all step records and returns alerts for any step counts repeated by the SAME staff member
 * in the previous 90-day calendar window.
 */
export const findDuplicateAlertsInPeriod = (allRecords, windowDays = 90) => {
  if (!Array.isArray(allRecords) || allRecords.length === 0) return [];

  const alerts = [];
  const todayStr = getIstDateTime().date;
  const todayMidnight = new Date(`${todayStr}T00:00:00Z`);
  const msInDay = 1000 * 60 * 60 * 24;

  // Filter records within previous 90-day window up to today (excludes future dates)
  const recentRecords = allRecords.filter(r => {
    if (!r.date || !r.steps) return false;
    const recMidnight = new Date(`${r.date}T00:00:00Z`);
    const dayDiff = Math.round((todayMidnight - recMidnight) / msInDay);
    return dayDiff >= 0 && dayDiff <= windowDays;
  });

  // Group records by staffId first, then by step count for that same staff
  const staffStepGroups = {};
  recentRecords.forEach(rec => {
    const staffId = rec.staff_id || rec.staffId;
    const stepsKey = Number(rec.steps);
    if (!staffId || !stepsKey || isNaN(stepsKey)) return;

    if (!staffStepGroups[staffId]) staffStepGroups[staffId] = {};
    if (!staffStepGroups[staffId][stepsKey]) staffStepGroups[staffId][stepsKey] = [];
    staffStepGroups[staffId][stepsKey].push(rec);
  });

  // Identify duplicate occurrences (same staff member submitted identical step count on DIFFERENT dates)
  Object.keys(staffStepGroups).forEach(staffId => {
    const stepGroups = staffStepGroups[staffId];
    Object.keys(stepGroups).forEach(stepsStr => {
      const recordsWithSameSteps = stepGroups[stepsStr];
      // De-duplicate by date so multiple records on the same day don't count as 90-day repeats
      const dateMap = new Map();
      recordsWithSameSteps.forEach(r => {
        if (!dateMap.has(r.date)) dateMap.set(r.date, r);
      });
      const uniqueDateRecords = Array.from(dateMap.values());

      if (uniqueDateRecords.length > 1) {
        // Sort chronologically ascending (oldest first, newest last)
        uniqueDateRecords.sort((a, b) => new Date(`${a.date}T00:00:00Z`) - new Date(`${b.date}T00:00:00Z`));

        const firstRecord = uniqueDateRecords[0];
        const lastRecord = uniqueDateRecords[uniqueDateRecords.length - 1];

        const firstDate = new Date(`${firstRecord.date}T00:00:00Z`);
        const lastDate = new Date(`${lastRecord.date}T00:00:00Z`);
        const daysDifference = Math.round((lastDate - firstDate) / msInDay);

        if (daysDifference > 0 && daysDifference <= windowDays) {
          alerts.push({
            id: `dup-${staffId}-${lastRecord.date}-${stepsStr}`,
            staffId,
            staff_id: staffId,
            name: lastRecord.name || firstRecord.name,
            dept: lastRecord.dept || firstRecord.dept,
            steps: Number(stepsStr),
            isSameStaff: true,
            daysDifference,
            uploaderStaffIds: [staffId],
            firstUploaded: {
              id: firstRecord.id,
              staffId,
              staff_id: staffId,
              name: firstRecord.name,
              dept: firstRecord.dept,
              date: firstRecord.date,
              time: firstRecord.uploaded_time || firstRecord.time || 'N/A',
              timestampStr: `${firstRecord.date} at ${firstRecord.uploaded_time || firstRecord.time || 'N/A'}`
            },
            lastUploaded: {
              id: lastRecord.id,
              staffId,
              staff_id: staffId,
              name: lastRecord.name,
              dept: lastRecord.dept,
              date: lastRecord.date,
              time: lastRecord.uploaded_time || lastRecord.time || 'N/A',
              timestampStr: `${lastRecord.date} at ${lastRecord.uploaded_time || lastRecord.time || 'N/A'}`
            },
            allMatchedRecords: uniqueDateRecords.map(g => ({
              id: g.id,
              staffId,
              staff_id: staffId,
              name: g.name,
              dept: g.dept,
              date: g.date,
              time: g.uploaded_time || g.time || 'N/A'
            }))
          });
        }
      }
    });
  });

  return alerts.sort((a, b) => new Date(`${b.lastUploaded.date}T00:00:00Z`) - new Date(`${a.lastUploaded.date}T00:00:00Z`));
};



