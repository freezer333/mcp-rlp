# degrees_awarded

Time-series data of degrees awarded by institution × program × year × level (2005-2024).

## Schema

```sql
CREATE TABLE degrees_awarded (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    unitid INTEGER NOT NULL,
    institution_name TEXT NOT NULL,
    institution_slug TEXT NOT NULL,
    cip_code TEXT NOT NULL,
    program_name TEXT NOT NULL,
    year INTEGER NOT NULL,

    level_code INTEGER NOT NULL,
    level_name TEXT NOT NULL,
    level_short TEXT NOT NULL,

    degrees_awarded INTEGER NOT NULL,

    growth_5yr_pct REAL,
    year_minus_4 INTEGER,
    year_minus_3 INTEGER,
    year_minus_2 INTEGER,
    year_minus_1 INTEGER,
    year_current INTEGER,

    FOREIGN KEY (unitid) REFERENCES institutions(unitid),
    FOREIGN KEY (cip_code) REFERENCES programs(cip_code),
    UNIQUE(unitid, cip_code, year, level_code)
);
```

## Columns

### Keys
- **id** - Auto-incrementing surrogate key
- **unitid** - Institution identifier (references institutions.unitid)
- **institution_name** - Institution name (denormalized for convenience)
- **institution_slug** - Institution slug (denormalized for convenience)
- **cip_code** - Program code (references programs.cip_code)
- **program_name** - Program name (denormalized for convenience)
- **year** - Academic year (e.g., 2024 for 2023-2024 academic year)

### Degree Level (Denormalized)
- **level_code** - Numeric code for degree level
- **level_name** - Full degree level name (e.g., "Bachelor's degree")
- **level_short** - Short name (e.g., "Bachelor's")

Common level codes:
- `1` - Certificates of less than 1 year
- `2` - Certificates of at least 1 but less than 2 years
- `3` - Associate's degree
- `5` - Bachelor's degree
- `7` - Master's degree
- `17` - Doctor's degree - research/scholarship
- `18` - Doctor's degree - professional practice
- `19` - Doctor's degree - other

### Data
- **degrees_awarded** - Number of degrees granted in this year

### 5-Year Growth Metrics
- **growth_5yr_pct** - Percentage change over 5 years (e.g., 0.15 = 15% growth), NULL if <5 years of data
- **year_minus_4** - Degrees awarded 4 years prior (oldest in 5-year window)
- **year_minus_3** - Degrees awarded 3 years prior
- **year_minus_2** - Degrees awarded 2 years prior
- **year_minus_1** - Degrees awarded 1 year prior
- **year_current** - Degrees awarded in current year (same as degrees_awarded)

## Indexes
- idx_deg_inst (unitid, year)
- idx_deg_prog (cip_code, level_code, year)
- idx_deg_growth (growth_5yr_pct) - partial index where NOT NULL
- idx_deg_year (year)

## Usage Notes
- One row per institution × program × year × degree level combination
- Not all combinations exist (institutions don't offer all programs)
- Growth metrics are NULL for the first 4 years of any program/institution combination
- Filter by recent years (e.g., `year >= 2020`) for current trends
- Join to `institutions` and `programs` for additional details (or use denormalized fields)
