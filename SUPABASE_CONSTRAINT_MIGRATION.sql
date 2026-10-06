-- ==============================================================================
-- DATABASE MIGRATION SCRIPT: SUPABASE CONSTRAINT & PERFORMANCE INDEXES
-- Project: Staff Fit - Faculty Step Count Monitoring System
-- Target Table: public.step_records
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: Diagnostic Query to Inspect Existing Duplicate (staff_id, date) Records
-- Run this block first to check if any duplicate entries currently exist in the database.
-- ------------------------------------------------------------------------------
SELECT 
    staff_id, 
    date, 
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id) as record_ids,
    ARRAY_AGG(steps) as step_values
FROM 
    public.step_records
GROUP BY 
    staff_id, date
HAVING 
    COUNT(*) > 1
ORDER BY 
    duplicate_count DESC, date DESC;


-- ------------------------------------------------------------------------------
-- STEP 2: Duplicate Remediation (Keeps the record with the highest step count or latest id)
-- If STEP 1 returns any rows, execute this cleanup query before applying the UNIQUE constraint.
-- ------------------------------------------------------------------------------
DELETE FROM public.step_records
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY staff_id, date 
                ORDER BY steps DESC, id DESC
            ) as row_num
        FROM public.step_records
    ) duplicates
    WHERE duplicates.row_num > 1
);


-- ------------------------------------------------------------------------------
-- STEP 3: Apply UNIQUE Constraint on (staff_id, date)
-- Strictly prevents race-condition double submissions per staff member per calendar day.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_staff_date' 
          AND table_name = 'step_records'
    ) THEN
        ALTER TABLE public.step_records 
        ADD CONSTRAINT unique_staff_date UNIQUE (staff_id, date);
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- STEP 4: Create Composite Index for 90-Day Repeated Step Count Queries
-- Optimizes queries checking identical step counts for the same staff member over time.
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_step_records_staff_steps_date 
ON public.step_records (staff_id, steps, date);


-- ------------------------------------------------------------------------------
-- STEP 5: Create Date Index for Fast Admin Monitoring & Filtering
-- Optimizes queries fetching records for a specific day or date range.
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_step_records_date 
ON public.step_records (date DESC);
