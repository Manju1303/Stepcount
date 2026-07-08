
import { describe, it, expect } from 'vitest';
import { cleanText, tokenize, extractSteps } from '../src/extractionLogic';

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
});

