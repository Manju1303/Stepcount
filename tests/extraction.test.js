
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
});
