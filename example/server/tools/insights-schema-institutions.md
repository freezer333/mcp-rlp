# institutions

Higher education institutions with current characteristics and contact information.

## Schema

```sql
CREATE TABLE institutions (
    unitid INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,

    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    web_address TEXT,

    type_code INTEGER,
    type_name TEXT,
    size_code INTEGER,
    size_name TEXT,
    region_code INTEGER,
    region_name TEXT,

    president_name TEXT,
    president_title TEXT,

    admin_url TEXT,
    financial_aid_url TEXT,
    application_url TEXT,
    veterans_url TEXT,

    first_year INTEGER,
    last_year INTEGER,
    is_current BOOLEAN
);
```

## Columns

### Identification
- **unitid** - IPEDS unique identifier for the institution
- **name** - Official institution name
- **slug** - URL-friendly identifier (lowercase, hyphenated)

### Contact
- **address** - Street address
- **city** - City name
- **state** - Two-letter state code
- **zip** - ZIP code
- **web_address** - Institution website URL

### Classification
- **type_code** - Carnegie classification code for institution type/mission
- **type_name** - Human-readable Carnegie classification (e.g., "Research University")
- **size_code** - Enrollment size category code
- **size_name** - Human-readable size (e.g., "Medium (1,000-4,999)")
- **region_code** - Geographic region code (CSA-based)
- **region_name** - Geographic region name

### Leadership
- **president_name** - Name of institution president/chancellor
- **president_title** - Official title (e.g., "President", "Chancellor")

### URLs
- **admin_url** - Admissions office URL
- **financial_aid_url** - Financial aid office URL
- **application_url** - Online application URL
- **veterans_url** - Veterans services URL

### Data Availability
- **first_year** - Earliest year with IPEDS data for this institution
- **last_year** - Most recent year with IPEDS data for this institution
- **is_current** - TRUE if institution reported data in the most recent year (2024)

## Indexes
- idx_inst_search (name)
- idx_inst_slug (slug)
- idx_inst_filters (type_code, size_code, region_code, is_current)
- idx_inst_current (is_current)

## Usage Notes
- Filter by `is_current = 1` to show only active institutions
- Use `type_code`, `size_code`, and `region_code` together to find similar institutions
- `first_year` and `last_year` indicate data availability range, not founding/closing dates
