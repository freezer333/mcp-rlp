# institution_details

Extended institutional characteristics stored as hierarchical key-value pairs (1M+ rows).

## Schema

```sql
CREATE TABLE institution_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unitid INTEGER NOT NULL,

    section TEXT NOT NULL,
    subsection TEXT,

    property_name TEXT NOT NULL,
    property_label TEXT NOT NULL,
    property_description TEXT,

    value_text TEXT NOT NULL,
    value_code TEXT,

    FOREIGN KEY (unitid) REFERENCES institutions(unitid)
);
```

## Columns

### Keys
- **id** - Auto-incrementing surrogate key
- **unitid** - Institution identifier (references institutions.unitid)

### Hierarchy
- **section** - Top-level category (e.g., "Admissions", "Enrollment", "Financials")
- **subsection** - Subcategory within section (e.g., "Test Scores", "Demographics"), NULL for section-level properties

### Property Details
- **property_name** - Internal IPEDS variable name (e.g., "SATMT75", "TUFEYR3")
- **property_label** - Human-readable property name (e.g., "SAT Math 75th percentile", "Tuition and fees")
- **property_description** - Detailed explanation of the property (may be NULL)

### Value
- **value_text** - The property value as text (always populated)
- **value_code** - Optional code representation for categorical values (e.g., "Y"/"N", numeric codes)

## Indexes
- idx_details_lookup (unitid, section, subsection)
- idx_details_search (property_label, value_text)

## Usage Notes
- Contains extended IPEDS characteristics not in the main institutions table
- One row per institution × property combination (only non-NULL values stored)
- Use `section` and `subsection` to browse categories hierarchically
- Join to `institutions` table for basic institution info
- Filter by `unitid` to get all characteristics for a specific institution
- Search across `property_label` or `value_text` for specific data points

## Example Query
```sql
-- Find SAT scores for a specific institution
SELECT property_label, value_text
FROM institution_details
WHERE unitid = 110635
  AND section = 'Admissions'
  AND property_label LIKE '%SAT%'
ORDER BY property_label;
```
