
import { describe, it, expect } from 'vitest';
import { cleanText, tokenize, extractSteps, detect90DayDuplicates, findDuplicateAlertsInPeriod } from '../src/extractionLogic';

describe('Step Count Extraction Logic', () => {

  it('should correctly extract steps from the provided screenshot scenario', () => {
    const ocrText = "6 5,537 Heart Pts Steps 1,548 Cal 2.02 mi 65 Move Min";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    // 5,537 should be extracted. 
    // 1,548 Cal -> 1548 should be ignored.
    // 2.02 mi -> 2.02 (not a whole number) or ignored.
    // 65 Move Min -> 65 should be ignored.
    // 6 is < 100, so 5537 should be the max.
    expect(steps).toBe(5537);
  });

  it('should ignore calorie values even if they are larger than steps (edge case)', () => {
    const ocrText = "Steps: 3,000 Calories: 4,500 kcal";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    // 4500 is followed by kcal, so it should be ignored.
    expect(steps).toBe(3000);
  });

  it('should handle small phone layout where text might be cramped', () => {
    const ocrText = "STEPS 8421 CAL 210 MI 3.4";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(8421);
  });

  it('should handle system/web view layouts', () => {
    const ocrText = "Daily Activity Summary: 12500 steps taken today. Goal: 10000. Calories burned: 450.";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(12500);
  });

  it('should correctly handle comma separated numbers', () => {
    const ocrText = "You walked 10,245 steps today!";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(10245);
  });

  it('should handle small step counts labeled with steps', () => {
    const ocrText = "Active steps today: 84";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(84);
  });

  it('should prioritize steps count even with spelling errors from OCR', () => {
    const ocrText = "today sreps 10245 cal 450";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(10245);
  });

  it('should ignore punctuation attached to steps keyword', () => {
    const ocrText = "active stps: 6542";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(6542);
  });

  it('should prioritize step-labeled number over unlabeled clock times', () => {
    const ocrText = "1035 siers 12500";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    
    expect(steps).toBe(12500);
  });

  it('should handle period thousand separators', () => {
    const ocrText = "steps: 12.560 kcal: 450";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(12560);
  });

  it('should fuzzy match step keywords with typos', () => {
    const ocrText = "stcps 8420 calories 350";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(8420);
  });

  it('should ignore calorie and distance numbers even with period normalizations', () => {
    const ocrText = "steps 10.537 distance 2.020 mi cal 350.250";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(10537);
  });

  it('should handle very large step counts', () => {
    const ocrText = "steps: 124,560";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(124560);
  });

  it('should correctly extract steps from Google Fit circular ring layout with thousand separator period', () => {
    const ocrText = "37 5.117 Heart Pts Steps 1.619 Cal 2.2 mi 48 Move Min";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(5117);
  });

  it('should not treat steps as a unit value if a unit keyword is far away (> 2 tokens)', () => {
    const ocrText = "5117 Heart Pts Steps 1619 Cal";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(5117);
  });

  it('should handle thousand separators with extra spaces or different symbols', () => {
    const ocrText = "steps: 5. 117 or 12 500 steps";
    
    const cleaned1 = cleanText("steps: 5. 117");
    const steps1 = extractSteps(tokenize(cleaned1));
    expect(steps1).toBe(5117);
    
    const cleaned2 = cleanText("12 500 steps");
    const steps2 = extractSteps(tokenize(cleaned2));
    expect(steps2).toBe(12500);
  });

  it('should correctly extract steps from smartwatch display with goal ratio slash like 3500/10000', () => {
    const ocrText = "STEPS 3500/10000 45 CAL 30 MIN";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(3500);
  });

  it('should correct OCR digit-letter confusions like so36 next to stes keyword', () => {
    const ocrText = "daily report so36 stes 0.53 km";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(5036);
  });

  it('should handle steps glued directly to digits without space like 5036steps', () => {
    const ocrText = "active 5036steps today 45 cal";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(5036);
  });

  it('should handle steps keyword with colon like steps:6250', () => {
    const ocrText = "Steps:6250 Cal:240 Distance:4.2km";
    const cleaned = cleanText(ocrText);
    const tokens = tokenize(cleaned);
    const steps = extractSteps(tokens);
    expect(steps).toBe(6250);
  });
});

describe('90-Day Duplicate Step Count Detection System', () => {
  const existingRecords = [
    { id: 1, staff_id: 'cse001', name: 'Dr. N. Sathyabalaji', dept: 'CSE', steps: 8520, date: '2026-08-01', uploaded_time: '09:30 AM' },
    { id: 2, staff_id: 'it001', name: 'Mr. S. Pradeepan', dept: 'IT', steps: 10450, date: '2026-08-10', uploaded_time: '10:15 AM' },
    { id: 3, staff_id: 'cse002', name: 'Mr. E. Ananth', dept: 'CSE', steps: 6200, date: '2026-06-01', uploaded_time: '08:00 AM' }
  ];

  it('should detect duplicate step count submitted within 90 days by another staff member', () => {
    const newSubmission = {
      staff_id: 'ece001',
      name: 'Mr. A. Vigneshkumar',
      dept: 'ECE',
      steps: 8520,
      date: '2026-08-28',
      uploaded_time: '11:00 AM'
    };

    const result = detect90DayDuplicates(newSubmission, existingRecords, 90);
    expect(result.isDuplicate).toBe(true);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].name).toBe('Dr. N. Sathyabalaji');
    expect(result.matches[0].steps).toBe(8520);
  });

  it('should ignore matching step counts outside the 90-day window', () => {
    const newSubmission = {
      staff_id: 'ece002',
      name: 'Mrs. U. Sasikala',
      dept: 'ECE',
      steps: 6200, // Matches record #3 from 2026-06-01 (~88 days ago if now is Aug 28, but let's test 100 days)
      date: '2026-09-20',
      uploaded_time: '02:00 PM'
    };

    const result = detect90DayDuplicates(newSubmission, existingRecords, 90);
    expect(result.isDuplicate).toBe(false);
  });

  it('should generate admin duplicate alerts with first and last uploaded timestamps', () => {
    const allRecords = [
      ...existingRecords,
      { id: 4, staff_id: 'cse001', name: 'Dr. N. Sathyabalaji', dept: 'CSE', steps: 8520, date: '2026-08-28', uploaded_time: '11:30 AM' }
    ];

    const alerts = findDuplicateAlertsInPeriod(allRecords, 90);
    expect(alerts.length).toBe(1);
    expect(alerts[0].steps).toBe(8520);
    expect(alerts[0].isSameStaff).toBe(true);
    expect(alerts[0].uploaderStaffIds).toEqual(['cse001']);
    expect(alerts[0].firstUploaded.staffId).toBe('cse001');
    expect(alerts[0].firstUploaded.name).toBe('Dr. N. Sathyabalaji');
    expect(alerts[0].firstUploaded.date).toBe('2026-08-01');
    expect(alerts[0].firstUploaded.timestampStr).toBe('2026-08-01 at 09:30 AM');
    expect(alerts[0].lastUploaded.staffId).toBe('cse001');
    expect(alerts[0].lastUploaded.name).toBe('Dr. N. Sathyabalaji');
    expect(alerts[0].lastUploaded.date).toBe('2026-08-28');
    expect(alerts[0].lastUploaded.timestampStr).toBe('2026-08-28 at 11:30 AM');
    expect(alerts[0].daysDifference).toBe(27);
  });
});



