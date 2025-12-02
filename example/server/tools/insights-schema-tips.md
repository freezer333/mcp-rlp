# Insights Database Schema

## Overview
IPEDS higher education data (2005-2024) with thousands of institutions, academic programs, and millions of degree records.

## Table Relationships
```
institutions
    ↓ unitid
degrees_awarded ← institution × program × year × level
    ↓ cip_code
programs ← CIP taxonomy: family → group → program
    ↓ cip_code
program_occupations ← links to careers
    ↓ bls_code
occupations ← BLS career data
```

## Tables

### `institutions`
One row per institution with current characteristics.

**Key Fields:**
- `unitid`, `name`, `slug`
- `type_code`, `type_name` - Carnegie classification
- `size_code`, `size_name` - Enrollment size
- `region_code`, `region_name` - Geographic CSA
- `is_current` - TRUE if reporting in most recent year
- `first_year`, `last_year` - Data availability range
- Contact: `address`, `city`, `state`, `zip`, `web_address`
- Leadership: `president_name`, `president_title`

**Find similar institutions:** Filter by `type_code`, `size_code`, `region_code`

### `programs`
CIP code taxonomy with three levels: family (2-digit) → group (4-digit) → program (6-digit).

**Key Fields:**
- `cip_code`, `program_name`, `program_description`
- `cip_type` - "family", "group", or "program"
- `family_code`, `family_name` - Parent family
- `group_code`, `group_name` - Parent group

**Example:** "13" (Education) → "13.13" (Teacher Education) → "13.1301" (Agricultural Teacher Education)

### `degrees_awarded`
Time-series data: one row per institution × program × year × degree level.

**Key Fields:**
- `unitid`, `institution_name`, `institution_slug`, `cip_code`, `program_name`, `year`
- `level_code`, `level_name` - Degree type (3=Associate's, 5=Bachelor's, 7=Master's, 17=Doctoral)
- `degrees_awarded` - Count of degrees granted
- `growth_5yr_pct` - 5-year growth rate (0.15 = 15% growth)
- `year_minus_4` through `year_current` - Degree counts across 5-year span

### `occupations`
BLS career data with links to detailed occupation pages.

**Key Fields:** `bls_code`, `occupation_title`, `bls_url`

### `program_occupations`
Links CIP codes to related BLS occupations.

**Key Fields:** `cip_code`, `bls_code`, `occupation_title`, `bls_url`

### `institution_details`
Extended IPEDS characteristics organized hierarchically.

**Key Fields:**
- `unitid`, `section`, `subsection`
- `property_name`, `property_label`, `property_description`
- `value_text` - Human-readable value

## Common Queries

**Similar institutions:**
```sql
SELECT name, type_name, size_name, region_name
FROM institutions
WHERE type_code = ? AND size_code = ? AND region_code = ?
  AND is_current = 1 AND unitid != ?
```

**Institution's top programs:**
```sql
SELECT program_name, degrees_awarded, growth_5yr_pct
FROM degrees_awarded
WHERE unitid = ? AND year = 2024 AND level_code = 5
ORDER BY degrees_awarded DESC
```

**Program trends nationwide:**
```sql
SELECT program_name, COUNT(DISTINCT unitid) as institutions,
       SUM(degrees_awarded) as total, AVG(growth_5yr_pct) as avg_growth
FROM degrees_awarded
WHERE year = 2024 AND level_code = 5
GROUP BY cip_code, program_name
ORDER BY total DESC
```

**Institutions offering a program:**
```sql
SELECT i.name, d.degrees_awarded, d.growth_5yr_pct
FROM degrees_awarded d
JOIN institutions i ON d.unitid = i.unitid
WHERE d.cip_code = ? AND d.year = 2024 AND i.is_current = 1
ORDER BY d.degrees_awarded DESC
```

**Careers for a program:**
```sql
SELECT occupation_title, bls_url
FROM program_occupations
WHERE cip_code = ?
```

## Notes

- **Current data:** Filter by `is_current = 1` for active institutions
- **Time-series:** `degrees_awarded` contains multi-year history (2005-2024)
- **Similarity axes:** Use `type_code`, `size_code`, `region_code` together to find peer institutions
- **CIP levels:** Filter by `cip_type` - "program" for specifics, "family"/"group" for aggregates

## Query Best Practices

**IMPORTANT: Always minimize data returned**
- Select only the specific columns you need - never use `SELECT *`
- Use LIMIT clauses to restrict row counts when appropriate
- Filter data as much as possible in WHERE clauses before retrieving
- Aggregate data (COUNT, SUM, AVG) when individual rows aren't needed
- This database is large (2.5GB) - efficient queries are essential for performance
